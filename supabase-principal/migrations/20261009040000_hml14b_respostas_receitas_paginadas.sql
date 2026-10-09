-- Physiq hml-14b (B21 · D13) — Pré-consulta › Respostas e Dietas › Receitas com página, filtros, busca e contagem NO BANCO (banco
-- principal, public + staging). Idempotente; só 2 funções NOVAS (nenhuma tabela, coluna, política ou dado muda; nenhuma função de
-- hoje muda — o APK antigo e a produção atual continuam lendo as tabelas como antes).
-- Aplicar:
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009040000_hml14b_respostas_receitas_paginadas.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009040000_hml14b_respostas_receitas_paginadas.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009040000_hml14b_respostas_receitas_paginadas_reversa.sql
--
-- As 2 são SECURITY INVOKER: rodam com a RLS de quem chama — quem vê o quê continua sendo das políticas de hoje (respostas: P1 + a
-- regra clínica da W18/W21; receitas: as da nutricionista, o master lê todas), exatamente como a leitura direta da tabela que a tela
-- fazia. Busca sem acento e sem caixa com texto_busca dos 2 lados (20260919070000_alimentos.sql).
--
--   respostas_da_conta(p_conta, p_filtros, p_offset, p_limite)   hoje a tela baixa até 1000 respostas e filtra e conta no navegador.
--     p_filtros: formulario (o título copiado na resposta, sem caixa/acento), q (nome e e-mail sem acento; com 2+ dígitos, também o
--     telefone só pelos dígitos), novas ('true' = sem aluno ligado), aluno (id do aluno ligado). Ordem: mais recente primeiro
--     (respondido_em, created_at, id). Devolve { ok, total (com os filtros), total_conta (sem filtro), novas (sem aluno, sem filtro),
--     titulos (os títulos do filtro, sem repetir), aluno ({id, nome} do filtro ?aluno=, se você o vê na conta), itens (a página: a
--     linha inteira + formulario {id, titulo, origem, origem_id, slug, ativo, deleted_at} + aluno {id, nome, nutricionista_id} quando o
--     aluno ligado é da conta e está fora da lixeira) }.
--   receitas_da_nutricionista(p_filtros, p_offset, p_limite)   hoje a tela baixa todas (o master, as de TODO mundo, cortadas em 1000
--     ANTES de separar as dele) e filtra no navegador. Aqui só as SUAS (nutricionista_id = quem chama, também para o master), com
--     p_filtros: q (palavras, todas no nome), grupo ('' todos · 'sem' sem grupo · id), favoritas ('true'). Ordem: favoritas primeiro,
--     depois o nome sem acento (desempate pelo id). Devolve { ok, ids (a página), total (com os filtros), total_geral, favoritas,
--     por_grupo {grupo_id: n} } — a tela lê as receitas da página (com os ingredientes) pelos ids.

-- ============================================================================================================
-- 1. Pré-consulta › Respostas
-- ============================================================================================================
create or replace function {schema}.respostas_da_conta(p_conta uuid, p_filtros jsonb default '{}'::jsonb,
  p_offset integer default 0, p_limite integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with f as (
    select {schema}.texto_busca(btrim(regexp_replace(coalesce(p_filtros ->> 'formulario', ''), '\s+', ' ', 'g'))) as formulario,
           -- busca literal: os curingas do LIKE vindos da tela viram texto
           replace(replace(replace({schema}.texto_busca(btrim(regexp_replace(coalesce(p_filtros ->> 'q', ''), '\s+', ' ', 'g'))),
                   '\', '\\'), '%', '\%'), '_', '\_') as q,
           regexp_replace(coalesce(p_filtros ->> 'q', ''), '\D', '', 'g') as digitos,
           coalesce(p_filtros ->> 'novas', '') = 'true' as so_novas,
           btrim(coalesce(p_filtros ->> 'aluno', '')) as aluno
  ), vivas as (
    -- o recorte da conta ativa (o mesmo da tela: o que é da conta + o que é meu sem conta, do site antigo); a RLS decide o resto
    select r.* from {schema}.respostas_preconsulta r
     where r.deleted_at is null
       and (r.conta_id = p_conta or (r.conta_id is null and r.nutricionista_id = (select auth.uid())))
  ), filtradas as (
    select v.* from vivas v cross join f
     where (f.formulario = '' or {schema}.texto_busca(btrim(regexp_replace(v.titulo, '\s+', ' ', 'g'))) = f.formulario)
       and (not f.so_novas or v.paciente_id is null)
       and (f.aluno = '' or v.paciente_id::text = f.aluno)
       and (f.q = ''
            or {schema}.texto_busca(regexp_replace(v.nome, '\s+', ' ', 'g')) like '%' || f.q || '%'
            or {schema}.texto_busca(v.email) like '%' || f.q || '%'
            or (length(f.digitos) >= 2 and regexp_replace(v.telefone, '\D', '', 'g') like '%' || f.digitos || '%'))
  ), pagina as (
    select fl.* from filtradas fl
     order by fl.respondido_em desc, fl.created_at desc, fl.id desc
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 20), 1), 100)
  ), titulos as (
    select distinct on (t.chave) t.chave, t.titulo
      from (select {schema}.texto_busca(btrim(regexp_replace(v.titulo, '\s+', ' ', 'g'))) as chave,
                   btrim(regexp_replace(v.titulo, '\s+', ' ', 'g')) as titulo
              from vivas v) t
     where t.chave <> ''
     order by t.chave, t.titulo
  )
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from filtradas),
    'total_conta', (select count(*) from vivas),
    'novas', (select count(*) from vivas v where v.paciente_id is null),
    'titulos', coalesce((select jsonb_agg(t.titulo order by t.chave) from titulos t), '[]'::jsonb),
    'aluno', (select jsonb_build_object('id', p.id, 'nome', p.nome)
                from {schema}.pacientes p cross join f
               where f.aluno <> '' and p.conta_id = p_conta and p.deleted_at is null and p.id::text = f.aluno),
    'itens', coalesce((select jsonb_agg(to_jsonb(pg) || jsonb_build_object(
                'formulario', (select jsonb_build_object('id', fo.id, 'titulo', fo.titulo, 'origem', fo.origem, 'origem_id', fo.origem_id,
                                                         'slug', fo.slug, 'ativo', fo.ativo, 'deleted_at', fo.deleted_at)
                                 from {schema}.formularios_preconsulta fo where fo.id = pg.formulario_id),
                'aluno', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'nutricionista_id', p.nutricionista_id)
                            from {schema}.pacientes p
                           where p.id = pg.paciente_id and p.conta_id = p_conta and p.deleted_at is null))
              order by pg.respondido_em desc, pg.created_at desc, pg.id desc)
              from pagina pg), '[]'::jsonb)
  );
$$;

revoke all on function {schema}.respostas_da_conta(uuid, jsonb, integer, integer) from public, anon;
grant execute on function {schema}.respostas_da_conta(uuid, jsonb, integer, integer) to authenticated, service_role;

-- ============================================================================================================
-- 2. Dietas › Receitas (só as suas)
-- ============================================================================================================
create or replace function {schema}.receitas_da_nutricionista(p_filtros jsonb default '{}'::jsonb,
  p_offset integer default 0, p_limite integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with f as (
    select coalesce(p_filtros ->> 'grupo', '') as grupo,
           coalesce(p_filtros ->> 'favoritas', '') = 'true' as so_favoritas
  ), palavras as (
    select w.palavra
      from unnest(string_to_array({schema}.texto_busca(btrim(regexp_replace(coalesce(p_filtros ->> 'q', ''), '\s+', ' ', 'g'))), ' ')) as w(palavra)
     where w.palavra <> ''
  ), minhas as (
    -- as SUAS, também para o master (a RLS dele lê as de todos; aqui é o painel dele de profissional)
    select r.id, r.grupo_id, r.favorita, {schema}.texto_busca(r.nome) as chave
      from {schema}.receitas r
     where r.deleted_at is null and r.nutricionista_id = (select auth.uid())
  ), filtradas as (
    select m.* from minhas m cross join f
     where (f.grupo = '' or (f.grupo = 'sem' and m.grupo_id is null) or m.grupo_id::text = f.grupo)
       and (not f.so_favoritas or m.favorita)
       and not exists (select 1 from palavras pw where strpos(m.chave, pw.palavra) = 0)
  ), pagina as (
    select fl.id, fl.favorita, fl.chave from filtradas fl
     order by fl.favorita desc, fl.chave, fl.id
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 20), 1), 100)
  )
  select jsonb_build_object(
    'ok', true,
    'ids', coalesce((select jsonb_agg(pg.id order by pg.favorita desc, pg.chave, pg.id) from pagina pg), '[]'::jsonb),
    'total', (select count(*) from filtradas),
    'total_geral', (select count(*) from minhas),
    'favoritas', (select count(*) from minhas m where m.favorita),
    'por_grupo', coalesce((select jsonb_object_agg(g.grupo_id, g.n)
                             from (select m.grupo_id, count(*) as n from minhas m where m.grupo_id is not null group by m.grupo_id) g),
                          '{}'::jsonb)
  );
$$;

revoke all on function {schema}.receitas_da_nutricionista(jsonb, integer, integer) from public, anon;
grant execute on function {schema}.receitas_da_nutricionista(jsonb, integer, integer) to authenticated, service_role;

-- ============================================================================================================
-- 3. Conferência (desfaz tudo se algo sair diferente)
-- ============================================================================================================
do $$
declare
  v_f text;
  v_j jsonb;
begin
  foreach v_f in array array['{schema}.respostas_da_conta(uuid, jsonb, integer, integer)',
                             '{schema}.receitas_da_nutricionista(jsonb, integer, integer)'] loop
    if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-14b: % tem de ser SECURITY INVOKER (vale a RLS de quem chama)', v_f;
    end if;
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-14b: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;
  -- rodando de verdade, com todos os filtros (sem JWT — garantido aqui, só nesta transação — e numa conta que não existe: tudo vazio)
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  v_j := {schema}.respostas_da_conta('00000000-0000-4000-8000-0000000000aa'::uuid,
           '{"formulario": "Pré-anamnese  inicial", "q": "Zé (11) 9_8%", "novas": "true", "aluno": "nao-e-uuid"}'::jsonb, 20, 20);
  if v_j is distinct from jsonb_build_object('ok', true, 'total', 0, 'total_conta', 0, 'novas', 0, 'titulos', '[]'::jsonb,
                                             'aluno', null, 'itens', '[]'::jsonb) then
    raise exception 'hml-14b: respostas_da_conta de uma conta que não existe = %', v_j;
  end if;
  v_j := {schema}.receitas_da_nutricionista('{"q": "pão  de queijo", "grupo": "sem", "favoritas": "true"}'::jsonb, 0, 20);
  if v_j is distinct from jsonb_build_object('ok', true, 'ids', '[]'::jsonb, 'total', 0, 'total_geral', 0, 'favoritas', 0,
                                             'por_grupo', '{}'::jsonb) then
    raise exception 'hml-14b: receitas_da_nutricionista sem login = %', v_j;
  end if;
end
$$;

notify pgrst, 'reload schema';
