-- Reversa da hml-14b (supabase-principal/migrations/20261009040000_hml14b_respostas_receitas_paginadas.sql). Idempotente: roda com
-- ou sem a migração aplicada. As 2 funções eram NOVAS (nada de antes mudou): saem respostas_da_conta e receitas_da_nutricionista.
-- No staging, o front da hml-14b chama as 2: reverter o front junto (a tela antiga lê as tabelas direto).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.respostas_da_conta(uuid, jsonb, integer, integer);
drop function if exists {schema}.receitas_da_nutricionista(jsonb, integer, integer);

notify pgrst, 'reload schema';
