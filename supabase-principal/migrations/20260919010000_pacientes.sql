-- PhysiqNutri — W1 Pacientes. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919010000_pacientes.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at).

-- Texto único de busca (nome, apelido, e-mail, CPF, telefone e tags) — imutável pra virar coluna gerada.
create or replace function {schema}.texto_busca_paciente(nome text, apelido text, email text, cpf text, telefone text, tags text[])
returns text language sql immutable as $$
  select lower(concat_ws(' ', nome, apelido, email, cpf, telefone, array_to_string(tags, ' ')));
$$;

create table if not exists {schema}.pacientes (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  apelido text,
  cpf text,                                   -- só dígitos (formatação na tela)
  telefone text,                              -- só dígitos
  email text,
  nascimento date,
  genero text check (genero is null or genero in ('masculino', 'feminino', 'outro')),
  foto_url text,
  resumo text,
  tags text[] not null default '{}',
  link_codigo text not null default substr(md5(gen_random_uuid()::text), 1, 10),  -- link público do paciente (W2/W30)
  ativo boolean not null default true,        -- "desativar" = ativo=false (paciente continua no banco)
  config jsonb not null default '{}'::jsonb,  -- ajustes do perfil (W2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                      -- lixeira (W32)
);
alter table {schema}.pacientes add column if not exists busca text
  generated always as ({schema}.texto_busca_paciente(nome, apelido, email, cpf, telefone, tags)) stored;

create unique index if not exists pacientes_link_codigo_uq on {schema}.pacientes (link_codigo);
create index if not exists pacientes_nutri_updated_idx on {schema}.pacientes (nutricionista_id, updated_at desc);
create index if not exists pacientes_nutri_nome_idx on {schema}.pacientes (nutricionista_id, lower(nome));
create index if not exists pacientes_tags_gin on {schema}.pacientes using gin (tags);
grant all on {schema}.pacientes to anon, authenticated, service_role;
alter table {schema}.pacientes enable row level security;

-- RLS: cada nutricionista só enxerga/mexe nos próprios pacientes; master vê e edita todos.
drop policy if exists "pacientes: ler os proprios ou master" on {schema}.pacientes;
create policy "pacientes: ler os proprios ou master" on {schema}.pacientes
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop policy if exists "pacientes: criar os proprios ou master" on {schema}.pacientes;
create policy "pacientes: criar os proprios ou master" on {schema}.pacientes
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());

drop policy if exists "pacientes: editar os proprios ou master" on {schema}.pacientes;
create policy "pacientes: editar os proprios ou master" on {schema}.pacientes
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());

drop policy if exists "pacientes: apagar os proprios ou master" on {schema}.pacientes;
create policy "pacientes: apagar os proprios ou master" on {schema}.pacientes
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_pacientes_updated_at on {schema}.pacientes;
create trigger trg_pacientes_updated_at before update on {schema}.pacientes
  for each row execute function {schema}.set_updated_at();
