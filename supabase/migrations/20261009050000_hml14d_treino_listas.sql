-- Homologação do Physiq — hml-14d no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) (09/10/2026): B21 — Painel › Treinos (Meus
-- treinos e Biblioteca) e as folhas do editor (Modelos e Biblioteca) com página, busca, filtro e contagem NO BANCO. Antes a tela lia
-- tb_grupos_treino e tb_exercicios com .limit(2000/3000) (= 1000, calado), montava tudo e filtrava no navegador.
-- Idempotente. Só 3 funções NOVAS: nenhuma tabela, coluna, política, dado ou função de hoje muda (o APK antigo e a produção atual
-- continuam lendo as tabelas como antes).
--
--   texto_busca(t)   cópia EXATA da do banco principal (supabase-principal/migrations/20260919070000_alimentos.sql:7-9): sem caixa e
--     sem acento (lower + translate; o Treino não tem a extensão unaccent). Imutável.
--   modelos_da_lista(p_filtros, p_offset, p_limite)   Meus treinos. SECURITY INVOKER: a RLS de quem chama decide como na leitura
--     direta de hoje, e o recorte "global ou meu" (professor_id vazio ou = quem chama) é o mesmo do painel. p_filtros: q (nome do
--     treino OU de um exercício dele que a pessoa vê — global ou dela —, sem caixa/acento, literal: % _ \ não são curinga) e pasta
--     (uuid de uma pasta global ou dela). Ordem: texto_busca(nome), id. p_limite 1..100 (padrão 20). Devolve { ok, total (com os
--     filtros), total_geral (sem filtro), por_pasta {"<pasta_id>": n de treinos do recorte, sem filtro}, itens [{id, nome,
--     professor_id}] } — a tela lê as linhas, os exercícios e as pastas SÓ dos treinos da página.
--   exercicios_da_lista(p_filtros, p_offset, p_limite)   a Biblioteca (painel, folha do editor e a do master). SECURITY INVOKER.
--     p_filtros: escopo ('global' | 'minha' | 'visiveis' = global + meus, o padrão | 'professores' = os dos profissionais, SÓ para o
--     master no Treino — physiq_is_master(); para os outros vira 'visiveis'); professor (uuid: os globais + os desse profissional —
--     a folha do editor com o professor do aluno; quando vem, vale no lugar do escopo); q (nome, grupo_muscular, subgrupo e variação,
--     sem caixa/acento, literal); codigos (text[]: os de movimento/equipamento cujos RÓTULOS casaram com o termo na tela —
--     src/treino/equivalenciaBusca.ts —, casam com padrao_movimento ou equipamento; a busca acha por q OU por codigos); musculos
--     (text[]: o músculo PRIMÁRIO do grupo_muscular — o trecho antes da "/", sem caixa/acento — está na lista: os do grupo da tela,
--     src/lib/gruposMusculares.ts) e fora (text[]: não está — o grupo "outros"). Ordem: texto_busca(nome), id. Devolve { ok, total
--     (com tudo), total_global, total_meu (professor_id = quem chama), total_professores (só o master; os outros 0), com_gif e
--     total_escopo (o escopo, sem busca nem grupo), sem_classificacao (globais sem movimento ou sem equipamento — o aviso do master),
--     itens [as colunas de COLS_EXERCICIO de src/painel/treinos/api.ts] }. As contagens não levam busca nem grupo.
--
-- Grants: revoke de PUBLIC e anon; execute para authenticated e service_role (as 3; o visitante não ganha nada).
-- Roda 1x por ambiente, na MESMA chamada (Management API database/query; dry-run com begin … rollback):
--   set physiq.schemas = 'staging'; <este arquivo>      ← primeiro
--   set physiq.schemas = 'public';  <este arquivo>      (produção; só cria funções — pode ir junto do staging, spec hml-14d §5)
-- Reversa: supabase/reversas/20261009050000_hml14d_treino_listas_reversa.sql
do $mig$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;

  -- ===== 1. texto_busca (a do principal, igual)
  execute format($sql$
create or replace function %1$I.texto_busca(t text) returns text language sql immutable as $b$
  select translate(lower(coalesce(t, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy');
$b$
$sql$, v_amb);
  execute format('revoke all on function %I.texto_busca(text) from public, anon', v_amb);
  execute format('grant execute on function %I.texto_busca(text) to authenticated, service_role', v_amb);

  -- ===== 2. modelos_da_lista (Meus treinos)
  execute format($sql$
create or replace function %1$I.modelos_da_lista(p_filtros jsonb default '{}'::jsonb, p_offset integer default 0,
  p_limite integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $b$
  with f as (
    select %1$I.texto_busca(btrim(regexp_replace(coalesce(p_filtros ->> 'q', ''), '\s+', ' ', 'g'))) as q,
           case when coalesce(p_filtros ->> 'pasta', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (p_filtros ->> 'pasta')::uuid end as pasta,
           (select auth.uid()) as eu
  ), base as (
    select g.id, g.nome, g.professor_id
      from %1$I.tb_grupos_treino g cross join f
     where g.professor_id is null or g.professor_id = f.eu
  ), filtrada as (
    select b.* from base b cross join f
     where (f.pasta is null or exists (
              select 1 from %1$I.tb_pastas_treino_grupos v
                join %1$I.tb_pastas_treino p on p.id = v.pasta_id
               where v.grupo_id = b.id and v.pasta_id = f.pasta and (p.professor_id is null or p.professor_id = f.eu)))
       and (f.q = ''
            or strpos(%1$I.texto_busca(regexp_replace(b.nome, '\s+', ' ', 'g')), f.q) > 0
            or exists (
              select 1 from %1$I.tb_grupos_exercicios ge
                join %1$I.tb_exercicios e on e.id = ge.exercicio_id
               where ge.grupo_id = b.id and (e.professor_id is null or e.professor_id = f.eu)
                 and strpos(%1$I.texto_busca(regexp_replace(e.nome, '\s+', ' ', 'g')), f.q) > 0))
  ), pagina as (
    select fl.id, fl.nome, fl.professor_id from filtrada fl
     order by %1$I.texto_busca(fl.nome), fl.id
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 20), 1), 100)
  ), por_pasta as (
    select v.pasta_id, count(distinct v.grupo_id) as n
      from %1$I.tb_pastas_treino_grupos v
      join %1$I.tb_pastas_treino p on p.id = v.pasta_id
      join base b on b.id = v.grupo_id
     cross join f
     where p.professor_id is null or p.professor_id = f.eu
     group by v.pasta_id
  )
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from filtrada),
    'total_geral', (select count(*) from base),
    'por_pasta', coalesce((select jsonb_object_agg(pp.pasta_id::text, pp.n) from por_pasta pp), '{}'::jsonb),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', pg.id, 'nome', pg.nome, 'professor_id', pg.professor_id)
                                        order by %1$I.texto_busca(pg.nome), pg.id)
                         from pagina pg), '[]'::jsonb))
$b$
$sql$, v_amb);
  execute format('comment on function %I.modelos_da_lista(jsonb, integer, integer) is %L', v_amb,
    'hml-14d (B21): Painel › Treinos › Meus treinos — a página de treinos (global ou meu), busca pelo nome do treino ou de um '
    'exercício dele, pasta, total e o número de treinos de cada pasta. SECURITY INVOKER (a RLS de quem chama).');
  execute format('revoke all on function %I.modelos_da_lista(jsonb, integer, integer) from public, anon', v_amb);
  execute format('grant execute on function %I.modelos_da_lista(jsonb, integer, integer) to authenticated, service_role', v_amb);

  -- ===== 3. exercicios_da_lista (Biblioteca do painel, folha do editor e Biblioteca do master)
  execute format($sql$
create or replace function %1$I.exercicios_da_lista(p_filtros jsonb default '{}'::jsonb, p_offset integer default 0,
  p_limite integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $b$
  with f as (
    select (select auth.uid()) as eu,
           %1$I.physiq_is_master() as master,
           case when coalesce(p_filtros ->> 'professor', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (p_filtros ->> 'professor')::uuid end as professor,
           coalesce(p_filtros ->> 'escopo', 'visiveis') as escopo_pedido,
           %1$I.texto_busca(btrim(regexp_replace(coalesce(p_filtros ->> 'q', ''), '\s+', ' ', 'g'))) as q,
           array(select x from jsonb_array_elements_text(
                   case when jsonb_typeof(p_filtros -> 'codigos') = 'array' then p_filtros -> 'codigos' else '[]'::jsonb end) x
                  where x is not null) as codigos,
           array(select btrim(regexp_replace(%1$I.texto_busca(x), '\s+', ' ', 'g')) from jsonb_array_elements_text(
                   case when jsonb_typeof(p_filtros -> 'musculos') = 'array' then p_filtros -> 'musculos' else '[]'::jsonb end) x
                  where x is not null) as musculos,
           array(select btrim(regexp_replace(%1$I.texto_busca(x), '\s+', ' ', 'g')) from jsonb_array_elements_text(
                   case when jsonb_typeof(p_filtros -> 'fora') = 'array' then p_filtros -> 'fora' else '[]'::jsonb end) x
                  where x is not null) as fora
  ), g as (
    select f.*,
           case when f.escopo_pedido in ('global', 'minha', 'visiveis') then f.escopo_pedido
                when f.escopo_pedido = 'professores' and f.master then 'professores'
                else 'visiveis' end as escopo
      from f
  ), escopo as (
    select e.*,
           btrim(regexp_replace(%1$I.texto_busca(split_part(coalesce(e.grupo_muscular, ''), '/', 1)), '\s+', ' ', 'g')) as primario
      from %1$I.tb_exercicios e cross join g
     where case when g.professor is not null then e.professor_id is null or e.professor_id = g.professor
                when g.escopo = 'global' then e.professor_id is null
                when g.escopo = 'minha' then e.professor_id = g.eu
                when g.escopo = 'professores' then e.professor_id is not null
                else e.professor_id is null or e.professor_id = g.eu end
  ), filtrada as (
    select s.* from escopo s cross join g
     where (cardinality(g.musculos) = 0 or s.primario = any(g.musculos))
       and (cardinality(g.fora) = 0 or not (s.primario = any(g.fora)))
       and ((g.q = '' and cardinality(g.codigos) = 0)
            or (g.q <> '' and (strpos(%1$I.texto_busca(regexp_replace(s.nome, '\s+', ' ', 'g')), g.q) > 0
                               or strpos(%1$I.texto_busca(regexp_replace(s.grupo_muscular, '\s+', ' ', 'g')), g.q) > 0
                               or strpos(%1$I.texto_busca(regexp_replace(s.subgrupo, '\s+', ' ', 'g')), g.q) > 0
                               or strpos(%1$I.texto_busca(regexp_replace(s.variacao, '\s+', ' ', 'g')), g.q) > 0))
            or s.padrao_movimento = any(g.codigos)
            or s.equipamento = any(g.codigos))
  ), pagina as (
    select fl.* from filtrada fl
     order by %1$I.texto_busca(fl.nome), fl.id
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 20), 1), 100)
  )
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from filtrada),
    'total_global', (select count(*) from %1$I.tb_exercicios e where e.professor_id is null),
    'total_meu', (select count(*) from %1$I.tb_exercicios e cross join g where e.professor_id = g.eu),
    'total_professores', (select case when g.master then (select count(*) from %1$I.tb_exercicios e where e.professor_id is not null)
                                      else 0 end from g),
    'com_gif', (select count(*) from escopo s where nullif(s.imagem_url, '') is not null),
    'total_escopo', (select count(*) from escopo),
    'sem_classificacao', (select count(*) from %1$I.tb_exercicios e
                           where e.professor_id is null and (e.padrao_movimento is null or e.equipamento is null)),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
                'id', pg.id, 'nome', pg.nome, 'grupo_muscular', pg.grupo_muscular, 'emoji', pg.emoji, 'tipo', pg.tipo,
                'imagem_url', pg.imagem_url, 'subgrupo', pg.subgrupo, 'dica', pg.dica, 'professor_id', pg.professor_id,
                'padrao_movimento', pg.padrao_movimento, 'equipamento', pg.equipamento, 'variacao', pg.variacao)
              order by %1$I.texto_busca(pg.nome), pg.id) from pagina pg), '[]'::jsonb))
$b$
$sql$, v_amb);
  execute format('comment on function %I.exercicios_da_lista(jsonb, integer, integer) is %L', v_amb,
    'hml-14d (B21): Biblioteca de exercícios (painel, folha do editor, master) — a página do escopo com busca (texto e códigos '
    'de movimento/equipamento), grupo muscular, total e as contagens do topo. SECURITY INVOKER (a RLS de quem chama).');
  execute format('revoke all on function %I.exercicios_da_lista(jsonb, integer, integer) from public, anon', v_amb);
  execute format('grant execute on function %I.exercicios_da_lista(jsonb, integer, integer) to authenticated, service_role', v_amb);
end
$mig$;

-- o PostgREST relê o schema (as 2 RPCs novas aparecem na hora)
notify pgrst, 'reload schema';
