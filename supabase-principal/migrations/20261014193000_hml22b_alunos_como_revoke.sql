-- Homologação do Physiq — hml-22b / H-147 (14/10/2026). Idempotente. Nenhum dado muda.
-- A alunos_como (W13, o repasse dos convites do APK antigo) é uma função interna: só a função `alunos` chama, no modo servidor, com a
-- chave de serviço (supabase-principal/functions/alunos/index.ts, repasse). Os grants da W13 tiraram o EXECUTE só de public e anon; a
-- hml-01b (H-02) fechou as outras internas da W13 e esta ficou de fora. Aqui ela fica como as internas (docs/banco-permissoes.md, "só o
-- servidor"): sem EXECUTE para public, anon e authenticated; o service_role segue.
-- Quem chama, conferido em 14/10/2026: o app (src/), as funções dos 2 projetos, os E2E e o banco (funções, views, policies, gatilhos,
-- defaults e o pg_cron) — só a `alunos`, com a chave de serviço.
-- A assinatura sai do catálogo (pg_get_function_identity_arguments) e vale para toda versão da função no schema. Sem nenhuma, ou com o
-- logado/visitante ainda executando (ou o servidor sem executar) depois do revoke → erro, e a transação volta inteira.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging (depois --so public, com backup).

do $$
declare
  f record;
  n integer := 0;
begin
  for f in
    select pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
     where p.pronamespace = '{schema}'::regnamespace and p.proname = 'alunos_como'
  loop
    execute format('revoke execute on function %I.alunos_como(%s) from public, anon, authenticated', '{schema}', f.args);
    execute format('grant execute on function %I.alunos_como(%s) to service_role', '{schema}', f.args);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'hml-22b: a função {schema}.alunos_como não existe';
  end if;
  if exists (select 1
               from pg_proc p
              where p.pronamespace = '{schema}'::regnamespace and p.proname = 'alunos_como'
                and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
                     or not has_function_privilege('service_role', p.oid, 'EXECUTE'))) then
    raise exception 'hml-22b: a {schema}.alunos_como não ficou só para o servidor';
  end if;
end
$$;

notify pgrst, 'reload schema';
