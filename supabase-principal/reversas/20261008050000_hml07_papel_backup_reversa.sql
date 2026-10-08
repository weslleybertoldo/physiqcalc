-- Reversa da hml-07 no BANCO PRINCIPAL: tira a leitura de cada schema e, no bloco compartilhado (depois dos 2 schemas),
-- apaga as funções dos logins, o schema `backup` e o papel physiq_backup. A rotina do notebook passa a falhar (aviso 🔴):
-- parar antes os timers (scripts/backup/diario/instalar.sh --desinstalar).
alter default privileges for role postgres in schema {schema} revoke select on tables from physiq_backup;
alter default privileges for role postgres in schema {schema} revoke select on sequences from physiq_backup;
revoke select on all tables in schema {schema} from physiq_backup;
revoke select on all sequences in schema {schema} from physiq_backup;
revoke usage on schema {schema} from physiq_backup;
-- @@ compartilhado
drop function if exists backup.logins_usuarios();
drop function if exists backup.logins_identidades();
drop schema if exists backup;
drop role if exists physiq_backup;
