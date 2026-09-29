-- PhysiqNutri — W7 Cálculo energético. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919060000_calculo_energetico.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1)
-- e do trigger genérico `tocar_paciente()` (W5).

-- Cálculos de gasto energético do paciente. `formula` = equação da taxa metabólica basal (TMB): Harris-Benedict
-- 1919 / revisada 1984 (Roza & Shizgal), Mifflin-St Jeor, FAO/OMS 1985 (por faixa de idade), Cunningham e Tinsley
-- (as duas últimas pela massa magra). Peso em kg, altura em cm, idade em anos. `fator_atividade` multiplica a TMB
-- (1.2 sedentário … 1.9 extremamente ativo); `atividades` jsonb [{descricao, met, minutos_por_dia}] soma o gasto
-- extra de cada atividade (MET × peso × horas, kcal/dia). `tmb`, `get` e `vet` são calculados pelo app ao salvar
-- (GET = TMB × fator + atividades; VET = GET + ajuste_kcal — déficit negativo / superávit positivo) e gravados pra
-- lista e PDF mostrarem o mesmo número que a nutricionista viu. Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.calculos_energeticos (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data timestamptz not null default now(),
  formula text not null default 'mifflin',
  peso numeric(5,2),
  altura numeric(5,2),
  idade integer,
  sexo text,
  massa_magra numeric(5,2),
  fator_atividade numeric(4,3) not null default 1.2,
  atividades jsonb not null default '[]'::jsonb,
  tmb numeric(7,2),
  get numeric(7,2),
  ajuste_kcal numeric(7,2) not null default 0,
  vet numeric(7,2),
  objetivo text not null default 'manter',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint calculos_energeticos_formula_chk check (formula in ('harris_benedict_1919', 'harris_benedict_1984', 'mifflin', 'fao_oms_1985', 'cunningham', 'tinsley')),
  constraint calculos_energeticos_sexo_chk check (sexo is null or sexo in ('masculino', 'feminino')),
  constraint calculos_energeticos_objetivo_chk check (objetivo in ('manter', 'emagrecer', 'ganhar')),
  constraint calculos_energeticos_peso_chk check (peso is null or (peso > 0 and peso < 1000)),
  constraint calculos_energeticos_altura_chk check (altura is null or (altura > 0 and altura < 1000)),
  constraint calculos_energeticos_idade_chk check (idade is null or (idade >= 0 and idade <= 130)),
  constraint calculos_energeticos_massa_magra_chk check (massa_magra is null or (massa_magra > 0 and massa_magra < 1000)),
  constraint calculos_energeticos_fator_chk check (fator_atividade >= 1 and fator_atividade <= 3),
  constraint calculos_energeticos_ajuste_chk check (ajuste_kcal > -10000 and ajuste_kcal < 10000),
  constraint calculos_energeticos_atividades_arr check (jsonb_typeof(atividades) = 'array')
);
create index if not exists calculos_energeticos_nutri_paciente_data_idx on {schema}.calculos_energeticos (nutricionista_id, paciente_id, data desc);
create index if not exists calculos_energeticos_paciente_idx on {schema}.calculos_energeticos (paciente_id);
grant all on {schema}.calculos_energeticos to anon, authenticated, service_role;
alter table {schema}.calculos_energeticos enable row level security;

drop policy if exists "calculos_energeticos: ler os proprios ou master" on {schema}.calculos_energeticos;
create policy "calculos_energeticos: ler os proprios ou master" on {schema}.calculos_energeticos
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "calculos_energeticos: criar os proprios ou master" on {schema}.calculos_energeticos;
create policy "calculos_energeticos: criar os proprios ou master" on {schema}.calculos_energeticos
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "calculos_energeticos: editar os proprios ou master" on {schema}.calculos_energeticos;
create policy "calculos_energeticos: editar os proprios ou master" on {schema}.calculos_energeticos
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "calculos_energeticos: apagar os proprios ou master" on {schema}.calculos_energeticos;
create policy "calculos_energeticos: apagar os proprios ou master" on {schema}.calculos_energeticos
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_calculos_energeticos_updated_at on {schema}.calculos_energeticos;
create trigger trg_calculos_energeticos_updated_at before update on {schema}.calculos_energeticos
  for each row execute function {schema}.set_updated_at();

-- Mexer num cálculo atualiza `pacientes.updated_at` (função genérica criada na W5).
drop trigger if exists trg_calculos_energeticos_toca_paciente on {schema}.calculos_energeticos;
create trigger trg_calculos_energeticos_toca_paciente after insert or update on {schema}.calculos_energeticos
  for each row execute function {schema}.tocar_paciente();
