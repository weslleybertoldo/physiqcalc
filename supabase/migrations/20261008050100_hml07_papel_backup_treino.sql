-- Homologação do Physiq — hml-07 no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) — H-21 (08/10/2026).
-- Papel SÓ DE LEITURA da cópia de segurança diária (scripts/backup/diario/copia.sh, timer no notebook; docs/backup.md).
-- Idempotente. Nenhum dado muda. Mesmo desenho do principal (supabase-principal/migrations/20261008050000_*): BYPASSRLS
-- porque o pg_dump desliga a RLS (as 45 tabelas têm política), só USAGE/SELECT, sessões só leitura; a senha é posta à
-- parte (verificador SCRAM pela Management API) e mora no cofre + no pgpass do notebook. Logins pelas funções backup.*.
-- Roda 1x por ambiente: set physiq.schemas = 'staging' (cria o papel e dá a leitura do staging) e depois 'public'.
-- Reversa: supabase/reversas/20261008050100_hml07_papel_backup_treino_reversa.sql
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'physiq_backup') then
    create role physiq_backup nologin bypassrls connection limit 3;
  end if;
  execute format('grant usage on schema %I to physiq_backup', v_amb);
  execute format('grant select on all tables in schema %I to physiq_backup', v_amb);
  execute format('grant select on all sequences in schema %I to physiq_backup', v_amb);
  -- tabela e sequência novas (as migrations rodam como postgres) já nascem legíveis para o backup
  execute format('alter default privileges for role postgres in schema %I grant select on tables to physiq_backup', v_amb);
  execute format('alter default privileges for role postgres in schema %I grant select on sequences to physiq_backup', v_amb);
end
$$;
alter role physiq_backup set default_transaction_read_only = on;
alter role physiq_backup set statement_timeout = '15min';
alter role physiq_backup set idle_in_transaction_session_timeout = '15min';

create schema if not exists backup;
revoke all on schema backup from public;
grant usage on schema backup to physiq_backup;

create or replace function backup.logins_usuarios() returns setof jsonb
  language sql stable security definer set search_path = ''
as $$ select to_jsonb(u) from auth.users u order by u.created_at, u.id $$;

create or replace function backup.logins_identidades() returns setof jsonb
  language sql stable security definer set search_path = ''
as $$ select to_jsonb(i) from auth.identities i order by i.created_at, i.id $$;

revoke all on function backup.logins_usuarios() from public, anon, authenticated, service_role;
revoke all on function backup.logins_identidades() from public, anon, authenticated, service_role;
grant execute on function backup.logins_usuarios() to physiq_backup;
grant execute on function backup.logins_identidades() to physiq_backup;
