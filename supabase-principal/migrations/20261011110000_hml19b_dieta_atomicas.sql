-- Physiq hml-19b (H-41 · jeito 2 · 11/10/2026) — as gravações da Dieta que precisam ser TUDO OU NADA viram RPCs (banco principal,
-- staging + public). Idempotente; só 7 funções novas (nenhuma tabela, coluna, policy, grant de tabela ou dado muda).
--
-- O porquê: a Dieta (Painel › Aluno › Dieta) e as Dietas (Painel › Dietas) gravavam do navegador em vários pedidos em série, sem
-- transação — a nova prescrição (plano + 6 refeições), o duplicar/usar modelo ★ (1 + R + R' pedidos), a receita (receita + ingredientes;
-- editar = update + apagar + inserir), o alimento (alimento + medidas; editar = update + apagar + inserir), o subir/descer (N updates em
-- paralelo), o excluir grupo (receitas sem grupo + o grupo) e o "copiar pra semana toda" (update + delete). Falhou no meio → sobrava
-- metade (o plano sem refeições, a receita sem ingredientes, a ordem pela metade). Agora a tela chama a função nutricao (hml-19b,
-- módulo dieta.ts) e a função chama UMA destas RPCs COMO A PESSOA (a sessão de quem chama — nenhuma chave secreta):
--
--   dieta_criar_plano(p_paciente uuid, p_plano jsonb, p_refeicoes jsonb) → jsonb { plano, refeicoes }
--     o plano (dono = auth.uid(), método 'alimentos') + as refeições do corpo (nome, horário, ordem) — 2 pedidos → 1.
--   dieta_duplicar_plano(p_plano uuid, p_titulo text, p_paciente uuid default null) → uuid (o plano novo)
--     a cópia do plano VIVO que a pessoa vê (RLS), com as refeições e os itens (substitutos e observação; o receita_id do item não
--     vai, como na cópia de hoje), o título do corpo e o dono = auth.uid() — NUNCA o da autora (corrige o EditorDieta.tsx:358).
--     p_paciente nulo = "Duplicar" (o mesmo aluno, o cálculo energético junto); p_paciente = "Usar modelo ★" (outro aluno ou o
--     mesmo, sem o cálculo energético — como o usarPlanoModelo de hoje). 1 + R + R' pedidos → 1.
--   dieta_salvar_receita(p_receita jsonb, p_ingredientes jsonb) → uuid
--     sem p_receita.id: cria a receita (dono = auth.uid()) com os ingredientes; com id: atualiza a VIVA (só as chaves que vierem) e
--     TROCA os ingredientes (apaga e grava). A ordem do ingrediente = a posição na lista (a regra de hoje). 2–4 pedidos → 1.
--   dieta_salvar_alimento(p_alimento jsonb, p_medidas jsonb) → uuid
--     sem id: cria o alimento próprio (fonte 'proprio', dono = auth.uid()) com as medidas; com id: atualiza (só as chaves que vierem) e
--     TROCA as medidas caseiras (apaga todas e grava as novas: o medida_caseira_id dos itens e ingredientes vira nulo — o MESMO efeito
--     de hoje, spec §1.11 item 4). 2–3 pedidos → 1.
--   dieta_ordenar(p_tabela text, p_ids uuid[], p_ordens integer[]) → integer
--     a ordem de cada id (lista fechada de tabelas: refeicoes, indicacoes_produto); trava as linhas na ordem do id (2 chamadas ao mesmo
--     tempo não se cruzam: a 2ª espera a 1ª — N8) e ou muda TODAS ou nenhuma. N updates em paralelo → 1.
--   dieta_excluir_grupo_receita(p_grupo uuid) → integer (as receitas que ficaram sem grupo)
--     o grupo VIVO vai à Lixeira e as receitas vivas dele ficam sem grupo, juntos. 2 pedidos → 1.
--   dieta_copiar_semana(p_para_todos uuid[], p_para_apagar uuid[]) → jsonb { atualizadas, apagadas }
--     as refeições do dia passam a valer todos os dias (dias_semana = '{}') e as de outros dias saem (DELETE físico; as marcações do
--     aluno vão junto em cascata — o comportamento de hoje, spec §1.11 item 3), juntos.
--
--   Todas: SECURITY INVOKER com search_path '' (o RLS de hoje vale dentro: a pessoa só grava o que já podia gravar pelas tabelas —
--   a restritiva da W3, o "pela conta" da W16); o dono vem SEMPRE de auth.uid(), nunca do corpo; sem login → 'sem_login' (42501);
--   corpo fora da forma → 'dados_invalidos' (22023); o que não existe, está na Lixeira ou o RLS esconde → 'nao_encontrado' (P0002) e
--   NADA muda (a transação volta inteira). O resto do CRUD da Dieta é declarativo na função (tabela por tabela, como no Prontuário).
--   Grants: o logado (a função chama como a pessoa) e o servidor — revoke de public e anon (docs/banco-permissoes.md).
--
-- Ordem: staging = depois de publicar a nutricao com o dieta.ts e ANTES do push do front; produção = ANTES do merge. O front antigo
-- não chama nada daqui (não quebra).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011110000_hml19b_dieta_atomicas.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011110000_hml19b_dieta_atomicas.sql --so public
-- Reversa (só DEPOIS de reverter o front): supabase-principal/reversas/20261011110000_hml19b_dieta_atomicas_reversa.sql

-- ============================================================================================================
-- 1. Nova prescrição: o plano + as refeições padrão
-- ============================================================================================================
create or replace function {schema}.dieta_criar_plano(p_paciente uuid, p_plano jsonb, p_refeicoes jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_plano uuid;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_paciente is null or p_plano is null or jsonb_typeof(p_plano) <> 'object'
     or p_refeicoes is null or jsonb_typeof(p_refeicoes) <> 'array' or jsonb_array_length(p_refeicoes) > 30
     or exists (select 1 from jsonb_array_elements(p_refeicoes) e where jsonb_typeof(e) <> 'object') then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  insert into {schema}.planos_alimentares (nutricionista_id, paciente_id, metodo, calculo_energetico_id, titulo, kcal_alvo, observacao)
  values (v_uid, p_paciente, 'alimentos', (p_plano ->> 'calculo_energetico_id')::uuid, p_plano ->> 'titulo', (p_plano ->> 'kcal_alvo')::numeric,
          p_plano ->> 'observacao')
  returning id into v_plano;

  insert into {schema}.refeicoes (plano_id, nome, horario, ordem)
  select v_plano, x.nome, x.horario, coalesce(x.ordem, 0)
    from jsonb_to_recordset(p_refeicoes) as x(nome text, horario time, ordem integer);

  return jsonb_build_object(
    'plano', (select to_jsonb(p) from {schema}.planos_alimentares p where p.id = v_plano),
    'refeicoes', coalesce((select jsonb_agg(to_jsonb(r) order by r.ordem, r.created_at, r.id) from {schema}.refeicoes r where r.plano_id = v_plano),
                          '[]'::jsonb));
end;
$$;

-- ============================================================================================================
-- 2. Duplicar o plano / usar um modelo ★ (o dono é quem chama)
-- ============================================================================================================
create or replace function {schema}.dieta_duplicar_plano(p_plano uuid, p_titulo text, p_paciente uuid default null) returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_origem {schema}.planos_alimentares;
  v_novo uuid;
  v_refeicao uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_plano is null or p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  -- o plano de origem: vivo e visível para quem chama (o RLS de leitura de hoje: quem vê o aluno)
  select * into v_origem from {schema}.planos_alimentares p where p.id = p_plano and p.deleted_at is null;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;

  insert into {schema}.planos_alimentares (nutricionista_id, paciente_id, metodo, kcal_alvo, calculo_energetico_id, observacao, titulo)
  values (v_uid, coalesce(p_paciente, v_origem.paciente_id), v_origem.metodo, v_origem.kcal_alvo,
          case when p_paciente is null then v_origem.calculo_energetico_id end, v_origem.observacao, p_titulo)
  returning id into v_novo;

  for r in
    select rf.id, rf.nome, rf.horario, rf.ordem, rf.observacao, rf.dias_semana
      from {schema}.refeicoes rf where rf.plano_id = p_plano order by rf.ordem, rf.created_at, rf.id
  loop
    insert into {schema}.refeicoes (plano_id, nome, horario, ordem, observacao, dias_semana)
    values (v_novo, r.nome, r.horario, r.ordem, r.observacao, coalesce(r.dias_semana, '{}'::smallint[]))
    returning id into v_refeicao;
    insert into {schema}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, medida_caseira_id, quantidade_medida, ordem, substitutos, observacao)
    select v_refeicao, i.alimento_id, i.quantidade_g, i.medida_caseira_id, i.quantidade_medida, i.ordem, i.substitutos, i.observacao
      from {schema}.itens_refeicao i where i.refeicao_id = r.id order by i.ordem, i.created_at, i.id;
  end loop;

  return v_novo;
end;
$$;

-- ============================================================================================================
-- 3. Receita: a receita e os ingredientes juntos (criar ou editar)
-- ============================================================================================================
create or replace function {schema}.dieta_salvar_receita(p_receita jsonb, p_ingredientes jsonb) returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_receita is null or jsonb_typeof(p_receita) <> 'object'
     or p_ingredientes is null or jsonb_typeof(p_ingredientes) <> 'array' or jsonb_array_length(p_ingredientes) > 100
     or exists (select 1 from jsonb_array_elements(p_ingredientes) e where jsonb_typeof(e) <> 'object') then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  if p_receita ->> 'id' is null then
    insert into {schema}.receitas (nutricionista_id, nome, grupo_id, porcoes, rendimento_g, tempo_preparo_min, modo_preparo, observacao, favorita)
    values (v_uid, p_receita ->> 'nome', (p_receita ->> 'grupo_id')::uuid, coalesce((p_receita ->> 'porcoes')::numeric, 1),
            (p_receita ->> 'rendimento_g')::numeric, (p_receita ->> 'tempo_preparo_min')::integer, coalesce(p_receita ->> 'modo_preparo', ''),
            coalesce(p_receita ->> 'observacao', ''), coalesce((p_receita ->> 'favorita')::boolean, false))
    returning id into v_id;
  else
    update {schema}.receitas rc set
      nome = case when p_receita ? 'nome' then p_receita ->> 'nome' else rc.nome end,
      grupo_id = case when p_receita ? 'grupo_id' then (p_receita ->> 'grupo_id')::uuid else rc.grupo_id end,
      porcoes = case when p_receita ? 'porcoes' then (p_receita ->> 'porcoes')::numeric else rc.porcoes end,
      rendimento_g = case when p_receita ? 'rendimento_g' then (p_receita ->> 'rendimento_g')::numeric else rc.rendimento_g end,
      tempo_preparo_min = case when p_receita ? 'tempo_preparo_min' then (p_receita ->> 'tempo_preparo_min')::integer else rc.tempo_preparo_min end,
      modo_preparo = case when p_receita ? 'modo_preparo' then coalesce(p_receita ->> 'modo_preparo', '') else rc.modo_preparo end,
      observacao = case when p_receita ? 'observacao' then coalesce(p_receita ->> 'observacao', '') else rc.observacao end,
      favorita = case when p_receita ? 'favorita' then coalesce((p_receita ->> 'favorita')::boolean, false) else rc.favorita end
     where rc.id = (p_receita ->> 'id')::uuid and rc.deleted_at is null
    returning rc.id into v_id;
    if v_id is null then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    delete from {schema}.ingredientes_receita ir where ir.receita_id = v_id;
  end if;

  insert into {schema}.ingredientes_receita (receita_id, alimento_id, quantidade_g, medida_caseira_id, quantidade_medida, ordem, observacao)
  select v_id, x.alimento_id, x.quantidade_g, x.medida_caseira_id, x.quantidade_medida, (n - 1)::integer, coalesce(x.observacao, '')
    from jsonb_array_elements(p_ingredientes) with ordinality as e(item, n)
   cross join lateral jsonb_to_record(e.item) as x(alimento_id uuid, quantidade_g numeric, medida_caseira_id uuid, quantidade_medida numeric, observacao text)
   order by n;

  return v_id;
end;
$$;

-- ============================================================================================================
-- 4. Alimento próprio: o alimento e as medidas caseiras juntos (criar ou editar — editar TROCA as medidas)
-- ============================================================================================================
create or replace function {schema}.dieta_salvar_alimento(p_alimento jsonb, p_medidas jsonb) returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_alimento is null or jsonb_typeof(p_alimento) <> 'object'
     or p_medidas is null or jsonb_typeof(p_medidas) <> 'array' or jsonb_array_length(p_medidas) > 50
     or exists (select 1 from jsonb_array_elements(p_medidas) e where jsonb_typeof(e) <> 'object') then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  if p_alimento ->> 'id' is null then
    insert into {schema}.alimentos (fonte, nutricionista_id, nome, grupo, porcao_g, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg,
                                    marca, nutrientes)
    values ('proprio', v_uid, p_alimento ->> 'nome', p_alimento ->> 'grupo', coalesce((p_alimento ->> 'porcao_g')::numeric, 100),
            (p_alimento ->> 'energia_kcal')::numeric, (p_alimento ->> 'proteina_g')::numeric, (p_alimento ->> 'carboidrato_g')::numeric,
            (p_alimento ->> 'lipidio_g')::numeric, (p_alimento ->> 'fibra_g')::numeric, (p_alimento ->> 'sodio_mg')::numeric,
            p_alimento ->> 'marca', coalesce(p_alimento -> 'nutrientes', '{}'::jsonb))
    returning id into v_id;
  else
    update {schema}.alimentos a set
      nome = case when p_alimento ? 'nome' then p_alimento ->> 'nome' else a.nome end,
      grupo = case when p_alimento ? 'grupo' then p_alimento ->> 'grupo' else a.grupo end,
      porcao_g = case when p_alimento ? 'porcao_g' then (p_alimento ->> 'porcao_g')::numeric else a.porcao_g end,
      energia_kcal = case when p_alimento ? 'energia_kcal' then (p_alimento ->> 'energia_kcal')::numeric else a.energia_kcal end,
      proteina_g = case when p_alimento ? 'proteina_g' then (p_alimento ->> 'proteina_g')::numeric else a.proteina_g end,
      carboidrato_g = case when p_alimento ? 'carboidrato_g' then (p_alimento ->> 'carboidrato_g')::numeric else a.carboidrato_g end,
      lipidio_g = case when p_alimento ? 'lipidio_g' then (p_alimento ->> 'lipidio_g')::numeric else a.lipidio_g end,
      fibra_g = case when p_alimento ? 'fibra_g' then (p_alimento ->> 'fibra_g')::numeric else a.fibra_g end,
      sodio_mg = case when p_alimento ? 'sodio_mg' then (p_alimento ->> 'sodio_mg')::numeric else a.sodio_mg end,
      marca = case when p_alimento ? 'marca' then p_alimento ->> 'marca' else a.marca end,
      nutrientes = case when p_alimento ? 'nutrientes' then coalesce(p_alimento -> 'nutrientes', '{}'::jsonb) else a.nutrientes end
     where a.id = (p_alimento ->> 'id')::uuid
    returning a.id into v_id;
    if v_id is null then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    delete from {schema}.medidas_caseiras m where m.alimento_id = v_id;
  end if;

  insert into {schema}.medidas_caseiras (alimento_id, descricao, gramas, ordem)
  select v_id, x.descricao, x.gramas, coalesce(x.ordem, 0)
    from jsonb_to_recordset(p_medidas) as x(descricao text, gramas numeric, ordem integer);

  return v_id;
end;
$$;

-- ============================================================================================================
-- 5. Subir/descer: a ordem de várias linhas de uma vez (refeições do plano, indicações do aluno)
-- ============================================================================================================
create or replace function {schema}.dieta_ordenar(p_tabela text, p_ids uuid[], p_ordens integer[]) returns integer
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_tabela is null or p_tabela not in ('refeicoes', 'indicacoes_produto')
     or p_ids is null or p_ordens is null or cardinality(p_ids) not between 1 and 200 or cardinality(p_ordens) <> cardinality(p_ids)
     or array_position(p_ids, null) is not null
     or exists (select 1 from unnest(p_ordens) o where o is null or o < 0 or o > 100000)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  -- as linhas travadas na ordem do id: 2 chamadas ao mesmo tempo nunca se cruzam (a 2ª espera a 1ª terminar)
  if p_tabela = 'refeicoes' then
    perform 1 from {schema}.refeicoes r where r.id = any(p_ids) order by r.id for update;
    update {schema}.refeicoes r set ordem = x.ordem from unnest(p_ids, p_ordens) as x(id, ordem) where r.id = x.id;
  else
    perform 1 from {schema}.indicacoes_produto i where i.id = any(p_ids) order by i.id for update;
    update {schema}.indicacoes_produto i set ordem = x.ordem from unnest(p_ids, p_ordens) as x(id, ordem) where i.id = x.id;
  end if;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(p_ids) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  return v_n;
end;
$$;

-- ============================================================================================================
-- 6. Excluir um grupo de receitas: o grupo à Lixeira e as receitas dele sem grupo, juntos
-- ============================================================================================================
create or replace function {schema}.dieta_excluir_grupo_receita(p_grupo uuid) returns integer
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_grupo is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  update {schema}.grupos_receita g set deleted_at = now() where g.id = p_grupo and g.deleted_at is null returning g.id into v_id;
  if v_id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  update {schema}.receitas rc set grupo_id = null where rc.grupo_id = p_grupo and rc.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ============================================================================================================
-- 7. "Copiar pra semana toda": as do dia valem todos os dias e as de outros dias saem, juntos
-- ============================================================================================================
create or replace function {schema}.dieta_copiar_semana(p_para_todos uuid[], p_para_apagar uuid[]) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_todos uuid[] := coalesce(p_para_todos, '{}'::uuid[]);
  v_apagar uuid[] := coalesce(p_para_apagar, '{}'::uuid[]);
  v_a integer := 0;
  v_d integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if cardinality(v_todos) > 200 or cardinality(v_apagar) > 200
     or array_position(v_todos, null) is not null or array_position(v_apagar, null) is not null
     or (select count(distinct x) from unnest(v_todos) x) <> cardinality(v_todos)
     or (select count(distinct x) from unnest(v_apagar) x) <> cardinality(v_apagar)
     or v_todos && v_apagar then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  if cardinality(v_todos) > 0 then
    update {schema}.refeicoes r set dias_semana = '{}'::smallint[] where r.id = any(v_todos);
    get diagnostics v_a = row_count;
    if v_a <> cardinality(v_todos) then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
  end if;
  if cardinality(v_apagar) > 0 then
    delete from {schema}.refeicoes r where r.id = any(v_apagar);
    get diagnostics v_d = row_count;
    if v_d <> cardinality(v_apagar) then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('atualizadas', v_a, 'apagadas', v_d);
end;
$$;

-- o app chama pela função nutricao, COMO A PESSOA: o logado e o servidor; o visitante não (os default privileges dão a todos)
revoke all on function {schema}.dieta_criar_plano(uuid, jsonb, jsonb) from public, anon;
revoke all on function {schema}.dieta_duplicar_plano(uuid, text, uuid) from public, anon;
revoke all on function {schema}.dieta_salvar_receita(jsonb, jsonb) from public, anon;
revoke all on function {schema}.dieta_salvar_alimento(jsonb, jsonb) from public, anon;
revoke all on function {schema}.dieta_ordenar(text, uuid[], integer[]) from public, anon;
revoke all on function {schema}.dieta_excluir_grupo_receita(uuid) from public, anon;
revoke all on function {schema}.dieta_copiar_semana(uuid[], uuid[]) from public, anon;
grant execute on function {schema}.dieta_criar_plano(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function {schema}.dieta_duplicar_plano(uuid, text, uuid) to authenticated, service_role;
grant execute on function {schema}.dieta_salvar_receita(jsonb, jsonb) to authenticated, service_role;
grant execute on function {schema}.dieta_salvar_alimento(jsonb, jsonb) to authenticated, service_role;
grant execute on function {schema}.dieta_ordenar(text, uuid[], integer[]) to authenticated, service_role;
grant execute on function {schema}.dieta_excluir_grupo_receita(uuid) to authenticated, service_role;
grant execute on function {schema}.dieta_copiar_semana(uuid[], uuid[]) to authenticated, service_role;

-- ============================================================================================================
-- 8. Conferência (desfaz tudo se algo sair diferente) — nada é gravado: as recusas acontecem antes de qualquer linha
-- ============================================================================================================
do $$
declare
  v_f text;
  v_nada text := '{"sub":"00000000-0000-4000-8000-0000000000bb"}';
  v_um uuid := '00000000-0000-4000-8000-0000000000cc';
begin
  foreach v_f in array array[
    '{schema}.dieta_criar_plano(uuid, jsonb, jsonb)', '{schema}.dieta_duplicar_plano(uuid, text, uuid)',
    '{schema}.dieta_salvar_receita(jsonb, jsonb)', '{schema}.dieta_salvar_alimento(jsonb, jsonb)',
    '{schema}.dieta_ordenar(text, uuid[], integer[])', '{schema}.dieta_excluir_grupo_receita(uuid)',
    '{schema}.dieta_copiar_semana(uuid[], uuid[])'] loop
    -- INVOKER (o RLS vale dentro) e com search_path fixo
    if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-19b: % tem de ser SECURITY INVOKER e ter search_path', v_f;
    end if;
    -- só o logado e o servidor
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-19b: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;

  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação): recusa com sem_login, antes de tudo
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    perform {schema}.dieta_ordenar('refeicoes', array[v_um], array[0]);
    raise exception 'hml-19b: dieta_ordenar sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.dieta_criar_plano(v_um, '{}'::jsonb, '[]'::jsonb);
    raise exception 'hml-19b: dieta_criar_plano sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  -- com um login qualquer (que não existe): o corpo fora da forma recusa ANTES de olhar as tabelas
  perform set_config('request.jwt.claims', v_nada, true);
  begin
    perform {schema}.dieta_ordenar('pacientes', array[v_um], array[0]);
    raise exception 'hml-19b: dieta_ordenar com tabela fora da lista não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_ordenar('refeicoes', array[v_um, v_um], array[0, 1]);
    raise exception 'hml-19b: dieta_ordenar com id repetido não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_criar_plano(v_um, '{}'::jsonb, '["x"]'::jsonb);
    raise exception 'hml-19b: dieta_criar_plano com refeição que não é objeto não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_duplicar_plano(v_um, ' ');
    raise exception 'hml-19b: dieta_duplicar_plano sem título não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_salvar_receita('[]'::jsonb, '[]'::jsonb);
    raise exception 'hml-19b: dieta_salvar_receita com receita que não é objeto não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_salvar_alimento('{}'::jsonb, '{}'::jsonb);
    raise exception 'hml-19b: dieta_salvar_alimento com medidas que não são lista não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_excluir_grupo_receita(null);
    raise exception 'hml-19b: dieta_excluir_grupo_receita sem grupo não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.dieta_copiar_semana(array[v_um], array[v_um]);
    raise exception 'hml-19b: dieta_copiar_semana com o mesmo id nas 2 listas não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$$;

notify pgrst, 'reload schema';
