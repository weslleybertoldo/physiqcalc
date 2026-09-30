-- Physiq W11 — App do aluno: Dieta (tela 3; paridade N-49 a N-52 + NF3, NF4, NF5 e P29). Idempotente.
-- SÓ FUNÇÕES + 1 política de Storage (nenhuma tabela, coluna, política de tabela ou dado muda ao aplicar):
--   · minha_dieta(p_dia)             tudo o que a aba Dieta mostra, só do PRÓPRIO aluno, de TODAS as matrículas dele com Nutrição
--                                    (P7): os planos alimentares (refeições com os dias da semana — NF3 —, itens com o alimento, a
--                                    medida caseira usada e os substitutos), as orientações, as metas, os ✓ do dia p_dia
--                                    (refeições e metas), o diário dos últimos 7 dias (com o arquivo da foto, P29) e a nutricionista
--                                    de cada matrícula. Só leitura, security definer (authenticated). Login desativado pela
--                                    nutricionista (banned) não vê nada — a mesma regra do meu_paciente_id() do site antigo;
--   · aluno_marcar_meta(meta, dia, ✓) o ✓ nas metas do dia (NF4) — igual à paciente_marcar_refeicao: só a meta de uma matrícula viva
--                                    do login, ativa, que vale no dia da semana (e já começou), dia de hoje ± 1 em São Paulo;
--                                    desmarcar apaga a linha. Grava em metas_concluidas (a tabela é da W2);
--   · paciente_marcar_refeicao(...)  a MESMA função do site antigo do Nutri (mesmo nome, argumentos, erros, tabela e regra) — o
--                                    Physiq e o site antigo gravam e leem o MESMO ✓. Única diferença: a refeição pode ser do plano
--                                    de qualquer matrícula viva do login (P7), não só da 1ª que o meu_paciente_id() devolve (limit 1);
--                                    para quem tem 1 matrícula (todos em produção hoje) o resultado é idêntico;
--   · aluno_le_foto_diario(path)     true quando o arquivo do bucket privado "diario" é de um registro do diário do aluno logado
--                                    (P29: a foto do diário do dia vira a foto da refeição; a política do bloco compartilhado usa).
-- Nada dispara aviso nem WhatsApp: refeicoes_concluidas e metas_concluidas não têm gatilho; o diário só mexe em
-- pacientes.updated_at (tocar_paciente), como hoje.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py; o bloco compartilhado monta a política com as funções que já
-- existem, então dá para ir staging → produção em 2 passos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930090000_w11_metas_do_dia.sql --so staging
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930090000_w11_metas_do_dia.sql --compartilhado
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930090000_w11_metas_do_dia.sql --so public
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930090000_w11_metas_do_dia.sql --compartilhado
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)

-- ============================================================================================================
-- 1. A aba Dieta do aluno (leitura)
-- ============================================================================================================
create or replace function {schema}.minha_dieta(p_dia date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_ids uuid[];
begin
  if v_uid is null then
    return null;
  end if;
  -- as matrículas com Nutrição (a mesma regra de módulo da minha_situacao/minha_evolucao: nutricionista responsável numa conta
  -- com Nutrição, ou o site antigo sem conta); login desativado (banned) = nenhuma
  select coalesce(array_agg(p.id order by p.created_at), array[]::uuid[]) into v_ids
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    join auth.users u on u.id = p.user_id
   where p.user_id = v_uid and p.deleted_at is null and p.nutricionista_id is not null
     and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano)))
     and (u.banned_until is null or u.banned_until <= now());

  return jsonb_build_object(
    'hoje', v_hoje,
    'dia', v_dia,
    'matriculas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nome', p.nome,
               'conta_id', p.conta_id,
               'conta_nome', c.nome,
               'ativo', p.ativo,
               'link_codigo', p.link_codigo,
               'nutricionista', jsonb_build_object(
                 'id', p.nutricionista_id,
                 'nome', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                            from {schema}.profiles pr where pr.id = p.nutricionista_id),
                 'foto_url', (select coalesce(nullif(btrim(coalesce(pr.dados_profissionais ->> 'foto_url', '')), ''),
                                              un.raw_user_meta_data ->> 'avatar_url', un.raw_user_meta_data ->> 'picture')
                                from {schema}.profiles pr left join auth.users un on un.id = pr.id
                               where pr.id = p.nutricionista_id)))
             order by p.created_at)
        from {schema}.pacientes p
        left join {schema}.contas c on c.id = p.conta_id
       where p.id = any(v_ids)), '[]'::jsonb),
    'planos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pl.id,
               'paciente_id', pl.paciente_id,
               'nutricionista_id', pl.nutricionista_id,
               'titulo', pl.titulo,
               'metodo', pl.metodo,
               'kcal_alvo', pl.kcal_alvo,
               'observacao', pl.observacao,
               'favorito', pl.favorito,
               'created_at', pl.created_at,
               'updated_at', pl.updated_at,
               'refeicoes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', r.id,
                          'nome', r.nome,
                          'horario', r.horario,
                          'ordem', r.ordem,
                          'observacao', r.observacao,
                          'dias_semana', to_jsonb(r.dias_semana),
                          'itens', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', i.id,
                                     'alimento_id', i.alimento_id,
                                     'quantidade_g', i.quantidade_g,
                                     'medida_caseira_id', i.medida_caseira_id,
                                     'quantidade_medida', i.quantidade_medida,
                                     'ordem', i.ordem,
                                     'substitutos', i.substitutos,
                                     'observacao', i.observacao,
                                     'created_at', i.created_at,
                                     'alimento', (
                                       select jsonb_build_object(
                                                'id', a.id, 'nome', a.nome, 'fonte', a.fonte, 'grupo', a.grupo,
                                                'energia_kcal', a.energia_kcal, 'proteina_g', a.proteina_g,
                                                'carboidrato_g', a.carboidrato_g, 'lipidio_g', a.lipidio_g,
                                                'fibra_g', a.fibra_g, 'sodio_mg', a.sodio_mg,
                                                'medidas_caseiras', coalesce((
                                                  select jsonb_agg(jsonb_build_object('id', m.id, 'descricao', m.descricao,
                                                                                      'gramas', m.gramas, 'ordem', m.ordem))
                                                    from {schema}.medidas_caseiras m
                                                   where m.id = i.medida_caseira_id and m.alimento_id = a.id), '[]'::jsonb))
                                         from {schema}.alimentos a where a.id = i.alimento_id))
                                   order by i.ordem, i.created_at)
                              from {schema}.itens_refeicao i where i.refeicao_id = r.id), '[]'::jsonb))
                        order by r.ordem, r.horario nulls last, r.nome)
                   from {schema}.refeicoes r where r.plano_id = pl.id), '[]'::jsonb))
             order by pl.created_at desc)
        from {schema}.planos_alimentares pl
       where pl.paciente_id = any(v_ids) and pl.deleted_at is null), '[]'::jsonb),
    'orientacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'paciente_id', o.paciente_id, 'titulo', o.titulo, 'conteudo', o.conteudo,
               'created_at', o.created_at, 'updated_at', o.updated_at)
             order by o.created_at desc)
        from {schema}.orientacoes o
       where o.paciente_id = any(v_ids) and o.deleted_at is null), '[]'::jsonb),
    'metas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'paciente_id', m.paciente_id, 'titulo', m.titulo, 'descricao', m.descricao,
               'dias_semana', to_jsonb(m.dias_semana), 'ativa', m.ativa, 'inicio', m.inicio,
               'created_at', m.created_at, 'updated_at', m.updated_at)
             order by m.created_at)
        from {schema}.metas m
       where m.paciente_id = any(v_ids) and m.deleted_at is null), '[]'::jsonb),
    'refeicoes_concluidas', coalesce((
      select jsonb_agg(rc.refeicao_id order by rc.created_at)
        from {schema}.refeicoes_concluidas rc
       where rc.paciente_id = any(v_ids) and rc.data = v_dia), '[]'::jsonb),
    'metas_concluidas', coalesce((
      select jsonb_agg(mc.meta_id order by mc.criado_em)
        from {schema}.metas_concluidas mc
       where mc.paciente_id = any(v_ids) and mc.data = v_dia), '[]'::jsonb),
    -- os últimos 7 dias (a partir da meia-noite de São Paulo de hoje − 6 dias), como o diario_listar do site antigo — agora com o
    -- arquivo (a foto é do próprio aluno; P29)
    'diario', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'paciente_id', d.paciente_id, 'data_hora', d.data_hora, 'refeicao', d.refeicao,
               'comentario', d.comentario, 'reacao_nutri', d.reacao_nutri, 'comentario_nutri', d.comentario_nutri,
               'reagido_em', d.reagido_em, 'path', d.path)
             order by d.data_hora desc, d.created_at desc)
        from {schema}.diario_alimentar d
       where d.paciente_id = any(v_ids) and d.deleted_at is null
         and d.data_hora >= ((v_hoje - 6)::timestamp at time zone 'America/Sao_Paulo')), '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.minha_dieta(date) from public, anon;
grant execute on function {schema}.minha_dieta(date) to authenticated, service_role;

-- ============================================================================================================
-- 2. ✓ nas metas do dia (NF4) — o aluno marca; a nutricionista responsável lê (política da W2 em metas_concluidas)
-- ============================================================================================================
-- Erros (a tela traduz): sem_acesso (não é meta de uma matrícula viva dele com Nutrição, ou o login está desativado),
-- data_invalida (fora de hoje ± 1 em São Paulo), meta_pausada, fora_do_dia (a meta não vale nesse dia da semana ou ainda não começou).
create or replace function {schema}.aluno_marcar_meta(p_meta_id uuid, p_data date, p_concluida boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_paciente uuid;
  v_conta uuid;
  v_ativa boolean;
  v_dias smallint[];
  v_inicio date;
begin
  if v_uid is null or exists (select 1 from auth.users u where u.id = v_uid and u.banned_until is not null and u.banned_until > now()) then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if p_data is null or p_data < v_hoje - 1 or p_data > v_hoje + 1 then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  select m.paciente_id, p.conta_id, m.ativa, m.dias_semana, m.inicio
    into v_paciente, v_conta, v_ativa, v_dias, v_inicio
    from {schema}.metas m
    join {schema}.pacientes p on p.id = m.paciente_id
    left join {schema}.contas c on c.id = p.conta_id
   where m.id = p_meta_id and m.deleted_at is null
     and p.user_id = v_uid and p.deleted_at is null and p.nutricionista_id is not null
     and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano)));
  if v_paciente is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if coalesce(p_concluida, false) then
    if not v_ativa then
      raise exception 'meta_pausada' using errcode = '22023';
    end if;
    if not (extract(isodow from p_data)::smallint = any(v_dias)) or v_inicio > p_data then
      raise exception 'fora_do_dia' using errcode = '22023';
    end if;
    insert into {schema}.metas_concluidas (paciente_id, meta_id, data, conta_id)
    values (v_paciente, p_meta_id, p_data, v_conta)
    on conflict (meta_id, data) do nothing;
    return true;
  end if;
  delete from {schema}.metas_concluidas where meta_id = p_meta_id and data = p_data and paciente_id = v_paciente;
  return false;
end;
$$;
revoke execute on function {schema}.aluno_marcar_meta(uuid, date, boolean) from public, anon;
grant execute on function {schema}.aluno_marcar_meta(uuid, date, boolean) to authenticated, service_role;

-- ============================================================================================================
-- 3. ✓ das refeições — a MESMA função do site antigo (W58 do Nutri), só procurando a refeição em todas as matrículas do login
-- ============================================================================================================
-- Igual à de 24/09 (20260924010000_refeicoes_concluidas.sql): sem_acesso / data_invalida / sem_alimentos, hoje ± 1 em São Paulo,
-- só refeição com alimento, só plano vivo do próprio paciente, a nutricionista copiada do plano, desmarcar apaga a linha.
create or replace function {schema}.paciente_marcar_refeicao(p_refeicao_id uuid, p_data date, p_concluida boolean)
returns boolean
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_uid uuid := auth.uid();
  v_paciente uuid;
  v_nutri uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- é paciente: login vivo (não desativado) com alguma matrícula viva — a regra do meu_paciente_id()
  if v_uid is null or {schema}.meu_paciente_id() is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if p_data is null or p_data < v_hoje - 1 or p_data > v_hoje + 1 then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  select pl.paciente_id, pl.nutricionista_id into v_paciente, v_nutri
    from refeicoes r
    join planos_alimentares pl on pl.id = r.plano_id
    join pacientes p on p.id = pl.paciente_id
   where r.id = p_refeicao_id and pl.deleted_at is null and p.user_id = v_uid and p.deleted_at is null
   order by p.created_at
   limit 1;
  if v_nutri is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if coalesce(p_concluida, false) then
    if not exists (select 1 from itens_refeicao i where i.refeicao_id = p_refeicao_id) then
      raise exception 'sem_alimentos' using errcode = '22023';
    end if;
    insert into refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data)
    values (v_nutri, v_paciente, p_refeicao_id, p_data)
    on conflict (refeicao_id, data) do nothing;
    return true;
  end if;
  delete from refeicoes_concluidas where refeicao_id = p_refeicao_id and data = p_data and paciente_id = v_paciente;
  return false;
end;
$$;
revoke all on function {schema}.paciente_marcar_refeicao(uuid, date, boolean) from public;
revoke all on function {schema}.paciente_marcar_refeicao(uuid, date, boolean) from anon;
grant execute on function {schema}.paciente_marcar_refeicao(uuid, date, boolean) to authenticated;

-- ============================================================================================================
-- 4. A foto do diário do próprio aluno (P29: a foto do dia vira a foto da refeição; a nutricionista continua lendo as dela)
-- ============================================================================================================
create or replace function {schema}.aluno_le_foto_diario(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
      from {schema}.diario_alimentar d
      join {schema}.pacientes p on p.id = d.paciente_id
     where d.path = p_path and d.deleted_at is null
       and p.user_id = auth.uid() and p.deleted_at is null);
$$;
revoke execute on function {schema}.aluno_le_foto_diario(text) from public, anon;
grant execute on function {schema}.aluno_le_foto_diario(text) to authenticated, service_role;

-- @@ compartilhado
-- Storage (o bucket "diario" é um só para os 2 schemas): o aluno dono lê o arquivo das próprias fotos do diário (é o que deixa
-- assinar a URL). Soma às políticas de hoje (a nutricionista lê pela pasta; o link público só sobe). Montada com as funções que
-- já existem (staging primeiro; na produção o mesmo bloco recria a política com as 2).
do $w11$
declare
  v_expr text;
begin
  v_expr := concat_ws(' or ',
    case when to_regprocedure('staging.aluno_le_foto_diario(text)') is not null then 'staging.aluno_le_foto_diario(name)' end,
    case when to_regprocedure('public.aluno_le_foto_diario(text)') is not null then 'public.aluno_le_foto_diario(name)' end);
  if coalesce(v_expr, '') = '' then
    raise notice 'W11: nenhuma aluno_le_foto_diario ainda — aplique o bloco do schema antes';
    return;
  end if;
  execute 'drop policy if exists "diario: o aluno le as proprias fotos" on storage.objects';
  execute format('create policy "diario: o aluno le as proprias fotos" on storage.objects for select to authenticated using (bucket_id = %L and (%s))',
                 'diario', v_expr);
end
$w11$;
