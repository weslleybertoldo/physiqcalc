-- PhysiqNutri — W12 Financeiro do consultório. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919110000_financeiro.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1) e do
-- trigger genérico tocar_paciente() (W5).

-- Categorias livres das movimentações (referência: "categorias" do Financeiro). As 6 padrão (Consulta, Retorno, Plano
-- alimentar, Aluguel, Material, Outros) nascem pelo app no 1º acesso da nutricionista. Exclusão SOFT: a transação antiga
-- continua apontando pra categoria pelo id (o nome segue aparecendo na lista). O nome é único entre as categorias VIVAS
-- da mesma nutricionista, sem caixa — índice parcial em vez de unique(nutricionista_id, nome) pra não travar recriar um
-- nome que foi pra lixeira.
create table if not exists {schema}.categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create unique index if not exists categorias_financeiras_nutri_nome_uidx
  on {schema}.categorias_financeiras (nutricionista_id, lower(nome)) where deleted_at is null;
create index if not exists categorias_financeiras_nutri_idx on {schema}.categorias_financeiras (nutricionista_id);
grant all on {schema}.categorias_financeiras to anon, authenticated, service_role;
alter table {schema}.categorias_financeiras enable row level security;

drop policy if exists "categorias_financeiras: ler as proprias ou master" on {schema}.categorias_financeiras;
create policy "categorias_financeiras: ler as proprias ou master" on {schema}.categorias_financeiras
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "categorias_financeiras: criar as proprias ou master" on {schema}.categorias_financeiras;
create policy "categorias_financeiras: criar as proprias ou master" on {schema}.categorias_financeiras
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "categorias_financeiras: editar as proprias ou master" on {schema}.categorias_financeiras;
create policy "categorias_financeiras: editar as proprias ou master" on {schema}.categorias_financeiras
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "categorias_financeiras: apagar as proprias ou master" on {schema}.categorias_financeiras;
create policy "categorias_financeiras: apagar as proprias ou master" on {schema}.categorias_financeiras
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_categorias_financeiras_updated_at on {schema}.categorias_financeiras;
create trigger trg_categorias_financeiras_updated_at before update on {schema}.categorias_financeiras
  for each row execute function {schema}.set_updated_at();

-- Movimentações do consultório (referência: "adicionar nova movimentação" — descrição, data, categoria, método, valor;
-- estornar; ver detalhes; emitir recibo fica pra W13). `tipo` entrada/saída; `valor` sempre POSITIVO (o tipo dá o
-- sinal); `data` é só a data (coluna date); `estornada` tira a movimentação dos totais sem apagar o histórico;
-- `paciente_id` é opcional (a W13 lista as do paciente); `recibo_id` fica sem FK até a W13 criar `recibos`.
-- Exclusão SOFT (Lixeira, W32). Na criação com paciente, a nutricionista precisa enxergar o paciente (RLS de
-- `pacientes`, padrão da W10/W11) — ninguém pendura movimentação em paciente de outra.
create table if not exists {schema}.transacoes (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid references {schema}.pacientes(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  categoria_id uuid references {schema}.categorias_financeiras(id) on delete set null,
  metodo text not null check (metodo in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro')),
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  estornada boolean not null default false,
  observacao text,
  recibo_id uuid,                               -- a W13 cria `recibos` e liga
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists transacoes_nutri_data_idx on {schema}.transacoes (nutricionista_id, data desc);
create index if not exists transacoes_paciente_idx on {schema}.transacoes (paciente_id);
create index if not exists transacoes_categoria_idx on {schema}.transacoes (categoria_id);
grant all on {schema}.transacoes to anon, authenticated, service_role;
alter table {schema}.transacoes enable row level security;

drop policy if exists "transacoes: ler as proprias ou master" on {schema}.transacoes;
create policy "transacoes: ler as proprias ou master" on {schema}.transacoes
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "transacoes: criar as proprias ou master" on {schema}.transacoes;
create policy "transacoes: criar as proprias ou master" on {schema}.transacoes
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and (paciente_id is null or exists (select 1 from {schema}.pacientes p where p.id = paciente_id))
    )
  );
drop policy if exists "transacoes: editar as proprias ou master" on {schema}.transacoes;
create policy "transacoes: editar as proprias ou master" on {schema}.transacoes
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "transacoes: apagar as proprias ou master" on {schema}.transacoes;
create policy "transacoes: apagar as proprias ou master" on {schema}.transacoes
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_transacoes_updated_at on {schema}.transacoes;
create trigger trg_transacoes_updated_at before update on {schema}.transacoes
  for each row execute function {schema}.set_updated_at();

-- Movimentação com paciente atualiza `pacientes.updated_at` (trigger genérico da W5). Sem paciente o `update ... where
-- id = null` não acharia linha nenhuma — o `when` evita a rodada à toa.
drop trigger if exists trg_transacoes_toca_paciente on {schema}.transacoes;
create trigger trg_transacoes_toca_paciente after insert or update on {schema}.transacoes
  for each row when (new.paciente_id is not null) execute function {schema}.tocar_paciente();
