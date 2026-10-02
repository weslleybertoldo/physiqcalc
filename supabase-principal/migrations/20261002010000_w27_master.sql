-- Physiq W27 — Painel master (spec §4.7; C55–C60, C62, N-5, N-8, N-22, N-74/R18, P7, R2, R6). Banco principal, public + staging.
-- Idempotente. SÓ FUNÇÕES NOVAS (nenhuma tabela, coluna, política ou dado muda ao aplicar).
--
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002010000_w27_master.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002010000_w27_master.sql --so public
--
-- Quem chama: as telas /master/* pelas funções master-contas, master-financeiro e master-planos (que conferem o master antes
-- e fazem o que é do servidor: criar o login, cancelar a assinatura no Mercado Pago, o aviso). Toda função daqui confere
-- sou_master() de novo (JWT ou perfil master deste schema) e devolve { ok: false, erro: 'so_master' } para os outros.
-- REAPROVEITA as regras que já existem (não duplica): criar_minha_conta (W4, a conta nova com o teste e os papéis pelo tipo de
-- perfil — o master cria PELA pessoa, como o alunos_como da W13), aplicar_pagamento_conta (W4, +N meses a partir do maior entre
-- o vencimento, o teste e hoje), situacao_da_conta_em/cobranca_hoje (W4), matricular_na_conta (W3/W7b, P7 + encerra o app),
-- conta_pode_adicionar_aluno/conta_limite_alunos (W2, a faixa), o espelho (gatilhos da W4/W5/W14 + espelho_disparar: o Banco
-- do Treino recebe acesso, bloqueio dos alunos, responsável e conta).
-- Contas legadas (cobranca_legada = true) seguem as regras e as telas de hoje até a W28 (P9): aqui as ações de cobrança e de
-- acesso delas respondem 'cobranca_legada' (a tela mostra "Cobrança legada até a virada" com o caminho antigo).

-- ============================================================================================================
-- 0. Auxiliares
-- ============================================================================================================

-- situação que vale hoje: conta nova = a regra da W4 (vence no dia seguinte, teste, isenta…); legado = a gravada (informativa)
create or replace function {schema}.w27_situacao(p_origem text, p_legada boolean, p_situacao text, p_teste date, p_vence date, p_tol integer)
returns text language sql stable set search_path = '' as $$
  select case when p_origem = 'nova' and not coalesce(p_legada, false)
              then {schema}.situacao_da_conta_em(p_situacao, p_teste, p_vence, p_tol, {schema}.cobranca_hoje())
              else p_situacao end;
$$;

create or replace function {schema}.w27_nome(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
    from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = p_user;
$$;

-- a linha de uma conta como as telas do master mostram (Contas, Financeiro, Integrações)
create or replace function {schema}.w27_conta_linha(p_conta uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano, 'modulos', to_jsonb({schema}.modulos_do_plano(c.plano)),
    'faixa', c.faixa, 'periodicidade', c.periodicidade, 'situacao', c.situacao,
    'situacao_efetiva', {schema}.w27_situacao(c.origem, c.cobranca_legada, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias),
    'teste_ate', c.teste_ate, 'vence_em', c.vence_em, 'tolerancia_dias', c.tolerancia_dias, 'valor_travado', c.valor_travado,
    'valor_mensal', {schema}.conta_preco(c.id, c.plano, c.faixa, 1), 'regra_pix', c.regra_pix, 'cobranca_legada', c.cobranca_legada,
    'isenta_motivo', c.isenta_motivo, 'recebimento_modo', c.recebimento_modo, 'bloquear_app_inadimplente', c.bloquear_app_inadimplente,
    'alunos_bloqueados_em', c.alunos_bloqueados_em, 'alunos_bloqueados_msg', c.alunos_bloqueados_msg,
    'criado_em', c.criado_em, 'atualizado_em', c.atualizado_em, 'eh_app', c.origem = 'app',
    'dono', (select jsonb_build_object('id', u.id, 'nome', {schema}.w27_nome(u.id), 'email', lower(u.email),
                     'master', coalesce(u.raw_app_meta_data ->> 'role', '') = 'master' or coalesce(pr.role, '') = 'master')
               from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = c.dono_id),
    'membros', (select count(*) from {schema}.conta_membros m where m.conta_id = c.id and m.status = 'ativo'),
    'convidados', (select count(*) from {schema}.conta_membros m where m.conta_id = c.id and m.status = 'convidado'),
    'alunos_ativos', {schema}.conta_alunos_ativos(c.id),
    'alunos_total', (select count(*) from {schema}.pacientes p where p.conta_id = c.id and p.deleted_at is null),
    'limite_alunos', {schema}.conta_limite_alunos(c.id),
    'assinatura', (select jsonb_build_object('status', a.status, 'valor', a.valor, 'proximo_vencimento', a.proximo_vencimento)
                     from {schema}.conta_assinaturas a where a.conta_id = c.id),
    'legado_nutri', case when c.origem = 'legado_nutri' then (
        select jsonb_build_object('teste_ate', pr.teste_ate, 'pago_ate', pr.pago_ate, 'isento', coalesce(pr.isento_assinatura, false))
          from {schema}.profiles pr where pr.id = c.dono_id) end,
    'ultima_fatura', (select jsonb_build_object('id', f.id, 'valor', f.valor, 'status', f.status, 'forma', f.forma, 'tipo', f.tipo,
                             'criado_em', f.criado_em, 'pago_em', f.pago_em, 'cobre_ate', f.cobre_ate)
                        from {schema}.conta_faturas f where f.conta_id = c.id order by f.criado_em desc limit 1),
    'chave_pix', (select jsonb_build_object('tipo', k.tipo, 'chave', k.chave, 'favorecido', k.favorecido, 'banco', k.banco)
                    from {schema}.recebimento_chaves k where k.conta_id = c.id and k.ativa limit 1))
  from {schema}.contas c where c.id = p_conta;
$$;

-- peso para a lista: quem precisa de atenção primeiro (spec 4.7: vencidas, teste acabando…)
create or replace function {schema}.w27_peso(p_sit text) returns integer
language sql immutable set search_path = '' as $$
  select case p_sit when 'vencida' then 0 when 'suspensa' then 1 when 'teste' then 2 when 'ativa' then 3 when 'isenta' then 4 else 5 end;
$$;

-- ============================================================================================================
-- 1. Visão geral (C55): números por conta, profissionais, alunos, receita da plataforma e quem precisa de atenção
-- ============================================================================================================
create or replace function {schema}.master_visao_geral() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := {schema}.cobranca_hoje();
  v_ini date := date_trunc('month', {schema}.cobranca_hoje())::date;
  v_app uuid := {schema}.conta_do_app();
  v_contas jsonb;
  v_res jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select coalesce(jsonb_agg(x.l), '[]'::jsonb) into v_contas
    from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c where c.origem <> 'app') x;
  v_res := jsonb_build_object(
    'ok', true, 'hoje', v_hoje,
    'contas', jsonb_build_object(
      'total', jsonb_array_length(v_contas),
      'teste', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'situacao_efetiva' = 'teste'),
      'ativas', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'situacao_efetiva' = 'ativa'),
      'vencidas', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'situacao_efetiva' = 'vencida'),
      'isentas', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'situacao_efetiva' = 'isenta'),
      'suspensas', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'situacao_efetiva' in ('suspensa', 'cancelada')),
      'novas', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'origem' = 'nova'),
      'legado_calc', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'origem' = 'legado_calc'),
      'legado_nutri', (select count(*) from jsonb_array_elements(v_contas) e where e ->> 'origem' = 'legado_nutri')),
    'profissionais', (select count(distinct m.user_id) from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
                       where m.status = 'ativo' and m.user_id is not null and c.origem <> 'app'),
    'alunos', jsonb_build_object(
      'ativos', (select count(*) from {schema}.pacientes p where p.conta_id is not null and p.conta_id is distinct from v_app
                   and p.ativo and p.deleted_at is null and p.acesso_bloqueado_em is null),
      'app', (select count(*) from {schema}.pacientes p where p.conta_id = v_app and p.ativo and p.deleted_at is null),
      'bloqueados', (select count(*) from {schema}.pacientes p where p.conta_id is not null and p.deleted_at is null and p.acesso_bloqueado_em is not null),
      'em_2_contas', (select count(*) from (select p.user_id from {schema}.pacientes p
                        where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
                        group by p.user_id having count(distinct p.conta_id) > 1) d)),
    -- receita da plataforma: o que as contas pagaram no mês (faturas aprovadas) + as mensalidades do app (aluno sem profissional)
    'receita', jsonb_build_object(
      'mes', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status = 'approved'
                        and (f.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0),
      'mes_anterior', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status = 'approved'
                        and (f.pago_em at time zone 'America/Sao_Paulo')::date >= (v_ini - interval '1 month')::date
                        and (f.pago_em at time zone 'America/Sao_Paulo')::date < v_ini), 0),
      'app_mes', coalesce((select sum(cb.valor) from {schema}.cobrancas cb where cb.conta_id = v_app and cb.status = 'paga' and cb.deleted_at is null
                        and (cb.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0)),
    'atencao', jsonb_build_object(
      'vencidas', coalesce((select jsonb_agg(e order by e ->> 'vence_em') from jsonb_array_elements(v_contas) e
                             where e ->> 'situacao_efetiva' = 'vencida' and not (e ->> 'cobranca_legada')::boolean), '[]'::jsonb),
      'teste_acabando', coalesce((select jsonb_agg(e order by e ->> 'teste_ate') from jsonb_array_elements(v_contas) e
                             where e ->> 'situacao_efetiva' = 'teste' and not (e ->> 'cobranca_legada')::boolean
                               and (e ->> 'teste_ate')::date between v_hoje and v_hoje + 3), '[]'::jsonb),
      'suspensas', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_contas) e where e ->> 'situacao_efetiva' = 'suspensa'), '[]'::jsonb),
      'alunos_bloqueados', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_contas) e where e ->> 'alunos_bloqueados_em' is not null), '[]'::jsonb),
      -- falhas: pagamentos recusados/estornados nos últimos 30 dias e a fila do espelho com erro (o Banco do Treino não recebeu)
      'pagamentos_recusados', (select count(*) from {schema}.conta_faturas f where f.status in ('rejected', 'charged_back', 'refunded')
                                and f.atualizado_em >= now() - interval '30 days'),
      'espelho_falhas', (select count(*) from {schema}.espelho_pendencias e where e.feito_em is null and e.tentativas > 0),
      'espelho_parado', (select count(*) from {schema}.espelho_pendencias e where e.feito_em is null and e.tentativas >= 5)));
  return v_res;
end;
$$;

-- ============================================================================================================
-- 2. Contas (C56, N-5, N-22, R6): todas as contas, detalhe com membros, ações
-- ============================================================================================================
create or replace function {schema}.master_contas(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca text := lower(btrim(coalesce(v_f ->> 'busca', '')));
  v_sit text := nullif(v_f ->> 'situacao', '');
  v_origem text := nullif(v_f ->> 'origem', '');
  v_todas jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select coalesce(jsonb_agg(x.l order by {schema}.w27_peso(x.l ->> 'situacao_efetiva'), lower(x.l ->> 'nome')), '[]'::jsonb) into v_todas
    from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c) x;
  return jsonb_build_object(
    'ok', true, 'hoje', {schema}.cobranca_hoje(),
    'resumo', jsonb_build_object(
      'todas', jsonb_array_length(v_todas),
      'ativas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' in ('ativa', 'teste', 'isenta')),
      'vencidas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'vencida'),
      'suspensas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' in ('suspensa', 'cancelada'))),
    'contas', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(v_todas) e
       where (v_origem is null or e ->> 'origem' = v_origem)
         and (v_sit is null
              or (v_sit = 'ativas' and e ->> 'situacao_efetiva' in ('ativa', 'teste', 'isenta'))
              or (v_sit = 'suspensas' and e ->> 'situacao_efetiva' in ('suspensa', 'cancelada'))
              or e ->> 'situacao_efetiva' = v_sit)
         and (v_busca = '' or lower(e ->> 'nome') like '%' || v_busca || '%'
              or lower(coalesce(e #>> '{dono,nome}', '')) like '%' || v_busca || '%'
              or lower(coalesce(e #>> '{dono,email}', '')) like '%' || v_busca || '%')), '[]'::jsonb));
end;
$$;

create or replace function {schema}.master_conta_detalhe(p_conta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if not exists (select 1 from {schema}.contas where id = p_conta) then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  return jsonb_build_object(
    'ok', true, 'hoje', {schema}.cobranca_hoje(),
    'conta', {schema}.w27_conta_linha(p_conta),
    'membros', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'user_id', m.user_id, 'nome', case when m.user_id is null then null else {schema}.w27_nome(m.user_id) end,
        'email', coalesce(lower(u.email), m.email_convite), 'papeis', to_jsonb(m.papeis), 'status', m.status, 'codigo_convite', m.codigo_convite,
        'treino_user_id', m.treino_user_id, 'criado_em', m.criado_em, 'ultimo_acesso', u.last_sign_in_at,
        'master', coalesce(u.raw_app_meta_data ->> 'role', '') = 'master' or coalesce(pr.role, '') = 'master',
        'alunos', (select count(*) from {schema}.pacientes p where p.conta_id = m.conta_id and p.deleted_at is null
                     and (p.personal_id = m.user_id or p.nutricionista_id = m.user_id)))
        order by ('dono' = any(m.papeis)) desc, m.status, m.criado_em)
      from {schema}.conta_membros m left join auth.users u on u.id = m.user_id left join {schema}.profiles pr on pr.id = m.user_id
     where m.conta_id = p_conta and m.status <> 'removido'), '[]'::jsonb),
    'alunos', jsonb_build_object(
      'ativos', {schema}.conta_alunos_ativos(p_conta),
      'inativos', (select count(*) from {schema}.pacientes p where p.conta_id = p_conta and p.deleted_at is null and not p.ativo),
      'bloqueados', (select count(*) from {schema}.pacientes p where p.conta_id = p_conta and p.deleted_at is null and p.acesso_bloqueado_em is not null),
      'lixeira', (select count(*) from {schema}.pacientes p where p.conta_id = p_conta and p.deleted_at is not null),
      'sem_responsavel', (select count(*) from {schema}.pacientes p where p.conta_id = p_conta and p.deleted_at is null and p.ativo
                            and p.personal_id is null and p.nutricionista_id is null)),
    'faturas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'tipo', f.tipo, 'valor', f.valor, 'status', f.status, 'forma', f.forma, 'cobre_de', f.cobre_de, 'cobre_ate', f.cobre_ate,
        'pago_em', f.pago_em, 'criado_em', f.criado_em, 'descricao', f.descricao, 'plano', f.plano, 'faixa', f.faixa, 'meses', f.meses,
        'registrado_por', case when f.registrado_por is null then null else {schema}.w27_nome(f.registrado_por) end) order by f.criado_em desc)
      from (select * from {schema}.conta_faturas where conta_id = p_conta order by criado_em desc limit 24) f), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'antes', e.antes, 'depois', e.depois, 'em', e.em,
        'por', case when e.por is null then null else {schema}.w27_nome(e.por) end) order by e.em desc)
      from (select * from {schema}.conta_eventos where conta_id = p_conta order by em desc limit 40) e), '[]'::jsonb));
end;
$$;

-- ações do master numa conta. Conta nova: as regras da W4 (o vencimento vale até o dia, inclusive; isenta não vê o "Pagar";
-- suspensa = painel travado sem o "Pagar"). O gatilho da W4 manda o acesso novo ao Banco do Treino (espelho).
create or replace function {schema}.master_conta_acao(p_conta uuid, p_acao text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_a jsonb := coalesce(p_args, '{}'::jsonb);
  v_c {schema}.contas%rowtype;
  v_novo {schema}.contas%rowtype;
  v_hoje date := {schema}.cobranca_hoje();
  v_data date;
  v_txt text;
  v_plano text;
  v_faixa text;
  v_max integer;
  v_ativos integer;
  v_base text;
  v_membros uuid[];
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select * into v_c from {schema}.contas where id = p_conta for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if v_c.origem = 'app' and p_acao not in ('recebimento') then return jsonb_build_object('ok', false, 'erro', 'conta_do_app'); end if;
  -- legados: cobrança e acesso pelas regras e telas de hoje até a virada (P9, W28)
  if v_c.cobranca_legada and p_acao in ('plano', 'vencimento', 'liberar', 'isentar', 'tirar_isencao', 'suspender', 'reativar',
                                        'bloquear_alunos', 'desbloquear_alunos', 'excluir') then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_legada', 'origem', v_c.origem);
  end if;
  v_base := case when v_c.situacao in ('isenta', 'suspensa', 'cancelada') then v_c.situacao else 'ativa' end;

  if p_acao = 'plano' then
    v_plano := coalesce(nullif(v_a ->> 'plano', ''), v_c.plano);
    v_faixa := coalesce(nullif(v_a ->> 'faixa', ''), v_c.faixa);
    if v_plano not in ('treino', 'nutricao', 'treino_nutricao') or v_faixa not in ('f10', 'f30', 'f100', 'livre') then
      return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
    end if;
    if v_plano = v_c.plano and v_faixa = v_c.faixa then return jsonb_build_object('ok', true, 'sem_mudanca', true, 'conta', {schema}.w27_conta_linha(p_conta)); end if;
    -- a regra de hoje (Calc, W4): descer só se os alunos ativos couberem
    v_max := {schema}.plano_max_alunos(v_plano, v_faixa);
    v_ativos := {schema}.conta_alunos_ativos(p_conta);
    if v_max is not null and v_ativos > v_max then
      return jsonb_build_object('ok', false, 'erro', 'alunos_acima_do_limite', 'limite', v_max, 'alunos', v_ativos);
    end if;
    update {schema}.contas set plano = v_plano, faixa = v_faixa where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'plano', jsonb_build_object('plano', v_c.plano, 'faixa', v_c.faixa),
            jsonb_build_object('plano', v_plano, 'faixa', v_faixa, 'valor_mensal', {schema}.conta_preco(p_conta, v_plano, v_faixa, 1), 'por', 'master'), v_uid);

  elsif p_acao in ('vencimento', 'liberar') then
    begin
      v_data := (v_a ->> 'data')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'data_invalida');
    end;
    if v_data is null or v_data < date '2020-01-01' or v_data > v_hoje + 3650 then return jsonb_build_object('ok', false, 'erro', 'data_invalida'); end if;
    v_txt := nullif(left(btrim(coalesce(v_a ->> 'motivo', '')), 200), '');
    if p_acao = 'liberar' then
      -- liberar o acesso até uma data: nunca encurta o que a conta já tem
      if v_c.vence_em is not null and v_c.vence_em >= v_data then
        return jsonb_build_object('ok', false, 'erro', 'ja_tem_acesso', 'vence_em', v_c.vence_em);
      end if;
      if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'motivo_obrigatorio'); end if;
    end if;
    update {schema}.contas
       set vence_em = v_data,
           situacao = {schema}.situacao_da_conta_em(v_base, teste_ate, v_data, tolerancia_dias, v_hoje)
     where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'vencimento', jsonb_build_object('vence_em', v_c.vence_em, 'situacao', v_c.situacao),
            jsonb_build_object('vence_em', v_data, 'situacao', v_novo.situacao, 'por', 'master', 'acao', p_acao, 'motivo', v_txt), v_uid);

  elsif p_acao = 'isentar' then
    v_txt := nullif(left(btrim(coalesce(v_a ->> 'motivo', '')), 200), '');
    if v_txt is null or char_length(v_txt) < 3 then return jsonb_build_object('ok', false, 'erro', 'motivo_obrigatorio'); end if;
    update {schema}.contas set situacao = case when situacao = 'suspensa' then situacao else 'isenta' end, isenta_motivo = v_txt
     where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'isencao', jsonb_build_object('situacao', v_c.situacao, 'isenta_motivo', v_c.isenta_motivo),
            jsonb_build_object('situacao', v_novo.situacao, 'isenta_motivo', v_txt, 'por', 'master'), v_uid);

  elsif p_acao = 'tirar_isencao' then
    if v_c.isenta_motivo is null and v_c.situacao <> 'isenta' then return jsonb_build_object('ok', false, 'erro', 'nao_isenta'); end if;
    update {schema}.contas
       set isenta_motivo = null,
           situacao = case when situacao = 'suspensa' then situacao
                           else {schema}.situacao_da_conta_em('ativa', teste_ate, vence_em, tolerancia_dias, v_hoje) end
     where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'isencao', jsonb_build_object('situacao', v_c.situacao, 'isenta_motivo', v_c.isenta_motivo),
            jsonb_build_object('situacao', v_novo.situacao, 'isenta_motivo', null, 'por', 'master'), v_uid);

  elsif p_acao = 'suspender' then
    if v_c.situacao = 'suspensa' then return jsonb_build_object('ok', true, 'ja_estava', true, 'conta', {schema}.w27_conta_linha(p_conta)); end if;
    v_txt := nullif(left(btrim(coalesce(v_a ->> 'motivo', '')), 200), '');
    update {schema}.contas set situacao = 'suspensa' where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'situacao', jsonb_build_object('situacao', v_c.situacao), jsonb_build_object('situacao', 'suspensa', 'motivo', v_txt, 'por', 'master'), v_uid);

  elsif p_acao = 'reativar' then
    if v_c.situacao <> 'suspensa' then return jsonb_build_object('ok', true, 'ja_estava', true, 'conta', {schema}.w27_conta_linha(p_conta)); end if;
    -- volta para a situação das datas (ou isenta, se estava isenta antes de suspender)
    update {schema}.contas
       set situacao = case when isenta_motivo is not null then 'isenta'
                           else {schema}.situacao_da_conta_em('ativa', teste_ate, vence_em, tolerancia_dias, v_hoje) end
     where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'situacao', jsonb_build_object('situacao', v_c.situacao), jsonb_build_object('situacao', v_novo.situacao, 'por', 'master'), v_uid);

  elsif p_acao in ('bloquear_alunos', 'desbloquear_alunos') then
    v_txt := nullif(left(btrim(coalesce(v_a ->> 'mensagem', '')), 300), '');
    if p_acao = 'bloquear_alunos' then
      update {schema}.contas set alunos_bloqueados_em = coalesce(alunos_bloqueados_em, now()), alunos_bloqueados_msg = v_txt
       where id = p_conta returning * into v_novo;
    else
      update {schema}.contas set alunos_bloqueados_em = null, alunos_bloqueados_msg = null where id = p_conta returning * into v_novo;
    end if;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'outro', jsonb_build_object('alunos_bloqueados_em', v_c.alunos_bloqueados_em, 'alunos_bloqueados_msg', v_c.alunos_bloqueados_msg),
            jsonb_build_object('w27', p_acao, 'alunos_bloqueados_em', v_novo.alunos_bloqueados_em, 'alunos_bloqueados_msg', v_novo.alunos_bloqueados_msg), v_uid);

  elsif p_acao = 'recebimento' then
    v_txt := v_a ->> 'modo';
    if v_txt not in ('pix_manual', 'nenhum', 'mercadopago') then return jsonb_build_object('ok', false, 'erro', 'modo_invalido'); end if;
    update {schema}.contas set recebimento_modo = v_txt where id = p_conta returning * into v_novo;
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (p_conta, 'outro', jsonb_build_object('recebimento_modo', v_c.recebimento_modo), jsonb_build_object('w27', 'recebimento', 'recebimento_modo', v_txt), v_uid);

  elsif p_acao = 'excluir' then
    -- só com 0 alunos (nem na lixeira) e sem cobrança automática no cartão; os membros perdem o acesso (espelho)
    if exists (select 1 from {schema}.pacientes p where p.conta_id = p_conta) then
      return jsonb_build_object('ok', false, 'erro', 'tem_alunos', 'alunos', (select count(*) from {schema}.pacientes p where p.conta_id = p_conta));
    end if;
    if exists (select 1 from {schema}.conta_assinaturas a where a.conta_id = p_conta and a.status in ('authorized', 'pending', 'paused')) then
      return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
    end if;
    select coalesce(array_agg(m.user_id), array[]::uuid[]) into v_membros from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id is not null;
    delete from {schema}.contas where id = p_conta;
    insert into {schema}.espelho_pendencias (tipo, payload) select 'pessoa', jsonb_build_object('principal_user_id', u) from unnest(v_membros) u;
    perform {schema}.espelho_disparar();
    return jsonb_build_object('ok', true, 'excluida', true, 'conta_id', p_conta, 'membros', coalesce(array_length(v_membros, 1), 0));

  else
    return jsonb_build_object('ok', false, 'erro', 'acao_invalida');
  end if;

  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'acao', p_acao, 'conta', {schema}.w27_conta_linha(p_conta));
end;
$$;

-- N-8/N-22: o master cria a conta de um profissional (o login já existe: a função master-contas cria com e-mail e senha ou
-- deixa pronto para o Google). A conta nasce PELA PESSOA com a regra do "Sou profissional" (criar_minha_conta: teste de 14 dias
-- no Treino + Nutrição, papéis pelo tipo de perfil, código PROF-…) e o master ajusta plano/faixa e a isenção.
create or replace function {schema}.master_criar_conta(
  p_user uuid, p_nome text, p_tipo text, p_registro text default null,
  p_plano text default null, p_faixa text default null, p_isentar boolean default false, p_motivo text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_master uuid := auth.uid();
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_r jsonb;
  v_conta uuid;
  v_plano text := coalesce(nullif(p_plano, ''), 'treino_nutricao');
  v_faixa text := coalesce(nullif(p_faixa, ''), 'f10');
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 200), '');
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente');
  end if;
  if v_plano not in ('treino', 'nutricao', 'treino_nutricao') or v_faixa not in ('f10', 'f30', 'f100', 'livre') then
    return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
  end if;
  -- o papel precisa do módulo (spec 4.1): personal → Treino; nutricionista/acadêmico → Nutrição; outra área → qualquer
  if (v_tipo = 'personal' and v_plano = 'nutricao') or (v_tipo in ('nutricionista', 'academico') and v_plano = 'treino') then
    return jsonb_build_object('ok', false, 'erro', 'plano_sem_o_modulo_do_tipo');
  end if;
  if coalesce(p_isentar, false) and (v_motivo is null or char_length(v_motivo) < 3) then
    return jsonb_build_object('ok', false, 'erro', 'motivo_obrigatorio');
  end if;
  -- a regra do "Sou profissional", como a própria pessoa (o resto da transação volta a ser o master)
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  v_r := {schema}.criar_minha_conta(p_nome, v_tipo, p_registro);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if not coalesce((v_r ->> 'ok')::boolean, false) then return v_r; end if;
  if coalesce((v_r ->> 'ja_existia')::boolean, false) then
    return jsonb_build_object('ok', false, 'erro', 'ja_tem_conta', 'conta_id', v_r ->> 'conta_id');
  end if;
  v_conta := (v_r ->> 'conta_id')::uuid;
  if v_plano <> 'treino_nutricao' or v_faixa <> 'f10' then
    update {schema}.contas set plano = v_plano, faixa = v_faixa where id = v_conta;
  end if;
  if coalesce(p_isentar, false) then
    update {schema}.contas set situacao = 'isenta', isenta_motivo = v_motivo where id = v_conta;
  end if;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_conta, 'plano', jsonb_build_object('criada_por', 'master', 'plano', v_plano, 'faixa', v_faixa, 'isenta', coalesce(p_isentar, false),
                                               'isenta_motivo', v_motivo), v_master);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'conta_id', v_conta, 'codigo_convite', v_r ->> 'codigo_convite', 'papeis', v_r -> 'papeis',
                            'teste_ate', v_r ->> 'teste_ate', 'conta', {schema}.w27_conta_linha(v_conta));
end;
$$;

-- N-22 "tornar master": o claim (Auth é um só para os 2 schemas) e o perfil; o Banco do Treino recebe pelo espelho (master).
-- Só promove (tirar o master continua à mão, como hoje no Treino: admin/master nunca é rebaixado sozinho). Nunca em si mesmo.
create or replace function {schema}.master_tornar_master(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_user is null or p_user = auth.uid() then return jsonb_build_object('ok', false, 'erro', 'nao_pode_a_si_mesmo'); end if;
  if not exists (select 1 from auth.users where id = p_user) then return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente'); end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'master'), updated_at = now()
   where id = p_user;
  update {schema}.profiles set role = 'master' where id = p_user;
  insert into {schema}.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', p_user));
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'user_id', p_user, 'master', true);
end;
$$;

-- ============================================================================================================
-- 3. Alunos (C57, C8, P7): todos, filtro por conta / sem conta / do app, mover vários, casos em 2 contas
-- ============================================================================================================
create or replace function {schema}.master_alunos(p_filtros jsonb default '{}'::jsonb, p_offset integer default 0, p_limite integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca text := lower(btrim(coalesce(v_f ->> 'busca', '')));
  v_conta uuid := nullif(v_f ->> 'conta_id', '')::uuid;
  v_modo text := coalesce(nullif(v_f ->> 'modo', ''), 'ativos');
  v_app uuid := {schema}.conta_do_app();
  v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_lista jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or lower(coalesce(p.nome, '')) like '%' || v_busca || '%' or lower(coalesce(p.email, '')) like '%' || v_busca || '%')
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
  )
  select count(*) into v_total from filtrada;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or lower(coalesce(p.nome, '')) like '%' || v_busca || '%' or lower(coalesce(p.email, '')) like '%' || v_busca || '%')
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
     order by case when v_modo = 'p7' then coalesce(b.user_id::text, '') else '' end, lower(coalesce(b.nome, '')), b.created_at
     offset v_off limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', b.id, 'nome', b.nome, 'email', coalesce(lower((select u.email from auth.users u where u.id = b.user_id)), lower(b.email)),
      'user_id', b.user_id, 'tem_login', b.user_id is not null, 'ativo', b.ativo, 'criado_em', b.created_at,
      'conta', case when b.conta_id is null then null else jsonb_build_object('id', b.conta_id, 'nome', b.conta_nome, 'origem', b.conta_origem,
                                                                               'eh_app', b.conta_id = v_app) end,
      'personal', case when b.personal_id is null then null else jsonb_build_object('id', b.personal_id, 'nome', {schema}.w27_nome(b.personal_id)) end,
      'nutricionista', case when b.nutricionista_id is null then null else jsonb_build_object('id', b.nutricionista_id, 'nome', {schema}.w27_nome(b.nutricionista_id)) end,
      'modulos', to_jsonb({schema}.w13_modulos_do_aluno(b.personal_id, b.nutricionista_id, b.conta_plano)),
      'bloqueado', b.acesso_bloqueado_em is not null, 'conta_bloqueada', b.conta_bloq is not null, 'p7', b.p7,
      'app', case when b.conta_id = v_app then jsonb_build_object('plano', (select pa.nome from {schema}.planos_aluno pa where pa.id = b.plano_aluno_id),
                                                                   'valor', b.mensalidade_valor, 'teste_ate', b.app_teste_ate, 'pago_ate', b.mensalidade_pago_ate,
                                                                   'encerrada_em', b.app_encerrada_em, 'objetivo', b.objetivo_app) end)), '[]'::jsonb)
    into v_lista from filtrada b;
  return jsonb_build_object('ok', true, 'modo', v_modo, 'total', v_total, 'offset', v_off, 'limite', v_lim, 'alunos', v_lista,
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
                                                            'modulos', to_jsonb({schema}.modulos_do_plano(c.plano))) order by c.origem = 'app', lower(c.nome))
                          from {schema}.contas c), '[]'::jsonb),
    'contagens', jsonb_build_object(
      'ativos', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.acesso_bloqueado_em is null and p.conta_id is distinct from v_app),
      'app', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.conta_id = v_app),
      'p7', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.user_id in (
                select q.user_id from {schema}.pacientes q where q.user_id is not null and q.ativo and q.deleted_at is null and q.conta_id is not null
                   and q.conta_id is distinct from v_app group by q.user_id having count(distinct q.conta_id) > 1)),
      'sem_conta', (select count(*) from auth.users u join {schema}.profiles pr on pr.id = u.id
                     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
                       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
                       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido'))));
end;
$$;

-- "sem conta" (C8): quem tem login e não é aluno nem profissional de nenhuma conta (fica nas Boas-vindas)
create or replace function {schema}.master_sem_conta(p_busca text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_busca text := lower(btrim(coalesce(p_busca, '')));
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  return jsonb_build_object('ok', true, 'pessoas', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nome', {schema}.w27_nome(u.id), 'email', lower(u.email), 'papel', pr.role,
                                        'criado_em', u.created_at, 'ultimo_acesso', u.last_sign_in_at) order by u.created_at desc)
      from auth.users u join {schema}.profiles pr on pr.id = u.id
     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido')
       and (v_busca = '' or lower(u.email) like '%' || v_busca || '%' or lower(coalesce(pr.nome, '')) like '%' || v_busca || '%')), '[]'::jsonb));
end;
$$;

-- mover vários alunos para outra conta (C57, "mover alunos" do Calc). Aluno de conta de profissional: a MESMA matrícula muda de
-- conta e de responsáveis (os dados dele vão junto, como o "mover" do Calc). Aluno do app (sem profissional) ou pessoa sem conta:
-- entra na conta pela matricular_na_conta (W3/W7b: P7, limite da faixa, a matrícula do app encerra — a função master-contas
-- cancela a assinatura do app no Mercado Pago). Responsável precisa ser membro ativo com o papel do módulo (o módulo precisa estar
-- no plano da conta). O espelho leva professor/conta/status ao Banco do Treino (gatilho da W5/W14).
create or replace function {schema}.master_mover_alunos(p_pacientes uuid[], p_usuarios uuid[], p_conta uuid, p_personal uuid default null, p_nutri uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c {schema}.contas%rowtype;
  v_app uuid := {schema}.conta_do_app();
  v_mods text[];
  v_personal uuid;
  v_nutri uuid;
  v_p {schema}.pacientes%rowtype;
  v_id uuid;
  v_r jsonb;
  v_movidos integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_app_enc uuid[] := array[]::uuid[];
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select * into v_c from {schema}.contas where id = p_conta for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if v_c.origem = 'app' then return jsonb_build_object('ok', false, 'erro', 'conta_do_app'); end if;
  if v_c.situacao in ('suspensa', 'cancelada') then return jsonb_build_object('ok', false, 'erro', 'conta_suspensa'); end if;
  if coalesce(array_length(p_pacientes, 1), 0) + coalesce(array_length(p_usuarios, 1), 0) = 0
     or coalesce(array_length(p_pacientes, 1), 0) + coalesce(array_length(p_usuarios, 1), 0) > 200 then
    return jsonb_build_object('ok', false, 'erro', 'selecao_invalida');
  end if;
  v_mods := {schema}.modulos_do_plano(v_c.plano);
  v_personal := case when 'treino' = any(v_mods) then p_personal end;
  v_nutri := case when 'nutricao' = any(v_mods) then p_nutri end;
  if v_personal is not null and not exists (select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = v_personal
                                               and m.status = 'ativo' and 'personal' = any(m.papeis)) then
    return jsonb_build_object('ok', false, 'erro', 'responsavel_invalido', 'modulo', 'treino');
  end if;
  if v_nutri is not null and not exists (select 1 from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = v_nutri
                                            and m.status = 'ativo' and 'nutricionista' = any(m.papeis)) then
    return jsonb_build_object('ok', false, 'erro', 'responsavel_invalido', 'modulo', 'nutricao');
  end if;
  if v_personal is null and v_nutri is null then return jsonb_build_object('ok', false, 'erro', 'sem_responsavel'); end if;

  foreach v_id in array coalesce(p_pacientes, array[]::uuid[]) loop
    select * into v_p from {schema}.pacientes where id = v_id and deleted_at is null;
    if not found then
      v_erros := v_erros || jsonb_build_object('paciente_id', v_id, 'erro', 'aluno_inexistente');
      continue;
    end if;
    if v_p.conta_id = p_conta then
      update {schema}.pacientes set personal_id = coalesce(v_personal, personal_id), nutricionista_id = coalesce(v_nutri, nutricionista_id) where id = v_id;
      v_movidos := v_movidos + 1;
      continue;
    end if;
    if v_p.conta_id is null or v_p.conta_id = v_app then
      if v_p.user_id is null then
        v_erros := v_erros || jsonb_build_object('paciente_id', v_id, 'erro', 'sem_login');
        continue;
      end if;
      v_r := {schema}.matricular_na_conta(v_p.user_id, p_conta, v_personal, v_nutri, coalesce(v_p.origem, 'novo'), false);
      if not coalesce((v_r ->> 'ok')::boolean, false) then
        v_erros := v_erros || jsonb_build_object('paciente_id', v_id, 'erro', v_r ->> 'erro', 'limite', v_r -> 'limite');
        continue;
      end if;
      if v_p.conta_id = v_app then v_app_enc := v_app_enc || v_p.user_id; end if;
      v_movidos := v_movidos + 1;
      continue;
    end if;
    -- conta de profissional → a mesma matrícula vai para a conta nova (limite da faixa para quem ocupa vaga; 1 matrícula por conta)
    if v_p.ativo and v_p.acesso_bloqueado_em is null and not {schema}.conta_pode_adicionar_aluno(p_conta) then
      v_erros := v_erros || jsonb_build_object('paciente_id', v_id, 'erro', 'limite_plano', 'limite', {schema}.conta_limite_alunos(p_conta));
      continue;
    end if;
    if v_p.user_id is not null and exists (select 1 from {schema}.pacientes q where q.user_id = v_p.user_id and q.conta_id = p_conta
                                              and q.deleted_at is null and q.id <> v_id) then
      v_erros := v_erros || jsonb_build_object('paciente_id', v_id, 'erro', 'ja_esta_na_conta');
      continue;
    end if;
    update {schema}.pacientes set conta_id = p_conta, personal_id = v_personal, nutricionista_id = v_nutri where id = v_id;
    insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
    values (v_p.conta_id, 'outro', jsonb_build_object('w27', 'aluno_saiu', 'paciente_id', v_id, 'para', p_conta), v_uid),
           (p_conta, 'outro', jsonb_build_object('w27', 'aluno_entrou', 'paciente_id', v_id, 'de', v_p.conta_id), v_uid);
    v_movidos := v_movidos + 1;
  end loop;

  foreach v_id in array coalesce(p_usuarios, array[]::uuid[]) loop
    v_r := {schema}.matricular_na_conta(v_id, p_conta, v_personal, v_nutri, 'novo', false);
    if not coalesce((v_r ->> 'ok')::boolean, false) then
      v_erros := v_erros || jsonb_build_object('user_id', v_id, 'erro', v_r ->> 'erro', 'limite', v_r -> 'limite');
      continue;
    end if;
    v_movidos := v_movidos + 1;
  end loop;

  if v_movidos > 0 then
    insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
    values (p_conta, 'outro', jsonb_build_object('w27', 'alunos_movidos', 'quantos', v_movidos, 'personal', v_personal, 'nutricionista', v_nutri), v_uid);
  end if;
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', v_movidos > 0 or jsonb_array_length(v_erros) = 0, 'movidos', v_movidos, 'erros', v_erros,
                            'erro', case when v_movidos = 0 and jsonb_array_length(v_erros) > 0 then v_erros -> 0 ->> 'erro' end,
                            'app_encerrados', to_jsonb(v_app_enc));
end;
$$;

-- ============================================================================================================
-- 4. Financeiro (C58, N-74/R18): faturas e situação das contas, registrar pagamento feito por fora
-- ============================================================================================================
create or replace function {schema}.master_financeiro(p_filtro text default 'todas') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := {schema}.cobranca_hoje();
  v_ini date := date_trunc('month', {schema}.cobranca_hoje())::date;
  v_todas jsonb;
  v_filtro text := coalesce(nullif(p_filtro, ''), 'todas');
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select coalesce(jsonb_agg(x.l order by {schema}.w27_peso(x.l ->> 'situacao_efetiva'), x.l ->> 'vence_em', lower(x.l ->> 'nome')), '[]'::jsonb) into v_todas
    from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c where c.origem <> 'app') x;
  return jsonb_build_object(
    'ok', true, 'hoje', v_hoje, 'filtro', v_filtro,
    'resumo', jsonb_build_object(
      'todas', jsonb_array_length(v_todas),
      'vencidas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'vencida'),
      'tolerancia', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'ativa'
                      and (e ->> 'vence_em')::date < v_hoje and coalesce((e ->> 'tolerancia_dias')::integer, 0) > 0),
      'teste', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'teste'),
      'isentas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'isenta'),
      'em_dia', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'ativa'),
      'legadas', (select count(*) from jsonb_array_elements(v_todas) e where (e ->> 'cobranca_legada')::boolean),
      'recebido_mes', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status = 'approved'
                                 and (f.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0),
      'em_aberto', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status in ('pending', 'in_process')), 0)),
    'contas', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_todas) e
       where case v_filtro
               when 'vencidas' then e ->> 'situacao_efetiva' = 'vencida'
               when 'tolerancia' then e ->> 'situacao_efetiva' = 'ativa' and (e ->> 'vence_em')::date < v_hoje and coalesce((e ->> 'tolerancia_dias')::integer, 0) > 0
               when 'teste' then e ->> 'situacao_efetiva' = 'teste'
               when 'isentas' then e ->> 'situacao_efetiva' = 'isenta'
               when 'em_dia' then e ->> 'situacao_efetiva' = 'ativa'
               when 'legadas' then (e ->> 'cobranca_legada')::boolean
               else true end), '[]'::jsonb),
    'faturas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'conta_id', f.conta_id, 'conta_nome', c.nome, 'tipo', f.tipo, 'valor', f.valor, 'status', f.status, 'forma', f.forma,
        'cobre_de', f.cobre_de, 'cobre_ate', f.cobre_ate, 'pago_em', f.pago_em, 'criado_em', f.criado_em, 'descricao', f.descricao,
        'registrado_por', case when f.registrado_por is null then null else {schema}.w27_nome(f.registrado_por) end) order by f.criado_em desc)
      from (select * from {schema}.conta_faturas order by criado_em desc limit 40) f join {schema}.contas c on c.id = f.conta_id), '[]'::jsonb));
end;
$$;

-- pagamento feito por fora (transferência, dinheiro…): fatura "manual" aprovada e a MESMA regra do Pix/cartão (W4)
create or replace function {schema}.master_registrar_pagamento(p_conta uuid, p_valor numeric, p_meses integer default 1,
                                                                 p_pago_em date default null, p_descricao text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c {schema}.contas%rowtype;
  v_id uuid;
  v_dia date := coalesce(p_pago_em, {schema}.cobranca_hoje());
  v_r jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if v_c.origem = 'app' then return jsonb_build_object('ok', false, 'erro', 'conta_do_app'); end if;
  if v_c.cobranca_legada then return jsonb_build_object('ok', false, 'erro', 'cobranca_legada', 'origem', v_c.origem); end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 then return jsonb_build_object('ok', false, 'erro', 'valor_invalido'); end if;
  if p_meses is null or p_meses not in (1, 2, 3, 6, 12) then return jsonb_build_object('ok', false, 'erro', 'meses_invalido'); end if;
  if v_dia > {schema}.cobranca_hoje() or v_dia < {schema}.cobranca_hoje() - 366 then return jsonb_build_object('ok', false, 'erro', 'data_invalida'); end if;
  insert into {schema}.conta_faturas (conta_id, tipo, valor, status, forma, registrado_por, origem, descricao, plano, faixa, meses)
  values (p_conta, 'manual', round(p_valor, 2), 'pending', 'manual', v_uid, 'master',
          coalesce(nullif(left(btrim(coalesce(p_descricao, '')), 200), ''), 'Pagamento registrado pelo master'), v_c.plano, v_c.faixa, p_meses)
  returning id into v_id;
  v_r := {schema}.aplicar_pagamento_conta(v_id, (v_dia::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo');
  return v_r || jsonb_build_object('fatura_id', v_id, 'conta', {schema}.w27_conta_linha(p_conta));
end;
$$;

-- ============================================================================================================
-- 5. Planos (C59, R2): tabela por módulo × faixa (anual = 10×), dias e limite do teste, histórico; sem adesão
-- ============================================================================================================
create or replace function {schema}.master_planos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  return jsonb_build_object(
    'ok', true,
    'precos', coalesce((select jsonb_agg(jsonb_build_object('id', pp.id, 'plano', pp.plano, 'faixa', pp.faixa, 'min_alunos', pp.min_alunos,
        'max_alunos', pp.max_alunos, 'valor_mensal', pp.valor_mensal, 'valor_anual', pp.valor_anual, 'ativo', pp.ativo, 'ordem', pp.ordem,
        'contas', (select count(*) from {schema}.contas c where c.plano = pp.plano and c.faixa = pp.faixa and c.origem = 'nova'))
        order by case pp.plano when 'treino' then 1 when 'nutricao' then 2 else 3 end, pp.ordem) from {schema}.plano_precos pp), '[]'::jsonb),
    'historico', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'em', h.alterado_em, 'antes', h.antes, 'depois', h.depois,
        'por', case when h.alterado_por is null then null else {schema}.w27_nome(h.alterado_por) end) order by h.alterado_em desc)
      from (select * from {schema}.plano_precos_hist order by alterado_em desc limit 30) h), '[]'::jsonb),
    'config', jsonb_build_object(
      'teste_dias', (select a.valor from {schema}.app_config a where a.chave = 'teste_dias'),
      'teste_max_alunos', (select a.valor from {schema}.app_config a where a.chave = 'teste_max_alunos'),
      'aluno_do_app', (select a.valor from {schema}.app_config a where a.chave = 'aluno_do_app'),
      'aviso_mudanca', (select a.valor from {schema}.app_config a where a.chave = 'aviso_mudanca'),
      'aviso_mudanca_em', (select a.atualizado_em from {schema}.app_config a where a.chave = 'aviso_mudanca'),
      'login_limite', (select a.valor from {schema}.app_config a where a.chave = 'login_limite')),
    -- só leitura: a tolerância é do legado Calc (7 dias) e mora no Banco do Treino até a W28
    'tolerancia_legado_calc', 7);
end;
$$;

create or replace function {schema}.master_salvar_preco(p_plano text, p_faixa text, p_valor_mensal numeric, p_valor_anual numeric default null,
                                                          p_ativo boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_valor_mensal is null or p_valor_mensal <= 0 or p_valor_mensal > 100000 or (p_valor_anual is not null and (p_valor_anual <= 0 or p_valor_anual > 1000000)) then
    return jsonb_build_object('ok', false, 'erro', 'valor_invalido');
  end if;
  update {schema}.plano_precos set valor_mensal = round(p_valor_mensal, 2), valor_anual = round(p_valor_anual, 2), ativo = coalesce(p_ativo, true)
   where plano = p_plano and faixa = p_faixa returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'erro', 'preco_inexistente'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- regras gerais (C59/C62): dias e limite do teste, dias grátis do app e o aviso "o Physiq mudou" (liga/desliga e textos — W3)
create or replace function {schema}.master_salvar_config(p_chave text, p_valor jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_val jsonb := p_valor;
  v_n numeric;
  v_atual jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_chave in ('teste_dias', 'teste_max_alunos') then
    if jsonb_typeof(p_valor) <> 'number' then return jsonb_build_object('ok', false, 'erro', 'valor_invalido'); end if;
    v_n := (p_valor #>> '{}')::numeric;
    if v_n <> trunc(v_n) or (p_chave = 'teste_dias' and (v_n < 1 or v_n > 60)) or (p_chave = 'teste_max_alunos' and (v_n < 1 or v_n > 500)) then
      return jsonb_build_object('ok', false, 'erro', 'valor_invalido');
    end if;
  elsif p_chave = 'aluno_do_app' then
    select a.valor into v_atual from {schema}.app_config a where a.chave = p_chave;
    if jsonb_typeof(p_valor -> 'teste_dias') <> 'number' or (p_valor ->> 'teste_dias')::numeric not between 0 and 60 then
      return jsonb_build_object('ok', false, 'erro', 'valor_invalido');
    end if;
    v_val := coalesce(v_atual, '{}'::jsonb) || jsonb_build_object('teste_dias', (p_valor ->> 'teste_dias')::integer);
  elsif p_chave = 'aviso_mudanca' then
    select a.valor into v_atual from {schema}.app_config a where a.chave = p_chave;
    if jsonb_typeof(p_valor) <> 'object' then return jsonb_build_object('ok', false, 'erro', 'valor_invalido'); end if;
    -- só os campos conhecidos (ativo, calc/nutri: ativo, titulo, texto); a versão continua a mesma (quem já viu não vê de novo)
    v_val := coalesce(v_atual, '{}'::jsonb);
    if p_valor ? 'ativo' then
      if jsonb_typeof(p_valor -> 'ativo') <> 'boolean' then return jsonb_build_object('ok', false, 'erro', 'valor_invalido'); end if;
      v_val := v_val || jsonb_build_object('ativo', p_valor -> 'ativo');
    end if;
    if p_valor ? 'calc' or p_valor ? 'nutri' then
      declare
        v_pub text;
        v_obj jsonb;
      begin
        foreach v_pub in array array['calc', 'nutri'] loop
          continue when not (p_valor ? v_pub);
          v_obj := p_valor -> v_pub;
          if jsonb_typeof(v_obj) <> 'object'
             or (v_obj ? 'ativo' and jsonb_typeof(v_obj -> 'ativo') <> 'boolean')
             or (v_obj ? 'titulo' and (jsonb_typeof(v_obj -> 'titulo') <> 'string' or char_length(btrim(v_obj ->> 'titulo')) not between 3 and 120))
             or (v_obj ? 'texto' and (jsonb_typeof(v_obj -> 'texto') <> 'string' or char_length(btrim(v_obj ->> 'texto')) not between 10 and 600)) then
            return jsonb_build_object('ok', false, 'erro', 'valor_invalido', 'publico', v_pub);
          end if;
          v_val := jsonb_set(v_val, array[v_pub], coalesce(v_val -> v_pub, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'ativo', v_obj -> 'ativo', 'titulo', to_jsonb(btrim(v_obj ->> 'titulo')), 'texto', to_jsonb(btrim(v_obj ->> 'texto')))), true);
        end loop;
      end;
    end if;
  else
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  insert into {schema}.app_config (chave, valor, publica, atualizado_por)
  values (p_chave, v_val, true, auth.uid())
  on conflict (chave) do update set valor = excluded.valor, atualizado_por = excluded.atualizado_por;
  return jsonb_build_object('ok', true, 'chave', p_chave, 'valor', v_val);
end;
$$;

-- ============================================================================================================
-- 6. Integrações (C60): como cada conta recebe dos alunos (Pix manual, nenhum, Mercado Pago — só o master liga o MP)
-- ============================================================================================================
create or replace function {schema}.master_integracoes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  return jsonb_build_object('ok', true, 'contas', coalesce((
    select jsonb_agg({schema}.w27_conta_linha(c.id) order by c.origem = 'app' desc, lower(c.nome)) from {schema}.contas c), '[]'::jsonb),
    'resumo', jsonb_build_object(
      'pix_manual', (select count(*) from {schema}.contas c where c.recebimento_modo = 'pix_manual'),
      'mercadopago', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago'),
      'nenhum', (select count(*) from {schema}.contas c where c.recebimento_modo = 'nenhum'),
      'com_chave', (select count(distinct k.conta_id) from {schema}.recebimento_chaves k where k.ativa)));
end;
$$;

-- ============================================================================================================
-- 7. Conteúdo do app (herdado da W7b): pratos prontos (o mesmo lugar do scripts/conteudo/carregar_pratos_prontos.py)
-- ============================================================================================================
create or replace function {schema}.master_pratos_prontos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  return jsonb_build_object('ok', true, 'pratos', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'codigo', pp.codigo, 'nome', pp.nome, 'refeicao', pp.refeicao, 'objetivos', to_jsonb(pp.objetivos),
        'descricao', pp.descricao, 'modo_preparo', pp.modo_preparo, 'foto_url', pp.foto_url, 'ordem', pp.ordem, 'ativo', pp.ativo,
        'atualizado_em', pp.atualizado_em,
        'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'alimento_id', i.alimento_id, 'alimento', a.nome, 'nome', i.nome,
                     'quantidade_g', i.quantidade_g, 'medida', i.medida, 'ordem', i.ordem,
                     'kcal', round(coalesce(a.energia_kcal, 0) * i.quantidade_g / 100, 1),
                     'proteina_g', round(coalesce(a.proteina_g, 0) * i.quantidade_g / 100, 1),
                     'carboidrato_g', round(coalesce(a.carboidrato_g, 0) * i.quantidade_g / 100, 1),
                     'lipidio_g', round(coalesce(a.lipidio_g, 0) * i.quantidade_g / 100, 1)) order by i.ordem)
                     from {schema}.pratos_prontos_itens i join {schema}.alimentos a on a.id = i.alimento_id where i.prato_id = pp.id), '[]'::jsonb))
      order by pp.ativo desc, case pp.refeicao when 'cafe_da_manha' then 1 when 'almoco' then 2 when 'lanche' then 3 when 'jantar' then 4 else 5 end,
               pp.ordem, pp.nome)
      from {schema}.pratos_prontos pp), '[]'::jsonb));
end;
$$;

create or replace function {schema}.master_buscar_alimentos(p_termo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t text := lower(btrim(coalesce(p_termo, '')));
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if char_length(v_t) < 2 then return jsonb_build_object('ok', true, 'alimentos', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'alimentos', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'codigo', a.codigo, 'energia_kcal', a.energia_kcal, 'proteina_g', a.proteina_g,
                                        'carboidrato_g', a.carboidrato_g, 'lipidio_g', a.lipidio_g) order by char_length(a.nome), a.nome)
      from (select * from {schema}.alimentos a where a.fonte = 'taco' and a.deleted_at is null
              and (lower(a.nome) like '%' || v_t || '%' or lower(coalesce(a.busca, '')) like '%' || v_t || '%') limit 20) a), '[]'::jsonb));
end;
$$;

-- salva um prato (novo ou existente) e refaz os itens dele, como a carga do JSON (o JSON segue valendo para recarregar)
create or replace function {schema}.master_prato_salvar(p_prato jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p_prato ->> 'id', '')::uuid;
  v_nome text := left(btrim(coalesce(p_prato ->> 'nome', '')), 120);
  v_ref text := p_prato ->> 'refeicao';
  v_obj text[];
  v_codigo text := nullif(left(btrim(coalesce(p_prato ->> 'codigo', '')), 80), '');
  v_item jsonb;
  v_ordem integer := 0;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  select coalesce(array_agg(x), array[]::text[]) into v_obj from jsonb_array_elements_text(coalesce(p_prato -> 'objetivos', '[]'::jsonb)) x;
  if char_length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_ref not in ('cafe_da_manha', 'almoco', 'lanche', 'jantar', 'ceia') then return jsonb_build_object('ok', false, 'erro', 'refeicao_invalida'); end if;
  if cardinality(v_obj) = 0 or not (v_obj <@ array['emagrecer', 'manter', 'ganhar_massa']) then return jsonb_build_object('ok', false, 'erro', 'objetivo_invalido'); end if;
  if jsonb_typeof(p_prato -> 'itens') <> 'array' or jsonb_array_length(p_prato -> 'itens') = 0 or jsonb_array_length(p_prato -> 'itens') > 30 then
    return jsonb_build_object('ok', false, 'erro', 'itens_invalidos');
  end if;
  for v_item in select * from jsonb_array_elements(p_prato -> 'itens') loop
    if not exists (select 1 from {schema}.alimentos a where a.id = nullif(v_item ->> 'alimento_id', '')::uuid and a.deleted_at is null)
       or coalesce((v_item ->> 'quantidade_g')::numeric, 0) <= 0 or (v_item ->> 'quantidade_g')::numeric > 2000 then
      return jsonb_build_object('ok', false, 'erro', 'item_invalido', 'item', v_item);
    end if;
  end loop;
  if v_id is null then
    insert into {schema}.pratos_prontos (codigo, nome, refeicao, objetivos, descricao, modo_preparo, ordem, ativo)
    values (coalesce(v_codigo, 'master-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10)), v_nome, v_ref, v_obj,
            nullif(btrim(coalesce(p_prato ->> 'descricao', '')), ''), nullif(btrim(coalesce(p_prato ->> 'modo_preparo', '')), ''),
            coalesce((p_prato ->> 'ordem')::integer, 0), coalesce((p_prato ->> 'ativo')::boolean, true))
    returning id into v_id;
  else
    update {schema}.pratos_prontos set nome = v_nome, refeicao = v_ref, objetivos = v_obj,
           descricao = nullif(btrim(coalesce(p_prato ->> 'descricao', '')), ''), modo_preparo = nullif(btrim(coalesce(p_prato ->> 'modo_preparo', '')), ''),
           ordem = coalesce((p_prato ->> 'ordem')::integer, ordem), ativo = coalesce((p_prato ->> 'ativo')::boolean, ativo)
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'erro', 'prato_inexistente'); end if;
  end if;
  delete from {schema}.pratos_prontos_itens where prato_id = v_id;
  for v_item in select * from jsonb_array_elements(p_prato -> 'itens') loop
    v_ordem := v_ordem + 1;
    insert into {schema}.pratos_prontos_itens (prato_id, alimento_id, nome, quantidade_g, medida, ordem)
    values (v_id, (v_item ->> 'alimento_id')::uuid, nullif(left(btrim(coalesce(v_item ->> 'nome', '')), 80), ''),
            round((v_item ->> 'quantidade_g')::numeric, 1), nullif(left(btrim(coalesce(v_item ->> 'medida', '')), 60), ''), v_ordem);
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- o login de um e-mail (a função master-contas cria o profissional: reaproveita o login que já existe — nunca troca a senha dele)
create or replace function {schema}.w27_usuario_por_email(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'email', lower(u.email), 'tem_senha', coalesce(u.encrypted_password, '') <> '',
                            'master', coalesce(u.raw_app_meta_data ->> 'role', '') = 'master')
    from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
$$;

-- ============================================================================================================
-- 8. Execução: só quem está logado (as funções conferem o master); nada para o anon
-- ============================================================================================================
revoke execute on function {schema}.w27_situacao(text, boolean, text, date, date, integer), {schema}.w27_nome(uuid), {schema}.w27_conta_linha(uuid),
  {schema}.w27_peso(text), {schema}.master_visao_geral(), {schema}.master_contas(jsonb), {schema}.master_conta_detalhe(uuid),
  {schema}.master_conta_acao(uuid, text, jsonb), {schema}.master_criar_conta(uuid, text, text, text, text, text, boolean, text),
  {schema}.master_tornar_master(uuid), {schema}.master_alunos(jsonb, integer, integer), {schema}.master_sem_conta(text),
  {schema}.master_mover_alunos(uuid[], uuid[], uuid, uuid, uuid), {schema}.master_financeiro(text),
  {schema}.master_registrar_pagamento(uuid, numeric, integer, date, text), {schema}.master_planos(),
  {schema}.master_salvar_preco(text, text, numeric, numeric, boolean), {schema}.master_salvar_config(text, jsonb), {schema}.master_integracoes(),
  {schema}.master_pratos_prontos(), {schema}.master_buscar_alimentos(text), {schema}.master_prato_salvar(jsonb)
  from public, anon;
grant execute on function {schema}.master_visao_geral(), {schema}.master_contas(jsonb), {schema}.master_conta_detalhe(uuid),
  {schema}.master_conta_acao(uuid, text, jsonb), {schema}.master_criar_conta(uuid, text, text, text, text, text, boolean, text),
  {schema}.master_tornar_master(uuid), {schema}.master_alunos(jsonb, integer, integer), {schema}.master_sem_conta(text),
  {schema}.master_mover_alunos(uuid[], uuid[], uuid, uuid, uuid), {schema}.master_financeiro(text),
  {schema}.master_registrar_pagamento(uuid, numeric, integer, date, text), {schema}.master_planos(),
  {schema}.master_salvar_preco(text, text, numeric, numeric, boolean), {schema}.master_salvar_config(text, jsonb), {schema}.master_integracoes(),
  {schema}.master_pratos_prontos(), {schema}.master_buscar_alimentos(text), {schema}.master_prato_salvar(jsonb)
  to authenticated, service_role;
revoke execute on function {schema}.w27_usuario_por_email(text) from public, anon, authenticated;
grant execute on function {schema}.w27_situacao(text, boolean, text, date, date, integer), {schema}.w27_nome(uuid), {schema}.w27_conta_linha(uuid),
  {schema}.w27_peso(text), {schema}.w27_usuario_por_email(text) to service_role;
