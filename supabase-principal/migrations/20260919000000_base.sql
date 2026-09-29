-- PhysiqNutri — migration base (W0). Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919000000_base.sql`:
--   o script roda o bloco abaixo 2x (schema public e schema staging, trocando {schema})
--   e o bloco "@@ compartilhado" 1x.

create schema if not exists {schema};
grant usage on schema {schema} to anon, authenticated, service_role;
alter default privileges in schema {schema} grant all on tables to anon, authenticated, service_role;
alter default privileges in schema {schema} grant all on routines to anon, authenticated, service_role;
alter default privileges in schema {schema} grant all on sequences to anon, authenticated, service_role;

-- master = claim app_metadata.role no JWT (gravado por handle_new_user / ajustado à mão)
create or replace function {schema}.eh_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false);
$$;

create table if not exists {schema}.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  role text not null default 'nutricionista' check (role in ('nutricionista', 'master')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on {schema}.profiles to anon, authenticated, service_role;
alter table {schema}.profiles enable row level security;

drop policy if exists "perfil: ler o proprio ou master" on {schema}.profiles;
create policy "perfil: ler o proprio ou master" on {schema}.profiles
  for select to authenticated using (auth.uid() = id or {schema}.eh_master());

drop policy if exists "perfil: editar o proprio" on {schema}.profiles;
create policy "perfil: editar o proprio" on {schema}.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id and role = (select p.role from {schema}.profiles p where p.id = auth.uid()));

drop policy if exists "perfil: master edita todos" on {schema}.profiles;
create policy "perfil: master edita todos" on {schema}.profiles
  for all to authenticated using ({schema}.eh_master()) with check ({schema}.eh_master());

-- updated_at automático
create or replace function {schema}.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_profiles_updated_at on {schema}.profiles;
create trigger trg_profiles_updated_at before update on {schema}.profiles
  for each row execute function {schema}.set_updated_at();

-- @@ compartilhado
-- (roda 1x): novo usuário do Auth → perfil em public E staging + claim role padrão
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'nutricionista');
  v_nome text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nome');
begin
  insert into public.profiles (id, nome, email, role) values (new.id, v_nome, new.email, v_role)
    on conflict (id) do nothing;
  insert into staging.profiles (id, nome, email, role) values (new.id, v_nome, new.email, v_role)
    on conflict (id) do nothing;
  if new.raw_app_meta_data ->> 'role' is null then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role)
      where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
