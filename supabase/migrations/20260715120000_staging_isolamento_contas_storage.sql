-- Isolamento lógico do staging (projeto único):
-- 1. Signup vindo do staging (user_metadata.ambiente='staging') cria perfil SÓ em staging.*
-- 2. Bucket de exercícios replicado pro staging (leitura pública, escrita admin)
-- Idempotente.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'ambiente', '') = 'staging' THEN
    -- conta de teste do staging: perfil só no schema staging, invisível pra produção
    INSERT INTO staging.physiq_profiles (id, nome, email, foto_url)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''));
  ELSE
    INSERT INTO public.physiq_profiles (id, nome, email, foto_url)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''));
  END IF;
  RETURN NEW;
END; $function$;

-- bucket de exercícios do staging (espelho do prod)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercicios-staging', 'exercicios-staging', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'exercicios_staging_admin_write'
  ) THEN
    CREATE POLICY "exercicios_staging_admin_write" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'exercicios-staging' AND (auth.jwt()->'app_metadata'->>'role') = 'admin')
      WITH CHECK (bucket_id = 'exercicios-staging' AND (auth.jwt()->'app_metadata'->>'role') = 'admin');
  END IF;
END $$;
