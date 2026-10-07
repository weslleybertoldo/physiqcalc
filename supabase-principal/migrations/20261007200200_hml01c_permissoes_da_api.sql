-- Homologação do Physiq — hml-01 / H-10 (07/10/2026). Idempotente. Nenhum dado muda.
-- Permissões da API no tamanho do uso:
--   · anon (visitante): nenhuma policy de tabela o atende no principal — o visitante usa só funções (cadastro pelo link, diário,
--     pré-consulta) e o Storage (diário) → sem privilégio em tabela nem sequência;
--   · authenticated: perde TRUNCATE (não passa pelo RLS), TRIGGER, REFERENCES e MAINTAIN — o app só lê e grava linhas;
--   · as tabelas e sequências novas deste schema nascem assim (default privileges do postgres, que é quem roda as migrations).
--     Tabela nova que o visitante precise ler: GRANT SELECT explícito na migration dela.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging (depois --so public, com backup).

revoke all on all tables in schema {schema} from anon;
revoke all on all sequences in schema {schema} from anon;
revoke truncate, trigger, references, maintain on all tables in schema {schema} from authenticated;

alter default privileges for role postgres in schema {schema} revoke all on tables from anon;
alter default privileges for role postgres in schema {schema} revoke all on sequences from anon;
alter default privileges for role postgres in schema {schema} revoke truncate, trigger, references, maintain on tables from authenticated;
