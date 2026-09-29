-- PhysiqNutri — W22 Evolução fotográfica. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919210000_evolucao.sql`
-- (roda em public E staging, trocando {schema}; o bloco final (depois do marcador que fica sozinho na linha) roda 1x).
-- Depende da base (eh_master, set_updated_at), de pacientes (W1) e do trigger genérico tocar_paciente() (W5).

-- Fotos de evolução do paciente = METADADOS da imagem que fica no bucket PRIVADO `evolucao` (Storage, criado no bloco final).
-- `path` = <nutricionista_id>/<paciente_id>/<uuid>-<nome-seguro>: a 1ª pasta é a dona e as policies do Storage usam isso.
-- Cada foto tem POSIÇÃO (frente, costas, lado direito, lado esquerdo) e DATA (o dia da foto): a tela agrupa por data (1 card com
-- 4 slots) e compara 2 datas lado a lado por posição. Exclusão SOFT na tabela (Lixeira, W32) — o OBJETO do bucket é removido de
-- verdade pelo app ao excluir.
create table if not exists {schema}.fotos_evolucao (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  posicao text not null check (posicao in ('frente', 'costas', 'lado_d', 'lado_e')),
  data date not null default current_date,           -- dia da foto (a nutricionista escolhe; padrão hoje)
  path text not null unique,                          -- caminho do objeto no bucket `evolucao`
  tamanho bigint not null check (tamanho > 0),        -- bytes
  mime text not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                              -- lixeira (W32)
);
create index if not exists fotos_evolucao_paciente_data_idx on {schema}.fotos_evolucao (paciente_id, data desc);
create index if not exists fotos_evolucao_nutri_idx on {schema}.fotos_evolucao (nutricionista_id);
grant all on {schema}.fotos_evolucao to anon, authenticated, service_role;
alter table {schema}.fotos_evolucao enable row level security;

drop policy if exists "fotos_evolucao: ler as proprias ou master" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: ler as proprias ou master" on {schema}.fotos_evolucao
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente (RLS de `pacientes`): fecha a brecha de pendurar foto em paciente de outra nutricionista
drop policy if exists "fotos_evolucao: criar as proprias ou master" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: criar as proprias ou master" on {schema}.fotos_evolucao
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "fotos_evolucao: editar as proprias ou master" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: editar as proprias ou master" on {schema}.fotos_evolucao
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "fotos_evolucao: apagar as proprias ou master" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: apagar as proprias ou master" on {schema}.fotos_evolucao
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_fotos_evolucao_updated_at on {schema}.fotos_evolucao;
create trigger trg_fotos_evolucao_updated_at before update on {schema}.fotos_evolucao
  for each row execute function {schema}.set_updated_at();

-- Foto mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_fotos_evolucao_toca_paciente on {schema}.fotos_evolucao;
create trigger trg_fotos_evolucao_toca_paciente after insert or update on {schema}.fotos_evolucao
  for each row execute function {schema}.tocar_paciente();

-- @@ compartilhado
-- (roda 1x) Bucket PRIVADO `evolucao`, único pros 2 schemas — o path começa com o id da nutricionista, então nada colide
-- e o smoke do staging limpa só o que criou. Limite 10 MB e só imagem (JPEG/PNG/WebP): o app valida antes pra dar mensagem
-- amigável; o bucket recusa no servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evolucao', 'evolucao', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policies do Storage (uma só, o bucket é compartilhado): a dona é a 1ª pasta do path (`storage.foldername(name)[1]`);
-- master pelo claim do JWT (`public.eh_master()` lê `auth.jwt()`, vale pros 2 schemas). Nomes próprios ('evolucao: …') pra
-- não colidir com as policies do bucket `anexos` (W14) na mesma tabela `storage.objects`.
drop policy if exists "evolucao: ler as proprias ou master" on storage.objects;
create policy "evolucao: ler as proprias ou master" on storage.objects
  for select to authenticated
  using (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "evolucao: subir nas proprias ou master" on storage.objects;
create policy "evolucao: subir nas proprias ou master" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "evolucao: editar as proprias ou master" on storage.objects;
create policy "evolucao: editar as proprias ou master" on storage.objects
  for update to authenticated
  using (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()))
  with check (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "evolucao: apagar as proprias ou master" on storage.objects;
create policy "evolucao: apagar as proprias ou master" on storage.objects
  for delete to authenticated
  using (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
