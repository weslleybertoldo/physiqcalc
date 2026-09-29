-- PhysiqNutri — W6 Antropometria geral. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919050000_antropometria.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1)
-- e do trigger genérico `tocar_paciente()` (W5).

-- Avaliações antropométricas do paciente. Peso em kg, altura em cm, circunferências em cm ({"cintura": 80.5, ...}),
-- dobras cutâneas em mm ({"triceps": 12, ...}). `protocolo` diz quais dobras entram no % de gordura
-- (Jackson & Pollock 3/7, Faulkner, Guedes) ou "nenhum" (só medidas). `resultados` = o que o app calculou ao salvar
-- (IMC + classificação, densidade, % gordura, massa gorda/magra, RCQ, RCE) — gravado pra lista, gráfico e PDF
-- mostrarem o mesmo número que a nutricionista viu. Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.antropometrias (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data timestamptz not null default now(),
  peso numeric(5,2),
  altura numeric(5,2),
  sexo text,
  idade integer,
  circunferencias jsonb not null default '{}'::jsonb,
  dobras jsonb not null default '{}'::jsonb,
  protocolo text not null default 'nenhum',
  resultados jsonb not null default '{}'::jsonb,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint antropometrias_sexo_chk check (sexo is null or sexo in ('masculino', 'feminino')),
  constraint antropometrias_protocolo_chk check (protocolo in ('pollock3', 'pollock7', 'faulkner', 'guedes', 'nenhum')),
  constraint antropometrias_peso_chk check (peso is null or (peso > 0 and peso < 1000)),
  constraint antropometrias_altura_chk check (altura is null or (altura > 0 and altura < 1000)),
  constraint antropometrias_idade_chk check (idade is null or (idade >= 0 and idade <= 130)),
  constraint antropometrias_circunferencias_obj check (jsonb_typeof(circunferencias) = 'object'),
  constraint antropometrias_dobras_obj check (jsonb_typeof(dobras) = 'object'),
  constraint antropometrias_resultados_obj check (jsonb_typeof(resultados) = 'object')
);
create index if not exists antropometrias_nutri_paciente_data_idx on {schema}.antropometrias (nutricionista_id, paciente_id, data desc);
create index if not exists antropometrias_paciente_idx on {schema}.antropometrias (paciente_id);
grant all on {schema}.antropometrias to anon, authenticated, service_role;
alter table {schema}.antropometrias enable row level security;

drop policy if exists "antropometrias: ler as proprias ou master" on {schema}.antropometrias;
create policy "antropometrias: ler as proprias ou master" on {schema}.antropometrias
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "antropometrias: criar as proprias ou master" on {schema}.antropometrias;
create policy "antropometrias: criar as proprias ou master" on {schema}.antropometrias
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "antropometrias: editar as proprias ou master" on {schema}.antropometrias;
create policy "antropometrias: editar as proprias ou master" on {schema}.antropometrias
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "antropometrias: apagar as proprias ou master" on {schema}.antropometrias;
create policy "antropometrias: apagar as proprias ou master" on {schema}.antropometrias
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_antropometrias_updated_at on {schema}.antropometrias;
create trigger trg_antropometrias_updated_at before update on {schema}.antropometrias
  for each row execute function {schema}.set_updated_at();

-- Mexer numa avaliação atualiza `pacientes.updated_at` (função genérica criada na W5).
drop trigger if exists trg_antropometrias_toca_paciente on {schema}.antropometrias;
create trigger trg_antropometrias_toca_paciente after insert or update on {schema}.antropometrias
  for each row execute function {schema}.tocar_paciente();
