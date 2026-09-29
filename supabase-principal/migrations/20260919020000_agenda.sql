-- PhysiqNutri — W3 Agendamentos. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919020000_agenda.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at) e de pacientes (W1).

-- Calendários da nutricionista (referência: "Calendário Principal", "Calendário 2", "+ novo calendário", cada um
-- com cor, faixa de horário e configurações). O primeiro é criado pelo app no 1º acesso à agenda.
create table if not exists {schema}.calendarios (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cor text not null default '#38bdf8',          -- hex; barra/ponto do calendário nos eventos
  padrao boolean not null default false,        -- calendário sugerido no "novo agendamento"
  faixa_inicio time not null default '07:00',   -- faixa de horário mostrada na visão semana
  faixa_fim time not null default '20:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint calendarios_faixa_valida check (faixa_fim > faixa_inicio)
);
create index if not exists calendarios_nutri_idx on {schema}.calendarios (nutricionista_id);
grant all on {schema}.calendarios to anon, authenticated, service_role;
alter table {schema}.calendarios enable row level security;

drop policy if exists "calendarios: ler os proprios ou master" on {schema}.calendarios;
create policy "calendarios: ler os proprios ou master" on {schema}.calendarios
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "calendarios: criar os proprios ou master" on {schema}.calendarios;
create policy "calendarios: criar os proprios ou master" on {schema}.calendarios
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "calendarios: editar os proprios ou master" on {schema}.calendarios;
create policy "calendarios: editar os proprios ou master" on {schema}.calendarios
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "calendarios: apagar os proprios ou master" on {schema}.calendarios;
create policy "calendarios: apagar os proprios ou master" on {schema}.calendarios
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_calendarios_updated_at on {schema}.calendarios;
create trigger trg_calendarios_updated_at before update on {schema}.calendarios
  for each row execute function {schema}.set_updated_at();

-- Agendamentos. `status` = cor de fundo na referência (7 valores); `confirmacao` = cor da borda (3 valores),
-- derivada do status pelo app. `paciente_id` opcional (compromisso sem paciente, ex.: "Feriado").
create table if not exists {schema}.agendamentos (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  calendario_id uuid not null references {schema}.calendarios(id) on delete cascade,
  paciente_id uuid references {schema}.pacientes(id) on delete set null,
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  dia_inteiro boolean not null default false,
  status text not null default 'agendado'
    check (status in ('agendado', 'encaixe', 'confirmado', 'paciente_confirmou', 'desmarcado', 'paciente_desmarcou', 'nao_compareceu')),
  confirmacao text not null default 'a_confirmar'
    check (confirmacao in ('a_confirmar', 'confirmado', 'desmarcado')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint agendamentos_periodo_valido check (fim > inicio)
);
create index if not exists agendamentos_nutri_inicio_idx on {schema}.agendamentos (nutricionista_id, inicio);
create index if not exists agendamentos_calendario_idx on {schema}.agendamentos (calendario_id);
create index if not exists agendamentos_paciente_idx on {schema}.agendamentos (paciente_id);
grant all on {schema}.agendamentos to anon, authenticated, service_role;
alter table {schema}.agendamentos enable row level security;

drop policy if exists "agendamentos: ler os proprios ou master" on {schema}.agendamentos;
create policy "agendamentos: ler os proprios ou master" on {schema}.agendamentos
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "agendamentos: criar os proprios ou master" on {schema}.agendamentos;
create policy "agendamentos: criar os proprios ou master" on {schema}.agendamentos
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "agendamentos: editar os proprios ou master" on {schema}.agendamentos;
create policy "agendamentos: editar os proprios ou master" on {schema}.agendamentos
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "agendamentos: apagar os proprios ou master" on {schema}.agendamentos;
create policy "agendamentos: apagar os proprios ou master" on {schema}.agendamentos
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_agendamentos_updated_at on {schema}.agendamentos;
create trigger trg_agendamentos_updated_at before update on {schema}.agendamentos
  for each row execute function {schema}.set_updated_at();

-- Bloqueios de agenda ("Bloquear datas" da referência): período fechado, num calendário ou em todos (null).
create table if not exists {schema}.bloqueios_agenda (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  calendario_id uuid references {schema}.calendarios(id) on delete cascade,   -- null = todos os calendários
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  created_at timestamptz not null default now(),
  constraint bloqueios_periodo_valido check (fim > inicio)
);
create index if not exists bloqueios_nutri_inicio_idx on {schema}.bloqueios_agenda (nutricionista_id, inicio);
grant all on {schema}.bloqueios_agenda to anon, authenticated, service_role;
alter table {schema}.bloqueios_agenda enable row level security;

drop policy if exists "bloqueios: ler os proprios ou master" on {schema}.bloqueios_agenda;
create policy "bloqueios: ler os proprios ou master" on {schema}.bloqueios_agenda
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "bloqueios: criar os proprios ou master" on {schema}.bloqueios_agenda;
create policy "bloqueios: criar os proprios ou master" on {schema}.bloqueios_agenda
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "bloqueios: editar os proprios ou master" on {schema}.bloqueios_agenda;
create policy "bloqueios: editar os proprios ou master" on {schema}.bloqueios_agenda
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "bloqueios: apagar os proprios ou master" on {schema}.bloqueios_agenda;
create policy "bloqueios: apagar os proprios ou master" on {schema}.bloqueios_agenda
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
