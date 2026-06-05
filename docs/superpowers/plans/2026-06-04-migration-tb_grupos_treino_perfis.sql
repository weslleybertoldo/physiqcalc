-- Migration: tb_grupos_treino_perfis (treinos padrão visíveis por perfil)
-- Aplicada em 2026-06-04 no projeto uxwpwdbbnlticxgtzcsb via Supabase Management API
-- (POST /v1/projects/{ref}/database/query com o PAT pessoal sbp_).

create table if not exists public.tb_grupos_treino_perfis (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.tb_grupos_treino(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (grupo_id, user_id)
);

create index if not exists idx_grupos_treino_perfis_user
  on public.tb_grupos_treino_perfis (user_id);

alter table public.tb_grupos_treino_perfis enable row level security;

-- Admin (app_metadata.role = 'admin') gerencia tudo via supabase client.
drop policy if exists "admin_all_grupos_treino_perfis" on public.tb_grupos_treino_perfis;
create policy "admin_all_grupos_treino_perfis"
  on public.tb_grupos_treino_perfis
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert, update, delete on public.tb_grupos_treino_perfis to authenticated;

-- Replicação PowerSync:
alter publication powersync add table public.tb_grupos_treino_perfis;
