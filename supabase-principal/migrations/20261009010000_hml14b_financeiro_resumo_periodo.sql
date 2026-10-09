-- Homologação do Physiq — hml-14b (09/10/2026), D14 + B21 do Financeiro: os totais, os filtros, a busca e a contagem do Painel ›
-- Financeiro passam para o banco. Idempotente. SÓ FUNÇÕES NOVAS (nenhuma tabela, coluna, política ou dado muda; nenhuma função de
-- hoje é trocada).
--
-- Por quê: Lançamentos, Recibos, o Resumo e o Dashboard baixavam até 1000 linhas (o max_rows do PostgREST; o `.limit(2000)` dos
-- lançamentos e o `.limit(5000)` das cobranças viravam 1000 calados) e filtravam, contavam e SOMAVAM no navegador: com 20 por
-- página, o total valeria só para a página. Agora a tela pede a página (20) e o banco devolve a página, o total e as somas.
--
-- As regras são as MESMAS da tela de hoje (src/painel/financeiro/financeiroUtil.ts › filtrarTransacoes e totais; resumo.ts ›
-- recebimentos e entradasPorCategoria; Recibos.tsx › a busca), e quem vê o quê é o de hoje: a RLS + o recorte da conta ativa
-- (dados.ts › recorteDaConta: as linhas da conta + as minhas sem conta, do site antigo do Nutri). Como as funções são SECURITY
-- DEFINER (o padrão das vizinhas: alunos_da_conta, painel_resumo), a RLS está escrita aqui por extenso:
--   · lançamento (transacoes): da conta → o master, o dono da conta ou quem lançou; sem conta → só quem lançou;
--   · recibo (recibos): o mesmo; + o aluno, no recibo dele (política "paciente: ler os proprios recibos");
--   · cobrança paga (cobrancas, só no Resumo): da conta → o master, o dono, quem cobra (nutricionista_id) ou quem criou, e o aluno
--     na dele; sem conta → quem cobra;
--   · o nome do aluno (e o CPF) e o da categoria saem só para quem os lê hoje (pacientes: pode_ver_aluno, o responsável ou o
--     próprio aluno; categorias: as suas, o master, as de uma conta de que você é dono e as que um lançamento de uma conta sua
--     usa) — senão a linha sai sem o nome, como o embed de hoje;
--   · só quem é membro ativo da conta (ou o master) chama: sem_login · conta_inexistente · sem_acesso · periodo_invalido.
-- Busca: sem acento e sem caixa dos 2 lados ({schema}.texto_busca, o translate dos alimentos), até 6 palavras, TODAS precisam
-- aparecer (o "Joao" acha "João"; "material papel" acha a saída com as 2 palavras).
--
-- 1. financeiro_transacoes_visiveis(...) — auxiliar (só as funções abaixo chamam): os lançamentos que você vê no período, com o
--    nome da categoria e do aluno quando você os vê, e `casa` = passa nos filtros (tipo, categoria, forma, busca).
-- 2. financeiro_resumo_periodo(p_conta, p_de, p_ate, p_filtros) — os totais do período com os filtros: entradas, saídas, saldo e
--    as contagens (as estornadas ficam fora das somas e contam à parte), o total do período sem os filtros e as categorias usadas
--    no período (o filtro de categoria da tela). Com p_filtros.resumo = true (Resumo e Dashboard): + as entradas por dia e
--    categoria e as cobranças pagas sem lançamento por dia (dia de São Paulo) — o "recebido" do Resumo, sem contar em dobro.
-- 3. financeiro_lancamentos(p_conta, p_de, p_ate, p_filtros, p_offset, p_limite) — a página de Lançamentos (mais recente primeiro:
--    data, criação, id) e o total com os filtros; cada item no formato da leitura de hoje (categoria {nome}, paciente {nome, cpf}).
-- 4. financeiro_recibos(p_conta, p_filtros, p_offset, p_limite) — a página de Recibos (data, número, id; mais recente primeiro), o
--    total e a SOMA dos valores com a busca (aluno, descrição, número com 4 dígitos, descrição da entrada de origem) e o período
--    opcional (p_filtros.de/.ate — o "Recibos no mês" do Dashboard pede só o total, com p_limite 0).
-- p_filtros dos lançamentos: { tipo: entrada|saida, categoria: <id>, metodo: pix|dinheiro|…, q: texto, resumo: true } — valor
-- desconhecido de tipo/forma = sem filtro (como a URL da tela). p_limite: até 100 por chamada (a tela pede 20).
--
-- Aplicar (nenhuma das 4 existe hoje; backup não é preciso — só cria):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009010000_hml14b_financeiro_resumo_periodo.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009010000_hml14b_financeiro_resumo_periodo.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009010000_hml14b_financeiro_resumo_periodo_reversa.sql (o front da hml-14b chama as 3
-- RPCs: voltar o front ANTES de aplicar a reversa).

-- ============================================================================================================
-- 1. Os lançamentos que você vê no período (auxiliar)
-- ============================================================================================================
create or replace function {schema}.financeiro_transacoes_visiveis(
  p_conta uuid, p_de date, p_ate date, p_filtros jsonb, p_uid uuid, p_master boolean, p_dono boolean)
returns table (
  id uuid, nutricionista_id uuid, conta_id uuid, paciente_id uuid, tipo text, descricao text, valor numeric, data date, metodo text,
  observacao text, estornada boolean, recibo_id uuid, categoria_id uuid, created_at timestamptz,
  categoria_nome text, paciente_visivel boolean, paciente_nome text, paciente_cpf text, casa boolean)
language sql stable set search_path = '' as $$
  with f as (
    -- os filtros da URL da tela (financeiroUtil.filtrosDaURL): tipo e forma desconhecidos = todos; a busca em até 6 palavras
    select case when p_filtros ->> 'tipo' in ('entrada', 'saida') then p_filtros ->> 'tipo' end as tipo,
           nullif(btrim(coalesce(p_filtros ->> 'categoria', '')), '') as categoria,
           case when p_filtros ->> 'metodo' in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro')
                then p_filtros ->> 'metodo' end as metodo,
           array(select x.w from regexp_split_to_table({schema}.texto_busca(coalesce(p_filtros ->> 'q', '')), '\s+') with ordinality as x(w, n)
                  where x.w <> '' order by x.n limit 6) as palavras,
           {schema}.meu_paciente_id() as meu_paciente
  ), vis as (
    select t.id, t.nutricionista_id, t.conta_id, t.paciente_id, t.tipo, t.descricao, t.valor, t.data, t.metodo, t.observacao,
           t.estornada, t.recibo_id, t.categoria_id, t.created_at,
           -- a categoria (a RLS de categorias_financeiras): as suas, o master, as de uma conta de que você é dono e as que um
           -- lançamento de uma conta de que você é dono usa (a W19 deu ao dono a leitura das categorias da equipe)
           case when c.id is not null and (
                       p_master or c.nutricionista_id = p_uid
                    or (p_dono and t.conta_id = p_conta)
                    or (c.conta_id is not null and {schema}.sou_dono(c.conta_id))
                    or exists (select 1 from {schema}.transacoes t2
                                where t2.categoria_id = c.id and t2.conta_id is not null and {schema}.sou_dono(t2.conta_id)))
                then c.nome end as categoria_nome,
           -- o aluno: a RLS de pacientes (o responsável sem conta, o master, quem vê o aluno pela conta, o próprio aluno)
           coalesce(pa.id is not null and (p_master or pa.nutricionista_id = p_uid or pa.id = f0.meu_paciente or {schema}.pode_ver_aluno(pa.id)), false)
             as paciente_visivel,
           pa.nome as pac_nome, pa.cpf as pac_cpf
      from {schema}.transacoes t
      cross join f as f0
      left join {schema}.categorias_financeiras c on c.id = t.categoria_id
      left join {schema}.pacientes pa on pa.id = t.paciente_id
     where t.deleted_at is null
       and t.data between p_de and p_ate
       -- o recorte da conta ativa ∩ a RLS (ler as próprias ou master; dono da conta)
       and ((t.conta_id = p_conta and (p_master or p_dono or t.nutricionista_id = p_uid))
         or (t.conta_id is null and t.nutricionista_id = p_uid))
  )
  select v.id, v.nutricionista_id, v.conta_id, v.paciente_id, v.tipo, v.descricao, v.valor, v.data, v.metodo, v.observacao,
         v.estornada, v.recibo_id, v.categoria_id, v.created_at, v.categoria_nome, v.paciente_visivel,
         case when v.paciente_visivel then v.pac_nome end, case when v.paciente_visivel then v.pac_cpf end,
         coalesce(
               (f.tipo is null or v.tipo = f.tipo)
           and (f.categoria is null or v.categoria_id::text = f.categoria)
           and (f.metodo is null or v.metodo = f.metodo)
           -- todas as palavras na descrição, no aluno, na categoria ou na observação
           and not exists (
                 select 1 from unnest(f.palavras) as w(p)
                  where strpos({schema}.texto_busca(concat_ws(' ', v.descricao, case when v.paciente_visivel then v.pac_nome end,
                                                              v.categoria_nome, v.observacao)), w.p) = 0), false) as casa
    from vis v cross join f;
$$;

-- ============================================================================================================
-- 2. Os totais do período (Lançamentos, Resumo e Dashboard)
-- ============================================================================================================
create or replace function {schema}.financeiro_resumo_periodo(p_conta uuid, p_de date, p_ate date, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_dono boolean;
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_resumo boolean := coalesce(v_f ->> 'resumo', '') = 'true';
  v_ent numeric;
  v_sai numeric;
  v_n_ent integer;
  v_n_sai integer;
  v_n_est integer;
  v_total integer;
  v_total_periodo integer;
  v_cats jsonb;
  v_dias jsonb;
  v_cobs jsonb;
  v_eh_paciente boolean;
  v_meu_paciente uuid;
  v_saida jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  if not exists (select 1 from {schema}.contas c where c.id = p_conta) then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  if not ({schema}.sou_membro(p_conta) or v_master) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if p_de is null or p_ate is null or p_de > p_ate then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  v_dono := {schema}.sou_dono(p_conta);

  with v as materialized (
    select * from {schema}.financeiro_transacoes_visiveis(p_conta, p_de, p_ate, v_f, v_uid, v_master, v_dono)
  ), t as (
    -- financeiroUtil.totais: estornada fica fora das somas e das contagens por tipo (conta à parte); o que não é saída é entrada
    select coalesce(sum(x.valor) filter (where x.casa and not x.estornada and x.tipo <> 'saida'), 0) as ent,
           coalesce(sum(x.valor) filter (where x.casa and not x.estornada and x.tipo = 'saida'), 0) as sai,
           (count(*) filter (where x.casa and not x.estornada and x.tipo <> 'saida'))::integer as n_ent,
           (count(*) filter (where x.casa and not x.estornada and x.tipo = 'saida'))::integer as n_sai,
           (count(*) filter (where x.casa and x.estornada))::integer as n_est,
           (count(*) filter (where x.casa))::integer as n,
           count(*)::integer as n_periodo
      from v x
  )
  select t.ent, t.sai, t.n_ent, t.n_sai, t.n_est, t.n, t.n_periodo,
         -- as categorias usadas no período (o select de categoria da tela: as suas + as dos lançamentos da equipe)
         (select coalesce(jsonb_agg(jsonb_build_object('id', k.categoria_id, 'nome', k.categoria_nome) order by lower(k.categoria_nome), k.categoria_id), '[]'::jsonb)
            from (select distinct x.categoria_id, x.categoria_nome from v x where x.categoria_nome is not null) k),
         -- resumo.ts › recebimentos e entradasPorCategoria: as entradas não estornadas por dia e categoria (sem nome = "Sem categoria")
         case when v_resumo then (
           select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'categoria', d.categoria, 'valor', d.valor) order by d.dia, d.categoria nulls first), '[]'::jsonb)
             from (select x.data as dia, x.categoria_nome as categoria, sum(x.valor) as valor
                     from v x where x.casa and not x.estornada and x.tipo <> 'saida'
                    group by x.data, x.categoria_nome) d) end
    into v_ent, v_sai, v_n_ent, v_n_sai, v_n_est, v_total, v_total_periodo, v_cats, v_dias
    from t;

  v_saida := jsonb_build_object(
    'ok', true, 'de', p_de, 'ate', p_ate,
    'entradas', v_ent, 'saidas', v_sai, 'saldo', v_ent - v_sai,
    'n_entradas', v_n_ent, 'n_saidas', v_n_sai, 'n_estornadas', v_n_est, 'total', v_total,
    'total_periodo', v_total_periodo, 'categorias', v_cats);
  if not v_resumo then
    return v_saida;
  end if;

  -- o recebido do Resumo também tem as cobranças PAGAS que não viraram lançamento (o Pix confirmado, o Mercado Pago), pelo dia
  -- de São Paulo — sem estorno e sem lançamento (a que tem lançamento já conta por ele): resumo.ts › recebimentos
  v_eh_paciente := {schema}.eh_paciente();
  v_meu_paciente := {schema}.meu_paciente_id();
  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'valor', d.valor) order by d.dia), '[]'::jsonb)
    into v_cobs
    from (select (cb.pago_em at time zone 'America/Sao_Paulo')::date as dia, sum(cb.valor) as valor
            from {schema}.cobrancas cb
           where cb.deleted_at is null
             and cb.status = 'paga' and cb.reembolsado_em is null and cb.transacao_id is null
             and cb.pago_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
             and cb.pago_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
             -- o recorte da conta ativa ∩ a RLS de cobrancas (dono da conta ou quem criou; quem cobra; o master; o aluno na dele)
             and ((cb.conta_id = p_conta and (v_master or v_dono or cb.paciente_id = v_meu_paciente
                     or (not v_eh_paciente and (cb.nutricionista_id = v_uid or cb.criado_por = v_uid))))
               or (cb.conta_id is null and cb.nutricionista_id = v_uid
                     and (v_master or not v_eh_paciente or cb.paciente_id = v_meu_paciente)))
           group by 1) d;

  return v_saida || jsonb_build_object('entradas_por_dia', v_dias, 'cobrancas_por_dia', v_cobs);
end;
$$;

-- ============================================================================================================
-- 3. A página de Lançamentos
-- ============================================================================================================
create or replace function {schema}.financeiro_lancamentos(p_conta uuid, p_de date, p_ate date, p_filtros jsonb default '{}'::jsonb,
  p_offset integer default 0, p_limite integer default 20)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_dono boolean;
  v_lim integer := least(greatest(coalesce(p_limite, 20), 0), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_itens jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  if not exists (select 1 from {schema}.contas c where c.id = p_conta) then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  if not ({schema}.sou_membro(p_conta) or v_master) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if p_de is null or p_ate is null or p_de > p_ate then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  v_dono := {schema}.sou_dono(p_conta);

  with v as materialized (
    select * from {schema}.financeiro_transacoes_visiveis(p_conta, p_de, p_ate, coalesce(p_filtros, '{}'::jsonb), v_uid, v_master, v_dono) x
     where x.casa
  )
  select (select count(*)::integer from v),
         case when v_lim = 0 then '[]'::jsonb else (
           select coalesce(jsonb_agg(jsonb_build_object(
                    'id', s.id, 'nutricionista_id', s.nutricionista_id, 'conta_id', s.conta_id, 'paciente_id', s.paciente_id,
                    'tipo', s.tipo, 'descricao', s.descricao, 'valor', s.valor, 'data', s.data, 'metodo', s.metodo,
                    'observacao', s.observacao, 'estornada', s.estornada, 'recibo_id', s.recibo_id, 'categoria_id', s.categoria_id,
                    'created_at', s.created_at,
                    'categoria', case when s.categoria_nome is null then null else jsonb_build_object('nome', s.categoria_nome) end,
                    'paciente', case when not s.paciente_visivel then null else jsonb_build_object('nome', s.paciente_nome, 'cpf', s.paciente_cpf) end)
                  order by s.data desc, s.created_at desc, s.id desc), '[]'::jsonb)
             from (select * from v order by v.data desc, v.created_at desc, v.id desc limit v_lim offset v_off) s) end
    into v_total, v_itens;

  return jsonb_build_object('ok', true, 'total', v_total, 'offset', v_off, 'limite', v_lim, 'itens', v_itens);
end;
$$;

-- ============================================================================================================
-- 4. A página de Recibos
-- ============================================================================================================
create or replace function {schema}.financeiro_recibos(p_conta uuid, p_filtros jsonb default '{}'::jsonb,
  p_offset integer default 0, p_limite integer default 20)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_dono boolean;
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_meu_paciente uuid;
  v_palavras text[];
  v_de date;
  v_ate date;
  v_lim integer := least(greatest(coalesce(p_limite, 20), 0), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_soma numeric;
  v_itens jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  if not exists (select 1 from {schema}.contas c where c.id = p_conta) then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  if not ({schema}.sou_membro(p_conta) or v_master) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  v_dono := {schema}.sou_dono(p_conta);
  v_meu_paciente := {schema}.meu_paciente_id();
  -- o período é opcional (o "Recibos no mês" do Dashboard); data inválida = sem o limite
  begin
    v_de := nullif(btrim(coalesce(v_f ->> 'de', '')), '')::date;
  exception when others then
    v_de := null;
  end;
  begin
    v_ate := nullif(btrim(coalesce(v_f ->> 'ate', '')), '')::date;
  exception when others then
    v_ate := null;
  end;
  v_palavras := array(select x.w from regexp_split_to_table({schema}.texto_busca(coalesce(v_f ->> 'q', '')), '\s+') with ordinality as x(w, n)
                       where x.w <> '' order by x.n limit 6);

  with vis as (
    select r.id, r.nutricionista_id, r.paciente_id, r.transacao_id, r.modelo_id, r.numero, r.valor, r.data, r.descricao, r.texto,
           r.created_at,
           coalesce(pa.id is not null and (v_master or pa.nutricionista_id = v_uid or pa.id = v_meu_paciente or {schema}.pode_ver_aluno(pa.id)), false)
             as pac_vis,
           pa.nome as pac_nome, pa.cpf as pac_cpf,
           -- a entrada de origem: a RLS de transacoes (as suas, o master, o dono da conta dela) — sem olhar a lixeira, como o embed
           coalesce(tx.id is not null and (v_master or tx.nutricionista_id = v_uid or (tx.conta_id is not null and {schema}.sou_dono(tx.conta_id))), false) as tx_vis,
           tx.descricao as tx_descricao, tx.data as tx_data
      from {schema}.recibos r
      left join {schema}.pacientes pa on pa.id = r.paciente_id
      left join {schema}.transacoes tx on tx.id = r.transacao_id
     where r.deleted_at is null
       and (v_de is null or r.data >= v_de) and (v_ate is null or r.data <= v_ate)
       -- o recorte da conta ativa ∩ a RLS de recibos (os próprios ou master; dono da conta; o aluno no dele)
       and ((r.conta_id = p_conta and (v_master or v_dono or r.nutricionista_id = v_uid or r.paciente_id = v_meu_paciente))
         or (r.conta_id is null and r.nutricionista_id = v_uid))
  ), sel as materialized (
    -- Recibos.tsx: o aluno, a descrição, o número com 4 dígitos (formatarNumeroRecibo) e a descrição da entrada de origem
    select v.* from vis v
     where not exists (
             select 1 from unnest(v_palavras) as w(p)
              where strpos({schema}.texto_busca(concat_ws(' ', case when v.pac_vis then v.pac_nome end, v.descricao,
                                                          case when length(v.numero::text) >= 4 then v.numero::text else lpad(v.numero::text, 4, '0') end,
                                                          case when v.tx_vis then v.tx_descricao end)), w.p) = 0)
  )
  select (select count(*)::integer from sel), (select coalesce(sum(s.valor), 0) from sel s),
         case when v_lim = 0 then '[]'::jsonb else (
           select coalesce(jsonb_agg(jsonb_build_object(
                    'id', s.id, 'nutricionista_id', s.nutricionista_id, 'paciente_id', s.paciente_id, 'transacao_id', s.transacao_id,
                    'modelo_id', s.modelo_id, 'numero', s.numero, 'valor', s.valor, 'data', s.data, 'descricao', s.descricao,
                    'texto', s.texto, 'created_at', s.created_at,
                    'paciente', case when not s.pac_vis then null else jsonb_build_object('nome', s.pac_nome, 'cpf', s.pac_cpf) end,
                    'transacao', case when not s.tx_vis then null else jsonb_build_object('descricao', s.tx_descricao, 'data', s.tx_data) end)
                  order by s.data desc, s.numero desc, s.id desc), '[]'::jsonb)
             from (select * from sel order by sel.data desc, sel.numero desc, sel.id desc limit v_lim offset v_off) s) end
    into v_total, v_soma, v_itens;

  return jsonb_build_object('ok', true, 'total', v_total, 'soma', v_soma, 'offset', v_off, 'limite', v_lim, 'itens', v_itens);
end;
$$;

-- a auxiliar roda dentro das 2 funções dos lançamentos (security definer) e recebe quem chama por parâmetro: ninguém de fora chama
revoke all on function {schema}.financeiro_transacoes_visiveis(uuid, date, date, jsonb, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function {schema}.financeiro_transacoes_visiveis(uuid, date, date, jsonb, uuid, boolean, boolean) to service_role;
-- as 3 o painel chama com o login da pessoa (cada uma confere quem chama: membro ativo da conta ou o master)
revoke all on function {schema}.financeiro_resumo_periodo(uuid, date, date, jsonb), {schema}.financeiro_lancamentos(uuid, date, date, jsonb, integer, integer),
  {schema}.financeiro_recibos(uuid, jsonb, integer, integer) from public, anon;
grant execute on function {schema}.financeiro_resumo_periodo(uuid, date, date, jsonb), {schema}.financeiro_lancamentos(uuid, date, date, jsonb, integer, integer),
  {schema}.financeiro_recibos(uuid, jsonb, integer, integer) to authenticated, service_role;
