-- Physiq H5 — ajustes da revisão final (FIM-1b) no BANCO PRINCIPAL (staging e public). Idempotente; SÓ TROCA 3 FUNÇÕES: nenhuma
-- tabela, coluna, política ou dado muda (os cadastros pendentes, a agenda e a fila do WhatsApp ficam como estão).
--
-- Aplicar (backup ANTES — definições antigas + contagens de cadastros_pendentes, agendamentos e mensagens_whatsapp):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002090100_h5_agenda_cadastro_aviso_pix.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002090100_h5_agenda_cadastro_aviso_pix.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002090100_h5_agenda_cadastro_aviso_pix.sql --so public
--
-- 1. N-11 / DN-7 — Agenda "Sem trava" (regra dele, 01/10: "sem trava o usuário poderá marcar em qualquer mês"): a janela do
--    reagendamento 'livre' parava em hoje + 180 dias (decisão do agente da W20). Agora não tem fim: w20_janela devolve j_ate = null.
--    Quem lê a janela já lida com o null sem mudar uma linha: aluno_agenda_horarios usa least(…), que ignora null (o motor de slots
--    continua devolvendo no máximo 63 dias por chamada — o app pede mês a mês); aluno_agenda_reagendar compara
--    `v_dia > v_jate`, que com null não é verdadeiro (a data não fica "fora da janela"). As janelas 'mes' e 'mes_seguinte' não mudam.
-- 2. N-57 / DN-6 — /c/ (cadastro pelo link do profissional): volta com CPF e apelido, como no Nutri; obrigatório só o NOME (no Nutri:
--    "Só o nome é obrigatório" — o contato_obrigatorio da W13 saiu); CPF com 11 dígitos (o dígito verificador a tela confere, como no
--    Nutri); pendente repetido também pelo CPF; e a trava da W16b (e-mail e CPF únicos entre os alunos vivos de qualquer conta) vale
--    para o CPF: cadastro_email_existe | cadastro_cpf_existe + `campos` (os 2 de uma vez), sem dizer de quem. A aprovação
--    (aluno_pendente_decidir, W16b) já copiava cpf e apelido do pendente.
-- 3. Achado 2 do FIM-1b — aviso de Pix em dobro: o bloco 5.0 (W50 do Nutri) do whatsapp_enfileirar ainda lia profiles.pago_ate e
--    mandava "Sua assinatura do PhysiqNutri vence em …" ao lado do aviso novo do plano da conta (passo 3 da tarefa diária
--    physiq_contas_diaria, W28: contas.vence_em, conta_preco, Pix da fatura). O índice de 1 por dia deixava sair só 1, mas, com as
--    datas diferentes, saía o lembrete com data e valor antigos. O bloco 5.0 sai (com as colunas e variáveis que só ele usava); o
--    resto é o da W22, sem mudar uma linha.

-- ============================================================================================================
-- 1. Agenda: "Sem trava" = qualquer mês, sem fim
-- ============================================================================================================
create or replace function {schema}.w20_janela(p_janela text, p_mes_ref date) returns table (j_de date, j_ate date)
language sql stable set search_path = '' as $$
  select case when p_janela = 'livre' then h.hoje else greatest(h.hoje, p_mes_ref) end,
         case p_janela
           when 'mes_seguinte' then ((p_mes_ref + interval '2 months')::date - 1)
           when 'livre' then null::date
           else ((p_mes_ref + interval '1 month')::date - 1) end
    from (select timezone('America/Sao_Paulo', now())::date as hoje) h;
$$;
revoke all on function {schema}.w20_janela(text, date) from public, anon, authenticated;
grant execute on function {schema}.w20_janela(text, date) to service_role;

-- ============================================================================================================
-- 2. /c/ — cadastro pelo link com CPF e apelido (só o nome obrigatório) e a trava de e-mail/CPF
-- ============================================================================================================
create or replace function {schema}.cadastro_link_enviar(p_codigo text, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_dono_user uuid;
  v_dono_conta uuid;
  v_nome text := left(regexp_replace(btrim(coalesce(v_d ->> 'nome', '')), '\s+', ' ', 'g'), 120);
  v_apelido text := nullif(left(regexp_replace(btrim(coalesce(v_d ->> 'apelido', '')), '\s+', ' ', 'g'), 60), '');
  v_email text := nullif(lower(btrim(coalesce(v_d ->> 'email', ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(v_d ->> 'telefone', ''), '\D', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(v_d ->> 'cpf', ''), '\D', '', 'g'), '');
  v_genero text := nullif(lower(btrim(coalesce(v_d ->> 'genero', ''))), '');
  v_obs text := nullif(left(btrim(coalesce(v_d ->> 'observacoes', '')), 2000), '');
  v_nasc date;
  v_qtd integer;
  v_id uuid;
  v_rep text[];
begin
  select d.user_id, d.conta_id into v_dono_user, v_dono_conta from {schema}.w13_dono_do_codigo(p_codigo) d;
  if v_dono_user is null then return jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'); end if;
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160) then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_tel is not null and length(v_tel) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'telefone_invalido'); end if;
  if v_cpf is not null and length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'cpf_invalido'); end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then return jsonb_build_object('ok', false, 'erro', 'genero_invalido'); end if;
  if nullif(btrim(coalesce(v_d ->> 'nascimento', '')), '') is not null then
    begin
      v_nasc := (v_d ->> 'nascimento')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end;
    if v_nasc > current_date or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido'); end if;
  end if;
  -- staging: só contato de teste (P26)
  if '{schema}' = 'staging' and v_email is not null and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  select count(*) into v_qtd from {schema}.cadastros_pendentes cp
   where cp.nutricionista_id = v_dono_user and cp.created_at > now() - interval '1 hour';
  if v_qtd >= 30 then return jsonb_build_object('ok', false, 'erro', 'muitos_cadastros'); end if;
  if exists (select 1 from {schema}.cadastros_pendentes cp
              where cp.nutricionista_id = v_dono_user and cp.status = 'pendente'
                and ((v_cpf is not null and cp.cpf = v_cpf)
                  or (v_email is not null and cp.email = v_email)
                  or (v_tel is not null and cp.telefone = v_tel and lower(cp.nome) = lower(v_nome)))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_repetido');
  end if;
  -- W16b + H5: e-mail ou CPF que já é de um aluno vivo (em qualquer conta) não vira cadastro novo — só diz que já existe
  select coalesce(array_agg(distinct c.campo order by c.campo), '{}') into v_rep
    from {schema}.paciente_conflitos(null, null, v_email, v_cpf) c;
  if cardinality(v_rep) > 0 then
    return jsonb_build_object('ok', false,
                              'erro', case when 'email' = any(v_rep) then 'cadastro_email_existe' else 'cadastro_cpf_existe' end,
                              'campos', to_jsonb(v_rep));
  end if;
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_apelido, v_nasc, v_tel, v_cpf, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
-- as permissões de hoje (W13), iguais: quem chama é a função alunos (service_role), com o captcha
revoke all on function {schema}.cadastro_link_enviar(text, jsonb) from public, anon;
grant execute on function {schema}.cadastro_link_enviar(text, jsonb) to authenticated, service_role;

-- ============================================================================================================
-- 3. WhatsApp: o enfileirador da W22 sem o aviso de Pix antigo do Nutri (bloco 5.0) — o do plano da conta (W28) fica
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
    v_textos := v_pref -> 'textos';

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
