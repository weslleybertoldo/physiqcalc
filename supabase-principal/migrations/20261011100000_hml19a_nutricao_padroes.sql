-- Physiq hml-19a (H-81 · jeito 2 · 11/10/2026) — os PADRÕES do 1º acesso da nutrição nascem no SERVIDOR, 1 vez só (banco principal,
-- staging + public). Idempotente; só 1 função nova (nenhuma tabela, coluna, policy, grant de tabela ou dado muda).
--
-- O porquê (H-81): as seções Anamnese, Documentos e Exames do Prontuário (e Manipulados, Metas e Orientações da Dieta) "garantiam" os
-- modelos padrão NO NAVEGADOR a cada abertura: listar → se não tem, gravar de 1 a 12 linhas. Com o useAuth() instável
-- (src/nutricao/editor/ui/contexto.ts) a Anamnese repetia isso sem fim (227 POST em ~10 s, hml-18), e 2 abas abertas juntas podiam
-- gravar o padrão 2 vezes (não há índice único). Agora a tela chama a função nutricao › padroes_garantir 1 vez por abertura, e a
-- função chama esta RPC COMO A PESSOA (a sessão de quem chama — nenhuma chave secreta):
--
--   nutricao_garantir_padroes(p_secao text, p_itens jsonb) → jsonb { ok, secao, criados }
--     SECURITY INVOKER com search_path '' (o RLS de hoje vale dentro: a pessoa só grava os PRÓPRIOS — nutricionista_id = auth.uid() —
--     e a restritiva da W3 segue valendo: só quem escreve nutrição grava na biblioteca; quem não pode recebe o 42501 do RLS).
--     · sem login → 'sem_login' (42501); seção fora da lista fechada → 'secao_invalida' (22023); p_itens que não é uma lista de 1 a 30
--       objetos → 'itens_invalidos' (22023);
--     · trava por pessoa + seção + schema (pg_advisory_xact_lock): 2 chamadas ao mesmo tempo → a 2ª espera a 1ª terminar e já acha os
--       próprios (1 conjunto só);
--     · grava os p_itens com nutricionista_id = auth.uid() SÓ se a pessoa não tem NENHUM próprio vivo (deleted_at nulo) na tabela da
--       seção — a regra do garantir de hoje na Anamnese (temModeloProprio); nas outras seções a tela olhava a lista que o RLS mostra
--       (a mesma coisa para quem não é master);
--     · as 6 seções já aqui (a hml-19b não precisa de migration para as sementes da Dieta): anamnese → modelos_anamnese · documento →
--       modelos_documento · exame → exames_catalogo · formula → modelos_formula · meta → modelos_meta · orientacao →
--       modelos_orientacao. As colunas de cada uma são fixas (chave a mais em p_itens é ignorada; a que falta pega o padrão da coluna).
--   Os textos dos padrões moram com a função (supabase-principal/functions/_shared/nutricao-padroes.ts), que os manda em p_itens.
--   Grants: o logado (a função chama como a pessoa) e o servidor — revoke de public e anon (docs/banco-permissoes.md).
--
-- Ordem: staging = depois de publicar a nutricao e ANTES do push do front; produção = ANTES do merge. O front antigo não chama nada
-- daqui (não quebra).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011100000_hml19a_nutricao_padroes.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011100000_hml19a_nutricao_padroes.sql --so public
-- Reversa (só DEPOIS de reverter o front): supabase-principal/reversas/20261011100000_hml19a_nutricao_padroes_reversa.sql

-- ============================================================================================================
-- 1. A RPC
-- ============================================================================================================
create or replace function {schema}.nutricao_garantir_padroes(p_secao text, p_itens jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tem boolean := false;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_secao is null or p_secao not in ('anamnese', 'documento', 'exame', 'formula', 'meta', 'orientacao') then
    raise exception 'secao_invalida' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 30
     or exists (select 1 from jsonb_array_elements(p_itens) e where jsonb_typeof(e) <> 'object') then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;

  -- 1 de cada vez por pessoa, seção e schema (as 2 abas, o laço antigo): a 2ª espera a 1ª e já acha os próprios
  perform pg_advisory_xact_lock(hashtext('nutricao_garantir_padroes:{schema}:' || p_secao || ':' || v_uid::text));

  if p_secao = 'anamnese' then
    select exists (select 1 from {schema}.modelos_anamnese m where m.nutricionista_id = v_uid and m.deleted_at is null) into v_tem;
    if not v_tem then
      insert into {schema}.modelos_anamnese (nutricionista_id, titulo, perguntas, favorito)
      select v_uid, x.titulo, coalesce(x.perguntas, '[]'::jsonb), coalesce(x.favorito, true)
        from jsonb_to_recordset(p_itens) as x(titulo text, perguntas jsonb, favorito boolean);
      get diagnostics v_n = row_count;
    end if;
  elsif p_secao = 'documento' then
    select exists (select 1 from {schema}.modelos_documento m where m.nutricionista_id = v_uid and m.deleted_at is null) into v_tem;
    if not v_tem then
      insert into {schema}.modelos_documento (nutricionista_id, tipo, titulo, conteudo, favorito)
      select v_uid, x.tipo, x.titulo, coalesce(x.conteudo, ''), coalesce(x.favorito, true)
        from jsonb_to_recordset(p_itens) as x(tipo text, titulo text, conteudo text, favorito boolean);
      get diagnostics v_n = row_count;
    end if;
  elsif p_secao = 'exame' then
    select exists (select 1 from {schema}.exames_catalogo m where m.nutricionista_id = v_uid and m.deleted_at is null) into v_tem;
    if not v_tem then
      insert into {schema}.exames_catalogo (nutricionista_id, nome, unidade, ref_min, ref_max, referencia_texto, favorito)
      select v_uid, x.nome, coalesce(x.unidade, ''), x.ref_min, x.ref_max, coalesce(x.referencia_texto, ''), coalesce(x.favorito, true)
        from jsonb_to_recordset(p_itens) as x(nome text, unidade text, ref_min numeric, ref_max numeric, referencia_texto text, favorito boolean);
      get diagnostics v_n = row_count;
    end if;
  elsif p_secao = 'formula' then
    select exists (select 1 from {schema}.modelos_formula m where m.nutricionista_id = v_uid and m.deleted_at is null) into v_tem;
    if not v_tem then
      insert into {schema}.modelos_formula (nutricionista_id, titulo, ativos, posologia, quantidade, observacao, favorito)
      select v_uid, x.titulo, coalesce(x.ativos, '[]'::jsonb), coalesce(x.posologia, ''), coalesce(x.quantidade, ''), coalesce(x.observacao, ''),
             coalesce(x.favorito, true)
        from jsonb_to_recordset(p_itens) as x(titulo text, ativos jsonb, posologia text, quantidade text, observacao text, favorito boolean);
      get diagnostics v_n = row_count;
    end if;
  elsif p_secao = 'meta' then
    select exists (select 1 from {schema}.modelos_meta m where m.nutricionista_id = v_uid and m.deleted_at is null) into v_tem;
    if not v_tem then
      insert into {schema}.modelos_meta (nutricionista_id, titulo, descricao, dias_semana, favorito)
      select v_uid, x.titulo, coalesce(x.descricao, ''), coalesce(x.dias_semana, '{1,2,3,4,5,6,7}'::smallint[]), coalesce(x.favorito, true)
        from jsonb_to_recordset(p_itens) as x(titulo text, descricao text, dias_semana smallint[], favorito boolean);
      get diagnostics v_n = row_count;
    end if;
  else -- 'orientacao'
    select exists (select 1 from {schema}.modelos_orientacao m where m.nutricionista_id = v_uid and m.deleted_at is null) into v_tem;
    if not v_tem then
      insert into {schema}.modelos_orientacao (nutricionista_id, titulo, conteudo, favorito)
      select v_uid, x.titulo, coalesce(x.conteudo, ''), coalesce(x.favorito, true)
        from jsonb_to_recordset(p_itens) as x(titulo text, conteudo text, favorito boolean);
      get diagnostics v_n = row_count;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'secao', p_secao, 'criados', v_n);
end;
$$;

-- o app chama pela função nutricao, COMO A PESSOA: o logado e o servidor; o visitante não (os default privileges dão a todos)
revoke all on function {schema}.nutricao_garantir_padroes(text, jsonb) from public, anon;
grant execute on function {schema}.nutricao_garantir_padroes(text, jsonb) to authenticated, service_role;

-- ============================================================================================================
-- 2. Conferência (desfaz tudo se algo sair diferente) — nada é gravado: as recusas acontecem antes de qualquer linha
-- ============================================================================================================
do $$
declare
  v_f text := '{schema}.nutricao_garantir_padroes(text, jsonb)';
  v_nada text := '{"sub":"00000000-0000-4000-8000-0000000000aa"}';
begin
  -- INVOKER (o RLS vale dentro) e com search_path fixo
  if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
    raise exception 'hml-19a: % tem de ser SECURITY INVOKER e ter search_path', v_f;
  end if;
  -- só o logado e o servidor
  if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
     or not has_function_privilege('service_role', v_f, 'EXECUTE') then
    raise exception 'hml-19a: % fora do esperado (só o logado e o servidor)', v_f;
  end if;

  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação): recusa com sem_login, antes de tudo
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    perform {schema}.nutricao_garantir_padroes('anamnese', '[{"titulo": "x"}]'::jsonb);
    raise exception 'hml-19a: nutricao_garantir_padroes sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  -- com um login qualquer (que não existe): a seção fora da lista e os itens fora da forma recusam ANTES de olhar as tabelas
  perform set_config('request.jwt.claims', v_nada, true);
  begin
    perform {schema}.nutricao_garantir_padroes('financeiro', '[{"titulo": "x"}]'::jsonb);
    raise exception 'hml-19a: seção fora da lista não recusou';
  exception when others then
    if sqlerrm <> 'secao_invalida' then raise; end if;
  end;
  begin
    perform {schema}.nutricao_garantir_padroes('anamnese', '[]'::jsonb);
    raise exception 'hml-19a: lista vazia não recusou';
  exception when others then
    if sqlerrm <> 'itens_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.nutricao_garantir_padroes('anamnese', '["x"]'::jsonb);
    raise exception 'hml-19a: item que não é objeto não recusou';
  exception when others then
    if sqlerrm <> 'itens_invalidos' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$$;

notify pgrst, 'reload schema';
