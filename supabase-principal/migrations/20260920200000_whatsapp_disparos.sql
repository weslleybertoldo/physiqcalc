-- PhysiqNutri — W47: mensagens automáticas do WhatsApp (a 2ª metade do pedido dele de 20/09/2026, "temos pendentes ainda
-- as mensagens pelo whatsapp"). A W46 entregou a conexão; aqui entram os DISPAROS. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920200000_whatsapp_disparos.sql`.
--
-- Desenho: quem decide é `profiles.config.whatsapp` (jsonb, W35) — tudo nasce DESLIGADO e a profissional liga o que quiser
-- na aba WhatsApp, com o texto de cada momento. Um pg_cron de 15 em 15 min chama `whatsapp_enfileirar()`, que olha o
-- relógio de São Paulo e põe na fila `mensagens_whatsapp` o que vence hoje; quem envia é o agente no celular (W46).
-- Não precisa de servidor pra isso: o disparo por data é do banco (foi a dúvida dele — "não da pra ativar pelas datas?").
--
-- Momentos: aniversário do paciente · lembrete de consulta na véspera e no dia · cobrança a vencer e vencida ·
-- confirmação na hora em que o agendamento é criado (essa é por gatilho, não pelo cron).

-- 1) a fila ganha a data de referência, pra não repetir o mesmo disparo no mesmo dia
alter table {schema}.mensagens_whatsapp add column if not exists referencia_dia date;
alter table {schema}.mensagens_whatsapp add column if not exists agendamento_id uuid
  references {schema}.agendamentos(id) on delete set null;
alter table {schema}.mensagens_whatsapp add column if not exists cobranca_id uuid
  references {schema}.cobrancas(id) on delete set null;
-- 1 mensagem por (profissional, paciente, tipo, dia): o cron pode rodar 96x por dia sem duplicar nada
create unique index if not exists mensagens_whatsapp_sem_repetir_idx
  on {schema}.mensagens_whatsapp (nutricionista_id, paciente_id, tipo, referencia_dia)
  where referencia_dia is not null and status <> 'cancelada';

-- 2) preferências: lê `profiles.config->'whatsapp'` com default seguro (tudo desligado)
create or replace function {schema}.whatsapp_preferencias(p_config jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ativo',   coalesce((p_config #> '{whatsapp,ativo}')::boolean, false),
    'horario', coalesce(p_config #>> '{whatsapp,horario}', '09:00'),
    'momentos', coalesce(p_config #> '{whatsapp,momentos}', '{}'::jsonb),
    'textos',   coalesce(p_config #> '{whatsapp,textos}', '{}'::jsonb)
  );
$$;

-- 3) texto do momento: o que ela escreveu, ou o padrão; troca {nome} {data} {hora} {valor} {profissional}
create or replace function {schema}.whatsapp_texto(
  p_textos jsonb, p_momento text, p_nome text, p_data date, p_hora text, p_valor numeric, p_profissional text
)
returns text
language plpgsql
immutable
as $$
declare
  v_padrao text;
  v_texto text;
  v_valor text;
begin
  v_padrao := case p_momento
    when 'aniversario' then 'Oi, {nome}! Feliz aniversário! 🎉 Que seu dia seja ótimo. Um abraço, {profissional}.'
    when 'lembrete_vespera' then 'Oi, {nome}! Passando pra lembrar da sua consulta amanhã, dia {data}, às {hora}. Até lá!'
    when 'lembrete_dia' then 'Oi, {nome}! Sua consulta é hoje às {hora}. Te espero!'
    when 'cobranca_vencendo' then 'Oi, {nome}! Sua mensalidade de {valor} vence amanhã, dia {data}. Qualquer dúvida é só me chamar.'
    when 'cobranca_vencida' then 'Oi, {nome}! Notei que a mensalidade de {valor}, que venceu em {data}, ainda está em aberto. Se já pagou, me avisa pra eu dar baixa.'
    when 'confirmacao_agendamento' then 'Oi, {nome}! Sua consulta ficou marcada para {data} às {hora}. Até lá!'
    else 'Oi, {nome}!'
  end;
  -- ⚠️ formatar o valor ANTES e sozinho: trocar '.' por ',' no texto inteiro viraria os pontos finais das frases
  -- em vírgulas. `translate` faz a troca BR (1,234.50 → 1.234,50) só no número.
  v_valor := case when p_valor is null then '' else 'R$ ' || translate(to_char(p_valor, 'FM999G999D00'), '.,', ',.') end;
  v_texto := coalesce(nullif(trim(p_textos ->> p_momento), ''), v_padrao);
  v_texto := replace(v_texto, '{nome}', coalesce(split_part(trim(p_nome), ' ', 1), ''));
  v_texto := replace(v_texto, '{data}', coalesce(to_char(p_data, 'DD/MM'), ''));
  v_texto := replace(v_texto, '{hora}', coalesce(p_hora, ''));
  v_texto := replace(v_texto, '{valor}', v_valor);
  v_texto := replace(v_texto, '{profissional}', coalesce(split_part(trim(p_profissional), ' ', 1), ''));
  return v_texto;
end;
$$;

-- 4) o telefone do paciente em E.164 (a coluna guarda só dígitos, W21); null = não dá pra mandar
create or replace function {schema}.whatsapp_destino(p_telefone text)
returns text
language sql
immutable
as $$
  select case
    when p_telefone is null then null
    when length(regexp_replace(p_telefone, '\D', '', 'g')) in (10, 11) then '+55' || regexp_replace(p_telefone, '\D', '', 'g')
    when length(regexp_replace(p_telefone, '\D', '', 'g')) in (12, 13) then '+' || regexp_replace(p_telefone, '\D', '', 'g')
    else null
  end;
$$;

-- 5) o coração: enfileira o que vence hoje. security definer (o cron roda sem sessão). COM sessão só da própria
--    profissional (a tela pode chamar pra "rodar agora"); a conta do paciente não enfileira nada.
--    Só entra na fila quem está CONECTADO, com o momento LIGADO e já passou do horário escolhido no relógio de SP.
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
begin
  if v_uid is not null and {schema}.eh_paciente() then
    return jsonb_build_object('enfileiradas', 0);
  end if;

  for r in
    select p.id, p.nome, p.config
      from profiles p
      join whatsapp_instancias w on w.nutricionista_id = p.id and w.status = 'conectado'
     where (v_uid is null or p.id = v_uid)
  loop
    v_pref := {schema}.whatsapp_preferencias(r.config);
    if not (v_pref ->> 'ativo')::boolean then continue; end if;
    -- ainda não deu a hora dela hoje
    if v_hora < ((v_pref ->> 'horario') || ':00')::time then continue; end if;
    v_momentos := v_pref -> 'momentos';
    v_textos := v_pref -> 'textos';

    -- 5.1 aniversário (mês e dia de hoje)
    if coalesce((v_momentos ->> 'aniversario')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia)
      select r.id, pa.id, 'aniversario', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'aniversario', pa.nome, v_hoje, null, null, r.nome), v_hoje
        from pacientes pa
       where pa.nutricionista_id = r.id and pa.deleted_at is null and pa.ativo
         and pa.nascimento is not null
         and to_char(pa.nascimento, 'MM-DD') = to_char(v_hoje, 'MM-DD')
         and {schema}.whatsapp_destino(pa.telefone) is not null
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
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.4 cobrança que vence amanhã
    if coalesce((v_momentos ->> 'cobranca_vencendo')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, cobranca_id)
      select r.id, pa.id, 'cobranca_vencendo', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'cobranca_vencendo', pa.nome, c.vencimento, null, c.valor, r.nome), v_hoje, c.id
        from cobrancas c
        join pacientes pa on pa.id = c.paciente_id and pa.deleted_at is null and pa.ativo
       where c.nutricionista_id = r.id and c.deleted_at is null and c.status = 'aberta'
         and c.vencimento = v_hoje + 1
         and {schema}.whatsapp_destino(pa.telefone) is not null
      on conflict do nothing;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- 5.5 cobrança que venceu ontem
    if coalesce((v_momentos ->> 'cobranca_vencida')::boolean, false) then
      insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, cobranca_id)
      select r.id, pa.id, 'cobranca_vencida', {schema}.whatsapp_destino(pa.telefone),
             {schema}.whatsapp_texto(v_textos, 'cobranca_vencida', pa.nome, c.vencimento, null, c.valor, r.nome), v_hoje, c.id
        from cobrancas c
        join pacientes pa on pa.id = c.paciente_id and pa.deleted_at is null and pa.ativo
       where c.nutricionista_id = r.id and c.deleted_at is null and c.status = 'aberta'
         and c.vencimento = v_hoje - 1
         and {schema}.whatsapp_destino(pa.telefone) is not null
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

-- 6) confirmação NA HORA em que o agendamento é criado (pedido dele: "agendou dispara a mensagem?").
--    Gatilho, não cron: o paciente recebe a confirmação em segundos.
create or replace function {schema}.whatsapp_confirmar_agendamento()
returns trigger
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_pref jsonb;
  v_nome text;
  v_prof text;
  v_tel text;
begin
  if new.paciente_id is null or new.deleted_at is not null then return new; end if;
  if new.status in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu') then return new; end if;

  select {schema}.whatsapp_preferencias(p.config), p.nome into v_pref, v_prof
    from profiles p
    join whatsapp_instancias w on w.nutricionista_id = p.id and w.status = 'conectado'
   where p.id = new.nutricionista_id;
  if v_pref is null then return new; end if;
  if not (v_pref ->> 'ativo')::boolean then return new; end if;
  if not coalesce(((v_pref -> 'momentos') ->> 'confirmacao_agendamento')::boolean, false) then return new; end if;

  select pa.nome, {schema}.whatsapp_destino(pa.telefone) into v_nome, v_tel
    from pacientes pa where pa.id = new.paciente_id and pa.deleted_at is null and pa.ativo;
  if v_tel is null then return new; end if;

  insert into mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, referencia_dia, agendamento_id)
  values (new.nutricionista_id, new.paciente_id, 'confirmacao_agendamento', v_tel,
          {schema}.whatsapp_texto(v_pref -> 'textos', 'confirmacao_agendamento', v_nome,
            (timezone('America/Sao_Paulo', new.inicio))::date,
            to_char(timezone('America/Sao_Paulo', new.inicio), 'HH24:MI'), null, v_prof),
          (timezone('America/Sao_Paulo', new.inicio))::date, new.id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_whatsapp_confirmar_agendamento on {schema}.agendamentos;
create trigger trg_whatsapp_confirmar_agendamento after insert on {schema}.agendamentos
  for each row execute function {schema}.whatsapp_confirmar_agendamento();

-- 7) devolve pra fila o que ficou preso em 'enviando' (o celular morreu no meio) e desiste depois de 3 tentativas
create or replace function {schema}.whatsapp_destravar_fila()
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_voltaram integer := 0;
  v_desistiu integer := 0;
begin
  update mensagens_whatsapp set status = 'pendente'
   where status = 'enviando' and updated_at < now() - interval '10 minutes' and tentativas < 3;
  get diagnostics v_voltaram = row_count;
  update mensagens_whatsapp set status = 'falhou', erro = coalesce(erro, 'não foi possível enviar')
   where status = 'enviando' and updated_at < now() - interval '10 minutes' and tentativas >= 3;
  get diagnostics v_desistiu = row_count;
  return jsonb_build_object('voltaram', v_voltaram, 'desistiram', v_desistiu);
end;
$$;
revoke all on function {schema}.whatsapp_destravar_fila() from public;
revoke all on function {schema}.whatsapp_destravar_fila() from anon;
grant execute on function {schema}.whatsapp_destravar_fila() to authenticated, service_role;

-- 8) pg_cron: de 15 em 15 min (o horário de cada profissional é conferido dentro da função, no relógio de SP).
--    `cron.schedule` com o mesmo nome ATUALIZA o job (idempotente).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end
$$;
select cron.schedule('whatsapp-enfileirar-{schema}', '*/15 * * * *', $$select {schema}.whatsapp_enfileirar()$$);
select cron.schedule('whatsapp-destravar-{schema}', '*/10 * * * *', $$select {schema}.whatsapp_destravar_fila()$$);
