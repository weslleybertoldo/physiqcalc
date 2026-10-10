-- Physiq hml-17 (H-38 · 10/10/2026) — o plano alimentar do aluno montado NO BANCO para o painel (banco principal, staging + public).
-- Idempotente; só funções (nenhuma tabela, coluna, policy, dado ou grant de tabela muda).
--
-- O porquê (H-38): o painel lia o plano direto das tabelas, com o alimento embutido (planos_alimentares → refeicoes →
-- itens_refeicao → alimentos + medidas_caseiras). Quem VÊ o plano é quem vê o aluno (pode_ver_aluno: o dono da conta, o personal e a
-- nutricionista do aluno com papel, a nutri sem conta) ou o master; mas o RLS de alimentos só deixa ler a TACO, os próprios e (o
-- aluno) os da nutri dele. O personal, o dono e a nutri que herdou o aluno recebiam o item SEM o alimento ("Alimento removido",
-- 0 kcal): o mesmo plano dava 1.894 kcal para a nutri e para a aluna e 1.540 para o personal (staging, 10/10). Agora o plano vem
-- destas funções, que conferem quem vê o aluno e montam o plano com os alimentos de verdade (o molde da minha_dieta, que o app do
-- aluno já usa). O RLS de alimentos e de medidas_caseiras NÃO muda: o alimento da nutri só sai junto do plano que a pessoa já vê.
-- As gravações do editor seguem pelas tabelas (RLS de hoje). A soma das kcal continua no front (as funções puras de dietaUtil.ts).
--
--   plano_alimentar_json(p_plano)   INTERNA (sem EXECUTE para public, anon e authenticated; SECURITY INVOKER — só roda dentro das 3
--     abaixo, como o dono): o plano no MESMO formato do select de hoje do src/nutricao/editor/lib/planos.ts (SELECT_PLANO):
--     to_jsonb(plano) + refeicoes [to_jsonb(refeição) + itens [to_jsonb(item) + alimento { id, nome, fonte, grupo, energia_kcal,
--     proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg, medidas_caseiras: [todas, to_jsonb, pela ordem] } + receita
--     { id, nome }]]. O alimento na lixeira continua vindo (como no embed de hoje). Plano que não existe → null.
--   planos_do_aluno(p_aluno)        os planos vivos do aluno (deleted_at nulo), do mais novo para o mais velho → jsonb (lista).
--     Sem login → erro 'sem_login' (42501). Quem não vê o aluno (ou aluno que não existe) → [] (a mesma resposta do RLS de hoje,
--     sem dizer se o aluno existe).
--   plano_alimentar(p_plano)        1 plano vivo → jsonb. Sem login → 'sem_login'. Não existe, na lixeira ou a pessoa não vê → null.
--   planos_favoritos()              os planos ★ vivos que a pessoa vê, do mais recente (updated_at) para o mais antigo, cada um com
--     paciente { id, nome, conta_id } ("Usar um modelo ★" e Ferramentas › Modelos) → jsonb (lista). Sem login → 'sem_login'.
--   Quem vê: eh_master() or pode_ver_aluno(o aluno do plano) — a mesma regra das policies de leitura de hoje (planos, refeições e
--   itens). As 3 são SECURITY DEFINER com search_path = '' e só o logado e o servidor executam.
--
-- Ordem (o front novo chama as 3): staging = esta migração ANTES do push do front; produção = ANTES do merge. O front antigo não
-- chama nada daqui (não quebra).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261010100000_hml17_planos_do_aluno.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261010100000_hml17_planos_do_aluno.sql --so public  [--dry-run]
-- Reversa (só DEPOIS de reverter o front): supabase-principal/reversas/20261010100000_hml17_planos_do_aluno_reversa.sql

-- ============================================================================================================
-- 1. A montadora (interna): o plano com refeições, itens, alimentos (+ todas as medidas caseiras) e receita
-- ============================================================================================================
create or replace function {schema}.plano_alimentar_json(p_plano uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(pl) || jsonb_build_object(
    'refeicoes', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
               'itens', coalesce((
                 select jsonb_agg(to_jsonb(i) || jsonb_build_object(
                          'alimento', (
                            select jsonb_build_object(
                                     'id', a.id, 'nome', a.nome, 'fonte', a.fonte, 'grupo', a.grupo,
                                     'energia_kcal', a.energia_kcal, 'proteina_g', a.proteina_g, 'carboidrato_g', a.carboidrato_g,
                                     'lipidio_g', a.lipidio_g, 'fibra_g', a.fibra_g, 'sodio_mg', a.sodio_mg,
                                     'medidas_caseiras', coalesce((
                                       select jsonb_agg(to_jsonb(m) order by m.ordem, m.created_at, m.id)
                                         from {schema}.medidas_caseiras m
                                        where m.alimento_id = a.id), '[]'::jsonb))
                              from {schema}.alimentos a
                             where a.id = i.alimento_id),
                          'receita', (
                            select jsonb_build_object('id', rc.id, 'nome', rc.nome)
                              from {schema}.receitas rc
                             where rc.id = i.receita_id))
                        order by i.ordem, i.created_at, i.id)
                   from {schema}.itens_refeicao i
                  where i.refeicao_id = r.id), '[]'::jsonb))
             order by r.ordem, r.horario nulls last, r.nome, r.id)
        from {schema}.refeicoes r
       where r.plano_id = pl.id), '[]'::jsonb))
    from {schema}.planos_alimentares pl
   where pl.id = p_plano;
$$;

-- interna: ninguém chama pela API (os default privileges dão EXECUTE a todos em função nova)
revoke all on function {schema}.plano_alimentar_json(uuid) from public, anon, authenticated;
grant execute on function {schema}.plano_alimentar_json(uuid) to service_role;

-- ============================================================================================================
-- 2. Os planos do aluno (Painel › aluno › Dieta, card do Resumo, adesão, "Editar treino e dieta", Acompanhamento)
-- ============================================================================================================
create or replace function {schema}.planos_do_aluno(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  -- quem não vê o aluno (ou aluno que não existe): a lista vazia, como o RLS de hoje
  if p_aluno is null or not ({schema}.eh_master() or {schema}.pode_ver_aluno(p_aluno)) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg({schema}.plano_alimentar_json(pl.id) order by pl.created_at desc, pl.id desc)
      from {schema}.planos_alimentares pl
     where pl.paciente_id = p_aluno and pl.deleted_at is null), '[]'::jsonb);
end;
$$;

revoke all on function {schema}.planos_do_aluno(uuid) from public, anon;
grant execute on function {schema}.planos_do_aluno(uuid) to authenticated, service_role;

-- ============================================================================================================
-- 3. Um plano (o editor aberto; a cópia recém-duplicada)
-- ============================================================================================================
create or replace function {schema}.plano_alimentar(p_plano uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_aluno uuid;
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  select pl.paciente_id into v_aluno
    from {schema}.planos_alimentares pl
   where pl.id = p_plano and pl.deleted_at is null;
  -- não existe, na lixeira ou a pessoa não vê o aluno: null (a mesma resposta nos 3 casos)
  if v_aluno is null or not ({schema}.eh_master() or {schema}.pode_ver_aluno(v_aluno)) then
    return null;
  end if;
  return {schema}.plano_alimentar_json(p_plano);
end;
$$;

revoke all on function {schema}.plano_alimentar(uuid) from public, anon;
grant execute on function {schema}.plano_alimentar(uuid) to authenticated, service_role;

-- ============================================================================================================
-- 4. Os planos ★ ("Usar um modelo ★" e Ferramentas › Modelos — o front filtra os da pessoa e os da conta ativa)
-- ============================================================================================================
create or replace function {schema}.planos_favoritos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg({schema}.plano_alimentar_json(pl.id) || jsonb_build_object(
             'paciente', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'conta_id', p.conta_id)
                            from {schema}.pacientes p
                           where p.id = pl.paciente_id))
           order by pl.updated_at desc nulls last, pl.id)
      from {schema}.planos_alimentares pl
     where pl.favorito and pl.deleted_at is null
       and ({schema}.eh_master() or {schema}.pode_ver_aluno(pl.paciente_id))), '[]'::jsonb);
end;
$$;

revoke all on function {schema}.planos_favoritos() from public, anon;
grant execute on function {schema}.planos_favoritos() to authenticated, service_role;

-- ============================================================================================================
-- 5. Conferência (desfaz tudo se algo sair diferente)
-- ============================================================================================================
do $$
declare
  v_nada uuid := '00000000-0000-4000-8000-0000000000aa';
  v_f text;
  v_itens_tabela bigint;
  v_itens_json bigint;
  v_sem_alimento bigint;
begin
  -- as 3 da API: SECURITY DEFINER com search_path; a interna: INVOKER com search_path
  foreach v_f in array array['{schema}.planos_do_aluno(uuid)', '{schema}.plano_alimentar(uuid)', '{schema}.planos_favoritos()'] loop
    if not (select p.prosecdef and p.proconfig is not null from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-17: % sem SECURITY DEFINER ou sem search_path', v_f;
    end if;
    -- só o logado e o servidor
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-17: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;
  if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p
       where p.oid = '{schema}.plano_alimentar_json(uuid)'::regprocedure) then
    raise exception 'hml-17: plano_alimentar_json tem de ser SECURITY INVOKER com search_path';
  end if;
  if has_function_privilege('anon', '{schema}.plano_alimentar_json(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', '{schema}.plano_alimentar_json(uuid)', 'EXECUTE') then
    raise exception 'hml-17: plano_alimentar_json não pode ter EXECUTE para anon nem authenticated (é interna)';
  end if;

  -- a montadora rodando de verdade: plano que não existe → null; e, nos planos vivos do schema, os mesmos itens das tabelas e
  -- nenhum item com alimento_id sem o alimento no JSON (a FK garante o alimento; é o que o H-38 corrige)
  if {schema}.plano_alimentar_json(v_nada) is not null then
    raise exception 'hml-17: plano_alimentar_json de um plano que não existe tem de ser null';
  end if;
  select count(*) into v_itens_tabela
    from {schema}.planos_alimentares pl
    join {schema}.refeicoes r on r.plano_id = pl.id
    join {schema}.itens_refeicao i on i.refeicao_id = r.id
   where pl.deleted_at is null;
  select count(*), count(*) filter (where it ->> 'alimento_id' is not null and jsonb_typeof(it -> 'alimento') is distinct from 'object')
    into v_itens_json, v_sem_alimento
    from {schema}.planos_alimentares pl
    cross join lateral jsonb_array_elements({schema}.plano_alimentar_json(pl.id) -> 'refeicoes') rf
    cross join lateral jsonb_array_elements(rf -> 'itens') it
   where pl.deleted_at is null;
  if v_itens_json <> v_itens_tabela or v_sem_alimento <> 0 then
    raise exception 'hml-17: a montadora deu % itens (tabelas: %), % sem o alimento', v_itens_json, v_itens_tabela, v_sem_alimento;
  end if;

  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação): as 3 recusam com sem_login
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    perform {schema}.planos_do_aluno(v_nada);
    raise exception 'hml-17: planos_do_aluno sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.plano_alimentar(v_nada);
    raise exception 'hml-17: plano_alimentar sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.planos_favoritos();
    raise exception 'hml-17: planos_favoritos sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
end
$$;

notify pgrst, 'reload schema';
