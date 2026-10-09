-- Reversa da hml-14b (supabase-principal/migrations/20261009010000_hml14b_financeiro_resumo_periodo.sql): tira as 4 funções novas
-- do Financeiro (nenhuma existia antes; nada mais muda). O front da hml-14b chama financeiro_resumo_periodo, financeiro_lancamentos
-- e financeiro_recibos: voltar o front (Vercel) ANTES — senão Lançamentos, Recibos, o Resumo e o Dashboard mostram o erro.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public [--dry-run]

drop function if exists {schema}.financeiro_recibos(uuid, jsonb, integer, integer);
drop function if exists {schema}.financeiro_lancamentos(uuid, date, date, jsonb, integer, integer);
drop function if exists {schema}.financeiro_resumo_periodo(uuid, date, date, jsonb);
drop function if exists {schema}.financeiro_transacoes_visiveis(uuid, date, date, jsonb, uuid, boolean, boolean);
