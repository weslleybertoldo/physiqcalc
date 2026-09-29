-- Physiq W6 — cobrança aluno → profissional unificada no BANCO PRINCIPAL (spec §4.3 Pagamentos, §4.5 Financeiro, §4.6
-- Recebimento, §8.1 cobrancas/planos_aluno/recebimento_chaves/aluno_assinaturas, §8.4 script 02, R15 e R16). Idempotente.
-- SÓ ACRESCENTA: colunas novas com padrão que mantém o site antigo do Nutri igual (os status de hoje continuam os mesmos:
-- aberta · paga · cancelada · aguardando_confirmacao), funções novas e 1 gatilho que recalcula a mensalidade.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929150000_w06_financeiro_aluno.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929150000_w06_financeiro_aluno.sql --so public
--
-- Modelo (o Calc e o Nutri numa tabela só, `cobrancas`):
--   · tipo 'mensalidade' = a régua do Calc (cada pagamento aprovado cobre 1 mês a partir do maior entre a data do pagamento e o fim
--     da cobertura anterior; com assinatura ativa, o avulso cobre só até a próxima cobrança dela — src/lib/cobertura.ts). A linha
--     nasce quando o aluno paga (Pix na chave com comprovante, Mercado Pago) ou o profissional registra um pagamento por fora.
--   · tipo 'avulsa'      = a cobrança do Nutri (descrição, valor, vencimento; aberta → paga/cancelada). O site antigo cria assim.
--   · recusa do comprovante: mensalidade → cancelada (recusado_em); avulsa → volta a 'aberta' (recusado_em) — o aluno manda outro.
--   · Mercado Pago: aguardando_confirmacao enquanto o MP não aprova (spec 9: "Aguardando confirmação do Mercado Pago"); estorno →
--     cancelada (reembolsado_em). Nada do Mercado Pago fica 'aberta' (a trava e o WhatsApp do Nutri só olham 'aberta').
--   · pacientes.mensalidade_pago_ate = fim da cobertura (cache recalculado pelo gatilho — quem lê é o app, sem refazer a conta).

-- ============================================================================================================
-- 1. Matrícula: plano e mensalidade do aluno (vinham do physiq_profiles do Calc — script 02)
-- ============================================================================================================
alter table {schema}.pacientes add column if not exists plano_aluno_id uuid references {schema}.planos_aluno(id) on delete set null;
alter table {schema}.pacientes add column if not exists mensalidade_valor numeric(10,2);
alter table {schema}.pacientes drop constraint if exists pacientes_mensalidade_valor_check;
alter table {schema}.pacientes add constraint pacientes_mensalidade_valor_check check (mensalidade_valor is null or mensalidade_valor > 0);
alter table {schema}.pacientes add column if not exists cobranca_pausada boolean not null default false;
-- 1º vencimento de quem nunca pagou (o dia em que a mensalidade foi definida pela tela nova); null = migrado do Calc
alter table {schema}.pacientes add column if not exists mensalidade_desde timestamptz;
alter table {schema}.pacientes add column if not exists mensalidade_pago_ate timestamptz;
-- marca do script 02 (a 2ª rodada não reescreve o que o profissional mudou depois da 1ª)
alter table {schema}.pacientes add column if not exists financeiro_migrado_em timestamptz;
create index if not exists pacientes_plano_aluno_idx on {schema}.pacientes (plano_aluno_id);

-- ============================================================================================================
-- 2. Cobranças: o que o Calc tinha em physiq_pagamentos (comprovante, confirmação, recusa, Mercado Pago, cobertura)
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists tipo text not null default 'avulsa';
alter table {schema}.cobrancas drop constraint if exists cobrancas_tipo_check;
alter table {schema}.cobrancas add constraint cobrancas_tipo_check check (tipo in ('mensalidade', 'avulsa'));
alter table {schema}.cobrancas add column if not exists mes_ref date;
alter table {schema}.cobrancas add column if not exists cobre_de timestamptz;
alter table {schema}.cobrancas add column if not exists cobre_ate timestamptz;
alter table {schema}.cobrancas add column if not exists metodo text;            -- por fora: dinheiro, pix, cartao, transferencia, outro
alter table {schema}.cobrancas add column if not exists enviado_em timestamptz;  -- quando o aluno mandou o comprovante (conta pra cobertura)
alter table {schema}.cobrancas add column if not exists confirmado_por uuid references auth.users(id) on delete set null;
alter table {schema}.cobrancas add column if not exists confirmado_em timestamptz;
alter table {schema}.cobrancas add column if not exists recusado_motivo text;
alter table {schema}.cobrancas add column if not exists recusado_em timestamptz;
alter table {schema}.cobrancas add column if not exists reembolsado_em timestamptz;
alter table {schema}.cobrancas add column if not exists mp_status text;          -- o status cru do Mercado Pago (approved, refunded…)
alter table {schema}.cobrancas add column if not exists mp_preapproval_id text;
alter table {schema}.cobrancas add column if not exists pix_qr text;             -- base64 do QR do Mercado Pago
alter table {schema}.cobrancas add column if not exists pix_copia_cola text;
alter table {schema}.cobrancas add column if not exists pix_expira_em timestamptz;
alter table {schema}.cobrancas add column if not exists treino_pagamento_id uuid; -- physiq_pagamentos.id (script 02: 1 cópia só)
create unique index if not exists cobrancas_treino_pagamento_uq on {schema}.cobrancas (treino_pagamento_id) where treino_pagamento_id is not null;
create index if not exists cobrancas_paciente_tipo_idx on {schema}.cobrancas (paciente_id, tipo, status);
create index if not exists cobrancas_aguardando_idx on {schema}.cobrancas (conta_id) where status = 'aguardando_confirmacao';

-- ============================================================================================================
-- 3. Assinaturas de aluno, chaves Pix e planos: vínculo com a origem no Calc (script 02 idempotente)
-- ============================================================================================================
alter table {schema}.aluno_assinaturas add column if not exists proximo_vencimento timestamptz;
alter table {schema}.aluno_assinaturas add column if not exists payload jsonb;
alter table {schema}.aluno_assinaturas add column if not exists treino_assinatura_id uuid;
create unique index if not exists aluno_assinaturas_treino_uq on {schema}.aluno_assinaturas (treino_assinatura_id) where treino_assinatura_id is not null;
alter table {schema}.recebimento_chaves add column if not exists treino_recebimento_id uuid;
create unique index if not exists recebimento_chaves_treino_uq on {schema}.recebimento_chaves (treino_recebimento_id) where treino_recebimento_id is not null;
alter table {schema}.planos_aluno add column if not exists treino_plano_id uuid;
create unique index if not exists planos_aluno_conta_nome_uq on {schema}.planos_aluno (conta_id, lower(btrim(nome)));

-- sino (NF9): o profissional recebe "comprovante enviado" (os tipos de antes continuam, inclusive o 'membro_removido' da W5)
alter table {schema}.avisos drop constraint if exists avisos_tipo_check;
alter table {schema}.avisos add constraint avisos_tipo_check check (tipo in ('plano_atualizado', 'reacao_diario', 'pagamento_confirmado',
  'pagamento_recusado', 'consulta_marcada', 'avaliacao_nova', 'geral', 'membro_removido', 'comprovante_enviado'));

-- ============================================================================================================
-- 4. Cobertura da mensalidade (a régua do Calc — src/lib/cobertura.ts / src/financeiro/regras.ts): relógio UTC como no Calc
-- ============================================================================================================

-- próxima data depois de p_base cujo dia do mês é p_dia (mês curto: o último dia), com a mesma hora — nextAnchorAfter do Calc
create or replace function {schema}.financeiro_proxima_ancora(p_base timestamptz, p_dia integer) returns timestamptz
language plpgsql stable set search_path = '' set timezone = 'UTC' as $$
declare
  v_mes timestamptz := date_trunc('month', p_base);
  v_hora interval := p_base - date_trunc('day', p_base);
  v_ultimo integer;
  v_data timestamptz;
begin
  v_ultimo := extract(day from (v_mes + interval '1 month' - interval '1 day'))::integer;
  v_data := v_mes + make_interval(days => least(p_dia, v_ultimo) - 1) + v_hora;
  if v_data <= p_base then
    v_mes := v_mes + interval '1 month';
    v_ultimo := extract(day from (v_mes + interval '1 month' - interval '1 day'))::integer;
    v_data := v_mes + make_interval(days => least(p_dia, v_ultimo) - 1) + v_hora;
  end if;
  return v_data;
end;
$$;

-- refaz a cobertura das mensalidades pagas do aluno (cobre_de/cobre_ate de cada uma) e grava o fim em pacientes.mensalidade_pago_ate
create or replace function {schema}.mensalidade_recalcular(p_paciente uuid) returns timestamptz
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_ancora integer;
  v_cob timestamptz := null;
  v_base timestamptz;
  v_fim timestamptz;
  v_prox timestamptz;
  r record;
begin
  if p_paciente is null then
    return null;
  end if;
  -- assinatura ativa: o dia da próxima cobrança no MP manda no ciclo (o avulso de reposição cobre só até ela)
  select extract(day from a.proximo_vencimento)::integer into v_ancora
    from {schema}.aluno_assinaturas a
   where a.paciente_id = p_paciente and a.status = 'authorized' and a.proximo_vencimento is not null
   order by a.criado_em desc limit 1;
  for r in
    select c.id, c.pago_em from {schema}.cobrancas c
     where c.paciente_id = p_paciente and c.tipo = 'mensalidade' and c.status = 'paga'
       and c.deleted_at is null and c.pago_em is not null
     order by c.pago_em, c.created_at, c.id
  loop
    v_base := greatest(r.pago_em, coalesce(v_cob, r.pago_em));
    v_fim := v_base + interval '1 month';                       -- o Postgres trava no fim do mês (31/01 + 1 mês = 28/02)
    if v_ancora is not null then
      v_prox := {schema}.financeiro_proxima_ancora(v_base, v_ancora);
      if v_prox < v_fim then v_fim := v_prox; end if;
    end if;
    update {schema}.cobrancas set cobre_de = v_base, cobre_ate = v_fim
     where id = r.id and (cobre_de is distinct from v_base or cobre_ate is distinct from v_fim);
    v_cob := v_fim;
  end loop;
  -- o que deixou de ser pago (recusa, estorno, removido) sai da cobertura
  update {schema}.cobrancas set cobre_de = null, cobre_ate = null
   where paciente_id = p_paciente and tipo = 'mensalidade' and (status <> 'paga' or deleted_at is not null)
     and (cobre_de is not null or cobre_ate is not null);
  update {schema}.pacientes set mensalidade_pago_ate = v_cob where id = p_paciente and mensalidade_pago_ate is distinct from v_cob;
  return v_cob;
end;
$$;

create or replace function {schema}.cobrancas_recalcular_mensalidade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.tipo = 'mensalidade' then
    perform {schema}.mensalidade_recalcular(old.paciente_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.tipo = 'mensalidade' and (tg_op = 'INSERT' or new.paciente_id is distinct from old.paciente_id or old.tipo <> 'mensalidade') then
    perform {schema}.mensalidade_recalcular(new.paciente_id);
  end if;
  return null;
end;
$$;
-- só nas colunas que mudam a cobertura (o recálculo mexe em cobre_de/cobre_ate e não dispara de novo)
drop trigger if exists trg_cobrancas_mensalidade on {schema}.cobrancas;
create trigger trg_cobrancas_mensalidade after insert or delete or update of status, pago_em, deleted_at, tipo, paciente_id
  on {schema}.cobrancas for each row execute function {schema}.cobrancas_recalcular_mensalidade();

create or replace function {schema}.aluno_assinaturas_recalcular() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform {schema}.mensalidade_recalcular(coalesce(new.paciente_id, old.paciente_id));
  return null;
end;
$$;
drop trigger if exists trg_aluno_assinaturas_mensalidade on {schema}.aluno_assinaturas;
create trigger trg_aluno_assinaturas_mensalidade after insert or delete or update of status, proximo_vencimento, paciente_id
  on {schema}.aluno_assinaturas for each row execute function {schema}.aluno_assinaturas_recalcular();

-- ============================================================================================================
-- 5. financeiro_do_aluno(): o resumo leve do app do aluno (faixa do Início, trava do inadimplente, chip do Perfil) — como o
--    status-lite do Calc, só banco. O detalhe (Pagar, histórico, recibos) é da função pagamentos-aluno.
-- ============================================================================================================
create or replace function {schema}.financeiro_do_aluno() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) from (
    select p.created_at as criado, jsonb_build_object(
      'paciente_id', p.id,
      'conta_id', p.conta_id,
      'conta_nome', c.nome,
      'recebimento_modo', coalesce(c.recebimento_modo, 'pix_manual'),
      'bloquear_inadimplente', coalesce(c.bloquear_app_inadimplente, false),
      'tem_chave', exists (select 1 from {schema}.recebimento_chaves k where k.conta_id = p.conta_id and k.ativa),
      'profissional', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr
                        where pr.id = coalesce(c.dono_id, p.personal_id, p.nutricionista_id)),
      'mensalidade_valor', p.mensalidade_valor,
      'plano_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      'pausada', p.cobranca_pausada,
      'pago_ate', p.mensalidade_pago_ate,
      'desde', p.mensalidade_desde,
      'aguardando', exists (select 1 from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                              and a.status = 'aguardando_confirmacao' and a.tipo = 'mensalidade'),
      'assinatura_ativa', exists (select 1 from {schema}.aluno_assinaturas s where s.paciente_id = p.id and s.status = 'authorized'),
      'abertas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'descricao', a.descricao, 'valor', a.valor,
                          'vencimento', a.vencimento) order by a.vencimento), '[]'::jsonb)
                    from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null and a.status = 'aberta'),
      'aguardando_avulsas', (select count(*) from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa')
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;

-- as funções de recálculo são do servidor (gatilhos, pagamentos-aluno, mp-webhook-aluno, script 02)
revoke execute on function {schema}.mensalidade_recalcular(uuid), {schema}.financeiro_proxima_ancora(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function {schema}.mensalidade_recalcular(uuid), {schema}.financeiro_proxima_ancora(timestamptz, integer) to service_role;
revoke execute on function {schema}.cobrancas_recalcular_mensalidade(), {schema}.aluno_assinaturas_recalcular() from public, anon, authenticated;
