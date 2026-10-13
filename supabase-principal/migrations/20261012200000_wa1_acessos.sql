-- Physiq W-A (Acessos do aluno) — P1, migration 1 de 3: os ACESSOS. Banco principal, staging + public. Idempotente.
-- Spec: docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md §2.2 (padrões 3, 5, 6), §5.1 (wa1), §5.5.
-- SÓ ACRESCENTA — nenhuma tabela, função, policy ou dado de hoje muda:
--   · aluno_acessos (paciente_id, chave 'dieta', nivel 'ver'|'mexer'): sem linha = 'ver' (o "como hoje"). RLS: lê quem vê o aluno
--     (pode_ver_aluno) e o próprio aluno (wa_minha_matricula); SEM policy de escrita — grava só a RPC acessos_salvar;
--   · aluno_acessos_log: o histórico de toda mudança — acesso_app, diario_alimentar e acesso_link pelo gatilho AFTER em pacientes
--     (o valor EFETIVO de ajustes_do_aluno: pega o caminho antigo — o card de hoje, o APK velho, o REST — e o acesso_app que o
--     gatilho BEFORE da P15 liga quando nasce o login), dieta pelo gatilho em aluno_acessos e treino_series pela
--     acessos_registrar_series (a treino-acessos da P2 chama depois de gravar no Banco do Treino);
--   · RPCs da pessoa (a função `acessos` da P2 chama como a pessoa): acessos_ler, acessos_salvar, acessos_registrar_series;
--   · internas (só servidor/definer): aluno_dieta_liberada, wa_nutricao_de_verdade, wa_rota, wa_acessos_json, wa_aviso_aluno;
--     de policy (logado; confere auth.uid() por dentro): wa_minha_matricula; de gatilho: wa_log_acessos_pacientes, wa_log_aluno_acessos.
-- Erros são códigos ({ ok: false, erro }), nunca texto livre; nenhum nome de pessoa, rotina ou alimento em raise.
-- Aplicar (dry-run antes de cada um; backup antes da produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012200000_wa1_acessos.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012200000_wa1_acessos.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012200000_wa1_acessos.sql --so public
-- Testes: python3 e2e/wa/sql_wa.py --grupo acessos (staging; blocos desfeitos) · python3 e2e/wa/sql_wa.py --so-catalogo --schema public
-- Reversa: supabase-principal/reversas/20261012200000_wa1_acessos_reversa.sql

-- ============================================================================================================
-- 1. As tabelas (RLS ligado; o logado só LÊ — e o RLS decide o quê; o visitante, nada; o physiq_backup lê pelo default de hoje)
-- ============================================================================================================
create table if not exists {schema}.aluno_acessos (
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  chave text not null,
  nivel text not null,
  alterado_por uuid references auth.users(id) on delete set null,
  alterado_em timestamptz not null default now(),
  primary key (paciente_id, chave),
  constraint aluno_acessos_chave_chk check (chave in ('dieta')),
  constraint aluno_acessos_nivel_chk check (nivel in ('ver', 'mexer'))
);
comment on table {schema}.aluno_acessos is
  'W-A: o que o aluno pode no app, por matrícula (hoje só a Dieta: ver | mexer; sem linha = ver). Grava só a RPC acessos_salvar.';

create table if not exists {schema}.aluno_acessos_log (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  chave text not null,
  de text not null,
  para text not null,
  por uuid references auth.users(id) on delete set null,
  em timestamptz not null default now(),
  constraint aluno_acessos_log_chave_chk
    check (chave in ('acesso_app', 'diario_alimentar', 'acesso_link', 'dieta', 'treino_series')),
  constraint aluno_acessos_log_valores_chk check (de <> para and (
       (chave in ('acesso_app', 'diario_alimentar', 'acesso_link') and de in ('bloqueado', 'liberado') and para in ('bloqueado', 'liberado'))
    or (chave in ('dieta', 'treino_series') and de in ('ver', 'mexer') and para in ('ver', 'mexer'))))
);
create index if not exists aluno_acessos_log_paciente_idx on {schema}.aluno_acessos_log (paciente_id, chave, em desc);
comment on table {schema}.aluno_acessos_log is
  'W-A: histórico de toda mudança de acesso do aluno (quem, quando, de → para). Grava só gatilho/RPC.';

alter table {schema}.aluno_acessos enable row level security;
alter table {schema}.aluno_acessos_log enable row level security;
revoke all on table {schema}.aluno_acessos, {schema}.aluno_acessos_log from public, anon;
revoke insert, update, delete, truncate, references, trigger on table {schema}.aluno_acessos, {schema}.aluno_acessos_log from authenticated;
grant select on table {schema}.aluno_acessos, {schema}.aluno_acessos_log to authenticated;
grant select, insert, update, delete on table {schema}.aluno_acessos, {schema}.aluno_acessos_log to service_role;

-- ============================================================================================================
-- 2. As internas
-- ============================================================================================================
-- é uma matrícula viva do próprio login? (a policy do aluno; um aluno de 2 contas vê as 2 — a policy de pacientes só mostra 1)
create or replace function {schema}.wa_minha_matricula(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.pacientes p
                  where p.id = p_paciente and p.deleted_at is null and p.user_id is not null and p.user_id = auth.uid());
$$;
revoke all on function {schema}.wa_minha_matricula(uuid) from public, anon;
grant execute on function {schema}.wa_minha_matricula(uuid) to authenticated, service_role;

-- nutricionista DE VERDADE na matrícula: responsável + conta com Nutrição (ou o site antigo, sem conta) — a regra da minha_dieta.
-- Não é o "modulos" (no app sem profissional ele pode trazer 'nutricao' pelo plano do aluno).
create or replace function {schema}.wa_nutricao_de_verdade(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.id = p_paciente and p.deleted_at is null and p.nutricionista_id is not null
       and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))));
$$;

-- a Dieta liberada vale: a linha 'mexer' E a nutricionista de verdade (sem a nutri, a liberação perde o valor — spec §2.2-10)
create or replace function {schema}.aluno_dieta_liberada(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.wa_nutricao_de_verdade(p_paciente) and exists (
    select 1 from {schema}.aluno_acessos a where a.paciente_id = p_paciente and a.chave = 'dieta' and a.nivel = 'mexer');
$$;

-- a matrícula da rota do painel (w14_matricula_da_rota) sem exceção: { ok, id } ou { ok: false, erro } (sem_login · sem_acesso ·
-- aluno_inexistente · dados_invalidos)
create or replace function {schema}.wa_rota(p_aluno uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_aluno is null then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  return jsonb_build_object('ok', true, 'id', {schema}.w14_matricula_da_rota(p_aluno));
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'erro',
    case when sqlerrm in ('sem_login', 'sem_acesso', 'aluno_inexistente') then sqlerrm else 'erro_interno' end);
end;
$$;

-- aviso no sino do aluno (tipo 'geral' — a lista fechada de tipos não muda), no máximo 1 por aluno, título e dia de São Paulo; só
-- com login. O push do servidor leva o corpo FIXO do tipo (push-regras.ts, hml-10) — nunca o título. Devolve se gravou.
create or replace function {schema}.wa_aviso_aluno(p_user uuid, p_titulo text, p_link text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_inicio timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if p_user is null or p_titulo is null then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_aviso:' || p_user::text || ':' || p_titulo));
  if exists (select 1 from {schema}.avisos a
              where a.destino_user_id = p_user and a.tipo = 'geral' and a.titulo = p_titulo and a.criado_em >= v_inicio) then
    return false;
  end if;
  insert into {schema}.avisos (destino_user_id, tipo, titulo, link) values (p_user, 'geral', p_titulo, p_link);
  return true;
end;
$$;

-- tudo o que a aba Acessos mostra de UMA matrícula (o ok, as linhas, a última mudança de cada chave com o nome de quem mudou)
create or replace function {schema}.wa_acessos_json(p_paciente uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_p {schema}.pacientes%rowtype;
  v_c {schema}.contas%rowtype;
  v_aj jsonb;
  v_dieta text;
begin
  select * into v_p from {schema}.pacientes where id = p_paciente;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'aluno_inexistente');
  end if;
  select * into v_c from {schema}.contas where id = v_p.conta_id;
  v_aj := {schema}.ajustes_do_aluno(v_p.config, v_p.user_id is not null);
  select a.nivel into v_dieta from {schema}.aluno_acessos a where a.paciente_id = v_p.id and a.chave = 'dieta';
  return jsonb_build_object(
    'ok', true,
    'paciente_id', v_p.id,
    'user_id', v_p.user_id,
    'conta_id', v_p.conta_id,
    'treino_user_id', v_p.treino_user_id,
    'tem_login', v_p.user_id is not null,
    'conta_modulos', to_jsonb(coalesce({schema}.modulos_do_plano(v_c.plano), array[]::text[])),
    -- os módulos do aluno: a MESMA regra da aluno_perfil (w14_ajustes.sql:790-795), sem chamar a função inteira
    'modulos', to_jsonb(case
        when v_c.origem = 'app' then case when v_p.ativo then coalesce(
            (select array(select md from unnest(pa.modulos) md where md in ('treino', 'nutricao'))
               from {schema}.planos_aluno pa where pa.id = v_p.plano_aluno_id), array['treino']::text[]) else array[]::text[] end
        else coalesce({schema}.w13_modulos_do_aluno(v_p.personal_id, v_p.nutricionista_id, v_c.plano), array[]::text[]) end),
    'tem_nutricionista', {schema}.wa_nutricao_de_verdade(v_p.id),
    'pode_mudar', {schema}.w14_pode_editar(v_p.id),
    'linhas', jsonb_build_object(
      'acesso_app', case when (v_aj ->> 'acesso_app')::boolean then 'liberado' else 'bloqueado' end,
      'diario_alimentar', case when (v_aj ->> 'diario_alimentar')::boolean then 'liberado' else 'bloqueado' end,
      'acesso_link', case when (v_aj ->> 'acesso_link')::boolean then 'liberado' else 'bloqueado' end,
      'dieta', coalesce(v_dieta, 'ver')),
    'mudancas', coalesce((
      select jsonb_object_agg(x.chave, jsonb_build_object('de', x.de, 'para', x.para, 'em', x.em,
                                                         'por_nome', {schema}.nome_da_pessoa(x.por)))
        from (select distinct on (l.chave) l.chave, l.de, l.para, l.por, l.em
                from {schema}.aluno_acessos_log l where l.paciente_id = v_p.id
               order by l.chave, l.em desc, l.id) x), '{}'::jsonb));
end;
$$;

revoke all on function {schema}.wa_nutricao_de_verdade(uuid), {schema}.aluno_dieta_liberada(uuid), {schema}.wa_rota(uuid),
  {schema}.wa_aviso_aluno(uuid, text, text), {schema}.wa_acessos_json(uuid) from public, anon, authenticated;
grant execute on function {schema}.wa_nutricao_de_verdade(uuid), {schema}.aluno_dieta_liberada(uuid), {schema}.wa_rota(uuid),
  {schema}.wa_aviso_aluno(uuid, text, text), {schema}.wa_acessos_json(uuid) to service_role;

-- ============================================================================================================
-- 3. O histórico por gatilho
-- ============================================================================================================
-- pacientes: o valor EFETIVO das 3 chaves (sem a chave, acesso_app = tem login). AFTER UPDATE sem lista de colunas: o "update of
-- config" não veria o acesso_app que o gatilho BEFORE da P15 liga quando nasce o login (mudança feita no BEFORE não dispara
-- "update of"). Quem: auth.uid() (null = servidor/pg_cron).
create or replace function {schema}.wa_log_acessos_pacientes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb := {schema}.ajustes_do_aluno(old.config, old.user_id is not null);
  v_depois jsonb := {schema}.ajustes_do_aluno(new.config, new.user_id is not null);
  v_k text;
begin
  foreach v_k in array array['acesso_app', 'diario_alimentar', 'acesso_link'] loop
    if (v_antes ->> v_k) is distinct from (v_depois ->> v_k) then
      insert into {schema}.aluno_acessos_log (paciente_id, chave, de, para, por)
      values (new.id, v_k,
              case when (v_antes ->> v_k)::boolean then 'liberado' else 'bloqueado' end,
              case when (v_depois ->> v_k)::boolean then 'liberado' else 'bloqueado' end,
              auth.uid());
    end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists trg_pacientes_wa_log_acessos on {schema}.pacientes;
create trigger trg_pacientes_wa_log_acessos after update on {schema}.pacientes
  for each row when (old.config is distinct from new.config or old.user_id is distinct from new.user_id)
  execute function {schema}.wa_log_acessos_pacientes();

-- aluno_acessos: nasceu com 'mexer' = ver → mexer; mudou = de → para
create or replace function {schema}.wa_log_aluno_acessos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.nivel <> 'ver' then
      insert into {schema}.aluno_acessos_log (paciente_id, chave, de, para, por)
      values (new.paciente_id, new.chave, 'ver', new.nivel, coalesce(new.alterado_por, auth.uid()));
    end if;
  elsif old.nivel is distinct from new.nivel then
    insert into {schema}.aluno_acessos_log (paciente_id, chave, de, para, por)
    values (new.paciente_id, new.chave, old.nivel, new.nivel, coalesce(new.alterado_por, auth.uid()));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_aluno_acessos_log on {schema}.aluno_acessos;
create trigger trg_aluno_acessos_log after insert or update on {schema}.aluno_acessos
  for each row execute function {schema}.wa_log_aluno_acessos();

revoke all on function {schema}.wa_log_acessos_pacientes(), {schema}.wa_log_aluno_acessos() from public, anon, authenticated;
grant execute on function {schema}.wa_log_acessos_pacientes(), {schema}.wa_log_aluno_acessos() to service_role;

-- ============================================================================================================
-- 4. As policies (só SELECT; nenhuma de escrita)
-- ============================================================================================================
drop policy if exists "aluno_acessos: ler quem ve o aluno e o proprio" on {schema}.aluno_acessos;
create policy "aluno_acessos: ler quem ve o aluno e o proprio" on {schema}.aluno_acessos
  for select to authenticated using ({schema}.pode_ver_aluno(paciente_id) or {schema}.wa_minha_matricula(paciente_id));
drop policy if exists "aluno_acessos_log: ler quem ve o aluno" on {schema}.aluno_acessos_log;
create policy "aluno_acessos_log: ler quem ve o aluno" on {schema}.aluno_acessos_log
  for select to authenticated using ({schema}.pode_ver_aluno(paciente_id));

-- ============================================================================================================
-- 5. As RPCs da pessoa (a função `acessos` confere a FORMA antes e chama como a pessoa; aqui a regra de verdade)
-- ============================================================================================================
-- { ok, paciente_id, user_id, conta_id, treino_user_id, tem_login, conta_modulos, modulos, tem_nutricionista, pode_mudar, linhas,
--   mudancas } ou { ok: false, erro: sem_login | sem_acesso | aluno_inexistente | dados_invalidos }. Quem lê: quem a
-- w14_matricula_da_rota deixa (pode_mexer_no_acesso); o aluno NÃO (sem_acesso).
create or replace function {schema}.acessos_ler(p_aluno uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb := {schema}.wa_rota(p_aluno);
begin
  if not (v_r ->> 'ok')::boolean then
    return v_r;
  end if;
  return {schema}.wa_acessos_json((v_r ->> 'id')::uuid);
end;
$$;
revoke all on function {schema}.acessos_ler(uuid) from public, anon;
grant execute on function {schema}.acessos_ler(uuid) to authenticated, service_role;

-- p_chave: acesso_app | diario_alimentar | acesso_link (p_valor bloqueado | liberado) · dieta (p_valor ver | mexer). Quem muda:
-- w14_pode_editar (master, dono, responsáveis, a nutri dona — P4). As 3 chaves de pacientes.config pela aluno_salvar_ajustes de hoje
-- (conferindo o ok dela); a Dieta na tabela nova. Liberar a Dieta → aviso no sino (1 por dia; travar não avisa).
-- Erros: dados_invalidos · sem_login · sem_acesso · aluno_inexistente · sem_login_do_aluno (App sem login) · sem_nutricao
-- (Dieta/Diário/Link sem nutricionista de verdade — inclusive o aluno do app sem profissional) · o erro da aluno_salvar_ajustes.
create or replace function {schema}.acessos_salvar(p_aluno uuid, p_chave text, p_valor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
  v_id uuid;
  v_p {schema}.pacientes%rowtype;
  v_antes text;
begin
  if p_chave is null or p_valor is null
     or p_chave not in ('acesso_app', 'diario_alimentar', 'acesso_link', 'dieta')
     or (p_chave = 'dieta' and p_valor not in ('ver', 'mexer'))
     or (p_chave <> 'dieta' and p_valor not in ('bloqueado', 'liberado')) then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  v_r := {schema}.wa_rota(p_aluno);
  if not (v_r ->> 'ok')::boolean then
    return v_r;
  end if;
  v_id := (v_r ->> 'id')::uuid;
  if not {schema}.w14_pode_editar(v_id) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  select * into v_p from {schema}.pacientes where id = v_id for update;
  if p_chave = 'acesso_app' and v_p.user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login_do_aluno');
  end if;
  if p_chave in ('dieta', 'diario_alimentar', 'acesso_link') and not {schema}.wa_nutricao_de_verdade(v_id) then
    return jsonb_build_object('ok', false, 'erro', 'sem_nutricao');
  end if;
  if p_chave = 'dieta' then
    select a.nivel into v_antes from {schema}.aluno_acessos a where a.paciente_id = v_id and a.chave = 'dieta' for update;
    if coalesce(v_antes, 'ver') is distinct from p_valor then
      insert into {schema}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
      values (v_id, 'dieta', p_valor, auth.uid(), now())
      on conflict (paciente_id, chave) do update
        set nivel = excluded.nivel, alterado_por = excluded.alterado_por, alterado_em = excluded.alterado_em;
      if p_valor = 'mexer' then
        perform {schema}.wa_aviso_aluno(v_p.user_id,
          'Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia', '/dieta');
      end if;
    end if;
  else
    v_r := {schema}.aluno_salvar_ajustes(p_aluno, jsonb_build_object(p_chave, p_valor = 'liberado'));
    if not coalesce((v_r ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'erro', coalesce(v_r ->> 'erro', 'erro_interno'));
    end if;
  end if;
  return {schema}.wa_acessos_json(v_id);
end;
$$;
revoke all on function {schema}.acessos_salvar(uuid, text, text) from public, anon;
grant execute on function {schema}.acessos_salvar(uuid, text, text) to authenticated, service_role;

-- a treino-acessos (P2) grava series_travadas no Banco do Treino e registra aqui (só o histórico; a verdade fica no Treino).
-- Erros: dados_invalidos · sem_login · sem_acesso · aluno_inexistente. (Chamável pelo REST por quem já pode mudar: risco 5, aceito.)
create or replace function {schema}.acessos_registrar_series(p_aluno uuid, p_de text, p_para text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
  v_id uuid;
begin
  if p_de is null or p_para is null or p_de not in ('ver', 'mexer') or p_para not in ('ver', 'mexer') or p_de = p_para then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  v_r := {schema}.wa_rota(p_aluno);
  if not (v_r ->> 'ok')::boolean then
    return v_r;
  end if;
  v_id := (v_r ->> 'id')::uuid;
  if not {schema}.w14_pode_editar(v_id) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  insert into {schema}.aluno_acessos_log (paciente_id, chave, de, para, por) values (v_id, 'treino_series', p_de, p_para, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function {schema}.acessos_registrar_series(uuid, text, text) from public, anon;
grant execute on function {schema}.acessos_registrar_series(uuid, text, text) to authenticated, service_role;

-- ============================================================================================================
-- 6. Conferência (o molde da hml-12): algo fora do esperado → exceção → o bloco do schema inteiro volta
-- ============================================================================================================
do $wa$
declare
  v_t regclass;
  v_f text;
  r record;
begin
  foreach v_t in array array['{schema}.aluno_acessos'::regclass, '{schema}.aluno_acessos_log'::regclass] loop
    if not exists (select 1 from pg_catalog.pg_class c where c.oid = v_t and c.relrowsecurity) then
      raise exception 'wa1: % sem RLS', v_t;
    end if;
    if exists (select 1 from pg_catalog.pg_policy p where p.polrelid = v_t and p.polcmd <> 'r') then
      raise exception 'wa1: % com policy de escrita', v_t;
    end if;
    if pg_catalog.has_table_privilege('anon', v_t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
       or pg_catalog.has_table_privilege('authenticated', v_t, 'INSERT, UPDATE, DELETE, TRUNCATE')
       or not pg_catalog.has_table_privilege('authenticated', v_t, 'SELECT') then
      raise exception 'wa1: % com privilégio fora do esperado', v_t;
    end if;
  end loop;
  -- as RPCs da pessoa: definer, search_path fixo, logado e servidor (o visitante não)
  foreach v_f in array array['{schema}.acessos_ler(uuid)', '{schema}.acessos_salvar(uuid, text, text)',
                             '{schema}.acessos_registrar_series(uuid, text, text)', '{schema}.wa_minha_matricula(uuid)'] loop
    select p.oid, p.prosecdef, p.proconfig into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if r.oid is null or not r.prosecdef or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%')
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa1: % fora do esperado (definer, search_path, logado e servidor)', v_f;
    end if;
  end loop;
  -- as internas e as de gatilho: só o servidor
  foreach v_f in array array['{schema}.aluno_dieta_liberada(uuid)', '{schema}.wa_nutricao_de_verdade(uuid)', '{schema}.wa_rota(uuid)',
                             '{schema}.wa_aviso_aluno(uuid, text, text)', '{schema}.wa_acessos_json(uuid)',
                             '{schema}.wa_log_acessos_pacientes()', '{schema}.wa_log_aluno_acessos()'] loop
    select p.oid, p.prosecdef, p.proconfig into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if r.oid is null or not r.prosecdef or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%')
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa1: % fora do esperado (interna: só o servidor)', v_f;
    end if;
  end loop;
  -- os 2 gatilhos ligados
  if (select count(*) from pg_catalog.pg_trigger t
       where not t.tgisinternal and t.tgenabled <> 'D'
         and ((t.tgrelid = '{schema}.pacientes'::regclass and t.tgname = 'trg_pacientes_wa_log_acessos')
           or (t.tgrelid = '{schema}.aluno_acessos'::regclass and t.tgname = 'trg_aluno_acessos_log'))) <> 2 then
    raise exception 'wa1: falta um gatilho do histórico em {schema}';
  end if;
end
$wa$;
