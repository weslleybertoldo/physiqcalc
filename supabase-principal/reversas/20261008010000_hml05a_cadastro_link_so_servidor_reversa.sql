-- Reversa da 20261008010000_hml05a_cadastro_link_so_servidor.sql: devolve o EXECUTE de quem tem login (como era antes; o
-- visitante já não tinha).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public
grant execute on function {schema}.cadastro_link_enviar(text, jsonb) to authenticated;
