-- Homologação do Physiq — hml-10 (08/10/2026): ping do keep-alive sem tabela aberta ao visitante. Idempotente.
--
-- O keep-alive.yml (GitHub Actions) mantém o banco Free acordado com leituras pela API (PostgREST): o auto-pause conta
-- "user requests to the database". O ping lia public.alimentos com a chave pública; a hml-01 (H-10) tirou do visitante a
-- leitura das tabelas e o ping passou a dar 401 (08/10 01:02 UTC). No lugar: uma RPC que só devolve true — vai ao Postgres
-- como qualquer leitura, não lê nem grava dado e não abre tabela nenhuma. Só o visitante (anon) e a service_role executam.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261008100000_hml10_manter_ativo_reversa.sql

create or replace function {schema}.manter_ativo()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true $$;

comment on function {schema}.manter_ativo() is
  'Ping do keep-alive (.github/workflows/keep-alive.yml): atividade de banco pela API sem abrir tabela ao visitante. Não lê nem grava dado.';

revoke all on function {schema}.manter_ativo() from public, anon, authenticated;
grant execute on function {schema}.manter_ativo() to anon, service_role;
