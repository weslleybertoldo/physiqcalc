-- Reversa da play-W6 (supabase-principal/migrations/20261016010000_playw6_play_billing.sql). Idempotente: roda com ou sem a migration
-- aplicada. Devolve o "hoje": os 3 corpos de antes letra por letra — a mensalidade_recalcular (20261011010000_wp_planos_modalidades.sql:
-- 121-196), a financeiro_do_aluno (20261011200000_w1_infinitepay.sql:320-365) e a meu_plano_app (20260929190000_w07b_sem_profissional.sql:
-- 252-273) — e tira o gatilho da cobertura da Play, a play_aplicar, a guarda cobrancas_guard_play e a trava play_billing.
-- FICAM, se existirem: a tabela play_assinaturas e as linhas google_play de cobrancas (por isso a forma 'google_play' no CHECK, a coluna
-- play_pedido e o índice dela também ficam — sem eles essas linhas ficariam inválidas). Depois, a cobertura das matrículas com assinatura
-- da Play é recalculada pelo corpo de antes (as cobranças google_play pagas passam a contar como as do MP: 1 mês cada, do pagamento).
-- ⚠️ AVISO: só vale enquanto nenhuma migration mais nova mexer nas 3 funções — ela regrava o texto de 16/10/2026 e desfaria, calada, a
-- mudança mais nova (antes de rodar: git log das migrations depois de 20261016010000).
-- Junto com ela (docs/loja-google-play.md e o §5 do contrato da play-W6): a trava desligada já tira a oferta; as funções mexidas voltam ao
-- 7c266196; a play-compras e a play-rtdn param de gravar (a play_aplicar sai); a assinatura push do Pub/Sub sai.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261016010000_playw6_play_billing_reversa.sql --so staging
--          python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261016010000_playw6_play_billing_reversa.sql --so public

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- 1. Os 3 corpos de antes (cópia letra por letra; create or replace: assinatura, atributos e grants iguais)
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
                              and a.status = 'aguardando_confirmacao' and a.tipo = 'mensalidade'
                              and (a.forma is distinct from 'infinitepay' or a.ip_expira_em > now())),
      'assinatura_ativa', exists (select 1 from {schema}.aluno_assinaturas s where s.paciente_id = p.id and s.status = 'authorized'),
      'abertas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'descricao', a.descricao, 'valor', a.valor,
                          'vencimento', a.vencimento) order by a.vencimento), '[]'::jsonb)
                    from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                     and (a.status = 'aberta'
                          or (a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa' and a.forma = 'infinitepay'
                              and coalesce(a.ip_expira_em, now()) <= now()))),
      'aguardando_avulsas', (select count(*) from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa'
                               and (a.forma is distinct from 'infinitepay' or a.ip_expira_em > now())),
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

create or replace function {schema}.meu_plano_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'teste_dias', {schema}.app_teste_dias(),
    'planos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', pa.codigo, 'nome', pa.nome, 'valor', pa.valor,
                                'modulos', to_jsonb(pa.modulos), 'descricao', pa.descricao) order by pa.ordem, pa.nome), '[]'::jsonb)
                 from {schema}.planos_aluno pa where pa.conta_id = {schema}.conta_do_app() and pa.ativo and pa.codigo is not null),
    'matricula', (select jsonb_build_object(
                     'paciente_id', p.id, 'ativo', p.ativo, 'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor,
                     'modulos', to_jsonb(coalesce(pa.modulos, array['treino']::text[])), 'objetivo', p.objetivo_app,
                     'teste_de', p.app_teste_de, 'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate,
                     'pausada', p.cobranca_pausada, 'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo,
                     'aguardando', exists (select 1 from {schema}.cobrancas c where c.paciente_id = p.id and c.deleted_at is null
                                             and c.status = 'aguardando_confirmacao' and c.tipo = 'mensalidade'),
                     'assinatura', (select jsonb_build_object('status', s.status, 'valor', s.valor, 'proximo_vencimento', s.proximo_vencimento)
                                      from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1))
                    from {schema}.pacientes p left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
                   where p.user_id = auth.uid() and p.conta_id = {schema}.conta_do_app() and p.deleted_at is null
                   order by p.ativo desc, p.created_at desc limit 1),
    'com_profissional', exists (select 1 from {schema}.pacientes p where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
                                   and p.conta_id is distinct from {schema}.conta_do_app()));
$$;

-- ============================================================================================================
-- 2. Sai o que a play-W6 pôs (a tabela e as linhas da Play ficam)
-- ============================================================================================================
do $d$
begin
  if to_regclass('{schema}.play_assinaturas') is not null then
    execute 'drop trigger if exists trg_play_assinaturas_recalcular on {schema}.play_assinaturas';
  end if;
end $d$;
drop function if exists {schema}.play_assinaturas_recalcular();
drop function if exists {schema}.play_aplicar(jsonb);
drop trigger if exists trg_cobrancas_guard_play on {schema}.cobrancas;
drop function if exists {schema}.cobrancas_guard_play();
delete from {schema}.app_config where chave = 'play_billing';

-- ============================================================================================================
-- 3. A cobertura das matrículas com assinatura da Play, pelo corpo de antes
-- ============================================================================================================
do $r$
declare
  r record;
begin
  if to_regclass('{schema}.play_assinaturas') is not null then
    for r in execute 'select distinct paciente_id from {schema}.play_assinaturas' loop
      perform {schema}.mensalidade_recalcular(r.paciente_id);
    end loop;
  end if;
end $r$;

-- ============================================================================================================
-- 4. A conferência (qualquer diferença desfaz a reversa inteira)
-- ============================================================================================================
do $c$
begin
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = '{schema}' and pr.proname in ('mensalidade_recalcular', 'financeiro_do_aluno', 'meu_plano_app')
                and pr.prosrc like '%play_assinaturas%') then
    raise exception 'playw6 (reversa): uma das 3 funções de {schema} ainda lê a play_assinaturas';
  end if;
  if to_regprocedure('{schema}.play_aplicar(jsonb)') is not null or to_regprocedure('{schema}.cobrancas_guard_play()') is not null
     or to_regprocedure('{schema}.play_assinaturas_recalcular()') is not null then
    raise exception 'playw6 (reversa): ficou função da play-W6 em {schema}';
  end if;
  if exists (select 1 from {schema}.app_config a where a.chave = 'play_billing') then
    raise exception 'playw6 (reversa): a trava play_billing ficou em {schema}';
  end if;
end $c$;

notify pgrst, 'reload schema';
