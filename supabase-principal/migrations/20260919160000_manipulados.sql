-- PhysiqNutri — W17 Prescrição de manipulados. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919160000_manipulados.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1)
-- e do trigger genérico tocar_paciente() (W5). Esta migration não tem bloco único (nada em auth/storage).

-- Modelos de fórmula manipulada da nutricionista (referência: manipulados favoritos). `ativos` é um jsonb com a lista de
-- {ativo, dose, unidade} (unidades: mg, g, mcg, UI, mL, %) — o app valida pelo menos 1 ativo com nome; o banco só garante
-- que é uma lista. Os 3 modelos padrão (texto próprio do PhysiqNutri) nascem pelo app, favoritos, no 1º acesso da
-- nutricionista à seção. Exclusão SOFT (Lixeira, W32): a fórmula prescrita copia tudo e não depende do modelo.
create table if not exists {schema}.modelos_formula (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  ativos jsonb not null default '[]'::jsonb check (jsonb_typeof(ativos) = 'array'),
  posologia text not null default '',
  quantidade text not null default '',
  observacao text not null default '',
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists modelos_formula_nutri_idx on {schema}.modelos_formula (nutricionista_id);
grant all on {schema}.modelos_formula to anon, authenticated, service_role;
alter table {schema}.modelos_formula enable row level security;

drop policy if exists "modelos_formula: ler os proprios ou master" on {schema}.modelos_formula;
create policy "modelos_formula: ler os proprios ou master" on {schema}.modelos_formula
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_formula: criar os proprios ou master" on {schema}.modelos_formula;
create policy "modelos_formula: criar os proprios ou master" on {schema}.modelos_formula
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_formula: editar os proprios ou master" on {schema}.modelos_formula;
create policy "modelos_formula: editar os proprios ou master" on {schema}.modelos_formula
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_formula: apagar os proprios ou master" on {schema}.modelos_formula;
create policy "modelos_formula: apagar os proprios ou master" on {schema}.modelos_formula
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_modelos_formula_updated_at on {schema}.modelos_formula;
create trigger trg_modelos_formula_updated_at before update on {schema}.modelos_formula
  for each row execute function {schema}.set_updated_at();

-- Fórmulas manipuladas prescritas pro paciente. Copiam título/ativos/posologia/quantidade/observação do modelo escolhido
-- (mudar o modelo depois não mexe na fórmula — padrão das metas/documentos, W16/W15); `prescrita_em` = data da prescrição
-- (duplicar cria outra com a data de hoje). Paciente OBRIGATÓRIO; a criação exige enxergar o paciente (RLS de `pacientes`,
-- padrão W10–W16). Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.formulas_manipuladas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  modelo_id uuid references {schema}.modelos_formula(id) on delete set null,
  titulo text not null,
  ativos jsonb not null default '[]'::jsonb check (jsonb_typeof(ativos) = 'array'),
  posologia text not null default '',
  quantidade text not null default '',
  observacao text not null default '',
  prescrita_em date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists formulas_manipuladas_paciente_idx on {schema}.formulas_manipuladas (paciente_id);
create index if not exists formulas_manipuladas_nutri_idx on {schema}.formulas_manipuladas (nutricionista_id);
grant all on {schema}.formulas_manipuladas to anon, authenticated, service_role;
alter table {schema}.formulas_manipuladas enable row level security;

drop policy if exists "formulas_manipuladas: ler os proprios ou master" on {schema}.formulas_manipuladas;
create policy "formulas_manipuladas: ler os proprios ou master" on {schema}.formulas_manipuladas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "formulas_manipuladas: criar os proprios ou master" on {schema}.formulas_manipuladas;
create policy "formulas_manipuladas: criar os proprios ou master" on {schema}.formulas_manipuladas
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "formulas_manipuladas: editar os proprios ou master" on {schema}.formulas_manipuladas;
create policy "formulas_manipuladas: editar os proprios ou master" on {schema}.formulas_manipuladas
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "formulas_manipuladas: apagar os proprios ou master" on {schema}.formulas_manipuladas;
create policy "formulas_manipuladas: apagar os proprios ou master" on {schema}.formulas_manipuladas
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_formulas_manipuladas_updated_at on {schema}.formulas_manipuladas;
create trigger trg_formulas_manipuladas_updated_at before update on {schema}.formulas_manipuladas
  for each row execute function {schema}.set_updated_at();

-- Fórmula mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_formulas_manipuladas_toca_paciente on {schema}.formulas_manipuladas;
create trigger trg_formulas_manipuladas_toca_paciente after insert or update on {schema}.formulas_manipuladas
  for each row execute function {schema}.tocar_paciente();
