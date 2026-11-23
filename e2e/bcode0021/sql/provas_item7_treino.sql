-- bcode-0021, item 7 no BANCO DO TREINO, schema {schema}: o «Exportar meus dados» traz a contagem de limites (edge_rate_limits) dos 2
-- ids da pessoa — as provas em transação DESFEITA (e2e/bcode0021/banco.py provas). O bloco termina SEMPRE em exceção ('R:' + um
-- JSON): nada do que ele insere fica. Devolve o md5 do corpo vivo (o banco.py compara com a constante da migração) e só booleanos.
-- Os ids são inventados aqui e os logins do Treino são FALSOS (e-mail @prova.invalid), criados aqui dentro (o gatilho do cadastro
-- grava em {schema}.physiq_profiles). Toca {schema}.edge_rate_limits, {schema}.physiq_identidades, {schema}.physiq_profiles e
-- auth.users, no mesmo schema; tudo volta na exceção. O mesmo texto roda no PGlite (harness_e2e.mjs).
do $t$
declare
  v_k text := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_r jsonb;
  v_f regprocedure := to_regprocedure('{schema}.physiq_exportar_aluno(uuid)');
  v_p uuid := gen_random_uuid();   -- a pessoa: o id dela no principal
  v_t uuid := gen_random_uuid();   -- e o login dela no Treino (com vínculo)
  v_t2 uuid := gen_random_uuid();  -- login do Treino sem vínculo (só a linha pelo id de lá)
  v_t3 uuid := gen_random_uuid();  -- login do Treino sem linha nenhuma
  v_viz uuid := gen_random_uuid(); -- o vizinho
  v_e jsonb;
  v_e2 jsonb;
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

  -- 2. a exportação: CONTÉM as 2 linhas da pessoa (pelo id do Treino e pelo do principal) e nenhuma de outra; sem linha → [];
  --    sem vínculo → só as do id do Treino
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_t, 'bcode0021.t1.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021", "ambiente": "{schema}"}'),
    (v_t2, 'bcode0021.t2.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021", "ambiente": "{schema}"}'),
    (v_t3, 'bcode0021.t3.' || v_k || '@prova.invalid', '{"full_name": "Prova bcode0021", "ambiente": "{schema}"}');
  insert into {schema}.physiq_identidades (principal_user_id, treino_user_id, email, origem)
    values (v_p, v_t, 'bcode0021.t1.' || v_k || '@prova.invalid', 'criado');
  insert into {schema}.edge_rate_limits (user_id, endpoint) values
    (v_p, 'trocar-token'), (v_t, 'admin-update-user'), (v_viz, 'trocar-token'), (v_t2, 'admin-update-user');
  v_e := {schema}.physiq_exportar_aluno(v_t) -> 'tabelas' -> 'edge_rate_limits';
  v_e2 := {schema}.physiq_exportar_aluno(v_t2) -> 'tabelas' -> 'edge_rate_limits';
  v_r := v_r || jsonb_build_object(
    'contem_as_2', case when jsonb_typeof(v_e) = 'array'
                        then (select count(distinct x ->> 'user_id') = 2 from jsonb_array_elements(v_e) x
                               where x ->> 'user_id' in (v_p::text, v_t::text)) else false end,
    'nenhuma_de_outro', case when jsonb_typeof(v_e) = 'array'
                             then not exists (select 1 from jsonb_array_elements(v_e) x where x ->> 'user_id' not in (v_p::text, v_t::text))
                             else false end,
    'sem_linha', coalesce(({schema}.physiq_exportar_aluno(v_t3) -> 'tabelas' -> 'edge_rate_limits') = '[]'::jsonb, false),
    'sem_vinculo', case when jsonb_typeof(v_e2) = 'array'
                        then jsonb_array_length(v_e2) = 1 and v_e2 -> 0 ->> 'user_id' = v_t2::text else false end);

  raise exception 'R:%', v_r::text;
end
$t$;
