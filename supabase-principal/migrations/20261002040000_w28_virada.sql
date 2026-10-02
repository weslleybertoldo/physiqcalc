-- Physiq W28 — Virada: a cobrança das contas LEGADAS (legado_calc / legado_nutri) passa para o motor do núcleo com o preço e as
-- regras de hoje (spec §6.3, §8.4; Premissa P9). BANCO PRINCIPAL, public + staging. Idempotente.
-- Aplicar (backup ANTES; só acrescenta 1 coluna com padrão e troca funções — nenhum dado muda aqui):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002040000_w28_virada.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002040000_w28_virada.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002040000_w28_virada.sql --so public
-- Voltar atrás: as definições anteriores ficam no backup (~/backups/physiq/2026-10-02-w28/principal-*/funcoes-antes.sql); a coluna
-- nova pode ficar (padrão false = comportamento de antes).
--
-- Funciona ANTES e DEPOIS da virada dos dados (scripts/virada/03_cobranca_legada.py):
--   · todas as regras do núcleo passam a olhar SÓ `cobranca_legada` (antes: origem = 'nova' e não legada). Enquanto o 03 não roda,
--     as legadas têm cobranca_legada = true → nada muda para elas; o 03 põe false → o núcleo cobra e trava como nas contas novas;
--   · `regras_legadas` (nova): a conta segue o preço e as regras de hoje (P9) até o dono trocar de plano. O 03 liga; trocar de
--     plano/faixa desliga sozinho (gatilho), tira o valor travado e volta o Pix para +1 mês ("sai do legado de vez" — 6.3);
--   · legado Calc: tolerância de 7 dias no ciclo; o pagamento mensal seguinte volta a pôr 7 (o anual, 0) — a regra da
--     physiq_professor_acesso_ok de hoje, que só dá tolerância ao ciclo;
--   · legado Nutri: sem limite de alunos (como hoje) e Pix de 30 dias (regra_pix = '30dias', já gravada desde a W3);
--   · w28_migrar_conta_legada / w28_desfazer_conta_legada: o que o 03 grava (e desfaz) numa conta, numa transação só.

alter table {schema}.contas add column if not exists regras_legadas boolean not null default false;
comment on column {schema}.contas.regras_legadas is
  'W28 (P9): a conta legada segue o preço (valor_travado) e as regras de hoje (tolerância 7 no Calc; Pix 30 dias e sem limite no Nutri) até trocar de plano.';

-- o dono não mexe nas regras (o resto da trava é a de sempre, W4)
create or replace function {schema}.contas_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono edita nome, recebimento (menos ligar o Mercado Pago) e o bloqueio do inadimplente; o resto é do servidor/master
    new.id := old.id; new.dono_id := old.dono_id; new.origem := old.origem; new.plano := old.plano; new.faixa := old.faixa;
    new.periodicidade := old.periodicidade; new.situacao := old.situacao; new.teste_ate := old.teste_ate;
    new.vence_em := old.vence_em; new.tolerancia_dias := old.tolerancia_dias; new.valor_travado := old.valor_travado;
    new.regra_pix := old.regra_pix; new.cobranca_legada := old.cobranca_legada; new.isenta_motivo := old.isenta_motivo;
    new.regras_legadas := old.regras_legadas;
    new.alunos_bloqueados_em := old.alunos_bloqueados_em; new.alunos_bloqueados_msg := old.alunos_bloqueados_msg;
    new.criado_em := old.criado_em;
    if new.recebimento_modo = 'mercadopago' and old.recebimento_modo is distinct from 'mercadopago' then
      new.recebimento_modo := old.recebimento_modo;
    end if;
  end if;
  return new;
end;
$function$;

-- trocar de plano ou de faixa numa conta com as regras de hoje = sai do legado de vez (6.3): o preço passa a ser o da tabela e o
-- Pix volta a +1 mês; a tolerância que a conta já tem vale até o próximo pagamento (aplicar_pagamento_conta põe 0).
create or replace function {schema}.contas_sai_do_legado()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if old.regras_legadas and new.regras_legadas
     and (new.plano is distinct from old.plano or new.faixa is distinct from old.faixa) then
    new.regras_legadas := false;
    new.valor_travado := null;
    new.regra_pix := 'mes';
    insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
    values (old.id, 'plano',
      jsonb_build_object('plano', old.plano, 'faixa', old.faixa, 'valor_travado', old.valor_travado, 'regra_pix', old.regra_pix,
                         'tolerancia_dias', old.tolerancia_dias, 'regras_legadas', true),
      jsonb_build_object('plano', new.plano, 'faixa', new.faixa, 'saiu_do_legado', true, 'valor_travado', null, 'regra_pix', 'mes'),
      auth.uid());
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_contas_sai_do_legado on {schema}.contas;
create trigger trg_contas_sai_do_legado before update of plano, faixa on {schema}.contas
  for each row execute function {schema}.contas_sai_do_legado();

-- tarefa diária 03:40: a situação e o aviso de WhatsApp valem para toda conta que o núcleo cobra (as legadas depois do 03)
create or replace function {schema}.contas_tarefa_diaria(p_hoje date default null::date, p_conta uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := coalesce(p_hoje, {schema}.cobranca_hoje());
  v_pix integer := 0;
  v_mudaram integer := 0;
  v_avisos integer := 0;
  v_n integer;
  r record;
  v_nova text;
  v_destino text;
  v_horario text;
  v_quando timestamptz;
  v_valor numeric;
  v_copia text;
  v_texto text;
begin
  -- 1. Pix que passou das 72 h e ninguém pagou
  update {schema}.conta_faturas set status = 'expired'
   where status = 'pending' and forma = 'pix' and pix_expira_em is not null and pix_expira_em < now()
     and (p_conta is null or conta_id = p_conta);
  get diagnostics v_pix = row_count;

  -- 2. situação das contas que o núcleo cobra (W28: as legadas também, depois do 03 — cobranca_legada = false)
  for r in select c.id, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias from {schema}.contas c
            where not c.cobranca_legada and c.situacao in ('teste', 'ativa', 'vencida')
              and (p_conta is null or c.id = p_conta) loop
    v_nova := {schema}.situacao_da_conta_em(r.situacao, r.teste_ate, r.vence_em, r.tolerancia_dias, v_hoje);
    if v_nova is distinct from r.situacao then
      update {schema}.contas set situacao = v_nova where id = r.id;
      insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
      values (r.id, 'situacao', jsonb_build_object('situacao', r.situacao),
              jsonb_build_object('situacao', v_nova, 'dia', v_hoje, 'por', 'tarefa_diaria'), null);
      v_mudaram := v_mudaram + 1;
    end if;
  end loop;

  -- 3. WhatsApp para o dono: Pix (sem cartão recorrente autorizado), vence em 3 dias, com o WhatsApp DELE conectado (a mesma
  --    conexão e o mesmo horário do Nutri; 1 por dia — índice mensagens_whatsapp_sem_repetir_nutri_idx)
  for r in select c.id, c.dono_id, c.vence_em, c.plano, c.faixa, p.nome, p.config, p.dados_profissionais
             from {schema}.contas c
             join {schema}.profiles p on p.id = c.dono_id
             join {schema}.whatsapp_instancias w on w.nutricionista_id = c.dono_id and w.status = 'conectado'
            where not c.cobranca_legada and c.origem <> 'app' and c.situacao = 'ativa' and c.vence_em = v_hoje + 3
              and (p_conta is null or c.id = p_conta)
              and not exists (select 1 from {schema}.conta_assinaturas a where a.conta_id = c.id and a.status = 'authorized') loop
    v_destino := {schema}.whatsapp_destino(r.dados_profissionais ->> 'whatsapp_e164');
    continue when v_destino is null;
    v_horario := coalesce({schema}.whatsapp_preferencias(r.config) ->> 'horario', '09:00');
    if v_horario !~ '^[0-2][0-9]:[0-5][0-9]$' then v_horario := '09:00'; end if;
    v_quando := greatest(((v_hoje::text || ' ' || v_horario || ':00')::timestamp at time zone 'America/Sao_Paulo'), now());
    v_valor := {schema}.conta_preco(r.id, r.plano, r.faixa, 1);
    select f.pix_copia_cola into v_copia from {schema}.conta_faturas f
     where f.conta_id = r.id and f.status = 'pending' and f.forma = 'pix' and f.pix_copia_cola is not null
       and coalesce(f.pix_expira_em, now()) > now() + interval '1 hour'
     order by f.criado_em desc limit 1;
    v_texto := 'Oi, ' || coalesce(nullif(split_part(btrim(coalesce(r.nome, '')), ' ', 1), ''), 'tudo bem') || '! Seu plano do Physiq vence em '
      || to_char(r.vence_em, 'DD/MM') || '. '
      || case when v_valor is null then 'Pague o Pix' else 'Pague o Pix de R$ ' || translate(to_char(v_valor, 'FM999G999D00'), '.,', ',.') end
      || ' para somar mais 1 mês — em Configurações › Plano.'
      || case when v_copia is null then '' else E'\n\nCopia e cola do Pix:\n' || v_copia end;
    insert into {schema}.mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, agendada_para, conta_id)
    values (r.dono_id, null, 'assinatura_vencendo', v_destino, v_texto, v_hoje, v_quando, r.id)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_avisos := v_avisos + v_n;
  end loop;

  -- 4. espelho de acesso para o Treino (as mudanças acima já entraram na fila pelo gatilho)
  perform {schema}.espelho_disparar();
  return jsonb_build_object('hoje', v_hoje, 'pix_expirados', v_pix, 'contas_mudaram', v_mudaram, 'avisos_whatsapp', v_avisos);
end;
$function$;

-- trava de escrita/convites (W13) e a situação que o master vê (W27): toda conta que o núcleo cobra
create or replace function {schema}.w13_conta_travada(p_conta uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((
    select not c.cobranca_legada
       and {schema}.situacao_da_conta_em(c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias, {schema}.cobranca_hoje())
           in ('vencida', 'suspensa', 'cancelada')
      from {schema}.contas c where c.id = p_conta), false);
$function$;

create or replace function {schema}.w27_situacao(p_origem text, p_legada boolean, p_situacao text, p_teste date, p_vence date, p_tol integer)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select case when not coalesce(p_legada, false)
              then {schema}.situacao_da_conta_em(p_situacao, p_teste, p_vence, p_tol, {schema}.cobranca_hoje())
              else p_situacao end;
$function$;

-- limite de alunos: legado Nutri sem limite e legado Calc com o limite do plano dele (inclusive no teste) enquanto seguem as
-- regras de hoje (ou a cobrança ainda é a antiga); depois de trocar de plano, o limite da faixa (6.4)
create or replace function {schema}.conta_limite_alunos(p_conta uuid)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case
    when c.origem = 'legado_nutri' and (c.regras_legadas or c.cobranca_legada) then null
    when c.situacao = 'teste' and not (c.origem = 'legado_calc' and (c.regras_legadas or c.cobranca_legada)) then coalesce(
      (select (a.valor #>> '{}')::integer from {schema}.app_config a
        where a.chave = 'teste_max_alunos' and jsonb_typeof(a.valor) = 'number'), 10)
    else coalesce(
      (select pp.max_alunos from {schema}.plano_precos pp where pp.plano = c.plano and pp.faixa = c.faixa),
      case c.faixa when 'f10' then 10 when 'f30' then 30 when 'f100' then 100 else null end)
  end
  from {schema}.contas c where c.id = p_conta;
$function$;

-- pagamento aprovado: + a tolerância do legado Calc (7 no mensal, 0 no anual) enquanto segue as regras de hoje; senão 0
create or replace function {schema}.aplicar_pagamento_conta(p_fatura uuid, p_pago_em timestamp with time zone default null::timestamp with time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_f {schema}.conta_faturas%rowtype;
  v_c {schema}.contas%rowtype;
  v_hoje date := {schema}.cobranca_hoje();
  v_meses integer;
  v_base date;
  v_vence date;
  v_situacao text;
  v_sai boolean;
  v_tol integer;
begin
  select * into v_f from {schema}.conta_faturas where id = p_fatura for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'fatura_inexistente');
  end if;
  if v_f.pago_em is not null then
    return jsonb_build_object('ok', true, 'aplicada', false, 'ja_aplicada', true, 'conta_id', v_f.conta_id);
  end if;
  select * into v_c from {schema}.contas where id = v_f.conta_id for update;
  v_meses := coalesce(v_f.meses, case when v_f.tipo = 'anual' then 12 else 1 end);
  v_base := greatest(coalesce(v_c.vence_em, v_hoje), coalesce(v_c.teste_ate, v_hoje), v_hoje);
  v_vence := case when v_c.regra_pix = '30dias' and v_meses = 1 then v_base + 30
                  else (v_base + make_interval(months => v_meses))::date end;
  v_situacao := case when v_c.situacao in ('isenta', 'suspensa', 'cancelada') then v_c.situacao else 'ativa' end;
  -- a fatura com outro plano/faixa tira a conta do legado (gatilho contas_sai_do_legado): a tolerância nova já é a da tabela
  v_sai := v_c.regras_legadas and (coalesce(v_f.plano, v_c.plano) <> v_c.plano or coalesce(v_f.faixa, v_c.faixa) <> v_c.faixa);
  v_tol := case when v_c.origem = 'legado_calc' and v_c.regras_legadas and not v_sai then (case when v_meses = 12 then 0 else 7 end)
                else 0 end;

  update {schema}.conta_faturas
     set status = 'approved', pago_em = coalesce(p_pago_em, now()), cobre_de = v_base, cobre_ate = v_vence
   where id = v_f.id;
  update {schema}.contas
     set vence_em = v_vence, situacao = v_situacao,
         plano = coalesce(v_f.plano, plano), faixa = coalesce(v_f.faixa, faixa),
         periodicidade = case when v_meses = 12 then 'anual' else 'mensal' end,
         tolerancia_dias = v_tol
   where id = v_c.id;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_c.id, 'pagamento',
    jsonb_build_object('situacao', v_c.situacao, 'vence_em', v_c.vence_em, 'plano', v_c.plano, 'faixa', v_c.faixa,
                       'tolerancia_dias', v_c.tolerancia_dias),
    jsonb_build_object('situacao', v_situacao, 'vence_em', v_vence, 'plano', coalesce(v_f.plano, v_c.plano),
                       'faixa', coalesce(v_f.faixa, v_c.faixa), 'fatura_id', v_f.id, 'valor', v_f.valor, 'forma', v_f.forma,
                       'tipo', v_f.tipo, 'mp_payment_id', v_f.mp_payment_id, 'tolerancia_dias', v_tol),
    v_f.registrado_por);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'aplicada', true, 'conta_id', v_c.id, 'vence_em', v_vence, 'situacao', v_situacao,
                            'cobre_de', v_base, 'tolerancia_dias', v_tol);
end;
$function$;

-- W5 herdado: a equipe das contas legadas convida igual à conta nova depois da virada (só a cobrança antiga ainda trava)
create or replace function {schema}.equipe_motivo_bloqueio(p_conta uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then 'conta_inexistente'
    when c.cobranca_legada then 'conta_legada'
    when {schema}.situacao_da_conta_em(c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias, {schema}.cobranca_hoje())
         in ('vencida', 'suspensa', 'cancelada') then 'conta_travada'
    else null end
  from (select 1) um left join {schema}.contas c on c.id = p_conta;
$$;

-- a linha da conta do master ganha regras_legadas (a ação "Plano" avisa que a conta sai do legado)
create or replace function {schema}.w27_conta_linha(p_conta uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano, 'modulos', to_jsonb({schema}.modulos_do_plano(c.plano)),
    'faixa', c.faixa, 'periodicidade', c.periodicidade, 'situacao', c.situacao,
    'situacao_efetiva', {schema}.w27_situacao(c.origem, c.cobranca_legada, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias),
    'teste_ate', c.teste_ate, 'vence_em', c.vence_em, 'tolerancia_dias', c.tolerancia_dias, 'valor_travado', c.valor_travado,
    'valor_mensal', {schema}.conta_preco(c.id, c.plano, c.faixa, 1), 'regra_pix', c.regra_pix, 'cobranca_legada', c.cobranca_legada,
    'regras_legadas', c.regras_legadas,
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

-- W27 herdado ("Receita do mês −86 % sobre o mês anterior" no dia 2): a Visão geral do master ganha os recebimentos por dia
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
                        and (cb.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0),
      -- W28: o que entrou por dia desde o 1º do mês anterior — a tela compara o mês com o MESMO período do mês anterior pela regra
      -- única do painel (comparacaoDoMes, src/painel/financeiro/resumo.ts); 'mes_anterior' (o mês inteiro) fica para os APKs antigos
      'recebimentos', coalesce((select jsonb_agg(jsonb_build_object('dia', r.dia, 'valor', r.valor, 'origem', 'conta') order by r.dia)
                        from (select (f.pago_em at time zone 'America/Sao_Paulo')::date as dia, sum(f.valor) as valor
                                from {schema}.conta_faturas f where f.status = 'approved' and f.pago_em is not null
                                 and (f.pago_em at time zone 'America/Sao_Paulo')::date >= (v_ini - interval '1 month')::date
                                 and (f.pago_em at time zone 'America/Sao_Paulo')::date <= v_hoje
                               group by 1) r), '[]'::jsonb)),
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

-- o que o 03_cobranca_legada.py grava numa conta legada (uma transação por conta). p_dados (montado pelo script):
--   conta: { situacao, teste_ate, vence_em, tolerancia_dias, valor_travado, regra_pix, periodicidade, faixa, isenta_motivo?,
--            alunos_bloqueados_em?, alunos_bloqueados_msg? }
--   assinatura: { mp_preapproval_id, status, valor, proximo_vencimento, ultimo_pagamento_em, payload } | null   (1 por conta)
--   faturas: [ { tipo?, valor, status, forma, mp_payment_id, mp_preapproval_id, pago_em, cobre_de, cobre_ate, pix_expira_em,
--                pix_copia_cola, meses, descricao, criado_em } ]   (histórico; idempotente por mp_payment_id)
-- Já migrada (cobranca_legada = false) → não mexe. Só o servidor (postgres/service_role) chama.
create or replace function {schema}.w28_migrar_conta_legada(p_conta uuid, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_c {schema}.contas%rowtype;
  v_novo {schema}.contas%rowtype;
  v_d jsonb := coalesce(p_dados -> 'conta', '{}'::jsonb);
  v_a jsonb := p_dados -> 'assinatura';
  v_f jsonb;
  v_n integer;
  v_faturas integer := 0;
  v_assinatura boolean := false;
begin
  select * into v_c from {schema}.contas where id = p_conta for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if v_c.origem not in ('legado_calc', 'legado_nutri') then return jsonb_build_object('ok', false, 'erro', 'nao_e_legada'); end if;
  if not v_c.cobranca_legada then return jsonb_build_object('ok', true, 'ja_migrada', true, 'conta_id', p_conta); end if;
  if coalesce(v_d ->> 'situacao', '') not in ('teste', 'ativa', 'vencida', 'isenta', 'suspensa', 'cancelada') then
    return jsonb_build_object('ok', false, 'erro', 'situacao_invalida');
  end if;

  for v_f in select * from jsonb_array_elements(coalesce(p_dados -> 'faturas', '[]'::jsonb)) loop
    insert into {schema}.conta_faturas (conta_id, tipo, valor, status, forma, mp_payment_id, mp_preapproval_id, pago_em, cobre_de,
                                         cobre_ate, pix_expira_em, pix_copia_cola, plano, faixa, meses, descricao, origem, criado_em)
    values (p_conta, coalesce(v_f ->> 'tipo', 'migrado'), greatest(0, coalesce((v_f ->> 'valor')::numeric, 0)), v_f ->> 'status',
            coalesce(v_f ->> 'forma', 'manual'), v_f ->> 'mp_payment_id', v_f ->> 'mp_preapproval_id', (v_f ->> 'pago_em')::timestamptz,
            (v_f ->> 'cobre_de')::date, (v_f ->> 'cobre_ate')::date, (v_f ->> 'pix_expira_em')::timestamptz, v_f ->> 'pix_copia_cola',
            v_c.plano, coalesce(v_d ->> 'faixa', v_c.faixa), least(12, greatest(1, coalesce((v_f ->> 'meses')::integer, 1))),
            v_f ->> 'descricao', 'virada_w28', coalesce((v_f ->> 'criado_em')::timestamptz, now()))
    on conflict (mp_payment_id) do nothing;
    get diagnostics v_n = row_count;
    v_faturas := v_faturas + v_n;
  end loop;

  if v_a is not null and jsonb_typeof(v_a) = 'object' and not exists (select 1 from {schema}.conta_assinaturas where conta_id = p_conta) then
    insert into {schema}.conta_assinaturas (conta_id, mp_preapproval_id, status, valor, proximo_vencimento, ultimo_pagamento_em,
                                             payload, plano, faixa)
    values (p_conta, v_a ->> 'mp_preapproval_id', coalesce(v_a ->> 'status', 'pending'), (v_a ->> 'valor')::numeric,
            (v_a ->> 'proximo_vencimento')::timestamptz, (v_a ->> 'ultimo_pagamento_em')::timestamptz,
            coalesce(v_a -> 'payload', '{}'::jsonb) || jsonb_build_object('migrada_em', now(), 'migrada_por', 'W28'),
            v_c.plano, coalesce(v_d ->> 'faixa', v_c.faixa));
    v_assinatura := true;
  end if;

  update {schema}.contas set
      situacao = v_d ->> 'situacao',
      teste_ate = (v_d ->> 'teste_ate')::date,
      vence_em = (v_d ->> 'vence_em')::date,
      tolerancia_dias = least(60, greatest(0, coalesce((v_d ->> 'tolerancia_dias')::integer, 0))),
      valor_travado = (v_d ->> 'valor_travado')::numeric,
      regra_pix = coalesce(v_d ->> 'regra_pix', regra_pix),
      periodicidade = coalesce(v_d ->> 'periodicidade', periodicidade),
      faixa = coalesce(v_d ->> 'faixa', faixa),
      isenta_motivo = case when v_d ? 'isenta_motivo' then v_d ->> 'isenta_motivo' else isenta_motivo end,
      -- o bloqueio dos alunos que o master do Calc fez no Treino vem para a conta (o espelho passa a mandar nele)
      alunos_bloqueados_em = coalesce(alunos_bloqueados_em, (v_d ->> 'alunos_bloqueados_em')::timestamptz),
      alunos_bloqueados_msg = case when alunos_bloqueados_em is null and (v_d ->> 'alunos_bloqueados_em') is not null
                                   then v_d ->> 'alunos_bloqueados_msg' else alunos_bloqueados_msg end,
      regras_legadas = true,
      cobranca_legada = false
   where id = p_conta
   returning * into v_novo;

  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (p_conta, 'outro', to_jsonb(v_c),
          jsonb_build_object('virada', 'W28', 'situacao', v_novo.situacao, 'teste_ate', v_novo.teste_ate, 'vence_em', v_novo.vence_em,
                             'tolerancia_dias', v_novo.tolerancia_dias, 'valor_travado', v_novo.valor_travado, 'regra_pix', v_novo.regra_pix,
                             'periodicidade', v_novo.periodicidade, 'faixa', v_novo.faixa, 'isenta_motivo', v_novo.isenta_motivo,
                             'faturas_migradas', v_faturas, 'assinatura_migrada', v_assinatura),
          null);
  -- o espelho de acesso vai para o Treino (o gatilho não vê cobranca_legada; aqui entra sempre)
  insert into {schema}.espelho_pendencias (tipo, payload) values ('conta', jsonb_build_object('conta_id', p_conta));
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'conta_id', p_conta, 'faturas', v_faturas, 'assinatura', v_assinatura,
                            'situacao', v_novo.situacao, 'vence_em', v_novo.vence_em, 'teste_ate', v_novo.teste_ate);
end;
$function$;

-- voltar atrás uma conta (passo 6 da virada não bateu): as colunas voltam ao que eram (p_antes = a linha da conta antes, do
-- relatório do 03 ou do conta_eventos da virada), saem as faturas e a assinatura que a virada criou. Pagamento de verdade que
-- entrou depois da virada NÃO é apagado (só o que tem origem 'virada_w28').
create or replace function {schema}.w28_desfazer_conta_legada(p_conta uuid, p_antes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_c {schema}.contas%rowtype;
  v_fat integer;
  v_ass integer;
begin
  select * into v_c from {schema}.contas where id = p_conta for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if p_antes is null or (p_antes ->> 'id') is distinct from p_conta::text then return jsonb_build_object('ok', false, 'erro', 'antes_invalido'); end if;
  delete from {schema}.conta_faturas where conta_id = p_conta and origem = 'virada_w28';
  get diagnostics v_fat = row_count;
  delete from {schema}.conta_assinaturas where conta_id = p_conta and payload ->> 'migrada_por' = 'W28';
  get diagnostics v_ass = row_count;
  update {schema}.contas set
      situacao = p_antes ->> 'situacao', teste_ate = (p_antes ->> 'teste_ate')::date, vence_em = (p_antes ->> 'vence_em')::date,
      tolerancia_dias = coalesce((p_antes ->> 'tolerancia_dias')::integer, 0), valor_travado = (p_antes ->> 'valor_travado')::numeric,
      regra_pix = coalesce(p_antes ->> 'regra_pix', regra_pix), periodicidade = coalesce(p_antes ->> 'periodicidade', periodicidade),
      faixa = coalesce(p_antes ->> 'faixa', faixa), plano = coalesce(p_antes ->> 'plano', plano),
      isenta_motivo = p_antes ->> 'isenta_motivo', regras_legadas = false, cobranca_legada = true
   where id = p_conta;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (p_conta, 'outro', to_jsonb(v_c), jsonb_build_object('virada', 'W28 desfeita', 'faturas_removidas', v_fat, 'assinaturas_removidas', v_ass), null);
  insert into {schema}.espelho_pendencias (tipo, payload) values ('conta', jsonb_build_object('conta_id', p_conta));
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'conta_id', p_conta, 'faturas_removidas', v_fat, 'assinaturas_removidas', v_ass);
end;
$function$;

revoke all on function {schema}.w28_migrar_conta_legada(uuid, jsonb) from public, anon, authenticated;
revoke all on function {schema}.w28_desfazer_conta_legada(uuid, jsonb) from public, anon, authenticated;
revoke all on function {schema}.contas_sai_do_legado() from public, anon, authenticated;
grant execute on function {schema}.w28_migrar_conta_legada(uuid, jsonb) to service_role;
grant execute on function {schema}.w28_desfazer_conta_legada(uuid, jsonb) to service_role;
