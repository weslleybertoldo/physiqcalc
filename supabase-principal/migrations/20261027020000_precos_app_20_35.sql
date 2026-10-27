-- Physiq play-W6 · T2 (26/10/2026) — os preços do plano do app (o aluno sem profissional): Treino R$ 20,00 · Treino + Alimentação R$ 35,00.
-- Pedido do Weslley (26/10/2026 ~22:10): "Ajusta os valores dos planos também" → "20 reais individual" → "E 35 os dois". Valores literais
-- (não 19,90/34,90); valem no site e na Google Play (a regra de 22/10: o preço da Play igual ao do site — o Play Console muda à parte).
-- Banco principal, staging + public. Idempotente: só muda o que ainda está no preço VELHO (aplicar de novo não muda nada; um preço que o
-- master já tenha mudado à mão — W27 — fica).
--
-- O que muda:
--   planos_aluno (da CONTA DO APP)   app_treino 29,90 → 20,00 · app_treino_alimentacao 49,90 → 35,00 (os 2 planos de
--                                    20260929190000_w07b_sem_profissional.sql; o que vale é o banco — o app e os Termos leem daqui/do
--                                    PLANOS_APP_PADRAO, que acompanha).
--   pacientes.mensalidade_valor      as matrículas ATIVAS (ativo e não apagadas) da conta do app que estão no preço velho do plano DELAS →
--                                    o novo. O gatilho planos_aluno_propagar_valor PULA a conta do app (B2: lá a matrícula guarda o valor do
--                                    plano escolhido — 20261011010000_wp_planos_modalidades.sql), por isso o UPDATE explícito.
-- FICAM: as matrículas fora do preço velho (a de R$ 1,00 de teste), as inativas e as apagadas; os planos e as matrículas das OUTRAS contas
-- (o profissional, o master/B2B); as cobranças já feitas (o histórico); as automáticas do MP (nenhuma autorizada na conta do app em
-- 26/10/2026, conferido nos 2 schemas). A cobertura (mensalidade_pago_ate) não muda: o valor não entra na conta dela.
-- ⚠️ SEPARADA da 20261027010000 (a troca agendada): a A vai ao public já no T2 (aditiva, inerte com a trava play_billing desligada); ESTA
-- vai ao public SÓ no merge do PR #218 (T3) — antes disso, só --so staging.
-- A conferência do fim (desfaz tudo se algo sair diferente): nenhum plano da conta do app nem matrícula ativa dela no preço velho.
-- Aplicar (backup ANTES no public — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261027020000_precos_app_20_35.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261027020000_precos_app_20_35.sql --so staging
-- Testes: e2e/playw6/sql_t2.py --precos-foto <arq> antes e --precos-comparar <arq> depois (só leitura: os 2 planos, as ativas do preço velho
-- → o novo e SÓ elas, as outras contas iguais, a cobertura igual).
-- Reversa: supabase-principal/reversas/20261027020000_precos_app_20_35_reversa.sql.

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- 1. Os 2 planos da conta do app (só os que ainda estão no preço velho)
-- ============================================================================================================
update {schema}.planos_aluno pa
   set valor = 20.00
 where pa.conta_id = {schema}.conta_do_app() and pa.codigo = 'app_treino' and pa.valor = 29.90;
update {schema}.planos_aluno pa
   set valor = 35.00
 where pa.conta_id = {schema}.conta_do_app() and pa.codigo = 'app_treino_alimentacao' and pa.valor = 49.90;

-- ============================================================================================================
-- 2. As matrículas ATIVAS da conta do app no preço velho do plano delas → o novo (o gatilho de propagação pula a conta do app — B2)
-- ============================================================================================================
update {schema}.pacientes p
   set mensalidade_valor = 20.00
  from {schema}.planos_aluno pa
 where pa.id = p.plano_aluno_id and pa.codigo = 'app_treino' and pa.conta_id = p.conta_id
   and p.conta_id = {schema}.conta_do_app() and p.ativo and p.deleted_at is null and p.mensalidade_valor = 29.90;
update {schema}.pacientes p
   set mensalidade_valor = 35.00
  from {schema}.planos_aluno pa
 where pa.id = p.plano_aluno_id and pa.codigo = 'app_treino_alimentacao' and pa.conta_id = p.conta_id
   and p.conta_id = {schema}.conta_do_app() and p.ativo and p.deleted_at is null and p.mensalidade_valor = 49.90;

-- ============================================================================================================
-- 3. A conferência do fim (qualquer diferença desfaz a migration inteira)
-- ============================================================================================================
do $c$
begin
  if {schema}.conta_do_app() is null then
    raise exception 'precos T2: {schema} sem a conta do app';
  end if;
  if exists (select 1 from {schema}.planos_aluno pa where pa.conta_id = {schema}.conta_do_app()
                and ((pa.codigo = 'app_treino' and pa.valor = 29.90) or (pa.codigo = 'app_treino_alimentacao' and pa.valor = 49.90))) then
    raise exception 'precos T2: um plano da conta do app de {schema} ainda no preço velho';
  end if;
  if exists (select 1 from {schema}.pacientes p join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
              where p.conta_id = {schema}.conta_do_app() and p.ativo and p.deleted_at is null
                and ((pa.codigo = 'app_treino' and p.mensalidade_valor = 29.90)
                     or (pa.codigo = 'app_treino_alimentacao' and p.mensalidade_valor = 49.90))) then
    raise exception 'precos T2: uma matrícula ativa da conta do app de {schema} ainda no preço velho';
  end if;
end $c$;
