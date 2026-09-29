-- PhysiqNutri — W18 Exames laboratoriais. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919170000_exames.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1)
-- e do trigger genérico tocar_paciente() (W5). Esta migration não tem bloco único (nada em auth/storage).

-- Catálogo de exames da nutricionista (referência: pedido de exames com favoritos). Nome, unidade e a referência —
-- numérica (ref_min/ref_max, qualquer um dos dois pode faltar) OU textual (`referencia_texto`, ex.: 'negativo'). Os 12
-- exames padrão (texto próprio do PhysiqNutri) nascem pelo app, favoritos, no 1º acesso da nutricionista à seção.
-- O pedido e o resultado COPIAM o que precisam daqui — mudar o catálogo depois não mexe no histórico. Exclusão SOFT.
create table if not exists {schema}.exames_catalogo (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  unidade text not null default '',
  ref_min numeric,
  ref_max numeric,
  referencia_texto text not null default '',
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint exames_catalogo_ref_check check (ref_min is null or ref_max is null or ref_min <= ref_max)
);
create index if not exists exames_catalogo_nutri_idx on {schema}.exames_catalogo (nutricionista_id);
grant all on {schema}.exames_catalogo to anon, authenticated, service_role;
alter table {schema}.exames_catalogo enable row level security;

drop policy if exists "exames_catalogo: ler os proprios ou master" on {schema}.exames_catalogo;
create policy "exames_catalogo: ler os proprios ou master" on {schema}.exames_catalogo
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "exames_catalogo: criar os proprios ou master" on {schema}.exames_catalogo;
create policy "exames_catalogo: criar os proprios ou master" on {schema}.exames_catalogo
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "exames_catalogo: editar os proprios ou master" on {schema}.exames_catalogo;
create policy "exames_catalogo: editar os proprios ou master" on {schema}.exames_catalogo
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "exames_catalogo: apagar os proprios ou master" on {schema}.exames_catalogo;
create policy "exames_catalogo: apagar os proprios ou master" on {schema}.exames_catalogo
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_exames_catalogo_updated_at on {schema}.exames_catalogo;
create trigger trg_exames_catalogo_updated_at before update on {schema}.exames_catalogo
  for each row execute function {schema}.set_updated_at();

-- Pedidos de exames do paciente: data + lista dos NOMES pedidos (cópia do catálogo na hora, text[]) + observação.
-- Paciente OBRIGATÓRIO; a criação exige enxergar o paciente (RLS de `pacientes`, padrão W10–W17). Exclusão SOFT.
create table if not exists {schema}.pedidos_exame (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data date not null default current_date,
  exames text[] not null check (cardinality(exames) >= 1),
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists pedidos_exame_paciente_idx on {schema}.pedidos_exame (paciente_id);
create index if not exists pedidos_exame_nutri_idx on {schema}.pedidos_exame (nutricionista_id);
grant all on {schema}.pedidos_exame to anon, authenticated, service_role;
alter table {schema}.pedidos_exame enable row level security;

drop policy if exists "pedidos_exame: ler os proprios ou master" on {schema}.pedidos_exame;
create policy "pedidos_exame: ler os proprios ou master" on {schema}.pedidos_exame
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "pedidos_exame: criar os proprios ou master" on {schema}.pedidos_exame;
create policy "pedidos_exame: criar os proprios ou master" on {schema}.pedidos_exame
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "pedidos_exame: editar os proprios ou master" on {schema}.pedidos_exame;
create policy "pedidos_exame: editar os proprios ou master" on {schema}.pedidos_exame
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "pedidos_exame: apagar os proprios ou master" on {schema}.pedidos_exame;
create policy "pedidos_exame: apagar os proprios ou master" on {schema}.pedidos_exame
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_pedidos_exame_updated_at on {schema}.pedidos_exame;
create trigger trg_pedidos_exame_updated_at before update on {schema}.pedidos_exame
  for each row execute function {schema}.set_updated_at();
drop trigger if exists trg_pedidos_exame_toca_paciente on {schema}.pedidos_exame;
create trigger trg_pedidos_exame_toca_paciente after insert or update on {schema}.pedidos_exame
  for each row execute function {schema}.tocar_paciente();

-- Resultados de exames do paciente (1 linha por exame por data). `valor` numérico OU `valor_texto` (ex.: 'negativo') —
-- o app exige um dos dois. Unidade e referência (ref_min/ref_max/referencia_texto) são CÓPIA do catálogo na data do
-- lançamento — mudar o catálogo depois não mexe no histórico. Exclusão SOFT.
create table if not exists {schema}.resultados_exame (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  exame text not null,
  valor numeric,
  valor_texto text not null default '',
  unidade text not null default '',
  ref_min numeric,
  ref_max numeric,
  referencia_texto text not null default '',
  data date not null default current_date,
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists resultados_exame_paciente_data_idx on {schema}.resultados_exame (paciente_id, data desc);
create index if not exists resultados_exame_nutri_idx on {schema}.resultados_exame (nutricionista_id);
grant all on {schema}.resultados_exame to anon, authenticated, service_role;
alter table {schema}.resultados_exame enable row level security;

drop policy if exists "resultados_exame: ler os proprios ou master" on {schema}.resultados_exame;
create policy "resultados_exame: ler os proprios ou master" on {schema}.resultados_exame
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "resultados_exame: criar os proprios ou master" on {schema}.resultados_exame;
create policy "resultados_exame: criar os proprios ou master" on {schema}.resultados_exame
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "resultados_exame: editar os proprios ou master" on {schema}.resultados_exame;
create policy "resultados_exame: editar os proprios ou master" on {schema}.resultados_exame
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "resultados_exame: apagar os proprios ou master" on {schema}.resultados_exame;
create policy "resultados_exame: apagar os proprios ou master" on {schema}.resultados_exame
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_resultados_exame_updated_at on {schema}.resultados_exame;
create trigger trg_resultados_exame_updated_at before update on {schema}.resultados_exame
  for each row execute function {schema}.set_updated_at();
drop trigger if exists trg_resultados_exame_toca_paciente on {schema}.resultados_exame;
create trigger trg_resultados_exame_toca_paciente after insert or update on {schema}.resultados_exame
  for each row execute function {schema}.tocar_paciente();
