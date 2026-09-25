-- Avaliação do aluno por 3 dobras, 7 dobras ou bioimpedância + TMB da balança (25/09/2026):
--   metodo_avaliacao  'dobras_3' (J&P 3 dobras) | 'dobras_7' (J&P 7 dobras) | 'bioimpedancia'. NULL = registro
--                     antigo, lido como 'dobras_3'.
--   dobra_1..dobra_7  valores em mm. Em 3 dobras só dobra_1..3 (homem: peitoral, abdômen, coxa; mulher: tríceps,
--                     supra-ilíaca, coxa); em 7 dobras, na ordem peitoral, axilar média, tríceps, subescapular,
--                     abdômen, supra-ilíaca, coxa. Bioimpedância não usa dobra.
--   massa_muscular (kg), agua_corporal (%), gordura_visceral (nível) e tmb_balanca (kcal): o que a balança mostra.
--                     Na bioimpedância o percentual_gordura é o da balança.
--   tmb_metodo        TMB escolhida pelo professor: 'mifflin' | 'katch' | 'balanca' (esta só na bioimpedância). Em
--                     physiq_avaliacoes guarda a escolha de cada avaliação.
-- Idempotente; roda em public (prod) e staging. Sync rule do PowerSync em physiq_profiles é SELECT * → sem mudança.
DO $$
DECLARE
  s text;
  t text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      CONTINUE;
    END IF;

    FOREACH t IN ARRAY ARRAY['physiq_profiles', 'physiq_avaliacoes'] LOOP
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS metodo_avaliacao text', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS dobra_4 numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS dobra_5 numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS dobra_6 numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS dobra_7 numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS massa_muscular numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS agua_corporal numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS gordura_visceral numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tmb_balanca numeric', s, t);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tmb_metodo text', s, t);

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_metodo_avaliacao_check'
                     AND connamespace = s::regnamespace) THEN
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I
                          CHECK (metodo_avaliacao IN (''dobras_3'', ''dobras_7'', ''bioimpedancia''))',
                       s, t, t || '_metodo_avaliacao_check');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_tmb_metodo_check'
                     AND connamespace = s::regnamespace) THEN
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I
                          CHECK (tmb_metodo IN (''mifflin'', ''katch'', ''balanca''))',
                       s, t, t || '_tmb_metodo_check');
      END IF;
    END LOOP;
  END LOOP;
END $$;
