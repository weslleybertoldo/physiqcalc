-- PhysiqNutri — W10 Orientações nutricionais. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919090000_orientacoes.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1) e do
-- trigger genérico tocar_paciente() (W5).

-- Modelos de orientação da nutricionista (texto reaproveitável entre pacientes). `conteudo` = markdown SIMPLES
-- (`# título`, `## subtítulo`, `- item`, parágrafos, `**negrito**`). O modelo "Orientações gerais (padrão)" é criado
-- pelo app no 1º acesso à seção.
create table if not exists {schema}.modelos_orientacao (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  conteudo text not null default '',
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists modelos_orientacao_nutri_fav_idx on {schema}.modelos_orientacao (nutricionista_id, favorito);
grant all on {schema}.modelos_orientacao to anon, authenticated, service_role;
alter table {schema}.modelos_orientacao enable row level security;

drop policy if exists "modelos_orientacao: ler os proprios ou master" on {schema}.modelos_orientacao;
create policy "modelos_orientacao: ler os proprios ou master" on {schema}.modelos_orientacao
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_orientacao: criar os proprios ou master" on {schema}.modelos_orientacao;
create policy "modelos_orientacao: criar os proprios ou master" on {schema}.modelos_orientacao
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_orientacao: editar os proprios ou master" on {schema}.modelos_orientacao;
create policy "modelos_orientacao: editar os proprios ou master" on {schema}.modelos_orientacao
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_orientacao: apagar os proprios ou master" on {schema}.modelos_orientacao;
create policy "modelos_orientacao: apagar os proprios ou master" on {schema}.modelos_orientacao
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_modelos_orientacao_updated_at on {schema}.modelos_orientacao;
create trigger trg_modelos_orientacao_updated_at before update on {schema}.modelos_orientacao
  for each row execute function {schema}.set_updated_at();

-- Orientações entregues ao paciente. `conteudo` é uma CÓPIA do modelo no momento da criação (editar o modelo depois
-- não muda a orientação já entregue). A data da orientação é o `created_at`. Exclusão SOFT (Lixeira, W32).
-- Na criação, além de ser a dona, a nutricionista precisa enxergar o paciente (RLS de `pacientes`) — ninguém
-- pendura orientação em paciente de outra.
create table if not exists {schema}.orientacoes (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  modelo_id uuid references {schema}.modelos_orientacao(id) on delete set null,
  titulo text not null,
  conteudo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists orientacoes_paciente_created_idx on {schema}.orientacoes (paciente_id, created_at desc);
create index if not exists orientacoes_nutri_idx on {schema}.orientacoes (nutricionista_id);
grant all on {schema}.orientacoes to anon, authenticated, service_role;
alter table {schema}.orientacoes enable row level security;

drop policy if exists "orientacoes: ler as proprias ou master" on {schema}.orientacoes;
create policy "orientacoes: ler as proprias ou master" on {schema}.orientacoes
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "orientacoes: criar as proprias ou master" on {schema}.orientacoes;
create policy "orientacoes: criar as proprias ou master" on {schema}.orientacoes
  for insert to authenticated with check (
    {schema}.eh_master()
    or (nutricionista_id = auth.uid() and exists (select 1 from {schema}.pacientes p where p.id = paciente_id))
  );
drop policy if exists "orientacoes: editar as proprias ou master" on {schema}.orientacoes;
create policy "orientacoes: editar as proprias ou master" on {schema}.orientacoes
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "orientacoes: apagar as proprias ou master" on {schema}.orientacoes;
create policy "orientacoes: apagar as proprias ou master" on {schema}.orientacoes
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_orientacoes_updated_at on {schema}.orientacoes;
create trigger trg_orientacoes_updated_at before update on {schema}.orientacoes
  for each row execute function {schema}.set_updated_at();

-- Mexer numa orientação atualiza `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_orientacoes_toca_paciente on {schema}.orientacoes;
create trigger trg_orientacoes_toca_paciente after insert or update on {schema}.orientacoes
  for each row execute function {schema}.tocar_paciente();
