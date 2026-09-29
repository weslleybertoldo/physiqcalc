-- PhysiqNutri — W14 Arquivos anexos. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919130000_anexos.sql`
-- (roda em public E staging, trocando {schema}; o bloco final (marcador compartilhado sozinho na linha) roda 1x). Depende da base
-- (eh_master, set_updated_at), de pacientes (W1) e do trigger genérico tocar_paciente() (W5).

-- Anexos do paciente = METADADOS do arquivo que fica no bucket PRIVADO `anexos` (Storage, criado no bloco compartilhado).
-- `path` = <nutricionista_id>/<paciente_id>/<uuid>-<nome-seguro>: a 1ª pasta é a dona e as policies do Storage usam isso.
-- Exclusão SOFT na tabela (Lixeira, W32) — o OBJETO do bucket é removido de verdade pelo app ao excluir.
create table if not exists {schema}.anexos (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  nome text not null,                             -- nome original do arquivo (o que a nutricionista vê)
  path text not null unique,                      -- caminho do objeto no bucket `anexos`
  tamanho bigint not null check (tamanho > 0),    -- bytes
  mime text not null,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                          -- lixeira (W32)
);
create index if not exists anexos_paciente_idx on {schema}.anexos (paciente_id);
create index if not exists anexos_nutri_idx on {schema}.anexos (nutricionista_id);
grant all on {schema}.anexos to anon, authenticated, service_role;
alter table {schema}.anexos enable row level security;

drop policy if exists "anexos: ler os proprios ou master" on {schema}.anexos;
create policy "anexos: ler os proprios ou master" on {schema}.anexos
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente (RLS de `pacientes`): fecha a brecha de pendurar anexo em paciente de outra nutricionista
drop policy if exists "anexos: criar os proprios ou master" on {schema}.anexos;
create policy "anexos: criar os proprios ou master" on {schema}.anexos
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "anexos: editar os proprios ou master" on {schema}.anexos;
create policy "anexos: editar os proprios ou master" on {schema}.anexos
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "anexos: apagar os proprios ou master" on {schema}.anexos;
create policy "anexos: apagar os proprios ou master" on {schema}.anexos
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_anexos_updated_at on {schema}.anexos;
create trigger trg_anexos_updated_at before update on {schema}.anexos
  for each row execute function {schema}.set_updated_at();

-- Anexo mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_anexos_toca_paciente on {schema}.anexos;
create trigger trg_anexos_toca_paciente after insert or update on {schema}.anexos
  for each row execute function {schema}.tocar_paciente();

-- @@ compartilhado
-- (roda 1x) Bucket PRIVADO `anexos`, único pros 2 schemas — o path começa com o id da nutricionista, então nada colide
-- e o smoke do staging limpa só o que criou. Limite 20 MB e tipos fechados (o app valida antes pra dar mensagem amigável;
-- o bucket recusa no servidor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos', 'anexos', false, 20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policies do Storage (uma só, o bucket é compartilhado): a dona é a 1ª pasta do path (`storage.foldername(name)[1]`);
-- master pelo claim do JWT (`public.eh_master()` lê `auth.jwt()`, vale pros 2 schemas).
drop policy if exists "anexos: ler os proprios ou master" on storage.objects;
create policy "anexos: ler os proprios ou master" on storage.objects
  for select to authenticated
  using (bucket_id = 'anexos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "anexos: subir nos proprios ou master" on storage.objects;
create policy "anexos: subir nos proprios ou master" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "anexos: editar os proprios ou master" on storage.objects;
create policy "anexos: editar os proprios ou master" on storage.objects
  for update to authenticated
  using (bucket_id = 'anexos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()))
  with check (bucket_id = 'anexos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "anexos: apagar os proprios ou master" on storage.objects;
create policy "anexos: apagar os proprios ou master" on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
