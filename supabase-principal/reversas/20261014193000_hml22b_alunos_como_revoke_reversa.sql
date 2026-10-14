-- Reversa da 20261014193000_hml22b_alunos_como_revoke.sql: devolve o EXECUTE da alunos_como ao authenticated, como era antes da hml-22b
-- (public e anon já não tinham; o service_role segue). Idempotente. Reabre o H-147: só numa emergência, com o OK do Weslley.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public

grant execute on function {schema}.alunos_como(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
