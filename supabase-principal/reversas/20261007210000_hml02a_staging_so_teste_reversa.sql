-- REVERSA da 20261007210000_hml02a_staging_so_teste.sql (hml-02, 07/10/2026): volta as 12 funções ao corpo de ANTES
-- (gerado de pg_get_functiondef no banco vivo, antes de aplicar) e tira a função nova (staging.exigir_conta_de_teste; a staging.email_de_teste é da W5 e fica). As cópias reais do
-- staging.profiles que a migration apaga voltam do backup (~/backups/physiq/2026-10-07-hml02/ no notebook).
-- Aplicar como bloco compartilhado (nomes explícitos): python3 scripts/apply_migration_principal.py <este arquivo> --compartilhado
select 1;

-- @@ compartilhado
CREATE OR REPLACE FUNCTION staging.eh_master()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false);
$function$;

CREATE OR REPLACE FUNCTION staging.master_criar_profissional(p_email text, p_senha text, p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome text := trim(coalesce(p_nome, ''));
  v_id uuid := gen_random_uuid();
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION staging.master_definir_acesso(p_id uuid, p_ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  update auth.users
     set banned_until = case when p_ativo then null else now() + interval '100 years' end,
         updated_at = now()
   where id = p_id;
  update public.profiles set ativo = p_ativo where id = p_id;
  update staging.profiles set ativo = p_ativo where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION staging.master_definir_papel(p_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION staging.master_excluir_profissional(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  if exists (select 1 from public.pacientes where nutricionista_id = p_id)
     or exists (select 1 from staging.pacientes where nutricionista_id = p_id) then
    raise exception 'tem_pacientes';
  end if;
  delete from auth.users where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION staging.master_tornar_master(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not staging.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_user is null or p_user = auth.uid() then return jsonb_build_object('ok', false, 'erro', 'nao_pode_a_si_mesmo'); end if;
  if not exists (select 1 from auth.users where id = p_user) then return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente'); end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'master'), updated_at = now()
   where id = p_user;
  update staging.profiles set role = 'master' where id = p_user;
  insert into staging.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', p_user));
  perform staging.espelho_disparar();
  return jsonb_build_object('ok', true, 'user_id', p_user, 'master', true);
end;
$function$;

CREATE OR REPLACE FUNCTION staging.paciente_criar_acesso(p_paciente_id uuid, p_email text, p_senha text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
declare
  v_pac staging.pacientes%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid := gen_random_uuid();
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not staging.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is not null then raise exception 'ja_tem_acesso'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalido'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email_em_uso'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'paciente', 'senha_provisoria', true),
    jsonb_build_object('full_name', v_pac.nome), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  update staging.pacientes set user_id = v_id where id = p_paciente_id;
  delete from staging.login_bloqueios where email = v_email;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION staging.paciente_definir_acesso(p_paciente_id uuid, p_ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
declare
  v_pac staging.pacientes%rowtype;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not coalesce(staging.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  update auth.users
     set banned_until = case when p_ativo then null else now() + interval '100 years' end, updated_at = now()
   where id = v_pac.user_id;
  update public.profiles set ativo = p_ativo where id = v_pac.user_id;
  update staging.profiles set ativo = p_ativo where id = v_pac.user_id;
  if not p_ativo then delete from auth.sessions where user_id = v_pac.user_id; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION staging.paciente_redefinir_senha(p_paciente_id uuid, p_senha text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
declare
  v_pac staging.pacientes%rowtype;
  v_email text;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not staging.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('senha_provisoria', true),
         updated_at = now()
   where id = v_pac.user_id
  returning lower(email) into v_email;
  delete from auth.sessions where user_id = v_pac.user_id;
  delete from staging.login_bloqueios where email = v_email;
end;
$function$;

CREATE OR REPLACE FUNCTION staging.paciente_remover_acesso(p_paciente_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
declare
  v_pac staging.pacientes%rowtype;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not coalesce(staging.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  delete from auth.users where id = v_pac.user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta text := new.raw_app_meta_data ->> 'role';
  v_role text := case when v_meta in ('paciente', 'master', 'nutricionista') then v_meta else 'pessoa' end;
  v_nome text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nome');
  v_teste timestamptz := case when v_role = 'pessoa' then now() else now() + interval '14 days' end;
begin
  insert into public.profiles (id, nome, email, role, teste_ate) values (new.id, v_nome, new.email, v_role, v_teste)
    on conflict (id) do nothing;
  insert into staging.profiles (id, nome, email, role, teste_ate) values (new.id, v_nome, new.email, v_role, v_teste)
    on conflict (id) do nothing;
  -- como hoje: sem papel definido pelo servidor, grava o papel padrão no JWT (agora 'pessoa', não mais 'nutricionista')
  if v_meta is null then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role)
      where id = new.id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_papel_do_jwt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('paciente', 'master', 'nutricionista') then
    update public.profiles set role = v_role where id = new.id and role = 'pessoa';
    update staging.profiles set role = v_role where id = new.id and role = 'pessoa';
  end if;
  return new;
end;
$function$;

drop function if exists staging.exigir_conta_de_teste(uuid);
