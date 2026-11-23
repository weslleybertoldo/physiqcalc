-- bcode-0021, item 7 no PRINCIPAL, schema {schema}: o «Exportar meus dados» traz a contagem de senha errada (login_bloqueios) —
-- as provas em transação DESFEITA (e2e/bcode0021/banco.py provas). O bloco termina SEMPRE em exceção ('R:' + um JSON): nada do que
-- ele insere fica. Devolve o md5 do corpo vivo (o banco.py compara com a constante da migração) e só booleanos.
-- Os logins são FALSOS (e-mail @prova.invalid), criados aqui dentro. O gatilho do cadastro grava também em public.profiles (no
-- staging.profiles não: @prova.invalid não é conta de teste). O bloco não apaga nem faz soft delete: a exportação só lê. Tudo volta
-- na exceção: nada fica. O mesmo texto roda no PGlite (harness_e2e.mjs).
do $t$
declare
  v_k text := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_r jsonb;
  v_f regprocedure := to_regprocedure('{schema}.exportar_dados_aluno(uuid)');
  v_u uuid := gen_random_uuid();   -- a pessoa (com a linha dela e a de outro e-mail no banco)
  v_v uuid := gen_random_uuid();   -- um login sem linha
  v_e text := 'bcode0021.exporta.' || v_k || '@prova.invalid';
  v_lb jsonb;
begin
  perform set_config('lock_timeout', '5s', true);

  -- 1. o catálogo: o corpo (md5), definer com o search_path vazio e só o servidor executa
  v_r := jsonb_build_object(
    'md5', (select md5(p.prosrc) from pg_proc p where p.oid = v_f),
    'definer', coalesce((select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_proc p where p.oid = v_f), false),
    'privilegios', coalesce(v_f is not null
                            and not has_function_privilege('anon', v_f::oid, 'execute')
                            and not has_function_privilege('authenticated', v_f::oid, 'execute')
                            and has_function_privilege('service_role', v_f::oid, 'execute'), false));

  -- 2. a exportação: só a linha do e-mail do login da pessoa; sem linha → []; sem login → []
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_u, v_e, '{"full_name": "Prova bcode0021"}'),
    (v_v, 'bcode0021.semlinha.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021"}');
  insert into {schema}.login_bloqueios (email, erros, atualizado_em) values
    (v_e, 2, now()),
    ('bcode0021.outra.' || v_k || '@prova.invalid', 5, now());
  v_lb := {schema}.exportar_dados_aluno(v_u) -> 'tabelas' -> 'login_bloqueios';
  v_r := v_r || jsonb_build_object(
    'so_a_da_pessoa', case when jsonb_typeof(v_lb) = 'array'
                           then jsonb_array_length(v_lb) = 1 and v_lb -> 0 ->> 'email' = v_e else false end,
    'erros_dela', coalesce(v_lb -> 0 ->> 'erros' = '2', false),
    'sem_linha', coalesce(({schema}.exportar_dados_aluno(v_v) -> 'tabelas' -> 'login_bloqueios') = '[]'::jsonb, false),
    'sem_login', coalesce(({schema}.exportar_dados_aluno(gen_random_uuid()) -> 'tabelas' -> 'login_bloqueios') = '[]'::jsonb, false));

  raise exception 'R:%', v_r::text;
end
$t$;
