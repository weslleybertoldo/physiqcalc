-- bcode-0021, item 2 no PRINCIPAL, schema {schema}: os códigos do IP saem no prazo — as provas em transação DESFEITA
-- (e2e/bcode0021/banco.py provas). O bloco termina SEMPRE em exceção ('R:' + um JSON só de booleanos): nada do que ele insere fica e
-- o job de verdade nunca vê as linhas. Roda o COMANDO lido de cron.job. Os códigos são inventados aqui (md5 de um sorteio: não são
-- de IP nenhum). Só toca {schema}.login_tentativas_ip e {schema}.publico_pedidos_ip.
-- O mesmo texto roda no PGlite (~/projetos/physiqcalc-scratch/bcode0021/harness_e2e.mjs).
do $t$
declare
  v_k text := md5(random()::text || clock_timestamp()::text);
  v_r jsonb;
  v_f regprocedure := to_regprocedure('{schema}.limite_ip_limpar()');
  v_cmd text;
  v_hora timestamptz := date_trunc('hour', now());
begin
  perform set_config('lock_timeout', '5s', true);

  -- 1. o catálogo: o job e a função (definer, search_path vazio, só o servidor)
  v_r := jsonb_build_object(
    'job', exists (select 1 from cron.job j where j.jobname = 'physiq-limite-ip-limpeza-{schema}' and j.active
                     and j.schedule = '19 * * * *' and j.command = 'select {schema}.limite_ip_limpar()'),
    'definer', coalesce((select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_proc p where p.oid = v_f), false),
    'privilegios', coalesce(v_f is not null
                            and not has_function_privilege('anon', v_f::oid, 'execute')
                            and not has_function_privilege('authenticated', v_f::oid, 'execute')
                            and has_function_privilege('service_role', v_f::oid, 'execute'), false));

  -- 2. o prazo, pelo comando do job: o login parado há 47 h e a hora pública de 23 h saem; 45 h, 21 h e a hora corrente ficam
  insert into {schema}.login_tentativas_ip (ip_hash, atualizado_em) values
    ('a' || v_k, now() - interval '47 hours'),
    ('b' || v_k, now() - interval '45 hours');
  insert into {schema}.publico_pedidos_ip (ip_hash, rota, janela, n) values
    ('a' || v_k, 'diario_link', v_hora - interval '23 hours', 1),
    ('b' || v_k, 'diario_link', v_hora - interval '21 hours', 1),
    ('c' || v_k, 'diario_link', v_hora, 1);
  select j.command into v_cmd from cron.job j where j.jobname = 'physiq-limite-ip-limpeza-{schema}' and j.active;
  if v_cmd is not null then
    execute v_cmd;
  end if;
  v_r := v_r || jsonb_build_object(
    'login_47h', not exists (select 1 from {schema}.login_tentativas_ip where ip_hash = 'a' || v_k),
    'login_45h', exists (select 1 from {schema}.login_tentativas_ip where ip_hash = 'b' || v_k),
    'publico_23h', not exists (select 1 from {schema}.publico_pedidos_ip where ip_hash = 'a' || v_k),
    'publico_21h', exists (select 1 from {schema}.publico_pedidos_ip where ip_hash = 'b' || v_k),
    'publico_hora_atual', exists (select 1 from {schema}.publico_pedidos_ip where ip_hash = 'c' || v_k));

  raise exception 'R:%', v_r::text;
end
$t$;
