-- PhysiqNutri — W35 Configurações (engrenagem): preferências do perfil (tema, recebimento), cobranças por paciente e
-- bloqueio por pagamento. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920080000_configuracoes.sql` (roda em public E
-- staging trocando {schema}; o bloco depois do marcador compartilhado, no fim, roda 1x — o marcador NÃO pode aparecer em
-- comentário, o script divide o arquivo por ele). Depende da base (profiles, eh_master, set_updated_at), de pacientes (W1),
-- transacoes (W12), dos helpers do paciente (W34: eh_paciente, meu_paciente_id) e do pg_cron já instalado pela W32.

-- 1) Perfil: preferências (jsonb livre — hoje só `tema`: 'dark' | 'light') e forma de recebimento dos pacientes.
--    `recebimento`: 'manual' = a nutricionista marca a cobrança como paga; 'integracao' fica reservado (Mercado Pago/InfinitePay
--    entram quando ele der as credenciais — a tela avisa "em breve" e as cobranças continuam manuais).
alter table {schema}.profiles add column if not exists config jsonb not null default '{}'::jsonb;
alter table {schema}.profiles add column if not exists recebimento text not null default 'manual';
alter table {schema}.profiles drop constraint if exists profiles_recebimento_check;
alter table {schema}.profiles add constraint profiles_recebimento_check check (recebimento in ('manual', 'integracao'));

-- 2) Paciente: bloqueio por pagamento. A área do paciente (W34) já lê a coluna (`estaBloqueado`; ausente = false) e mostra
--    a tela 'Pagamento pendente'. Quem liga/desliga é a RPC abaixo (nunca a tela direto).
alter table {schema}.pacientes add column if not exists bloqueado_por_pagamento boolean not null default false;

-- 3) Cobranças por paciente (referência: "se o aluno não pagar, o app dele bloqueia até pagar"). Uma linha por cobrança:
--    descrição, valor, vencimento e status aberta → paga (com `pago_em` e, quando o financeiro permitir, a transação de
--    receita da W12 em `transacao_id`) ou cancelada. Exclusão SOFT (deleted_at) como as demais tabelas.
create table if not exists {schema}.cobrancas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  pago_em timestamptz,
  transacao_id uuid references {schema}.transacoes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cobrancas_nutri_venc_idx on {schema}.cobrancas (nutricionista_id, vencimento desc);
create index if not exists cobrancas_paciente_status_idx on {schema}.cobrancas (paciente_id, status);
grant all on {schema}.cobrancas to anon, authenticated, service_role;
alter table {schema}.cobrancas enable row level security;

-- nutricionista (dona) ou master. `not eh_paciente()` barra a conta do PACIENTE mesmo que ele mande o próprio uid em
-- nutricionista_id (o paciente só lê — policy própria abaixo). Criar exige que o paciente seja da própria nutricionista.
drop policy if exists "cobrancas: ler as proprias ou master" on {schema}.cobrancas;
create policy "cobrancas: ler as proprias ou master" on {schema}.cobrancas
  for select to authenticated using ((nutricionista_id = auth.uid() and not {schema}.eh_paciente()) or {schema}.eh_master());
drop policy if exists "cobrancas: criar as proprias ou master" on {schema}.cobrancas;
create policy "cobrancas: criar as proprias ou master" on {schema}.cobrancas
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid() and not {schema}.eh_paciente()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id and p.nutricionista_id = auth.uid())
    )
  );
drop policy if exists "cobrancas: editar as proprias ou master" on {schema}.cobrancas;
create policy "cobrancas: editar as proprias ou master" on {schema}.cobrancas
  for update to authenticated
  using ((nutricionista_id = auth.uid() and not {schema}.eh_paciente()) or {schema}.eh_master())
  with check ((nutricionista_id = auth.uid() and not {schema}.eh_paciente()) or {schema}.eh_master());
drop policy if exists "cobrancas: apagar as proprias ou master" on {schema}.cobrancas;
create policy "cobrancas: apagar as proprias ou master" on {schema}.cobrancas
  for delete to authenticated using ((nutricionista_id = auth.uid() and not {schema}.eh_paciente()) or {schema}.eh_master());

-- paciente: lê SÓ as próprias cobranças (helper definer da W34 — conta desativada → null → nada). Não cria nem edita.
drop policy if exists "paciente: ler as proprias cobrancas" on {schema}.cobrancas;
create policy "paciente: ler as proprias cobrancas" on {schema}.cobrancas
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop trigger if exists trg_cobrancas_updated_at on {schema}.cobrancas;
create trigger trg_cobrancas_updated_at before update on {schema}.cobrancas
  for each row execute function {schema}.set_updated_at();

-- 4) RPC: recalcula `pacientes.bloqueado_por_pagamento`. security definer (o cron roda sem sessão). COM sessão
--    (auth.uid() presente) só os pacientes da própria nutricionista — a tela chama ao abrir o card de cobranças e depois
--    de criar/marcar paga/cancelar, então o efeito é imediato pro paciente; SEM sessão (pg_cron) todos. A conta do
--    paciente não recalcula nada. bloqueado = existe cobrança viva, aberta, com vencimento ANTERIOR a hoje (current_date
--    do banco = UTC). Devolve jsonb {bloqueados, desbloqueados} = linhas que mudaram.
create or replace function {schema}.cobrancas_atualizar_bloqueio()
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_uid uuid := auth.uid();
  n_bloq integer := 0;
  n_desb integer := 0;
begin
  if v_uid is not null and {schema}.eh_paciente() then
    return jsonb_build_object('bloqueados', 0, 'desbloqueados', 0);
  end if;

  update pacientes p set bloqueado_por_pagamento = true
   where p.deleted_at is null
     and (v_uid is null or p.nutricionista_id = v_uid)
     and not p.bloqueado_por_pagamento
     and exists (select 1 from cobrancas c
                  where c.paciente_id = p.id and c.deleted_at is null and c.status = 'aberta' and c.vencimento < current_date);
  get diagnostics n_bloq = row_count;

  update pacientes p set bloqueado_por_pagamento = false
   where p.deleted_at is null
     and (v_uid is null or p.nutricionista_id = v_uid)
     and p.bloqueado_por_pagamento
     and not exists (select 1 from cobrancas c
                      where c.paciente_id = p.id and c.deleted_at is null and c.status = 'aberta' and c.vencimento < current_date);
  get diagnostics n_desb = row_count;

  return jsonb_build_object('bloqueados', n_bloq, 'desbloqueados', n_desb);
end;
$$;
-- os default privileges do projeto dão EXECUTE explícito ao anon em toda função nova → revogar dos dois (public E anon)
revoke all on function {schema}.cobrancas_atualizar_bloqueio() from public;
revoke all on function {schema}.cobrancas_atualizar_bloqueio() from anon;
grant execute on function {schema}.cobrancas_atualizar_bloqueio() to authenticated, service_role;

-- @@ compartilhado
-- Bloqueio AGENDADO: pg_cron roda o recálculo de madrugada nos 2 schemas (03:30 UTC = 00:30 em SP), depois da purga da
-- lixeira (03:15). Sem sessão, a função recalcula TODOS os pacientes. `cron.schedule` com o mesmo nome ATUALIZA o job.
-- O `create extension` fica num DO condicional (lição da W32: o `if not exists` puro dispara o event trigger do Supabase).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end
$$;
select cron.schedule('cobrancas-bloqueio-public', '30 3 * * *', $$select public.cobrancas_atualizar_bloqueio()$$);
select cron.schedule('cobrancas-bloqueio-staging', '30 3 * * *', $$select staging.cobrancas_atualizar_bloqueio()$$);
