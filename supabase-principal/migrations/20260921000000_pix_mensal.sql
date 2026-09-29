-- PhysiqNutri — W50: PIX mensal da assinatura do profissional. Autorização dele (20/09/2026 ~22:50): "FAZ O PIX MENSAL SIM."
-- O Mercado Pago não repete PIX sozinho (a preapproval só aceita cartão), então o desenho é cobrança AVULSA de R$ 80 que
-- soma 30 dias de acesso (profiles.pago_ate). Idempotente. Aplicar com
-- `python3 scripts/apply_migration.py supabase/migrations/20260921000000_pix_mensal.sql` (roda em public E staging trocando {schema}).
--
-- Desenho: cada PIX vira uma linha em pagamentos_assinatura (espelho do /v1/payments do MP, 1 por pagamento). Quem ESCREVE é só a
-- service_role pelas Edge Functions mp-assinar (pix_criar / pix_status) e mp-webhook (aviso do MP); a dona só lê as próprias linhas.
-- Aprovou → pago_em, cobre_ate e profiles.pago_ate = cobre_ate (30 dias a partir de hoje, ou do que ainda vale — não perde dias).
-- A tela libera enquanto pago_ate > agora (regra pura em src/lib/assinaturaUtil.ts); quem tem cartão authorized não vê o PIX.

-- 1) até quando o acesso está pago por PIX (null = nunca pagou por PIX)
alter table {schema}.profiles add column if not exists pago_ate timestamptz;

-- 2) a dona não mexe no próprio pago_ate (só service_role e master) — mesma policy da W42, com o campo novo pinado
drop policy if exists "perfil: editar o proprio" on {schema}.profiles;
create policy "perfil: editar o proprio" on {schema}.profiles
  for update to authenticated using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from {schema}.profiles p where p.id = auth.uid())
    and teste_ate = (select p.teste_ate from {schema}.profiles p where p.id = auth.uid())
    and isento_assinatura = (select p.isento_assinatura from {schema}.profiles p where p.id = auth.uid())
    and pago_ate is not distinct from (select p.pago_ate from {schema}.profiles p where p.id = auth.uid())
  );

-- 3) pagamentos_assinatura: espelho de cada PIX (/v1/payments) do profissional
create table if not exists {schema}.pagamentos_assinatura (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references {schema}.profiles(id) on delete cascade,
  mp_payment_id text not null unique,
  valor numeric(12,2) not null default 80 check (valor > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_expira_em timestamptz,
  pago_em timestamptz,
  cobre_ate timestamptz,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on {schema}.pagamentos_assinatura to anon, authenticated, service_role;
alter table {schema}.pagamentos_assinatura enable row level security;
drop policy if exists "pagamentos_assinatura: dona ou master le" on {schema}.pagamentos_assinatura;
create policy "pagamentos_assinatura: dona ou master le" on {schema}.pagamentos_assinatura
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- sem policy de insert/update/delete: pelo cliente ninguém escreve (a service_role das Edge Functions passa por cima do RLS)
drop trigger if exists pagamentos_assinatura_updated_at on {schema}.pagamentos_assinatura;
create trigger pagamentos_assinatura_updated_at before update on {schema}.pagamentos_assinatura
  for each row execute function {schema}.set_updated_at();
-- o PIX aberto da profissional (reaproveitado em vez de criar outro no MP)
create index if not exists pagamentos_assinatura_pendente_idx on {schema}.pagamentos_assinatura (nutricionista_id) where status = 'pending';
create index if not exists pagamentos_assinatura_nutri_idx on {schema}.pagamentos_assinatura (nutricionista_id, created_at desc);

-- 4) WhatsApp (fatia 2 da W50): o momento 'assinatura_vencendo' — 3 dias antes do pago_ate vencer, a PRÓPRIA profissional recebe,
--    no WhatsApp dela (pela conexão dela, W46), o lembrete com o código PIX aberto (ou o caminho pra gerar um). Só pra quem paga
--    por PIX (tem pago_ate, sem cartão authorized, não isenta). É a cobrança do app, não dos pacientes: não depende dos
--    interruptores dos momentos, mas respeita o horário escolhido e exige a conexão. paciente_id fica null.
alter table {schema}.mensagens_whatsapp drop constraint if exists mensagens_whatsapp_tipo_check;
alter table {schema}.mensagens_whatsapp add constraint mensagens_whatsapp_tipo_check
  check (tipo in ('teste', 'aniversario', 'lembrete_consulta', 'cobranca_vencendo', 'cobranca_vencida', 'confirmacao_agendamento', 'assinatura_vencendo'));
-- 1 lembrete por (profissional, tipo, dia) quando não há paciente — o índice da W47 usa paciente_id, e null é sempre distinto
create unique index if not exists mensagens_whatsapp_sem_repetir_nutri_idx
  on {schema}.mensagens_whatsapp (nutricionista_id, tipo, referencia_dia)
  where paciente_id is null and referencia_dia is not null and status <> 'cancelada';

-- 4.1) texto do momento (mesma função da W47, com o caso novo)
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
    when 'assinatura_vencendo' then 'Oi, {nome}! Sua assinatura do PhysiqNutri vence em {data}. Pague o PIX de {valor} pra somar mais 30 dias — em Configurações → Plano e assinatura.'
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

-- 4.2) o enfileirador da W47 com o bloco 5.0 (assinatura da profissional) — o resto é idêntico
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
