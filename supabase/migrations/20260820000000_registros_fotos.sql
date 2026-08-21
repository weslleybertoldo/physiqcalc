-- Registros fotográficos mensais: 4 fotos/mês por aluno (frente, costas, lateral D, lateral E).
-- Admin escreve (tabela + storage); aluno lê só as próprias. Buckets PRIVADOS (fotos sensíveis,
-- acesso via signed URL). Idempotente; aplica em public e staging.

DO $$
DECLARE sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      CREATE TABLE IF NOT EXISTS %I.physiq_registros_fotos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        mes_ref date NOT NULL,
        tipo text NOT NULL CHECK (tipo IN ('frente','costas','lateral_direita','lateral_esquerda')),
        storage_path text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, mes_ref, tipo)
      )$q$, sch);

    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_registros_fotos_user_mes_idx ON %I.physiq_registros_fotos (user_id, mes_ref DESC)', sch);
    EXECUTE format('ALTER TABLE %I.physiq_registros_fotos ENABLE ROW LEVEL SECURITY', sch);

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = sch AND tablename = 'physiq_registros_fotos'
                     AND policyname = 'Aluno le proprios registros') THEN
      EXECUTE format($q$CREATE POLICY "Aluno le proprios registros" ON %I.physiq_registros_fotos
        FOR SELECT TO authenticated
        USING (auth.uid() = user_id OR (auth.jwt()->'app_metadata'->>'role') = 'admin')$q$, sch);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = sch AND tablename = 'physiq_registros_fotos'
                     AND policyname = 'Admin gerencia registros') THEN
      EXECUTE format($q$CREATE POLICY "Admin gerencia registros" ON %I.physiq_registros_fotos
        FOR ALL TO authenticated
        USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
        WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin')$q$, sch);
    END IF;

    EXECUTE format('REVOKE ALL ON %I.physiq_registros_fotos FROM anon', sch);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.physiq_registros_fotos TO authenticated', sch);
    EXECUTE format('GRANT ALL ON %I.physiq_registros_fotos TO service_role', sch);
  END LOOP;
END $$;

-- Buckets privados (prod + staging); path = <user_id>/<yyyy-mm>/<tipo>.jpg
INSERT INTO storage.buckets (id, name, public)
VALUES ('registros', 'registros', false), ('registros-staging', 'registros-staging', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'registros_read_own_or_admin') THEN
    CREATE POLICY "registros_read_own_or_admin" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id IN ('registros', 'registros-staging')
             AND ((storage.foldername(name))[1] = auth.uid()::text
                  OR (auth.jwt()->'app_metadata'->>'role') = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'registros_admin_write') THEN
    CREATE POLICY "registros_admin_write" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id IN ('registros', 'registros-staging') AND (auth.jwt()->'app_metadata'->>'role') = 'admin')
      WITH CHECK (bucket_id IN ('registros', 'registros-staging') AND (auth.jwt()->'app_metadata'->>'role') = 'admin');
  END IF;
END $$;
