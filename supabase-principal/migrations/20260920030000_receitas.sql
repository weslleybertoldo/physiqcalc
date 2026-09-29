-- PhysiqNutri — W28 Receitas culinárias. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920030000_receitas.sql`
-- (roda em public E staging, trocando {schema}). Sem bloco compartilhado.
-- Depende da base (eh_master, set_updated_at), de alimentos/medidas_caseiras (W8) e de itens_refeicao (W9).

-- A referência lista receitas 'Calculadas' (nome · PIN · tipo · PDF | Detalhes) com busca, 'criar nova receita culinária',
-- 'criar grupo de receitas' e filtros Favoritas/Webdiet/Extensões/Grupos. O nosso: SÓ receitas da nutricionista, CALCULADAS a
-- partir dos ingredientes (alimentos TACO + próprios da W8) — totais e valor por PORÇÃO saem dos ingredientes, nada é digitado.
--   `grupos_receita`        = pastas da nutricionista (nome único entre os VIVOS, sem caixa). Exclusão SOFT; as receitas do grupo
--                             ficam sem grupo.
--   `receitas`              = nome, grupo, porções, rendimento (peso final pronto; NULL = soma das gramas dos ingredientes), tempo de
--                             preparo, modo de preparo (markdown simples da W10), observação, favorita ★. Exclusão SOFT (Lixeira, W32).
--   `ingredientes_receita`  = alimento + `quantidade_g` SEMPRE gravada (quando a nutricionista escolhe por medida caseira,
--                             `medida_caseira_id` + `quantidade_medida` só documentam a origem, como nos itens da W9). RLS VIA RECEITA.
--                             Hard delete: editar a receita apaga e regrava os ingredientes; a Lixeira guarda a receita.
--   `itens_refeicao.receita_id` = de qual receita o item do plano veio (atalho 'Da receita' no editor da W9). Só DOCUMENTA a origem:
--                             `alimento_id` continua obrigatório e os cálculos/PDF do plano não mudam. Soft delete da receita não mexe nele.

-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists {schema}.grupos_receita (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                          -- lixeira (W32)
  constraint grupos_receita_nome_chk check (char_length(nome) between 1 and 60),
  constraint grupos_receita_ordem_chk check (ordem >= 0)
);
-- 1 nome vivo por nutricionista, sem caixa ('Lanches' = 'lanches'); o excluído (soft) libera o nome.
create unique index if not exists grupos_receita_nutri_nome_uniq on {schema}.grupos_receita (nutricionista_id, lower(nome)) where deleted_at is null;
create index if not exists grupos_receita_nutri_idx on {schema}.grupos_receita (nutricionista_id, ordem, nome);
grant all on {schema}.grupos_receita to anon, authenticated, service_role;
alter table {schema}.grupos_receita enable row level security;

drop policy if exists "grupos_receita: ler os proprios ou master" on {schema}.grupos_receita;
create policy "grupos_receita: ler os proprios ou master" on {schema}.grupos_receita
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "grupos_receita: criar os proprios ou master" on {schema}.grupos_receita;
create policy "grupos_receita: criar os proprios ou master" on {schema}.grupos_receita
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "grupos_receita: editar os proprios ou master" on {schema}.grupos_receita;
create policy "grupos_receita: editar os proprios ou master" on {schema}.grupos_receita
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "grupos_receita: apagar os proprios ou master" on {schema}.grupos_receita;
create policy "grupos_receita: apagar os proprios ou master" on {schema}.grupos_receita
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_grupos_receita_updated_at on {schema}.grupos_receita;
create trigger trg_grupos_receita_updated_at before update on {schema}.grupos_receita
  for each row execute function {schema}.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists {schema}.receitas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  grupo_id uuid references {schema}.grupos_receita(id) on delete set null,
  nome text not null,
  porcoes numeric(6,2) not null default 1,          -- quantas porções a receita rende
  rendimento_g numeric(8,2),                        -- peso final pronto (g); NULL = soma das gramas dos ingredientes
  tempo_preparo_min integer,                        -- minutos; NULL = não informado
  modo_preparo text not null default '',            -- markdown simples (W10): ## título, - item, **negrito**
  observacao text not null default '',
  favorita boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                           -- lixeira (W32)
  constraint receitas_nome_chk check (char_length(nome) between 1 and 120),
  constraint receitas_porcoes_chk check (porcoes > 0),
  constraint receitas_rendimento_chk check (rendimento_g is null or rendimento_g > 0),
  constraint receitas_tempo_chk check (tempo_preparo_min is null or tempo_preparo_min >= 0),
  constraint receitas_modo_preparo_chk check (char_length(modo_preparo) <= 8000),
  constraint receitas_observacao_chk check (char_length(observacao) <= 1000)
);
create index if not exists receitas_nutri_nome_idx on {schema}.receitas (nutricionista_id, nome);
create index if not exists receitas_nutri_favorita_idx on {schema}.receitas (nutricionista_id, favorita desc);
create index if not exists receitas_grupo_idx on {schema}.receitas (grupo_id);
grant all on {schema}.receitas to anon, authenticated, service_role;
alter table {schema}.receitas enable row level security;

drop policy if exists "receitas: ler as proprias ou master" on {schema}.receitas;
create policy "receitas: ler as proprias ou master" on {schema}.receitas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "receitas: criar as proprias ou master" on {schema}.receitas;
create policy "receitas: criar as proprias ou master" on {schema}.receitas
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "receitas: editar as proprias ou master" on {schema}.receitas;
create policy "receitas: editar as proprias ou master" on {schema}.receitas
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "receitas: apagar as proprias ou master" on {schema}.receitas;
create policy "receitas: apagar as proprias ou master" on {schema}.receitas
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_receitas_updated_at on {schema}.receitas;
create trigger trg_receitas_updated_at before update on {schema}.receitas
  for each row execute function {schema}.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists {schema}.ingredientes_receita (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references {schema}.receitas(id) on delete cascade,
  alimento_id uuid not null references {schema}.alimentos(id),                      -- sem cascade (como itens_refeicao)
  quantidade_g numeric(8,2) not null,                                               -- SEMPRE gravada (é o que entra na conta)
  medida_caseira_id uuid references {schema}.medidas_caseiras(id) on delete set null,   -- origem, quando escolhida por medida
  quantidade_medida numeric(6,2),                                                   -- ex.: 2 (× 'colher de sopa' 15 g = 30 g)
  ordem integer not null default 0,
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredientes_receita_quantidade_chk check (quantidade_g > 0),
  constraint ingredientes_receita_qtd_medida_chk check (quantidade_medida is null or quantidade_medida > 0),
  constraint ingredientes_receita_ordem_chk check (ordem >= 0),
  constraint ingredientes_receita_observacao_chk check (char_length(observacao) <= 300)
);
create index if not exists ingredientes_receita_receita_idx on {schema}.ingredientes_receita (receita_id, ordem);
create index if not exists ingredientes_receita_alimento_idx on {schema}.ingredientes_receita (alimento_id);
grant all on {schema}.ingredientes_receita to anon, authenticated, service_role;
alter table {schema}.ingredientes_receita enable row level security;

-- RLS VIA RECEITA: o ingrediente é da dona da receita (ou master) nos 4 comandos.
drop policy if exists "ingredientes_receita: ler pela receita" on {schema}.ingredientes_receita;
create policy "ingredientes_receita: ler pela receita" on {schema}.ingredientes_receita
  for select to authenticated
  using (exists (select 1 from {schema}.receitas r where r.id = receita_id and (r.nutricionista_id = auth.uid() or {schema}.eh_master())));
drop policy if exists "ingredientes_receita: criar pela receita" on {schema}.ingredientes_receita;
create policy "ingredientes_receita: criar pela receita" on {schema}.ingredientes_receita
  for insert to authenticated
  with check (exists (select 1 from {schema}.receitas r where r.id = receita_id and (r.nutricionista_id = auth.uid() or {schema}.eh_master())));
drop policy if exists "ingredientes_receita: editar pela receita" on {schema}.ingredientes_receita;
create policy "ingredientes_receita: editar pela receita" on {schema}.ingredientes_receita
  for update to authenticated
  using (exists (select 1 from {schema}.receitas r where r.id = receita_id and (r.nutricionista_id = auth.uid() or {schema}.eh_master())))
  with check (exists (select 1 from {schema}.receitas r where r.id = receita_id and (r.nutricionista_id = auth.uid() or {schema}.eh_master())));
drop policy if exists "ingredientes_receita: apagar pela receita" on {schema}.ingredientes_receita;
create policy "ingredientes_receita: apagar pela receita" on {schema}.ingredientes_receita
  for delete to authenticated
  using (exists (select 1 from {schema}.receitas r where r.id = receita_id and (r.nutricionista_id = auth.uid() or {schema}.eh_master())));

drop trigger if exists trg_ingredientes_receita_updated_at on {schema}.ingredientes_receita;
create trigger trg_ingredientes_receita_updated_at before update on {schema}.ingredientes_receita
  for each row execute function {schema}.set_updated_at();

-- Mexer nos ingredientes toca `receitas.updated_at` (a lista ordena/atualiza pela receita).
create or replace function {schema}.tocar_receita() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    update {schema}.receitas set updated_at = now() where id = old.receita_id;
    return old;
  end if;
  update {schema}.receitas set updated_at = now() where id = new.receita_id;
  return new;
end;
$$;
drop trigger if exists trg_ingredientes_receita_toca_receita on {schema}.ingredientes_receita;
create trigger trg_ingredientes_receita_toca_receita after insert or update or delete on {schema}.ingredientes_receita
  for each row execute function {schema}.tocar_receita();

-- ---------------------------------------------------------------------------------------------------------------------
-- Item do plano (W9) que veio de uma receita: só documenta a origem (alimento_id continua NOT NULL; conta e PDF não mudam).
alter table {schema}.itens_refeicao add column if not exists receita_id uuid references {schema}.receitas(id) on delete set null;
create index if not exists itens_refeicao_receita_idx on {schema}.itens_refeicao (receita_id);
