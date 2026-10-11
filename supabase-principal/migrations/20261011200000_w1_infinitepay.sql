-- Physiq W1 — InfinitePay (o aluno paga o personal na página HOSPEDADA da InfinitePay). Banco principal, staging + public. Idempotente.
-- UMA migration só (revisão I2 de 11/10). Eram 2, e na produção a 1ª ligava o código novo antes de a RPC da 2ª existir. O
-- apply_migration_principal.py roda o bloco de cada schema numa transação: tudo entra junto, ou nada entra.
--   · seções 1–12: os DADOS E TRAVAS (Task 5 do plano);
--   · seções 13 e 14: o PRAZO DE 72 H E A RODADA (Task 6, acrescentadas no fim deste mesmo arquivo).
-- Desenho: ~/Desktop/Physiq - InfinitePay/…desenho aprovado - 2026-10-10.md (a seção 8 por cima das 4 e 5) + o spec-review (W1-B1; "o dono
-- liga os modos novos sem integração"; colunas com prefixo em cobrancas; "trava no banco") + a revisão de 11/10 (I4: um order_nsu por link).
-- SÓ ACRESCENTA, ou troca uma função a partir do corpo mais novo; para quem não usa a InfinitePay nada muda:
--   · contas.recebimento_modo e cobrancas.forma aceitam 'infinitepay' ('mercadopago' continua = o MP do Physiq, só o master liga);
--   · cobrancas: as colunas ip_* — a TENTATIVA (a InfiniteTag USADA no link, o link, o prazo de 72 h) e a BAIXA (NSU único por tag,
--     slug, recibo, valor pago, parcelas, meio); nulas em tudo o que já existe;
--   · SÓ o servidor (RLS ligado, nada para o app):
--       - recebimento_integracoes: 1 por conta e provedor; na W1 a InfiniteTag (a W2 acrescenta o MP da conta);
--       - infinitepay_links: um order_nsu por link, `<cobranca_id>-<n>`, com a InfiniteTag e o preço dele (a InfinitePay aceita
--         order_nsu repetido: a unicidade é nossa);
--       - infinitepay_avisos: a caixa de avisos do webhook, da volta da página e da conferência só do pedido;
--   · app_config 'infinitepay' {"liberada": false}: o personal só vê a opção com a flag ligada (o master sempre) — o staging liga na
--     Task 12 do plano; a produção, depois dos 2 testes de R$ 1 do Weslley (Task 22);
--   · contas_guard (corpo da 20261002040000_w28_virada.sql) + a InfinitePay só com a integração ativa (o dono não liga pela API sem
--     a InfiniteTag); cobrancas_guard_infinitepay (o app não grava a tentativa nem a baixa);
--   · recebimento_infinitepay_salvar (a InfiniteTag — RPC chamada COMO A PESSOA, confere o dono) e recebimento_chave_ligar (1 chave
--     ligada numa transação só — SECURITY INVOKER: o RLS de recebimento_chaves vale);
--   · financeiro_do_aluno (corpo da 20261011010000_wp_planos_modalidades.sql): a tentativa vencida da InfinitePay não conta como
--     "aguardando" e a avulsa vencida volta às "abertas" (W1-B1: não solta a trava do inadimplente);
--   · w27_conta_linha (corpo da w28) e master_integracoes (corpo da 20261009060000_hml14d_master_paginado.sql): o master vê a InfinitePay;
--   · a conta encerrada (excluir a conta, master) perde a integração;
--   · [Task 6] infinitepay_fechar_vencidas (a tentativa vencida sem aviso pendente sai) e infinitepay_rodada no pg_cron a cada 15 min.
--
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py; dry-run antes de cada):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011200000_w1_infinitepay.sql --so public
-- Testes (staging, blocos desfeitos): python3 e2e/w1/sql_w1.py · no public, só leitura: python3 e2e/w1/sql_w1.py --so-catalogo --schema public

-- ============================================================================================================
-- 1. Os modos e as formas (os CHECK de hoje têm nome automático: troca pelo catálogo)
-- ============================================================================================================
do $w1$
declare r record;
begin
  for r in select c.conname from pg_constraint c where c.conrelid = '{schema}.contas'::regclass and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%recebimento_modo%' loop
    execute format('alter table {schema}.contas drop constraint %I', r.conname);
  end loop;
  for r in select c.conname from pg_constraint c where c.conrelid = '{schema}.cobrancas'::regclass and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%forma%' and pg_get_constraintdef(c.oid) ilike '%pix_manual%' loop
    execute format('alter table {schema}.cobrancas drop constraint %I', r.conname);
  end loop;
end $w1$;
alter table {schema}.contas add constraint contas_recebimento_modo_check
  check (recebimento_modo in ('pix_manual', 'nenhum', 'mercadopago', 'infinitepay'));
alter table {schema}.cobrancas add constraint cobrancas_forma_check
  check (forma is null or forma in ('pix_manual', 'mp', 'manual', 'infinitepay'));

-- ============================================================================================================
-- 2. A tentativa e a baixa na própria cobrança (spec-review §7, resposta 2: a cobrança já é a tentativa — o MP guarda ali também)
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists ip_handle text;            -- a InfiniteTag USADA no link (confere com ela)
alter table {schema}.cobrancas add column if not exists ip_link_url text;          -- o checkout (reaproveitado enquanto vale)
alter table {schema}.cobrancas add column if not exists ip_expira_em timestamptz;   -- 72 h (W1-B1)
alter table {schema}.cobrancas add column if not exists ip_transaction_nsu text;    -- o NSU da baixa ("pedido:<pedido do link>" = pago só pelo pedido)
alter table {schema}.cobrancas add column if not exists ip_slug text;
alter table {schema}.cobrancas add column if not exists ip_recibo_url text;         -- o recibo da InfinitePay (histórico do aluno)
alter table {schema}.cobrancas add column if not exists ip_valor_pago numeric(10,2); -- paid_amount (com as taxas que o personal repassa)
alter table {schema}.cobrancas add column if not exists ip_parcelas integer;
alter table {schema}.cobrancas add column if not exists ip_meio text;
alter table {schema}.cobrancas add column if not exists ip_conferido_em timestamptz; -- a última conferência só pelo pedido (1 a cada 30 s)
alter table {schema}.cobrancas drop constraint if exists cobrancas_ip_check;
alter table {schema}.cobrancas add constraint cobrancas_ip_check check (
      (ip_handle is null or ip_handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$')
  and (ip_link_url is null or (char_length(ip_link_url) <= 2048 and ip_link_url like 'https://%'))   -- o link medido no máximo: 486
  and (ip_recibo_url is null or (char_length(ip_recibo_url) <= 2048 and ip_recibo_url like 'https://%'))
  and (ip_transaction_nsu is null or char_length(ip_transaction_nsu) between 1 and 80)
  and (ip_slug is null or char_length(ip_slug) <= 80)
  and (ip_parcelas is null or ip_parcelas between 1 and 12)
  and (ip_meio is null or ip_meio in ('pix', 'credit_card'))
  and (ip_valor_pago is null or ip_valor_pago > 0));
-- idempotência da baixa: o mesmo NSU da mesma InfiniteTag vale 1 vez (a doc não diz se o NSU é único entre contas da InfinitePay)
create unique index if not exists cobrancas_ip_transaction_uq on {schema}.cobrancas (ip_handle, ip_transaction_nsu) where ip_transaction_nsu is not null;
create index if not exists cobrancas_ip_tentativas_idx on {schema}.cobrancas (paciente_id, ip_expira_em)
  where forma = 'infinitepay' and status = 'aguardando_confirmacao';

-- ============================================================================================================
-- 3. A integração: 1 por conta e provedor (W1: a InfiniteTag; a W2 amplia o CHECK e acrescenta as colunas do MP da conta)
-- ============================================================================================================
create table if not exists {schema}.recebimento_integracoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  provedor text not null,
  infinitepay_handle text,
  status text not null default 'ativa',
  testado_em timestamptz,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conta_id, provedor)
);
alter table {schema}.recebimento_integracoes drop constraint if exists recebimento_integracoes_check;
alter table {schema}.recebimento_integracoes add constraint recebimento_integracoes_check check (
  provedor in ('infinitepay') and status in ('ativa', 'erro')
  and (provedor <> 'infinitepay' or (infinitepay_handle is not null and infinitepay_handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$')));
comment on table {schema}.recebimento_integracoes is
  'W1: a forma de receber da conta num provedor (a InfiniteTag). Só o servidor; o dono grava pela recebimento_infinitepay_salvar.';
drop trigger if exists trg_recebimento_integracoes_atualizado_em on {schema}.recebimento_integracoes;
create trigger trg_recebimento_integracoes_atualizado_em before update on {schema}.recebimento_integracoes
  for each row execute function {schema}.set_atualizado_em();
alter table {schema}.recebimento_integracoes enable row level security;
revoke all on table {schema}.recebimento_integracoes from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.recebimento_integracoes to service_role;

-- ============================================================================================================
-- 3b. Os links (I4 da revisão): um order_nsu por link — '<cobranca_id>-<n>' — com a InfiniteTag e o preço DAQUELE link. A
--     conferência usa os 2 (o personal pode trocar de tag). A InfinitePay ACEITA order_nsu repetido (sondado em 11/10: 2 links com o
--     mesmo deram 200), então a unicidade é nossa (a chave). Só o servidor.
-- ============================================================================================================
create table if not exists {schema}.infinitepay_links (
  pedido text primary key,
  cobranca_id uuid not null references {schema}.cobrancas(id) on delete cascade,
  n integer not null,
  handle text not null,
  centavos integer not null,
  url text,
  criado_em timestamptz not null default now(),
  unique (cobranca_id, n)
);
alter table {schema}.infinitepay_links drop constraint if exists infinitepay_links_check;
alter table {schema}.infinitepay_links add constraint infinitepay_links_check check (
      pedido = cobranca_id::text || '-' || n::text and n between 1 and 9999
  and handle ~ '^[a-z0-9][a-z0-9._-]{1,39}$' and centavos > 0
  and (url is null or (char_length(url) <= 2048 and url like 'https://%')));
comment on table {schema}.infinitepay_links is
  'W1: um order_nsu por link da InfinitePay (<cobranca_id>-<n>), com a InfiniteTag e o preço daquele link. Só o servidor.';
alter table {schema}.infinitepay_links enable row level security;
revoke all on table {schema}.infinitepay_links from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.infinitepay_links to service_role;

-- ============================================================================================================
-- 4. A caixa de avisos: 1 por (link, NSU, slug) — um POST forjado com o mesmo NSU e outro slug NÃO apaga o aviso verdadeiro;
--    cada um é conferido no payment_check (a InfiniteTag e o preço vêm do LINK, não do aviso)
-- ============================================================================================================
create table if not exists {schema}.infinitepay_avisos (
  id bigint generated always as identity primary key,
  cobranca_id uuid not null references {schema}.cobrancas(id) on delete cascade,
  pedido text not null references {schema}.infinitepay_links(pedido) on delete cascade,
  transaction_nsu text not null,
  slug text not null default '',
  recibo_url text,
  meio text,
  origem text not null,
  recebido_em timestamptz not null default now(),
  tentativas integer not null default 0,
  tentado_em timestamptz,
  proxima_em timestamptz not null default now(),
  conferido_em timestamptz,
  resultado text,
  unique (pedido, transaction_nsu, slug)
);
alter table {schema}.infinitepay_avisos drop constraint if exists infinitepay_avisos_check;
alter table {schema}.infinitepay_avisos add constraint infinitepay_avisos_check check (
      char_length(transaction_nsu) between 1 and 80 and char_length(slug) <= 80
  and (recibo_url is null or (char_length(recibo_url) <= 2048 and recibo_url like 'https://%'))
  and (meio is null or meio in ('pix', 'credit_card'))
  and origem in ('webhook', 'volta', 'pedido') and tentativas >= 0
  and (resultado is null or resultado in ('pago', 'ja_pago', 'ja_pago_por_fora', 'nsu_novo', 'outro_pagamento', 'nsu_repetido', 'nao_pago',
                                         'valor_diferente', 'desistiu')));
comment on table {schema}.infinitepay_avisos is
  'W1: o que chegou da InfinitePay (webhook, volta da página, conferência só do pedido) — a baixa só depois do payment_check. Só o servidor.';
create index if not exists infinitepay_avisos_pendentes_idx on {schema}.infinitepay_avisos (proxima_em) where conferido_em is null;
create index if not exists infinitepay_avisos_cobranca_idx on {schema}.infinitepay_avisos (cobranca_id);   -- o teto de 20 por cobrança (I6)
alter table {schema}.infinitepay_avisos enable row level security;
revoke all on table {schema}.infinitepay_avisos from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.infinitepay_avisos to service_role;

-- ============================================================================================================
-- 5. A flag (o mesmo lugar dos outros ajustes do master; publica = false: só o servidor lê)
-- ============================================================================================================
insert into {schema}.app_config (chave, valor, publica) values ('infinitepay', '{"liberada": false}'::jsonb, false)
on conflict (chave) do nothing;

-- ============================================================================================================
-- 6. A guarda da conta (corpo da 20261002040000_w28_virada.sql:25-49) + a InfinitePay só com a integração ativa
-- ============================================================================================================
-- o ajudante da guarda (que roda como o app): só responde a quem é da conta ou ao master
create or replace function {schema}.recebimento_integracao_ativa(p_conta uuid, p_provedor text) returns boolean
language sql stable security definer set search_path = '' as $$
  select ({schema}.eh_master() or {schema}.sou_membro(p_conta))
     and exists (select 1 from {schema}.recebimento_integracoes i
                  where i.conta_id = p_conta and i.provedor = p_provedor and i.status = 'ativa');
$$;
revoke all on function {schema}.recebimento_integracao_ativa(uuid, text) from public, anon;
grant execute on function {schema}.recebimento_integracao_ativa(uuid, text) to authenticated, service_role;

create or replace function {schema}.contas_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono edita nome, recebimento (menos ligar o Mercado Pago; a InfinitePay só com a integração) e o bloqueio do inadimplente
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
    -- W1: a InfinitePay só com a InfiniteTag gravada (recebimento_infinitepay_salvar)
    if new.recebimento_modo = 'infinitepay' and old.recebimento_modo is distinct from 'infinitepay'
       and not {schema}.recebimento_integracao_ativa(new.id, 'infinitepay') then
      new.recebimento_modo := old.recebimento_modo;
    end if;
  end if;
  return new;
end;
$function$;

-- ============================================================================================================
-- 7. A InfiniteTag (o dono, COMO A PESSOA): confere dono/master, a conta do app, a flag e o formato; grava ativa e testada
--    (quem chama — a pagamentos-aluno — já criou um link de R$ 1,00 com ela: a InfinitePay disse que a tag existe)
-- ============================================================================================================
create or replace function {schema}.recebimento_infinitepay_salvar(p_conta uuid, p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c {schema}.contas%rowtype;
  v_h text := lower(btrim(regexp_replace(coalesce(p_handle, ''), '^\s*\$+', '')));
  v_liberada boolean;
  v_i {schema}.recebimento_integracoes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_invalida'); end if;
  if not ({schema}.eh_master() or {schema}.sou_dono(p_conta)) then return jsonb_build_object('ok', false, 'erro', 'so_o_dono'); end if;
  if v_c.origem = 'app' and not {schema}.eh_master() then return jsonb_build_object('ok', false, 'erro', 'conta_do_app'); end if;
  if v_h = '' then
    -- tirar a InfiniteTag: só fora da InfinitePay (troque a forma antes)
    if v_c.recebimento_modo = 'infinitepay' then return jsonb_build_object('ok', false, 'erro', 'em_uso'); end if;
    delete from {schema}.recebimento_integracoes where conta_id = p_conta and provedor = 'infinitepay';
    return jsonb_build_object('ok', true, 'handle', null, 'status', null, 'testado_em', null);
  end if;
  select coalesce((a.valor ->> 'liberada')::boolean, false) into v_liberada from {schema}.app_config a where a.chave = 'infinitepay';
  if not coalesce(v_liberada, false) and not {schema}.eh_master() then
    return jsonb_build_object('ok', false, 'erro', 'infinitepay_em_teste');
  end if;
  if v_h !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then return jsonb_build_object('ok', false, 'erro', 'infinitetag_invalida'); end if;
  insert into {schema}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em, atualizado_por)
  values (p_conta, 'infinitepay', v_h, 'ativa', now(), v_uid)
  on conflict (conta_id, provedor) do update set infinitepay_handle = excluded.infinitepay_handle, status = 'ativa',
    testado_em = excluded.testado_em, atualizado_por = excluded.atualizado_por
  returning * into v_i;
  insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
  values (p_conta, 'outro', '{}'::jsonb, jsonb_build_object('w1', 'infinitetag', 'status', 'ativa'), v_uid);
  return jsonb_build_object('ok', true, 'handle', v_i.infinitepay_handle, 'status', v_i.status, 'testado_em', v_i.testado_em);
end;
$$;
revoke all on function {schema}.recebimento_infinitepay_salvar(uuid, text) from public, anon;
grant execute on function {schema}.recebimento_infinitepay_salvar(uuid, text) to authenticated, service_role;

-- ============================================================================================================
-- 8. Ligar uma chave Pix desliga as outras da conta, numa transação (antes: 2 PATCH do navegador). SECURITY INVOKER: o RLS de
--    recebimento_chaves vale (o dono e o membro dono da chave; o master) — quem não enxerga a chave recebe chave_inexistente
-- ============================================================================================================
create or replace function {schema}.recebimento_chave_ligar(p_conta uuid, p_chave uuid, p_ligar boolean) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_n integer;
begin
  if not exists (select 1 from {schema}.recebimento_chaves k where k.id = p_chave and k.conta_id = p_conta) then
    return jsonb_build_object('ok', false, 'erro', 'chave_inexistente');
  end if;
  if coalesce(p_ligar, false) then
    update {schema}.recebimento_chaves set ativa = false where conta_id = p_conta and ativa and id <> p_chave;
  end if;
  update {schema}.recebimento_chaves set ativa = coalesce(p_ligar, false) where id = p_chave and conta_id = p_conta;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'chave_inexistente'); end if;
  return jsonb_build_object('ok', true, 'id', p_chave, 'ativa', coalesce(p_ligar, false));
end;
$$;
revoke all on function {schema}.recebimento_chave_ligar(uuid, uuid, boolean) from public, anon;
grant execute on function {schema}.recebimento_chave_ligar(uuid, uuid, boolean) to authenticated, service_role;

-- ============================================================================================================
-- 9. O app não grava a tentativa nem a baixa da InfinitePay (o molde do cobrancas_guard_periodo da W-P): só o servidor e o master
-- ============================================================================================================
create or replace function {schema}.cobrancas_guard_infinitepay() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      if new.forma = 'infinitepay' then new.forma := null; end if;
      new.ip_handle := null; new.ip_link_url := null; new.ip_expira_em := null; new.ip_transaction_nsu := null; new.ip_slug := null;
      new.ip_recibo_url := null; new.ip_valor_pago := null; new.ip_parcelas := null; new.ip_meio := null; new.ip_conferido_em := null;
    else
      if new.forma is distinct from old.forma and (new.forma = 'infinitepay' or old.forma = 'infinitepay') then
        new.forma := old.forma;
      end if;
      new.ip_handle := old.ip_handle; new.ip_link_url := old.ip_link_url; new.ip_expira_em := old.ip_expira_em;
      new.ip_transaction_nsu := old.ip_transaction_nsu; new.ip_slug := old.ip_slug; new.ip_recibo_url := old.ip_recibo_url;
      new.ip_valor_pago := old.ip_valor_pago; new.ip_parcelas := old.ip_parcelas; new.ip_meio := old.ip_meio;
      new.ip_conferido_em := old.ip_conferido_em;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.cobrancas_guard_infinitepay() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_infinitepay on {schema}.cobrancas;
create trigger trg_cobrancas_guard_infinitepay before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_infinitepay();

-- ============================================================================================================
-- 10. financeiro_do_aluno() (corpo da 20261011010000_wp_planos_modalidades.sql:207-247) — W1-B1: a tentativa da InfinitePay só conta
--     como "aguardando" enquanto vale (72 h); a avulsa com a tentativa vencida volta às "abertas" (a trava e a faixa a enxergam)
-- ============================================================================================================
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
      'plano_meses', (select pa.meses from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id)
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;

-- ============================================================================================================
-- 11. O master vê a InfinitePay: a linha da conta (corpo da w28:273-306 + 'infinitepay') e a contagem em Integrações (corpo da
--     hml14d:218-249 + 'infinitepay' nos 2 resumos). O master NÃO liga a InfinitePay (só o dono, com a InfiniteTag): ele desliga pela
--     master_conta_acao('recebimento') de hoje, que já recusa modo fora da lista — ela não muda.
-- ============================================================================================================
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
                      from {schema}.recebimento_integracoes i where i.conta_id = c.id and i.provedor = 'infinitepay'))
  from {schema}.contas c where c.id = p_conta;
$$;

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

-- ============================================================================================================
-- 12. A conta encerrada (excluir_conta_profissional; master) perde a integração: a InfiniteTag não fica guardada
-- ============================================================================================================
create or replace function {schema}.contas_encerrada_sem_integracao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from {schema}.recebimento_integracoes where conta_id = new.id;
  return null;
end;
$$;
revoke all on function {schema}.contas_encerrada_sem_integracao() from public, anon, authenticated;
drop trigger if exists trg_contas_encerrada_sem_integracao on {schema}.contas;
create trigger trg_contas_encerrada_sem_integracao after update of situacao on {schema}.contas
  for each row when (new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada')
  execute function {schema}.contas_encerrada_sem_integracao();
