-- PhysiqNutri — W26 Suplementos e produtos. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920010000_suplementos.sql`
-- (roda em public E staging, trocando {schema}). Sem bloco compartilhado.
-- Depende da base (eh_master, set_updated_at), de pacientes (W1) e do trigger genérico tocar_paciente() (W5).

-- A referência (WDMarket) é um marketplace de afiliados e a tela do paciente só mostra o vazio ('Nenhum produto indicado' /
-- 'criar lista de produtos'). O nosso é o CATÁLOGO DA NUTRICIONISTA + a lista de produtos indicados por paciente:
--   `produtos`            = catálogo da nutricionista (nome, marca, categoria, apresentação, dose padrão, modo de uso, link,
--                           observação, favorito ★). Sem paciente. Exclusão SOFT (Lixeira, W32).
--   `indicacoes_produto`  = produtos indicados pro paciente. Guarda a PRÓPRIA CÓPIA de nome/marca/apresentação/categoria do
--                           produto no momento da indicação (como os ativos da W17): editar ou excluir o catálogo depois NÃO
--                           reescreve o histórico do paciente. `produto_id` só documenta a origem (set null se o produto sumir;
--                           null quando a nutricionista indicou por nome livre). Dose, horário, duração, início, `ativa`
--                           (Encerrar/Reativar, reversível) e `ordem` (só entre as ativas). Exclusão SOFT.
create table if not exists {schema}.produtos (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  marca text not null default '',
  categoria text not null default 'suplemento',
  apresentacao text not null default '',           -- ex.: 'pote 1 kg', 'cápsula 500 mg'
  dose_padrao text not null default '',            -- ex.: '30 g' (pré-preenche a dose da indicação)
  modo_uso text not null default '',
  link text not null default '',                   -- URL opcional (o app valida http(s) quando preenchido)
  observacao text not null default '',
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                          -- lixeira (W32)
  constraint produtos_nome_chk check (char_length(nome) between 1 and 120),
  constraint produtos_categoria_chk check (categoria in ('suplemento', 'vitamina', 'mineral', 'fitoterapico', 'alimento_funcional', 'outro')),
  constraint produtos_marca_chk check (char_length(marca) <= 300),
  constraint produtos_apresentacao_chk check (char_length(apresentacao) <= 300),
  constraint produtos_dose_padrao_chk check (char_length(dose_padrao) <= 300),
  constraint produtos_modo_uso_chk check (char_length(modo_uso) <= 300),
  constraint produtos_link_chk check (char_length(link) <= 500),
  constraint produtos_observacao_chk check (char_length(observacao) <= 300)
);
create index if not exists produtos_nutri_nome_idx on {schema}.produtos (nutricionista_id, nome);
create index if not exists produtos_nutri_favorito_idx on {schema}.produtos (nutricionista_id, favorito desc);
grant all on {schema}.produtos to anon, authenticated, service_role;
alter table {schema}.produtos enable row level security;

drop policy if exists "produtos: ler os proprios ou master" on {schema}.produtos;
create policy "produtos: ler os proprios ou master" on {schema}.produtos
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "produtos: criar os proprios ou master" on {schema}.produtos;
create policy "produtos: criar os proprios ou master" on {schema}.produtos
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "produtos: editar os proprios ou master" on {schema}.produtos;
create policy "produtos: editar os proprios ou master" on {schema}.produtos
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "produtos: apagar os proprios ou master" on {schema}.produtos;
create policy "produtos: apagar os proprios ou master" on {schema}.produtos
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_produtos_updated_at on {schema}.produtos;
create trigger trg_produtos_updated_at before update on {schema}.produtos
  for each row execute function {schema}.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists {schema}.indicacoes_produto (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  produto_id uuid references {schema}.produtos(id) on delete set null,   -- origem; null = nome livre
  produto_nome text not null,                      -- CÓPIA do produto no momento da indicação
  produto_marca text not null default '',
  produto_apresentacao text not null default '',
  produto_categoria text not null default 'suplemento',
  dose text not null,                              -- ex.: '30 g'
  horario text not null default '',                -- ex.: 'manhã, em jejum'
  duracao text not null default '',                -- ex.: '90 dias' · 'contínuo'
  inicio date not null default current_date,
  ativa boolean not null default true,             -- Encerrar/Reativar (reversível)
  ordem integer not null default 0,                -- posição entre as ATIVAS (0..n)
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                          -- lixeira (W32)
  constraint indicacoes_produto_nome_chk check (char_length(produto_nome) between 1 and 120),
  constraint indicacoes_produto_categoria_chk check (produto_categoria in ('suplemento', 'vitamina', 'mineral', 'fitoterapico', 'alimento_funcional', 'outro')),
  constraint indicacoes_produto_dose_chk check (char_length(dose) between 1 and 120),
  constraint indicacoes_produto_marca_chk check (char_length(produto_marca) <= 300),
  constraint indicacoes_produto_apresentacao_chk check (char_length(produto_apresentacao) <= 300),
  constraint indicacoes_produto_horario_chk check (char_length(horario) <= 300),
  constraint indicacoes_produto_duracao_chk check (char_length(duracao) <= 300),
  constraint indicacoes_produto_observacao_chk check (char_length(observacao) <= 300),
  constraint indicacoes_produto_ordem_chk check (ordem >= 0)
);
create index if not exists indicacoes_produto_paciente_idx on {schema}.indicacoes_produto (paciente_id, ativa desc, ordem, created_at);
create index if not exists indicacoes_produto_nutri_idx on {schema}.indicacoes_produto (nutricionista_id);
create index if not exists indicacoes_produto_produto_idx on {schema}.indicacoes_produto (produto_id);
grant all on {schema}.indicacoes_produto to anon, authenticated, service_role;
alter table {schema}.indicacoes_produto enable row level security;

drop policy if exists "indicacoes_produto: ler as proprias ou master" on {schema}.indicacoes_produto;
create policy "indicacoes_produto: ler as proprias ou master" on {schema}.indicacoes_produto
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente (RLS de `pacientes`) E, quando aponta pra um produto, que ele seja da MESMA nutricionista
drop policy if exists "indicacoes_produto: criar as proprias ou master" on {schema}.indicacoes_produto;
create policy "indicacoes_produto: criar as proprias ou master" on {schema}.indicacoes_produto
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
      and (produto_id is null or exists (select 1 from {schema}.produtos pr where pr.id = produto_id and pr.nutricionista_id = auth.uid()))
    )
  );
drop policy if exists "indicacoes_produto: editar as proprias ou master" on {schema}.indicacoes_produto;
create policy "indicacoes_produto: editar as proprias ou master" on {schema}.indicacoes_produto
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "indicacoes_produto: apagar as proprias ou master" on {schema}.indicacoes_produto;
create policy "indicacoes_produto: apagar as proprias ou master" on {schema}.indicacoes_produto
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_indicacoes_produto_updated_at on {schema}.indicacoes_produto;
create trigger trg_indicacoes_produto_updated_at before update on {schema}.indicacoes_produto
  for each row execute function {schema}.set_updated_at();

-- Indicação criada/editada mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_indicacoes_produto_toca_paciente on {schema}.indicacoes_produto;
create trigger trg_indicacoes_produto_toca_paciente after insert or update on {schema}.indicacoes_produto
  for each row execute function {schema}.tocar_paciente();
