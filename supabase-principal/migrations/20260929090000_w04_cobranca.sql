-- Physiq W4 — planos e cobrança das CONTAS NOVAS + cadastro de profissional, no BANCO PRINCIPAL (hkxvtsbwctxkrqzkkdoz).
-- Idempotente. Spec "Physiq Unificado - desenho aprovado" §6 (planos e cobrança), §4.2 (Sou profissional), §8.1, §8.3, §9,
-- §10.1 e P9–P13, P27.
--
-- Aplicar (backup ANTES, ver scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929090000_w04_cobranca.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929090000_w04_cobranca.sql --so public
--   (não há bloco compartilhado: as tarefas do pg_cron são por schema)
-- Depois, 1 vez: python3 e2e/w04/vault_espelho.py (guarda o ESPELHO_SEGREDO no Vault para o pg_net chamar a espelho-enviar;
-- sem ele a tarefa do espelho só não dispara — nada quebra).
--
-- O que muda e o que NÃO muda:
--   · só as contas NOVAS (origem 'nova', cobranca_legada = false) são cobradas e recalculadas aqui. Os legados (Calc e Nutri)
--     continuam pelas telas e regras de hoje até a W28 (P9) — nenhuma função abaixo mexe na situação deles;
--   · só ACRESCENTA: colunas novas opcionais, carga da tabela de preços/app_config que não sobrescreve o que o master mudou,
--     funções novas, um gatilho que só enfileira o espelho e as tarefas do pg_cron (03:40 e a fila do espelho);
--   · a minha_situacao() (W3) ganha 2 campos por conta (assinatura, valor_mensal) — o resto fica igual.

-- ============================================================================================================
-- 1. Perfil: "Personal trainer (Ed. Física)" entre os tipos de perfil do "Sou profissional" (spec 4.2)
-- ============================================================================================================
alter table {schema}.profiles drop constraint if exists profiles_tipo_perfil_check;
alter table {schema}.profiles add constraint profiles_tipo_perfil_check
  check (tipo_perfil is null or tipo_perfil in ('academico', 'nutricionista', 'outra_area', 'personal'));

-- ============================================================================================================
-- 2. A fatura e a assinatura guardam o plano que cobram (quem está no teste ou vencido escolhe o plano ao pagar; a cobrança
--    recorrente cobra o plano da assinatura — como o mp_preapproval_plano do Nativo OS)
-- ============================================================================================================
alter table {schema}.conta_faturas add column if not exists plano text
  check (plano is null or plano in ('treino', 'nutricao', 'treino_nutricao'));
alter table {schema}.conta_faturas add column if not exists faixa text
  check (faixa is null or faixa in ('f10', 'f30', 'f100', 'livre'));
alter table {schema}.conta_faturas add column if not exists meses integer check (meses is null or meses between 1 and 12);
alter table {schema}.conta_faturas add column if not exists descricao text;
create index if not exists conta_faturas_pendentes_idx on {schema}.conta_faturas (conta_id) where status in ('pending', 'in_process');
alter table {schema}.conta_assinaturas add column if not exists plano text
  check (plano is null or plano in ('treino', 'nutricao', 'treino_nutricao'));
alter table {schema}.conta_assinaturas add column if not exists faixa text
  check (faixa is null or faixa in ('f10', 'f30', 'f100', 'livre'));
create index if not exists conta_assinaturas_preapproval_idx on {schema}.conta_assinaturas (mp_preapproval_id);

-- ============================================================================================================
-- 3. Tabela de preços (6.1, 3A; anual = 10 mensalidades por 12 meses) e regras gerais (5A, P10). A carga NÃO sobrescreve
--    o que o master mudou depois (on conflict do nothing); o histórico sai pelo gatilho da W2.
-- ============================================================================================================
insert into {schema}.plano_precos (plano, faixa, min_alunos, max_alunos, valor_mensal, valor_anual, ordem) values
  ('treino',          'f10',    1,  10,   39.90,  399.00, 1),
  ('treino',          'f30',   11,  30,   79.90,  799.00, 2),
  ('treino',          'f100',  31, 100,  149.90, 1499.00, 3),
  ('treino',          'livre', 101, null, 300.00, 3000.00, 4),
  ('nutricao',        'f10',    1,  10,   39.90,  399.00, 1),
  ('nutricao',        'f30',   11,  30,   79.90,  799.00, 2),
  ('nutricao',        'f100',  31, 100,  149.90, 1499.00, 3),
  ('nutricao',        'livre', 101, null, 300.00, 3000.00, 4),
  ('treino_nutricao', 'f10',    1,  10,   59.90,  599.00, 1),
  ('treino_nutricao', 'f30',   11,  30,  119.90, 1199.00, 2),
  ('treino_nutricao', 'f100',  31, 100,  224.90, 2249.00, 3),
  ('treino_nutricao', 'livre', 101, null, 450.00, 4500.00, 4)
on conflict (plano, faixa) do nothing;

insert into {schema}.app_config (chave, valor, publica) values
  ('teste_dias', '14'::jsonb, true),
  ('teste_max_alunos', '10'::jsonb, true)
on conflict (chave) do nothing;

-- ============================================================================================================
-- 4. Funções da cobrança (regras de 6.2 — as mesmas de src/nucleo/cobranca, testadas no Vitest)
-- ============================================================================================================

-- hoje no relógio de São Paulo (o vencimento é por dia, no fuso da conta)
create or replace function {schema}.cobranca_hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- preço de um plano para a conta: o valor travado (preço especial marcado pelo master; nos legados, o preço de hoje — 6A)
-- ou a tabela de preços. p_meses = 12 → anual (10 mensalidades). null = plano/faixa sem preço ativo.
create or replace function {schema}.conta_preco(p_conta uuid, p_plano text, p_faixa text, p_meses integer default 1) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
    when c.valor_travado is not null then round(c.valor_travado * case when p_meses = 12 then 10 else 1 end, 2)
    else (select case when p_meses = 12 then coalesce(pp.valor_anual, round(pp.valor_mensal * 10, 2)) else pp.valor_mensal end
            from {schema}.plano_precos pp where pp.plano = p_plano and pp.faixa = p_faixa and pp.ativo)
  end
  from {schema}.contas c where c.id = p_conta;
$$;

-- quantos alunos ativos a faixa permite (null = sem limite): a tabela de preços, senão o padrão da faixa
create or replace function {schema}.plano_max_alunos(p_plano text, p_faixa text) returns integer
language sql stable security definer set search_path = '' as $$
  select case when p_faixa = 'livre' then null else coalesce(
    (select pp.max_alunos from {schema}.plano_precos pp where pp.plano = p_plano and pp.faixa = p_faixa),
    case p_faixa when 'f10' then 10 when 'f30' then 30 when 'f100' then 100 else null end) end;
$$;

-- código do profissional (?prof=PROF-NOME-SOBRENOME), o mesmo formato do physiq_gerar_codigo_professor do Calc, único
-- entre os membros do schema
create or replace function {schema}.gerar_codigo_membro(p_nome text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_base text;
  v_iniciais text;
  v_cand text;
  v_n integer := 0;
begin
  v_base := regexp_replace(upper(translate(btrim(coalesce(p_nome, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^A-Z0-9]+', '-', 'g');
  v_base := btrim(left(v_base, 40), '-');
  if v_base = '' then v_base := 'PROFISSIONAL'; end if;
  v_base := 'PROF-' || v_base;
  if not exists (select 1 from {schema}.conta_membros m where upper(m.codigo_convite) = v_base) then
    return v_base;
  end if;
  v_iniciais := (select string_agg(left(w, 1), '') from regexp_split_to_table(replace(v_base, 'PROF-', ''), '-') as w);
  v_cand := v_base || '-' || v_iniciais;
  while exists (select 1 from {schema}.conta_membros m where upper(m.codigo_convite) = v_cand) loop
    v_n := v_n + 1;
    v_cand := v_base || '-' || v_iniciais || v_n::text;
  end loop;
  return v_cand;
end;
$$;

-- dispara a fila do espelho (espelho-enviar → espelho-nucleo do Banco do Treino, spec 8.3) pelo pg_net — assíncrono: o pedido
-- sai depois do commit. Só chama quando há pendência pronta; sem pg_net ou sem o segredo no Vault, não faz nada.
create or replace function {schema}.espelho_disparar() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_segredo text;
  v_id bigint;
begin
  if not exists (select 1 from {schema}.espelho_pendencias e
                  where e.feito_em is null and e.tentativas < 5 and e.proxima_em <= now()) then
    return null;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_espelho_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then
    return null;
  end if;
  select net.http_post(
    url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/espelho-enviar',
    body := jsonb_build_object('limite', 50),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-espelho-segredo', v_segredo, 'x-schema', '{schema}'),
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;

-- a conta pagou, venceu, mudou de plano, foi isenta ou suspensa → o Treino recebe o acesso novo dos personais (spec 8.3).
-- Só enfileira (quem dispara é quem mudou: o pagamento, a tarefa das 03:40 e a tarefa da fila).
create or replace function {schema}.contas_espelho_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into {schema}.espelho_pendencias (tipo, payload) values ('conta', jsonb_build_object('conta_id', new.id));
  return null;
end;
$$;
drop trigger if exists trg_contas_espelho on {schema}.contas;
create trigger trg_contas_espelho
  after update of situacao, vence_em, teste_ate, plano, tolerancia_dias, alunos_bloqueados_em, alunos_bloqueados_msg
  on {schema}.contas for each row
  when (old.situacao is distinct from new.situacao or old.vence_em is distinct from new.vence_em
     or old.teste_ate is distinct from new.teste_ate or old.plano is distinct from new.plano
     or old.tolerancia_dias is distinct from new.tolerancia_dias
     or old.alunos_bloqueados_em is distinct from new.alunos_bloqueados_em
     or old.alunos_bloqueados_msg is distinct from new.alunos_bloqueados_msg)
  execute function {schema}.contas_espelho_mudou();

-- APLICAR PAGAMENTO (spec 6.6: "uma vez só por fatura", como o aplicar_pagamento_plano do Nativo OS). Quem chama já conferiu
-- no Mercado Pago que o pagamento está APROVADO (webhook, conferência do Pix, cartão, simulação do staging). O marcador de
-- "já aplicado" é o pago_em (só esta função grava). Regras (6.2): ninguém perde dia — +N meses a partir do maior entre o
-- vencimento, o fim do teste e hoje (a régua do Calc e do Nativo OS); regra_pix '30dias' (legado Nutri) = +30 dias; anual =
-- +12 meses; o plano pago (fatura) vira o plano da conta; isenta/suspensa/cancelada não mudam de situação.
create or replace function {schema}.aplicar_pagamento_conta(p_fatura uuid, p_pago_em timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_f {schema}.conta_faturas%rowtype;
  v_c {schema}.contas%rowtype;
  v_hoje date := {schema}.cobranca_hoje();
  v_meses integer;
  v_base date;
  v_vence date;
  v_situacao text;
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

  update {schema}.conta_faturas
     set status = 'approved', pago_em = coalesce(p_pago_em, now()), cobre_de = v_base, cobre_ate = v_vence
   where id = v_f.id;
  update {schema}.contas
     set vence_em = v_vence, situacao = v_situacao,
         plano = coalesce(v_f.plano, plano), faixa = coalesce(v_f.faixa, faixa),
         periodicidade = case when v_meses = 12 then 'anual' else 'mensal' end
   where id = v_c.id;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_c.id, 'pagamento',
    jsonb_build_object('situacao', v_c.situacao, 'vence_em', v_c.vence_em, 'plano', v_c.plano, 'faixa', v_c.faixa),
    jsonb_build_object('situacao', v_situacao, 'vence_em', v_vence, 'plano', coalesce(v_f.plano, v_c.plano),
                       'faixa', coalesce(v_f.faixa, v_c.faixa), 'fatura_id', v_f.id, 'valor', v_f.valor, 'forma', v_f.forma,
                       'tipo', v_f.tipo, 'mp_payment_id', v_f.mp_payment_id),
    v_f.registrado_por);
  perform {schema}.espelho_disparar();
  return jsonb_build_object('ok', true, 'aplicada', true, 'conta_id', v_c.id, 'vence_em', v_vence, 'situacao', v_situacao,
                            'cobre_de', v_base);
end;
$$;

-- situação de uma conta nova num dia (a mesma regra de src/nucleo/cobranca/situacao.ts): pago e dentro do vencimento
-- (+ tolerância, 0 nas novas) = ativa; no teste = teste; senão vencida (bloqueia no dia seguinte ao vencimento — 6.2)
create or replace function {schema}.situacao_da_conta_em(p_situacao text, p_teste_ate date, p_vence_em date, p_tolerancia integer, p_dia date)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_situacao in ('isenta', 'suspensa', 'cancelada') then p_situacao
    when p_vence_em is not null and p_vence_em + greatest(0, coalesce(p_tolerancia, 0)) >= p_dia then 'ativa'
    when p_teste_ate is not null and p_teste_ate >= p_dia then 'teste'
    else 'vencida'
  end;
$$;

-- TAREFA DIÁRIA DAS 03:40 (UTC, 00:40 em SP — depois das de 03:15 e 03:30; spec 6.6): Pix vencidos, situação das contas novas,
-- aviso de WhatsApp ao dono 3 dias antes do vencimento do Pix (o assinatura_vencendo do Nutri, agora do plano da conta) e o
-- espelho de acesso para o Banco do Treino. p_hoje = relógio simulado dos testes (padrão: hoje em SP); p_conta = só uma conta
-- (os testes com relógio simulado não mexem nas outras contas).
drop function if exists {schema}.contas_tarefa_diaria(date);
create or replace function {schema}.contas_tarefa_diaria(p_hoje date default null, p_conta uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
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

  -- 2. situação das contas NOVAS (os legados seguem as regras de hoje até a W28 — P9)
  for r in select c.id, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias from {schema}.contas c
            where c.origem = 'nova' and not c.cobranca_legada and c.situacao in ('teste', 'ativa', 'vencida')
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
            where c.origem = 'nova' and not c.cobranca_legada and c.situacao = 'ativa' and c.vence_em = v_hoje + 3
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
$$;

-- "SOU PROFISSIONAL" (spec 4.2, R5, R17, P10, P12): a pessoa cria a própria conta com 14 dias grátis no Treino + Nutrição
-- (até 10 alunos). Idempotente: quem já criou a conta nova recebe a mesma. Papéis pelo tipo de perfil: personal → personal;
-- nutricionista e acadêmico de nutrição → nutricionista; outra área → os dois (o dono muda na Equipe, W5).
create or replace function {schema}.criar_minha_conta(p_nome text, p_tipo text, p_registro text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nome text := left(btrim(coalesce(p_nome, '')), 80);
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_registro text := nullif(left(btrim(coalesce(p_registro, '')), 30), '');
  v_perfil_nome text;
  v_papeis text[];
  v_existente uuid;
  v_conta uuid;
  v_dias integer;
  v_teste date;
  v_codigo text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select u.email, coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    into v_email, v_perfil_nome
    from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = v_uid;
  -- P26: o staging só aceita contas de teste (o Auth é o mesmo da produção)
  if '{schema}' = 'staging' and not (lower(coalesce(v_email, '')) = 'teste@teste.com'
       or lower(coalesce(v_email, '')) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$') then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  -- idempotente ANTES de validar: quem já criou a conta nova recebe a mesma (clique duplo, voltar e tentar de novo)
  select c.id into v_existente from {schema}.contas c
   where c.dono_id = v_uid and c.origem = 'nova' order by c.criado_em limit 1;
  if v_existente is not null then
    return jsonb_build_object('ok', true, 'conta_id', v_existente, 'ja_existia', true);
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'nome_invalido');
  end if;
  if v_tipo not in ('personal', 'nutricionista', 'academico', 'outra_area') then
    return jsonb_build_object('ok', false, 'erro', 'tipo_invalido');
  end if;
  -- quem já é profissional de uma conta (legado ou equipe) não abre outra por aqui
  if exists (select 1 from {schema}.conta_membros m where m.user_id = v_uid and m.status = 'ativo') then
    return jsonb_build_object('ok', false, 'erro', 'ja_tem_conta');
  end if;
  v_papeis := case v_tipo
    when 'personal' then array['dono', 'personal']
    when 'outra_area' then array['dono', 'personal', 'nutricionista']
    else array['dono', 'nutricionista'] end;
  v_dias := coalesce((select (a.valor #>> '{}')::integer from {schema}.app_config a
                       where a.chave = 'teste_dias' and jsonb_typeof(a.valor) = 'number'), 14);
  v_teste := {schema}.cobranca_hoje() + v_dias;
  insert into {schema}.contas (nome, dono_id, origem, plano, faixa, periodicidade, situacao, teste_ate, tolerancia_dias,
                               cobranca_legada, regra_pix, recebimento_modo, bloquear_app_inadimplente)
  values (v_nome, v_uid, 'nova', 'treino_nutricao', 'f10', 'mensal', 'teste', v_teste, 0, false, 'mes', 'pix_manual', false)
  returning id into v_conta;
  v_codigo := {schema}.gerar_codigo_membro(coalesce(v_perfil_nome, v_nome));
  insert into {schema}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
  values (v_conta, v_uid, v_papeis, 'ativo', v_codigo);
  update {schema}.profiles
     set tipo_perfil = v_tipo,
         dados_profissionais = coalesce(dados_profissionais, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'registro', v_registro,
           'crn', case when v_tipo in ('nutricionista', 'academico') then v_registro end,
           'cref', case when v_tipo = 'personal' then v_registro end))
   where id = v_uid;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (v_conta, 'plano', jsonb_build_object('criada_por', 'sou_profissional', 'plano', 'treino_nutricao', 'faixa', 'f10',
                                               'teste_ate', v_teste, 'tipo_perfil', v_tipo, 'papeis', to_jsonb(v_papeis)), v_uid);
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', v_uid));
  return jsonb_build_object('ok', true, 'conta_id', v_conta, 'ja_existia', false, 'teste_ate', v_teste,
                            'codigo_convite', v_codigo, 'papeis', to_jsonb(v_papeis));
end;
$$;

-- execução: o app só cria a própria conta (e lê a data de hoje); o resto é do servidor (edge functions, pg_cron)
revoke execute on function {schema}.conta_preco(uuid, text, text, integer), {schema}.plano_max_alunos(text, text),
  {schema}.gerar_codigo_membro(text), {schema}.espelho_disparar(), {schema}.aplicar_pagamento_conta(uuid, timestamptz),
  {schema}.contas_tarefa_diaria(date, uuid), {schema}.criar_minha_conta(text, text, text)
  from public, anon, authenticated;
grant execute on function {schema}.conta_preco(uuid, text, text, integer), {schema}.plano_max_alunos(text, text),
  {schema}.gerar_codigo_membro(text), {schema}.espelho_disparar(), {schema}.aplicar_pagamento_conta(uuid, timestamptz),
  {schema}.contas_tarefa_diaria(date, uuid), {schema}.criar_minha_conta(text, text, text)
  to service_role;
grant execute on function {schema}.criar_minha_conta(text, text, text) to authenticated;
grant execute on function {schema}.cobranca_hoje(), {schema}.situacao_da_conta_em(text, date, date, integer, date)
  to authenticated, service_role;

-- ============================================================================================================
-- 5. minha_situacao() (W3) + 2 campos por conta: a assinatura no cartão (card do plano: "Renova em … · cartão"; a faixa de
--    aviso não aparece para quem é recorrente — 6.2) e o valor mensal de hoje. O resto é a função da W3, sem mudança.
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
begin
  if v_uid is null then
    return null;
  end if;
  select u.email, coalesce(u.raw_app_meta_data, '{}'::jsonb), coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_app, v_meta from auth.users u where u.id = v_uid;
  select p.nome, p.role, p.teste_ate, p.pago_ate, p.isento_assinatura, coalesce(p.config, '{}'::jsonb) as config
    into v_perfil from {schema}.profiles p where p.id = v_uid;
  v_master := coalesce(v_app ->> 'role', '') = 'master' or coalesce(v_perfil.role, '') = 'master';
  -- veio do Calc: marcado pelo script 01 (app_metadata.calc / origem = 'calc')
  v_calc := coalesce(v_app ->> 'calc', '') = 'true' or coalesce(v_app ->> 'origem', '') = 'calc';

  -- contas em que é membro ativo (as com Treino primeiro: o painel de hoje é o do Calc), com papéis e números do menu
  select coalesce(jsonb_agg(x.j order by x.tem_treino desc, x.dono desc, x.nome), '[]'::jsonb) into v_contas from (
    select c.nome, ('treino' = any({schema}.modulos_do_plano(c.plano))) as tem_treino, ('dono' = any(m.papeis)) as dono,
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
  -- antigo (sem conta) a nutricionista responsável vale como Nutrição
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) into v_matriculas
  from (
    select p.created_at as criado,
      jsonb_build_object(
        'id', p.id, 'conta_id', p.conta_id, 'conta_nome', c.nome, 'conta_origem', c.origem, 'ativo', p.ativo,
        'origem', p.origem, 'modulos', to_jsonb(array_remove(array[
            case when p.personal_id is not null and p.conta_id is not null and 'treino' = any({schema}.modulos_do_plano(c.plano)) then 'treino' end,
            case when p.nutricionista_id is not null and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))) then 'nutricao' end
          ], null)),
        'bloqueada', p.acesso_bloqueado_em is not null, 'bloqueio_msg', p.acesso_bloqueado_msg,
        'bloqueado_por_pagamento', p.bloqueado_por_pagamento,
        'conta_alunos_bloqueados_em', c.alunos_bloqueados_em, 'conta_alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'personal', case when p.personal_id is null then null else jsonb_build_object('id', p.personal_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id)) end,
        'nutricionista', case when p.nutricionista_id is null then null else jsonb_build_object('id', p.nutricionista_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id)) end
      ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = v_uid and p.deleted_at is null
  ) x;
  -- módulos do aluno = a união dos módulos das matrículas
  select coalesce(array_agg(distinct m.valor), array[]::text[]) into v_modulos
    from jsonb_array_elements(v_matriculas) e, jsonb_array_elements_text(e -> 'modulos') as m(valor);

  -- quem veio do Calc e ainda não tem matrícula (o "aluno sem professor" de hoje) continua com o treino dele
  if coalesce(jsonb_array_length(v_matriculas), 0) = 0 and v_calc and not ('treino' = any(v_modulos)) then
    v_modulos := v_modulos || array['treino'];
  end if;

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
    'foto_url', coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    'master', v_master,
    'papel_legado', v_perfil.role,
    'calc', v_calc,
    'contas', v_contas,
    'matriculas', v_matriculas,
    'modulos_aluno', to_jsonb(coalesce(v_modulos, array[]::text[])),
    'precisa_treino', v_precisa_treino,
    'sem_nada', not v_master and jsonb_array_length(v_contas) = 0 and jsonb_array_length(v_matriculas) = 0 and not v_calc,
    'legado_nutri', v_legado_nutri,
    'aviso_mudanca', v_aviso,
    'gerado_em', now());
end;
$$;
revoke execute on function {schema}.minha_situacao() from public, anon;
grant execute on function {schema}.minha_situacao() to authenticated, service_role;

-- ============================================================================================================
-- 6. pg_net (o espelho sai do banco para a espelho-enviar) e as tarefas do pg_cron deste schema. `cron.schedule` com o mesmo
--    nome ATUALIZA o job (idempotente). O `create extension` fica num DO condicional (lição da W32 do Nutri: o `if not exists`
--    puro dispara o event trigger do Supabase e quebra na 2ª rodada).
-- ============================================================================================================
do $ext$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net;
  end if;
end
$ext$;
select cron.schedule('physiq-contas-diaria-{schema}', '40 3 * * *', $$select {schema}.contas_tarefa_diaria()$$);
select cron.schedule('physiq-espelho-{schema}', '*/10 * * * *', $$select {schema}.espelho_disparar()$$);
