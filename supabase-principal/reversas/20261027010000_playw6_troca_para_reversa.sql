-- Reversa da Migration A do T2 do play-W6 (supabase-principal/migrations/20261027010000_playw6_troca_para.sql). Idempotente: roda com
-- ou sem a migration aplicada. Devolve os 3 corpos da 20261016010000_playw6_play_billing.sql letra por letra (a play_aplicar do §5, a
-- financeiro_do_aluno e a meu_plano_app do §6): a play_aplicar deixa de gravar o troca_para e as leituras do aluno deixam de mostrá-lo.
-- FICAM a coluna play_assinaturas.troca_para e a constraint dela (inertes: nenhuma leitura do aluno as mostra; as funções publicadas
-- que a selecionam seguem funcionando — tirar a coluna QUEBRARIA a play-compras e a pagamentos-aluno publicadas com o T2).
-- ⚠️ Só vale enquanto nenhuma migration mais nova mexer nas 3 funções (antes de rodar: git log das migrations depois de 20261027010000).
-- Junto (a VOLTA do §5 do contrato): as funções do T2 voltam ao código de antes (a play-compras, a play-conferir e as que importam o
-- _shared/play-assinaturas.ts ou o _shared/play-regras.ts) — a ordem: as funções primeiro, esta reversa depois.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261027010000_playw6_troca_para_reversa.sql --so staging
--          python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261027010000_playw6_troca_para_reversa.sql --so public

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- Os 3 corpos da W6 (cópia letra por letra; create or replace: assinatura, atributos e grants iguais)
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
                                           reconhecida_em, teste, ultimo_pedido, cancelada_por, adiar_ate, adiada_em)
    values (v_pac.id, v_conta, v_produto, v_plano_base, v_token, v_ant, v_estado, v_expira, v_renova,
            case when v_reconhecida then now() end, v_teste, v_pedido,
            coalesce(v_por, case when v_estado in ('cancelada', 'expirada', 'revogada') then 'google' end),
            v_adiar, case when v_adiada then now() end);
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
                            'plano', v_troca, 'matricula_ativa', coalesce(v_pac.ativo, false) and v_pac.deleted_at is null);
end;
$$;
revoke all on function {schema}.play_aplicar(jsonb) from public, anon, authenticated;
grant execute on function {schema}.play_aplicar(jsonb) to service_role;

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
                (select jsonb_build_object('estado', a.estado, 'renova', a.renova, 'expira_em', a.expira_em, 'produto', a.produto)
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
                                                        'produto', a.produto)
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
