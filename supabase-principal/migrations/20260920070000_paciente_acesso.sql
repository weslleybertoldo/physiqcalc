-- PhysiqNutri — W34 Área do paciente (3º acesso). Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920070000_paciente_acesso.sql`
-- (roda em public E staging, trocando {schema}).
--
-- O paciente ganha login PRÓPRIO (claim `app_metadata.role = 'paciente'`), criado pela nutricionista no perfil do paciente com uma
-- senha inicial — mesma receita da W33 (INSERT em auth.users + auth.identities com crypt/bf; o trigger `handle_new_user` cria o perfil
-- nos 2 schemas). `pacientes.user_id` liga a conta ao registro e vale SÓ no schema da função (auth.users é compartilhado; o paciente
-- de staging é outro registro). O paciente só LÊ o que é dele: policies novas de SELECT em pacientes, planos/refeições/itens,
-- orientações, metas, agendamentos, recibos e diário — todas via `{schema}.meu_paciente_id()`; alimentos/medidas do plano e o perfil
-- da sua nutricionista via `{schema}.minha_nutricionista_id()`. Escrever continua só pela RPC pública `diario_enviar` (foto do diário)
-- com o `link_codigo` do próprio registro (W30) — nenhuma policy de INSERT/UPDATE/DELETE pro paciente.
--
-- RPCs security definer (guard: dona do paciente ou master; EXECUTE revogado de public E anon):
--   paciente_acesso(p_paciente_id) → jsonb|null · paciente_criar_acesso(p_paciente_id, p_email, p_senha) → uuid ·
--   paciente_definir_acesso(p_paciente_id, p_ativo) · paciente_redefinir_senha(p_paciente_id, p_senha) · paciente_remover_acesso(p_paciente_id)
-- Erros curtos (a tela traduz): sem_acesso · ja_tem_acesso · sem_conta · email_invalido · email_em_uso · senha_curta

-- 1) a conta do paciente: 1 paciente por conta, POR schema
alter table {schema}.pacientes add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists pacientes_user_id_uq on {schema}.pacientes (user_id) where user_id is not null;

-- 2) profiles.role aceita 'paciente' (o trigger handle_new_user grava o perfil do paciente nos 2 schemas)
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
     where c.conrelid = '{schema}.profiles'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table {schema}.profiles drop constraint %I', r.conname);
  end loop;
end $$;
alter table {schema}.profiles add constraint profiles_role_check check (role in ('nutricionista', 'master', 'paciente'));

-- 3) helpers
-- paciente = claim app_metadata.role no JWT
create or replace function {schema}.eh_paciente() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'paciente', false);
$$;

-- o registro (vivo) ligado à conta logada, ou null. security definer: as policies chamam sem depender da RLS de pacientes.
-- Conta desativada (banned_until no futuro) → null na hora: o JWT que ainda não expirou deixa de ler qualquer dado.
create or replace function {schema}.meu_paciente_id() returns uuid
language sql stable security definer set search_path = {schema}, public as $$
  select p.id from {schema}.pacientes p join auth.users u on u.id = p.user_id
   where p.user_id = auth.uid() and p.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) limit 1;
$$;
revoke all on function {schema}.meu_paciente_id() from public;
revoke all on function {schema}.meu_paciente_id() from anon;
grant execute on function {schema}.meu_paciente_id() to authenticated;

-- a nutricionista do paciente logado (pra ler os alimentos próprios dela e o perfil dela), ou null
create or replace function {schema}.minha_nutricionista_id() returns uuid
language sql stable security definer set search_path = {schema}, public as $$
  select p.nutricionista_id from {schema}.pacientes p join auth.users u on u.id = p.user_id
   where p.user_id = auth.uid() and p.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) limit 1;
$$;
revoke all on function {schema}.minha_nutricionista_id() from public;
revoke all on function {schema}.minha_nutricionista_id() from anon;
grant execute on function {schema}.minha_nutricionista_id() to authenticated;

-- 4) RPCs do lado da nutricionista (guard: dona do paciente ou master)
-- estado do acesso: null (sem conta) ou {user_id, email, ativo, criado_em, ultimo_acesso}
create or replace function {schema}.paciente_acesso(p_paciente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then return null; end if;
  return (
    select jsonb_build_object(
      'user_id', u.id,
      'email', u.email,
      'ativo', (u.banned_until is null or u.banned_until <= now()),
      'criado_em', u.created_at,
      'ultimo_acesso', u.last_sign_in_at)
    from auth.users u where u.id = v_pac.user_id
  );
end;
$$;

-- cria a conta do paciente com senha inicial e liga em pacientes.user_id (só neste schema). Sem convite por e-mail.
create or replace function {schema}.paciente_criar_acesso(p_paciente_id uuid, p_email text, p_senha text)
returns uuid
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid := gen_random_uuid();
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is not null then raise exception 'ja_tem_acesso'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalido'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email_em_uso'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'paciente'),
    jsonb_build_object('full_name', v_pac.nome), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  update {schema}.pacientes set user_id = v_id where id = p_paciente_id;
  return v_id;
end;
$$;

-- desativar/reativar o login: banned_until +100 anos (o que a Admin API grava; GoTrue → 400 user_banned) + profiles.ativo nos 2 schemas.
-- Desativar derruba as sessões abertas (o token atual morre no próximo refresh).
create or replace function {schema}.paciente_definir_acesso(p_paciente_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  update auth.users
     set banned_until = case when p_ativo then null else now() + interval '100 years' end, updated_at = now()
   where id = v_pac.user_id;
  update public.profiles set ativo = p_ativo where id = v_pac.user_id;
  update staging.profiles set ativo = p_ativo where id = v_pac.user_id;
  if not p_ativo then delete from auth.sessions where user_id = v_pac.user_id; end if;
end;
$$;

-- nova senha (crypt/bf) e derruba as sessões abertas: o paciente entra de novo com a senha nova
create or replace function {schema}.paciente_redefinir_senha(p_paciente_id uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
   where id = v_pac.user_id;
  delete from auth.sessions where user_id = v_pac.user_id;
end;
$$;

-- apaga a conta (auth.users → perfis nos 2 schemas por cascade; pacientes.user_id vira null pelo set null). O paciente continua no cadastro.
create or replace function {schema}.paciente_remover_acesso(p_paciente_id uuid)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  delete from auth.users where id = v_pac.user_id;
end;
$$;

-- os default privileges do projeto dão EXECUTE explícito ao anon em toda função nova → revogar dos dois (public E anon)
revoke all on function {schema}.paciente_acesso(uuid) from public;
revoke all on function {schema}.paciente_acesso(uuid) from anon;
grant execute on function {schema}.paciente_acesso(uuid) to authenticated;

revoke all on function {schema}.paciente_criar_acesso(uuid, text, text) from public;
revoke all on function {schema}.paciente_criar_acesso(uuid, text, text) from anon;
grant execute on function {schema}.paciente_criar_acesso(uuid, text, text) to authenticated;

revoke all on function {schema}.paciente_definir_acesso(uuid, boolean) from public;
revoke all on function {schema}.paciente_definir_acesso(uuid, boolean) from anon;
grant execute on function {schema}.paciente_definir_acesso(uuid, boolean) to authenticated;

revoke all on function {schema}.paciente_redefinir_senha(uuid, text) from public;
revoke all on function {schema}.paciente_redefinir_senha(uuid, text) from anon;
grant execute on function {schema}.paciente_redefinir_senha(uuid, text) to authenticated;

revoke all on function {schema}.paciente_remover_acesso(uuid) from public;
revoke all on function {schema}.paciente_remover_acesso(uuid) from anon;
grant execute on function {schema}.paciente_remover_acesso(uuid) to authenticated;

-- 5) o que o paciente LÊ (policies permissivas somam às da dona/master; só SELECT)
drop policy if exists "paciente: ler o proprio" on {schema}.pacientes;
create policy "paciente: ler o proprio" on {schema}.pacientes
  for select to authenticated using (id = {schema}.meu_paciente_id());

drop policy if exists "paciente: ler os proprios planos" on {schema}.planos_alimentares;
create policy "paciente: ler os proprios planos" on {schema}.planos_alimentares
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler as refeicoes do proprio plano" on {schema}.refeicoes;
create policy "paciente: ler as refeicoes do proprio plano" on {schema}.refeicoes
  for select to authenticated using (exists (
    select 1 from {schema}.planos_alimentares p where p.id = plano_id and p.paciente_id = {schema}.meu_paciente_id() and p.deleted_at is null
  ));

drop policy if exists "paciente: ler os itens do proprio plano" on {schema}.itens_refeicao;
create policy "paciente: ler os itens do proprio plano" on {schema}.itens_refeicao
  for select to authenticated using (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and p.paciente_id = {schema}.meu_paciente_id() and p.deleted_at is null
  ));

drop policy if exists "paciente: ler taco e os alimentos da sua nutricionista" on {schema}.alimentos;
create policy "paciente: ler taco e os alimentos da sua nutricionista" on {schema}.alimentos
  for select to authenticated using ({schema}.eh_paciente() and (fonte = 'taco' or nutricionista_id = {schema}.minha_nutricionista_id()));

drop policy if exists "paciente: ler as medidas dos alimentos visiveis" on {schema}.medidas_caseiras;
create policy "paciente: ler as medidas dos alimentos visiveis" on {schema}.medidas_caseiras
  for select to authenticated using ({schema}.eh_paciente() and exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and (a.fonte = 'taco' or a.nutricionista_id = {schema}.minha_nutricionista_id())
  ));

drop policy if exists "paciente: ler as proprias orientacoes" on {schema}.orientacoes;
create policy "paciente: ler as proprias orientacoes" on {schema}.orientacoes
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler as proprias metas" on {schema}.metas;
create policy "paciente: ler as proprias metas" on {schema}.metas
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler os proprios agendamentos" on {schema}.agendamentos;
create policy "paciente: ler os proprios agendamentos" on {schema}.agendamentos
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler os proprios recibos" on {schema}.recibos;
create policy "paciente: ler os proprios recibos" on {schema}.recibos
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler o proprio diario" on {schema}.diario_alimentar;
create policy "paciente: ler o proprio diario" on {schema}.diario_alimentar
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler o perfil da sua nutricionista" on {schema}.profiles;
create policy "paciente: ler o perfil da sua nutricionista" on {schema}.profiles
  for select to authenticated using (id = {schema}.minha_nutricionista_id());

-- 6) a tela do master lista só profissionais (nutricionistas e masters) — os pacientes ficam de fora
create or replace function {schema}.master_profissionais()
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
begin
  if not {schema}.eh_master() then raise exception 'sem_acesso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'email', p.email,
        'role', p.role,
        'ativo', p.ativo,
        'criado_em', p.created_at,
        'ultimo_acesso', u.last_sign_in_at,
        'pacientes_ativos', (select count(*) from {schema}.pacientes pa where pa.nutricionista_id = p.id and pa.deleted_at is null and pa.ativo),
        'pacientes_total', (select count(*) from {schema}.pacientes pa where pa.nutricionista_id = p.id)
      ) order by lower(coalesce(p.nome, '')), p.email, p.id)
      from {schema}.profiles p
      left join auth.users u on u.id = p.id
     where p.role <> 'paciente'
  ), '[]'::jsonb);
end;
$$;
