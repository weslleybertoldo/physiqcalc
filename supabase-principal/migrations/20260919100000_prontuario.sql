-- PhysiqNutri — W11 Prontuário do paciente. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919100000_prontuario.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1) e do
-- trigger genérico tocar_paciente() (W5).

-- Registros clínicos datados do prontuário (referência: "editar prontuário" = novo registro datado, lista cronológica e
-- PDF do prontuário inteiro). `texto` = markdown SIMPLES (os mesmos blocos das orientações da W10: `# título`,
-- `## subtítulo`, `- item`, parágrafos, `**negrito**`). O autor é a nutricionista dona (`nutricionista_id`, sem coluna
-- extra). `data` é a data/hora do registro (começa em "agora", pode ser ajustada). Exclusão SOFT (Lixeira, W32).
-- Na criação, além de ser a dona, a nutricionista precisa enxergar o paciente (RLS de `pacientes`) — ninguém pendura
-- registro em paciente de outra.
create table if not exists {schema}.registros_prontuario (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data timestamptz not null default now(),
  texto text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists registros_prontuario_paciente_data_idx on {schema}.registros_prontuario (paciente_id, data desc);
create index if not exists registros_prontuario_nutri_idx on {schema}.registros_prontuario (nutricionista_id);
grant all on {schema}.registros_prontuario to anon, authenticated, service_role;
alter table {schema}.registros_prontuario enable row level security;

drop policy if exists "registros_prontuario: ler os proprios ou master" on {schema}.registros_prontuario;
create policy "registros_prontuario: ler os proprios ou master" on {schema}.registros_prontuario
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "registros_prontuario: criar os proprios ou master" on {schema}.registros_prontuario;
create policy "registros_prontuario: criar os proprios ou master" on {schema}.registros_prontuario
  for insert to authenticated with check (
    {schema}.eh_master()
    or (nutricionista_id = auth.uid() and exists (select 1 from {schema}.pacientes p where p.id = paciente_id))
  );
drop policy if exists "registros_prontuario: editar os proprios ou master" on {schema}.registros_prontuario;
create policy "registros_prontuario: editar os proprios ou master" on {schema}.registros_prontuario
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "registros_prontuario: apagar os proprios ou master" on {schema}.registros_prontuario;
create policy "registros_prontuario: apagar os proprios ou master" on {schema}.registros_prontuario
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_registros_prontuario_updated_at on {schema}.registros_prontuario;
create trigger trg_registros_prontuario_updated_at before update on {schema}.registros_prontuario
  for each row execute function {schema}.set_updated_at();

-- Mexer num registro atualiza `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_registros_prontuario_toca_paciente on {schema}.registros_prontuario;
create trigger trg_registros_prontuario_toca_paciente after insert or update on {schema}.registros_prontuario
  for each row execute function {schema}.tocar_paciente();
