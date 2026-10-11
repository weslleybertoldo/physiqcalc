-- Reversa da hml-19b (supabase-principal/migrations/20261011110000_hml19b_dieta_atomicas.sql). Idempotente: roda com ou sem a
-- migração aplicada. Saem as 7 funções novas (dieta_*); nada mais muda (a migração só criou funções: tabelas, policies e dados ficaram
-- como estavam — o que elas já gravaram são linhas comuns das pessoas e FICAM).
--
-- ATENÇÃO — reverter o FRONT ANTES: o front da hml-19b (Dieta e Dietas) pede à função nutricao a nova prescrição, o duplicar/usar
-- modelo ★, a receita, o alimento, o subir/descer, o excluir grupo e o "copiar pra semana toda", e a função chama estas RPCs; sem elas,
-- essas ações dão erro na tela (o resto da Dieta segue, pelo CRUD da função). O front de antes (gravação direta) funciona com ou sem elas.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

drop function if exists {schema}.dieta_criar_plano(uuid, jsonb, jsonb);
drop function if exists {schema}.dieta_duplicar_plano(uuid, text, uuid);
drop function if exists {schema}.dieta_salvar_receita(jsonb, jsonb);
drop function if exists {schema}.dieta_salvar_alimento(jsonb, jsonb);
drop function if exists {schema}.dieta_ordenar(text, uuid[], integer[]);
drop function if exists {schema}.dieta_excluir_grupo_receita(uuid);
drop function if exists {schema}.dieta_copiar_semana(uuid[], uuid[]);

notify pgrst, 'reload schema';
