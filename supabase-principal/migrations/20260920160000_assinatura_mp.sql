-- PhysiqNutri — W42 Assinatura mensal do profissional via Mercado Pago. Pedido dele (20/09/2026): "integra o mercado pago (será o
-- pagamento do profissional para mim) onde ele pagará a mensalidade"; respostas dele (20/09/2026): R$ 80/mês · 14 dias grátis ·
-- mesma conta do Mercado Pago do PhysiqCalc. Idempotente. Aplicar com
-- `python3 scripts/apply_migration.py supabase/migrations/20260920160000_assinatura_mp.sql` (roda em public E staging trocando {schema}).
--
-- Desenho: cada perfil ganha 14 dias de teste (profiles.teste_ate; quem já existia conta a partir desta migration) e uma isenção
-- (profiles.isento_assinatura — master e contas de teste dos smokes). A assinatura é o espelho da preapproval do Mercado Pago
-- (1 por profissional): quem ESCREVE é só a service_role pelas Edge Functions mp-assinar (cria/sincroniza) e mp-webhook (avisos
-- do MP); a dona só lê a própria linha. O bloqueio é decidido na tela (ConsultorioLayout, regra pura em src/lib/assinaturaUtil.ts):
-- teste vencido E status <> authorized E não isento → tela "Assinatura pendente" (dados preservados).

-- 1) período de teste e isenção no perfil
alter table {schema}.profiles add column if not exists teste_ate timestamptz not null default (now() + interval '14 days');
alter table {schema}.profiles add column if not exists isento_assinatura boolean not null default false;
update {schema}.profiles set isento_assinatura = true
  where isento_assinatura = false
    and (role = 'master' or lower(coalesce(email, '')) in ('teste@physiqnutri.app', 'teste2@physiqnutri.app', 'master.teste@physiqnutri.app'));

-- 2) a dona edita o perfil, mas não o papel nem o próprio período de teste/isenção (só service_role e master)
drop policy if exists "perfil: editar o proprio" on {schema}.profiles;
create policy "perfil: editar o proprio" on {schema}.profiles
  for update to authenticated using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from {schema}.profiles p where p.id = auth.uid())
    and teste_ate = (select p.teste_ate from {schema}.profiles p where p.id = auth.uid())
    and isento_assinatura = (select p.isento_assinatura from {schema}.profiles p where p.id = auth.uid())
  );

-- 3) assinaturas: espelho da preapproval do Mercado Pago (status pending → authorized → paused/cancelled)
create table if not exists {schema}.assinaturas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null unique references {schema}.profiles(id) on delete cascade,
  mp_preapproval_id text unique,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  valor numeric(12,2) not null default 80 check (valor > 0),
  init_point text,
  proximo_vencimento timestamptz,
  ultimo_pagamento_em timestamptz,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on {schema}.assinaturas to anon, authenticated, service_role;
alter table {schema}.assinaturas enable row level security;
drop policy if exists "assinaturas: dona ou master le" on {schema}.assinaturas;
create policy "assinaturas: dona ou master le" on {schema}.assinaturas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- sem policy de insert/update/delete: pelo cliente ninguém escreve (a service_role das Edge Functions passa por cima do RLS)
drop trigger if exists assinaturas_updated_at on {schema}.assinaturas;
create trigger assinaturas_updated_at before update on {schema}.assinaturas
  for each row execute function {schema}.set_updated_at();
create index if not exists assinaturas_status_idx on {schema}.assinaturas (status);
