-- Physiq W14 — Perfil do aluno: dados, acesso e ajustes (+ falhas F1 e F2). Banco principal, public + staging. Idempotente.
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py; o bloco compartilhado usa as funções dos 2 schemas):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930160000_w14_ajustes.sql --so staging
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930160000_w14_ajustes.sql --compartilhado
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930160000_w14_ajustes.sql --so public
--             python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930160000_w14_ajustes.sql --compartilhado
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK). Conferência da P15 antes/depois: e2e/w14/p15_contagem.py.
--
-- O que entra (spec §4.5 Resumo, §9, N-27 N-63 C32 C33, R12 R13, P15):
--   1. F2 — os 4 ajustes do aluno VALEM (R12), lidos do mesmo pacientes.config do site antigo do Nutri (mesmas chaves e padrões:
--      link e diário ligados, mensagens desligadas; o acesso ao app, sem a chave, vale ligado para quem tem login — P15):
--        · mensagens_automaticas: whatsapp_enfileirar() e o gatilho da confirmação ao agendar só enfileiram quem tem o ajuste
--          LIGADO (antes iam para todo paciente com telefone);
--        · diario_alimentar: diario_enviar recusa ('diario_desligado') e o Storage não aceita a foto; a aba Dieta do app recebe o
--          ajuste pela minha_dieta() e não oferece a foto; diario_paciente/diario_listar (o /d/ público) não abrem;
--        · acesso_link ("envio de fotos pelo link" — F1): o /d/ público (sem ser o próprio aluno logado) só abre e só aceita foto
--          com ele ligado ('link_desligado');
--        · acesso_app: a minha_situacao() leva o ajuste de cada matrícula e a trava GateAcessoApp fecha o app do aluno.
--   2. P15 — quem já tem login ganha acesso_app = true (o padrão do site antigo é false e fecharia o acesso de quem usa hoje); e
--      daqui para frente, ligar um login a uma matrícula liga o acesso ao app (gatilho). Não mexe em updated_at ("Modificado em").
--      As mensagens seguem o que a tela mostra (sem a chave = desligadas) — aviso único ao profissional (mensagens_desligadas) e
--      "Ligar para todos" (mensagens_ligar_para_todos), só dos que a lista do aviso mostra.
--   3. O Perfil do aluno no painel (Resumo e cabeçalho, tela 7): aluno_perfil (leitura), aluno_salvar_dados (cadastro + resumo
--      privado; o cadastro vai para o Treino pelo espelho — C33), aluno_salvar_ajustes, aluno_novo_link (o código do diário).
--      Quem vê: master, a nutricionista dona do registro e quem vê o aluno pela conta (pode_mexer_no_acesso, W8b). Quem edita:
--      master, dono da conta, o responsável pelo aluno (w13_pode_gerir) e a nutricionista dona do registro (site antigo).
-- Nada é apagado nem copiado. Dados de cliente: só o config.acesso_app da P15 (conferido antes/depois por nutri e por conta).

-- ============================================================================================================
-- 0. Os ajustes (a mesma regra do lerConfig do site antigo: chave ausente ou de outro tipo = o padrão)
-- ============================================================================================================
create or replace function {schema}.w14_ajuste(p_config jsonb, p_chave text, p_padrao boolean) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_config -> p_chave) = 'boolean' then (p_config ->> p_chave)::boolean else p_padrao end;
$$;
revoke execute on function {schema}.w14_ajuste(jsonb, text, boolean) from public, anon;
grant execute on function {schema}.w14_ajuste(jsonb, text, boolean) to authenticated, service_role;

-- os 4 ajustes valendo (o que a tela mostra): acesso_app sem a chave = tem login
create or replace function {schema}.ajustes_do_aluno(p_config jsonb, p_tem_login boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'acesso_app', {schema}.w14_ajuste(p_config, 'acesso_app', coalesce(p_tem_login, false)),
    'mensagens_automaticas', {schema}.w14_ajuste(p_config, 'mensagens_automaticas', false),
    'diario_alimentar', {schema}.w14_ajuste(p_config, 'diario_alimentar', true),
    'acesso_link', {schema}.w14_ajuste(p_config, 'acesso_link', true));
$$;
revoke execute on function {schema}.ajustes_do_aluno(jsonb, boolean) from public, anon;
grant execute on function {schema}.ajustes_do_aluno(jsonb, boolean) to authenticated, service_role;

-- ============================================================================================================
-- 1. P15: ligar um login à matrícula liga o acesso ao app (criar acesso, convite aceito, código do profissional, matrícula nova
--    com login…). Antes do guard_vinculos? Não: os BEFORE rodam em ordem de nome (guard → login) — a escrita direta do app,
--    que o guard desfaz, não chega aqui com o login trocado.
-- ============================================================================================================
create or replace function {schema}.w14_login_liga_acesso_app() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not (coalesce(new.config, '{}'::jsonb) ? 'acesso_app') then
      new.config := coalesce(new.config, '{}'::jsonb) || jsonb_build_object('acesso_app', true);
    end if;
  elsif old.user_id is distinct from new.user_id then
    new.config := coalesce(new.config, '{}'::jsonb) || jsonb_build_object('acesso_app', true);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pacientes_login_acesso_app on {schema}.pacientes;
create trigger trg_pacientes_login_acesso_app before insert or update of user_id on {schema}.pacientes
  for each row execute function {schema}.w14_login_liga_acesso_app();

-- a migração da P15 (idempotente: só quem tem login e ainda não tem a chave; quem o profissional desligou continua desligado).
-- O "Modificado em" do aluno não muda: o gatilho do updated_at fica desligado só durante este update (mesma transação).
alter table {schema}.pacientes disable trigger trg_pacientes_updated_at;
update {schema}.pacientes
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('acesso_app', true)
 where user_id is not null and not (coalesce(config, '{}'::jsonb) ? 'acesso_app');
alter table {schema}.pacientes enable trigger trg_pacientes_updated_at;

-- ============================================================================================================
-- 2. WhatsApp automático: só quem tem "mensagens automáticas" LIGADO (R12) — o enfileirador da W50 do Nutri (5 momentos do
--    paciente; o lembrete da assinatura da PRÓPRIA profissional não é de paciente e segue igual) e a confirmação ao agendar
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
         and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false)
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
    from pacientes pa where pa.id = new.paciente_id and pa.deleted_at is null and pa.ativo
     and {schema}.w14_ajuste(pa.config, 'mensagens_automaticas', false);
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

-- ============================================================================================================
-- 3. Diário alimentar (R12 + F1/R13): o link público /d/ e a foto do app respeitam os ajustes
-- ============================================================================================================
create or replace function {schema}.diario_paciente(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = {schema}, public
as $$
  select jsonb_build_object(
    'paciente_id', p.id,
    'nutricionista_id', p.nutricionista_id,
    'nome', coalesce(nullif(trim(p.apelido), ''), split_part(trim(p.nome), ' ', 1))
  )
  from pacientes p
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    -- W14 (R12): o link público só abre com o envio pelo link e o diário ligados (desligado = o link não abre)
    and {schema}.w14_ajuste(p.config, 'acesso_link', true)
    and {schema}.w14_ajuste(p.config, 'diario_alimentar', true)
  limit 1;
$$;
revoke all on function {schema}.diario_paciente(text) from public;
grant execute on function {schema}.diario_paciente(text) to anon, authenticated;

create or replace function {schema}.diario_listar(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = {schema}, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'data_hora', d.data_hora,
      'refeicao', d.refeicao,
      'comentario', d.comentario,
      'reacao_nutri', d.reacao_nutri,
      'comentario_nutri', d.comentario_nutri,
      'reagido_em', d.reagido_em
    ) order by d.data_hora desc, d.created_at desc), '[]'::jsonb)
  from diario_alimentar d
  join pacientes p on p.id = d.paciente_id
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    and {schema}.w14_ajuste(p.config, 'acesso_link', true)
    and {schema}.w14_ajuste(p.config, 'diario_alimentar', true)
    and d.deleted_at is null
    and d.data_hora >= (((now() at time zone 'America/Sao_Paulo')::date - 6)::timestamp at time zone 'America/Sao_Paulo');
$$;
revoke all on function {schema}.diario_listar(text) from public;
grant execute on function {schema}.diario_listar(text) to anon, authenticated;

create or replace function {schema}.diario_enviar(p_codigo text, p_path text, p_mime text, p_tamanho bigint, p_refeicao text, p_comentario text, p_data_hora timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  pac record;
  v_path text := trim(coalesce(p_path, ''));
  v_data timestamptz := coalesce(p_data_hora, now());
  v_comentario text := left(trim(coalesce(p_comentario, '')), 500);
  v_mime text := lower(trim(coalesce(p_mime, '')));
  v_qtd integer;
  v_id uuid;
begin
  select id, nutricionista_id, user_id, config into pac
    from pacientes
   where link_codigo = lower(trim(coalesce(p_codigo, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'codigo_invalido';
  end if;
  -- W14 (R12, spec 9): diário desligado pelo profissional recusa (no app e no link); pelo link (sem ser o próprio aluno
  -- logado) também precisa do "envio de fotos pelo link" ligado
  if not {schema}.w14_ajuste(pac.config, 'diario_alimentar', true) then
    raise exception using errcode = 'P0001', message = 'diario_desligado';
  end if;
  if (auth.uid() is null or pac.user_id is distinct from auth.uid()) and not {schema}.w14_ajuste(pac.config, 'acesso_link', true) then
    raise exception using errcode = 'P0001', message = 'link_desligado';
  end if;
  if p_refeicao is null or p_refeicao not in ('cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro') then
    raise exception using errcode = 'P0001', message = 'refeicao_invalida';
  end if;
  if v_path !~ ('^' || pac.nutricionista_id::text || '/' || pac.id::text || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception using errcode = 'P0001', message = 'path_invalido';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'diario' and o.name = v_path) then
    raise exception using errcode = 'P0001', message = 'arquivo_nao_encontrado';
  end if;
  if v_mime = '' or v_mime not like 'image/%' or p_tamanho is null or p_tamanho <= 0 or p_tamanho > 10485760 then
    raise exception using errcode = 'P0001', message = 'arquivo_invalido';
  end if;
  if v_data > now() + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'data_invalida';
  end if;
  select count(*) into v_qtd
    from diario_alimentar
   where paciente_id = pac.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception using errcode = 'P0001', message = 'muitos_envios';
  end if;
  insert into diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario)
  values (pac.nutricionista_id, pac.id, v_data, p_refeicao, v_path, v_mime, p_tamanho, v_comentario)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'data_hora', v_data);
end;
$$;
revoke all on function {schema}.diario_enviar(text, text, text, bigint, text, text, timestamptz) from public;
grant execute on function {schema}.diario_enviar(text, text, text, bigint, text, text, timestamptz) to anon, authenticated;

-- ============================================================================================================
-- 4. App do aluno: a situação leva o "acesso ao app" de cada matrícula (trava GateAcessoApp) e a dieta leva o diário
-- ============================================================================================================
create or replace function {schema}.minha_situacao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_app jsonb;
  v_meta jsonb;
  v_perfil record;
  v_master boolean;
  v_calc boolean;
  v_contas jsonb;
  v_matriculas jsonb;
  v_modulos text[];
  v_precisa_treino boolean;
  v_nutri boolean;
  v_legado_nutri jsonb;
  v_aviso_cfg jsonb;
  v_publico text;
  v_aviso jsonb;
  v_conta_app uuid := {schema}.conta_do_app();
begin
  if v_uid is null then
    return null;
  end if;
  select u.email, coalesce(u.raw_app_meta_data, '{}'::jsonb), coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_app, v_meta from auth.users u where u.id = v_uid;
  select p.nome, p.role, p.teste_ate, p.pago_ate, p.isento_assinatura, coalesce(p.config, '{}'::jsonb) as config,
         nullif(btrim(p.dados_profissionais ->> 'foto_url'), '') as foto  -- W5: a foto do Perfil
    into v_perfil from {schema}.profiles p where p.id = v_uid;
  v_master := coalesce(v_app ->> 'role', '') = 'master' or coalesce(v_perfil.role, '') = 'master';
  -- veio do Calc: marcado pelo script 01 (app_metadata.calc / origem = 'calc')
  v_calc := coalesce(v_app ->> 'calc', '') = 'true' or coalesce(v_app ->> 'origem', '') = 'calc';

  -- contas em que é membro ativo (as com Treino primeiro: o painel de hoje é o do Calc), com papéis e números do menu
  select coalesce(jsonb_agg(x.j order by x.eh_app, x.tem_treino desc, x.dono desc, x.nome), '[]'::jsonb) into v_contas from (
    select c.nome, (c.origem = 'app') as eh_app, ('treino' = any({schema}.modulos_do_plano(c.plano))) as tem_treino, ('dono' = any(m.papeis)) as dono,
      jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
        'modulos', to_jsonb({schema}.modulos_do_plano(c.plano)), 'faixa', c.faixa, 'periodicidade', c.periodicidade,
        'situacao', c.situacao, 'teste_ate', c.teste_ate, 'vence_em', c.vence_em, 'tolerancia_dias', c.tolerancia_dias,
        'cobranca_legada', c.cobranca_legada, 'isenta_motivo', c.isenta_motivo,
        'alunos_bloqueados_em', c.alunos_bloqueados_em, 'alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'dono_id', c.dono_id,
        'dono_nome', (select coalesce(nullif(btrim(pd.nome), ''), pd.email) from {schema}.profiles pd where pd.id = c.dono_id),
        'membro_id', m.id, 'papeis', to_jsonb(m.papeis), 'codigo_convite', m.codigo_convite,
        'profissionais', (select count(*) from {schema}.conta_membros x where x.conta_id = c.id and x.status = 'ativo'),
        'alunos_ativos', {schema}.conta_alunos_ativos(c.id),
        'limite_alunos', {schema}.conta_limite_alunos(c.id),
        -- W4
        'assinatura', (select jsonb_build_object('status', a.status, 'proximo_vencimento', a.proximo_vencimento, 'valor', a.valor)
                         from {schema}.conta_assinaturas a where a.conta_id = c.id),
        'valor_mensal', {schema}.conta_preco(c.id, c.plano, c.faixa, 1)) as j
      from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo') x;

  -- matrículas (aluno): os módulos são os responsáveis que ele tem numa conta com aquele módulo (spec 4.1); no site
  -- antigo (sem conta) a nutricionista responsável vale como Nutrição. W7b: na conta do app, o plano manda (só a ativa).
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) into v_matriculas
  from (
    select p.created_at as criado,
      jsonb_build_object(
        'id', p.id, 'conta_id', p.conta_id, 'conta_nome', c.nome, 'conta_origem', c.origem, 'ativo', p.ativo,
        'origem', p.origem, 'modulos', to_jsonb(case
            when c.origem = 'app' then case when p.ativo then coalesce(
                (select array(select md from unnest(pa.modulos) md where md in ('treino', 'nutricao'))
                   from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id), array['treino']::text[]) else array[]::text[] end
            else array_remove(array[
              case when p.personal_id is not null and p.conta_id is not null and 'treino' = any({schema}.modulos_do_plano(c.plano)) then 'treino' end,
              case when p.nutricionista_id is not null and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))) then 'nutricao' end
            ], null) end),
        'bloqueada', p.acesso_bloqueado_em is not null, 'bloqueio_msg', p.acesso_bloqueado_msg,
        -- W14 (R12, P15): o ajuste "acesso ao app" desta matrícula (sem a chave = ligado: quem tem login)
        'acesso_app', {schema}.w14_ajuste(p.config, 'acesso_app', true),
        'bloqueado_por_pagamento', p.bloqueado_por_pagamento,
        'conta_alunos_bloqueados_em', c.alunos_bloqueados_em, 'conta_alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'personal', case when p.personal_id is null then null else jsonb_build_object('id', p.personal_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id)) end,
        'nutricionista', case when p.nutricionista_id is null then null else jsonb_build_object('id', p.nutricionista_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id)) end,
        -- W7b: aluno sem profissional (conta do app)
        'app', coalesce(c.origem = 'app', false),
        'app_plano', case when c.origem = 'app' then (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id) end,
        'objetivo_app', p.objetivo_app,
        'teste_ate', case when c.origem = 'app' then p.app_teste_ate end
      ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = v_uid and p.deleted_at is null
  ) x;
  -- módulos do aluno = a união dos módulos das matrículas
  select coalesce(array_agg(distinct m.valor), array[]::text[]) into v_modulos
    from jsonb_array_elements(v_matriculas) e, jsonb_array_elements_text(e -> 'modulos') as m(valor);

  -- precisa da sessão do Banco do Treino (spec 7.4, passo 3): master, personal ou dono de conta com Treino, aluno com Treino
  -- ou quem veio do Calc (tem treino guardado lá)
  v_precisa_treino := v_master or v_calc or 'treino' = any(v_modulos) or exists (
    select 1 from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo' and 'treino' = any({schema}.modulos_do_plano(c.plano))
       and (m.papeis && array['dono', 'personal']));

  -- legado do Nutri: a trava de assinatura de hoje (assinaturaUtil.ts do site antigo) para quem é nutricionista/master lá
  v_nutri := coalesce(v_perfil.role, '') in ('nutricionista', 'master') or exists (
    select 1 from jsonb_array_elements(v_contas) e where e ->> 'origem' = 'legado_nutri');
  if v_nutri then
    select jsonb_build_object(
        'role', v_perfil.role, 'teste_ate', v_perfil.teste_ate, 'pago_ate', v_perfil.pago_ate,
        'isento_assinatura', coalesce(v_perfil.isento_assinatura, false),
        'assinatura', (select jsonb_build_object('status', a.status, 'valor', a.valor, 'proximo_vencimento', a.proximo_vencimento)
                         from {schema}.assinaturas a where a.nutricionista_id = v_uid order by a.updated_at desc nulls last limit 1))
      into v_legado_nutri;
  end if;

  -- aviso "o Physiq mudou" (NF14): texto do público de quem entra (Calc primeiro) — liga/desliga em app_config
  select a.valor into v_aviso_cfg from {schema}.app_config a where a.chave = 'aviso_mudanca';
  v_publico := case when v_calc then 'calc'
                    when coalesce(v_perfil.role, '') in ('nutricionista', 'paciente', 'master')
                      or exists (select 1 from jsonb_array_elements(v_matriculas) e where e ->> 'conta_origem' = 'legado_nutri' or e ->> 'origem' = 'nutri')
                      or v_nutri then 'nutri'
                    else null end;
  if v_aviso_cfg is not null and v_publico is not null then
    v_aviso := jsonb_build_object(
      'publico', v_publico,
      'ativo', coalesce((v_aviso_cfg ->> 'ativo')::boolean, false) and coalesce((v_aviso_cfg -> v_publico ->> 'ativo')::boolean, false),
      'titulo', v_aviso_cfg -> v_publico ->> 'titulo',
      'texto', v_aviso_cfg -> v_publico ->> 'texto',
      'versao', coalesce(v_aviso_cfg ->> 'versao', '1'),
      'visto', (v_perfil.config -> 'aviso_mudanca_visto' ->> coalesce(v_aviso_cfg ->> 'versao', '1')) is not null);
  end if;

  return jsonb_build_object(
    'versao', 1,
    'user_id', v_uid,
    'email', v_email,
    'nome', coalesce(nullif(btrim(v_perfil.nome), ''), v_meta ->> 'full_name', v_meta ->> 'name', split_part(coalesce(v_email, ''), '@', 1)),
    'foto_url', coalesce(v_perfil.foto, v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    'master', v_master,
    'papel_legado', v_perfil.role,
    'calc', v_calc,
    'contas', v_contas,
    'matriculas', v_matriculas,
    'modulos_aluno', to_jsonb(coalesce(v_modulos, array[]::text[])),
    'precisa_treino', v_precisa_treino,
    -- W7b: sem conta e sem matrícula → Boas-vindas (código do profissional, "Treinar sem profissional" ou "Sou profissional")
    'sem_nada', not v_master and jsonb_array_length(v_contas) = 0 and jsonb_array_length(v_matriculas) = 0,
    'legado_nutri', v_legado_nutri,
    'aviso_mudanca', v_aviso,
    'conta_app', v_conta_app,
    'gerado_em', now());
end;
$$;

create or replace function {schema}.minha_dieta(p_dia date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_ids uuid[];
begin
  if v_uid is null then
    return null;
  end if;
  -- as matrículas com Nutrição (a mesma regra de módulo da minha_situacao/minha_evolucao: nutricionista responsável numa conta
  -- com Nutrição, ou o site antigo sem conta); login desativado (banned) = nenhuma
  select coalesce(array_agg(p.id order by p.created_at), array[]::uuid[]) into v_ids
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    join auth.users u on u.id = p.user_id
   where p.user_id = v_uid and p.deleted_at is null and p.nutricionista_id is not null
     and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano)))
     and (u.banned_until is null or u.banned_until <= now());

  return jsonb_build_object(
    'hoje', v_hoje,
    'dia', v_dia,
    'matriculas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nome', p.nome,
               'conta_id', p.conta_id,
               'conta_nome', c.nome,
               'ativo', p.ativo,
               'link_codigo', p.link_codigo,
               -- W14 (R12): o diário alimentar desta matrícula (desligado = a aba Dieta não oferece a foto)
               'diario_alimentar', {schema}.w14_ajuste(p.config, 'diario_alimentar', true),
               'nutricionista', jsonb_build_object(
                 'id', p.nutricionista_id,
                 'nome', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                            from {schema}.profiles pr where pr.id = p.nutricionista_id),
                 'foto_url', (select coalesce(nullif(btrim(coalesce(pr.dados_profissionais ->> 'foto_url', '')), ''),
                                              un.raw_user_meta_data ->> 'avatar_url', un.raw_user_meta_data ->> 'picture')
                                from {schema}.profiles pr left join auth.users un on un.id = pr.id
                               where pr.id = p.nutricionista_id)))
             order by p.created_at)
        from {schema}.pacientes p
        left join {schema}.contas c on c.id = p.conta_id
       where p.id = any(v_ids)), '[]'::jsonb),
    'planos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pl.id,
               'paciente_id', pl.paciente_id,
               'nutricionista_id', pl.nutricionista_id,
               'titulo', pl.titulo,
               'metodo', pl.metodo,
               'kcal_alvo', pl.kcal_alvo,
               'observacao', pl.observacao,
               'favorito', pl.favorito,
               'created_at', pl.created_at,
               'updated_at', pl.updated_at,
               'refeicoes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', r.id,
                          'nome', r.nome,
                          'horario', r.horario,
                          'ordem', r.ordem,
                          'observacao', r.observacao,
                          'dias_semana', to_jsonb(r.dias_semana),
                          'itens', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', i.id,
                                     'alimento_id', i.alimento_id,
                                     'quantidade_g', i.quantidade_g,
                                     'medida_caseira_id', i.medida_caseira_id,
                                     'quantidade_medida', i.quantidade_medida,
                                     'ordem', i.ordem,
                                     'substitutos', i.substitutos,
                                     'observacao', i.observacao,
                                     'created_at', i.created_at,
                                     'alimento', (
                                       select jsonb_build_object(
                                                'id', a.id, 'nome', a.nome, 'fonte', a.fonte, 'grupo', a.grupo,
                                                'energia_kcal', a.energia_kcal, 'proteina_g', a.proteina_g,
                                                'carboidrato_g', a.carboidrato_g, 'lipidio_g', a.lipidio_g,
                                                'fibra_g', a.fibra_g, 'sodio_mg', a.sodio_mg,
                                                'medidas_caseiras', coalesce((
                                                  select jsonb_agg(jsonb_build_object('id', m.id, 'descricao', m.descricao,
                                                                                      'gramas', m.gramas, 'ordem', m.ordem))
                                                    from {schema}.medidas_caseiras m
                                                   where m.id = i.medida_caseira_id and m.alimento_id = a.id), '[]'::jsonb))
                                         from {schema}.alimentos a where a.id = i.alimento_id))
                                   order by i.ordem, i.created_at)
                              from {schema}.itens_refeicao i where i.refeicao_id = r.id), '[]'::jsonb))
                        order by r.ordem, r.horario nulls last, r.nome)
                   from {schema}.refeicoes r where r.plano_id = pl.id), '[]'::jsonb))
             order by pl.created_at desc)
        from {schema}.planos_alimentares pl
       where pl.paciente_id = any(v_ids) and pl.deleted_at is null), '[]'::jsonb),
    'orientacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'paciente_id', o.paciente_id, 'titulo', o.titulo, 'conteudo', o.conteudo,
               'created_at', o.created_at, 'updated_at', o.updated_at)
             order by o.created_at desc)
        from {schema}.orientacoes o
       where o.paciente_id = any(v_ids) and o.deleted_at is null), '[]'::jsonb),
    'metas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'paciente_id', m.paciente_id, 'titulo', m.titulo, 'descricao', m.descricao,
               'dias_semana', to_jsonb(m.dias_semana), 'ativa', m.ativa, 'inicio', m.inicio,
               'created_at', m.created_at, 'updated_at', m.updated_at)
             order by m.created_at)
        from {schema}.metas m
       where m.paciente_id = any(v_ids) and m.deleted_at is null), '[]'::jsonb),
    'refeicoes_concluidas', coalesce((
      select jsonb_agg(rc.refeicao_id order by rc.created_at)
        from {schema}.refeicoes_concluidas rc
       where rc.paciente_id = any(v_ids) and rc.data = v_dia), '[]'::jsonb),
    'metas_concluidas', coalesce((
      select jsonb_agg(mc.meta_id order by mc.criado_em)
        from {schema}.metas_concluidas mc
       where mc.paciente_id = any(v_ids) and mc.data = v_dia), '[]'::jsonb),
    -- os últimos 7 dias (a partir da meia-noite de São Paulo de hoje − 6 dias), como o diario_listar do site antigo — agora com o
    -- arquivo (a foto é do próprio aluno; P29)
    'diario', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'paciente_id', d.paciente_id, 'data_hora', d.data_hora, 'refeicao', d.refeicao,
               'comentario', d.comentario, 'reacao_nutri', d.reacao_nutri, 'comentario_nutri', d.comentario_nutri,
               'reagido_em', d.reagido_em, 'path', d.path)
             order by d.data_hora desc, d.created_at desc)
        from {schema}.diario_alimentar d
       where d.paciente_id = any(v_ids) and d.deleted_at is null
         and d.data_hora >= ((v_hoje - 6)::timestamp at time zone 'America/Sao_Paulo')), '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.minha_dieta(date) from public, anon;
grant execute on function {schema}.minha_dieta(date) to authenticated, service_role;

-- ============================================================================================================
-- 5. Espelho no Treino: o cadastro (nome, sexo, nascimento) também (C33, spec 8.3)
-- ============================================================================================================
create or replace function {schema}.pacientes_espelho_responsaveis() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and (
       new.personal_id is distinct from old.personal_id or new.conta_id is distinct from old.conta_id
    or new.ativo is distinct from old.ativo or new.deleted_at is distinct from old.deleted_at
    or new.acesso_bloqueado_em is distinct from old.acesso_bloqueado_em or new.user_id is distinct from old.user_id
    -- W14 (C33): o cadastro (nome, sexo, nascimento) também vai para o Banco do Treino
    or new.nome is distinct from old.nome or new.genero is distinct from old.genero or new.nascimento is distinct from old.nascimento) then
    insert into {schema}.espelho_pendencias (tipo, payload) values ('pessoa', jsonb_build_object('principal_user_id', new.user_id));
  end if;
  return null;
end;
$$;

-- ============================================================================================================
-- 6. Perfil do aluno no painel (Resumo e cabeçalho — tela 7)
-- ============================================================================================================
-- quem edita o cadastro e os ajustes: master, dono da conta, o responsável (W13) e a nutricionista dona do registro (site antigo)
create or replace function {schema}.w14_pode_editar(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or {schema}.w13_pode_gerir(p_paciente) or exists (
    select 1 from {schema}.pacientes p where p.id = p_paciente and p.deleted_at is null and p.nutricionista_id = auth.uid());
$$;
revoke execute on function {schema}.w14_pode_editar(uuid) from public, anon;
grant execute on function {schema}.w14_pode_editar(uuid) to authenticated, service_role;

-- a matrícula da rota do painel (/painel/alunos/:id — o id dela ou o do Treino), entre as que quem chama pode ver
create or replace function {schema}.w14_matricula_da_rota(p_aluno uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
  v_existe boolean := false;
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  for v_id in
    select p.id from {schema}.pacientes p
     where (p.id = p_aluno or p.treino_user_id = p_aluno) and p.deleted_at is null
     order by p.ativo desc, p.created_at
  loop
    v_existe := true;
    if {schema}.pode_mexer_no_acesso(v_id) then
      return v_id;
    end if;
  end loop;
  raise exception '%', case when v_existe then 'sem_acesso' else 'aluno_inexistente' end;
end;
$$;
revoke execute on function {schema}.w14_matricula_da_rota(uuid) from public, anon;
grant execute on function {schema}.w14_matricula_da_rota(uuid) to authenticated, service_role;

-- tudo o que o cabeçalho e os cards de dados/ajustes/link/resumo mostram (erros: sem_login, sem_acesso, aluno_inexistente)
create or replace function {schema}.aluno_perfil(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
  v_c {schema}.contas%rowtype;
begin
  select * into v_p from {schema}.pacientes where id = v_id;
  select * into v_c from {schema}.contas where id = v_p.conta_id;
  return jsonb_build_object(
    'ok', true,
    'paciente_id', v_p.id,
    'treino_user_id', v_p.treino_user_id,
    'rota_id', coalesce(v_p.treino_user_id, v_p.id),
    'conta_id', v_p.conta_id,
    'conta_nome', v_c.nome,
    'conta_origem', v_c.origem,
    'conta_modulos', to_jsonb(coalesce({schema}.modulos_do_plano(v_c.plano), array[]::text[])),
    'nome', v_p.nome,
    'apelido', v_p.apelido,
    'email', v_p.email,
    'telefone', v_p.telefone,
    'cpf', v_p.cpf,
    'nascimento', v_p.nascimento,
    'genero', v_p.genero,
    'objetivo', nullif(btrim(coalesce(v_p.objetivo, '')), ''),
    'objetivo_app', v_p.objetivo_app,
    'tags', to_jsonb(coalesce(v_p.tags, array[]::text[])),
    'foto_url', {schema}.w13_foto_do_aluno(v_p.foto_url, v_p.user_id),
    'criado_em', v_p.created_at,
    'atualizado_em', v_p.updated_at,
    'ativo', v_p.ativo,
    'bloqueado', v_p.acesso_bloqueado_em is not null,
    'bloqueado_em', v_p.acesso_bloqueado_em,
    'bloqueio_msg', v_p.acesso_bloqueado_msg,
    'conta_excluida', coalesce(v_p.config, '{}'::jsonb) ? 'conta_excluida_em',
    'origem', v_p.origem,
    'tem_login', v_p.user_id is not null,
    -- os módulos do aluno (a regra da minha_situacao: responsáveis numa conta com o módulo; na conta do app, o plano dele)
    'modulos', to_jsonb(case
        when v_c.origem = 'app' then case when v_p.ativo then coalesce(
            (select array(select md from unnest(pa.modulos) md where md in ('treino', 'nutricao'))
               from {schema}.planos_aluno pa where pa.id = v_p.plano_aluno_id), array['treino']::text[]) else array[]::text[] end
        else coalesce({schema}.w13_modulos_do_aluno(v_p.personal_id, v_p.nutricionista_id, v_c.plano), array[]::text[]) end),
    'personal', case when v_p.personal_id is null then null
                     else jsonb_build_object('id', v_p.personal_id, 'nome', {schema}.nome_da_pessoa(v_p.personal_id)) end,
    'nutricionista', case when v_p.nutricionista_id is null then null
                          else jsonb_build_object('id', v_p.nutricionista_id, 'nome', {schema}.nome_da_pessoa(v_p.nutricionista_id)) end,
    'ajustes', {schema}.ajustes_do_aluno(v_p.config, v_p.user_id is not null),
    'link_codigo', v_p.link_codigo,
    'resumo', v_p.resumo,
    'ultima_antropometria', (
      select jsonb_build_object('data', a.data, 'peso', a.peso, 'altura', a.altura)
        from {schema}.antropometrias a
       where a.paciente_id = v_p.id and a.deleted_at is null
       order by a.data desc, a.created_at desc limit 1),
    'eu', jsonb_build_object(
      'id', v_uid,
      'dono', {schema}.eh_master() or (v_p.conta_id is not null and {schema}.sou_dono(v_p.conta_id)),
      'personal', v_p.conta_id is not null and {schema}.tenho_papel(v_p.conta_id, 'personal'),
      'nutricionista', v_p.conta_id is not null and {schema}.tenho_papel(v_p.conta_id, 'nutricionista'),
      'master', {schema}.eh_master()),
    'pode_editar', {schema}.w14_pode_editar(v_p.id),
    'agora', now());
end;
$$;
revoke execute on function {schema}.aluno_perfil(uuid) from public, anon;
grant execute on function {schema}.aluno_perfil(uuid) to authenticated, service_role;

-- cadastro (C33) + resumo privado (N-27). Só as chaves que vierem mudam. Devolve { ok, perfil } ou { ok: false, erro }.
-- nome/sexo/nascimento → o gatilho do espelho enfileira e o espelho_disparar() leva ao Banco do Treino (quem já tem vínculo).
create or replace function {schema}.aluno_salvar_dados(p_aluno uuid, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_nome text;
  v_apelido text;
  v_nasc date;
  v_genero text;
  v_cpf text;
  v_tel text;
  v_email text;
  v_objetivo text;
  v_resumo text;
begin
  if jsonb_typeof(d) <> 'object' then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  select * into v_p from {schema}.pacientes where id = v_id for update;

  v_nome := case when d ? 'nome' then left(regexp_replace(btrim(coalesce(d ->> 'nome', '')), '\s+', ' ', 'g'), 120) else v_p.nome end;
  if d ? 'nome' and (v_nome is null or length(v_nome) < 2) then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  v_apelido := case when d ? 'apelido' then nullif(left(btrim(coalesce(d ->> 'apelido', '')), 40), '') else v_p.apelido end;
  if d ? 'nascimento' then
    if nullif(btrim(coalesce(d ->> 'nascimento', '')), '') is null then
      v_nasc := null;
    elsif (d ->> 'nascimento') !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    else
      begin
        v_nasc := (d ->> 'nascimento')::date;
      exception when others then
        return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
      end;
      if v_nasc < date '1900-01-01' or v_nasc > (now() at time zone 'America/Sao_Paulo')::date then
        return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
      end if;
    end if;
  else
    v_nasc := v_p.nascimento;
  end if;
  v_genero := case when d ? 'genero' then nullif(btrim(coalesce(d ->> 'genero', '')), '') else v_p.genero end;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then
    return jsonb_build_object('ok', false, 'erro', 'genero_invalido');
  end if;
  v_cpf := case when d ? 'cpf' then nullif(regexp_replace(coalesce(d ->> 'cpf', ''), '\D', '', 'g'), '') else v_p.cpf end;
  if d ? 'cpf' and v_cpf is not null and length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'cpf_invalido'); end if;
  v_tel := case when d ? 'telefone' then nullif(regexp_replace(coalesce(d ->> 'telefone', ''), '\D', '', 'g'), '') else v_p.telefone end;
  if d ? 'telefone' and v_tel is not null and length(v_tel) not between 10 and 13 then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  end if;
  v_email := case when d ? 'email' then nullif(lower(btrim(coalesce(d ->> 'email', ''))), '') else v_p.email end;
  if d ? 'email' and v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  v_objetivo := case when d ? 'objetivo' then nullif(left(btrim(coalesce(d ->> 'objetivo', '')), 60), '') else v_p.objetivo end;
  v_resumo := case when d ? 'resumo' then nullif(left(btrim(coalesce(d ->> 'resumo', '')), 4000), '') else v_p.resumo end;

  update {schema}.pacientes
     set nome = v_nome, apelido = v_apelido, nascimento = v_nasc, genero = v_genero, cpf = v_cpf, telefone = v_tel,
         email = v_email, objetivo = v_objetivo, resumo = v_resumo
   where id = v_id;
  if v_p.user_id is not null and (v_nome is distinct from v_p.nome or v_genero is distinct from v_p.genero or v_nasc is distinct from v_p.nascimento) then
    perform {schema}.espelho_disparar();
  end if;
  return jsonb_build_object('ok', true, 'perfil', {schema}.aluno_perfil(v_id));
end;
$$;
revoke execute on function {schema}.aluno_salvar_dados(uuid, jsonb) from public, anon;
grant execute on function {schema}.aluno_salvar_dados(uuid, jsonb) to authenticated, service_role;

-- os 4 ajustes (R12): só as chaves conhecidas, só booleanos. Devolve { ok, ajustes } (os valendo) ou { ok: false, erro }.
create or replace function {schema}.aluno_salvar_ajustes(p_aluno uuid, p_ajustes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
  v_chave text;
  v_novo jsonb := '{}'::jsonb;
begin
  if p_ajustes is null or jsonb_typeof(p_ajustes) <> 'object' or p_ajustes = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'erro', 'ajuste_invalido');
  end if;
  for v_chave in select jsonb_object_keys(p_ajustes) loop
    if v_chave not in ('acesso_app', 'mensagens_automaticas', 'diario_alimentar', 'acesso_link') or jsonb_typeof(p_ajustes -> v_chave) <> 'boolean' then
      return jsonb_build_object('ok', false, 'erro', 'ajuste_invalido');
    end if;
    v_novo := v_novo || jsonb_build_object(v_chave, (p_ajustes ->> v_chave)::boolean);
  end loop;
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  update {schema}.pacientes set config = coalesce(config, '{}'::jsonb) || v_novo where id = v_id
  returning * into v_p;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'ajustes', {schema}.ajustes_do_aluno(v_p.config, v_p.user_id is not null));
end;
$$;
revoke execute on function {schema}.aluno_salvar_ajustes(uuid, jsonb) from public, anon;
grant execute on function {schema}.aluno_salvar_ajustes(uuid, jsonb) to authenticated, service_role;

-- link do diário novo (o anterior deixa de valer) — o mesmo alfabeto do site antigo (sem 0/O/1/l/i)
create or replace function {schema}.aluno_novo_link(p_aluno uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_alfa constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_codigo text;
  v_i integer;
  v_tentativa integer := 0;
begin
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  loop
    v_tentativa := v_tentativa + 1;
    v_bytes := extensions.gen_random_bytes(10);
    v_codigo := '';
    for v_i in 0..9 loop
      v_codigo := v_codigo || substr(v_alfa, (get_byte(v_bytes, v_i) % length(v_alfa)) + 1, 1);
    end loop;
    begin
      update {schema}.pacientes set link_codigo = v_codigo where id = v_id;
      exit;
    exception when unique_violation then
      if v_tentativa >= 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'link_codigo', v_codigo);
end;
$$;
revoke execute on function {schema}.aluno_novo_link(uuid) from public, anon;
grant execute on function {schema}.aluno_novo_link(uuid) to authenticated, service_role;

-- ============================================================================================================
-- 7. Aviso único da P15 ao profissional: "X pacientes estão com as mensagens automáticas desligadas" + "Ligar para todos"
--    X = a lista que o aviso mostra (número = tela): os pacientes do WhatsApp dele (nutricionista_id, a regra do enfileirador),
--    ativos, com telefone que dá para mandar e com o ajuste desligado. Só para quem já tem o WhatsApp no Physiq (instância) e
--    ainda não fechou o aviso (profiles.config.aviso_mensagens_w14).
-- ============================================================================================================
create or replace function {schema}.mensagens_desligadas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_visto jsonb;
  v_alunos jsonb;
  v_whats boolean;
begin
  if v_uid is null then return null; end if;
  v_whats := exists (select 1 from {schema}.whatsapp_instancias w where w.nutricionista_id = v_uid);
  select pr.config -> 'aviso_mensagens_w14' into v_visto from {schema}.profiles pr where pr.id = v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'rota_id', coalesce(p.treino_user_id, p.id), 'nome', p.nome, 'telefone', p.telefone)
                            order by lower(p.nome), p.id), '[]'::jsonb)
    into v_alunos
    from {schema}.pacientes p
   where p.nutricionista_id = v_uid and p.deleted_at is null and p.ativo
     and {schema}.whatsapp_destino(p.telefone) is not null
     and not {schema}.w14_ajuste(p.config, 'mensagens_automaticas', false);
  return jsonb_build_object(
    'mostrar', v_whats and v_visto is null and jsonb_array_length(v_alunos) > 0,
    'whatsapp', v_whats,
    'visto', v_visto,
    'total', jsonb_array_length(v_alunos),
    'alunos', v_alunos);
end;
$$;
revoke execute on function {schema}.mensagens_desligadas() from public, anon;
grant execute on function {schema}.mensagens_desligadas() to authenticated, service_role;

-- liga as mensagens de exatamente os ids que a lista do aviso mostrou (e que ainda cumprem a regra) e fecha o aviso
create or replace function {schema}.mensagens_ligar_para_todos(p_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then return jsonb_build_object('ok', false, 'erro', 'selecao_invalida'); end if;
  update {schema}.pacientes p
     set config = coalesce(p.config, '{}'::jsonb) || jsonb_build_object('mensagens_automaticas', true)
   where p.id = any(p_ids) and p.nutricionista_id = v_uid and p.deleted_at is null and p.ativo
     and {schema}.whatsapp_destino(p.telefone) is not null
     and not {schema}.w14_ajuste(p.config, 'mensagens_automaticas', false);
  get diagnostics v_n = row_count;
  update {schema}.profiles
     set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('aviso_mensagens_w14', jsonb_build_object('em', now(), 'acao', 'ligar_todos', 'ligados', v_n))
   where id = v_uid;
  return jsonb_build_object('ok', true, 'ligados', v_n);
end;
$$;
revoke execute on function {schema}.mensagens_ligar_para_todos(uuid[]) from public, anon;
grant execute on function {schema}.mensagens_ligar_para_todos(uuid[]) to authenticated, service_role;

create or replace function {schema}.mensagens_aviso_fechar() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  update {schema}.profiles
     set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('aviso_mensagens_w14', jsonb_build_object('em', now(), 'acao', 'fechar'))
   where id = v_uid and not (coalesce(config, '{}'::jsonb) ? 'aviso_mensagens_w14');
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function {schema}.mensagens_aviso_fechar() from public, anon;
grant execute on function {schema}.mensagens_aviso_fechar() to authenticated, service_role;

-- @@ compartilhado
-- Storage (o bucket "diario" é um só para os 2 schemas): a foto só sobe com o diário ligado e, pelo link, com o envio pelo link
create or replace function public.diario_pasta_valida(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  partes text[] := storage.foldername(p_name);
  v_nutri uuid;
  v_pac uuid;
begin
  if p_name is null or array_length(partes, 1) is distinct from 2 then
    return false;
  end if;
  begin
    v_nutri := partes[1]::uuid;
    v_pac := partes[2]::uuid;
  exception when others then
    return false;
  end;
  if storage.filename(p_name) !~ '^[0-9a-f-]{36}\.[a-z0-9]{2,5}$' then
    return false;
  end if;
  -- W14 (R12): com o diário desligado nada sobe; pelo link (sem ser o próprio aluno logado) só com o envio pelo link ligado.
  -- (Sem as funções w14_ajuste dos schemas: este bloco é único e roda antes de um dos schemas receber a W14.)
  return exists (select 1 from public.pacientes p where p.id = v_pac and p.nutricionista_id = v_nutri and p.ativo and p.deleted_at is null
                   and (case when jsonb_typeof(p.config -> 'diario_alimentar') = 'boolean' then (p.config ->> 'diario_alimentar')::boolean else true end)
                   and ((auth.uid() is not null and p.user_id = auth.uid())
                        or (case when jsonb_typeof(p.config -> 'acesso_link') = 'boolean' then (p.config ->> 'acesso_link')::boolean else true end)))
      or exists (select 1 from staging.pacientes p where p.id = v_pac and p.nutricionista_id = v_nutri and p.ativo and p.deleted_at is null
                   and (case when jsonb_typeof(p.config -> 'diario_alimentar') = 'boolean' then (p.config ->> 'diario_alimentar')::boolean else true end)
                   and ((auth.uid() is not null and p.user_id = auth.uid())
                        or (case when jsonb_typeof(p.config -> 'acesso_link') = 'boolean' then (p.config ->> 'acesso_link')::boolean else true end)));
end;
$$;
revoke all on function public.diario_pasta_valida(text) from public;
grant execute on function public.diario_pasta_valida(text) to anon, authenticated, service_role;
