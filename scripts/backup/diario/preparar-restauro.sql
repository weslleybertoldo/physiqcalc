-- Prepara um Postgres VAZIO (fora do Supabase) para receber a cópia de segurança do Physiq — o ensaio diário do
-- copia.sh e a restauração de emergência num Postgres comum (hml-07, homologação 08/10/2026). Cria o que o schema
-- copiado cita e o Supabase já traz: os papéis das permissões e das políticas, as extensões no schema `extensions`
-- (o principal tem índice com extensions.gin_trgm_ops) e um `auth` mínimo — as políticas chamam auth.uid()/auth.jwt()
-- e quase toda tabela aponta para auth.users. Os logins entram inteiros na coluna `dados`.
-- Num projeto Supabase NOVO nada disto roda: lá o auth, as extensões e os papéis já existem (docs/backup.md).
do $$
declare
  p text;
begin
  foreach p in array array['anon', 'authenticated', 'service_role', 'physiq_backup'] loop
    if not exists (select 1 from pg_roles where rolname = p) then
      execute format('create role %I nologin', p);
    end if;
  end loop;
end
$$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, dados jsonb not null);
create table if not exists auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dados jsonb not null
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.email() returns text
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
