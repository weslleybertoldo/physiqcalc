-- PhysiqNutri — W16 Prescrição de metas. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919150000_metas.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1)
-- e do trigger genérico tocar_paciente() (W5). Esta migration não tem bloco único (nada em auth/storage).

-- Modelos de meta da nutricionista (referência: metas favoritas com os dias da semana Seg–Dom). `dias_semana` guarda os
-- dias em que a meta vale, no padrão ISO (1 = segunda … 7 = domingo), sem repetição e com pelo menos 1 dia. Os 5 modelos
-- padrão (texto próprio do PhysiqNutri) nascem pelo app, favoritos, no 1º acesso da nutricionista à seção. Exclusão SOFT
-- (Lixeira, W32): a meta prescrita copia título/descrição/dias e não depende do modelo.
create table if not exists {schema}.modelos_meta (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  descricao text not null default '',
  dias_semana smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(dias_semana) >= 1 and dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[]),
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists modelos_meta_nutri_idx on {schema}.modelos_meta (nutricionista_id);
grant all on {schema}.modelos_meta to anon, authenticated, service_role;
alter table {schema}.modelos_meta enable row level security;

drop policy if exists "modelos_meta: ler os proprios ou master" on {schema}.modelos_meta;
create policy "modelos_meta: ler os proprios ou master" on {schema}.modelos_meta
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_meta: criar os proprios ou master" on {schema}.modelos_meta;
create policy "modelos_meta: criar os proprios ou master" on {schema}.modelos_meta
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_meta: editar os proprios ou master" on {schema}.modelos_meta;
create policy "modelos_meta: editar os proprios ou master" on {schema}.modelos_meta
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_meta: apagar os proprios ou master" on {schema}.modelos_meta;
create policy "modelos_meta: apagar os proprios ou master" on {schema}.modelos_meta
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_modelos_meta_updated_at on {schema}.modelos_meta;
create trigger trg_modelos_meta_updated_at before update on {schema}.modelos_meta
  for each row execute function {schema}.set_updated_at();

-- Metas prescritas pro paciente. Copiam título/descrição/dias do modelo escolhido (mudar o modelo depois não mexe na meta —
-- padrão dos recibos/documentos, W13/W15); `ativa` = em vigor (pausada = false, continua na lista com "Mostrar pausadas");
-- `inicio` = desde quando vale. Paciente OBRIGATÓRIO; a criação exige enxergar o paciente (RLS de `pacientes`, padrão W10–W15).
-- Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.metas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  modelo_id uuid references {schema}.modelos_meta(id) on delete set null,
  titulo text not null,
  descricao text not null default '',
  dias_semana smallint[] not null
    check (cardinality(dias_semana) >= 1 and dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[]),
  ativa boolean not null default true,
  inicio date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists metas_paciente_idx on {schema}.metas (paciente_id);
create index if not exists metas_nutri_idx on {schema}.metas (nutricionista_id);
grant all on {schema}.metas to anon, authenticated, service_role;
alter table {schema}.metas enable row level security;

drop policy if exists "metas: ler os proprios ou master" on {schema}.metas;
create policy "metas: ler os proprios ou master" on {schema}.metas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "metas: criar os proprios ou master" on {schema}.metas;
create policy "metas: criar os proprios ou master" on {schema}.metas
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "metas: editar os proprios ou master" on {schema}.metas;
create policy "metas: editar os proprios ou master" on {schema}.metas
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "metas: apagar os proprios ou master" on {schema}.metas;
create policy "metas: apagar os proprios ou master" on {schema}.metas
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_metas_updated_at on {schema}.metas;
create trigger trg_metas_updated_at before update on {schema}.metas
  for each row execute function {schema}.set_updated_at();

-- Meta mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_metas_toca_paciente on {schema}.metas;
create trigger trg_metas_toca_paciente after insert or update on {schema}.metas
  for each row execute function {schema}.tocar_paciente();
