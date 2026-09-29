-- PhysiqNutri — W9 Planejamento alimentar. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919080000_planejamento.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1),
-- do trigger genérico `tocar_paciente()` (W5), de calculos_energeticos (W7) e de alimentos/medidas_caseiras (W8).

-- Plano alimentar do paciente ("prescrição alimentar" na referência). `metodo` = como o plano é montado — por
-- enquanto só 'alimentos' (refeições com alimentos e quantidades); outros métodos (equivalentes, grupos) ficam pra
-- depois. `kcal_alvo` = meta calórica do plano, pré-preenchida pelo VET do último cálculo energético
-- (`calculo_energetico_id` guarda a origem; se o cálculo sumir, o alvo fica). `favorito` alimenta Meus favoritos
-- (W29). Exclusão SOFT (Lixeira, W32); refeições e itens seguem o plano.
create table if not exists {schema}.planos_alimentares (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  titulo text not null,
  metodo text not null default 'alimentos',
  kcal_alvo numeric(7,2),
  calculo_energetico_id uuid references {schema}.calculos_energeticos(id) on delete set null,
  observacao text,
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint planos_alimentares_titulo_chk check (length(btrim(titulo)) > 0),
  constraint planos_alimentares_metodo_chk check (metodo in ('alimentos')),
  constraint planos_alimentares_kcal_alvo_chk check (kcal_alvo is null or (kcal_alvo > 0 and kcal_alvo < 100000))
);
create index if not exists planos_alimentares_paciente_idx on {schema}.planos_alimentares (paciente_id, created_at desc);
create index if not exists planos_alimentares_nutri_idx on {schema}.planos_alimentares (nutricionista_id, favorito);
grant all on {schema}.planos_alimentares to anon, authenticated, service_role;
alter table {schema}.planos_alimentares enable row level security;

drop policy if exists "planos: ler os proprios ou master" on {schema}.planos_alimentares;
create policy "planos: ler os proprios ou master" on {schema}.planos_alimentares
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "planos: criar os proprios ou master" on {schema}.planos_alimentares;
create policy "planos: criar os proprios ou master" on {schema}.planos_alimentares
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "planos: editar os proprios ou master" on {schema}.planos_alimentares;
create policy "planos: editar os proprios ou master" on {schema}.planos_alimentares
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "planos: apagar os proprios ou master" on {schema}.planos_alimentares;
create policy "planos: apagar os proprios ou master" on {schema}.planos_alimentares
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_planos_alimentares_updated_at on {schema}.planos_alimentares;
create trigger trg_planos_alimentares_updated_at before update on {schema}.planos_alimentares
  for each row execute function {schema}.set_updated_at();
-- Mexer num plano atualiza `pacientes.updated_at` (função genérica da W5).
drop trigger if exists trg_planos_alimentares_toca_paciente on {schema}.planos_alimentares;
create trigger trg_planos_alimentares_toca_paciente after insert or update on {schema}.planos_alimentares
  for each row execute function {schema}.tocar_paciente();

-- Refeições do plano (Café da manhã 07:00, Almoço 12:30, …). `ordem` define a sequência na tela e no PDF; `horario`
-- é só informativo. Apagar uma refeição apaga os itens dela (hard delete: a lixeira guarda o PLANO, não a refeição).
create table if not exists {schema}.refeicoes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references {schema}.planos_alimentares(id) on delete cascade,
  nome text not null,
  horario time,
  ordem integer not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refeicoes_nome_chk check (length(btrim(nome)) > 0),
  constraint refeicoes_ordem_chk check (ordem >= 0)
);
create index if not exists refeicoes_plano_ordem_idx on {schema}.refeicoes (plano_id, ordem);
grant all on {schema}.refeicoes to anon, authenticated, service_role;
alter table {schema}.refeicoes enable row level security;

-- RLS das refeições: seguem o plano (quem vê/mexe no plano vê/mexe nas refeições).
drop policy if exists "refeicoes: ler as do plano visivel" on {schema}.refeicoes;
create policy "refeicoes: ler as do plano visivel" on {schema}.refeicoes
  for select to authenticated using (exists (
    select 1 from {schema}.planos_alimentares p where p.id = plano_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));
drop policy if exists "refeicoes: criar nos planos proprios ou master" on {schema}.refeicoes;
create policy "refeicoes: criar nos planos proprios ou master" on {schema}.refeicoes
  for insert to authenticated with check (exists (
    select 1 from {schema}.planos_alimentares p where p.id = plano_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));
drop policy if exists "refeicoes: editar nos planos proprios ou master" on {schema}.refeicoes;
create policy "refeicoes: editar nos planos proprios ou master" on {schema}.refeicoes
  for update to authenticated
  using (exists (select 1 from {schema}.planos_alimentares p where p.id = plano_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())))
  with check (exists (select 1 from {schema}.planos_alimentares p where p.id = plano_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())));
drop policy if exists "refeicoes: apagar nos planos proprios ou master" on {schema}.refeicoes;
create policy "refeicoes: apagar nos planos proprios ou master" on {schema}.refeicoes
  for delete to authenticated using (exists (
    select 1 from {schema}.planos_alimentares p where p.id = plano_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));

drop trigger if exists trg_refeicoes_updated_at on {schema}.refeicoes;
create trigger trg_refeicoes_updated_at before update on {schema}.refeicoes
  for each row execute function {schema}.set_updated_at();

-- Mexer numa refeição ou num item atualiza `updated_at` do plano (e, pelo trigger do plano, o do paciente).
create or replace function {schema}.tocar_plano_da_refeicao() returns trigger
language plpgsql as $$
begin
  update {schema}.planos_alimentares set updated_at = now() where id = coalesce(new.plano_id, old.plano_id);
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_refeicoes_toca_plano on {schema}.refeicoes;
create trigger trg_refeicoes_toca_plano after insert or update or delete on {schema}.refeicoes
  for each row execute function {schema}.tocar_plano_da_refeicao();

-- Itens da refeição: um alimento (TACO ou próprio — W8) numa quantidade. `quantidade_g` é SEMPRE a quantidade em
-- gramas usada nos cálculos; quando a nutricionista escolhe por medida caseira, `medida_caseira_id` +
-- `quantidade_medida` guardam a origem ("2 × 1 fatia (25 g) = 50 g") e o app grava os gramas resultantes. O alimento
-- não some por baixo do item (sem cascade: a TACO é fixa e o alimento próprio é soft delete). `substitutos` jsonb =
-- [{alimento_id, nome, quantidade_g}] — opções equivalentes em kcal pro paciente trocar.
create table if not exists {schema}.itens_refeicao (
  id uuid primary key default gen_random_uuid(),
  refeicao_id uuid not null references {schema}.refeicoes(id) on delete cascade,
  alimento_id uuid not null references {schema}.alimentos(id),
  quantidade_g numeric(8,2) not null,
  medida_caseira_id uuid references {schema}.medidas_caseiras(id) on delete set null,
  quantidade_medida numeric(6,2),
  ordem integer not null default 0,
  substitutos jsonb not null default '[]'::jsonb,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itens_refeicao_quantidade_chk check (quantidade_g > 0 and quantidade_g < 100000),
  constraint itens_refeicao_quantidade_medida_chk check (quantidade_medida is null or (quantidade_medida > 0 and quantidade_medida < 10000)),
  constraint itens_refeicao_ordem_chk check (ordem >= 0),
  constraint itens_refeicao_substitutos_arr check (jsonb_typeof(substitutos) = 'array')
);
create index if not exists itens_refeicao_refeicao_ordem_idx on {schema}.itens_refeicao (refeicao_id, ordem);
create index if not exists itens_refeicao_alimento_idx on {schema}.itens_refeicao (alimento_id);
grant all on {schema}.itens_refeicao to anon, authenticated, service_role;
alter table {schema}.itens_refeicao enable row level security;

-- RLS dos itens: seguem a refeição → o plano.
drop policy if exists "itens: ler os do plano visivel" on {schema}.itens_refeicao;
create policy "itens: ler os do plano visivel" on {schema}.itens_refeicao
  for select to authenticated using (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));
drop policy if exists "itens: criar nos planos proprios ou master" on {schema}.itens_refeicao;
create policy "itens: criar nos planos proprios ou master" on {schema}.itens_refeicao
  for insert to authenticated with check (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));
drop policy if exists "itens: editar nos planos proprios ou master" on {schema}.itens_refeicao;
create policy "itens: editar nos planos proprios ou master" on {schema}.itens_refeicao
  for update to authenticated
  using (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ))
  with check (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));
drop policy if exists "itens: apagar nos planos proprios ou master" on {schema}.itens_refeicao;
create policy "itens: apagar nos planos proprios ou master" on {schema}.itens_refeicao
  for delete to authenticated using (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and (p.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));

drop trigger if exists trg_itens_refeicao_updated_at on {schema}.itens_refeicao;
create trigger trg_itens_refeicao_updated_at before update on {schema}.itens_refeicao
  for each row execute function {schema}.set_updated_at();

create or replace function {schema}.tocar_plano_do_item() returns trigger
language plpgsql as $$
begin
  update {schema}.planos_alimentares set updated_at = now()
  where id = (select r.plano_id from {schema}.refeicoes r where r.id = coalesce(new.refeicao_id, old.refeicao_id));
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_itens_refeicao_toca_plano on {schema}.itens_refeicao;
create trigger trg_itens_refeicao_toca_plano after insert or update or delete on {schema}.itens_refeicao
  for each row execute function {schema}.tocar_plano_do_item();
