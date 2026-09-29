-- PhysiqNutri — W25 Acompanhamento gestacional. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920000000_gestacional.sql`
-- (roda em public E staging, trocando {schema}). Sem bloco compartilhado.
-- Depende da base (eh_master, set_updated_at), de pacientes (W1) e do trigger genérico tocar_paciente() (W5).

-- Acompanhamento gestacional = ganho de peso por semana gestacional contra a faixa recomendada pelo IMC pré-gestacional
-- (IOM 2009). A referência só mostra o vazio ('Nenhum acompanhamento' / 'iniciar acompanhamento gestacional'); o
-- acompanhamento em si é nosso.
--   `gestacoes`               = 1 linha por gestação: DUM (última menstruação), DPP (parto provável = DUM + 280 dias,
--                               calculada pelo app e gravada), peso/altura/IMC pré-gestacionais (o app calcula o IMC),
--                               gemelar, observação e `encerrada_em` (parto/encerramento; ATIVA = null).
--                               1 gestação ATIVA por paciente (índice único PARCIAL). Exclusão SOFT (Lixeira, W32).
--   `registros_gestacionais`  = pesagens da gestação: data, peso, pressão arterial opcional (em PAR) e observação.
--                               1 registro VIVO por gestação/dia (índice único PARCIAL): o app faz upsert MANUAL
--                               (busca o vivo do dia → update; senão insert; 23505 → update). Exclusão SOFT.
create table if not exists {schema}.gestacoes (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  dum date not null,                                   -- data da última menstruação
  dpp date not null,                                   -- data provável do parto (dum + 280 dias, gravada pelo app)
  peso_pre numeric not null,                           -- kg, pré-gestacional
  altura numeric not null,                             -- cm
  imc_pre numeric not null,                            -- calculado pelo app (peso_pre / (altura/100)^2)
  gemelar boolean not null default false,
  observacao text,
  encerrada_em timestamptz,                            -- parto/encerramento; ativa = null
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                              -- lixeira (W32)
  constraint gestacoes_peso_pre_chk check (peso_pre >= 20 and peso_pre <= 300),
  constraint gestacoes_altura_chk check (altura >= 100 and altura <= 250),
  constraint gestacoes_imc_pre_chk check (imc_pre > 0 and imc_pre < 200),
  constraint gestacoes_dpp_chk check (dpp > dum),
  constraint gestacoes_observacao_chk check (observacao is null or char_length(observacao) <= 300)
);
create unique index if not exists gestacoes_paciente_ativa_uidx
  on {schema}.gestacoes (paciente_id) where deleted_at is null and encerrada_em is null;
create index if not exists gestacoes_paciente_idx on {schema}.gestacoes (paciente_id, created_at desc);
create index if not exists gestacoes_nutri_idx on {schema}.gestacoes (nutricionista_id);
grant all on {schema}.gestacoes to anon, authenticated, service_role;
alter table {schema}.gestacoes enable row level security;

drop policy if exists "gestacoes: ler as proprias ou master" on {schema}.gestacoes;
create policy "gestacoes: ler as proprias ou master" on {schema}.gestacoes
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente (RLS de `pacientes`): fecha a brecha de pendurar gestação em paciente de outra nutricionista
drop policy if exists "gestacoes: criar as proprias ou master" on {schema}.gestacoes;
create policy "gestacoes: criar as proprias ou master" on {schema}.gestacoes
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "gestacoes: editar as proprias ou master" on {schema}.gestacoes;
create policy "gestacoes: editar as proprias ou master" on {schema}.gestacoes
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "gestacoes: apagar as proprias ou master" on {schema}.gestacoes;
create policy "gestacoes: apagar as proprias ou master" on {schema}.gestacoes
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_gestacoes_updated_at on {schema}.gestacoes;
create trigger trg_gestacoes_updated_at before update on {schema}.gestacoes
  for each row execute function {schema}.set_updated_at();

-- Gestação iniciada/editada mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_gestacoes_toca_paciente on {schema}.gestacoes;
create trigger trg_gestacoes_toca_paciente after insert or update on {schema}.gestacoes
  for each row execute function {schema}.tocar_paciente();

-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists {schema}.registros_gestacionais (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  gestacao_id uuid not null references {schema}.gestacoes(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data date not null default current_date,             -- o dia da pesagem (o app sempre manda; padrão hoje)
  peso numeric not null,                               -- kg
  pa_sistolica integer,                                -- mmHg, opcional — sempre em PAR com a diastólica
  pa_diastolica integer,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                              -- lixeira (W32)
  constraint registros_gestacionais_peso_chk check (peso >= 20 and peso <= 300),
  constraint registros_gestacionais_pa_sis_chk check (pa_sistolica is null or (pa_sistolica >= 50 and pa_sistolica <= 260)),
  constraint registros_gestacionais_pa_dia_chk check (pa_diastolica is null or (pa_diastolica >= 30 and pa_diastolica <= 160)),
  constraint registros_gestacionais_pa_par_chk check ((pa_sistolica is null) = (pa_diastolica is null)),
  constraint registros_gestacionais_pa_ordem_chk check (pa_sistolica is null or pa_diastolica is null or pa_sistolica > pa_diastolica),
  constraint registros_gestacionais_observacao_chk check (observacao is null or char_length(observacao) <= 300)
);
create unique index if not exists registros_gestacionais_gestacao_dia_vivo_uidx
  on {schema}.registros_gestacionais (gestacao_id, data) where deleted_at is null;
create index if not exists registros_gestacionais_gestacao_data_idx on {schema}.registros_gestacionais (gestacao_id, data desc);
create index if not exists registros_gestacionais_paciente_idx on {schema}.registros_gestacionais (paciente_id, data desc);
create index if not exists registros_gestacionais_nutri_idx on {schema}.registros_gestacionais (nutricionista_id);
grant all on {schema}.registros_gestacionais to anon, authenticated, service_role;
alter table {schema}.registros_gestacionais enable row level security;

drop policy if exists "registros_gestacionais: ler os proprios ou master" on {schema}.registros_gestacionais;
create policy "registros_gestacionais: ler os proprios ou master" on {schema}.registros_gestacionais
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente E a gestação (RLS das duas tabelas), e a gestação tem que ser do mesmo paciente
drop policy if exists "registros_gestacionais: criar os proprios ou master" on {schema}.registros_gestacionais;
create policy "registros_gestacionais: criar os proprios ou master" on {schema}.registros_gestacionais
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
      and exists (select 1 from {schema}.gestacoes g where g.id = gestacao_id and g.paciente_id = paciente_id)
    )
  );
drop policy if exists "registros_gestacionais: editar os proprios ou master" on {schema}.registros_gestacionais;
create policy "registros_gestacionais: editar os proprios ou master" on {schema}.registros_gestacionais
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "registros_gestacionais: apagar os proprios ou master" on {schema}.registros_gestacionais;
create policy "registros_gestacionais: apagar os proprios ou master" on {schema}.registros_gestacionais
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_registros_gestacionais_updated_at on {schema}.registros_gestacionais;
create trigger trg_registros_gestacionais_updated_at before update on {schema}.registros_gestacionais
  for each row execute function {schema}.set_updated_at();

-- Pesagem registrada/editada mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_registros_gestacionais_toca_paciente on {schema}.registros_gestacionais;
create trigger trg_registros_gestacionais_toca_paciente after insert or update on {schema}.registros_gestacionais
  for each row execute function {schema}.tocar_paciente();
