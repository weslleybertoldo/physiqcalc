-- bcode-0021, item 1 no PRINCIPAL, schema {schema}: as provas em transação DESFEITA (e2e/bcode0021/banco.py provas).
-- O bloco termina SEMPRE em exceção ('R:' + um JSON só de booleanos): nada do que ele insere fica e o job de verdade nunca vê as
-- linhas (molde: desfeito(), e2e/restaurar_login/api.py). O prazo roda pelo COMANDO lido de cron.job, como o pg_cron rodaria.
-- Os logins são FALSOS (e-mail @prova.invalid, domínio que não existe), criados e mexidos aqui dentro: o gatilho do cadastro e os da
-- restauração rodam e voltam junto. Só toca {schema}.login_bloqueios e auth.users (o outro schema fica de fora).
-- O mesmo texto roda no PGlite (~/projetos/physiqcalc-scratch/bcode0021/harness_e2e.mjs).
do $t$
declare
  v_k text := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_r jsonb;
  v_limpar regprocedure := to_regprocedure('{schema}.login_bloqueios_limpar()');
  v_saiu regprocedure := to_regprocedure('{schema}.login_bloqueios_saiu()');
  v_cmd text;
  v_u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
begin
  perform set_config('lock_timeout', '5s', true);

  -- 1. o catálogo: o job, as 2 funções (definer, search_path vazio, só o servidor) e os 2 gatilhos em auth.users
  v_r := jsonb_build_object(
    'job', exists (select 1 from cron.job j where j.jobname = 'physiq-login-bloqueios-limpeza-{schema}' and j.active
                     and j.schedule = '53 * * * *' and j.command = 'select {schema}.login_bloqueios_limpar()'),
    'definer', coalesce((select count(*) = 2 and bool_and(p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'])
                           from pg_proc p where p.oid in (v_limpar, v_saiu)), false),
    'privilegios', coalesce(v_limpar is not null and v_saiu is not null
                            and not has_function_privilege('anon', v_limpar::oid, 'execute')
                            and not has_function_privilege('authenticated', v_limpar::oid, 'execute')
                            and not has_function_privilege('anon', v_saiu::oid, 'execute')
                            and not has_function_privilege('authenticated', v_saiu::oid, 'execute')
                            and has_function_privilege('service_role', v_limpar::oid, 'execute'), false),
    'gatilhos', coalesce((select count(*) = 2 from pg_trigger tg
                           where tg.tgrelid = 'auth.users'::regclass and not tg.tgisinternal and tg.tgfoid = v_saiu
                             and tg.tgname in ('physiq_login_bloqueios_apagado_{schema}', 'physiq_login_bloqueios_mudou_{schema}')), false));

  -- 2. o prazo, pelo comando do job: (a), (e) e (f) saem; (b), (c), (d) e (g) ficam
  insert into {schema}.login_bloqueios (email, erros, bloqueado_ate, bloqueado_de_vez_em, em_andamento_ate, atualizado_em) values
    ('bcode0021.a.' || v_k || '@prova.invalid', 3, null, null, null, now() - interval '47 hours'),
    ('bcode0021.b.' || v_k || '@prova.invalid', 3, null, null, null, now() - interval '45 hours'),
    ('bcode0021.c.' || v_k || '@prova.invalid', 9, null, now() - interval '10 days', null, now() - interval '10 days'),
    ('bcode0021.d.' || v_k || '@prova.invalid', 8, now() + interval '1 day', null, null, now() - interval '3 days'),
    ('bcode0021.e.' || v_k || '@prova.invalid', 0, null, null, now() - interval '3 days', now() - interval '3 days'),
    ('bcode0021.f.' || v_k || '@prova.invalid', 8, now() - interval '45 hours 30 minutes', null, null, now() - interval '46 hours 30 minutes'),
    ('bcode0021.g.' || v_k || '@prova.invalid', 2, null, null, now() + interval '20 seconds', now() - interval '47 hours');
  select j.command into v_cmd from cron.job j where j.jobname = 'physiq-login-bloqueios-limpeza-{schema}' and j.active;
  if v_cmd is not null then
    execute v_cmd;
  end if;
  v_r := v_r || jsonb_build_object(
    'prazo_a', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.a.' || v_k || '@prova.invalid'),
    'prazo_b', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.b.' || v_k || '@prova.invalid'),
    'prazo_c', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.c.' || v_k || '@prova.invalid'),
    'prazo_d', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.d.' || v_k || '@prova.invalid'),
    'prazo_e', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.e.' || v_k || '@prova.invalid'),
    'prazo_f', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.f.' || v_k || '@prova.invalid'),
    'prazo_g', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.g.' || v_k || '@prova.invalid'));

  -- 3. a saída com o login (os 2 gatilhos em auth.users): 6 logins falsos, cada um com a linha do seu e-mail (o 3 e o 5 com bloqueio
  --    de vez), mais a de um e-mail sem login (bloqueio de vez)
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_u[1], 'bcode0021.troca.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021"}'),
    (v_u[2], 'bcode0021.vizinho.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021"}'),
    (v_u[3], 'bcode0021.soft.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021"}'),
    (v_u[4], 'bcode0021.softdel.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021"}'),
    (v_u[5], 'bcode0021.apagado.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021"}'),
    (v_u[6], 'Bcode0021.Maiuscula.' || v_k || '@Prova.Invalid', '{"full_name": "Prova bcode0021"}');
  insert into {schema}.login_bloqueios (email, erros, bloqueado_de_vez_em, atualizado_em)
  select lower(btrim(u.email)),
         case when u.id in (v_u[3], v_u[5]) then 9 else 2 end,
         case when u.id in (v_u[3], v_u[5]) then now() - interval '1 day' end,
         now() - interval '1 hour'
    from auth.users u where u.id = any (v_u);
  insert into {schema}.login_bloqueios (email, erros, bloqueado_de_vez_em, atualizado_em)
    values ('bcode0021.semconta.' || v_k || '@prova.invalid', 9, now() - interval '1 day', now() - interval '1 hour');

  update auth.users set email = 'bcode0021.nova.' || v_k || '@prova.invalid', updated_at = now() where id = v_u[1];
  v_r := v_r || jsonb_build_object(
    'troca_email', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.troca.' || v_k || '@prova.invalid'),
    'troca_vizinho_fica', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.vizinho.' || v_k || '@prova.invalid'));
  update auth.users set raw_user_meta_data = '{"full_name": "Outro nome"}', updated_at = now() where id = v_u[2];
  v_r := v_r || jsonb_build_object(
    'metadados', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.vizinho.' || v_k || '@prova.invalid'));
  update auth.users set email = email, last_sign_in_at = now() where id = v_u[2];
  v_r := v_r || jsonb_build_object(
    'email_igual', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.vizinho.' || v_k || '@prova.invalid'));
  -- o soft delete do profissional: e-mail embaralhado, sem senha e deleted_at no MESMO update
  update auth.users set email = replace(v_u[3]::text, '-', '') || '@embaralhado.invalid', encrypted_password = '', deleted_at = now()
   where id = v_u[3];
  v_r := v_r || jsonb_build_object(
    'soft_delete', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.soft.' || v_k || '@prova.invalid'));
  update auth.users set deleted_at = now() where id = v_u[4];
  v_r := v_r || jsonb_build_object(
    'soft_deleted_at', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.softdel.' || v_k || '@prova.invalid'));
  delete from auth.users where id = v_u[5];
  v_r := v_r || jsonb_build_object(
    'delete', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.apagado.' || v_k || '@prova.invalid'));
  delete from auth.users where id = v_u[6];
  v_r := v_r || jsonb_build_object(
    'maiuscula', not exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.maiuscula.' || v_k || '@prova.invalid'),
    'sem_conta_fica', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.semconta.' || v_k || '@prova.invalid'),
    'vizinho_fica', exists (select 1 from {schema}.login_bloqueios where email = 'bcode0021.vizinho.' || v_k || '@prova.invalid'));

  raise exception 'R:%', v_r::text;
end
$t$;
