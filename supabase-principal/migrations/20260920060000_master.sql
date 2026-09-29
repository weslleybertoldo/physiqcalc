-- PhysiqNutri — W33 Master: profissionais. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920060000_master.sql`
-- (roda em public E staging, trocando {schema}).
--
-- O master (claim `app_metadata.role = 'master'`, lido por `{schema}.eh_master()`) gerencia os acessos dos profissionais
-- (nutricionistas) pela tela /master/profissionais. Como `disable_signup=true` e o e-mail padrão do Free não manda convite,
-- o master cria a conta com a senha inicial (mesma receita do W0: INSERT em auth.users + auth.identities com crypt/bf; o
-- trigger `handle_new_user` cria o perfil nos 2 schemas). `auth.users` é COMPARTILHADO pelos 2 schemas: o claim, o ban e a
-- exclusão valem pros dois — por isso as RPCs que mexem em papel/acesso sincronizam public.profiles E staging.profiles.
--
-- 5 RPCs security definer, todas guardadas por `eh_master()` (erro 'sem_acesso'); códigos de erro curtos (a tela traduz):
--   sem_acesso · email_invalido · email_em_uso · senha_curta · nome_curto · papel_invalido · nao_encontrado · nao_pode_a_si_mesmo · tem_pacientes

alter table {schema}.profiles add column if not exists ativo boolean not null default true;

-- lista TODOS os perfis (nutricionistas e masters) com nº de pacientes e último acesso (auth.users.last_sign_in_at)
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
  ), '[]'::jsonb);
end;
$$;

-- cria a conta (nutricionista) com senha inicial; devolve o id. Sem convite por e-mail (Free recusa endereço de teste).
create or replace function {schema}.master_criar_profissional(p_email text, p_senha text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome text := trim(coalesce(p_nome, ''));
  v_id uuid := gen_random_uuid();
begin
  if not {schema}.eh_master() then raise exception 'sem_acesso'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalido'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  if length(v_nome) < 2 then raise exception 'nome_curto'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email_em_uso'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'nutricionista'),
    jsonb_build_object('full_name', v_nome), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  return v_id;
end;
$$;

-- promover/rebaixar: profiles.role nos 2 schemas + o claim (o afetado pega no próximo refresh do token). Nunca em si mesmo.
create or replace function {schema}.master_definir_papel(p_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
begin
  if not {schema}.eh_master() then raise exception 'sem_acesso'; end if;
  if p_role not in ('nutricionista', 'master') then raise exception 'papel_invalido'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, jsonb_build_object()) || jsonb_build_object('role', p_role),
         updated_at = now()
   where id = p_id;
  update public.profiles set role = p_role where id = p_id;
  update staging.profiles set role = p_role where id = p_id;
end;
$$;

-- desativar/reativar: profiles.ativo nos 2 schemas + banned_until (o GoTrue recusa o login do banido). Nunca em si mesmo.
-- (ban por 100 anos em vez de 'infinity': é o que a Admin API do Supabase grava e o GoTrue lê sem erro)
create or replace function {schema}.master_definir_acesso(p_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
begin
  if not {schema}.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  update auth.users
     set banned_until = case when p_ativo then null else now() + interval '100 years' end,
         updated_at = now()
   where id = p_id;
  update public.profiles set ativo = p_ativo where id = p_id;
  update staging.profiles set ativo = p_ativo where id = p_id;
end;
$$;

-- excluir: só com 0 pacientes (vivos OU na lixeira, em QUALQUER schema — pacientes.nutricionista_id cai por cascade) e nunca em si mesmo.
-- Apaga auth.users (cascade: identities, sessões e os perfis dos 2 schemas).
create or replace function {schema}.master_excluir_profissional(p_id uuid)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
begin
  if not {schema}.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  if exists (select 1 from public.pacientes where nutricionista_id = p_id)
     or exists (select 1 from staging.pacientes where nutricionista_id = p_id) then
    raise exception 'tem_pacientes';
  end if;
  delete from auth.users where id = p_id;
end;
$$;

-- os default privileges do projeto dão EXECUTE explícito ao anon em toda função nova → revogar dos dois (public E anon)
revoke all on function {schema}.master_profissionais() from public;
revoke all on function {schema}.master_profissionais() from anon;
grant execute on function {schema}.master_profissionais() to authenticated;

revoke all on function {schema}.master_criar_profissional(text, text, text) from public;
revoke all on function {schema}.master_criar_profissional(text, text, text) from anon;
grant execute on function {schema}.master_criar_profissional(text, text, text) to authenticated;

revoke all on function {schema}.master_definir_papel(uuid, text) from public;
revoke all on function {schema}.master_definir_papel(uuid, text) from anon;
grant execute on function {schema}.master_definir_papel(uuid, text) to authenticated;

revoke all on function {schema}.master_definir_acesso(uuid, boolean) from public;
revoke all on function {schema}.master_definir_acesso(uuid, boolean) from anon;
grant execute on function {schema}.master_definir_acesso(uuid, boolean) to authenticated;

revoke all on function {schema}.master_excluir_profissional(uuid) from public;
revoke all on function {schema}.master_excluir_profissional(uuid) from anon;
grant execute on function {schema}.master_excluir_profissional(uuid) to authenticated;
