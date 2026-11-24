-- bcode-0021, item 3a no PRINCIPAL, schema {schema}: os avisos de erro saem em até 30 dias — as provas em transação DESFEITA
-- (e2e/bcode0021/banco.py provas). O bloco termina SEMPRE em exceção ('R:' + um JSON só de booleanos): nada do que ele insere fica e
-- o job de verdade nunca vê as linhas. Roda o COMANDO lido de cron.job (o comando inteiro mora no job). As assinaturas são sorteadas
-- aqui (on conflict do nothing: a que bater com uma de verdade não entra, e a "insercao" sai falsa — rode de novo).
-- Só toca {schema}.avisos_erro e {schema}.avisos_erro_hora. O mesmo texto roda no PGlite (harness_e2e.mjs).
do $t$
declare
  v_r jsonb;
  v_cmd text;
  v_n integer;
  v_hora timestamptz := date_trunc('hour', now());
  -- A, E, B, C, D e F (a ordem da especificação: A, E e F saem; B, C e D ficam)
  v_a text[] := array(select substr(md5(random()::text || clock_timestamp()::text || g::text), 1, 8) from generate_series(1, 6) g);
begin
  perform set_config('lock_timeout', '5s', true);

  -- 1. o catálogo: o job, com o comando da migração
  v_r := jsonb_build_object(
    'job', exists (select 1 from cron.job j where j.jobname = 'physiq-avisos-erro-limpeza-{schema}' and j.active and j.schedule = '47 * * * *'
                     and j.command = $c$with velhos as (delete from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < now() - interval '29 days 22 hours') delete from {schema}.avisos_erro_hora where hora < now() - interval '29 days 22 hours'$c$));

  -- 2. o prazo, pelo comando do job
  insert into {schema}.avisos_erro (assinatura, primeiro_em, ultimo_aviso_em) values
    (v_a[1], now() - interval '31 days', null),                          -- A: o primeiro há 31 d → sai
    (v_a[2], now() - interval '29 days 23 hours 30 minutes', null),       -- E: há 29 d 23 h 30 min → sai
    (v_a[3], now() - interval '40 days', now() - interval '2 days'),      -- B: o primeiro há 40 d, o último aviso há 2 d → fica
    (v_a[4], now(), null),                                                -- C: agora → fica
    (v_a[5], now() - interval '29 days 21 hours', null),                  -- D: há 29 d 21 h → fica
    (v_a[6], now() - interval '29 days 22 hours 30 minutes', null)        -- F: há 29 d 22 h 30 min → sai (o corte é 29 d 22 h)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into {schema}.avisos_erro_hora (hora, n) values
    (v_hora - interval '31 days', 1),                                     -- H1: a hora de 31 d → sai
    (v_hora - interval '29 days', 1)                                      -- H2: a hora de 29 d → fica
  on conflict do nothing;
  select j.command into v_cmd from cron.job j where j.jobname = 'physiq-avisos-erro-limpeza-{schema}' and j.active;
  if v_cmd is not null then
    execute v_cmd;
  end if;
  v_r := v_r || jsonb_build_object(
    'insercao', v_n = 6,
    'a_31d', not exists (select 1 from {schema}.avisos_erro where assinatura = v_a[1]),
    'e_29d23h30', not exists (select 1 from {schema}.avisos_erro where assinatura = v_a[2]),
    'b_ultimo_recente', exists (select 1 from {schema}.avisos_erro where assinatura = v_a[3]),
    'c_agora', exists (select 1 from {schema}.avisos_erro where assinatura = v_a[4]),
    'd_29d21h', exists (select 1 from {schema}.avisos_erro where assinatura = v_a[5]),
    'f_29d22h30', not exists (select 1 from {schema}.avisos_erro where assinatura = v_a[6]),
    'h1_31d', not exists (select 1 from {schema}.avisos_erro_hora where hora = v_hora - interval '31 days'),
    'h2_29d', exists (select 1 from {schema}.avisos_erro_hora where hora = v_hora - interval '29 days'));

  raise exception 'R:%', v_r::text;
end
$t$;
