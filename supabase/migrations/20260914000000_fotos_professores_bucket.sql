-- Foto do professor por upload (pedido 13/09/2026): bucket PÚBLICO (URL fixa em physiq_professores.foto_url);
-- escrita só na pasta do próprio professor (<uid>/...). prod + staging.
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-professores', 'fotos-professores', true), ('fotos-professores-staging', 'fotos-professores-staging', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fotos_professores_read" ON storage.objects;
CREATE POLICY "fotos_professores_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id IN ('fotos-professores', 'fotos-professores-staging'));

DROP POLICY IF EXISTS "fotos_professores_write_own" ON storage.objects;
CREATE POLICY "fotos_professores_write_own" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('fotos-professores', 'fotos-professores-staging') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id IN ('fotos-professores', 'fotos-professores-staging') AND (storage.foldername(name))[1] = auth.uid()::text);
