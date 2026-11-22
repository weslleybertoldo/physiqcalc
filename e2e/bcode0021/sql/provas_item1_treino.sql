-- bcode-0021, item 1 no BANCO DO TREINO, schema {schema}: as provas em transação DESFEITA (e2e/bcode0021/banco.py provas).
-- O bloco termina SEMPRE em exceção ('R:' + um JSON só de booleanos): nada do que ele insere fica e o job de verdade nunca vê as
-- linhas. O prazo roda pelo COMANDO lido de cron.job (sem o pg_cron, o job sai falso e o prazo não roda).
-- Os ids são inventados aqui e os logins do Treino são FALSOS (e-mail @prova.invalid), criados e apagados aqui dentro (o gatilho do
-- cadastro roda e volta junto). Só toca {schema}.edge_rate_limits, {schema}.physiq_identidades e auth.users.
-- O mesmo texto roda no PGlite (~/projetos/physiqcalc-scratch/bcode0021/harness_e2e.mjs).
do $t$
declare
  v_k text := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_r jsonb;
  v_limpar regprocedure := to_regprocedure('{schema}.physiq_limites_limpar()');
  v_saiu regprocedure := to_regprocedure('{schema}.physiq_limites_vinculo_saiu()');
  v_cmd text;
  v_23 uuid := gen_random_uuid();
  v_21 uuid := gen_random_uuid();
  v_30 uuid := gen_random_uuid();
  v_p uuid := gen_random_uuid();   -- a pessoa: o id dela no principal (a trocar-token conta por ele)
  v_t uuid := gen_random_uuid();   -- e o login dela no Treino (falso)
  v_p2 uuid := gen_random_uuid();  -- a 2ª pessoa: o login do Treino apagado (o vínculo sai em cascata)
  v_t2 uuid := gen_random_uuid();
  v_viz uuid := gen_random_uuid(); -- o vizinho (só a linha pelo id do principal dele)
begin
  perform set_config('lock_timeout', '5s', true);

  -- 1. o catálogo: o pg_cron, o job, as 2 funções (definer, search_path vazio, só o servidor) e o gatilho em physiq_identidades
  v_r := jsonb_build_object('pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron'), 'job', false);
  if to_regclass('cron.job') is not null then
    v_r := v_r || jsonb_build_object(
      'job', exists (select 1 from cron.job j where j.jobname = 'physiq-limites-limpeza-{schema}' and j.active
                       and j.schedule = '17 * * * *' and j.command = 'select {schema}.physiq_limites_limpar()'));
    select j.command into v_cmd from cron.job j where j.jobname = 'physiq-limites-limpeza-{schema}' and j.active;
  end if;
  v_r := v_r || jsonb_build_object(
    'definer', coalesce((select count(*) = 2 and bool_and(p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'])
                           from pg_proc p where p.oid in (v_limpar, v_saiu)), false),
    'privilegios', coalesce(v_limpar is not null and v_saiu is not null
                            and not has_function_privilege('anon', v_limpar::oid, 'execute')
                            and not has_function_privilege('authenticated', v_limpar::oid, 'execute')
                            and not has_function_privilege('anon', v_saiu::oid, 'execute')
                            and not has_function_privilege('authenticated', v_saiu::oid, 'execute')
                            and has_function_privilege('service_role', v_limpar::oid, 'execute'), false),
    'gatilho', coalesce(exists (select 1 from pg_trigger tg
                                 where tg.tgrelid = to_regclass('{schema}.physiq_identidades') and not tg.tgisinternal
                                   and tg.tgname = 'physiq_limites_vinculo_{schema}' and tg.tgfoid = v_saiu), false));

  -- 2. o prazo, pelo comando do job: a de 23 h sai; as de 21 h e 30 min ficam (a maior janela do repo é 1 h)
  insert into {schema}.edge_rate_limits (user_id, endpoint, created_at) values
    (v_23, 'trocar-token', now() - interval '23 hours'),
    (v_21, 'trocar-token', now() - interval '21 hours'),
    (v_30, 'trocar-token', now() - interval '30 minutes');
  if v_cmd is not null then
    execute v_cmd;
  end if;
  v_r := v_r || jsonb_build_object(
    'prazo_23h', not exists (select 1 from {schema}.edge_rate_limits where user_id = v_23),
    'prazo_21h', exists (select 1 from {schema}.edge_rate_limits where user_id = v_21),
    'prazo_30min', exists (select 1 from {schema}.edge_rate_limits where user_id = v_30));

  -- 3. o vínculo apagado (como a delete-my-account) leva a linha pelo id do principal; a do id do Treino e a do vizinho ficam
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_t, 'bcode0021.t1.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021", "ambiente": "{schema}"}'),
    (v_t2, 'bcode0021.t2.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021", "ambiente": "{schema}"}');
  insert into {schema}.physiq_identidades (principal_user_id, treino_user_id, email, origem) values
    (v_p, v_t, 'bcode0021.t1.' || v_k || '@prova.invalid', 'criado'),
    (v_p2, v_t2, 'bcode0021.t2.' || v_k || '@prova.invalid', 'criado');
  insert into {schema}.edge_rate_limits (user_id, endpoint) values
    (v_p, 'trocar-token'), (v_t, 'admin-update-user'), (v_viz, 'trocar-token'), (v_p2, 'trocar-token');
  delete from {schema}.physiq_identidades where principal_user_id = v_p;
  v_r := v_r || jsonb_build_object(
    'vinculo_principal', not exists (select 1 from {schema}.edge_rate_limits where user_id = v_p),
    'vinculo_treino_fica', exists (select 1 from {schema}.edge_rate_limits where user_id = v_t),
    'vinculo_vizinho_fica', exists (select 1 from {schema}.edge_rate_limits where user_id = v_viz));

  -- 4. o login do Treino apagado: o vínculo sai em cascata (w02_espelho) e o gatilho leva a linha pelo id do principal
  delete from auth.users where id = v_t2;
  v_r := v_r || jsonb_build_object(
    'cascata_vinculo', not exists (select 1 from {schema}.physiq_identidades where principal_user_id = v_p2),
    'cascata_principal', not exists (select 1 from {schema}.edge_rate_limits where user_id = v_p2),
    'cascata_vizinho_fica', exists (select 1 from {schema}.edge_rate_limits where user_id = v_viz));

  raise exception 'R:%', v_r::text;
end
$t$;
