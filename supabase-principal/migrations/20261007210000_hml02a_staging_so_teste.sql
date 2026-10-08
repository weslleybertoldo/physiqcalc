-- Homologação do Physiq — hml-02 / H-04 e H-05 (07/10/2026). Idempotente.
--
-- O Auth do banco principal é um só para os 2 schemas: o que o schema staging grava em auth.users (papel no JWT, ban, senha,
-- login novo, exclusão) vale na produção, e o cadastro copiava todo mundo para staging.profiles. Daqui em diante:
--   H-04  no staging, o papel master fica SÓ em staging.profiles: staging.eh_master() passa a ler também o perfil do staging
--         (como o sou_master), e master_tornar_master / master_definir_papel do staging não tocam mais o claim global;
--   H-05  as funções do staging não gravam em public.*, e mexer num login pelo staging (criar, banir, trocar a senha, apagar)
--         só vale para conta de TESTE (a mesma regra do emailDeTeste das Edge Functions → 'conta_real_no_staging');
--         o cadastro só copia para staging.profiles quem é conta de teste, e as cópias reais saem do staging.
-- O bloco "por schema" usa nomes explícitos staging.* (sem o marcador de schema): é o ambiente de teste. O bloco compartilhado
-- é a produção (gatilhos do auth.users e a limpeza das cópias reais).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --compartilhado [--dry-run]   (produção; backup antes)
--          (rodar com --so public só repete o bloco do staging, sem mudar nada)
-- Reversa: supabase-principal/reversas/20261007210000_hml02a_staging_so_teste_reversa.sql (as cópias apagadas voltam do backup).

-- 1. conta de teste: staging.email_de_teste (W5, a mesma regra do emailDeTeste das Edge Functions) já existe e fica como
--    está; aqui só a trava por login
create or replace function staging.exigir_conta_de_teste(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users u where u.id = p_user and not staging.email_de_teste(u.email)) then
    raise exception 'conta_real_no_staging';
  end if;
end;
$$;

revoke all on function staging.exigir_conta_de_teste(uuid) from public, anon, authenticated;
grant execute on function staging.exigir_conta_de_teste(uuid) to service_role;

-- 2. master do staging: o claim (global) OU o perfil master do staging — o master de teste não precisa mais do claim
create or replace function staging.eh_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false)
      or exists (select 1 from staging.profiles pr where pr.id = auth.uid() and pr.role = 'master');
$$;

-- 3. as funções do staging que mexem em login ou em public (o corpo de antes + a trava)
create or replace function staging.master_criar_profissional(p_email text, p_senha text, p_nome text) returns uuid
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome text := trim(coalesce(p_nome, ''));
  v_id uuid := gen_random_uuid();
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalido'; end if;
  if not staging.email_de_teste(v_email) then raise exception 'conta_real_no_staging'; end if;
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
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  return v_id;
end;
$$;

create or replace function staging.master_definir_papel(p_id uuid, p_role text) returns void
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if p_role not in ('nutricionista', 'master') then raise exception 'papel_invalido'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  perform staging.exigir_conta_de_teste(p_id);
  -- o papel do staging fica só no perfil do staging (o claim do JWT é global: valeria na produção)
  update staging.profiles set role = p_role where id = p_id;
end;
$$;

create or replace function staging.master_definir_acesso(p_id uuid, p_ativo boolean) returns void
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  perform staging.exigir_conta_de_teste(p_id);
  update auth.users set banned_until = case when p_ativo then null else now() + interval '100 years' end, updated_at = now()
   where id = p_id;
  update staging.profiles set ativo = p_ativo where id = p_id;
end;
$$;

create or replace function staging.master_excluir_profissional(p_id uuid) returns void
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  perform staging.exigir_conta_de_teste(p_id);
  if exists (select 1 from public.pacientes where nutricionista_id = p_id)
     or exists (select 1 from staging.pacientes where nutricionista_id = p_id) then
    raise exception 'tem_pacientes';
  end if;
  delete from auth.users where id = p_id;
end;
$$;

create or replace function staging.master_tornar_master(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not staging.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_user is null or p_user = auth.uid() then return jsonb_build_object('ok', false, 'erro', 'nao_pode_a_si_mesmo'); end if;
  if not exists (select 1 from auth.users where id = p_user) then return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente'); end if;
  if exists (select 1 from auth.users u where u.id = p_user and not staging.email_de_teste(u.email)) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  -- o master do staging fica só no perfil do staging (o claim do JWT é global: valeria na produção)
  update staging.profiles set role = 'master' where id = p_user;
  insert into staging.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', p_user));
  perform staging.espelho_disparar();
  return jsonb_build_object('ok', true, 'user_id', p_user, 'master', true);
end;
$$;

create or replace function staging.paciente_criar_acesso(p_paciente_id uuid, p_email text, p_senha text) returns uuid
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
declare
  v_pac staging.pacientes%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid := gen_random_uuid();
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not staging.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is not null then raise exception 'ja_tem_acesso'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalido'; end if;
  if not staging.email_de_teste(v_email) then raise exception 'conta_real_no_staging'; end if;
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
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  update staging.pacientes set user_id = v_id where id = p_paciente_id;
  delete from staging.login_bloqueios where email = v_email;
  return v_id;
end;
$$;

create or replace function staging.paciente_definir_acesso(p_paciente_id uuid, p_ativo boolean) returns void
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
declare
  v_pac staging.pacientes%rowtype;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not coalesce(staging.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  perform staging.exigir_conta_de_teste(v_pac.user_id);
  update auth.users set banned_until = case when p_ativo then null else now() + interval '100 years' end, updated_at = now()
   where id = v_pac.user_id;
  update staging.profiles set ativo = p_ativo where id = v_pac.user_id;
  if not p_ativo then delete from auth.sessions where user_id = v_pac.user_id; end if;
end;
$$;

create or replace function staging.paciente_redefinir_senha(p_paciente_id uuid, p_senha text) returns void
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
declare
  v_pac staging.pacientes%rowtype;
  v_email text;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not staging.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  perform staging.exigir_conta_de_teste(v_pac.user_id);
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('senha_provisoria', true),
         updated_at = now()
   where id = v_pac.user_id returning lower(email) into v_email;
  delete from auth.sessions where user_id = v_pac.user_id;
  delete from staging.login_bloqueios where email = v_email;
end;
$$;

create or replace function staging.paciente_remover_acesso(p_paciente_id uuid) returns void
language plpgsql volatile security definer set search_path = staging, public, extensions as $$
declare
  v_pac staging.pacientes%rowtype;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not coalesce(staging.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  perform staging.exigir_conta_de_teste(v_pac.user_id);
  delete from auth.users where id = v_pac.user_id;
end;
$$;

-- @@ compartilhado
-- (roda 1x; usa a staging.email_de_teste da W5) ------------------------------------------------------------------------------

-- 4. cadastro: staging.profiles só para conta de teste (o staging não guarda mais nome, e-mail e papel de gente real)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta text := new.raw_app_meta_data ->> 'role';
  v_role text := case when v_meta in ('paciente', 'master', 'nutricionista') then v_meta else 'pessoa' end;
  v_nome text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nome');
  v_teste timestamptz := case when v_role = 'pessoa' then now() else now() + interval '14 days' end;
begin
  insert into public.profiles (id, nome, email, role, teste_ate) values (new.id, v_nome, new.email, v_role, v_teste)
    on conflict (id) do nothing;
  if staging.email_de_teste(new.email) then
    insert into staging.profiles (id, nome, email, role, teste_ate) values (new.id, v_nome, new.email, v_role, v_teste)
      on conflict (id) do nothing;
  end if;
  -- como hoje: sem papel definido pelo servidor, grava o papel padrão no JWT (agora 'pessoa', não mais 'nutricionista')
  if v_meta is null then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role)
      where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sincronizar_papel_do_jwt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('paciente', 'master', 'nutricionista') then
    update public.profiles set role = v_role where id = new.id and role = 'pessoa';
    if staging.email_de_teste(new.email) then
      update staging.profiles set role = v_role where id = new.id and role = 'pessoa';
    end if;
  end if;
  return new;
end;
$$;

-- 5. as cópias reais saem do staging (cascata só em staging.assinaturas e staging.pagamentos_assinatura dessas contas)
delete from staging.profiles p
 using auth.users u
 where u.id = p.id and not staging.email_de_teste(u.email);
