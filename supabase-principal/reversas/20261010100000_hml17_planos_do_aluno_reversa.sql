-- Reversa da hml-17 (supabase-principal/migrations/20261010100000_hml17_planos_do_aluno.sql). Idempotente: roda com ou sem a
-- migração aplicada. Saem as 4 funções novas (planos_do_aluno, plano_alimentar, planos_favoritos e a interna plano_alimentar_json);
-- nada mais muda (a migração só criou funções: tabelas, policies e dados ficaram como estavam).
--
-- ATENÇÃO — reverter o FRONT ANTES: o front da hml-17 (src/nutricao/editor/lib/planos.ts e src/ferramentas/modelos/dados.ts) lê o
-- plano por estas funções; sem elas, a Dieta do aluno, o card do Resumo, o "Usar um modelo ★" e a Ferramentas › Modelos abrem com
-- erro. O front de antes (o embed direto nas tabelas) funciona com ou sem elas.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

drop function if exists {schema}.planos_do_aluno(uuid);
drop function if exists {schema}.plano_alimentar(uuid);
drop function if exists {schema}.planos_favoritos();
drop function if exists {schema}.plano_alimentar_json(uuid);

notify pgrst, 'reload schema';
