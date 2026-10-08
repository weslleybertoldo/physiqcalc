-- Homologação do Physiq — hml-04 no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) — H-08 e H-16 (07/10/2026).
-- Idempotente. Nenhum arquivo muda.
--
-- H-16. Os 8 buckets ganham limite de tamanho e de tipo (como no principal), no mínimo o que o app já confere antes de subir:
--   fotos-professores 5 MB e exercicios 10 MB (o painel aceita até 5 MB; o GIF de exercício sobe também pelo master), imagem JPG,
--   PNG e WebP (+ GIF no exercicios); registros 10 MB, imagem; comprovantes 10 MB, imagem ou PDF.
-- H-08. A foto do professor: o visitante deixa de LISTAR o bucket (que segue público: a URL pública continua servindo a foto —
--   decisão dele, pergunta 8) e só professor ou admin grava, na própria pasta (antes, qualquer conta logada).
-- Roda 1x por ambiente: set physiq.schemas = 'staging' (os buckets -staging) e depois 'public' (os de produção; backup antes).
-- Reversa: supabase/reversas/20261007230000_hml04_storage_treino_reversa.sql

do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
  v_suf text;
  v_dono text := '((storage.foldername(name))[1] = (auth.uid())::text)';
  v_papel text := $q$(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = any (array['professor'::text, 'admin'::text]))$q$;
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  v_suf := case when v_amb = 'staging' then '-staging' else '' end;

  -- H-16 ---------------------------------------------------------------------------------------------------------------------
  update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   where id = 'fotos-professores' || v_suf;
  update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/gif', 'image/webp', 'image/png', 'image/jpeg']
   where id = 'exercicios' || v_suf;
  update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   where id = 'registros' || v_suf;
  update storage.buckets set file_size_limit = 10485760,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
   where id = 'comprovantes' || v_suf;

  -- H-08 ---------------------------------------------------------------------------------------------------------------------
  if v_amb = 'staging' then
    -- as 2 policies de antes valiam para os 2 buckets: passam a valer só para o de produção (que muda no passo 'public')
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'fotos_professores_read' and qual ~ 'fotos-professores-staging') then
      alter policy fotos_professores_read on storage.objects using (bucket_id = 'fotos-professores'::text);
    end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'fotos_professores_write_own' and qual ~ 'fotos-professores-staging') then
      execute format('alter policy fotos_professores_write_own on storage.objects using ((bucket_id = %L) and %s) with check ((bucket_id = %L) and %s)',
                     'fotos-professores', v_dono, 'fotos-professores', v_dono);
    end if;
    drop policy if exists fotos_professores_staging_write_own on storage.objects;
    execute format('create policy fotos_professores_staging_write_own on storage.objects for all to authenticated '
                   'using ((bucket_id = %L) and %s and %s) with check ((bucket_id = %L) and %s and %s)',
                   'fotos-professores-staging', v_dono, v_papel, 'fotos-professores-staging', v_dono, v_papel);
  else
    drop policy if exists fotos_professores_read on storage.objects;
    execute format('alter policy fotos_professores_write_own on storage.objects using ((bucket_id = %L) and %s and %s) '
                   'with check ((bucket_id = %L) and %s and %s)',
                   'fotos-professores', v_dono, v_papel, 'fotos-professores', v_dono, v_papel);
  end if;
end $$;
