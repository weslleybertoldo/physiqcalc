-- Physiq W22 — Painel › Mensagens (WhatsApp) (spec 4.4 "Mensagens", N-14, N-58, R7, R12, §12 risco 8; tela 6). Idempotente.
-- As tabelas (whatsapp_instancias, mensagens_whatsapp), o pg_cron (whatsapp_enfileirar a cada 15 min, whatsapp_destravar_fila a
-- cada 10 min) e as funções whatsapp-conectar/whatsapp-agente já existem (Nutri W46/W47/W50 + W2/W4/W14). Aqui:
--
--   1. Enfileirador (a versão da W14 + o que o PERSONAL ganha — R7):
--      · aniversário também dos alunos de quem é o personal (pacientes.personal_id); antes só o responsável de nutrição;
--      · cobrança D-1 e D+1 também da MENSALIDADE da régua do Calc (W6/W19), que não tem linha "aberta": vence = fim da cobertura
--        (mensalidade_pago_ate) ou o 1º vencimento de quem nunca pagou (mensalidade_desde), no dia de São Paulo — a mesma conta do
--        app e do pagamentos-aluno. Quem manda é quem RECEBE (o dono da conta → o personal → a nutri, o `recebedor` da W6), com os
--        mesmos momentos e os mesmos textos ("Cobrança a vencer"/"Cobrança vencida"). Fica de fora: cobrança pausada, comprovante
--        aguardando confirmação, cartão (assinatura) ativo e a conta do app (W7b: a mensalidade do Physiq não sai do WhatsApp de
--        ninguém). O ajuste "Mensagens automáticas" do aluno (R12, W14) vale para tudo. O resto é IGUAL ao da W14 (avulsa "aberta",
--        lembretes pelo dono do agendamento, aviso do Pix da própria nutri). A confirmação ao agendar (gatilho da W14/W20) não muda.
--   2. Políticas: as "dono da conta" da W2 nas 2 tabelas do WhatsApp eram FOR ALL (o dono poderia gravar na fila e fazer o WhatsApp
--      de um membro mandar qualquer texto). Passam a FOR SELECT — o app NUNCA grava nelas (quem grava são as funções, com a
--      service_role, e o agente). A leitura de cada um fica igual (simulação com o login de cada dono de instância).
--   3. Funções da tela nova (security definer, só respondem sobre o próprio auth.uid()):
--      · whatsapp_resumo(p_conta)  números da página e do menu: na fila, enviadas (30 dias + série de 14), falhas NOVAS da própria
--        fila (7 dias, depois do "Limpar" — o número do menu), a última batida do celular de envio (max(ultimo_ping): o "ping geral"
--        do agente bate em todas as linhas a cada 60 s), o último teste e o alcance (alunos dele com telefone e com o ajuste ligado);
--      · whatsapp_fila(p_conta, p_escopo, p_filtro, p_limite, p_antes)  o histórico: "meus" = a própria fila (o WhatsApp é de cada
--        um, P1 do membro); "conta" = a fila da conta para o DONO (os alunos da conta, de qualquer membro, + as próprias sem aluno);
--      · whatsapp_salvar_config(p_whatsapp)  grava profiles.config.whatsapp (ativo, horário, momentos, textos) sem mexer no resto;
--      · whatsapp_reenviar(p_id)  a própria mensagem com falha (7 dias) volta para a fila, com o WhatsApp conectado, se ainda faz
--        sentido (aluno ativo e com as mensagens ligadas, consulta por vir, cobrança em aberto, aniversário no dia) e com o telefone
--        de AGORA;
--      · whatsapp_limpar_falhas()  "Limpar": guarda profiles.config.whatsapp_falhas_vistas_em = agora (o número do menu zera; o
--        histórico continua mostrando "Falhou").
--
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py + definições antigas):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001140000_w22_mensagens.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001140000_w22_mensagens.sql --so public

-- ============================================================================================================
-- 1. Enfileirador: a versão da W14 + aniversário do personal + mensalidade da régua do Calc
-- ============================================================================================================
create or replace function {schema}.whatsapp_enfileirar()
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_uid uuid := auth.uid();
  v_agora timestamptz := now();
  v_hoje date := (timezone('America/Sao_Paulo', v_agora))::date;
  v_hora time := (timezone('America/Sao_Paulo', v_agora))::time;
  v_total integer := 0;
  v_n integer;
  r record;
  v_pref jsonb;
  v_momentos jsonb;
  v_textos jsonb;
  v_destino text;
  v_pix text;
  v_valor numeric;
begin
  if v_uid is not null and {schema}.eh_paciente() then
    return jsonb_build_object('enfileiradas', 0);
  end if;

  for r in
    select p.id, p.nome, p.config, p.dados_profissionais, p.pago_ate, p.role, p.isento_assinatura
      from profiles p
      join whatsapp_instancias w on w.nutricionista_id = p.id and w.status = 'conectado'
     where (v_uid is null or p.id = v_uid)
  loop
    v_pref := {schema}.whatsapp_preferencias(r.config);
    v_textos := v_pref -> 'textos';

    -- 5.0 (W50) a assinatura da PRÓPRIA profissional, paga por PIX, vence em 3 dias → lembrete pra ela, no número dela
    if v_hora >= ((v_pref ->> 'horario') || ':00')::time
       and r.pago_ate is not null
       and coalesce(r.isento_assinatura, false) = false
       and coalesce(r.role, '') <> 'master'
       and (timezone('America/Sao_Paulo', r.pago_ate))::date = v_hoje + 3
       and not exists (select 1 from assinaturas a where a.nutricionista_id = r.id and a.status = 'authorized') then
      v_destino := {schema}.whatsapp_destino(r.dados_profissionais ->> 'whatsapp_e164');
      if v_destino is not null then
        select pa.pix_qr_code into v_pix
          from pagamentos_assinatura pa
         where pa.nutricionista_id = r.id and pa.status = 'pending' and pa.pix_qr_code is not null
           and coalesce(pa.pix_expira_em, v_agora) > v_agora + interval '1 hour'
         order by pa.created_at desc
         limit 1;
        select pa.valor into v_valor
          from pagamentos_assinatura pa
         where pa.nutricionista_id = r.id and pa.status = 'approved'
         order by pa.pago_em desc nulls last
         limit 1;
        insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia)
        values (r.id, null, 'assinatura_vencendo', v_destino,
                {schema}.whatsapp_texto(v_textos, 'assinatura_vencendo', r.nome,
                  (timezone('America/Sao_Paulo', r.pago_ate))::date, null, coalesce(v_valor, 80), r.nome)
                || case when v_pix is null then '' else E'\n\nCopia e cola do PIX:\n' || v_pix end,
                v_hoje)
        on conflict do nothing;
        get diagnostics v_n = row_count; v_total := v_total + v_n;
      end if;
    end if;

    if not (v_pref ->> 'ativo')::boolean then continue; end if;
    -- ainda não deu a hora dela hoje
    if v_hora < ((v_pref ->> 'horario') || ':00')::time then continue; end if;
    v_momentos := v_pref -> 'momentos';

    -- 5.1 aniversário (mês e dia de hoje) — os alunos de quem ela é a nutri OU o personal (W22, R7)
    if coalesce((v_momentos ->> 'aniversario')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia)
      select r.id, pa.id, 'aniversario', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'aniversario', pa.nome, v_hoje, null, null, r.nome), v_hoje
        from pacientes pa
       where (pa.nutricionista_id = r.id or pa.personal_id = r.id) and pa.deleted_at is null and pa.ativo
         and pa.nascimento is not null
         and to_char(pa.nascimento, 'MM-DD') = to_char(v_hoje, 'MM-DD')
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.2 lembrete de consulta na véspera (agendamento de amanhã)
    if coalesce((v_momentos ->> 'lembrete_vespera')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, agendamento_id)
      select r.id, pa.id, 'lembrete_consulta', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'lembrete_vespera', pa.nome,
               (timezone('America/Sao_Paulo', a.inicio))::date,
               to_char(timezone('America/Sao_Paulo', a.inicio), 'HH24:MI'), null, r.nome),
             v_hoje, a.id
        from agendamentos a
        join pacientes pa on pa.id = a.paciente_id and pa.deleted_at is null and pa.ativo
       where a.nutricionista_id = r.id and a.deleted_at is null
         and a.status not in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu')
         and (timezone('America/Sao_Paulo', a.inicio))::date = v_hoje + 1
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.3 lembrete no dia da consulta (só o que ainda não começou)
    if coalesce((v_momentos ->> 'lembrete_dia')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, agendamento_id)
      select r.id, pa.id, 'lembrete_consulta', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'lembrete_dia', pa.nome, v_hoje,
               to_char(timezone('America/Sao_Paulo', a.inicio), 'HH24:MI'), null, r.nome),
             v_hoje, a.id
        from agendamentos a
        join pacientes pa on pa.id = a.paciente_id and pa.deleted_at is null and pa.ativo
       where a.nutricionista_id = r.id and a.deleted_at is null
         and a.status not in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu')
         and (timezone('America/Sao_Paulo', a.inicio))::date = v_hoje
         and a.inicio > v_agora
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.4 cobrança que vence amanhã (a avulsa do Nutri, "aberta")
    if coalesce((v_momentos ->> 'cobranca_vencendo')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, cobranca_id)
      select r.id, pa.id, 'cobranca_vencendo', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'cobranca_vencendo', pa.nome, c.vencimento, null, c.valor, r.nome), v_hoje, c.id
        from cobrancas c
        join pacientes pa on pa.id = c.paciente_id and pa.deleted_at is null and pa.ativo
       where c.nutricionista_id = r.id and c.deleted_at is null and c.status = 'aberta'
         and c.vencimento = v_hoje + 1
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.5 cobrança que venceu ontem (a avulsa do Nutri, ainda "aberta")
    if coalesce((v_momentos ->> 'cobranca_vencida')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, cobranca_id)
      select r.id, pa.id, 'cobranca_vencida', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'cobranca_vencida', pa.nome, c.vencimento, null, c.valor, r.nome), v_hoje, c.id
        from cobrancas c
        join pacientes pa on pa.id = c.paciente_id and pa.deleted_at is null and pa.ativo
       where c.nutricionista_id = r.id and c.deleted_at is null and c.status = 'aberta'
         and c.vencimento = v_hoje - 1
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.6 (W22) MENSALIDADE da régua do Calc vence amanhã — quem recebe (dono da conta → personal → nutri) manda
    if coalesce((v_momentos ->> 'cobranca_vencendo')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, conta_id)
      select r.id, pa.id, 'cobranca_vencendo', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'cobranca_vencendo', pa.nome, v_hoje + 1, null, pa.mensalidade_valor, r.nome), v_hoje, pa.conta_id
        from pacientes pa
        left join contas ct on ct.id = pa.conta_id
       where coalesce(ct.dono_id, pa.personal_id, pa.nutricionista_id) = r.id
         and coalesce(ct.origem, '') <> 'app'
         and pa.deleted_at is null and pa.ativo
         and coalesce(pa.mensalidade_valor, 0) > 0 and not coalesce(pa.cobranca_pausada, false)
         and coalesce((timezone('America/Sao_Paulo', pa.mensalidade_pago_ate))::date,
                      (timezone('America/Sao_Paulo', pa.mensalidade_desde))::date) = v_hoje + 1
         and not exists (select 1 from cobrancas x where x.paciente_id = pa.id and x.tipo = 'mensalidade'
                           and x.status = 'aguardando_confirmacao' and x.deleted_at is null)
         and not exists (select 1 from aluno_assinaturas s where s.paciente_id = pa.id and s.status = 'authorized')
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.7 (W22) MENSALIDADE da régua do Calc venceu ontem e continua sem cobertura
    if coalesce((v_momentos ->> 'cobranca_vencida')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, conta_id)
      select r.id, pa.id, 'cobranca_vencida', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'cobranca_vencida', pa.nome, v_hoje - 1, null, pa.mensalidade_valor, r.nome), v_hoje, pa.conta_id
        from pacientes pa
        left join contas ct on ct.id = pa.conta_id
       where coalesce(ct.dono_id, pa.personal_id, pa.nutricionista_id) = r.id
         and coalesce(ct.origem, '') <> 'app'
         and pa.deleted_at is null and pa.ativo
         and coalesce(pa.mensalidade_valor, 0) > 0 and not coalesce(pa.cobranca_pausada, false)
         and coalesce((timezone('America/Sao_Paulo', pa.mensalidade_pago_ate))::date,
                      (timezone('America/Sao_Paulo', pa.mensalidade_desde))::date) = v_hoje - 1
         and (pa.mensalidade_pago_ate is null or pa.mensalidade_pago_ate <= v_agora)
         and not exists (select 1 from cobrancas x where x.paciente_id = pa.id and x.tipo = 'mensalidade'
                           and x.status = 'aguardando_confirmacao' and x.deleted_at is null)
         and not exists (select 1 from aluno_assinaturas s where s.paciente_id = pa.id and s.status = 'authorized')
         and {schema}.whatsapp_destino(pa.telefone) is not null
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;
  end loop;

  return jsonb_build_object('enfileiradas', v_total, 'dia', v_hoje);
end;
$$;
revoke all on function {schema}.whatsapp_enfileirar() from public;
revoke all on function {schema}.whatsapp_enfileirar() from anon;
grant execute on function {schema}.whatsapp_enfileirar() to authenticated, service_role;

-- ============================================================================================================
-- 2. Políticas "dono da conta" (W2): ALL → SELECT (a leitura fica igual; gravar na fila/instância só pelas funções)
-- ============================================================================================================
drop policy if exists "whatsapp_instancias: dono da conta" on {schema}.whatsapp_instancias;
create policy "whatsapp_instancias: dono da conta" on {schema}.whatsapp_instancias for select to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "mensagens_whatsapp: dono da conta" on {schema}.mensagens_whatsapp;
create policy "mensagens_whatsapp: dono da conta" on {schema}.mensagens_whatsapp for select to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id));

-- ============================================================================================================
-- 3. Funções da tela (Painel › Mensagens e o número do menu)
-- ============================================================================================================

-- "Limpar": a marca de "falhas vistas" do próprio perfil (texto ISO no config; inválido = sem marca)
create or replace function {schema}.whatsapp_falhas_vistas_em(p_config jsonb) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_config -> 'whatsapp_falhas_vistas_em') <> 'string' then return null; end if;
  return (p_config ->> 'whatsapp_falhas_vistas_em')::timestamptz;
exception when others then
  return null;
end;
$$;
revoke execute on function {schema}.whatsapp_falhas_vistas_em(jsonb) from public, anon;
grant execute on function {schema}.whatsapp_falhas_vistas_em(jsonb) to authenticated, service_role;

-- números da página e do menu (só o da pessoa; a batida do celular é a única coisa "de todos" — só um horário)
create or replace function {schema}.whatsapp_resumo(p_conta uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_agora timestamptz := now();
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
  v_marca timestamptz;
  v_desde_falhas timestamptz;
  v_serie jsonb;
  v_teste jsonb;
  v_alcance jsonb;
begin
  if v_uid is null or {schema}.eh_paciente() then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  select {schema}.whatsapp_falhas_vistas_em(pr.config) into v_marca from {schema}.profiles pr where pr.id = v_uid;
  v_desde_falhas := greatest(v_agora - interval '7 days', coalesce(v_marca, '-infinity'::timestamptz));

  select coalesce(jsonb_agg(coalesce(x.n, 0) order by d.dia), '[]'::jsonb) into v_serie
    from generate_series(v_hoje - 13, v_hoje, interval '1 day') as d(dia)
    left join (select (timezone('America/Sao_Paulo', m.enviada_em))::date as dia, count(*)::int as n
                 from {schema}.mensagens_whatsapp m
                where m.nutricionista_id = v_uid and m.status = 'enviada' and m.enviada_em >= v_agora - interval '15 days'
                group by 1) x on x.dia = d.dia::date;

  select jsonb_build_object('status', m.status, 'erro', m.erro, 'criado_em', m.created_at, 'enviada_em', m.enviada_em) into v_teste
    from {schema}.mensagens_whatsapp m
   where m.nutricionista_id = v_uid and m.tipo = 'teste'
   order by m.created_at desc limit 1;

  select jsonb_build_object(
           'alunos', count(*),
           'com_telefone', count(*) filter (where {schema}.whatsapp_destino(pa.telefone) is not null),
           'ligadas', count(*) filter (where {schema}.whatsapp_destino(pa.telefone) is not null
                                         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)))
    into v_alcance
    from {schema}.pacientes pa
   where (pa.nutricionista_id = v_uid or pa.personal_id = v_uid) and pa.deleted_at is null and pa.ativo;

  return jsonb_build_object(
    'ok', true,
    'dono', p_conta is not null and {schema}.sou_dono(p_conta),
    'agente_ping', (select max(w.ultimo_ping) from {schema}.whatsapp_instancias w),
    'pendentes', (select count(*) from {schema}.mensagens_whatsapp m where m.nutricionista_id = v_uid and m.status in ('pendente', 'enviando')),
    'enviadas_30d', (select count(*) from {schema}.mensagens_whatsapp m where m.nutricionista_id = v_uid and m.status = 'enviada'
                       and m.enviada_em >= v_agora - interval '30 days'),
    'falhas', (select count(*) from {schema}.mensagens_whatsapp m where m.nutricionista_id = v_uid and m.status = 'falhou'
                 and m.updated_at > v_desde_falhas),
    'falhas_desde', v_desde_falhas,
    'falhas_vistas_em', v_marca,
    'serie_enviadas', v_serie,
    'ultimo_teste', v_teste,
    'alcance', v_alcance);
end;
$$;
revoke execute on function {schema}.whatsapp_resumo(uuid) from public, anon;
grant execute on function {schema}.whatsapp_resumo(uuid) to authenticated, service_role;

-- o histórico da fila: "meus" = a própria fila (todas as contas: o WhatsApp é da pessoa); "conta" = a fila da conta para o DONO
-- (os alunos da conta, de qualquer membro, + as próprias sem aluno). Filtros: todas · fila (pendente/enviando) · enviadas ·
-- falhas (as NOVAS: 7 dias, depois do "Limpar" — o mesmo critério do número do menu). Página por (created_at, id) — o cron grava várias
-- linhas no mesmo instante, então o cursor leva o id da última linha (p_antes + p_antes_id).
drop function if exists {schema}.whatsapp_fila(uuid, text, text, integer, timestamptz);
create or replace function {schema}.whatsapp_fila(p_conta uuid default null, p_escopo text default 'meus', p_filtro text default 'todas',
  p_limite integer default 30, p_antes timestamptz default null, p_antes_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_conta boolean;
  v_lim integer := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_filtro text := coalesce(p_filtro, 'todas');
  v_marca timestamptz;
  v_desde_falhas timestamptz;
  v_itens jsonb;
  v_n integer;
begin
  if v_uid is null or {schema}.eh_paciente() then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  if v_filtro not in ('todas', 'fila', 'enviadas', 'falhas') then v_filtro := 'todas'; end if;
  v_conta := coalesce(p_escopo, 'meus') = 'conta' and p_conta is not null and {schema}.sou_dono(p_conta);
  select {schema}.whatsapp_falhas_vistas_em(pr.config) into v_marca from {schema}.profiles pr where pr.id = v_uid;
  v_desde_falhas := greatest(now() - interval '7 days', coalesce(v_marca, '-infinity'::timestamptz));

  with base as (
    select m.id, m.nutricionista_id, m.paciente_id, m.tipo, m.status, m.destino_e164, m.texto, m.erro, m.created_at, m.updated_at,
           m.agendada_para, m.enviada_em, pa.nome as aluno_nome, coalesce(pa.treino_user_id, pa.id) as aluno_rota, pr.nome as autor_nome
      from {schema}.mensagens_whatsapp m
      left join {schema}.pacientes pa on pa.id = m.paciente_id
      left join {schema}.profiles pr on pr.id = m.nutricionista_id
     where (case when v_conta
                 then (m.conta_id = p_conta or pa.conta_id = p_conta or (m.nutricionista_id = v_uid and m.paciente_id is null))
                 else m.nutricionista_id = v_uid end)
       and (v_filtro = 'todas'
            or (v_filtro = 'fila' and m.status in ('pendente', 'enviando'))
            or (v_filtro = 'enviadas' and m.status = 'enviada')
            or (v_filtro = 'falhas' and m.status = 'falhou' and m.updated_at > v_desde_falhas))
       and (p_antes is null or (m.created_at, m.id) < (p_antes, coalesce(p_antes_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     order by m.created_at desc, m.id desc
     limit v_lim + 1
  ), pagina as (
    select * from base order by created_at desc, id desc limit v_lim
  )
  select (select coalesce(jsonb_agg(jsonb_build_object(
            'id', b.id, 'tipo', b.tipo, 'status', b.status, 'destino', b.destino_e164, 'texto', b.texto, 'erro', b.erro,
            'criado_em', b.created_at, 'atualizado_em', b.updated_at, 'agendada_para', b.agendada_para, 'enviada_em', b.enviada_em,
            'aluno', case when b.paciente_id is null then null else jsonb_build_object('id', b.paciente_id, 'nome', b.aluno_nome, 'rota', b.aluno_rota) end,
            'autor', jsonb_build_object('id', b.nutricionista_id, 'nome', b.autor_nome),
            'minha', b.nutricionista_id = v_uid,
            'pode_reenviar', b.nutricionista_id = v_uid and b.status = 'falhou' and b.updated_at > now() - interval '7 days')
          order by b.created_at desc, b.id desc), '[]'::jsonb) from pagina b),
         (select count(*)::int from base)
    into v_itens, v_n;

  return jsonb_build_object('ok', true, 'escopo', case when v_conta then 'conta' else 'meus' end, 'filtro', v_filtro, 'itens', v_itens,
    'mais', v_n > v_lim);
end;
$$;
revoke execute on function {schema}.whatsapp_fila(uuid, text, text, integer, timestamptz, uuid) from public, anon;
grant execute on function {schema}.whatsapp_fila(uuid, text, text, integer, timestamptz, uuid) to authenticated, service_role;

-- grava as mensagens automáticas da pessoa (profiles.config.whatsapp), com a mesma tolerância da tela: horário da lista (06:00–21:00),
-- só booleanos nos momentos, textos até 400 caracteres; o resto do config (tema, avisos…) fica como está
create or replace function {schema}.whatsapp_salvar_config(p_whatsapp jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_horario text;
  v_momentos jsonb := '{}'::jsonb;
  v_textos jsonb := '{}'::jsonb;
  v_novo jsonb;
  k text;
  v_t text;
begin
  if v_uid is null or {schema}.eh_paciente() then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  if p_whatsapp is null or jsonb_typeof(p_whatsapp) <> 'object' then return jsonb_build_object('ok', false, 'erro', 'config_invalida'); end if;
  v_horario := p_whatsapp ->> 'horario';
  if v_horario is null or v_horario !~ '^(0[6-9]|1[0-9]|2[01]):00$' then v_horario := '09:00'; end if;
  foreach k in array array['aniversario', 'lembrete_vespera', 'lembrete_dia', 'cobranca_vencendo', 'cobranca_vencida', 'confirmacao_agendamento'] loop
    if jsonb_typeof(p_whatsapp -> 'momentos' -> k) = 'boolean' then
      v_momentos := v_momentos || jsonb_build_object(k, (p_whatsapp -> 'momentos' ->> k)::boolean);
    end if;
    if jsonb_typeof(p_whatsapp -> 'textos' -> k) = 'string' then
      v_t := btrim(p_whatsapp -> 'textos' ->> k);
      if char_length(v_t) > 400 then return jsonb_build_object('ok', false, 'erro', 'texto_longo', 'momento', k); end if;
      if v_t <> '' then v_textos := v_textos || jsonb_build_object(k, v_t); end if;
    end if;
  end loop;
  v_novo := jsonb_build_object('ativo', case when jsonb_typeof(p_whatsapp -> 'ativo') = 'boolean' then (p_whatsapp ->> 'ativo')::boolean else false end,
                               'horario', v_horario, 'momentos', v_momentos, 'textos', v_textos);
  update {schema}.profiles set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('whatsapp', v_novo) where id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'erro', 'sem_perfil'); end if;
  return jsonb_build_object('ok', true, 'whatsapp', v_novo);
end;
$$;
revoke execute on function {schema}.whatsapp_salvar_config(jsonb) from public, anon;
grant execute on function {schema}.whatsapp_salvar_config(jsonb) to authenticated, service_role;

-- reenviar a PRÓPRIA mensagem que falhou (7 dias), com o WhatsApp conectado e se ela ainda faz sentido
create or replace function {schema}.whatsapp_reenviar(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
  m record;
  v_inst record;
  v_pa record;
  v_dest text;
  v_ok boolean;
begin
  if v_uid is null or {schema}.eh_paciente() then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  select * into m from {schema}.mensagens_whatsapp where id = p_id for update;
  if not found or m.nutricionista_id <> v_uid then return jsonb_build_object('ok', false, 'erro', 'nao_encontrada'); end if;
  if m.status <> 'falhou' then return jsonb_build_object('ok', false, 'erro', 'nao_falhou'); end if;
  if m.updated_at < now() - interval '7 days' then return jsonb_build_object('ok', false, 'erro', 'antiga'); end if;
  select * into v_inst from {schema}.whatsapp_instancias w where w.nutricionista_id = v_uid;
  if not found or v_inst.status <> 'conectado' then return jsonb_build_object('ok', false, 'erro', 'nao_conectado'); end if;

  if m.paciente_id is not null then
    select * into v_pa from {schema}.pacientes pa where pa.id = m.paciente_id;
    if not found or v_pa.deleted_at is not null or not v_pa.ativo then return jsonb_build_object('ok', false, 'erro', 'aluno_inativo'); end if;
    if not {schema}.w14_ajuste(v_pa.config, 'mensagens_automaticas', false) then
      return jsonb_build_object('ok', false, 'erro', 'mensagens_desligadas');
    end if;
    v_dest := {schema}.whatsapp_destino(v_pa.telefone);
    if v_dest is null then return jsonb_build_object('ok', false, 'erro', 'sem_telefone'); end if;
  else
    select coalesce(nullif(v_inst.numero_conectado, ''), {schema}.whatsapp_destino(pr.dados_profissionais ->> 'whatsapp_e164'), m.destino_e164)
      into v_dest from {schema}.profiles pr where pr.id = v_uid;
    if v_dest is null then return jsonb_build_object('ok', false, 'erro', 'sem_numero'); end if;
  end if;

  -- o momento ainda vale?
  if m.agendamento_id is not null then
    select exists (select 1 from {schema}.agendamentos a where a.id = m.agendamento_id and a.deleted_at is null and a.inicio > now()
                     and a.status not in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu')) into v_ok;
    if not v_ok then return jsonb_build_object('ok', false, 'erro', 'consulta_passou'); end if;
  end if;
  if m.tipo in ('cobranca_vencendo', 'cobranca_vencida') then
    if m.cobranca_id is not null then
      select exists (select 1 from {schema}.cobrancas c where c.id = m.cobranca_id and c.deleted_at is null and c.status = 'aberta') into v_ok;
      if not v_ok then return jsonb_build_object('ok', false, 'erro', 'cobranca_resolvida'); end if;
    elsif m.paciente_id is not null then
      -- a mensalidade (sem linha de cobrança): paga depois da falha = não reenvia
      if v_pa.mensalidade_pago_ate is not null and v_pa.mensalidade_pago_ate > now() then
        return jsonb_build_object('ok', false, 'erro', 'cobranca_resolvida');
      end if;
    end if;
  end if;
  if m.tipo = 'aniversario' and m.referencia_dia is distinct from v_hoje then
    return jsonb_build_object('ok', false, 'erro', 'fora_do_dia');
  end if;

  update {schema}.mensagens_whatsapp
     set status = 'pendente', tentativas = 0, erro = null, enviada_em = null, agendada_para = now(), destino_e164 = v_dest
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;
revoke execute on function {schema}.whatsapp_reenviar(uuid) from public, anon;
grant execute on function {schema}.whatsapp_reenviar(uuid) to authenticated, service_role;

-- "Limpar": as falhas de até agora deixam de contar no número do menu (o histórico continua com "Falhou")
create or replace function {schema}.whatsapp_limpar_falhas() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_em timestamptz := now();
begin
  if v_uid is null or {schema}.eh_paciente() then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  update {schema}.profiles set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('whatsapp_falhas_vistas_em', v_em)
   where id = v_uid;
  return jsonb_build_object('ok', true, 'em', v_em);
end;
$$;
revoke execute on function {schema}.whatsapp_limpar_falhas() from public, anon;
grant execute on function {schema}.whatsapp_limpar_falhas() to authenticated, service_role;
