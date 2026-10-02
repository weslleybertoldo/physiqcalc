-- Physiq W28 — Virada: o acesso do professor no BANCO DO TREINO (uxwpwdbbnlticxgtzcsb) passa a ser o do NÚCLEO (spec §8.2/§8.3):
-- `physiq_professor_acesso_ok(pid)` = status 'ativo' E `nucleo_acesso_ate` (o espelho do acesso da conta, que o banco principal
-- manda — inclui a tolerância de 7 dias do legado Calc) >= HOJE EM SÃO PAULO. As colunas de ciclo antigas do Calc (trial_ate,
-- adesao_paga_em, ciclo_vence_em, anual_ate, cobranca_pausada, acesso_liberado_ate) ficam, sem uso.
--
-- Mesmo instante nos 2 bancos (herdado da W4): antes o Treino comparava com current_date (UTC) e travava às 21:00 de São Paulo
-- do último dia, 3 h antes do painel; agora os 2 travam à meia-noite de São Paulo do dia seguinte ao último dia com acesso
-- (o `cobranca_hoje()` do principal = (now() at time zone 'America/Sao_Paulo')::date). Regra espelhada e testada em
-- supabase/functions/_shared/espelho/regras.ts (acessoProfessorOk) × src/nucleo/cobranca/regras.ts (travaDoPainel).
--
-- Aplicar SÓ no passo 5 da virada de cada schema (scripts/virada/roteiro.md), DEPOIS do 03 e do espelho chegar ao Treino:
--   set physiq.schemas = 'staging'; <este arquivo>     (ensaio)
--   set physiq.schemas = 'public';  <este arquivo>     (produção)
-- Sem o SET, roda nos 2. Idempotente.
-- Voltar atrás: a definição anterior está no fim deste arquivo (comentada) e no backup (funcoes-antes-treino.sql).

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %1$I.physiq_professor_acesso_ok(pid uuid)
       RETURNS boolean
       LANGUAGE sql
       STABLE SECURITY DEFINER
       SET search_path TO ''
      AS $body$
        SELECT COALESCE((
          SELECT p.status = 'ativo'
             AND p.nucleo_acesso_ate IS NOT NULL
             AND p.nucleo_acesso_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
            FROM %1$I.physiq_professores p WHERE p.id = pid), false)
      $body$
    $f$, sch);
    EXECUTE format('COMMENT ON FUNCTION %I.physiq_professor_acesso_ok(uuid) IS %L', sch,
      'W28: acesso do professor = status ativo + nucleo_acesso_ate (espelho do núcleo) >= hoje em São Paulo.');
  END LOOP;
END
$mig$;

-- Definição ANTERIOR (W2–W27), para voltar atrás no schema <s> (trocar <s> por public ou staging):
-- CREATE OR REPLACE FUNCTION <s>.physiq_professor_acesso_ok(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
--       SELECT COALESCE((
--         SELECT p.status = 'ativo' AND (
--                p.cobranca_pausada
--             OR p.acesso_liberado_ate >= current_date
--             OR p.trial_ate >= current_date
--             OR p.anual_ate >= current_date
--             OR (p.ciclo_vence_em + COALESCE((SELECT value::int FROM <s>.app_config WHERE key = 'tolerancia_dias'), 7)) >= current_date)
--         FROM <s>.physiq_professores p WHERE p.id = pid), false) $function$;
