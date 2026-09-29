-- PhysiqNutri — W23 Acompanhamento. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919220000_registros_diarios.sql`
-- (roda em public E staging, trocando {schema}). Sem bloco compartilhado.
-- Depende da base (eh_master, set_updated_at), de pacientes (W1) e do trigger genérico tocar_paciente() (W5).

-- Registro DIÁRIO do paciente: ingestão de água (ml), sintomas do dia e observação — é o que alimenta os cards
-- 'Ingestão hídrica' e 'Sintomas mais frequentes' do Acompanhamento. Nesta fase quem preenche é a nutricionista;
-- o diário do paciente (W30) e a área do paciente (W34) gravam na MESMA tabela depois.
-- `sintomas` = array jsonb de chaves do catálogo do app (azia, nausea, dor_de_cabeca, …) ou textos livres normalizados.
-- 1 registro VIVO por paciente/dia (índice único PARCIAL): o app faz upsert manual (busca o vivo do dia → update; senão
-- insert). Exclusão SOFT (Lixeira, W32) — como o índice só vale pros vivos, excluir e registrar o mesmo dia de novo funciona.
create table if not exists {schema}.registros_diarios (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data date not null default current_date,            -- o dia registrado (o app sempre manda; padrão hoje)
  agua_ml integer not null default 0,                 -- água ingerida no dia, em ml
  sintomas jsonb not null default '[]'::jsonb,        -- ["azia", "inchaco", "tontura"]
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                             -- lixeira (W32)
  constraint registros_diarios_agua_chk check (agua_ml >= 0 and agua_ml <= 30000),
  constraint registros_diarios_sintomas_arr check (jsonb_typeof(sintomas) = 'array')
);
create unique index if not exists registros_diarios_paciente_dia_vivo_uidx
  on {schema}.registros_diarios (paciente_id, data) where deleted_at is null;
create index if not exists registros_diarios_paciente_data_idx on {schema}.registros_diarios (paciente_id, data desc);
create index if not exists registros_diarios_nutri_idx on {schema}.registros_diarios (nutricionista_id);
grant all on {schema}.registros_diarios to anon, authenticated, service_role;
alter table {schema}.registros_diarios enable row level security;

drop policy if exists "registros_diarios: ler os proprios ou master" on {schema}.registros_diarios;
create policy "registros_diarios: ler os proprios ou master" on {schema}.registros_diarios
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente (RLS de `pacientes`): fecha a brecha de pendurar registro em paciente de outra nutricionista
drop policy if exists "registros_diarios: criar os proprios ou master" on {schema}.registros_diarios;
create policy "registros_diarios: criar os proprios ou master" on {schema}.registros_diarios
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "registros_diarios: editar os proprios ou master" on {schema}.registros_diarios;
create policy "registros_diarios: editar os proprios ou master" on {schema}.registros_diarios
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "registros_diarios: apagar os proprios ou master" on {schema}.registros_diarios;
create policy "registros_diarios: apagar os proprios ou master" on {schema}.registros_diarios
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_registros_diarios_updated_at on {schema}.registros_diarios;
create trigger trg_registros_diarios_updated_at before update on {schema}.registros_diarios
  for each row execute function {schema}.set_updated_at();

-- Registro do dia mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_registros_diarios_toca_paciente on {schema}.registros_diarios;
create trigger trg_registros_diarios_toca_paciente after insert or update on {schema}.registros_diarios
  for each row execute function {schema}.tocar_paciente();
