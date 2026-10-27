-- Physiq play-W6 · T2 (26/10/2026) — a troca de plano AGENDADA (a do completo para o Treino, que a Google Play faz na renovação: o
-- DEFERRED) chega ao app. Banco principal, staging + public. Idempotente e ADITIVA: nenhuma linha existente muda, nenhuma cobertura muda.
-- O achado (a) do GATE 2 (26/10, a compra de teste dele): com a troca para o Treino agendada, o Meu plano mostrava "não renova" — o Google
-- manda o produto que entra na renovação (subscriptionsv2: lineItems[].deferredItemReplacement.productId) e ele morria na função.
--
-- O que muda:
--   play_assinaturas.troca_para   NOVA (text, nula; 1 a 100 caracteres): o produto que entra na renovação (o DEFERRED); null = sem troca.
--   play_aplicar(jsonb)           o corpo da 20261016010000_playw6_play_billing.sql (§5) + grava o p->>'troca_para' em toda chamada (a compra
--                                 nova e o update): o Google é a fonte da verdade — sem o campo (ou vazio) LIMPA (a troca desfeita ou já
--                                 feita); maior que 100 → 'invalido' (nada muda). A resposta ganha 'troca_para'.
--   financeiro_do_aluno()         o corpo da W6 (§6) + 'troca_para' dentro de 'play' (chave nova; o APK antigo ignora).
--   meu_plano_app()               o corpo da W6 (§6) + 'troca_para' dentro de 'play' (o Meu plano: "vira <plano> em DD/MM").
-- As 3 trocadas mantêm assinatura, atributos e grants (create or replace; as linhas de grant são as mesmas da W6). O gatilho da cobertura
-- (trg_play_assinaturas_recalcular: estado, expira_em, paciente_id) NÃO olha a coluna nova: a cobertura não muda.
-- Quem lê a coluna (as funções, publicadas DEPOIS desta migration nos 2 schemas — elas servem o staging E a produção): _shared/
-- play-assinaturas.ts (COLUNAS, vistaDaPlay: o estado da play-compras e o aluno_status da pagamentos-aluno) e _shared/play-regras.ts
-- (entradaDoGoogle → p.troca_para).
-- A conferência do fim (desfaz tudo se algo sair diferente): a coluna (text, nula) e a constraint; a play_aplicar definer, search_path ''
-- e só do servidor; a tabela com RLS, sem policy e sem acesso do app/visitante; as 3 funções com o troca_para.
-- Aplicar (backup ANTES no public — scripts/backup/backup_principal.py; o public ANTES de publicar as funções):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261027010000_playw6_troca_para.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261027010000_playw6_troca_para.sql --so staging
--   (e o mesmo com --so public)
-- Testes: e2e/playw6/sql_t2.py (os casos 22-23 no PG local; --so-catalogo; --catalogo-foto/--catalogo-comparar: os grants iguais e o 2º
-- apply sem mudança) + e2e/playw6/sql_playw6.py (a regressão da W6 e a cobertura antes × depois).
-- Reversa: supabase-principal/reversas/20261027010000_playw6_troca_para_reversa.sql (os 3 corpos da W6; a coluna e a constraint FICAM).

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- 1. A W6 está lá (sem a play_assinaturas, a migration para aqui e nada entra)
-- ============================================================================================================
do $p$
begin
  if to_regclass('{schema}.play_assinaturas') is null or to_regprocedure('{schema}.play_aplicar(jsonb)') is null then
    raise exception 'playw6 T2: {schema} sem a play-W6 (20261016010000_playw6_play_billing.sql)';
  end if;
end $p$;

-- ============================================================================================================
-- 2. play_assinaturas.troca_para: o produto que entra na renovação (o DEFERRED); null = sem troca
-- ============================================================================================================
alter table {schema}.play_assinaturas add column if not exists troca_para text;
do $k$
begin
  if not exists (select 1 from pg_constraint c where c.conrelid = '{schema}.play_assinaturas'::regclass
                    and c.conname = 'play_assinaturas_troca_para_check') then
    alter table {schema}.play_assinaturas add constraint play_assinaturas_troca_para_check
      check (troca_para is null or char_length(troca_para) between 1 and 100);
  end if;
end $k$;
comment on column {schema}.play_assinaturas.troca_para is
  'T2 (26/10/2026): o produto que entra na renovação (a troca agendada — DEFERRED — que o Google marcou no deferredItemReplacement); '
  'null = sem troca. Só a play_aplicar grava (o que o Google diz a cada sincronia).';

-- ============================================================================================================
-- 3. play_aplicar: o corpo da W6 + o troca_para (só o servidor: play-compras e play-conferir)
-- ============================================================================================================
create or replace function {schema}.play_aplicar(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_estados constant text[] := array['pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada', 'expirada', 'revogada',
                                      'substituida'];
  c_vivas constant text[] := array['pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada'];
  v_conta uuid := {schema}.conta_do_app();
  v_token text := nullif(btrim(coalesce(p ->> 'token', '')), '');
  v_ant text := nullif(btrim(coalesce(p ->> 'token_anterior', '')), '');
  v_produto text := nullif(btrim(coalesce(p ->> 'produto', '')), '');
  v_plano_base text := nullif(btrim(coalesce(p ->> 'plano_base', '')), '');
  v_estado text := nullif(btrim(coalesce(p ->> 'estado', '')), '');
  v_pedido text := nullif(btrim(coalesce(p ->> 'pedido', '')), '');
  v_devolvido text := nullif(btrim(coalesce(p ->> 'devolvido_pedido', '')), '');
  v_por text := nullif(btrim(coalesce(p ->> 'cancelada_por', '')), '');
  -- T2 (26/10/2026): a troca na renovação (DEFERRED) que o Google marcou — o produto que entra quando renovar; sem ela (null ou vazio) LIMPA
  v_troca_para text := nullif(btrim(coalesce(p ->> 'troca_para', '')), '');
  v_pac_id uuid;
  v_expira timestamptz;
  v_pago_em timestamptz;
  v_valor numeric;
  v_renova boolean;
  v_reconhecida boolean;
  v_teste boolean;
  v_adiada boolean;
  v_pac {schema}.pacientes%rowtype;
  v_plano {schema}.planos_aluno%rowtype;
  v_atual {schema}.play_assinaturas%rowtype;
  v_nova boolean;
  v_antes timestamptz;
  v_adiar timestamptz := null;
  v_dono uuid;
  v_cobranca text := null;
  v_devolvidas integer := 0;
  v_troca jsonb := null;
  v_depois timestamptz;
  v_n integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' or v_token is null or v_produto is null or v_estado is null
     or not (v_estado = any (c_estados)) or char_length(v_token) > 4096 or (v_ant is not null and char_length(v_ant) > 4096)
     or char_length(v_produto) > 100 or (v_plano_base is not null and char_length(v_plano_base) > 100)
     or (v_pedido is not null and char_length(v_pedido) > 200) or (v_devolvido is not null and char_length(v_devolvido) > 200)
     or (v_troca_para is not null and char_length(v_troca_para) > 100)
     or (v_por is not null and v_por not in ('vinculo', 'exclusao', 'google')) then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;
  begin
    v_pac_id := (p ->> 'paciente_id')::uuid;
    v_expira := nullif(p ->> 'expira_em', '')::timestamptz;
    v_pago_em := coalesce(nullif(p ->> 'pago_em', '')::timestamptz, now());
    v_valor := nullif(p ->> 'valor', '')::numeric;
    v_renova := coalesce((p ->> 'renova')::boolean, false);
    v_reconhecida := coalesce((p ->> 'reconhecida')::boolean, false);
    v_teste := coalesce((p ->> 'teste')::boolean, false);
    v_adiada := coalesce((p ->> 'adiada')::boolean, false);
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end;
  if v_pac_id is null then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;

  -- a matrícula (trava a linha: o registrar e o aviso do Google da mesma matrícula entram um de cada vez)
  select * into v_pac from {schema}.pacientes where id = v_pac_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_matricula');
  end if;
  if v_conta is null or v_pac.conta_id is distinct from v_conta then
    return jsonb_build_object('ok', false, 'erro', 'nao_e_do_app');
  end if;
  select * into v_plano from {schema}.planos_aluno where conta_id = v_conta and codigo = v_produto;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'produto_invalido');
  end if;
  select * into v_atual from {schema}.play_assinaturas where token = v_token for update;
  v_nova := not found;
  if not v_nova and v_atual.paciente_id <> v_pac.id then
    return jsonb_build_object('ok', false, 'erro', 'token_de_outra_matricula');
  end if;
  v_antes := v_pac.mensalidade_pago_ate;

  -- 1 viva por matrícula: outra compra viva, sem ligação com esta (nem a anterior que esta substitui, nem uma cancelada que já venceu)
  if v_estado = any (c_vivas) and (v_nova or v_atual.estado <> 'substituida') and exists (
       select 1 from {schema}.play_assinaturas a
        where a.paciente_id = v_pac.id and a.token <> v_token and a.token is distinct from v_ant and a.estado = any (c_vivas)
          and not (a.estado = 'cancelada' and a.expira_em is not null and a.expira_em < now())) then
    return jsonb_build_object('ok', false, 'erro', 'outra_viva');
  end if;

  -- a anterior (troca de plano ou reassinatura antes de vencer: o linkedPurchaseToken) não vale mais
  if v_ant is not null and v_ant <> v_token then
    update {schema}.play_assinaturas set estado = 'substituida', renova = false, atualizada_em = now()
     where token = v_ant and paciente_id = v_pac.id and estado <> 'substituida';
  end if;
  -- a cancelada que já venceu (o aviso EXPIRED que se perdeu) não segura a vaga
  update {schema}.play_assinaturas set estado = 'expirada', atualizada_em = now()
   where paciente_id = v_pac.id and token <> v_token and estado = 'cancelada' and expira_em is not null and expira_em < now();

  if v_nova then
    -- a 1ª compra (sem ligação) com a matrícula ainda coberta por mais de 1 dia (o teste grátis ou o mês pago pelo MP): a função adia
    -- (defer) a assinatura pelo que falta — o aluno não perde os dias que já tinha
    if v_ant is null and v_antes is not null and v_antes > now() + interval '1 day' then
      v_adiar := v_antes;
    end if;
    insert into {schema}.play_assinaturas (paciente_id, conta_id, produto, plano_base, token, token_anterior, estado, expira_em, renova,
                                           reconhecida_em, teste, ultimo_pedido, cancelada_por, adiar_ate, adiada_em, troca_para)
    values (v_pac.id, v_conta, v_produto, v_plano_base, v_token, v_ant, v_estado, v_expira, v_renova,
            case when v_reconhecida then now() end, v_teste, v_pedido,
            coalesce(v_por, case when v_estado in ('cancelada', 'expirada', 'revogada') then 'google' end),
            v_adiar, case when v_adiada then now() end, v_troca_para);
  else
    update {schema}.play_assinaturas a set
      produto = v_produto,
      plano_base = coalesce(v_plano_base, a.plano_base),
      token_anterior = coalesce(a.token_anterior, v_ant),
      estado = case when a.estado = 'substituida' then 'substituida' else v_estado end,   -- a substituída não volta
      expira_em = v_expira,
      renova = v_renova,
      reconhecida_em = coalesce(a.reconhecida_em, case when v_reconhecida then now() end),
      teste = a.teste or v_teste,
      ultimo_pedido = coalesce(v_pedido, a.ultimo_pedido),
      cancelada_por = case when a.estado <> 'substituida' and v_estado in ('pendente', 'ativa', 'carencia') then null
                           else coalesce(v_por, a.cancelada_por,
                                         case when v_estado in ('cancelada', 'expirada', 'revogada') then 'google' end) end,
      adiada_em = coalesce(a.adiada_em, case when v_adiada then now() end),
      troca_para = v_troca_para,   -- T2: o que o Google diz agora (sem a troca = null: LIMPA)
      atualizada_em = now()
     where a.id = v_atual.id;
  end if;
  select * into v_atual from {schema}.play_assinaturas where token = v_token;

  -- o plano da matrícula = o produto vigente da assinatura que dá acesso (a troca na hora já vem com o produto novo; a da renovação,
  -- só quando renova)
  if v_pac.ativo and v_pac.deleted_at is null and v_atual.estado in ('ativa', 'carencia', 'cancelada') then
    v_troca := {schema}.app_trocar_plano(v_pac.id, v_produto, null);
  end if;

  -- a cobrança do pedido PAGO (a compra e cada renovação): 1 linha por pedido; nenhuma na compra de TESTE do Google. O valor é o
  -- recurringPrice do GET: na troca NA HORA (CHARGE_PRORATED_PRICE) o Google cobra só o rateio do período que falta, então a
  -- linha da troca é uma ESTIMATIVA (o preço cheio do produto novo) — o valor exato só pela Orders API (a revisão, ⚪9)
  if v_pedido is not null and not v_atual.teste and v_atual.estado in ('ativa', 'cancelada', 'carencia') then
    select c.dono_id into v_dono from {schema}.contas c where c.id = v_conta;
    v_valor := case when v_valor is not null and v_valor > 0 then round(v_valor, 2) else v_plano.valor end;
    if v_dono is null or v_valor is null or v_valor <= 0 then
      v_cobranca := 'sem_recebedor';
    else
      insert into {schema}.cobrancas (nutricionista_id, paciente_id, conta_id, criado_por, tipo, descricao, valor, vencimento, mes_ref,
                                      status, pago_em, forma, plano_aluno_id, meses_cobertos, origem, play_pedido)
      values (v_dono, v_pac.id, v_conta, null, 'mensalidade', 'Mensalidade · ' || v_plano.nome || ' · Google Play', v_valor,
              (v_pago_em at time zone 'America/Sao_Paulo')::date,
              date_trunc('month', v_pago_em at time zone 'America/Sao_Paulo')::date,
              'paga', v_pago_em, 'google_play', v_plano.id, 1, 'google_play', v_pedido)
      on conflict (play_pedido) where play_pedido is not null do nothing;
      get diagnostics v_n = row_count;
      v_cobranca := case when v_n > 0 then 'nova' else 'ja_tinha' end;
    end if;
  end if;

  -- a devolução (o voidedPurchaseNotification): a cobrança do pedido vira 'cancelada' + reembolsado_em
  if v_devolvido is not null then
    update {schema}.cobrancas set status = 'cancelada', reembolsado_em = coalesce(reembolsado_em, now())
     where play_pedido = v_devolvido and forma = 'google_play' and paciente_id = v_pac.id and status = 'paga';
    get diagnostics v_devolvidas = row_count;
  end if;

  select p2.mensalidade_pago_ate into v_depois from {schema}.pacientes p2 where p2.id = v_pac.id;
  return jsonb_build_object('ok', true, 'nova', v_nova, 'estado', v_atual.estado, 'expira_em', v_atual.expira_em,
                            'reconhecida_em', v_atual.reconhecida_em, 'adiar_ate', v_atual.adiar_ate, 'adiada_em', v_atual.adiada_em,
                            'cobertura_antes', v_antes, 'pago_ate', v_depois, 'cobranca', v_cobranca, 'devolvidas', v_devolvidas,
                            'plano', v_troca, 'matricula_ativa', coalesce(v_pac.ativo, false) and v_pac.deleted_at is null,
                            'troca_para', v_atual.troca_para);
end;
$$;
revoke all on function {schema}.play_aplicar(jsonb) from public, anon, authenticated;
grant execute on function {schema}.play_aplicar(jsonb) to service_role;

-- ============================================================================================================
-- 4. As leituras do aluno: + troca_para dentro de 'play' (chave nova; o APK antigo ignora)
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
      'plano_meses', (select pa.meses from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      -- play-W6: a assinatura viva da Google Play da matrícula do app (o token e o pedido NÃO saem do servidor)
      'play', case when c.origem = 'app' then
                (select jsonb_build_object('estado', a.estado, 'renova', a.renova, 'expira_em', a.expira_em, 'produto', a.produto,
                                           'troca_para', a.troca_para)
                   from {schema}.play_assinaturas a
                  where a.paciente_id = p.id and a.estado in ('pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada')
                    -- a cancelada que já venceu (a expiração que ainda não chegou ao banco) não é viva: a regra da play_aplicar
                    and not (a.estado = 'cancelada' and a.expira_em is not null and a.expira_em < now())
                  order by a.atualizada_em desc limit 1) end
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
                                      from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1),
                     -- play-W6: a assinatura viva da Google Play (o token e o pedido NÃO saem do servidor)
                     'play', (select jsonb_build_object('estado', a.estado, 'renova', a.renova, 'expira_em', a.expira_em,
                                                        'produto', a.produto, 'troca_para', a.troca_para)
                                from {schema}.play_assinaturas a
                               where a.paciente_id = p.id and a.estado in ('pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada')
                    -- a cancelada que já venceu (a expiração que ainda não chegou ao banco) não é viva: a regra da play_aplicar
                    and not (a.estado = 'cancelada' and a.expira_em is not null and a.expira_em < now())
                               order by a.atualizada_em desc limit 1))
                    from {schema}.pacientes p left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
                   where p.user_id = auth.uid() and p.conta_id = {schema}.conta_do_app() and p.deleted_at is null
                   order by p.ativo desc, p.created_at desc limit 1),
    'com_profissional', exists (select 1 from {schema}.pacientes p where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
                                   and p.conta_id is distinct from {schema}.conta_do_app()));
$$;

-- ============================================================================================================
-- 5. A conferência do fim (qualquer diferença desfaz a migration inteira)
-- ============================================================================================================
do $c$
declare
  v_t oid := '{schema}.play_assinaturas'::regclass;
  v_f oid := '{schema}.play_aplicar(jsonb)'::regprocedure;
begin
  if not exists (select 1 from pg_attribute a where a.attrelid = v_t and a.attname = 'troca_para' and not a.attisdropped
                    and a.atttypid = 'text'::regtype and not a.attnotnull) then
    raise exception 'playw6 T2: {schema}.play_assinaturas sem a coluna troca_para (text, nula)';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = v_t and c.conname = 'play_assinaturas_troca_para_check') then
    raise exception 'playw6 T2: {schema}.play_assinaturas sem a constraint do troca_para';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = v_t)
     or exists (select 1 from pg_policy pl where pl.polrelid = v_t)
     or has_table_privilege('anon', v_t, 'select, insert, update, delete')
     or has_table_privilege('authenticated', v_t, 'select, insert, update, delete')
     or has_column_privilege('anon', v_t, 'troca_para', 'select, insert, update')
     or has_column_privilege('authenticated', v_t, 'troca_para', 'select, insert, update') then
    raise exception 'playw6 T2: {schema}.play_assinaturas aberta ao app ou ao visitante (ou sem RLS, ou com policy)';
  end if;
  if not (select pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=""'] from pg_proc pr where pr.oid = v_f)
     or has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute')
     or not has_function_privilege('service_role', v_f, 'execute') then
    raise exception 'playw6 T2: {schema}.play_aplicar sem SECURITY DEFINER/search_path vazio, ou não é só do servidor';
  end if;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = '{schema}' and pr.proname in ('play_aplicar', 'financeiro_do_aluno', 'meu_plano_app')
         and pr.prosrc like '%troca_para%') <> 3 then
    raise exception 'playw6 T2: as 3 funções de {schema} sem o troca_para';
  end if;
end $c$;
