-- Physiq hml-21d (H-43 · jeito 2, etapa 3 · 13/10/2026) no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) — as 2 gravações do
-- Treino que precisam ser TUDO OU NADA viram RPCs (achados 3 e 4 da spec hml-21 §1.9). Idempotente; 2 funções NOVAS — nenhuma tabela,
-- coluna, policy, gatilho, grant de tabela, bucket ou dado muda.
--
-- O porquê: o navegador gravava em vários pedidos em série, sem transação:
--   · salvar um treino pronto do aluno sem profissional (Master › App do aluno › Treinos prontos — src/master/app/treinosProntos.ts,
--     salvarTreinoPronto) = 2 + 2×N pedidos: o update (ou insert) do treino, o delete das divisões e, por divisão, o insert dela e o dos
--     exercícios — uma falha no meio deixava o treino SEM as divisões (ou com metade delas);
--   · reordenar os exercícios de um modelo (Painel › Treinos › Detalhe — src/painel/treinos/api.ts, ordenarModelo) = 1 update por
--     exercício, em série — uma falha no meio deixava metade na ordem nova.
-- Agora a tela chama a função treinos (hml-21d: treino_pronto_salvar, modelo_ordenar) e a função chama UMA destas RPCs COMO A PESSOA
-- (a sessão do Treino de quem chama — nenhuma chave secreta):
--
--   treino_pronto_salvar(p_id uuid, p_treino jsonb, p_divisoes jsonb) → uuid (o id do treino pronto)
--     o MESMO efeito do salvarTreinoPronto de hoje, NA MESMA ORDEM e numa transação: com p_id, o update da linha do treino (as colunas
--     da tela: codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, ativo) e o delete das divisões dele (os
--     exercícios saem junto — a FK em cascata); sem p_id, o insert da linha; depois, cada divisão na ordem da lista (ordem = a posição,
--     a partir de 1: letra, nome, dias) e os exercícios dela na ordem da lista (ordem = a posição, a partir de 1: exercicio_id, series,
--     reps, descanso_segundos, observacao). Os valores vão COMO VIERAM (a tela já manda limpos — o trim e os padrões do código e da
--     divisão são os de hoje, na lib); as regras das tabelas (CHECK, UNIQUE, FK) seguem valendo. p_id que não existe ou que o RLS não
--     deixa mudar → 'nao_encontrado' e NADA muda (hoje o update de 0 linha "dava certo" e os inserts seguintes falhavam pela FK).
--     Quem grava: o RLS de hoje ("treinos prontos: master tudo" — physiq_is_master(), o app_metadata.role admin/master do JWT); quem
--     não é master recebe nao_encontrado (o update não acha a linha) ou sem_acesso (42501, o insert recusado pelo RLS).
--   modelo_ordenar(p_grupo uuid, p_ids uuid[]) → integer (quantas linhas mudaram)
--     o MESMO efeito do "1 pedido por exercício" de hoje numa transação: o tb_grupos_exercicios de cada exercício da lista (p_ids = os
--     exercicio_id na ordem da tela) ganha a ordem = a posição, a partir de 0 (hoje: { ordem: i }). Lista vazia, com nulo ou repetida →
--     'dados_invalidos'; um id que não é do modelo, o modelo que não existe ou que o RLS não deixa mudar (de outro profissional; o global
--     para quem não é master) → 'nao_encontrado' e NADA muda (hoje: os outros mudavam e esse ficava calado).
--
--   As 2: SECURITY INVOKER com search_path '' (o RLS de hoje vale dentro — o master, o dono do modelo); o dono vem SEMPRE de auth.uid()
--   pelo RLS, nunca do corpo; sem login → 'sem_login' (42501); corpo fora da forma → 'dados_invalidos' (22023); o que não existe ou o
--   RLS esconde → 'nao_encontrado' (P0002) e NADA muda. Grants: o logado (a função chama como a pessoa) e o servidor — revoke de public
--   e anon (docs/banco-permissoes.md).
--
-- Ordem: staging = ANTES de publicar a função treinos (as ações treino_pronto_salvar e modelo_ordenar chamam estas RPCs) e do push do
-- front; produção = ANTES do merge. O front antigo não chama nada daqui (não quebra).
-- Roda 1x por ambiente, na MESMA chamada (Management API database/query; dry-run com begin … rollback; o molde da hml-14d):
--   set physiq.schemas = 'staging'; <este arquivo>      ← primeiro
--   set physiq.schemas = 'public';  <este arquivo>      (produção, no F8, com backup antes)
-- Reversa (só DEPOIS de reverter o front e a função treinos): supabase/reversas/20261013100000_hml21d_treinos_atomicas_reversa.sql
do $mig$
declare
  v_amb text := current_setting('physiq.schemas', true);
  v_f text;
  v_nada text := '{"sub":"00000000-0000-4000-8000-0000000000bb","role":"authenticated"}';
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;

  -- ===== 1. Salvar um treino pronto (master): a linha, as divisões e os exercícios, juntos
  execute format($sql$
create or replace function %1$I.treino_pronto_salvar(p_id uuid, p_treino jsonb, p_divisoes jsonb) returns uuid
language plpgsql volatile security invoker set search_path = '' as $b$
declare
  v_id uuid;
  v_dias integer;
  v_ordem integer;
  v_grupo uuid;
  d record;
  e jsonb;
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  -- a forma (antes de olhar as tabelas): o treino é um objeto com as colunas da tela, cada uma no tipo dela; as divisões, uma lista de
  -- 1 a 26 (as letras A–Z); cada divisão com a letra, o nome, os dias (textos) e os exercícios (até 100), cada exercício com o
  -- exercicio_id (uuid), as séries (inteiro), as repetições (texto), o descanso (inteiro ou nulo) e a observação (texto ou nula)
  begin
    if jsonb_typeof(p_treino) is distinct from 'object' or jsonb_typeof(p_divisoes) is distinct from 'array'
       or jsonb_array_length(p_divisoes) not between 1 and 26
       or jsonb_typeof(p_treino -> 'codigo') is distinct from 'string' or char_length(p_treino ->> 'codigo') not between 1 and 100
       or jsonb_typeof(p_treino -> 'nome') is distinct from 'string' or jsonb_typeof(p_treino -> 'objetivo') is distinct from 'string'
       or jsonb_typeof(p_treino -> 'nivel') is distinct from 'string' or jsonb_typeof(p_treino -> 'divisao') is distinct from 'string'
       or coalesce(jsonb_typeof(p_treino -> 'descricao'), 'null') not in ('string', 'null')
       or jsonb_typeof(p_treino -> 'ativo') is distinct from 'boolean'
       or jsonb_typeof(p_treino -> 'dias_por_semana') is distinct from 'number' or jsonb_typeof(p_treino -> 'ordem') is distinct from 'number' then
      raise exception 'dados_invalidos' using errcode = '22023';
    end if;
    v_dias := (p_treino ->> 'dias_por_semana')::integer;
    v_ordem := (p_treino ->> 'ordem')::integer;
    for d in select x.value as divisao from jsonb_array_elements(p_divisoes) x loop
      if jsonb_typeof(d.divisao) is distinct from 'object' or jsonb_typeof(d.divisao -> 'letra') is distinct from 'string'
         or jsonb_typeof(d.divisao -> 'nome') is distinct from 'string' or jsonb_typeof(d.divisao -> 'dias') is distinct from 'array'
         or jsonb_typeof(d.divisao -> 'exercicios') is distinct from 'array' or jsonb_array_length(d.divisao -> 'exercicios') > 100
         or exists (select 1 from jsonb_array_elements(d.divisao -> 'dias') y where jsonb_typeof(y.value) is distinct from 'string') then
        raise exception 'dados_invalidos' using errcode = '22023';
      end if;
      for e in select z.value from jsonb_array_elements(d.divisao -> 'exercicios') z loop
        if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e -> 'exercicio_id') is distinct from 'string'
           or (e ->> 'exercicio_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(e -> 'series') is distinct from 'number' or jsonb_typeof(e -> 'reps') is distinct from 'string'
           or coalesce(jsonb_typeof(e -> 'descanso_segundos'), 'null') not in ('number', 'null')
           or coalesce(jsonb_typeof(e -> 'observacao'), 'null') not in ('string', 'null') then
          raise exception 'dados_invalidos' using errcode = '22023';
        end if;
        perform (e ->> 'series')::integer, (e ->> 'descanso_segundos')::integer;
      end loop;
    end loop;
  exception when invalid_text_representation or numeric_value_out_of_range then
    -- o número que não é inteiro (3.5) ou passa do integer
    raise exception 'dados_invalidos' using errcode = '22023';
  end;

  if p_id is not null then
    -- 1º a linha (o RLS de hoje decide: só o master muda); 0 linha (não existe, ou não é master) → nada muda
    update %1$I.physiq_treinos_prontos t
       set codigo = p_treino ->> 'codigo', nome = p_treino ->> 'nome', objetivo = p_treino ->> 'objetivo', nivel = p_treino ->> 'nivel',
           dias_por_semana = v_dias, divisao = p_treino ->> 'divisao', descricao = p_treino ->> 'descricao', ordem = v_ordem,
           ativo = (p_treino ->> 'ativo')::boolean
     where t.id = p_id
    returning t.id into v_id;
    if v_id is null then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    -- 2º as divisões de antes (os exercícios delas saem junto: a FK em cascata), como o delete de hoje
    delete from %1$I.physiq_treinos_prontos_grupos g where g.treino_id = v_id;
  else
    insert into %1$I.physiq_treinos_prontos (codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, ativo)
    values (p_treino ->> 'codigo', p_treino ->> 'nome', p_treino ->> 'objetivo', p_treino ->> 'nivel', v_dias, p_treino ->> 'divisao',
            p_treino ->> 'descricao', v_ordem, (p_treino ->> 'ativo')::boolean)
    returning id into v_id;
  end if;

  -- 3º cada divisão na ordem da lista (ordem = a posição, a partir de 1) e os exercícios dela (ordem = a posição, a partir de 1)
  for d in select x.value as divisao, x.ordinality as n from jsonb_array_elements(p_divisoes) with ordinality x loop
    insert into %1$I.physiq_treinos_prontos_grupos (treino_id, letra, nome, dias, ordem)
    values (v_id, d.divisao ->> 'letra', d.divisao ->> 'nome',
            array(select y.value from jsonb_array_elements_text(d.divisao -> 'dias') with ordinality y(value, n) order by y.n),
            d.n::integer)
    returning id into v_grupo;
    insert into %1$I.physiq_treinos_prontos_exercicios (grupo_id, exercicio_id, ordem, series, reps, descanso_segundos, observacao)
    select v_grupo, (z.value ->> 'exercicio_id')::uuid, z.n::integer, (z.value ->> 'series')::integer, z.value ->> 'reps',
           (z.value ->> 'descanso_segundos')::integer, z.value ->> 'observacao'
      from jsonb_array_elements(d.divisao -> 'exercicios') with ordinality z(value, n)
     order by z.n;
  end loop;
  return v_id;
end;
$b$
$sql$, v_amb);
  execute format('comment on function %I.treino_pronto_salvar(uuid, jsonb, jsonb) is %L', v_amb,
    'hml-21d (H-43): salvar um treino pronto do app (a linha, as divisões e os exercícios) numa transação — o MESMO efeito do '
    'salvarTreinoPronto de hoje. SECURITY INVOKER (o RLS de quem chama: só o master grava).');

  -- ===== 2. Reordenar os exercícios de um modelo: todos de uma vez
  execute format($sql$
create or replace function %1$I.modelo_ordenar(p_grupo uuid, p_ids uuid[]) returns integer
language plpgsql volatile security invoker set search_path = '' as $b$
declare
  v_n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  -- a forma: o modelo e a lista (1 dimensão, de 1 a 1000 exercícios, sem nulo nem repetido)
  if p_grupo is null or p_ids is null or coalesce(array_ndims(p_ids), 0) <> 1 or cardinality(p_ids) not between 1 and 1000
     or array_position(p_ids, null) is not null
     or (select count(distinct x.id) from unnest(p_ids) x(id)) <> cardinality(p_ids) then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  -- a ordem = a posição na lista, a partir de 0 (o { ordem: i } de hoje); o RLS de hoje decide quem muda (o dono do modelo, o master)
  update %1$I.tb_grupos_exercicios ge
     set ordem = (x.n - 1)::integer
    from unnest(p_ids) with ordinality x(exercicio_id, n)
   where ge.grupo_id = p_grupo and ge.exercicio_id = x.exercicio_id;
  get diagnostics v_n = row_count;
  -- um id que não é do modelo, o modelo que não existe ou que o RLS esconde → nada muda (a transação volta inteira)
  if v_n <> cardinality(p_ids) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  return v_n;
end;
$b$
$sql$, v_amb);
  execute format('comment on function %I.modelo_ordenar(uuid, uuid[]) is %L', v_amb,
    'hml-21d (H-43): a ordem dos exercícios de um modelo (Painel › Treinos) numa transação — o MESMO efeito do "1 pedido por '
    'exercício" de hoje. SECURITY INVOKER (o RLS de quem chama: o dono do modelo ou o master).');

  -- o app chama pela função treinos, COMO A PESSOA: o logado e o servidor; o visitante não (os default privileges dão a todos)
  execute format('revoke all on function %I.treino_pronto_salvar(uuid, jsonb, jsonb) from public, anon', v_amb);
  execute format('revoke all on function %I.modelo_ordenar(uuid, uuid[]) from public, anon', v_amb);
  execute format('grant execute on function %I.treino_pronto_salvar(uuid, jsonb, jsonb) to authenticated, service_role', v_amb);
  execute format('grant execute on function %I.modelo_ordenar(uuid, uuid[]) to authenticated, service_role', v_amb);

  -- ===== 3. Conferência (desfaz tudo se algo sair diferente) — nada é gravado: as recusas acontecem antes de qualquer linha
  foreach v_f in array array[format('%I.treino_pronto_salvar(uuid, jsonb, jsonb)', v_amb), format('%I.modelo_ordenar(uuid, uuid[])', v_amb)] loop
    -- INVOKER (o RLS vale dentro), VOLATILE (grava) e com search_path fixo
    if (select p.prosecdef or p.proconfig is null or p.provolatile <> 'v' from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-21d: % tem de ser SECURITY INVOKER, VOLATILE e ter search_path', v_f;
    end if;
    -- só o logado e o servidor
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-21d: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;

  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação): recusa com sem_login, antes de tudo
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    execute format('select %I.treino_pronto_salvar(null, %L::jsonb, %L::jsonb)', v_amb, '{}', '[]');
    raise exception 'hml-21d: treino_pronto_salvar sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    execute format('select %I.modelo_ordenar(%L::uuid, %L::uuid[])', v_amb, '00000000-0000-4000-8000-0000000000cc', '{}');
    raise exception 'hml-21d: modelo_ordenar sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  -- com um login qualquer (que não existe): o corpo fora da forma recusa ANTES de olhar as tabelas
  perform set_config('request.jwt.claims', v_nada, true);
  begin
    execute format('select %I.treino_pronto_salvar(null, %L::jsonb, %L::jsonb)', v_amb, '{"codigo":"x"}', '[]');
    raise exception 'hml-21d: treino_pronto_salvar sem divisões não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    execute format('select %I.modelo_ordenar(%L::uuid, %L::uuid[])', v_amb, '00000000-0000-4000-8000-0000000000cc',
                   '{00000000-0000-4000-8000-0000000000dd,00000000-0000-4000-8000-0000000000dd}');
    raise exception 'hml-21d: modelo_ordenar com id repetido não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$mig$;

-- o PostgREST relê o schema (as 2 RPCs novas aparecem na hora)
notify pgrst, 'reload schema';
