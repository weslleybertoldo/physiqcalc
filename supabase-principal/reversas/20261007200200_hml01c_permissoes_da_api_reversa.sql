-- Reversa da 20261007200200_hml01c_permissoes_da_api.sql: devolve os privilégios de antes (anon com tudo nas tabelas e
-- sequências; authenticated com TRUNCATE/TRIGGER/REFERENCES/MAINTAIN) e os default privileges do postgres.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public
grant all on all tables in schema {schema} to anon;
grant all on all sequences in schema {schema} to anon;
grant truncate, trigger, references, maintain on all tables in schema {schema} to authenticated;
alter default privileges for role postgres in schema {schema} grant all on tables to anon;
alter default privileges for role postgres in schema {schema} grant all on sequences to anon;
alter default privileges for role postgres in schema {schema} grant truncate, trigger, references, maintain on tables to authenticated;
