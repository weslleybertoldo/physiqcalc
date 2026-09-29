-- PhysiqNutri — W21 Respostas pré-consulta: colunas de IMPORTAÇÃO em `respostas_preconsulta`. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919200000_respostas_preconsulta_importacao.sql`
-- (roda em public E staging, trocando {schema}). Depende da W20 (respostas_preconsulta) e de pacientes (W1).
-- Sem RPC nova e sem mexer nas RPCs públicas da W20: vincular paciente (`paciente_id`), marcar importada e excluir soft são UPDATEs
-- da dona, já cobertos pelas policies de UPDATE/DELETE da W20 (nutricionista_id = auth.uid() ou master).

-- Só DOCUMENTA pra onde a resposta foi importada: `importada_tipo` = 'anamnese' (virou uma anamnese do paciente, W5) ou
-- 'questionario' (virou uma aplicação de questionário, W19); `importada_id` = id do registro criado; `importada_em` = quando.
-- Tudo NULL enquanto não importada. A importação exige paciente vinculado e acontece 1 vez por resposta.
alter table {schema}.respostas_preconsulta
  add column if not exists importada_em timestamptz,
  add column if not exists importada_tipo text,
  add column if not exists importada_id uuid;

alter table {schema}.respostas_preconsulta drop constraint if exists respostas_preconsulta_importada_tipo_check;
alter table {schema}.respostas_preconsulta add constraint respostas_preconsulta_importada_tipo_check
  check (importada_tipo is null or importada_tipo in ('anamnese', 'questionario'));

-- Lista por paciente (chip 'Paciente: …' e, no futuro, a área do paciente/W34).
create index if not exists respostas_preconsulta_paciente_idx on {schema}.respostas_preconsulta (paciente_id);
