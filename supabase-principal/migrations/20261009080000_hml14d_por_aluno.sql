-- Physiq hml-14d (B21 · D29–D34) — as listas POR ALUNO (app do aluno e painel) com página, total e somas NO BANCO (banco principal,
-- public + staging). Idempotente; só funções (nenhuma tabela, coluna, política ou dado muda).
-- Aplicar (backup das definições ANTES — e2e/w26/backup.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009080000_hml14d_por_aluno.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009080000_hml14d_por_aluno.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009080000_hml14d_por_aluno_reversa.sql
--
--   aluno_anotacoes(p_aluno, p_limite, p_offset)   (W18, 20261001030000_w18_visibilidade.sql) ganha p_offset com padrão null — a de 2
--     argumentos sai (com as 2 o PostgREST não escolhe):
--     · chamada como antes ({p_aluno} ou {p_aluno, p_limite}: o card do Resumo, o PDF do prontuário, o APK antigo) → a MESMA resposta
--       de hoje: { ok, paciente_id, total, clinico, anotacoes } (p_limite nulo = todas; senão as últimas N, no máximo 500);
--     · com p_offset → UMA página da aba Anotações: as mesmas chaves + offset, limite (20 por padrão, no máximo 100) e ultima
--       ({ id, data } da mais recente — o "última em" do topo da aba, que a página 2 em diante não traz).
--     Ordem nos 2 jeitos: data desc, created_at desc e o id (desempate). Quem vê o quê NÃO muda (a mesma regra da W18).
--   minha_agenda_lista(p_tipo, p_offset, p_limite)   NOVA (o "Ver todas" da Agenda do app): as consultas da janela da minha_agenda
--     (o início nos últimos 90 dias em diante) de TODAS as matrículas de quem chama: 'proximas' (não terminou e não foi desmarcada;
--     da mais perto para a mais longe) ou 'anteriores' (terminou ou foi desmarcada; da mais recente para a mais antiga) — outro
--     p_tipo vira 'proximas' → { ok, tipo, total, itens (20 por padrão, no máximo 100) }. O item é o da minha_agenda
--     (20261002173000_h1_agenda_ajustes.sql). A minha_agenda não muda (Perfil, Início, aviso e a regra de reagendar usam).
--   exames_do_aluno(p_aluno, p_exame, p_offset, p_limite)   NOVA (Prontuário › Exames): os resultados POR DATA — 20 datas por página
--     com TODOS os resultados de cada uma (o dia nunca é partido) → { ok, total_datas, total_resultados, fora_referencia, exames,
--     datas: [{ data, resultados: [a linha inteira] }] }. p_exame = o "Ver evolução de" (sem caixa, sem acento e sem espaço
--     repetido, como o filtrarPorExame de src/nutricao/prontuario/lib/examesUtil.ts). total_datas e datas seguem o filtro;
--     total_resultados, fora_referencia (valor abaixo da ref_min ou acima da ref_max — o contarForaDaReferencia) e exames (os
--     nomes para o filtro, 1 por nome sem caixa/acento — o nomesComResultado) são do aluno inteiro, como o topo da tela de hoje.
--   financeiro_totais_do_aluno(p_aluno)   NOVA (Painel › aluno › Financeiro): "Recebido" e "Gasto com o aluno" somados no banco com a
--     regra da tela (src/financeiro/lancamentos.ts › totais: o estornado fica fora; saída = gasto; o resto = recebido; 2 casas) +
--     total (os lançamentos vivos, estornados inclusive — o "Ver todos (N)") e a 1ª e a última data (o período do link "Editar,
--     estornar ou excluir no Financeiro") → { ok, recebido, gasto, total, primeira, ultima }. Antes a tela somava até 500.
--   exames_do_aluno e financeiro_totais_do_aluno são SECURITY INVOKER: a RLS de quem chama decide, como a leitura direta da tabela
--   que a tela fazia (molde da respostas_da_conta, hml-14b). A minha_agenda_lista é DEFINER como a minha_agenda (só as matrículas de
--   auth.uid()); a aluno_anotacoes continua DEFINER (a regra da W18 + o nome e a foto de quem escreveu).

-- ============================================================================================================
-- 1. Prontuário › Anotações: a aluno_anotacoes com página (a de 2 argumentos sai — com as 2 o PostgREST não escolhe)
-- ============================================================================================================
drop function if exists {schema}.aluno_anotacoes(uuid, integer);

create or replace function {schema}.aluno_anotacoes(p_aluno uuid, p_limite integer default null, p_offset integer default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_ve boolean := {schema}.eh_master() or {schema}.pode_ver_aluno(v_id);
  v_clinico boolean := {schema}.pode_ver_clinico(v_id);
  v_total integer := 0;
  v_lista jsonb := '[]'::jsonb;
  -- hml-14d: com p_offset é uma página (20, no máximo 100); sem ele, o de hoje (p_limite nulo ou < 1 = todas; senão as últimas N, até 500)
  v_pagina boolean := p_offset is not null;
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limite integer := case when p_offset is not null then least(greatest(coalesce(p_limite, 20), 1), 100)
                           when p_limite is null or p_limite < 1 then null
                           else least(p_limite, 500) end;
  v_ultima jsonb;
begin
  if v_ve then
    select count(*) into v_total from {schema}.registros_prontuario r
     where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico);
    select coalesce(jsonb_agg(x.j order by x.data desc, x.criado desc, x.id desc), '[]'::jsonb) into v_lista
      from (
        select r.data, r.created_at as criado, r.id,
               jsonb_build_object(
                 'id', r.id,
                 'data', r.data,
                 'texto', r.texto,
                 'visibilidade', r.visibilidade,
                 'autor_papel', r.autor_papel,
                 'autor_id', r.nutricionista_id,
                 'autor_nome', {schema}.nome_da_pessoa(r.nutricionista_id),
                 'autor_foto', (select coalesce(nullif(btrim(pr.dados_profissionais ->> 'foto_url'), ''),
                                               u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
                                  from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = r.nutricionista_id),
                 'minha', r.nutricionista_id = auth.uid(),
                 'created_at', r.created_at,
                 'updated_at', r.updated_at) as j
          from {schema}.registros_prontuario r
         where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico)
         order by r.data desc, r.created_at desc, r.id desc
        offset v_offset limit v_limite
      ) x;
    if v_pagina then
      select jsonb_build_object('id', r.id, 'data', r.data) into v_ultima
        from {schema}.registros_prontuario r
       where r.paciente_id = v_id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico)
       order by r.data desc, r.created_at desc, r.id desc
       limit 1;
    end if;
  end if;
  if not v_pagina then
    return jsonb_build_object('ok', true, 'paciente_id', v_id, 'total', v_total, 'clinico', v_clinico, 'anotacoes', v_lista);
  end if;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'total', v_total, 'clinico', v_clinico, 'anotacoes', v_lista,
                            'offset', v_offset, 'limite', v_limite, 'ultima', v_ultima);
end;
$$;

-- os default privileges do projeto dão EXECUTE ao anon em toda função nova → revogar e dar só a quem tem login
revoke all on function {schema}.aluno_anotacoes(uuid, integer, integer) from public, anon;
grant execute on function {schema}.aluno_anotacoes(uuid, integer, integer) to authenticated, service_role;

-- ============================================================================================================
-- 2. App › Perfil › Agenda: o "Ver todas" (as próximas ou as anteriores da janela da minha_agenda, em páginas)
-- ============================================================================================================
create or replace function {schema}.minha_agenda_lista(p_tipo text, p_offset integer default 0, p_limite integer default 20)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (
    select case when p_tipo = 'anteriores' then 'anteriores' else 'proximas' end as tipo
  ), base as (
    -- a janela da minha_agenda(p_desde nulo): o início nos últimos 90 dias em diante, das matrículas de quem chama
    select a.id, a.paciente_id, a.nutricionista_id, a.titulo, a.inicio, a.fim, a.dia_inteiro, a.status, a.modulo, a.reagendamentos,
           a.origem, a.mes_referencia, p.personal_id as aluno_personal, p.nutricionista_id as aluno_nutricionista,
           a.status in ('desmarcado', 'paciente_desmarcou') as desmarcada
      from {schema}.agendamentos a
      join {schema}.pacientes p on p.id = a.paciente_id
     where auth.uid() is not null
       and p.user_id = auth.uid() and p.deleted_at is null and a.deleted_at is null
       and a.inicio >= now() - interval '90 days'
  ), da_aba as (
    -- a regra da tela (src/app-aluno/perfil/pecas/regras.ts: proximosAgendamentos · agendamentosAnteriores)
    select b.* from base b cross join t
     where case when t.tipo = 'proximas' then b.fim >= now() and not b.desmarcada
                else b.fim < now() or b.desmarcada end
  ), ordenadas as (
    select d.*, row_number() over (order by
             case when t.tipo = 'proximas' then d.inicio end,
             case when t.tipo = 'anteriores' then d.inicio end desc,
             case when t.tipo = 'proximas' then d.id end,
             case when t.tipo = 'anteriores' then d.id end desc) as pos
      from da_aba d cross join t
  ), pagina as (
    select o.* from ordenadas o
     where o.pos > greatest(coalesce(p_offset, 0), 0)
       and o.pos <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limite, 20), 1), 100)
  )
  select jsonb_build_object(
    'ok', true,
    'tipo', (select t.tipo from t),
    'total', (select count(*) from da_aba),
    -- o item = o da minha_agenda (h1_agenda_ajustes)
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
               'id', pg.id, 'paciente_id', pg.paciente_id, 'titulo', pg.titulo, 'inicio', pg.inicio, 'fim', pg.fim,
               'dia_inteiro', pg.dia_inteiro, 'status', pg.status, 'modulo', pg.modulo,
               'profissional', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                                  from {schema}.profiles pr where pr.id = pg.nutricionista_id),
               -- H1: o mesmo profissional nos 2 papéis → a área da consulta decide (geral: sem papel)
               'papel', case when pg.nutricionista_id = pg.aluno_personal and pg.nutricionista_id = pg.aluno_nutricionista
                               then case pg.modulo when 'treino' then 'personal' when 'nutricao' then 'nutricionista' end
                             when pg.nutricionista_id = pg.aluno_personal then 'personal'
                             when pg.nutricionista_id = pg.aluno_nutricionista then 'nutricionista' end,
               'profissional_id', pg.nutricionista_id,
               'reagendamentos', pg.reagendamentos,
               'origem', pg.origem,
               'mes_referencia', coalesce(pg.mes_referencia, {schema}.w20_mes(pg.inicio)),
               'regras', {schema}.agenda_regras_de(pg.nutricionista_id))
             order by pg.pos)
             from pagina pg), '[]'::jsonb)
  );
$$;

revoke all on function {schema}.minha_agenda_lista(text, integer, integer) from public, anon;
grant execute on function {schema}.minha_agenda_lista(text, integer, integer) to authenticated, service_role;

-- ============================================================================================================
-- 3. Prontuário › Exames: os resultados POR DATA (20 datas por página, o dia inteiro em cada uma)
-- ============================================================================================================
create or replace function {schema}.exames_do_aluno(p_aluno uuid, p_exame text default null, p_offset integer default 0,
  p_limite integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with f as (
    select {schema}.texto_busca(btrim(regexp_replace(coalesce(p_exame, ''), '\s+', ' ', 'g'))) as exame
  ), vivos as (
    -- a RLS de quem chama decide (a mesma leitura que a tela fazia em resultados_exame)
    select r.* from {schema}.resultados_exame r
     where r.paciente_id = p_aluno and r.deleted_at is null
  ), filtrados as (
    select v.* from vivos v cross join f
     where f.exame = '' or {schema}.texto_busca(btrim(regexp_replace(v.exame, '\s+', ' ', 'g'))) = f.exame
  ), datas as (
    select fl.data from filtrados fl group by fl.data
  ), pagina as (
    select d.data from datas d
     order by d.data desc
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 20), 1), 100)
  ), nomes as (
    -- 1 por nome (sem caixa/acento): o do resultado mais recente
    select distinct on (n.chave) n.nome, n.chave
      from (select btrim(regexp_replace(v.exame, '\s+', ' ', 'g')) as nome,
                   {schema}.texto_busca(btrim(regexp_replace(v.exame, '\s+', ' ', 'g'))) as chave, v.data, v.exame
              from vivos v) n
     where n.chave <> ''
     order by n.chave, n.data desc, n.exame
  )
  select jsonb_build_object(
    'ok', true,
    'total_datas', (select count(*) from datas),
    'total_resultados', (select count(*) from vivos),
    'fora_referencia', (select count(*) from vivos v
                         where v.valor is not null
                           and ((v.ref_min is not null and v.valor < v.ref_min) or (v.ref_max is not null and v.valor > v.ref_max))),
    'exames', coalesce((select jsonb_agg(n.nome order by n.chave, n.nome) from nomes n), '[]'::jsonb),
    'datas', coalesce((select jsonb_agg(jsonb_build_object(
               'data', pg.data,
               'resultados', (select coalesce(jsonb_agg(to_jsonb(fl) order by fl.exame, fl.created_at desc, fl.id), '[]'::jsonb)
                                from filtrados fl where fl.data = pg.data))
             order by pg.data desc)
             from pagina pg), '[]'::jsonb)
  );
$$;

revoke all on function {schema}.exames_do_aluno(uuid, text, integer, integer) from public, anon;
grant execute on function {schema}.exames_do_aluno(uuid, text, integer, integer) to authenticated, service_role;

-- ============================================================================================================
-- 4. Painel › aluno › Financeiro: os totais dos lançamentos do aluno (a regra de lancamentos.ts › totais)
-- ============================================================================================================
create or replace function {schema}.financeiro_totais_do_aluno(p_aluno uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'ok', true,
    'recebido', round(coalesce(sum(t.valor) filter (where not t.estornada and t.tipo is distinct from 'saida'), 0), 2),
    'gasto', round(coalesce(sum(t.valor) filter (where not t.estornada and t.tipo = 'saida'), 0), 2),
    'total', count(*),
    'primeira', min(t.data),
    'ultima', max(t.data))
    from {schema}.transacoes t
   where t.paciente_id = p_aluno and t.deleted_at is null;
$$;

revoke all on function {schema}.financeiro_totais_do_aluno(uuid) from public, anon;
grant execute on function {schema}.financeiro_totais_do_aluno(uuid) to authenticated, service_role;

-- ============================================================================================================
-- 5. Conferência (desfaz tudo se algo sair diferente)
-- ============================================================================================================
do $$
declare
  v_nada uuid := '00000000-0000-4000-8000-0000000000aa';
  v_j jsonb;
  v_f text;
begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = '{schema}' and p.proname = 'aluno_anotacoes') <> 1 then
    raise exception 'hml-14d: tem de sobrar UMA aluno_anotacoes em {schema} (a de 3 argumentos)';
  end if;
  -- as 2 DEFINER com search_path fixo; as 2 INVOKER com search_path fixo
  if not (select p.prosecdef and p.proconfig is not null from pg_catalog.pg_proc p
           where p.oid = '{schema}.aluno_anotacoes(uuid, integer, integer)'::regprocedure)
     or not (select p.prosecdef and p.proconfig is not null from pg_catalog.pg_proc p
              where p.oid = '{schema}.minha_agenda_lista(text, integer, integer)'::regprocedure) then
    raise exception 'hml-14d: aluno_anotacoes/minha_agenda_lista sem SECURITY DEFINER ou sem search_path';
  end if;
  if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p
       where p.oid = '{schema}.exames_do_aluno(uuid, text, integer, integer)'::regprocedure)
     or (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p
          where p.oid = '{schema}.financeiro_totais_do_aluno(uuid)'::regprocedure) then
    raise exception 'hml-14d: exames_do_aluno/financeiro_totais_do_aluno têm de ser SECURITY INVOKER com search_path';
  end if;
  -- só o logado e o servidor
  foreach v_f in array array['{schema}.aluno_anotacoes(uuid, integer, integer)', '{schema}.minha_agenda_lista(text, integer, integer)',
                             '{schema}.exames_do_aluno(uuid, text, integer, integer)', '{schema}.financeiro_totais_do_aluno(uuid)'] loop
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-14d: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;
  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação)
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    perform {schema}.aluno_anotacoes(v_nada);
    raise exception 'hml-14d: aluno_anotacoes sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.aluno_anotacoes(v_nada, 20, 0);
    raise exception 'hml-14d: aluno_anotacoes (página) sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  v_j := {schema}.minha_agenda_lista('proximas');
  if v_j is distinct from jsonb_build_object('ok', true, 'tipo', 'proximas', 'total', 0, 'itens', '[]'::jsonb) then
    raise exception 'hml-14d: minha_agenda_lista sem login = %', v_j;
  end if;
  v_j := {schema}.minha_agenda_lista('anteriores', 40, 500);
  if v_j is distinct from jsonb_build_object('ok', true, 'tipo', 'anteriores', 'total', 0, 'itens', '[]'::jsonb) then
    raise exception 'hml-14d: minha_agenda_lista (anteriores) sem login = %', v_j;
  end if;
  -- as 2 de leitura do painel rodando de verdade (um aluno que não existe: tudo vazio e zerado)
  v_j := {schema}.exames_do_aluno(v_nada, ' Glicemia  de jejum ', 0, 20);
  if v_j is distinct from jsonb_build_object('ok', true, 'total_datas', 0, 'total_resultados', 0, 'fora_referencia', 0,
                                             'exames', '[]'::jsonb, 'datas', '[]'::jsonb) then
    raise exception 'hml-14d: exames_do_aluno de um aluno sem resultado = %', v_j;
  end if;
  v_j := {schema}.financeiro_totais_do_aluno(v_nada);
  if v_j is distinct from jsonb_build_object('ok', true, 'recebido', 0, 'gasto', 0, 'total', 0, 'primeira', null, 'ultima', null) then
    raise exception 'hml-14d: financeiro_totais_do_aluno de um aluno sem lançamento = %', v_j;
  end if;
end
$$;

notify pgrst, 'reload schema';
