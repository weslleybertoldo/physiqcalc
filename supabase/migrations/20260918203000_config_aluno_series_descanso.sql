-- Aba "Configuração" do aluno no painel do professor (18/09/2026):
--   series_modo        'padrao' = 1 nº pra todos os exercícios (series_padrao_qtd) | 'personalizada' = ajuste por
--                      exercício na aba Treino (tb_series_padrao_usuario). Informativo: o efetivo é sempre
--                      linha do exercício > geral do treino > series_padrao_qtd.
--   series_padrao_qtd  nº de séries que vale quando não há linha em tb_series_padrao_usuario (antes: 3 fixo no app).
--   series_travadas    true = o aluno não adiciona nem remove série no app (cadeado do professor).
--   tempo_descanso_segundos JÁ existe (default 120) — o app passa a ler daqui em vez do 120 fixo.
-- Idempotente; roda em public (prod) e staging. Sync rule do PowerSync em physiq_profiles é SELECT * → sem mudança.
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS series_modo text NOT NULL DEFAULT ''padrao''', s);
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS series_padrao_qtd integer NOT NULL DEFAULT 3', s);
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS series_travadas boolean NOT NULL DEFAULT false', s);

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'physiq_profiles_series_modo_check'
                   AND connamespace = s::regnamespace) THEN
      EXECUTE format('ALTER TABLE %I.physiq_profiles ADD CONSTRAINT physiq_profiles_series_modo_check
                        CHECK (series_modo IN (''padrao'', ''personalizada''))', s);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'physiq_profiles_series_padrao_qtd_check'
                   AND connamespace = s::regnamespace) THEN
      EXECUTE format('ALTER TABLE %I.physiq_profiles ADD CONSTRAINT physiq_profiles_series_padrao_qtd_check
                        CHECK (series_padrao_qtd BETWEEN 1 AND 10)', s);
    END IF;
  END LOOP;
END $$;
