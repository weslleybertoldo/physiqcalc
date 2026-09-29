-- PhysiqNutri — W5 Anamnese geral. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919040000_anamnese.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at) e de pacientes (W1).

-- Modelos de anamnese da nutricionista (referência: "modelos favoritos" ao criar a anamnese). `perguntas` = array JSON
-- de strings, na ordem. O modelo "Anamnese geral (padrão)" é criado pelo app no 1º acesso à seção.
create table if not exists {schema}.modelos_anamnese (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  perguntas jsonb not null default '[]'::jsonb,
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint modelos_anamnese_perguntas_array check (jsonb_typeof(perguntas) = 'array')
);
create index if not exists modelos_anamnese_nutri_idx on {schema}.modelos_anamnese (nutricionista_id);
grant all on {schema}.modelos_anamnese to anon, authenticated, service_role;
alter table {schema}.modelos_anamnese enable row level security;

drop policy if exists "modelos_anamnese: ler os proprios ou master" on {schema}.modelos_anamnese;
create policy "modelos_anamnese: ler os proprios ou master" on {schema}.modelos_anamnese
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_anamnese: criar os proprios ou master" on {schema}.modelos_anamnese;
create policy "modelos_anamnese: criar os proprios ou master" on {schema}.modelos_anamnese
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_anamnese: editar os proprios ou master" on {schema}.modelos_anamnese;
create policy "modelos_anamnese: editar os proprios ou master" on {schema}.modelos_anamnese
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_anamnese: apagar os proprios ou master" on {schema}.modelos_anamnese;
create policy "modelos_anamnese: apagar os proprios ou master" on {schema}.modelos_anamnese
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_modelos_anamnese_updated_at on {schema}.modelos_anamnese;
create trigger trg_modelos_anamnese_updated_at before update on {schema}.modelos_anamnese
  for each row execute function {schema}.set_updated_at();

-- Anamneses do paciente. `conteudo` = [{"pergunta": "...", "resposta": "..."}] na ordem do modelo (é uma CÓPIA: editar o
-- modelo depois não muda a anamnese já feita); `texto_livre` = observações gerais. Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.anamneses (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  modelo_id uuid references {schema}.modelos_anamnese(id) on delete set null,
  titulo text not null,
  data timestamptz not null default now(),
  conteudo jsonb not null default '[]'::jsonb,
  texto_livre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint anamneses_conteudo_array check (jsonb_typeof(conteudo) = 'array')
);
create index if not exists anamneses_nutri_paciente_data_idx on {schema}.anamneses (nutricionista_id, paciente_id, data desc);
create index if not exists anamneses_paciente_idx on {schema}.anamneses (paciente_id);
grant all on {schema}.anamneses to anon, authenticated, service_role;
alter table {schema}.anamneses enable row level security;

drop policy if exists "anamneses: ler as proprias ou master" on {schema}.anamneses;
create policy "anamneses: ler as proprias ou master" on {schema}.anamneses
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "anamneses: criar as proprias ou master" on {schema}.anamneses;
create policy "anamneses: criar as proprias ou master" on {schema}.anamneses
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "anamneses: editar as proprias ou master" on {schema}.anamneses;
create policy "anamneses: editar as proprias ou master" on {schema}.anamneses
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "anamneses: apagar as proprias ou master" on {schema}.anamneses;
create policy "anamneses: apagar as proprias ou master" on {schema}.anamneses
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_anamneses_updated_at on {schema}.anamneses;
create trigger trg_anamneses_updated_at before update on {schema}.anamneses
  for each row execute function {schema}.set_updated_at();

-- Trigger genérico das seções do prontuário: mexer numa linha ligada ao paciente atualiza `pacientes.updated_at`
-- (a W4 tem o `tocar_paciente_da_consulta`; este vale pra anamneses e pras próximas seções).
create or replace function {schema}.tocar_paciente() returns trigger
language plpgsql as $$
begin
  update {schema}.pacientes set updated_at = now() where id = new.paciente_id;
  return new;
end;
$$;
drop trigger if exists trg_anamneses_toca_paciente on {schema}.anamneses;
create trigger trg_anamneses_toca_paciente after insert or update on {schema}.anamneses
  for each row execute function {schema}.tocar_paciente();
