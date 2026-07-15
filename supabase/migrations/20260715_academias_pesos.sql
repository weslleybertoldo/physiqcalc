-- Seletor de academia: pesos salvos por academia (por usuário) + tag da academia no histórico.
-- Espelhado em public e staging (staging = escritas isoladas do ambiente de teste).

DO $$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    EXECUTE format($q$
      CREATE TABLE IF NOT EXISTS %I.tb_academias (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        nome text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )$q$, sch);

    EXECUTE format($q$
      CREATE TABLE IF NOT EXISTS %I.tb_academia_pesos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        academia_id uuid NOT NULL REFERENCES %I.tb_academias(id) ON DELETE CASCADE,
        exercicio_id uuid NULL,
        exercicio_usuario_id uuid NULL,
        numero_serie integer NOT NULL,
        peso double precision NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )$q$, sch, sch);

    EXECUTE format($q$
      CREATE UNIQUE INDEX IF NOT EXISTS tb_academia_pesos_unq
        ON %I.tb_academia_pesos (user_id, academia_id,
          coalesce(exercicio_id::text, ''), coalesce(exercicio_usuario_id::text, ''), numero_serie)$q$, sch);

    EXECUTE format('ALTER TABLE %I.tb_treino_series ADD COLUMN IF NOT EXISTS academia_nome text NULL', sch);

    EXECUTE format('ALTER TABLE %I.tb_academias ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('ALTER TABLE %I.tb_academia_pesos ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Usuario gerencia suas academias" ON %I.tb_academias', sch);
    EXECUTE format($q$CREATE POLICY "Usuario gerencia suas academias" ON %I.tb_academias
      AS PERMISSIVE FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)$q$, sch);
    EXECUTE format('DROP POLICY IF EXISTS "Usuario gerencia seus pesos por academia" ON %I.tb_academia_pesos', sch);
    EXECUTE format($q$CREATE POLICY "Usuario gerencia seus pesos por academia" ON %I.tb_academia_pesos
      AS PERMISSIVE FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)$q$, sch);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.tb_academias TO authenticated', sch);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.tb_academia_pesos TO authenticated', sch);
  END LOOP;
END $$;

-- PowerSync sincroniza a partir do public (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'tb_academias') THEN
    ALTER PUBLICATION powersync ADD TABLE public.tb_academias;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'tb_academia_pesos') THEN
    ALTER PUBLICATION powersync ADD TABLE public.tb_academia_pesos;
  END IF;
END $$;
