-- Physiq W24 — Painel › Dietas (banco principal, staging e public; spec §11.3 W24, §4.4 linha "Dietas", §5 N-7/N-16/N-17/N-18/N-56,
-- §8.1 avisos ("W24 reação no diário") e a linha "Nutrição", §9 "Aluno com ajuste diário desligado abre /d/"). Idempotente; NENHUM
-- dado muda: só funções, políticas e 1 gatilho. Alimentos e receitas NÃO mudam de regra (TACO de todos e só leitura; o próprio é da
-- nutri que criou — a mesma regra que a busca do editor da W16 já usa).
--
-- Aplicar (backup ANTES — definições das políticas e funções que mudam; o bloco compartilhado monta as políticas do Storage com
-- as funções que já existem em cada schema, então dá para ir staging → produção em 2 passos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001190000_w24_dietas.sql --so staging
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001190000_w24_dietas.sql --compartilhado
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001190000_w24_dietas.sql --so public
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001190000_w24_dietas.sql --compartilhado
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O que muda (o site antigo do Nutri lê e grava as mesmas tabelas até a W28 e continua igual para quem segue na equipe):
--   1. diario_link(código): o /d/<código> do Physiq diz a SITUAÇÃO do link sem expor dado de ninguém — 'ok' (com o primeiro nome do
--      aluno e as pastas do envio, como a diario_paciente de hoje), 'diario_desligado' (ajuste "diário alimentar" desligado — spec
--      §9: "O envio de fotos está desligado pelo seu profissional"), 'link_desligado' (ajuste "envio de fotos pelo link" desligado —
--      o app continua), 'sem_nutricionista' (aluno sem nutri responsável) ou 'invalido' (código inexistente, aluno inativo ou
--      excluído). O envio continua pelas MESMAS funções de hoje (diario_enviar / diario_listar + bucket "diario").
--   2. Diário (diario_alimentar) pela regra clínica da W18 (pode_ver_clinico): lê quem é nutricionista da conta e vê o aluno — a
--      nutri responsável e o dono com papel de nutricionista (P1: o dono-nutri vê os alunos da conta; a nutri membro, só os dela);
--      personal e dono sem papel de nutri não leem; a nutricionista REMOVIDA da equipe deixa de ler o que recebeu (restritiva de
--      leitura somada às políticas de hoje); o próprio aluno continua lendo o dele. Reagir (e excluir, soft) = quem muda a nutrição
--      do aluno (pode_editar_aluno 'nutricao' — a restritiva de escrita da W3 continua).
--   3. Aviso da reação (§8.1 avisos, NF9): reagir/comentar uma foto cria 1 aviso 'reacao_diario' no sino do aluno com login (e, com
--      a W20c, o push); mudar a reação da MESMA foto de novo em até 10 min não repete (a regra do sino da W16/W17). Vale para a reação
--      feita no site antigo também (mesma tabela). O aviso nunca impede a reação.
--   4. Storage "diario" (bloco compartilhado; o bucket é um só para os 2 schemas): quem vê o clínico do aluno lê (assina a URL) a foto,
--      mesmo a que chegou para outra nutri da conta; quem muda a nutrição do aluno apaga a foto; restritivas: ler e apagar foto do
--      diário só quem vê o clínico / muda a nutrição do aluno dela (a removida perde as fotos); o aluno continua lendo as dele (P29).
--      Arquivo sem linha em nenhum schema (envio no meio) é do dono da pasta (a nutri) ou do aluno da pasta. Subir não muda (a
--      política de hoje, diario_pasta_valida, vale para o anônimo do link e para o aluno do app). Schema que ainda não recebeu a W24
--      (a janela entre o staging e a produção) segue a regra de antes para ele.

-- ============================================================================================================
-- 1. Situação do link público /d/<código>
-- ============================================================================================================
create or replace function {schema}.diario_link(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_p record;
begin
  if v_codigo = '' or char_length(v_codigo) > 40 or v_codigo !~ '^[a-z0-9]+$' then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  select p.id, p.nutricionista_id, p.nome, p.apelido, p.ativo, p.config
    into v_p
    from {schema}.pacientes p
   where p.link_codigo = v_codigo and p.deleted_at is null
   order by p.ativo desc
   limit 1;
  if not found or not v_p.ativo then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  if not {schema}.w14_ajuste(v_p.config, 'diario_alimentar', true) then
    return jsonb_build_object('situacao', 'diario_desligado');
  end if;
  if not {schema}.w14_ajuste(v_p.config, 'acesso_link', true) then
    return jsonb_build_object('situacao', 'link_desligado');
  end if;
  if v_p.nutricionista_id is null then
    return jsonb_build_object('situacao', 'sem_nutricionista');
  end if;
  return jsonb_build_object(
    'situacao', 'ok',
    'paciente_id', v_p.id,
    'nutricionista_id', v_p.nutricionista_id,
    'nome', coalesce(nullif(btrim(v_p.apelido), ''), split_part(btrim(v_p.nome), ' ', 1))
  );
end;
$$;
revoke execute on function {schema}.diario_link(text) from public;
grant execute on function {schema}.diario_link(text) to anon, authenticated, service_role;

-- ============================================================================================================
-- 2. Políticas do diário (regra clínica da W18)
-- ============================================================================================================
drop policy if exists "diario_alimentar: W24 leitura so quem ve o clinico" on {schema}.diario_alimentar;
create policy "diario_alimentar: W24 leitura so quem ve o clinico" on {schema}.diario_alimentar
  as restrictive for select to authenticated
  using ({schema}.pode_ver_clinico(paciente_id) or {schema}.paciente_do_meu_login(paciente_id));

drop policy if exists "diario_alimentar: W24 ver pela conta (clinico)" on {schema}.diario_alimentar;
create policy "diario_alimentar: W24 ver pela conta (clinico)" on {schema}.diario_alimentar
  for select to authenticated
  using ({schema}.pode_ver_clinico(paciente_id));

drop policy if exists "diario_alimentar: W24 reagir pela conta (nutricao)" on {schema}.diario_alimentar;
create policy "diario_alimentar: W24 reagir pela conta (nutricao)" on {schema}.diario_alimentar
  for update to authenticated
  using ({schema}.pode_editar_aluno(paciente_id, 'nutricao'))
  with check ({schema}.pode_editar_aluno(paciente_id, 'nutricao'));

-- ============================================================================================================
-- 3. Aviso da reação no sino do aluno (1 por reação; a mesma foto em até 10 min não repete)
-- ============================================================================================================
create or replace function {schema}.diario_avisar_reacao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_quem text;
  v_refeicao text;
  v_reacao text;
  v_titulo text;
  v_link text;
begin
  if new.reacao_nutri is null or new.deleted_at is not null then
    return null;
  end if;
  if new.reacao_nutri is not distinct from old.reacao_nutri and coalesce(new.comentario_nutri, '') = coalesce(old.comentario_nutri, '') then
    return null;
  end if;
  select p.user_id into v_user from {schema}.pacientes p where p.id = new.paciente_id and p.deleted_at is null;
  if v_user is null then
    return null;
  end if;
  v_link := '/dieta?ver=diario&registro=' || new.id::text;
  if exists (select 1 from {schema}.avisos a
              where a.destino_user_id = v_user and a.tipo = 'reacao_diario' and a.link = v_link and a.lido_em is null
                and a.criado_em > now() - interval '10 minutes') then
    return null;
  end if;
  v_quem := nullif(split_part(btrim(coalesce({schema}.nome_da_pessoa(coalesce(auth.uid(), new.nutricionista_id)), '')), ' ', 1), '');
  v_refeicao := case new.refeicao
                  when 'cafe_manha' then 'do café da manhã'
                  when 'lanche_manha' then 'do lanche da manhã'
                  when 'almoco' then 'do almoço'
                  when 'lanche_tarde' then 'do lanche da tarde'
                  when 'jantar' then 'do jantar'
                  when 'ceia' then 'da ceia'
                  else 'da refeição' end;
  v_reacao := case new.reacao_nutri when 'otimo' then 'Ótimo' when 'bom' then 'Bom' when 'atencao' then 'Atenção' when 'evitar' then 'Evitar' else '' end;
  v_titulo := coalesce(v_quem, 'Sua nutricionista') || ' reagiu à foto ' || v_refeicao || ': ' || v_reacao;
  if btrim(coalesce(new.comentario_nutri, '')) <> '' then
    v_titulo := v_titulo || ' — ' || btrim(new.comentario_nutri);
  end if;
  insert into {schema}.avisos (destino_user_id, tipo, titulo, link)
  values (v_user, 'reacao_diario', left(v_titulo, 200), v_link);
  return null;
exception when others then
  -- a reação nunca depende do aviso
  return null;
end;
$$;
revoke all on function {schema}.diario_avisar_reacao() from public, anon, authenticated;

drop trigger if exists trg_diario_avisar_reacao on {schema}.diario_alimentar;
create trigger trg_diario_avisar_reacao after update of reacao_nutri, comentario_nutri on {schema}.diario_alimentar
  for each row execute function {schema}.diario_avisar_reacao();

-- ============================================================================================================
-- 4. Funções do Storage "diario" (as políticas são montadas no bloco compartilhado)
-- ============================================================================================================
-- a foto é de um registro do diário (vivo ou na Lixeira) de um aluno cujo clínico quem chama vê, ou do próprio aluno (só a viva,
-- como a aluno_le_foto_diario de hoje)
create or replace function {schema}.diario_pode_ler_foto(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from {schema}.diario_alimentar d
     where d.path = p_path
       and ({schema}.pode_ver_clinico(d.paciente_id) or (d.deleted_at is null and {schema}.paciente_do_meu_login(d.paciente_id))));
$$;
revoke execute on function {schema}.diario_pode_ler_foto(text) from public, anon;
grant execute on function {schema}.diario_pode_ler_foto(text) to authenticated, service_role;

-- quem muda a nutrição do aluno do registro apaga a foto (a que chegou para outra nutri da conta também)
create or replace function {schema}.diario_pode_apagar_foto(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from {schema}.diario_alimentar d where d.path = p_path and {schema}.pode_editar_aluno(d.paciente_id, 'nutricao'));
$$;
revoke execute on function {schema}.diario_pode_apagar_foto(text) from public, anon;
grant execute on function {schema}.diario_pode_apagar_foto(text) to authenticated, service_role;

-- @@ compartilhado
-- Storage (o bucket "diario" é um só para os 2 schemas). diario_foto_permitida(acao, caminho) decide pelo schema onde o registro do
-- diário mora, com a função daquele schema; se o schema ainda não recebeu a W24 (a janela entre o staging e a produção), vale a regra
-- de antes para ele (a pasta da nutri). Arquivo sem registro em nenhum schema (envio no meio) é da nutri da pasta (a regra de hoje)
-- ou do aluno com login da pasta do paciente. O master passa sempre.
create or replace function public.diario_foto_permitida(p_acao text, p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sch text;
  v_fn text;
  v_r boolean;
  v_achou boolean := false;
  v_minha boolean;
  v_pac uuid;
begin
  if p_path is null or auth.uid() is null then
    return false;
  end if;
  if public.eh_master() then
    return true;
  end if;
  v_minha := coalesce((storage.foldername(p_path))[1] = auth.uid()::text, false);
  v_fn := case when p_acao = 'apagar' then 'diario_pode_apagar_foto' else 'diario_pode_ler_foto' end;
  foreach v_sch in array array['staging', 'public'] loop
    execute format('select exists (select 1 from %I.diario_alimentar d where d.path = $1)', v_sch) into v_r using p_path;
    if v_r then
      v_achou := true;
      if to_regprocedure(v_sch || '.' || v_fn || '(text)') is null then
        -- schema sem a W24: a regra de antes (a pasta da nutri; o aluno lê as fotos dele — aluno_le_foto_diario, W11)
        if v_minha then return true; end if;
        if p_acao = 'ler' and to_regprocedure(v_sch || '.aluno_le_foto_diario(text)') is not null then
          execute format('select %I.aluno_le_foto_diario($1)', v_sch) into v_r using p_path;
          if v_r then return true; end if;
        end if;
      else
        execute format('select %I.%I($1)', v_sch, v_fn) into v_r using p_path;
        if v_r then return true; end if;
      end if;
    end if;
  end loop;
  if v_achou then
    return false;
  end if;
  if v_minha then
    return true;
  end if;
  -- envio no meio pelo app: a pasta é <nutri>/<paciente>/ e o paciente é o do login de quem chama
  if p_acao = 'ler' then
    begin
      v_pac := ((storage.foldername(p_path))[2])::uuid;
    exception when others then
      return false;
    end;
    if v_pac is null then
      return false;
    end if;
    foreach v_sch in array array['staging', 'public'] loop
      execute format('select exists (select 1 from %I.pacientes p where p.id = $1 and p.user_id = $2 and p.deleted_at is null)', v_sch)
        into v_r using v_pac, auth.uid();
      if v_r then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;
revoke execute on function public.diario_foto_permitida(text, text) from public, anon;
grant execute on function public.diario_foto_permitida(text, text) to authenticated, service_role;

-- permissivas novas (somam às "diario: ... as proprias ou master" e "diario: o aluno le as proprias fotos" de hoje)
drop policy if exists "diario: W24 quem ve o clinico le" on storage.objects;
create policy "diario: W24 quem ve o clinico le" on storage.objects for select to authenticated
  using (bucket_id = 'diario' and public.diario_foto_permitida('ler', name));
drop policy if exists "diario: W24 quem muda a nutricao apaga" on storage.objects;
create policy "diario: W24 quem muda a nutricao apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and public.diario_foto_permitida('apagar', name));

-- restritivas (só o bucket "diario"; os outros buckets passam direto)
drop policy if exists "diario: W24 ler so quem ve o clinico" on storage.objects;
create policy "diario: W24 ler so quem ve o clinico" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'diario' or public.diario_foto_permitida('ler', name));
drop policy if exists "diario: W24 apagar so quem muda a nutricao" on storage.objects;
create policy "diario: W24 apagar so quem muda a nutricao" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'diario' or public.diario_foto_permitida('apagar', name));
