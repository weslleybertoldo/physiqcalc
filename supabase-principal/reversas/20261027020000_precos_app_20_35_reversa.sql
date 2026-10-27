-- Reversa da Migration B do T2 do play-W6 (supabase-principal/migrations/20261027020000_precos_app_20_35.sql). Idempotente: roda com ou
-- sem a migration aplicada. Devolve os preços de antes do plano do app: Treino 20,00 → 29,90 · Treino + Alimentação 35,00 → 49,90 (os 2
-- planos da conta do app que estão no preço NOVO) + as matrículas ATIVAS da conta do app no preço novo do plano delas → o velho.
-- ⚠️ Não separa quem entrou DEPOIS da migration (já no preço novo) de quem a migration mudou: os 2 voltam ao velho (antes de rodar, conte as
-- matrículas novas desde a aplicação — SQL só leitura). O que já foi cobrado não muda (o histórico). Junto: o PLANOS_APP_PADRAO do app
-- (src/app-aluno/sozinho/regras.ts) volta ao 29,90/49,90 no revert do código, e o Play Console (as 2 assinaturas) volta à parte.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261027020000_precos_app_20_35_reversa.sql --so staging
--          (e --so public, se a B tiver ido ao public)

select set_config('lock_timeout', '5s', true);

update {schema}.planos_aluno pa
   set valor = 29.90
 where pa.conta_id = {schema}.conta_do_app() and pa.codigo = 'app_treino' and pa.valor = 20.00;
update {schema}.planos_aluno pa
   set valor = 49.90
 where pa.conta_id = {schema}.conta_do_app() and pa.codigo = 'app_treino_alimentacao' and pa.valor = 35.00;

update {schema}.pacientes p
   set mensalidade_valor = 29.90
  from {schema}.planos_aluno pa
 where pa.id = p.plano_aluno_id and pa.codigo = 'app_treino' and pa.conta_id = p.conta_id
   and p.conta_id = {schema}.conta_do_app() and p.ativo and p.deleted_at is null and p.mensalidade_valor = 20.00;
update {schema}.pacientes p
   set mensalidade_valor = 49.90
  from {schema}.planos_aluno pa
 where pa.id = p.plano_aluno_id and pa.codigo = 'app_treino_alimentacao' and pa.conta_id = p.conta_id
   and p.conta_id = {schema}.conta_do_app() and p.ativo and p.deleted_at is null and p.mensalidade_valor = 35.00;
