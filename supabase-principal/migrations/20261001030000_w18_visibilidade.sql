-- Physiq W18 — Perfil do aluno › Prontuário (banco principal, staging e public; spec §11.3 W18, §4.1 "Quem vê e edita o quê"
-- linha Prontuário, §4.5, §8.1 registros_prontuario, P3, P4, N-29 a N-33, N-36, N-43, N-44, N-46, N-47). Idempotente; NENHUM
-- dado muda: só funções e políticas.
--
-- Aplicar (backup ANTES — scripts/backup/; o bloco compartilhado monta as políticas do Storage com as funções que já existem,
-- então dá para ir staging → produção em 2 passos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001030000_w18_visibilidade.sql --so staging
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001030000_w18_visibilidade.sql --compartilhado
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001030000_w18_visibilidade.sql --so public
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001030000_w18_visibilidade.sql --compartilhado
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O que muda (e o que NÃO muda para o site antigo do Nutri, que lê e grava as mesmas tabelas até a W28):
--   1. pode_ver_clinico(aluno): quem vê o que é CLÍNICO do aluno — as 9 seções do prontuário (consultas, anamnese, questionários,
--      exames, avaliação 360, gestacional, fármaco-nutrientes, documentos, anexos) e as anotações "Só nutricionistas": o master,
--      a nutricionista dona do paciente sem conta (site antigo) e, na conta, quem vê o aluno E é nutricionista da conta (com o
--      módulo) — a nutricionista responsável e o dono com papel de nutricionista. É a regra das anotações "Só nutricionistas" da
--      W2 (pode_ver_aluno + sou_nutri_do_aluno). O personal e o dono sem papel de nutricionista ficam de fora (spec 4.1, P3).
--   2. Nutricionista REMOVIDA da equipe (W5) deixa de ler (e de mexer n)o que ela registrou: as políticas antigas do Nutri
--      ("ler as proprias": nutricionista_id = auth.uid()) continuam, mas agora somam com uma RESTRITIVA de leitura em cada tabela
--      (só passa quem ainda vê o clínico do aluno). Quem continua na equipe não perde nada: a nutri responsável e o dono-nutri
--      sempre passam — no site antigo também.
--   3. A nutricionista com acesso ao aluno LÊ o que outra nutri da conta registrou (a nova responsável lê o histórico da
--      anterior), e quem muda a nutrição do aluno (a nutricionista responsável e o dono-nutri — as restritivas da W3 continuam)
--      edita e exclui (soft, Lixeira) também o que outra nutri registrou — o mesmo da W16/W17 na dieta e na avaliação.
--   4. Anotações (registros_prontuario, P4): restritiva de leitura = a regra da W2 (Equipe: quem vê o aluno; Só nutricionistas:
--      quem vê o clínico), sem o "ler os proprios" valer para quem saiu da equipe; restritiva de escrita: quem escreve vê o aluno,
--      "Só nutricionistas" só quem vê o clínico, e o papel gravado (autor_papel) é um papel que a pessoa tem (o personal não assina
--      como nutricionista nem grava "Só nutricionistas"). Editar e excluir continuam só do autor (e do master). As que já existem
--      ficam "Só nutricionistas" (padrão da coluna desde a W2) e o site antigo continua gravando assim.
--   5. anexos (tabela): + restritivas de escrita iguais às da W3 nas outras tabelas clínicas (o personal gravava anexo próprio pelo
--      "criar os proprios"). A "anexos: dono da conta" (W2) deixa de valer para o dono sem papel de nutricionista (item 2).
--   6. aluno_anotacoes(aluno, limite): a linha do tempo das anotações que quem chama vê (o card Prontuário do Resumo e a aba), com
--      o nome, a foto e o papel de quem escreveu (o personal não lê o perfil da nutri pela RLS de profiles). Mesma regra da RLS.
--   7. Storage "anexos" (bloco compartilhado; o bucket é um só para os 2 schemas): quem vê o clínico do aluno lê (assina a URL) o
--      arquivo dos anexos dele, mesmo os que outra nutri subiu; quem muda a nutrição do aluno apaga o arquivo; restritivas: subir
--      só na própria pasta e na de um aluno cuja nutrição a pessoa muda; ler, trocar e apagar arquivo de anexo só quem vê o
--      clínico do aluno do anexo (a removida perde os arquivos que subiu). Arquivo sem linha na tabela (envio no meio) continua
--      do autor, pela pasta. Schema que ainda não recebeu a W18 (a janela entre staging e produção) segue a regra de antes.

-- ============================================================================================================
-- 1. Quem vê o clínico do aluno
-- ============================================================================================================
create or replace function {schema}.pode_ver_clinico(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or ({schema}.pode_ver_aluno(p_paciente) and {schema}.sou_nutri_do_aluno(p_paciente));
$$;
revoke execute on function {schema}.pode_ver_clinico(uuid) from public, anon;
grant execute on function {schema}.pode_ver_clinico(uuid) to authenticated, service_role;

-- a anotação pode ser gravada assim por quem chama (a restritiva de escrita das anotações usa)
create or replace function {schema}.anotacao_valida(p_paciente uuid, p_visibilidade text, p_papel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or (
    {schema}.pode_ver_aluno(p_paciente)
    and (p_visibilidade = 'equipe' or (p_visibilidade = 'nutricionistas' and {schema}.pode_ver_clinico(p_paciente)))
    and case p_papel
          when 'nutricionista' then {schema}.pode_ver_clinico(p_paciente)
          when 'personal' then exists (select 1 from {schema}.pacientes p
                                        where p.id = p_paciente and p.conta_id is not null and {schema}.tenho_papel(p.conta_id, 'personal'))
          when 'dono' then exists (select 1 from {schema}.pacientes p
                                    where p.id = p_paciente and p.conta_id is not null and {schema}.sou_dono(p.conta_id))
          else false end);
$$;
revoke execute on function {schema}.anotacao_valida(uuid, text, text) from public, anon;
grant execute on function {schema}.anotacao_valida(uuid, text, text) to authenticated, service_role;

-- ============================================================================================================
-- 2 + 3 + 5. Políticas das tabelas clínicas do prontuário
-- ============================================================================================================
do $w18$
declare
  t text;
  clinicas text[] := array['consultas', 'anamneses', 'respostas_questionario', 'pedidos_exame', 'resultados_exame',
                           'avaliacoes_integradas', 'gestacoes', 'registros_gestacionais', 'analises_farmaco',
                           'medicamentos_paciente', 'documentos', 'anexos'];
  escrita text := '({schema}.eh_master() or ({schema}.escrevo_nutricao() and {schema}.pode_editar_aluno(paciente_id, ''nutricao'')))';
  edicao text := '{schema}.pode_editar_aluno(paciente_id, ''nutricao'')';
begin
  foreach t in array clinicas || array['registros_prontuario'] loop
    if to_regclass(format('{schema}.%I', t)) is null then
      raise exception 'W18: tabela {schema}.% não existe', t;
    end if;
  end loop;

  foreach t in array clinicas loop
    -- 2. leitura só de quem vê o clínico do aluno (restritiva: soma com as políticas de hoje)
    execute format('drop policy if exists %I on {schema}.%I', t || ': W18 leitura so quem ve o clinico', t);
    execute format('create policy %I on {schema}.%I as restrictive for select to authenticated using ({schema}.pode_ver_clinico(paciente_id))',
                   t || ': W18 leitura so quem ve o clinico', t);
    -- 3. a nutricionista com acesso ao aluno lê o que outra nutri da conta registrou
    execute format('drop policy if exists %I on {schema}.%I', t || ': W18 ver pela conta (clinico)', t);
    execute format('create policy %I on {schema}.%I for select to authenticated using ({schema}.pode_ver_clinico(paciente_id))',
                   t || ': W18 ver pela conta (clinico)', t);
    -- 3. quem muda a nutrição do aluno edita e exclui o que outra nutri da conta registrou
    execute format('drop policy if exists %I on {schema}.%I', t || ': W18 editar pela conta (nutricao)', t);
    execute format('create policy %I on {schema}.%I for update to authenticated using (%s) with check (%s)',
                   t || ': W18 editar pela conta (nutricao)', t, edicao, edicao);
    execute format('drop policy if exists %I on {schema}.%I', t || ': W18 apagar pela conta (nutricao)', t);
    execute format('create policy %I on {schema}.%I for delete to authenticated using (%s)',
                   t || ': W18 apagar pela conta (nutricao)', t, edicao);
  end loop;

  -- 5. anexos: a escrita restritiva que a W3 pôs nas outras tabelas clínicas
  execute 'drop policy if exists "anexos: W18 escrita so nutricionista (insert)" on {schema}.anexos';
  execute 'drop policy if exists "anexos: W18 escrita so nutricionista (update)" on {schema}.anexos';
  execute 'drop policy if exists "anexos: W18 escrita so nutricionista (delete)" on {schema}.anexos';
  execute format('create policy "anexos: W18 escrita so nutricionista (insert)" on {schema}.anexos as restrictive for insert to authenticated with check %s', escrita);
  execute format('create policy "anexos: W18 escrita so nutricionista (update)" on {schema}.anexos as restrictive for update to authenticated using %s with check %s', escrita, escrita);
  execute format('create policy "anexos: W18 escrita so nutricionista (delete)" on {schema}.anexos as restrictive for delete to authenticated using %s', escrita);
end;
$w18$;

-- ============================================================================================================
-- 4. Anotações da equipe (registros_prontuario) — visibilidade "Equipe" | "Só nutricionistas" (P4)
-- ============================================================================================================
drop policy if exists "registros_prontuario: W18 leitura pela visibilidade" on {schema}.registros_prontuario;
create policy "registros_prontuario: W18 leitura pela visibilidade" on {schema}.registros_prontuario
  as restrictive for select to authenticated
  using ({schema}.eh_master() or ({schema}.pode_ver_aluno(paciente_id)
         and (visibilidade = 'equipe' or {schema}.pode_ver_clinico(paciente_id))));
drop policy if exists "registros_prontuario: W18 escrita coerente (insert)" on {schema}.registros_prontuario;
create policy "registros_prontuario: W18 escrita coerente (insert)" on {schema}.registros_prontuario
  as restrictive for insert to authenticated
  with check ({schema}.anotacao_valida(paciente_id, visibilidade, autor_papel));
drop policy if exists "registros_prontuario: W18 escrita coerente (update)" on {schema}.registros_prontuario;
create policy "registros_prontuario: W18 escrita coerente (update)" on {schema}.registros_prontuario
  as restrictive for update to authenticated
  using ({schema}.eh_master() or {schema}.pode_ver_aluno(paciente_id))
  with check ({schema}.anotacao_valida(paciente_id, visibilidade, autor_papel));
drop policy if exists "registros_prontuario: W18 apagar so quem ve o aluno" on {schema}.registros_prontuario;
create policy "registros_prontuario: W18 apagar so quem ve o aluno" on {schema}.registros_prontuario
  as restrictive for delete to authenticated
  using ({schema}.eh_master() or {schema}.pode_ver_aluno(paciente_id));

-- ============================================================================================================
-- 6. A linha do tempo das anotações (card Prontuário do Resumo e aba Prontuário)
--    Erros (raise) da w14_matricula_da_rota: sem_login, sem_acesso, aluno_inexistente.
--    Retorno: {ok, paciente_id, total, clinico, anotacoes: [{id, data, texto, visibilidade, autor_papel, autor_id, autor_nome,
--    autor_foto, minha, created_at, updated_at}]} — mais recente primeiro; p_limite = só as últimas N.
-- ============================================================================================================
create or replace function {schema}.aluno_anotacoes(p_aluno uuid, p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_ve boolean := {schema}.eh_master() or {schema}.pode_ver_aluno(v_id);
  v_clinico boolean := {schema}.pode_ver_clinico(v_id);
  v_total integer := 0;
  v_lista jsonb := '[]'::jsonb;
begin
  if v_ve then
    select count(*) into v_total from {schema}.registros_prontuario r
     where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico);
    select coalesce(jsonb_agg(x.j order by x.data desc, x.criado desc), '[]'::jsonb) into v_lista
      from (
        select r.data, r.created_at as criado,
               jsonb_build_object(
                 'id', r.id,
                 'data', r.data,
                 'texto', r.texto,
                 'visibilidade', r.visibilidade,
                 'autor_papel', r.autor_papel,
                 'autor_id', r.nutricionista_id,
                 'autor_nome', {schema}.nome_da_pessoa(r.nutricionista_id),
                 'autor_foto', (select coalesce(nullif(btrim(pr.dados_profissionais ->> 'foto_url'), ''),
                                               u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
                                  from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = r.nutricionista_id),
                 'minha', r.nutricionista_id = auth.uid(),
                 'created_at', r.created_at,
                 'updated_at', r.updated_at) as j
          from {schema}.registros_prontuario r
         where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico)
         order by r.data desc, r.created_at desc
         limit case when p_limite is null or p_limite < 1 then null else least(p_limite, 500) end
      ) x;
  end if;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'total', v_total, 'clinico', v_clinico, 'anotacoes', v_lista);
end;
$$;
revoke execute on function {schema}.aluno_anotacoes(uuid, integer) from public, anon;
grant execute on function {schema}.aluno_anotacoes(uuid, integer) to authenticated, service_role;

-- ============================================================================================================
-- 7. Funções do Storage "anexos" (as políticas são montadas no bloco compartilhado)
-- ============================================================================================================
-- o arquivo é de um anexo (vivo ou na Lixeira) de um aluno cujo clínico quem chama vê
create or replace function {schema}.pode_ler_anexo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from {schema}.anexos a where a.path = p_path and {schema}.pode_ver_clinico(a.paciente_id));
$$;
revoke execute on function {schema}.pode_ler_anexo(text) from public, anon;
grant execute on function {schema}.pode_ler_anexo(text) to authenticated, service_role;

-- quem muda a nutrição do aluno do anexo apaga o arquivo (o de outra nutri da conta também)
create or replace function {schema}.pode_apagar_anexo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from {schema}.anexos a where a.path = p_path and {schema}.pode_editar_aluno(a.paciente_id, 'nutricao'));
$$;
revoke execute on function {schema}.pode_apagar_anexo(text) from public, anon;
grant execute on function {schema}.pode_apagar_anexo(text) to authenticated, service_role;

-- subir arquivo: <autor>/<aluno>/<arquivo>, o autor é quem chama e muda a nutrição do aluno (a regra da W3 na tabela)
create or replace function {schema}.pode_subir_anexo(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  partes text[] := storage.foldername(p_path);
  v_autor uuid;
  v_paciente uuid;
begin
  if auth.uid() is null or p_path is null or coalesce(array_length(partes, 1), 0) < 2 then
    return false;
  end if;
  begin
    v_autor := partes[1]::uuid;
    v_paciente := partes[2]::uuid;
  exception when others then
    return false;
  end;
  return v_autor = auth.uid()
     and exists (select 1 from {schema}.pacientes p where p.id = v_paciente)
     and {schema}.escrevo_nutricao() and {schema}.pode_editar_aluno(v_paciente, 'nutricao');
end;
$$;
revoke execute on function {schema}.pode_subir_anexo(text) from public, anon;
grant execute on function {schema}.pode_subir_anexo(text) to authenticated, service_role;

-- @@ compartilhado
-- Storage (o bucket "anexos" é um só para os 2 schemas). anexo_permitido(acao, caminho) decide pelo schema onde o anexo (ou, para
-- subir, o aluno da pasta) mora, com a função daquele schema; se o schema ainda não recebeu a W18 (a janela entre o staging e a
-- produção), vale a regra de antes para ele (a própria pasta) — assim o site antigo não para de subir anexo em produção enquanto
-- o staging é testado. Arquivo sem linha em nenhum schema (envio no meio) é do autor, pela pasta. O master passa sempre.
create or replace function public.anexo_permitido(p_acao text, p_path text) returns boolean
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
  if p_acao = 'subir' then
    begin
      v_pac := ((storage.foldername(p_path))[2])::uuid;
    exception when others then
      return false;
    end;
    if v_pac is null then
      return false;
    end if;
    foreach v_sch in array array['staging', 'public'] loop
      execute format('select exists (select 1 from %I.pacientes p where p.id = $1)', v_sch) into v_r using v_pac;
      if v_r then
        if to_regprocedure(v_sch || '.pode_subir_anexo(text)') is null then
          if v_minha then return true; end if;
        else
          execute format('select %I.pode_subir_anexo($1)', v_sch) into v_r using p_path;
          if v_r then return true; end if;
        end if;
      end if;
    end loop;
    return false;
  end if;
  v_fn := case when p_acao = 'apagar' then 'pode_apagar_anexo' else 'pode_ler_anexo' end;
  foreach v_sch in array array['staging', 'public'] loop
    execute format('select exists (select 1 from %I.anexos a where a.path = $1)', v_sch) into v_r using p_path;
    if v_r then
      v_achou := true;
      if to_regprocedure(v_sch || '.' || v_fn || '(text)') is null then
        if v_minha then return true; end if;
      else
        execute format('select %I.%I($1)', v_sch, v_fn) into v_r using p_path;
        if v_r then return true; end if;
      end if;
    end if;
  end loop;
  return not v_achou and v_minha;
end;
$$;
revoke execute on function public.anexo_permitido(text, text) from public, anon;
grant execute on function public.anexo_permitido(text, text) to authenticated, service_role;

-- permissivas novas (somam às "anexos: ... os proprios ou master" de hoje, pela pasta)
drop policy if exists "anexos: W18 quem ve o clinico le" on storage.objects;
create policy "anexos: W18 quem ve o clinico le" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.anexo_permitido('ler', name));
drop policy if exists "anexos: W18 quem muda a nutricao apaga" on storage.objects;
create policy "anexos: W18 quem muda a nutricao apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.anexo_permitido('apagar', name));

-- restritivas (só o bucket "anexos"; os outros buckets passam direto)
drop policy if exists "anexos: W18 subir so na pasta de aluno que a pessoa atende" on storage.objects;
create policy "anexos: W18 subir so na pasta de aluno que a pessoa atende" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'anexos' or public.anexo_permitido('subir', name));
drop policy if exists "anexos: W18 ler so quem ve o clinico" on storage.objects;
create policy "anexos: W18 ler so quem ve o clinico" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'anexos' or public.anexo_permitido('ler', name));
drop policy if exists "anexos: W18 trocar so quem ve o clinico" on storage.objects;
create policy "anexos: W18 trocar so quem ve o clinico" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'anexos' or public.anexo_permitido('ler', name))
  with check (bucket_id <> 'anexos' or public.anexo_permitido('ler', name));
drop policy if exists "anexos: W18 apagar so quem muda a nutricao" on storage.objects;
create policy "anexos: W18 apagar so quem muda a nutricao" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'anexos' or public.anexo_permitido('apagar', name));
