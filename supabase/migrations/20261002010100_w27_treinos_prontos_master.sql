-- Physiq W27 — o master edita os TREINOS PRONTOS do aluno sem profissional pela tela (/master/app-do-aluno) no BANCO DO TREINO
-- (uxwpwdbbnlticxgtzcsb). Herdado da W7b: hoje só pela carga scripts/conteudo/treinos_prontos.json + carregar_treinos_prontos.py;
-- a tela grava NO MESMO LUGAR (physiq_treinos_prontos / _grupos / _exercicios) e o JSON segue valendo para recarregar.
-- Idempotente. SÓ ACRESCENTA política e GRANT (nenhum dado muda): o master (physiq_is_master(), o papel do JWT do Treino que o
-- espelho dá a quem é master no principal) lê tudo (inclusive os inativos) e escreve; o aluno continua lendo só os ativos.
--
-- Aplica em public e staging (bloco DO, padrão do repo). Um schema de cada vez, na MESMA chamada:
--   set physiq.schemas = 'staging'; <este arquivo>
-- Sem o SET, roda nos 2.

DO $mig$
DECLARE
  sch text;
  tbl text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;
    FOREACH tbl IN ARRAY ARRAY['physiq_treinos_prontos', 'physiq_treinos_prontos_grupos', 'physiq_treinos_prontos_exercicios'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS "treinos prontos: master tudo" ON %I.%I', sch, tbl);
      EXECUTE format('CREATE POLICY "treinos prontos: master tudo" ON %1$I.%2$I FOR ALL TO authenticated USING (%1$I.physiq_is_master()) WITH CHECK (%1$I.physiq_is_master())', sch, tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO authenticated', sch, tbl);
    END LOOP;
  END LOOP;
END $mig$;
