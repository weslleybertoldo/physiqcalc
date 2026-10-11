-- Reversa da hml-19d (supabase-principal/migrations/20261011120000_hml19d_financeiro_atomicas.sql). Idempotente: roda com ou sem a
-- migração aplicada. Saem as 3 funções novas (financeiro_garantir_padroes, financeiro_emitir_recibo, financeiro_excluir_recibo); nada mais
-- muda (a migração só criou as funções: tabelas, policies, gatilhos e dados ficaram como estavam — as sementes, os recibos e as
-- movimentações que elas já gravaram são linhas comuns das pessoas e FICAM).
--
-- ATENÇÃO — reverter o FRONT ANTES: o front da hml-19d (Painel › Financeiro e o Financeiro do aluno) pede as sementes, a emissão e a
-- exclusão do recibo à função financeiro, que chama estas RPCs; sem elas, essas 3 ações falham (a tela mostra o texto fixo do erro). O
-- front de antes (as gravações no navegador) funciona com ou sem elas.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

drop function if exists {schema}.financeiro_garantir_padroes(uuid, text[], jsonb);
drop function if exists {schema}.financeiro_emitir_recibo(jsonb);
drop function if exists {schema}.financeiro_excluir_recibo(uuid);

notify pgrst, 'reload schema';
