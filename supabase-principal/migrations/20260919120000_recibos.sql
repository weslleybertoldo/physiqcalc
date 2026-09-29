-- PhysiqNutri — W13 Recibos e financeiro do paciente. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919120000_recibos.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1), do
-- trigger genérico tocar_paciente() (W5) e de transacoes (W12 — a coluna recibo_id já existe lá, sem FK).

-- Modelos de recibo (referência: recibo com as tags *|NOME_PACIENTE|*, *|NUMERO_DOCUMENTO_PACIENTE|*, *|VALOR_CONSULTA|*,
-- *|DATA_HOJE|*, *|CARIMBO|*; aqui também *|VALOR_POR_EXTENSO|*, *|NUMERO_RECIBO|* e *|NOME_NUTRICIONISTA|*). O "Recibo
-- padrão" nasce pelo app, favorito, no 1º acesso da nutricionista à seção. Exclusão SOFT (Lixeira, W32): o recibo já
-- emitido guarda o TEXTO final, então não depende do modelo.
create table if not exists {schema}.modelos_recibo (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists modelos_recibo_nutri_idx on {schema}.modelos_recibo (nutricionista_id);
grant all on {schema}.modelos_recibo to anon, authenticated, service_role;
alter table {schema}.modelos_recibo enable row level security;

drop policy if exists "modelos_recibo: ler os proprios ou master" on {schema}.modelos_recibo;
create policy "modelos_recibo: ler os proprios ou master" on {schema}.modelos_recibo
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_recibo: criar os proprios ou master" on {schema}.modelos_recibo;
create policy "modelos_recibo: criar os proprios ou master" on {schema}.modelos_recibo
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_recibo: editar os proprios ou master" on {schema}.modelos_recibo;
create policy "modelos_recibo: editar os proprios ou master" on {schema}.modelos_recibo
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "modelos_recibo: apagar os proprios ou master" on {schema}.modelos_recibo;
create policy "modelos_recibo: apagar os proprios ou master" on {schema}.modelos_recibo
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_modelos_recibo_updated_at on {schema}.modelos_recibo;
create trigger trg_modelos_recibo_updated_at before update on {schema}.modelos_recibo
  for each row execute function {schema}.set_updated_at();

-- Recibos emitidos. `numero` é sequencial POR nutricionista (0001, 0002…): nasce 0 e o trigger `numerar_recibo` troca
-- por max+1 dos recibos dela — inclusive os da lixeira, número emitido não volta — serializado por advisory lock;
-- unique (nutricionista_id, numero). `texto` é o conteúdo FINAL com as tags já substituídas (o recibo não muda se o
-- modelo mudar). `transacao_id` é opcional (recibo avulso) e `transacoes.recibo_id` aponta de volta (FK abaixo).
-- Paciente OBRIGATÓRIO (o recibo é dele); a criação exige enxergar o paciente (RLS de `pacientes`, padrão W10–W12).
-- Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.recibos (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  transacao_id uuid references {schema}.transacoes(id) on delete set null,
  modelo_id uuid references {schema}.modelos_recibo(id) on delete set null,
  numero integer not null default 0 check (numero > 0),
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  descricao text not null,
  texto text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  unique (nutricionista_id, numero)
);
create index if not exists recibos_paciente_idx on {schema}.recibos (paciente_id);
create index if not exists recibos_transacao_idx on {schema}.recibos (transacao_id);
grant all on {schema}.recibos to anon, authenticated, service_role;
alter table {schema}.recibos enable row level security;

drop policy if exists "recibos: ler os proprios ou master" on {schema}.recibos;
create policy "recibos: ler os proprios ou master" on {schema}.recibos
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "recibos: criar os proprios ou master" on {schema}.recibos;
create policy "recibos: criar os proprios ou master" on {schema}.recibos
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "recibos: editar os proprios ou master" on {schema}.recibos;
create policy "recibos: editar os proprios ou master" on {schema}.recibos
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "recibos: apagar os proprios ou master" on {schema}.recibos;
create policy "recibos: apagar os proprios ou master" on {schema}.recibos
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

-- Numeração sequencial por nutricionista (before insert). O `default 0` deixa o app inserir sem informar o número (a
-- coluna fica opcional nos types) e o check (numero > 0) garante que o trigger sempre numerou. Roda como quem insere:
-- a nutricionista enxerga todos os recibos dela pela RLS, então o max é o dela mesmo.
create or replace function {schema}.numerar_recibo() returns trigger
language plpgsql as $$
begin
  if new.numero is null or new.numero <= 0 then
    perform pg_advisory_xact_lock(hashtext('{schema}.recibos:' || new.nutricionista_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero
      from {schema}.recibos
     where nutricionista_id = new.nutricionista_id;
  end if;
  return new;
end
$$;
drop trigger if exists trg_recibos_numerar on {schema}.recibos;
create trigger trg_recibos_numerar before insert on {schema}.recibos
  for each row execute function {schema}.numerar_recibo();

drop trigger if exists trg_recibos_updated_at on {schema}.recibos;
create trigger trg_recibos_updated_at before update on {schema}.recibos
  for each row execute function {schema}.set_updated_at();

-- Recibo mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_recibos_toca_paciente on {schema}.recibos;
create trigger trg_recibos_toca_paciente after insert or update on {schema}.recibos
  for each row execute function {schema}.tocar_paciente();

-- `transacoes.recibo_id` (W12, sem FK) passa a apontar pro recibo; apagar o recibo (hard) solta a movimentação.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'transacoes_recibo_id_fkey' and conrelid = '{schema}.transacoes'::regclass
  ) then
    alter table {schema}.transacoes
      add constraint transacoes_recibo_id_fkey foreign key (recibo_id) references {schema}.recibos(id) on delete set null;
  end if;
end
$$;
create index if not exists transacoes_recibo_idx on {schema}.transacoes (recibo_id);
