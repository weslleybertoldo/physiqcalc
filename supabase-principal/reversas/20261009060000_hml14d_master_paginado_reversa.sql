-- Reversa da hml-14d (supabase-principal/migrations/20261009060000_hml14d_master_paginado.sql). Idempotente: roda com ou sem a
-- migração aplicada.
--   · saem as assinaturas novas: master_contas(jsonb, integer, integer), master_financeiro(text, integer, integer),
--     master_integracoes(integer, integer), master_alunos_do_app(integer, integer, text) e master_sem_conta(text, integer, integer);
--   · voltam as de hoje, com o texto EXATO das migrações de origem e os mesmos grants: master_contas(jsonb), master_sem_conta(text),
--     master_financeiro(text) e master_integracoes() de 20261002010000_w27_master.sql; master_alunos_do_app() de
--     20260929190000_w07b_sem_profissional.sql (só o servidor e o logado); master_alunos(jsonb, integer, integer) — mesma
--     assinatura — volta ao texto de 20261009020000_hml14b_busca_sem_acento.sql (a busca por nome/e-mail sem acento).
-- O front da hml-14d manda a página às funções master-contas, master-financeiro e master-planos, que passam p_offset/p_limite só
-- quando o pedido traz `pagina`: reverter o front (e as 3 funções) junto — a tela antiga chama sem página.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.master_contas(jsonb, integer, integer);
drop function if exists {schema}.master_financeiro(text, integer, integer);
drop function if exists {schema}.master_integracoes(integer, integer);
drop function if exists {schema}.master_alunos_do_app(integer, integer, text);
drop function if exists {schema}.master_sem_conta(text, integer, integer);

-- ===== master_contas (20261002010000_w27_master.sql) =====
create or replace function {schema}.master_contas(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca text := lower(btrim(coalesce(v_f ->> 'busca', '')));
  v_sit text := nullif(v_f ->> 'situacao', '');
  v_origem text := nullif(v_f ->> 'origem', '');
  v_todas jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select coalesce(jsonb_agg(x.l order by {schema}.w27_peso(x.l ->> 'situacao_efetiva'), lower(x.l ->> 'nome')), '[]'::jsonb) into v_todas
    from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c) x;
  return jsonb_build_object(
    'ok', true, 'hoje', {schema}.cobranca_hoje(),
    'resumo', jsonb_build_object(
      'todas', jsonb_array_length(v_todas),
      'ativas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' in ('ativa', 'teste', 'isenta')),
      'vencidas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'vencida'),
      'suspensas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' in ('suspensa', 'cancelada'))),
    'contas', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(v_todas) e
       where (v_origem is null or e ->> 'origem' = v_origem)
         and (v_sit is null
              or (v_sit = 'ativas' and e ->> 'situacao_efetiva' in ('ativa', 'teste', 'isenta'))
              or (v_sit = 'suspensas' and e ->> 'situacao_efetiva' in ('suspensa', 'cancelada'))
              or e ->> 'situacao_efetiva' = v_sit)
         and (v_busca = '' or lower(e ->> 'nome') like '%' || v_busca || '%'
              or lower(coalesce(e #>> '{dono,nome}', '')) like '%' || v_busca || '%'
              or lower(coalesce(e #>> '{dono,email}', '')) like '%' || v_busca || '%')), '[]'::jsonb));
end;
$$;

-- ===== master_sem_conta (20261002010000_w27_master.sql) =====
-- "sem conta" (C8): quem tem login e não é aluno nem profissional de nenhuma conta (fica nas Boas-vindas)
create or replace function {schema}.master_sem_conta(p_busca text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_busca text := lower(btrim(coalesce(p_busca, '')));
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  return jsonb_build_object('ok', true, 'pessoas', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nome', {schema}.w27_nome(u.id), 'email', lower(u.email), 'papel', pr.role,
                                        'criado_em', u.created_at, 'ultimo_acesso', u.last_sign_in_at) order by u.created_at desc)
      from auth.users u join {schema}.profiles pr on pr.id = u.id
     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido')
       and (v_busca = '' or lower(u.email) like '%' || v_busca || '%' or lower(coalesce(pr.nome, '')) like '%' || v_busca || '%')), '[]'::jsonb));
end;
$$;

-- ===== master_financeiro (20261002010000_w27_master.sql) =====
create or replace function {schema}.master_financeiro(p_filtro text default 'todas') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := {schema}.cobranca_hoje();
  v_ini date := date_trunc('month', {schema}.cobranca_hoje())::date;
  v_todas jsonb;
  v_filtro text := coalesce(nullif(p_filtro, ''), 'todas');
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select coalesce(jsonb_agg(x.l order by {schema}.w27_peso(x.l ->> 'situacao_efetiva'), x.l ->> 'vence_em', lower(x.l ->> 'nome')), '[]'::jsonb) into v_todas
    from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c where c.origem <> 'app') x;
  return jsonb_build_object(
    'ok', true, 'hoje', v_hoje, 'filtro', v_filtro,
    'resumo', jsonb_build_object(
      'todas', jsonb_array_length(v_todas),
      'vencidas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'vencida'),
      'tolerancia', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'ativa'
                      and (e ->> 'vence_em')::date < v_hoje and coalesce((e ->> 'tolerancia_dias')::integer, 0) > 0),
      'teste', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'teste'),
      'isentas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'isenta'),
      'em_dia', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'ativa'),
      'legadas', (select count(*) from jsonb_array_elements(v_todas) e where (e ->> 'cobranca_legada')::boolean),
      'recebido_mes', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status = 'approved'
                                 and (f.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0),
      'em_aberto', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status in ('pending', 'in_process')), 0)),
    'contas', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_todas) e
       where case v_filtro
               when 'vencidas' then e ->> 'situacao_efetiva' = 'vencida'
               when 'tolerancia' then e ->> 'situacao_efetiva' = 'ativa' and (e ->> 'vence_em')::date < v_hoje and coalesce((e ->> 'tolerancia_dias')::integer, 0) > 0
               when 'teste' then e ->> 'situacao_efetiva' = 'teste'
               when 'isentas' then e ->> 'situacao_efetiva' = 'isenta'
               when 'em_dia' then e ->> 'situacao_efetiva' = 'ativa'
               when 'legadas' then (e ->> 'cobranca_legada')::boolean
               else true end), '[]'::jsonb),
    'faturas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'conta_id', f.conta_id, 'conta_nome', c.nome, 'tipo', f.tipo, 'valor', f.valor, 'status', f.status, 'forma', f.forma,
        'cobre_de', f.cobre_de, 'cobre_ate', f.cobre_ate, 'pago_em', f.pago_em, 'criado_em', f.criado_em, 'descricao', f.descricao,
        'registrado_por', case when f.registrado_por is null then null else {schema}.w27_nome(f.registrado_por) end) order by f.criado_em desc)
      from (select * from {schema}.conta_faturas order by criado_em desc limit 40) f join {schema}.contas c on c.id = f.conta_id), '[]'::jsonb));
end;
$$;

-- ===== master_integracoes (20261002010000_w27_master.sql) =====
create or replace function {schema}.master_integracoes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  return jsonb_build_object('ok', true, 'contas', coalesce((
    select jsonb_agg({schema}.w27_conta_linha(c.id) order by c.origem = 'app' desc, lower(c.nome)) from {schema}.contas c), '[]'::jsonb),
    'resumo', jsonb_build_object(
      'pix_manual', (select count(*) from {schema}.contas c where c.recebimento_modo = 'pix_manual'),
      'mercadopago', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago'),
      'nenhum', (select count(*) from {schema}.contas c where c.recebimento_modo = 'nenhum'),
      'com_chave', (select count(distinct k.conta_id) from {schema}.recebimento_chaves k where k.ativa)));
end;
$$;

-- ===== master_alunos_do_app (20260929190000_w07b_sem_profissional.sql) =====
create or replace function {schema}.master_alunos_do_app() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then
    return jsonb_build_object('ok', false, 'erro', 'so_master');
  end if;
  return jsonb_build_object('ok', true, 'conta_id', {schema}.conta_do_app(), 'alunos', coalesce((
    select jsonb_agg(jsonb_build_object(
        'paciente_id', p.id, 'user_id', p.user_id, 'nome', p.nome, 'email', lower(coalesce(u.email, p.email)), 'ativo', p.ativo,
        'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor, 'objetivo', p.objetivo_app,
        'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate, 'pausada', p.cobranca_pausada,
        'assinatura', (select s.status from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1),
        'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo, 'criado_em', p.created_at)
      order by p.ativo desc, p.created_at desc)
      from {schema}.pacientes p
      left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
      left join auth.users u on u.id = p.user_id
     where p.conta_id = {schema}.conta_do_app() and p.deleted_at is null), '[]'::jsonb));
end;
$$;

-- ===== master_alunos (20261009020000_hml14b_busca_sem_acento.sql) =====
create or replace function {schema}.master_alunos(p_filtros jsonb default '{}'::jsonb, p_offset integer default 0, p_limite integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  -- hml-14b (D17): o termo sem acento e sem caixa, do mesmo jeito que a alunos_da_conta (nome e e-mail comparados igual)
  v_busca text := {schema}.texto_busca(btrim(regexp_replace(coalesce(v_f ->> 'busca', ''), '\s+', ' ', 'g')));
  v_conta uuid := nullif(v_f ->> 'conta_id', '')::uuid;
  v_modo text := coalesce(nullif(v_f ->> 'modo', ''), 'ativos');
  v_app uuid := {schema}.conta_do_app();
  v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_lista jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or {schema}.texto_busca(p.nome) like '%' || v_busca || '%' or {schema}.texto_busca(p.email) like '%' || v_busca || '%')
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
  )
  select count(*) into v_total from filtrada;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or {schema}.texto_busca(p.nome) like '%' || v_busca || '%' or {schema}.texto_busca(p.email) like '%' || v_busca || '%')
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
     order by case when v_modo = 'p7' then coalesce(b.user_id::text, '') else '' end, lower(coalesce(b.nome, '')), b.created_at
     offset v_off limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', b.id, 'nome', b.nome, 'email', coalesce(lower((select u.email from auth.users u where u.id = b.user_id)), lower(b.email)),
      'user_id', b.user_id, 'tem_login', b.user_id is not null, 'ativo', b.ativo, 'criado_em', b.created_at,
      'conta', case when b.conta_id is null then null else jsonb_build_object('id', b.conta_id, 'nome', b.conta_nome, 'origem', b.conta_origem,
                                                                               'eh_app', b.conta_id = v_app) end,
      'personal', case when b.personal_id is null then null else jsonb_build_object('id', b.personal_id, 'nome', {schema}.w27_nome(b.personal_id)) end,
      'nutricionista', case when b.nutricionista_id is null then null else jsonb_build_object('id', b.nutricionista_id, 'nome', {schema}.w27_nome(b.nutricionista_id)) end,
      'modulos', to_jsonb({schema}.w13_modulos_do_aluno(b.personal_id, b.nutricionista_id, b.conta_plano)),
      'bloqueado', b.acesso_bloqueado_em is not null, 'conta_bloqueada', b.conta_bloq is not null, 'p7', b.p7,
      'app', case when b.conta_id = v_app then jsonb_build_object('plano', (select pa.nome from {schema}.planos_aluno pa where pa.id = b.plano_aluno_id),
                                                                   'valor', b.mensalidade_valor, 'teste_ate', b.app_teste_ate, 'pago_ate', b.mensalidade_pago_ate,
                                                                   'encerrada_em', b.app_encerrada_em, 'objetivo', b.objetivo_app) end)), '[]'::jsonb)
    into v_lista from filtrada b;
  return jsonb_build_object('ok', true, 'modo', v_modo, 'total', v_total, 'offset', v_off, 'limite', v_lim, 'alunos', v_lista,
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
                                                            'modulos', to_jsonb({schema}.modulos_do_plano(c.plano))) order by c.origem = 'app', lower(c.nome))
                          from {schema}.contas c), '[]'::jsonb),
    'contagens', jsonb_build_object(
      'ativos', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.acesso_bloqueado_em is null and p.conta_id is distinct from v_app),
      'app', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.conta_id = v_app),
      'p7', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.user_id in (
                select q.user_id from {schema}.pacientes q where q.user_id is not null and q.ativo and q.deleted_at is null and q.conta_id is not null
                   and q.conta_id is distinct from v_app group by q.user_id having count(distinct q.conta_id) > 1)),
      'sem_conta', (select count(*) from auth.users u join {schema}.profiles pr on pr.id = u.id
                     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
                       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
                       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido'))));
end;
$$;

-- os grants de hoje (W27: só o logado e o servidor; W7b: master_alunos_do_app tirada de todos e dada ao servidor e ao logado)
revoke execute on function {schema}.master_contas(jsonb), {schema}.master_sem_conta(text), {schema}.master_financeiro(text),
  {schema}.master_integracoes(), {schema}.master_alunos(jsonb, integer, integer)
  from public, anon;
grant execute on function {schema}.master_contas(jsonb), {schema}.master_sem_conta(text), {schema}.master_financeiro(text),
  {schema}.master_integracoes(), {schema}.master_alunos(jsonb, integer, integer)
  to authenticated, service_role;
revoke execute on function {schema}.master_alunos_do_app() from public, anon, authenticated;
grant execute on function {schema}.master_alunos_do_app() to service_role;
grant execute on function {schema}.master_alunos_do_app() to authenticated;

notify pgrst, 'reload schema';
