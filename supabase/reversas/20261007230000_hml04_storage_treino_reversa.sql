-- REVERSA da 20261007230000_hml04_storage_treino.sql (hml-04, 07/10/2026): os 8 buckets do Treino voltam sem limite de tamanho e de
-- tipo, e as 2 policies da foto do professor voltam como antes (lidas do banco vivo antes de aplicar: leitura pública dos 2 buckets e
-- escrita de qualquer conta logada na própria pasta). Rodar 1x (não depende de physiq.schemas).
update storage.buckets set file_size_limit = null, allowed_mime_types = null
 where id in ('fotos-professores', 'fotos-professores-staging', 'exercicios', 'exercicios-staging', 'registros', 'registros-staging',
              'comprovantes', 'comprovantes-staging');
drop policy if exists fotos_professores_staging_write_own on storage.objects;
drop policy if exists fotos_professores_read on storage.objects;
create policy fotos_professores_read on storage.objects for select to public
  using (bucket_id = any (array['fotos-professores'::text, 'fotos-professores-staging'::text]));
alter policy fotos_professores_write_own on storage.objects
  using ((bucket_id = any (array['fotos-professores'::text, 'fotos-professores-staging'::text])) and ((storage.foldername(name))[1] = (auth.uid())::text))
  with check ((bucket_id = any (array['fotos-professores'::text, 'fotos-professores-staging'::text])) and ((storage.foldername(name))[1] = (auth.uid())::text));
