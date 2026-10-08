-- Homologação do Physiq — hml-07 no BANCO PRINCIPAL (Supabase hkxvtsbwctxkrqzkkdoz) — H-21 (08/10/2026).
-- Papel SÓ DE LEITURA da cópia de segurança diária (scripts/backup/diario/copia.sh, timer no notebook; docs/backup.md).
-- Idempotente. Nenhum dado muda.
-- BYPASSRLS porque o pg_dump desliga a RLS e para em tabela com política (as 84 têm); só USAGE/SELECT (nada grava) e
-- as sessões nascem só leitura. A senha NÃO fica aqui: é posta 1 vez pela Management API como verificador SCRAM e mora
-- no cofre + no ~/.config/physiq-backup/pgpass do notebook. O papel é do banco inteiro: a 1ª rodada (staging) cria o
-- papel, o schema `backup` e as funções dos logins; cada rodada dá a leitura do próprio schema.
-- Logins: o postgres lê o schema auth mas não pode repassar o acesso (o dono é o supabase_auth_admin). As 2 funções
-- (dono postgres, security definer, schema fora da API) entregam as linhas inteiras de auth.users e auth.identities em
-- jsonb só para o backup — sessões e tokens ficam de fora. A restauração usa jsonb_populate_record.
-- Reversa: supabase-principal/reversas/20261008050000_hml07_papel_backup_reversa.sql
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'physiq_backup') then
    create role physiq_backup nologin bypassrls connection limit 3;
  end if;
end
$$;
alter role physiq_backup set default_transaction_read_only = on;
alter role physiq_backup set statement_timeout = '15min';
alter role physiq_backup set idle_in_transaction_session_timeout = '15min';

grant usage on schema {schema} to physiq_backup;
grant select on all tables in schema {schema} to physiq_backup;
grant select on all sequences in schema {schema} to physiq_backup;
-- tabela e sequência novas (as migrations rodam como postgres) já nascem legíveis para o backup
alter default privileges for role postgres in schema {schema} grant select on tables to physiq_backup;
alter default privileges for role postgres in schema {schema} grant select on sequences to physiq_backup;

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
