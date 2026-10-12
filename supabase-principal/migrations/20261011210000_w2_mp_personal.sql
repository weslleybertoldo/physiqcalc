-- Physiq W2 — o Mercado Pago DO PERSONAL (OAuth): o dono conecta a conta dele no MP e o aluno paga como hoje no MP (Pix, cartão e a
-- cobrança automática), com o dinheiro direto na conta do personal. Banco principal, staging + public. Idempotente. UMA migration (lição I2
-- da W1): o apply_migration_principal.py roda o bloco de cada schema numa transação — entra tudo ou nada.
-- SÓ ACRESCENTA, ou troca uma função a partir do corpo mais novo; para quem não usa o MP da conta nada muda:
--   · contas.recebimento_modo aceita 'mercadopago_conta' ('mercadopago' continua = o MP do Physiq, só o master liga);
--   · recebimento_integracoes (W1) ganha o provedor 'mercadopago' (1 por conta): mp_user_id, mp_apelido, mp_public_key, os tokens CIFRADOS
--     no servidor (AES-256-GCM, a chave MP_TOKENS_CHAVE fica FORA do banco — 'v1:<iv>:<cifra>'), mp_expira_em, a renovação (trava,
--     tentativas, próxima), mp_erro, mp_origem e o status ativa · erro · desconectada; sem grant para anon/authenticated (como na W1);
--   · mp_conexoes: o state de uso único do OAuth (10 min; só o sha256) + o PKCE cifrado + o redirect usado + o PAR de tokens cifrado até a
--     confirmação de quem começou (15 min — revisão I8); só o servidor;
--   · cobrancas.mp_collector_id e aluno_assinaturas.mp_collector_id: QUAL conta do MP recebeu (nulo = o MP do Physiq);
--   · contas_guard_mp (TODO MUNDO: dono, master, servidor): entrar no 'mercadopago_conta' só com a integração ativa; sair de um MP com
--     cobrança automática viva, não (MENOR 7 da revisão da W1); contas_saiu_do_mp_conta: sair do MP da conta → integração 'desconectada';
--     cobrancas_guard_mp_conta: o app não grava mp_collector_id (o resto do MP em cobrancas já é da guarda da W1b — revisão C1);
--   · recebimento_mp_confirmar: a CONFIRMAÇÃO da conexão COMO A PESSOA (só quem começou e é dono; até 15 min) grava a integração — e só
--     troca de conta do MP sem nada em andamento na antiga (revisão I8 e I5);
--   · master: w27_conta_linha e master_integracoes (corpos da W1, 20261011200000) com o MP da conta (sem token); master_conta_acao (corpo da
--     w27, 20261002010000:212-358) recusa ligar o MP da conta (só o dono, pelo OAuth) e devolve automaticas_ativas antes do gatilho;
--   · app_config 'mercadopago_conta' {"liberada": false} (o personal só vê com a flag; o master sempre) e 'mp_webhook' {"exigir_assinatura":
--     false} (a x-signature só é EXIGIDA depois de provada nas notificações de verdade — Task 23 do plano);
--   · a renovação: mp_integracao_reservar (a trava de 2 min por conta — o refresh_token GIRA) e mp_contas_renovar_disparar() de hora em hora
--     (pg_cron → pg_net → mp-contas-renovar com o segredo S10 do Vault physiq_mp_renovar_segredo) — também 1×/dia por integração ativa, a
--     conferência do acesso e das cobranças das automáticas (mp_conferido_em; MENOR 27 e I1) — + a faxina (tokens da desconectada há 7
--     dias; o par não confirmado em 15 min; states vencidos há 1 dia).
-- NÃO devolve a w27_conta_linha ao authenticated (H-02 da hml-01 — revisão I7). NÃO troca o corpo da guarda da W1b (cobrancas_guard_mp,
-- 20261011220000): a coluna nova entra na guarda própria, ao lado (o comentário da W1b pede isso).
-- A guarda do modo vale para TODO MUNDO, inclusive o postgres (migrações, scripts e os E2E pela Management API): quem devolve uma conta
-- para fora de um MP tem de cancelar (ou apagar, no E2E) as automáticas vivas ANTES de trocar o modo — senão P0001 automaticas_ativas:<n>.
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py; dry-run antes de cada):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so public --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011210000_w2_mp_personal.sql --so public
-- Testes (staging, blocos desfeitos): python3 e2e/w2/sql_w2.py · no public, só leitura: python3 e2e/w2/sql_w2.py --so-catalogo --schema public

-- ============================================================================================================
-- 1. O modo (o CHECK tem nome desde a W1)
-- ============================================================================================================
alter table {schema}.contas drop constraint if exists contas_recebimento_modo_check;
alter table {schema}.contas add constraint contas_recebimento_modo_check
  check (recebimento_modo in ('pix_manual', 'nenhum', 'mercadopago', 'infinitepay', 'mercadopago_conta'));

-- ============================================================================================================
-- 2. A integração do MP da conta (na tabela da W1: 1 linha por conta e provedor)
-- ============================================================================================================
alter table {schema}.recebimento_integracoes add column if not exists mp_user_id bigint;              -- o collector (dono da conta no MP)
alter table {schema}.recebimento_integracoes add column if not exists mp_apelido text;                -- o nickname do MP (o dono confere a conta)
alter table {schema}.recebimento_integracoes add column if not exists mp_public_key text;             -- pública (o cartão no app); pode faltar (P-C)
alter table {schema}.recebimento_integracoes add column if not exists mp_access_token text;           -- CIFRADO (v1:…)
alter table {schema}.recebimento_integracoes add column if not exists mp_refresh_token text;          -- CIFRADO (v1:…)
alter table {schema}.recebimento_integracoes add column if not exists mp_expira_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_teste boolean;               -- live_mode false (staging: test_token)
alter table {schema}.recebimento_integracoes add column if not exists mp_origem text;                 -- oauth | teste_sem_oauth | teste_local
alter table {schema}.recebimento_integracoes add column if not exists mp_renovado_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_renovando_ate timestamptz;   -- a trava da renovação
alter table {schema}.recebimento_integracoes add column if not exists mp_renovar_tentativas integer not null default 0;
alter table {schema}.recebimento_integracoes add column if not exists mp_renovar_proxima_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_erro text;                   -- o motivo (código), nunca a resposta
alter table {schema}.recebimento_integracoes add column if not exists mp_avisado_em timestamptz;      -- o último aviso ao dono (1 por dia)
alter table {schema}.recebimento_integracoes add column if not exists conectado_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists desconectada_em timestamptz;
alter table {schema}.recebimento_integracoes add column if not exists mp_conferido_em timestamptz;    -- a conferência diária (MENOR 27, I1)
-- Atenção ao NULL: um CHECK que dá NULL PASSA. Toda comparação com coluna que pode ser nula vai com "is not null" ou coalesce (a prova
-- local da Task 6 pegou 3 no texto do plano: mp_origem nula, mp_erro nulo no 'sem_renovacao' e o mp_user_id nulo da conexão 'confirmar').
alter table {schema}.recebimento_integracoes drop constraint if exists recebimento_integracoes_check;
alter table {schema}.recebimento_integracoes add constraint recebimento_integracoes_check check (
      provedor in ('infinitepay', 'mercadopago')
  and status in ('ativa', 'erro', 'desconectada')
  and (provedor <> 'infinitepay' or (status in ('ativa', 'erro') and infinitepay_handle is not null
                                     and infinitepay_handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$'))
  and (provedor <> 'mercadopago' or (
        mp_user_id is not null and mp_user_id > 0
    and mp_origem is not null and mp_origem in ('oauth', 'teste_sem_oauth', 'teste_local')
    and (mp_access_token is null or mp_access_token ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
    and (mp_refresh_token is null or mp_refresh_token ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
    -- o MP pode não mandar o refresh (a doc diz que todos os campos da resposta são opcionais): a conexão vale até o vencimento, marcada
    -- 'sem_renovacao' (decisão 8 — aviso "reconecte até dd/mm"); sem essa marca, ativa por OAuth exige o refresh
    and (status <> 'ativa' or (mp_access_token is not null and mp_expira_em is not null
                               and (mp_refresh_token is not null or mp_origem <> 'oauth' or coalesce(mp_erro, '') = 'sem_renovacao')))
    -- a faxina apaga os tokens 7 dias depois do desconectada_em (decisão 10): desconectada sem a data guardaria os tokens para sempre
    and (status <> 'desconectada' or desconectada_em is not null)
    and (mp_public_key is null or (char_length(mp_public_key) <= 80 and mp_public_key ~ '^(APP_USR|TEST)-[A-Za-z0-9-]+$'))
    and (mp_apelido is null or char_length(mp_apelido) <= 80)
    and (mp_erro is null or mp_erro ~ '^[a-z_]{1,40}$')
    and mp_renovar_tentativas >= 0)));
create index if not exists recebimento_integracoes_mp_renovar_idx on {schema}.recebimento_integracoes (mp_expira_em)
  where provedor = 'mercadopago' and status = 'ativa';
comment on table {schema}.recebimento_integracoes is
  'W1/W2: a forma de receber da conta num provedor (a InfiniteTag; o MP da conta com os tokens CIFRADOS — a chave fica fora do banco). Só o servidor.';

-- ============================================================================================================
-- 3. O state de uso único do OAuth (10 min). O state em si nunca fica guardado; o verifier do PKCE, cifrado. E o PAR da volta até a
--    confirmação (I8). Sem coluna de origem: a volta sempre cai no site (no APK, o Conectar abre o site — decisão 6).
-- ============================================================================================================
create table if not exists {schema}.mp_conexoes (
  id uuid primary key default gen_random_uuid(),
  estado_hash text not null unique,
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verificador text not null,
  redirect_uri text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '10 minutes',
  usado_em timestamptz,
  resultado text
);
-- I8 (revisão): a volta troca o code e guarda o par AQUI, cifrado com o MESMO dado associado da integração (physiq:w2:<schema>:<conta>:
-- access|refresh — a confirmação só copia), com resultado 'confirmar'; quem grava a integração é a recebimento_mp_confirmar, COMO A
-- PESSOA, em até 15 min. MENOR 23: colunas que chegam depois do create entram por alter … add column if not exists.
alter table {schema}.mp_conexoes add column if not exists token_access text;          -- CIFRADO (v1:…)
alter table {schema}.mp_conexoes add column if not exists token_refresh text;         -- CIFRADO (v1:…)
alter table {schema}.mp_conexoes add column if not exists token_expira_em timestamptz;
alter table {schema}.mp_conexoes add column if not exists mp_user_id bigint;
alter table {schema}.mp_conexoes add column if not exists mp_apelido text;
alter table {schema}.mp_conexoes add column if not exists public_key text;
alter table {schema}.mp_conexoes add column if not exists live boolean;
alter table {schema}.mp_conexoes add column if not exists renovavel boolean;
alter table {schema}.mp_conexoes drop constraint if exists mp_conexoes_check;
alter table {schema}.mp_conexoes add constraint mp_conexoes_check check (
      estado_hash ~ '^[0-9a-f]{64}$' and verificador ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$'
  and (redirect_uri = 'https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/{schema}'
       or ('{schema}' = 'staging' and redirect_uri = 'https://www.mercadopago.com'))
  and (resultado is null or resultado ~ '^[a-z_]{1,40}$')
  and (token_access is null or token_access ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
  and (token_refresh is null or token_refresh ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$')
  and (resultado is distinct from 'confirmar' or (token_access is not null and mp_user_id is not null and mp_user_id > 0
                                                  and token_expira_em is not null and usado_em is not null))
  and (public_key is null or (char_length(public_key) <= 80 and public_key ~ '^(APP_USR|TEST)-[A-Za-z0-9-]+$'))
  and (mp_apelido is null or char_length(mp_apelido) <= 80));
create index if not exists mp_conexoes_expira_idx on {schema}.mp_conexoes (expira_em);
comment on table {schema}.mp_conexoes is
  'W2: o state de uso único do OAuth do MP (10 min), o PKCE cifrado, o redirect usado e o par CIFRADO até a confirmação de quem começou (15 min). Só o servidor.';
alter table {schema}.mp_conexoes enable row level security;
revoke all on table {schema}.mp_conexoes from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.mp_conexoes to service_role;

-- ============================================================================================================
-- 4. Qual conta do MP recebeu (nulo = o MP do Physiq) — o app não grava. As OUTRAS colunas do MP em cobrancas (forma 'mp', o status da
--    linha mp, reembolsado_em, mp_payment_id, mp_status, mp_preapproval_id, pix_*) já estão congeladas para o app pelo gatilho da W1b
--    (trg_cobrancas_guard_mp → cobrancas_guard_mp(), 20261011220000_w1b_guarda_cobrancas_mp.sql — revisão C1, pré-requisito conferido na
--    Task 0): este acrescenta SÓ a coluna nova, que a guarda da W1b não cita (antes da W2 ela não existia: o NEW.mp_collector_id quebraria
--    toda gravação do app). O corpo da W1b NÃO é trocado aqui. A coluna é criada logo acima do gatilho, na MESMA transação: a falha que a
--    W1b conferia ("coluna citada no corpo e ausente do schema") não acontece aqui. Os BEFORE rodam em ordem alfabética — guard_infinitepay
--    → guard_mp → guard_mp_conta → guard_periodo — e nenhum desfaz o outro (cada um mexe nas suas colunas).
--    Em aluno_assinaturas o app não grava nada (RLS: só leitura para aluno, dono e responsável; o master tudo — w02 :741-749).
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists mp_collector_id bigint;
alter table {schema}.aluno_assinaturas add column if not exists mp_collector_id bigint;

create or replace function {schema}.cobrancas_guard_mp_conta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then new.mp_collector_id := null; else new.mp_collector_id := old.mp_collector_id; end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.cobrancas_guard_mp_conta() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_mp_conta on {schema}.cobrancas;
create trigger trg_cobrancas_guard_mp_conta before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_mp_conta();

-- ============================================================================================================
-- 5. As flags (só o servidor lê)
-- ============================================================================================================
insert into {schema}.app_config (chave, valor, publica) values ('mercadopago_conta', '{"liberada": false}'::jsonb, false) on conflict (chave) do nothing;
insert into {schema}.app_config (chave, valor, publica) values ('mp_webhook', '{"exigir_assinatura": false}'::jsonb, false) on conflict (chave) do nothing;

-- ============================================================================================================
-- 6. As guardas do modo — para TODO MUNDO (o gatilho da W1, trg_contas_guard, segue só para o app; este roda depois dele: o nome ordena)
-- ============================================================================================================
create or replace function {schema}.mp_automaticas_vivas(p_conta uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct a.paciente_id)::integer
    from {schema}.aluno_assinaturas a join {schema}.pacientes p on p.id = a.paciente_id
   where p.conta_id = p_conta and a.status in ('authorized', 'pending', 'paused');
$$;
revoke all on function {schema}.mp_automaticas_vivas(uuid) from public, anon, authenticated;
grant execute on function {schema}.mp_automaticas_vivas(uuid) to service_role;

create or replace function {schema}.contas_guard_mp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if new.recebimento_modo is not distinct from old.recebimento_modo then return new; end if;
  if new.recebimento_modo = 'mercadopago_conta' and not exists (
       select 1 from {schema}.recebimento_integracoes i where i.conta_id = new.id and i.provedor = 'mercadopago' and i.status = 'ativa') then
    raise exception 'mp_conta_sem_integracao' using errcode = 'P0001', hint = 'w2';
  end if;
  if old.recebimento_modo in ('mercadopago', 'mercadopago_conta') then
    v_n := {schema}.mp_automaticas_vivas(new.id);
    if v_n > 0 then raise exception 'automaticas_ativas:%', v_n using errcode = 'P0001', hint = 'w2'; end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.contas_guard_mp() from public, anon, authenticated;
drop trigger if exists trg_contas_guard_mp on {schema}.contas;
create trigger trg_contas_guard_mp before update of recebimento_modo on {schema}.contas
  for each row execute function {schema}.contas_guard_mp();

create or replace function {schema}.contas_saiu_do_mp_conta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update {schema}.recebimento_integracoes set status = 'desconectada', desconectada_em = now(), mp_renovando_ate = null
   where conta_id = new.id and provedor = 'mercadopago' and status <> 'desconectada';
  return null;
end;
$$;
revoke all on function {schema}.contas_saiu_do_mp_conta() from public, anon, authenticated;
drop trigger if exists trg_contas_saiu_do_mp_conta on {schema}.contas;
create trigger trg_contas_saiu_do_mp_conta after update of recebimento_modo on {schema}.contas
  for each row when (old.recebimento_modo = 'mercadopago_conta' and new.recebimento_modo is distinct from 'mercadopago_conta')
  execute function {schema}.contas_saiu_do_mp_conta();

-- ============================================================================================================
-- 7. O master: a linha da conta e Integrações (corpos da W1) com o MP da conta, sem token; a ação 'recebimento' (corpo da w27)
--    (os 3 com create or replace — as assinaturas não mudam e o create or replace MANTÉM os grants de hoje)
-- ============================================================================================================
-- w27_conta_linha: o corpo de 20261011200000_w1_infinitepay.sql:372-406 INTEIRO + a chave 'mercadopago_conta' depois da 'infinitepay'
-- (a situação, o apelido, o collector, o vencimento, o erro e SE há chave pública — nenhum token, nem cifrado)
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
                    from {schema}.recebimento_chaves k where k.conta_id = c.id and k.ativa limit 1),
    -- W1: a InfinitePay da conta (a InfiniteTag e a situação)
    'infinitepay', (select jsonb_build_object('handle', i.infinitepay_handle, 'status', i.status, 'testado_em', i.testado_em)
                      from {schema}.recebimento_integracoes i where i.conta_id = c.id and i.provedor = 'infinitepay'),
    -- W2: o MP da conta (a situação, o apelido, o collector, o vencimento, o erro e SE há chave pública — nenhum token, nem cifrado)
    'mercadopago_conta', (select jsonb_build_object('status', i.status, 'apelido', i.mp_apelido, 'mp_user_id', i.mp_user_id,
                            'expira_em', i.mp_expira_em, 'erro', i.mp_erro, 'chave_publica', i.mp_public_key is not null,
                            'conectado_em', i.conectado_em, 'teste', i.mp_teste)
                            from {schema}.recebimento_integracoes i where i.conta_id = c.id and i.provedor = 'mercadopago'))
  from {schema}.contas c where c.id = p_conta;
$$;

-- master_integracoes: o corpo de 20261011200000_w1_infinitepay.sql:408-438 + 'mercadopago_conta' e 'mp_conta_erro' no v_resumo
create or replace function {schema}.master_integracoes(p_offset integer default null, p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  -- hml-14d (B21): a página
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_resumo jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  v_resumo := jsonb_build_object(
    'pix_manual', (select count(*) from {schema}.contas c where c.recebimento_modo = 'pix_manual'),
    'mercadopago', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago'),
    'nenhum', (select count(*) from {schema}.contas c where c.recebimento_modo = 'nenhum'),
    'infinitepay', (select count(*) from {schema}.contas c where c.recebimento_modo = 'infinitepay'),  -- W1
    'mercadopago_conta', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago_conta'),  -- W2
    'mp_conta_erro', (select count(*) from {schema}.recebimento_integracoes i where i.provedor = 'mercadopago' and i.status = 'erro'),  -- W2
    'com_chave', (select count(distinct k.conta_id) from {schema}.recebimento_chaves k where k.ativa));
  if p_offset is null and p_limite is null then
    -- a chamada de hoje (sem página): o texto da W27 (+ a contagem da W1)
    return jsonb_build_object('ok', true, 'contas', coalesce((
      select jsonb_agg({schema}.w27_conta_linha(c.id) order by c.origem = 'app' desc, lower(c.nome)) from {schema}.contas c), '[]'::jsonb),
      'resumo', v_resumo);
  end if;
  return jsonb_build_object('ok', true,
    'total', (select count(*) from {schema}.contas c),
    'contas', coalesce((
      select jsonb_agg({schema}.w27_conta_linha(pg.id) order by pg.eh_app desc, pg.chave, pg.id)
        from (select c.id, c.origem = 'app' as eh_app, lower(c.nome) as chave from {schema}.contas c
               order by c.origem = 'app' desc, lower(c.nome), c.id
              offset v_off limit v_lim) pg), '[]'::jsonb),
    'resumo', v_resumo);
end;
$$;

-- master_conta_acao: o corpo de 20261002010000_w27_master.sql:212-358 INTEIRO, trocado SÓ o ramo 'recebimento' (:330-335)
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
    -- W2: o master liga o MP do Physiq, o Pix e o "não cobrar"; a InfinitePay e o MP da conta, só o dono (a InfiniteTag / o OAuth)
    -- (W2: sem o modo no pedido também é modo_invalido — antes caía no NOT NULL da coluna e virava 500)
    if v_txt is null or v_txt not in ('pix_manual', 'nenhum', 'mercadopago') then return jsonb_build_object('ok', false, 'erro', 'modo_invalido'); end if;
    -- W2 (MENOR 7 da W1): sair de um MP com automática viva → a master-contas cancela antes, com o OK; aqui só recusa (antes do gatilho)
    if v_c.recebimento_modo in ('mercadopago', 'mercadopago_conta') and v_txt is distinct from v_c.recebimento_modo
       and {schema}.mp_automaticas_vivas(p_conta) > 0 then
      return jsonb_build_object('ok', false, 'erro', 'automaticas_ativas', 'alunos', {schema}.mp_automaticas_vivas(p_conta));
    end if;
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

-- I7 da revisão: a w27_conta_linha é SÓ do service_role desde a hml-01 (H-02, 20261007200100_hml01b_funcoes_internas_e_perfil.sql:19-36):
-- é SECURITY DEFINER, não confere o master e devolve o e-mail do dono, a chave Pix, a InfiniteTag e, com a W2, o MP da conta — NUNCA grant
-- ao authenticated (o e2e/hml01/banco.py › INTERNAS e o sql_w2 --so-catalogo conferem). A master_conta_acao segue como a w27 deixou.
revoke all on function {schema}.w27_conta_linha(uuid) from public, anon, authenticated;
grant execute on function {schema}.w27_conta_linha(uuid) to service_role;
revoke execute on function {schema}.master_conta_acao(uuid, text, jsonb) from public, anon;
grant execute on function {schema}.master_conta_acao(uuid, text, jsonb) to authenticated, service_role;

-- ============================================================================================================
-- 8. A renovação: a trava por conta e o disparo de hora em hora (o molde da automaticas_disparar, W-P) + a faxina
-- ============================================================================================================
create or replace function {schema}.mp_integracao_reservar(p_conta uuid, p_segundos integer default 120) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update {schema}.recebimento_integracoes
     set mp_renovando_ate = now() + make_interval(secs => least(greatest(coalesce(p_segundos, 120), 10), 600))
   where conta_id = p_conta and provedor = 'mercadopago' and status in ('ativa', 'erro')
     and (mp_renovando_ate is null or mp_renovando_ate < now());
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

create or replace function {schema}.mp_contas_renovar_disparar() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_segredo text;
  v_id bigint;
begin
  -- a faxina (só SQL): o acesso da desligada some depois de 7 dias; os states vencidos há 1 dia saem
  update {schema}.recebimento_integracoes set mp_access_token = null, mp_refresh_token = null
   where provedor = 'mercadopago' and status = 'desconectada' and desconectada_em < now() - interval '7 days'
     and (mp_access_token is not null or mp_refresh_token is not null);
  -- I8: o par que ninguém confirmou em 15 min perde os tokens (a linha sai com a faxina de 1 dia)
  update {schema}.mp_conexoes set token_access = null, token_refresh = null, resultado = 'vencido'
   where resultado = 'confirmar' and usado_em < now() - interval '15 minutes';
  delete from {schema}.mp_conexoes where expira_em < now() - interval '1 day';
  -- chama a função só quando há o que fazer: renovar (vence em < 30 dias, na hora da tentativa) OU a conferência diária (MENOR 27 e I1)
  if not exists (select 1 from {schema}.recebimento_integracoes i
                  where i.provedor = 'mercadopago' and i.mp_origem = 'oauth' and i.status = 'ativa'
                    and ((i.mp_expira_em < now() + interval '30 days'
                          and (i.mp_renovar_proxima_em is null or i.mp_renovar_proxima_em <= now()))
                         or i.mp_conferido_em is null or i.mp_conferido_em < now() - interval '1 day')) then
    return null;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return null; end if;
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_mp_renovar_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then return null; end if;
  select net.http_post(
    url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/mp-contas-renovar',
    body := jsonb_build_object('schema', '{schema}'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-espelho-segredo', v_segredo),
    timeout_milliseconds := 120000) into v_id;
  return v_id;
end;
$$;
revoke all on function {schema}.mp_integracao_reservar(uuid, integer), {schema}.mp_contas_renovar_disparar() from public, anon, authenticated;
grant execute on function {schema}.mp_integracao_reservar(uuid, integer), {schema}.mp_contas_renovar_disparar() to service_role;

-- de hora em hora, no minuto 41 (o mesmo nome ATUALIZA o job)
select cron.schedule('mp-renovar-{schema}', '41 * * * *', $$select {schema}.mp_contas_renovar_disparar()$$);

-- ============================================================================================================
-- 9. A CONFIRMAÇÃO da conexão, COMO A PESSOA (revisão I8, com o I5 e o MENOR 29 dentro). A volta do OAuth (mp-conectar-retorno, service_role)
--    só troca o code e guarda o par CIFRADO na mp_conexoes ('confirmar'); a integração é gravada AQUI, chamada pela pagamentos-aluno com a
--    sessão de quem está na tela (dbPessoa). Só passa quem COMEÇOU a conexão (user_id = auth.uid()) e é dono da conta (MENOR 19), em até
--    15 min. Um link de conexão do atacante, autorizado pela vítima no MP, não liga nada: a vítima volta ao site com a sessão DELA, e o
--    atacante não conhece o id da conexão. Molde: recebimento_infinitepay_salvar (W1). É a única definer nova com EXECUTE para o
--    authenticated: ela confere a pessoa por dentro (auth.uid() = quem começou e sou_dono).
-- ============================================================================================================
create or replace function {schema}.recebimento_mp_confirmar(p_conexao uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_con {schema}.mp_conexoes%rowtype;
  v_c {schema}.contas%rowtype;
  v_atual {schema}.recebimento_integracoes%rowtype;
  v_liberada boolean;
  v_abertos integer := 0;
  v_resultado text := 'ok';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_con from {schema}.mp_conexoes where id = p_conexao for update;
  if not found or v_con.resultado is distinct from 'confirmar' or v_con.token_access is null then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;
  -- I8: só quem começou — e dono (nem o master liga o MP DELE na conta de um personal)
  if v_con.user_id is distinct from v_uid or not {schema}.sou_dono(v_con.conta_id) then
    return jsonb_build_object('ok', false, 'erro', 'outra_pessoa');
  end if;
  if v_con.usado_em < now() - interval '15 minutes' then
    update {schema}.mp_conexoes set resultado = 'vencido', token_access = null, token_refresh = null where id = v_con.id;
    return jsonb_build_object('ok', false, 'erro', 'vencido');
  end if;
  select * into v_c from {schema}.contas where id = v_con.conta_id;
  if not found or v_c.origem = 'app' then return jsonb_build_object('ok', false, 'erro', 'conta_invalida'); end if;
  select coalesce((a.valor ->> 'liberada')::boolean, false) into v_liberada from {schema}.app_config a where a.chave = 'mercadopago_conta';
  if not coalesce(v_liberada, false) and not {schema}.eh_master() then
    return jsonb_build_object('ok', false, 'erro', 'mp_conta_em_teste');
  end if;
  select * into v_atual from {schema}.recebimento_integracoes where conta_id = v_con.conta_id and provedor = 'mercadopago' for update;
  -- I5 (+ MENOR 29): OUTRA conta do MP com o acesso da antiga ainda guardado (ativa, erro ou os 7 dias de desconectada — decisão 10) → só
  -- troca se a antiga não tiver nada em andamento NOS ALUNOS DESTA CONTA: automática viva ou cobrança do MP aberta (Pix até vencer; cartão
  -- em análise). O upsert abaixo apagaria o token que ainda tem de ler esse Pix.
  if found and v_atual.mp_user_id is distinct from v_con.mp_user_id
     and (v_atual.mp_access_token is not null or v_atual.mp_refresh_token is not null) then
    select (select count(*) from {schema}.aluno_assinaturas a join {schema}.pacientes p on p.id = a.paciente_id
             where p.conta_id = v_con.conta_id and a.mp_collector_id = v_atual.mp_user_id and a.status in ('authorized', 'pending', 'paused'))
         + (select count(*) from {schema}.cobrancas co join {schema}.pacientes p on p.id = co.paciente_id
             where p.conta_id = v_con.conta_id and co.deleted_at is null and co.forma = 'mp' and co.status = 'aguardando_confirmacao'
               and co.mp_collector_id = v_atual.mp_user_id and (co.pix_expira_em is null or co.pix_expira_em > now()))
      into v_abertos;
    if v_abertos > 0 then
      update {schema}.mp_conexoes set resultado = 'outra_conta', token_access = null, token_refresh = null where id = v_con.id;
      return jsonb_build_object('ok', false, 'erro', 'outra_conta', 'abertos', v_abertos);
    end if;
  end if;
  -- MENOR 29 — LIGAR (tirar os comentários) SÓ se a prova da Task 1 mostrar primeira_vale_depois_da_segunda = false (a 2ª autorização do
  -- mesmo vendedor derruba a 1ª): a mesma conta do MP já ligada em OUTRA conta do Physiq é recusada.
  -- if exists (select 1 from {schema}.recebimento_integracoes i where i.provedor = 'mercadopago' and i.mp_user_id = v_con.mp_user_id
  --            and i.conta_id <> v_con.conta_id and i.status in ('ativa', 'erro')) then
  --   update {schema}.mp_conexoes set resultado = 'mp_em_outra_conta', token_access = null, token_refresh = null where id = v_con.id;
  --   return jsonb_build_object('ok', false, 'erro', 'mp_em_outra_conta');
  -- end if;
  insert into {schema}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_public_key, mp_access_token,
    mp_refresh_token, mp_expira_em, mp_teste, mp_origem, mp_renovado_em, mp_renovando_ate, mp_renovar_tentativas, mp_renovar_proxima_em,
    mp_erro, mp_avisado_em, mp_conferido_em, conectado_em, desconectada_em, atualizado_por)
  values (v_con.conta_id, 'mercadopago', 'ativa', v_con.mp_user_id, v_con.mp_apelido, v_con.public_key, v_con.token_access,
    v_con.token_refresh, v_con.token_expira_em, v_con.live is false, 'oauth', null, null, 0, null,
    case when v_con.renovavel and v_con.token_refresh is not null then null else 'sem_renovacao' end, null, now(), now(), null, v_uid)
  on conflict (conta_id, provedor) do update set status = 'ativa', mp_user_id = excluded.mp_user_id, mp_apelido = excluded.mp_apelido,
    mp_public_key = excluded.mp_public_key, mp_access_token = excluded.mp_access_token, mp_refresh_token = excluded.mp_refresh_token,
    mp_expira_em = excluded.mp_expira_em, mp_teste = excluded.mp_teste, mp_origem = 'oauth', mp_renovado_em = null, mp_renovando_ate = null,
    mp_renovar_tentativas = 0, mp_renovar_proxima_em = null, mp_erro = excluded.mp_erro, mp_avisado_em = null, mp_conferido_em = now(),
    conectado_em = now(), desconectada_em = null, atualizado_por = v_uid;
  update {schema}.mp_conexoes set resultado = 'ok', token_access = null, token_refresh = null where id = v_con.id;   -- o par sai daqui
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (v_con.conta_id, 'outro', '{}'::jsonb, jsonb_build_object('w2', 'mp_conectado', 'mp_user_id', v_con.mp_user_id,
          'teste', v_con.live is false, 'chave_publica', v_con.public_key is not null), v_uid);
  -- liga o modo quando é seguro (decisão 6): com automática viva no MP de antes, o contas_guard_mp recusa (P0001) → 'conectado_sem_trocar'
  -- (a integração fica gravada; a tela pede "Salvar a forma", com o OK de cancelar as automáticas)
  if v_c.recebimento_modo is distinct from 'mercadopago_conta' then
    begin
      update {schema}.contas set recebimento_modo = 'mercadopago_conta' where id = v_con.conta_id;
    exception when sqlstate 'P0001' then
      v_resultado := 'conectado_sem_trocar';
    end;
  end if;
  return jsonb_build_object('ok', true, 'resultado', v_resultado, 'apelido', v_con.mp_apelido);
end;
$$;
revoke all on function {schema}.recebimento_mp_confirmar(uuid) from public, anon;
grant execute on function {schema}.recebimento_mp_confirmar(uuid) to authenticated, service_role;
