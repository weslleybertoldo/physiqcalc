-- Physiq hml-19d (H-41 · jeito 2 · 11/10/2026) — as gravações do Financeiro que precisam ser TUDO OU NADA (ou 1 vez só) viram RPCs
-- (banco principal, staging + public). Idempotente; 3 funções novas — nenhuma tabela, coluna, policy, grant de tabela, gatilho ou dado muda.
--
-- O porquê: o Financeiro (Painel › Financeiro e o Financeiro do aluno) gravava do navegador em vários pedidos, sem transação — as sementes
-- do 1º acesso (6 categorias e o "Recibo padrão"; o lancamentos.ts:84 criava as categorias SEM conta), o recibo emitido (o recibo + a
-- movimentação de origem apontando para ele + o texto regravado com o número real: 2 a 3 pedidos) e o recibo excluído (o recibo à Lixeira
-- + a movimentação solta: 2 pedidos). Falhou no meio → sobrava metade (a movimentação apontando para um recibo na Lixeira não ganha outro).
-- Agora a tela chama a função financeiro (hml-19d) e a função chama UMA destas RPCs COMO A PESSOA (a sessão de quem chama — nenhuma
-- chave secreta):
--
--   financeiro_garantir_padroes(p_conta uuid, p_categorias text[], p_modelo jsonb)
--       → jsonb { ok, criados: { categorias, modelos }, categorias: [{ id, nome, nutricionista_id }], modelos: [{ id, nutricionista_id,
--         titulo, conteudo, favorito }] }
--     as categorias (p_categorias: os nomes, 1 a 20, sem repetir) e o modelo do recibo (p_modelo: { titulo, conteudo, favorito }) da
--     pessoa, CADA conjunto só se ela não tem nenhum VIVO (deleted_at nulo) — a regra do garantir de hoje (listar as próprias vivas; vazia
--     → gravar). Sempre com a conta (p_conta, uma conta em que quem chama trabalha — senão 'sem_acesso'). Trava por pessoa e schema
--     (pg_advisory_xact_lock): 2 chamadas ao mesmo tempo → a 2ª espera a 1ª e já acha os vivos (1 conjunto só, N8). O índice único das
--     categorias é PARCIAL (nome por pessoa entre as VIVAS, 20260919110000_financeiro.sql) → nada de on conflict: a trava e o "só se
--     não tem nenhuma viva" bastam. Devolve as 2 listas vivas da pessoa (o que as telas usam). Os textos moram com a função
--     (supabase-principal/functions/_shared/financeiro-gravar-regras.ts), que os manda aqui.
--   financeiro_emitir_recibo(p_recibo jsonb) → uuid (o recibo)
--     o recibo (dono = auth.uid(); o NÚMERO continua vindo do gatilho numerar_recibo de hoje) + a movimentação de origem apontando para
--     ele (transacoes.recibo_id; não achou ou o RLS esconde → 'nao_encontrado' e NADA fica — nem o número) + o TEXTO FINAL com o número
--     REAL: a tela aplica as tags como hoje, com uma MARCA (chr(1) || 'NUMERO_RECIBO' || chr(1)) no lugar do valor da tag
--     *|NUMERO_RECIBO|*, e aqui a marca vira o número formatado como o formatarNumeroRecibo da tela (src/financeiro/recibos.ts:
--     String(n).padStart(4, "0") — 4 dígitos com zero à esquerda; acima disso, o número inteiro: o lpad do Postgres CORTARIA 12345 em
--     "1234"). Tudo na mesma transação (hoje: 2 a 3 pedidos, dados.ts:326/333/338).
--   financeiro_excluir_recibo(p_recibo uuid) → integer (as movimentações soltas)
--     o recibo à Lixeira (deleted_at) e as movimentações que apontavam para ele soltas (recibo_id nulo), juntos (hoje: 2 pedidos,
--     dados.ts:347/349 e recibos.ts:192/194). Não achou ou o RLS esconde → 'nao_encontrado' e nada muda.
--
--   Todas: SECURITY INVOKER com search_path '' (o RLS de hoje vale dentro: a pessoa só grava o que já podia gravar pelas tabelas — as
--   próprias, as da conta para o dono, o master); o dono vem SEMPRE de auth.uid(), nunca do corpo; sem login → 'sem_login' (42501);
--   corpo fora da forma → 'dados_invalidos' (22023). As outras gravações do Financeiro (movimentação, categoria, modelo, as tags do
--   aluno) são CRUD declarativo na função, tabela por tabela, como na nutricao. Não toca cobrancas, planos_aluno, automaticas_fila,
--   contas, recebimento_chaves nem as colunas de cobrança de pacientes; não recria financeiro_do_aluno, mensalidade_recalcular nem as
--   leituras da hml-14b (financeiro_lancamentos, financeiro_resumo_periodo, financeiro_recibos).
--   Grants: o logado (a função chama como a pessoa) e o servidor — revoke de public e anon (docs/banco-permissoes.md).
--
-- Ordem: staging = depois de publicar a financeiro e ANTES do push do front; produção = ANTES do merge. O front antigo não chama nada
-- daqui (não quebra).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011120000_hml19d_financeiro_atomicas.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011120000_hml19d_financeiro_atomicas.sql --so public
-- Reversa (só DEPOIS de reverter o front): supabase-principal/reversas/20261011120000_hml19d_financeiro_atomicas_reversa.sql

-- ============================================================================================================
-- 1. As sementes do 1º acesso: as categorias e o modelo do recibo (cada conjunto 1 vez só, com a conta)
-- ============================================================================================================
create or replace function {schema}.financeiro_garantir_padroes(p_conta uuid, p_categorias text[], p_modelo jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cat integer := 0;
  v_mod integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_conta is null
     or p_categorias is null or cardinality(p_categorias) not between 1 and 20
     or exists (select 1 from unnest(p_categorias) as x(nome) where x.nome is null or btrim(x.nome) = '' or char_length(x.nome) > 60)
     or (select count(distinct lower(x.nome)) from unnest(p_categorias) as x(nome)) <> cardinality(p_categorias)
     or p_modelo is null or jsonb_typeof(p_modelo) <> 'object'
     or coalesce(btrim(p_modelo ->> 'titulo'), '') = '' or coalesce(btrim(p_modelo ->> 'conteudo'), '') = '' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  -- a conta das sementes é uma em que quem chama trabalha (o "dono da conta" passa a ver estas linhas: nunca a conta de outro)
  if not {schema}.sou_membro(p_conta) then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  -- 1 de cada vez por pessoa e schema (as 2 listas da tela abrindo juntas, 2 abas): a 2ª espera a 1ª e já acha os vivos
  perform pg_advisory_xact_lock(hashtext('financeiro_garantir_padroes:{schema}:' || v_uid::text));

  if not exists (select 1 from {schema}.categorias_financeiras c where c.nutricionista_id = v_uid and c.deleted_at is null) then
    insert into {schema}.categorias_financeiras (nutricionista_id, conta_id, nome)
    select v_uid, p_conta, x.nome from unnest(p_categorias) with ordinality as x(nome, n) order by x.n;
    get diagnostics v_cat = row_count;
  end if;
  if not exists (select 1 from {schema}.modelos_recibo m where m.nutricionista_id = v_uid and m.deleted_at is null) then
    insert into {schema}.modelos_recibo (nutricionista_id, conta_id, titulo, conteudo, favorito)
    values (v_uid, p_conta, p_modelo ->> 'titulo', p_modelo ->> 'conteudo', coalesce((p_modelo ->> 'favorito')::boolean, true));
    get diagnostics v_mod = row_count;
  end if;

  -- as listas vivas da pessoa (o listarCategorias e o listarModelosRecibo de hoje: nutricionista_id = quem chama, fora da Lixeira)
  return jsonb_build_object(
    'ok', true,
    'criados', jsonb_build_object('categorias', v_cat, 'modelos', v_mod),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'nutricionista_id', c.nutricionista_id) order by c.nome, c.id)
                              from {schema}.categorias_financeiras c where c.nutricionista_id = v_uid and c.deleted_at is null), '[]'::jsonb),
    'modelos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nutricionista_id', m.nutricionista_id, 'titulo', m.titulo, 'conteudo', m.conteudo,
                                                             'favorito', m.favorito) order by m.favorito desc, m.titulo, m.id)
                           from {schema}.modelos_recibo m where m.nutricionista_id = v_uid and m.deleted_at is null), '[]'::jsonb));
end;
$$;

-- ============================================================================================================
-- 2. Emitir o recibo: o recibo + a movimentação de origem + o texto com o número real, juntos
-- ============================================================================================================
create or replace function {schema}.financeiro_emitir_recibo(p_recibo jsonb) returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_marca constant text := chr(1) || 'NUMERO_RECIBO' || chr(1);
  v_transacao uuid;
  v_id uuid;
  v_numero integer;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_recibo is null or jsonb_typeof(p_recibo) <> 'object'
     or p_recibo ->> 'paciente_id' is null or p_recibo ->> 'valor' is null or p_recibo ->> 'data' is null
     or p_recibo ->> 'descricao' is null or p_recibo ->> 'texto' is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  v_transacao := (p_recibo ->> 'transacao_id')::uuid;

  -- o número nasce do gatilho de hoje (numerar_recibo: o maior do profissional + 1, com trava por profissional; número não volta)
  insert into {schema}.recibos (nutricionista_id, conta_id, paciente_id, transacao_id, modelo_id, valor, data, descricao, texto)
  values (v_uid, (p_recibo ->> 'conta_id')::uuid, (p_recibo ->> 'paciente_id')::uuid, v_transacao, (p_recibo ->> 'modelo_id')::uuid,
          (p_recibo ->> 'valor')::numeric, (p_recibo ->> 'data')::date, p_recibo ->> 'descricao', p_recibo ->> 'texto')
  returning id, numero into v_id, v_numero;

  -- nasceu de uma movimentação: ela passa a apontar para o recibo (não achou ou o RLS esconde → nada fica: a transação volta inteira)
  if v_transacao is not null then
    update {schema}.transacoes t set recibo_id = v_id where t.id = v_transacao;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
  end if;

  -- o texto final: a marca vira o número REAL, formatado como o formatarNumeroRecibo da tela (padStart(4, "0"), sem cortar)
  if position(v_marca in (p_recibo ->> 'texto')) > 0 then
    update {schema}.recibos r
       set texto = replace(p_recibo ->> 'texto', v_marca,
                           case when char_length(v_numero::text) >= 4 then v_numero::text else lpad(v_numero::text, 4, '0') end)
     where r.id = v_id;
  end if;
  return v_id;
end;
$$;

-- ============================================================================================================
-- 3. Excluir o recibo: o recibo à Lixeira e a movimentação solta, juntos
-- ============================================================================================================
create or replace function {schema}.financeiro_excluir_recibo(p_recibo uuid) returns integer
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_recibo is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  update {schema}.recibos r set deleted_at = now() where r.id = p_recibo returning r.id into v_id;
  if v_id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  -- a movimentação de origem volta a ficar sem recibo (pode ganhar outro)
  update {schema}.transacoes t set recibo_id = null where t.recibo_id = p_recibo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- a tela chama pela função financeiro, COMO A PESSOA: o logado e o servidor; o visitante não (os default privileges dão a todos)
revoke all on function {schema}.financeiro_garantir_padroes(uuid, text[], jsonb) from public, anon;
revoke all on function {schema}.financeiro_emitir_recibo(jsonb) from public, anon;
revoke all on function {schema}.financeiro_excluir_recibo(uuid) from public, anon;
grant execute on function {schema}.financeiro_garantir_padroes(uuid, text[], jsonb) to authenticated, service_role;
grant execute on function {schema}.financeiro_emitir_recibo(jsonb) to authenticated, service_role;
grant execute on function {schema}.financeiro_excluir_recibo(uuid) to authenticated, service_role;

-- ============================================================================================================
-- 4. Conferência (desfaz tudo se algo sair diferente) — nada é gravado: as recusas acontecem antes de qualquer linha
-- ============================================================================================================
do $$
declare
  v_f text;
  v_nada text := '{"sub":"00000000-0000-4000-8000-0000000000dd"}';
  v_um uuid := '00000000-0000-4000-8000-0000000000ee';
begin
  foreach v_f in array array[
    '{schema}.financeiro_garantir_padroes(uuid, text[], jsonb)', '{schema}.financeiro_emitir_recibo(jsonb)',
    '{schema}.financeiro_excluir_recibo(uuid)'] loop
    -- INVOKER (o RLS vale dentro) e com search_path fixo
    if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-19d: % tem de ser SECURITY INVOKER e ter search_path', v_f;
    end if;
    -- só o logado e o servidor
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-19d: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;

  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação): recusa com sem_login, antes de tudo
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    perform {schema}.financeiro_garantir_padroes(v_um, array['Consulta'], '{"titulo": "x", "conteudo": "y"}'::jsonb);
    raise exception 'hml-19d: financeiro_garantir_padroes sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_emitir_recibo('{}'::jsonb);
    raise exception 'hml-19d: financeiro_emitir_recibo sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_excluir_recibo(v_um);
    raise exception 'hml-19d: financeiro_excluir_recibo sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  -- com um login qualquer (que não existe): o corpo fora da forma recusa ANTES de olhar as tabelas
  perform set_config('request.jwt.claims', v_nada, true);
  begin
    perform {schema}.financeiro_garantir_padroes(null, array['Consulta'], '{"titulo": "x", "conteudo": "y"}'::jsonb);
    raise exception 'hml-19d: financeiro_garantir_padroes sem conta não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_garantir_padroes(v_um, array['Consulta', 'consulta'], '{"titulo": "x", "conteudo": "y"}'::jsonb);
    raise exception 'hml-19d: financeiro_garantir_padroes com categoria repetida não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_garantir_padroes(v_um, array['Consulta'], '{"titulo": " ", "conteudo": "y"}'::jsonb);
    raise exception 'hml-19d: financeiro_garantir_padroes com modelo sem título não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_emitir_recibo('[]'::jsonb);
    raise exception 'hml-19d: financeiro_emitir_recibo com recibo que não é objeto não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_emitir_recibo('{"paciente_id": "00000000-0000-4000-8000-0000000000ee", "valor": 10, "data": "2026-10-11"}'::jsonb);
    raise exception 'hml-19d: financeiro_emitir_recibo sem descrição e texto não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.financeiro_excluir_recibo(null);
    raise exception 'hml-19d: financeiro_excluir_recibo sem recibo não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$$;

notify pgrst, 'reload schema';
