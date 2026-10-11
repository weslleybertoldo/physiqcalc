-- Physiq W-P (Task 8b, ponto 2 — decisão do Weslley 10/10/2026) — a FILA das cobranças automáticas. Banco principal, staging +
-- public. Idempotente. SÓ ACRESCENTA (1 tabela, 2 funções e 1 tarefa do pg_cron): nada do que existe muda.
--
-- Antes: o dono mudava o valor, os meses ou a parcela de um plano e a pagamentos-aluno fazia 1 PUT /preapproval por aluno DENTRO do
-- pedido dele (com muitos alunos os últimos caíam por tempo, e cada falha virava um aviso). Agora a pagamentos-aluno só ENFILEIRA
-- (automaticas_enfileirar — também o aluno cuja troca na hora falhou) e chama automaticas_disparar: o pg_net chama a função
-- automaticas-fila depois do commit, e o pg_cron tenta de novo de hora em hora (minuto 7). O valor NÃO fica na fila: quem processa
-- lê o mensalidade_valor ATUAL do aluno (o último valor ganha). Na 24ª falha seguida (1 dia) a fila desiste e avisa o dono.
--   {schema}.automaticas_fila           1 pendência por aluno (feito_em nulo): tentativas, proxima_em, resultado, erro, avisado_em
--   {schema}.automaticas_enfileirar(…)  põe os alunos na fila (o pendente recomeça: tentativas 0, pronto já) → quantos ficaram pendentes
--   {schema}.automaticas_disparar()     chama a automaticas-fila pelo pg_net SE há pendência pronta (o molde: espelho_disparar)
-- O teto de 24 é o MAX_TENTATIVAS de supabase-principal/functions/_shared/planos-automatica.ts (o planosAutomatica.test.ts confere).
-- Só a service_role (as funções) e o pg_cron usam: RLS ligado sem policy; nada para public/anon/authenticated (tabela e funções).
-- O segredo (S9 · contrato hml-16c): o Vault 'physiq_automaticas_fila_segredo' vai no cabeçalho x-espelho-segredo; a automaticas-fila
-- confere pela lista SEGREDO_AUTOMATICAS_FILA_ACEITOS (só o sha256). Quem grava os 2: python3 scripts/segredos/servidor.py
-- automaticas_fila gerar → aceitar → (publicar a automaticas-fila) → trocar → conferir. Sem o Vault (ou sem o pg_net) nada é chamado:
-- a fila espera. O pg_net e o pg_cron existem desde a 20260929090000_w04_cobranca.sql.
--
-- Aplicar (depois da 20261011020000; backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011030000_wp_fila_automaticas.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011030000_wp_fila_automaticas.sql --so public
-- Testes do banco (staging, blocos desfeitos): python3 e2e/wp/sql_fila.py

-- ============================================================================================================
-- 1. A fila: 1 pendência por aluno (índice único parcial); o valor não fica aqui
-- ============================================================================================================
create table if not exists {schema}.automaticas_fila (
  id bigint generated always as identity primary key,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  conta_id uuid,
  motivo text not null check (motivo in ('plano', 'aluno')),
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_em timestamptz not null default now(),
  feito_em timestamptz,
  resultado text check (resultado is null or resultado in ('atualizada', 'igual', 'sem_automatica', 'desistiu')),
  erro text check (erro is null or char_length(erro) <= 200),
  avisado_em timestamptz,
  criado_em timestamptz not null default now()
);
comment on table {schema}.automaticas_fila is
  'W-P Task 8b: a fila da troca do valor das cobranças automáticas (PUT /preapproval) — a automaticas-fila esvazia. Só a service_role.';
create unique index if not exists automaticas_fila_pendente_uidx on {schema}.automaticas_fila (paciente_id) where feito_em is null;
create index if not exists automaticas_fila_prontas_idx on {schema}.automaticas_fila (proxima_em) where feito_em is null;
alter table {schema}.automaticas_fila enable row level security;
revoke all on table {schema}.automaticas_fila from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.automaticas_fila to service_role;

-- ============================================================================================================
-- 2. Enfileirar: o aluno já pendente recomeça (tentativas 0, pronto já, o motivo da vez); os outros entram com a conta do aluno
--    (aluno apagado ou inexistente fica de fora). Devolve quantos dos pedidos ficaram pendentes.
-- ============================================================================================================
create or replace function {schema}.automaticas_enfileirar(p_pacientes uuid[], p_motivo text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_motivo is null or p_motivo not in ('plano', 'aluno') then
    raise exception 'automaticas_enfileirar: motivo inválido' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_pacientes), 0) = 0 then
    return 0;
  end if;
  -- quem já está na fila recomeça: mudar o proxima_em também avisa a rodada que estiver com ele na mão (ela só fecha a pendência
  -- se o proxima_em ainda for o que ela leu — senão a pendência fica, com o valor novo)
  update {schema}.automaticas_fila f
     set tentativas = 0, proxima_em = now(), motivo = p_motivo, erro = null
   where f.feito_em is null and f.paciente_id = any (p_pacientes);
  insert into {schema}.automaticas_fila (paciente_id, conta_id, motivo)
  select pa.id, pa.conta_id, p_motivo
    from {schema}.pacientes pa
   where pa.id = any (p_pacientes) and pa.deleted_at is null
     and not exists (select 1 from {schema}.automaticas_fila f where f.paciente_id = pa.id and f.feito_em is null)
  on conflict do nothing;
  select count(*)::integer into v_n from {schema}.automaticas_fila f where f.feito_em is null and f.paciente_id = any (p_pacientes);
  return v_n;
end;
$$;

-- ============================================================================================================
-- 3. Disparar (o molde da {schema}.espelho_disparar() da 20261010040000): só chama quando há pendência pronta; sem pg_net ou sem o
--    segredo no Vault, não faz nada. Assíncrono: o pedido sai depois do commit.
-- ============================================================================================================
create or replace function {schema}.automaticas_disparar() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_segredo text;
  v_id bigint;
begin
  if not exists (select 1 from {schema}.automaticas_fila f
                  where f.feito_em is null and f.tentativas < 24 and f.proxima_em <= now()) then
    return null;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_automaticas_fila_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then
    return null;
  end if;
  select net.http_post(
    url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/automaticas-fila',
    body := jsonb_build_object('schema', '{schema}'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-espelho-segredo', v_segredo),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end;
$$;

-- só o servidor executa (os default privileges do Supabase dão EXECUTE a toda função nova)
revoke all on function {schema}.automaticas_enfileirar(uuid[], text), {schema}.automaticas_disparar() from public, anon, authenticated;
grant execute on function {schema}.automaticas_enfileirar(uuid[], text), {schema}.automaticas_disparar() to service_role;

-- ============================================================================================================
-- 4. pg_cron: de hora em hora, no minuto 7 (a pendência que falhou volta 1 hora depois). O mesmo nome ATUALIZA o job.
-- ============================================================================================================
select cron.schedule('automaticas-fila-{schema}', '7 * * * *', $$select {schema}.automaticas_disparar()$$);
