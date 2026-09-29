-- PhysiqNutri — W15 Atestados e receituários. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919140000_documentos.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at, profiles), de pacientes (W1)
-- e do trigger genérico tocar_paciente() (W5). Esta migration não tem bloco único (nada em auth/storage).

-- Modelos de documento por tipo — atestado, receituário e declaração — com as tags *|NOME_PACIENTE|*, *|CPF_PACIENTE|*,
-- *|DATA_HOJE|*, *|NOME_NUTRICIONISTA|*, *|CARIMBO|* e, no atestado, *|DIAS_AFASTAMENTO|* e *|CID|*. Os 3 modelos padrão
-- (texto próprio do PhysiqNutri) nascem pelo app, favoritos, no 1º acesso da nutricionista à seção. Exclusão SOFT
-- (Lixeira, W32): o documento emitido guarda o TEXTO final e não depende do modelo.
create table if not exists {schema}.modelos_documento (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('atestado', 'receituario', 'declaracao')),
  titulo text not null,
  conteudo text not null,
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists modelos_documento_nutri_idx on {schema}.modelos_documento (nutricionista_id);
grant all on {schema}.modelos_documento to anon, authenticated, service_role;
alter table {schema}.modelos_documento enable row level security;

drop policy if exists "modelos_documento: ler os proprios ou master" on {schema}.modelos_documento;
create policy "modelos_documento: ler os proprios ou master" on {schema}.modelos_documento
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_documento: criar os proprios ou master" on {schema}.modelos_documento;
create policy "modelos_documento: criar os proprios ou master" on {schema}.modelos_documento
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_documento: editar os proprios ou master" on {schema}.modelos_documento;
create policy "modelos_documento: editar os proprios ou master" on {schema}.modelos_documento
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_documento: apagar os proprios ou master" on {schema}.modelos_documento;
create policy "modelos_documento: apagar os proprios ou master" on {schema}.modelos_documento
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_modelos_documento_updated_at on {schema}.modelos_documento;
create trigger trg_modelos_documento_updated_at before update on {schema}.modelos_documento
  for each row execute function {schema}.set_updated_at();

-- Documentos emitidos pro paciente. `texto` é o conteúdo FINAL com as tags já substituídas (mudar o modelo depois não mexe
-- no documento — padrão dos recibos, W13); `dados` só documenta o que preencheu as tags (dias_afastamento, cid).
-- Paciente OBRIGATÓRIO; a criação exige enxergar o paciente (RLS de `pacientes`, padrão W10–W14). Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.documentos (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  modelo_id uuid references {schema}.modelos_documento(id) on delete set null,
  tipo text not null check (tipo in ('atestado', 'receituario', 'declaracao')),
  titulo text not null,
  texto text not null,
  dados jsonb not null default '{}'::jsonb,
  data date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists documentos_paciente_idx on {schema}.documentos (paciente_id);
create index if not exists documentos_nutri_idx on {schema}.documentos (nutricionista_id);
grant all on {schema}.documentos to anon, authenticated, service_role;
alter table {schema}.documentos enable row level security;

drop policy if exists "documentos: ler os proprios ou master" on {schema}.documentos;
create policy "documentos: ler os proprios ou master" on {schema}.documentos
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "documentos: criar os proprios ou master" on {schema}.documentos;
create policy "documentos: criar os proprios ou master" on {schema}.documentos
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "documentos: editar os proprios ou master" on {schema}.documentos;
create policy "documentos: editar os proprios ou master" on {schema}.documentos
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "documentos: apagar os proprios ou master" on {schema}.documentos;
create policy "documentos: apagar os proprios ou master" on {schema}.documentos
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_documentos_updated_at on {schema}.documentos;
create trigger trg_documentos_updated_at before update on {schema}.documentos
  for each row execute function {schema}.set_updated_at();

-- Documento mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_documentos_toca_paciente on {schema}.documentos;
create trigger trg_documentos_toca_paciente after insert or update on {schema}.documentos
  for each row execute function {schema}.tocar_paciente();

-- Carimbo e dados profissionais da nutricionista (CRN, telefone, endereço) — colunas NULÁVEIS; a tela de preencher fica
-- na W35 (Configurações). Até lá a tag *|CARIMBO|* vira "[carimbo]" e o PDF só usa o que já existir.
alter table {schema}.profiles add column if not exists carimbo_url text;
alter table {schema}.profiles add column if not exists dados_profissionais jsonb;
