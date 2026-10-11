-- Physiq W-P — planos do aluno criados pelo profissional (desenho docs/superpowers/specs/2026-10-10-planos-do-aluno-design.md §3 com
-- os ajustes do §7). Idempotente. SÓ ACRESCENTA: colunas com padrão que mantém tudo como hoje (os 2 planos do app e os planos "só
-- nome" da virada continuam iguais — B1/B2), o valor do próximo pagamento por gatilho SÓ para quem tem modalidade e a régua da
-- cobertura (mensalidade_recalcular da w07b — §7 I3) contando meses_cobertos e a "parcela n de N".
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql --so public

-- ============================================================================================================
-- 1. planos_aluno: duração, modalidades aceitas, parcelas do cartão e a parcela do mês a mês (o "ativo" de hoje continua — §7)
-- ============================================================================================================
alter table {schema}.planos_aluno add column if not exists meses integer not null default 1;
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_meses_check;
alter table {schema}.planos_aluno add constraint planos_aluno_meses_check check (meses between 1 and 24);
alter table {schema}.planos_aluno add column if not exists modalidades text[] not null default '{avista}';
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_modalidades_check;
alter table {schema}.planos_aluno add constraint planos_aluno_modalidades_check
  check (cardinality(modalidades) >= 1 and modalidades <@ array['avista', 'cartao_parcelado', 'mensal']::text[]);
alter table {schema}.planos_aluno add column if not exists max_parcelas_cartao integer;
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_max_parcelas_check;
alter table {schema}.planos_aluno add constraint planos_aluno_max_parcelas_check
  check ((max_parcelas_cartao is null and not ('cartao_parcelado' = any (modalidades)))
      or (max_parcelas_cartao between 2 and 12 and 'cartao_parcelado' = any (modalidades)));
alter table {schema}.planos_aluno add column if not exists valor_parcela_mensal numeric(10,2);
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_valor_parcela_check;
alter table {schema}.planos_aluno add constraint planos_aluno_valor_parcela_check check (valor_parcela_mensal is null or valor_parcela_mensal > 0);

-- ============================================================================================================
-- 2. pacientes: a modalidade do aluno no plano (nula = o modo de hoje: o valor digitado manda — B1) e o valor negociado
-- ============================================================================================================
alter table {schema}.pacientes add column if not exists plano_modalidade text;
alter table {schema}.pacientes drop constraint if exists pacientes_plano_modalidade_check;
alter table {schema}.pacientes add constraint pacientes_plano_modalidade_check
  check (plano_modalidade is null or plano_modalidade in ('avista', 'cartao_parcelado', 'mensal'));
alter table {schema}.pacientes add column if not exists plano_valor_negociado numeric(10,2);
alter table {schema}.pacientes drop constraint if exists pacientes_plano_valor_negociado_check;
alter table {schema}.pacientes add constraint pacientes_plano_valor_negociado_check check (plano_valor_negociado is null or plano_valor_negociado > 0);

-- ============================================================================================================
-- 3. cobrancas: quantos meses o pagamento cobre e o "de N" do mês a mês (retrato do plano quando a linha nasce); parcela_num é cache
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists meses_cobertos integer not null default 1;
alter table {schema}.cobrancas drop constraint if exists cobrancas_meses_cobertos_check;
alter table {schema}.cobrancas add constraint cobrancas_meses_cobertos_check check (meses_cobertos between 1 and 24);
alter table {schema}.cobrancas add column if not exists parcelas_total integer;
alter table {schema}.cobrancas drop constraint if exists cobrancas_parcelas_total_check;
alter table {schema}.cobrancas add constraint cobrancas_parcelas_total_check check (parcelas_total is null or parcelas_total between 2 and 24);
alter table {schema}.cobrancas add column if not exists parcela_num integer;

-- ============================================================================================================
-- 4. Valor de CADA pagamento — espelho de valorDoPagamento (supabase-principal/functions/_shared/planos-regras.ts)
-- ============================================================================================================
create or replace function {schema}.plano_valor_do_pagamento(p_plano uuid, p_modalidade text, p_negociado numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
           when p_modalidade is null then null
           when p_negociado > 0 then round(p_negociado, 2)
           when p_modalidade = 'mensal' then coalesce(pa.valor_parcela_mensal,
                  case when pa.valor > 0 and pa.meses between 1 and 24 then round(pa.valor / pa.meses, 2) end)
           when pa.valor > 0 and pa.meses between 1 and 24 then pa.valor
         end
    from {schema}.planos_aluno pa where pa.id = p_plano;
$$;
revoke execute on function {schema}.plano_valor_do_pagamento(uuid, text, numeric) from public, anon, authenticated;
grant execute on function {schema}.plano_valor_do_pagamento(uuid, text, numeric) to service_role;

-- o valor do próximo pagamento acompanha o plano (BEFORE: a gravação direta de mensalidade_valor não descasa — §7, resposta 1)
create or replace function {schema}.pacientes_valor_do_plano() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v numeric;
begin
  if new.plano_modalidade is null then
    new.plano_valor_negociado := null;   -- B1: sem modalidade = o modo de hoje (o valor digitado manda)
    return new;
  end if;
  if new.plano_aluno_id is null then
    raise exception 'plano_modalidade sem plano_aluno_id' using errcode = '23514';
  end if;
  v := {schema}.plano_valor_do_pagamento(new.plano_aluno_id, new.plano_modalidade, new.plano_valor_negociado);
  if v is not null then
    new.mensalidade_valor := v;
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.pacientes_valor_do_plano() from public, anon, authenticated;
drop trigger if exists trg_pacientes_valor_do_plano on {schema}.pacientes;
create trigger trg_pacientes_valor_do_plano
  before insert or update of plano_aluno_id, plano_modalidade, plano_valor_negociado, mensalidade_valor on {schema}.pacientes
  for each row execute function {schema}.pacientes_valor_do_plano();

-- mudar valor/meses/parcela do plano vale a partir do próximo pagamento de quem segue o plano (§3.4) — sem valor negociado e fora da
-- conta do app (B2: lá a matrícula guarda o valor do plano escolhido — W7b)
create or replace function {schema}.planos_aluno_propagar_valor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update {schema}.pacientes p
     set mensalidade_valor = {schema}.plano_valor_do_pagamento(new.id, p.plano_modalidade, null)
   where p.plano_aluno_id = new.id
     and p.plano_modalidade is not null
     and p.plano_valor_negociado is null
     and p.deleted_at is null
     and not exists (select 1 from {schema}.contas c where c.id = p.conta_id and c.origem = 'app')
     and {schema}.plano_valor_do_pagamento(new.id, p.plano_modalidade, null) is not null
     and p.mensalidade_valor is distinct from {schema}.plano_valor_do_pagamento(new.id, p.plano_modalidade, null);
  return null;
end;
$$;
revoke execute on function {schema}.planos_aluno_propagar_valor() from public, anon, authenticated;
drop trigger if exists trg_planos_aluno_propagar_valor on {schema}.planos_aluno;
create trigger trg_planos_aluno_propagar_valor after update of valor, meses, valor_parcela_mensal on {schema}.planos_aluno
  for each row execute function {schema}.planos_aluno_propagar_valor();

-- ============================================================================================================
-- 5. Cobertura (corpo da w07b — §7 I3 — com o teste grátis do app): cada pagamento empurra o "pago até" em meses_cobertos meses; o dia
--    da cobrança automática só manda no pagamento de 1 mês (o período todo não é encurtado); a "parcela n de N" é cache como
--    cobre_de/cobre_ate (recusa, estorno e remoção renumeram sozinhos) e volta a 1 depois da N-ésima (P-A "1": o plano renova)
-- ============================================================================================================
create or replace function {schema}.mensalidade_recalcular(p_paciente uuid) returns timestamptz
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_ancora integer;
  v_cob timestamptz := null;
  v_base timestamptz;
  v_fim timestamptz;
  v_prox timestamptz;
  v_teste_de timestamptz;
  v_teste_ate timestamptz;
  v_teste_aplicado boolean;
  v_meses integer;
  v_seq integer := 0;
  v_seq_plano uuid := null;
  v_seq_total integer := null;
  v_num integer;
  r record;
begin
  if p_paciente is null then
    return null;
  end if;
  select p.app_teste_de, p.app_teste_ate into v_teste_de, v_teste_ate from {schema}.pacientes p where p.id = p_paciente;
  v_teste_aplicado := v_teste_ate is null;
  select extract(day from a.proximo_vencimento)::integer into v_ancora
    from {schema}.aluno_assinaturas a
   where a.paciente_id = p_paciente and a.status = 'authorized' and a.proximo_vencimento is not null
   order by a.criado_em desc limit 1;
  for r in
    select c.id, c.pago_em, c.meses_cobertos, c.parcelas_total, c.plano_aluno_id from {schema}.cobrancas c
     where c.paciente_id = p_paciente and c.tipo = 'mensalidade' and c.status = 'paga'
       and c.deleted_at is null and c.pago_em is not null
     order by c.pago_em, c.created_at, c.id
  loop
    if not v_teste_aplicado and coalesce(v_teste_de, v_teste_ate) <= r.pago_em then
      v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
      v_teste_aplicado := true;
    end if;
    v_meses := greatest(coalesce(r.meses_cobertos, 1), 1);
    v_base := greatest(r.pago_em, coalesce(v_cob, r.pago_em));
    v_fim := v_base + make_interval(months => v_meses);         -- o Postgres trava no fim do mês (31/01 + 1 mês = 28/02)
    if v_ancora is not null and v_meses = 1 then
      v_prox := {schema}.financeiro_proxima_ancora(v_base, v_ancora);
      if v_prox < v_fim then v_fim := v_prox; end if;
    end if;
    if r.parcelas_total is not null then
      if v_seq_plano is not distinct from r.plano_aluno_id and v_seq_total = r.parcelas_total then
        v_seq := v_seq + 1;
      else
        v_seq := 1;
        v_seq_plano := r.plano_aluno_id;
        v_seq_total := r.parcelas_total;
      end if;
      v_num := ((v_seq - 1) % r.parcelas_total) + 1;
    else
      v_seq := 0;
      v_seq_plano := null;
      v_seq_total := null;
      v_num := null;
    end if;
    update {schema}.cobrancas set cobre_de = v_base, cobre_ate = v_fim, parcela_num = v_num
     where id = r.id and (cobre_de is distinct from v_base or cobre_ate is distinct from v_fim or parcela_num is distinct from v_num);
    v_cob := v_fim;
  end loop;
  if not v_teste_aplicado then
    v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
  end if;
  -- o que deixou de ser pago (recusa, estorno, removido) sai da cobertura e da contagem das parcelas
  update {schema}.cobrancas set cobre_de = null, cobre_ate = null, parcela_num = null
   where paciente_id = p_paciente and tipo = 'mensalidade' and (status <> 'paga' or deleted_at is not null)
     and (cobre_de is not null or cobre_ate is not null or parcela_num is not null);
  update {schema}.pacientes set mensalidade_pago_ate = v_cob where id = p_paciente and mensalidade_pago_ate is distinct from v_cob;
  return v_cob;
end;
$$;
revoke execute on function {schema}.mensalidade_recalcular(uuid) from public, anon, authenticated;
grant execute on function {schema}.mensalidade_recalcular(uuid) to service_role;

-- o gatilho da cobertura também olha meses_cobertos e parcelas_total (o recálculo grava cobre_*/parcela_num e não dispara de novo)
drop trigger if exists trg_cobrancas_mensalidade on {schema}.cobrancas;
create trigger trg_cobrancas_mensalidade
  after insert or delete or update of status, pago_em, deleted_at, tipo, paciente_id, meses_cobertos, parcelas_total on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_recalcular_mensalidade();

-- ============================================================================================================
-- 6. financeiro_do_aluno() (corpo da w07b) + a modalidade e os meses do plano (a faixa do topo diz "Seu plano" no período todo)
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
      'profissional', case when c.origem = 'app' then 'Physiq' else
                        (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr
                          where pr.id = coalesce(c.dono_id, p.personal_id, p.nutricionista_id)) end,
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
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa'),
      -- W7b
      'app', coalesce(c.origem = 'app', false),
      'teste_ate', case when c.origem = 'app' then p.app_teste_ate end,
      'plano_codigo', (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      -- W-P
      'modalidade', p.plano_modalidade,
      'plano_meses', (select pa.meses from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id)
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;
