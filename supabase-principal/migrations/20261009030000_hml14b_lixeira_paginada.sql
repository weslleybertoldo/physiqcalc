-- Physiq hml-14b (B21 · D13) — Ferramentas › Lixeira com página e total por tipo, no BANCO PRINCIPAL (public + staging). Idempotente;
-- só funções (nenhuma tabela, política ou dado muda).
-- Aplicar (backup das definições ANTES — e2e/w26/backup.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009030000_hml14b_lixeira_paginada.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009030000_hml14b_lixeira_paginada.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009030000_hml14b_lixeira_paginada_reversa.sql
--
-- Hoje a lixeira_da_conta(p_conta) (W26, 20261001230000_w26_lixeira.sql) devolve até 300 itens POR TIPO, sem "ver mais", e a tela
-- filtra, busca e conta no navegador. Aqui:
--   lixeira_da_conta(p_conta, p_tipo, p_busca, p_offset, p_limite)   os 4 parâmetros novos têm padrão null:
--     · chamada como antes (só p_conta: o APK antigo, a produção de hoje e os E2E da W26) → a MESMA resposta de hoje:
--       { ok, conta_id, ve_clinico, tem_nutricao, itens } com até 300 por tipo, mais recente primeiro;
--     · com qualquer um dos novos → UMA página de UMA aba: { ok, conta_id, ve_clinico, tem_nutricao, tipo, totais, total, itens }:
--       tipo = a aba mostrada (p_tipo se a pessoa tem a aba; senão a 1ª com itens; senão 'resposta' — a regra da tela, abaInicial),
--       totais = os números das abas (sem a busca; só as abas que a pessoa tem), total = os itens da aba com a busca (sem acento,
--       por palavras, no título, no detalhe e no nome do aluno — texto_busca dos 2 lados), itens = a página (p_offset, até p_limite
--       — 20 por padrão, no máximo 100), mais recente primeiro (desempate pelo id).
--   Quem vê o quê e quem pode restaurar/apagar NÃO muda (P1 + a regra clínica da W18, as mesmas funções da W26); o aluno removido
--   continua como está: fica até restaurar, nunca "apagar de vez", nunca entra na purga de 30 dias.
--   lixeira_montar(...)   a lista em si (só o servidor: a lixeira_da_conta confere quem chama e passa o que a pessoa pode ver).

-- ============================================================================================================
-- 1. A lista (as 5 fontes da W26, sem o corte de 300 no meio): os 2 formatos de resposta
-- ============================================================================================================
create or replace function {schema}.lixeira_montar(p_conta uuid, p_nutri boolean, p_tem_nutricao boolean, p_tipo text, p_busca text,
  p_offset integer, p_limite integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with alunos as (
    select p.id, p.nome from {schema}.pacientes p where p.conta_id = p_conta
  ), todos as (
    -- respostas de pré-consulta (a conta é a do formulário — W21; as do site antigo sem conta: só as do próprio autor)
    select 'resposta'::text as tipo, r.id, coalesce(nullif(btrim(r.titulo), ''), 'Pré-consulta') as titulo, nullif(btrim(r.nome), '') as detalhe,
           r.paciente_id, a.nome as paciente_nome, r.deleted_at as excluido_em, true as restaura, true as apaga
      from {schema}.respostas_preconsulta r left join alunos a on a.id = r.paciente_id
     where r.deleted_at is not null
       and (r.conta_id = p_conta or (r.conta_id is null and r.nutricionista_id = (select auth.uid())))
       and {schema}.w26_lixeira_resposta_mexe(r.conta_id, r.nutricionista_id)
    union all
    select 'anamnese', x.id, coalesce(nullif(btrim(x.titulo), ''), 'Anamnese'), null, x.paciente_id, a.nome, x.deleted_at,
           {schema}.w26_lixeira_clinico_mexe(x.paciente_id), {schema}.w26_lixeira_clinico_mexe(x.paciente_id)
      from {schema}.anamneses x join alunos a on a.id = x.paciente_id
     where p_nutri and x.deleted_at is not null and {schema}.w26_lixeira_clinico_ve(x.paciente_id)
    union all
    select 'antropometria', x.id, 'Antropometria', to_char(x.data at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), x.paciente_id, a.nome,
           x.deleted_at, {schema}.w26_lixeira_clinico_mexe(x.paciente_id), {schema}.w26_lixeira_clinico_mexe(x.paciente_id)
      from {schema}.antropometrias x join alunos a on a.id = x.paciente_id
     where p_nutri and x.deleted_at is not null and {schema}.w26_lixeira_clinico_ve(x.paciente_id)
    union all
    select 'plano', x.id, coalesce(nullif(btrim(x.titulo), ''), 'Plano alimentar'), null, x.paciente_id, a.nome, x.deleted_at,
           {schema}.w26_lixeira_clinico_mexe(x.paciente_id), {schema}.w26_lixeira_clinico_mexe(x.paciente_id)
      from {schema}.planos_alimentares x join alunos a on a.id = x.paciente_id
     where p_nutri and x.deleted_at is not null and {schema}.w26_lixeira_clinico_ve(x.paciente_id)
    union all
    -- alunos (matrículas removidas da lista — aluno_remover da W13): nunca apagados de vez
    select 'paciente', p.id, coalesce(nullif(btrim(p.nome), ''), 'Aluno'), nullif(btrim(coalesce(p.email, '')), ''), null::uuid, null::text,
           p.deleted_at, {schema}.w13_pode_gerir(p.id), false
      from {schema}.pacientes p
     where p.conta_id = p_conta and p.deleted_at is not null and ({schema}.eh_master() or {schema}.pode_ver_aluno(p.id))
  ), legado as (
    -- o formato de antes: até 300 por tipo (o corte da W26)
    select t.*, row_number() over (partition by t.tipo order by t.excluido_em desc, t.id) as n from todos t
  ), abas as (
    -- as abas da pessoa (a regra da tela, abasDaPessoa): as clínicas só para a nutricionista numa conta com Nutrição
    select a.tipo, a.ordem
      from unnest(case when p_nutri and p_tem_nutricao then array['resposta', 'anamnese', 'antropometria', 'plano', 'paciente']
                       else array['resposta', 'paciente'] end) with ordinality as a(tipo, ordem)
  ), totais as (
    select t.tipo, count(*)::integer as n from todos t join abas a on a.tipo = t.tipo group by t.tipo
  ), aba as (
    select coalesce((select a.tipo from abas a where a.tipo = p_tipo),
                    (select a.tipo from abas a join totais t on t.tipo = a.tipo order by a.ordem limit 1),
                    'resposta') as tipo
  ), palavras as (
    select w.palavra
      from unnest(string_to_array({schema}.texto_busca(btrim(regexp_replace(coalesce(p_busca, ''), '\s+', ' ', 'g'))), ' ')) as w(palavra)
     where w.palavra <> ''
  ), filtrados as (
    select t.* from todos t join aba on aba.tipo = t.tipo
     where not exists (select 1 from palavras pw
                        where strpos({schema}.texto_busca(t.titulo || ' ' || coalesce(t.detalhe, '') || ' ' || coalesce(t.paciente_nome, '')),
                                     pw.palavra) = 0)
  ), pagina as (
    select f.* from filtrados f
     order by f.excluido_em desc, f.id
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 20), 1), 100)
  )
  select case
    when p_tipo is null and p_busca is null and p_offset is null and p_limite is null then
      jsonb_build_object('ok', true, 'conta_id', p_conta, 've_clinico', p_nutri, 'tem_nutricao', p_tem_nutricao,
        'itens', coalesce((select jsonb_agg(jsonb_build_object(
                    'tipo', l.tipo, 'id', l.id, 'titulo', l.titulo, 'detalhe', l.detalhe, 'paciente_id', l.paciente_id,
                    'paciente_nome', l.paciente_nome, 'excluido_em', l.excluido_em, 'pode_restaurar', coalesce(l.restaura, false),
                    'pode_apagar', coalesce(l.apaga, false))
                  order by l.excluido_em desc, l.tipo, l.id)
                  from legado l where l.n <= 300), '[]'::jsonb))
    else
      jsonb_build_object('ok', true, 'conta_id', p_conta, 've_clinico', p_nutri, 'tem_nutricao', p_tem_nutricao,
        'tipo', (select aba.tipo from aba),
        'totais', coalesce((select jsonb_object_agg(t.tipo, t.n) from totais t), '{}'::jsonb),
        'total', (select count(*) from filtrados),
        'itens', coalesce((select jsonb_agg(jsonb_build_object(
                    'tipo', pg.tipo, 'id', pg.id, 'titulo', pg.titulo, 'detalhe', pg.detalhe, 'paciente_id', pg.paciente_id,
                    'paciente_nome', pg.paciente_nome, 'excluido_em', pg.excluido_em, 'pode_restaurar', coalesce(pg.restaura, false),
                    'pode_apagar', coalesce(pg.apaga, false))
                  order by pg.excluido_em desc, pg.id)
                  from pagina pg), '[]'::jsonb))
  end;
$$;

-- só o servidor (quem chama é a lixeira_da_conta, que já conferiu a pessoa)
revoke all on function {schema}.lixeira_montar(uuid, boolean, boolean, text, text, integer, integer) from public, anon, authenticated;
grant execute on function {schema}.lixeira_montar(uuid, boolean, boolean, text, text, integer, integer) to service_role;

-- ============================================================================================================
-- 2. A função que a tela chama: os 4 parâmetros novos com padrão (a de 1 argumento sai — com as 2 o PostgREST não escolhe)
-- ============================================================================================================
drop function if exists {schema}.lixeira_da_conta(uuid);

create or replace function {schema}.lixeira_da_conta(p_conta uuid, p_tipo text default null, p_busca text default null,
  p_offset integer default null, p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_c {schema}.contas%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  if not (v_master or {schema}.sou_membro(p_conta)) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  -- as abas clínicas só existem para quem é nutricionista numa conta com Nutrição (ou o master)
  return {schema}.lixeira_montar(p_conta, v_master or {schema}.tenho_papel(p_conta, 'nutricionista'),
                                 'nutricao' = any({schema}.modulos_do_plano(v_c.plano)), p_tipo, p_busca, p_offset, p_limite);
end;
$$;

-- os default privileges do projeto dão EXECUTE ao anon em toda função nova → revogar e dar só a quem tem login
revoke all on function {schema}.lixeira_da_conta(uuid, text, text, integer, integer) from public, anon;
grant execute on function {schema}.lixeira_da_conta(uuid, text, text, integer, integer) to authenticated, service_role;

-- ============================================================================================================
-- 3. Conferência (desfaz tudo se algo sair diferente)
-- ============================================================================================================
do $$
declare
  v_conta uuid := '00000000-0000-4000-8000-0000000000aa';
  v_j jsonb;
begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = '{schema}' and p.proname = 'lixeira_da_conta') <> 1 then
    raise exception 'hml-14b: tem de sobrar UMA lixeira_da_conta em {schema} (a de 5 argumentos)';
  end if;
  if not (select p.prosecdef and p.proconfig is not null from pg_catalog.pg_proc p
           where p.oid = '{schema}.lixeira_da_conta(uuid, text, text, integer, integer)'::regprocedure) then
    raise exception 'hml-14b: lixeira_da_conta sem SECURITY DEFINER ou sem search_path';
  end if;
  if has_function_privilege('anon', '{schema}.lixeira_da_conta(uuid, text, text, integer, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', '{schema}.lixeira_da_conta(uuid, text, text, integer, integer)', 'EXECUTE') then
    raise exception 'hml-14b: lixeira_da_conta fora do esperado (só o logado e o servidor)';
  end if;
  if has_function_privilege('anon', '{schema}.lixeira_montar(uuid, boolean, boolean, text, text, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', '{schema}.lixeira_montar(uuid, boolean, boolean, text, text, integer, integer)', 'EXECUTE') then
    raise exception 'hml-14b: lixeira_montar fora do esperado (só o servidor)';
  end if;
  -- sem login: a recusa de sempre (a migração roda sem JWT; garantido aqui, só nesta transação)
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  v_j := {schema}.lixeira_da_conta(v_conta);
  if v_j is distinct from jsonb_build_object('ok', false, 'erro', 'sem_login') then
    raise exception 'hml-14b: lixeira_da_conta sem login = %', v_j;
  end if;
  -- os 2 formatos rodando de verdade (conta que não existe: listas vazias)
  v_j := {schema}.lixeira_montar(v_conta, true, true, null, null, null, null);
  if v_j is distinct from jsonb_build_object('ok', true, 'conta_id', v_conta, 've_clinico', true, 'tem_nutricao', true, 'itens', '[]'::jsonb) then
    raise exception 'hml-14b: formato antigo da lixeira = %', v_j;
  end if;
  v_j := {schema}.lixeira_montar(v_conta, false, true, 'anamnese', 'Zé  Último 12', 0, 20);
  if v_j is distinct from jsonb_build_object('ok', true, 'conta_id', v_conta, 've_clinico', false, 'tem_nutricao', true, 'tipo', 'resposta',
                                             'totais', '{}'::jsonb, 'total', 0, 'itens', '[]'::jsonb) then
    raise exception 'hml-14b: página da lixeira = %', v_j;
  end if;
  v_j := {schema}.lixeira_montar(v_conta, true, true, 'paciente', null, 40, 20);
  if v_j ->> 'tipo' is distinct from 'paciente' then
    raise exception 'hml-14b: a aba pedida (paciente) não voltou: %', v_j;
  end if;
end
$$;

notify pgrst, 'reload schema';
