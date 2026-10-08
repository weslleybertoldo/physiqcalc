-- Reversa da hml-10 (supabase-principal/migrations/20261008100000_hml10_manter_ativo.sql): tira a RPC do keep-alive.
-- Depois dela o ping REST do keep-alive.yml volta a dar 404 — reverter o workflow junto.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public [--dry-run]

drop function if exists {schema}.manter_ativo();
