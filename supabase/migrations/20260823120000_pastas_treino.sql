-- Pastas de treinos (organização do catálogo no admin, ex. "Treino mulher").
-- Um treino pode estar em VÁRIAS pastas ao mesmo tempo (N:N via
-- tb_pastas_treino_grupos); excluir a pasta remove só os vínculos (CASCADE),
-- nunca exclui treinos. Idempotente; aplica em public E staging.

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.tb_pastas_treino (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )', s);
    EXECUTE format('ALTER TABLE %I.tb_pastas_treino ENABLE ROW LEVEL SECURITY', s);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.tb_pastas_treino_grupos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      pasta_id uuid NOT NULL REFERENCES %I.tb_pastas_treino(id) ON DELETE CASCADE,
      grupo_id uuid NOT NULL REFERENCES %I.tb_grupos_treino(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (pasta_id, grupo_id)
    )', s, s, s);
    EXECUTE format('ALTER TABLE %I.tb_pastas_treino_grupos ENABLE ROW LEVEL SECURITY', s);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = s AND tablename = 'tb_pastas_treino'
        AND policyname = 'Pastas visiveis para autenticados'
    ) THEN
      EXECUTE format('CREATE POLICY "Pastas visiveis para autenticados" ON %I.tb_pastas_treino FOR SELECT TO authenticated USING (true)', s);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = s AND tablename = 'tb_pastas_treino_grupos'
        AND policyname = 'Vinculos de pasta visiveis para autenticados'
    ) THEN
      EXECUTE format('CREATE POLICY "Vinculos de pasta visiveis para autenticados" ON %I.tb_pastas_treino_grupos FOR SELECT TO authenticated USING (true)', s);
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "Admin gerencia tb_pastas_treino" ON %I.tb_pastas_treino', s);
    EXECUTE format(
      $q$CREATE POLICY "Admin gerencia tb_pastas_treino" ON %I.tb_pastas_treino
           AS PERMISSIVE FOR ALL TO authenticated
           USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
           WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$q$, s);
    EXECUTE format('DROP POLICY IF EXISTS "Admin gerencia tb_pastas_treino_grupos" ON %I.tb_pastas_treino_grupos', s);
    EXECUTE format(
      $q$CREATE POLICY "Admin gerencia tb_pastas_treino_grupos" ON %I.tb_pastas_treino_grupos
           AS PERMISSIVE FOR ALL TO authenticated
           USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
           WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$q$, s);

    -- upgrade do modelo antigo (1 pasta por grupo via coluna): migra e dropa
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'tb_grupos_treino' AND column_name = 'pasta_id'
    ) THEN
      EXECUTE format('INSERT INTO %I.tb_pastas_treino_grupos (pasta_id, grupo_id)
        SELECT pasta_id, id FROM %I.tb_grupos_treino WHERE pasta_id IS NOT NULL
        ON CONFLICT (pasta_id, grupo_id) DO NOTHING', s, s);
      EXECUTE format('ALTER TABLE %I.tb_grupos_treino DROP COLUMN pasta_id', s);
    END IF;
  END LOOP;
END $$;
