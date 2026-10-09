-- Reversa da hml-14d (supabase-principal/migrations/20261009070000_hml14d_preconsulta_numeros.sql). Idempotente: roda com ou sem a
-- migração aplicada. A migração só CRIOU a preconsulta_numeros (nenhuma função de hoje mudou): a reversa só a apaga.
-- No staging, o front da hml-14d lê os números da Pré-consulta por ela: reverter o front junto (a tela antiga lê até 1000 respostas).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.preconsulta_numeros(uuid, timestamptz, timestamptz);

notify pgrst, 'reload schema';
