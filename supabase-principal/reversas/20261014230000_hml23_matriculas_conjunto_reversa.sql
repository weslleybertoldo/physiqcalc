-- Reversa da hml-23 (supabase-principal/migrations/20261014230000_hml23_matriculas_conjunto.sql). Idempotente: roda com ou sem a
-- migration aplicada. Devolve o "hoje" — as policies do aluno com UMA matrícula (a escalar, sem ordem): reabre o H-115. Só numa
-- emergência, com o OK do Weslley.
-- ⚠️ AVISO: só vale enquanto nenhuma migration mais nova mexer nas 4 funções, nas 15 policies ou nas 2 escalares — ela regrava o
-- texto de 14/10/2026 e desfaria, calada, a mudança mais nova (antes de rodar: git log das migrations depois de 20261014230000).
-- Ordem: (1) as 15 policies com o texto de antes (elas dependem das funções novas: o pg_depend impede apagá-las antes); (2) os 4 corpos
-- de antes; (3) as escalares de antes; (4) só então o drop das 2 novas; (5) a conferência e o notify.
-- Os textos abaixo são cópia letra por letra dos de antes: 20260920070000_paciente_acesso.sql:44-48 e :54-58 (as escalares) e
-- :206-255 (12 policies), 20260920080000_configuracoes.sql:66-68, 20260924010000_refeicoes_concluidas.sql:27-29,
-- 20260929030000_w02_nucleo.sql:452-461 (pode_ler_comprovante), :713-715 e :744-746, 20261009010000_hml14b_financeiro_resumo_periodo.sql:
-- 47-102, :107-200 e :256-340 (as 3 do Financeiro) — a conferência das definições (pg_get_functiondef e o pg_get_expr das policies)
-- compara o texto. Grants: nenhum muda (create or replace; as policies, como antes).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- 1. As 15 policies de antes
-- ============================================================================================================
drop policy if exists "paciente: ler o proprio" on {schema}.pacientes;
create policy "paciente: ler o proprio" on {schema}.pacientes
  for select to authenticated using (id = {schema}.meu_paciente_id());

drop policy if exists "paciente: ler os proprios planos" on {schema}.planos_alimentares;
create policy "paciente: ler os proprios planos" on {schema}.planos_alimentares
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler as refeicoes do proprio plano" on {schema}.refeicoes;
create policy "paciente: ler as refeicoes do proprio plano" on {schema}.refeicoes
  for select to authenticated using (exists (
    select 1 from {schema}.planos_alimentares p where p.id = plano_id and p.paciente_id = {schema}.meu_paciente_id() and p.deleted_at is null
  ));

drop policy if exists "paciente: ler os itens do proprio plano" on {schema}.itens_refeicao;
create policy "paciente: ler os itens do proprio plano" on {schema}.itens_refeicao
  for select to authenticated using (exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
    where r.id = refeicao_id and p.paciente_id = {schema}.meu_paciente_id() and p.deleted_at is null
  ));

drop policy if exists "paciente: ler taco e os alimentos da sua nutricionista" on {schema}.alimentos;
create policy "paciente: ler taco e os alimentos da sua nutricionista" on {schema}.alimentos
  for select to authenticated using ({schema}.eh_paciente() and (fonte = 'taco' or nutricionista_id = {schema}.minha_nutricionista_id()));

drop policy if exists "paciente: ler as medidas dos alimentos visiveis" on {schema}.medidas_caseiras;
create policy "paciente: ler as medidas dos alimentos visiveis" on {schema}.medidas_caseiras
  for select to authenticated using ({schema}.eh_paciente() and exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and (a.fonte = 'taco' or a.nutricionista_id = {schema}.minha_nutricionista_id())
  ));

drop policy if exists "paciente: ler as proprias orientacoes" on {schema}.orientacoes;
create policy "paciente: ler as proprias orientacoes" on {schema}.orientacoes
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler as proprias metas" on {schema}.metas;
create policy "paciente: ler as proprias metas" on {schema}.metas
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler os proprios agendamentos" on {schema}.agendamentos;
create policy "paciente: ler os proprios agendamentos" on {schema}.agendamentos
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler os proprios recibos" on {schema}.recibos;
create policy "paciente: ler os proprios recibos" on {schema}.recibos
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler o proprio diario" on {schema}.diario_alimentar;
create policy "paciente: ler o proprio diario" on {schema}.diario_alimentar
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler as proprias cobrancas" on {schema}.cobrancas;
create policy "paciente: ler as proprias cobrancas" on {schema}.cobrancas
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id() and deleted_at is null);

drop policy if exists "paciente: ler as proprias refeicoes concluidas" on {schema}.refeicoes_concluidas;
create policy "paciente: ler as proprias refeicoes concluidas" on {schema}.refeicoes_concluidas
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id());

drop policy if exists "metas_concluidas: aluno le as proprias" on {schema}.metas_concluidas;
create policy "metas_concluidas: aluno le as proprias" on {schema}.metas_concluidas for select to authenticated
  using (paciente_id = {schema}.meu_paciente_id());

drop policy if exists "aluno_assinaturas: aluno le a propria" on {schema}.aluno_assinaturas;
create policy "aluno_assinaturas: aluno le a propria" on {schema}.aluno_assinaturas for select to authenticated
  using (paciente_id = {schema}.meu_paciente_id());

-- ============================================================================================================
-- 2. Os 4 corpos de antes
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

create or replace function {schema}.pode_ler_comprovante(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.cobrancas c
     where c.comprovante_path = p_path and (
           (c.conta_id is not null and {schema}.sou_dono(c.conta_id))
        or c.criado_por = auth.uid()
        or c.nutricionista_id = auth.uid()
        or c.paciente_id = {schema}.meu_paciente_id()));
$$;

-- ============================================================================================================
-- 3. As escalares de antes (sem ordem; search_path = {schema}, public)
-- ============================================================================================================
create or replace function {schema}.meu_paciente_id() returns uuid
language sql stable security definer set search_path = {schema}, public as $$
  select p.id from {schema}.pacientes p join auth.users u on u.id = p.user_id
   where p.user_id = auth.uid() and p.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) limit 1;
$$;

create or replace function {schema}.minha_nutricionista_id() returns uuid
language sql stable security definer set search_path = {schema}, public as $$
  select p.nutricionista_id from {schema}.pacientes p join auth.users u on u.id = p.user_id
   where p.user_id = auth.uid() and p.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) limit 1;
$$;

-- ============================================================================================================
-- 4. Só agora (nenhuma policy lê mais as novas) o drop das 2 funções do conjunto
-- ============================================================================================================
drop function if exists {schema}.meus_pacientes_ids();
drop function if exists {schema}.minhas_nutricionistas_ids();

-- ============================================================================================================
-- 5. Conferência (desfaz tudo se algo sair diferente) — só catálogo
-- ============================================================================================================
do $$
declare
  v_pol record;
  v_n integer;
  v_f text;
  v_nomes text;
begin
  for v_pol in
    select x.tabela, x.nome, x.funcao
      from (values
        ('pacientes', 'paciente: ler o proprio', 'meu_paciente_id'),
        ('planos_alimentares', 'paciente: ler os proprios planos', 'meu_paciente_id'),
        ('refeicoes', 'paciente: ler as refeicoes do proprio plano', 'meu_paciente_id'),
        ('itens_refeicao', 'paciente: ler os itens do proprio plano', 'meu_paciente_id'),
        ('orientacoes', 'paciente: ler as proprias orientacoes', 'meu_paciente_id'),
        ('metas', 'paciente: ler as proprias metas', 'meu_paciente_id'),
        ('agendamentos', 'paciente: ler os proprios agendamentos', 'meu_paciente_id'),
        ('recibos', 'paciente: ler os proprios recibos', 'meu_paciente_id'),
        ('diario_alimentar', 'paciente: ler o proprio diario', 'meu_paciente_id'),
        ('cobrancas', 'paciente: ler as proprias cobrancas', 'meu_paciente_id'),
        ('refeicoes_concluidas', 'paciente: ler as proprias refeicoes concluidas', 'meu_paciente_id'),
        ('metas_concluidas', 'metas_concluidas: aluno le as proprias', 'meu_paciente_id'),
        ('aluno_assinaturas', 'aluno_assinaturas: aluno le a propria', 'meu_paciente_id'),
        ('alimentos', 'paciente: ler taco e os alimentos da sua nutricionista', 'minha_nutricionista_id'),
        ('medidas_caseiras', 'paciente: ler as medidas dos alimentos visiveis', 'minha_nutricionista_id')
      ) as x(tabela, nome, funcao)
  loop
    if not exists (
      select 1
        from pg_catalog.pg_policy p
        join pg_catalog.pg_depend d on d.classid = 'pg_catalog.pg_policy'::regclass and d.objid = p.oid
                                   and d.refclassid = 'pg_catalog.pg_proc'::regclass
       where p.polrelid = format('{schema}.%I', v_pol.tabela)::regclass and p.polname = v_pol.nome
         and p.polcmd = 'r' and p.polpermissive and p.polroles = array['authenticated'::regrole::oid]
         and d.refobjid = format('{schema}.%I()', v_pol.funcao)::regprocedure) then
      raise exception 'hml-23 (reversa): a policy "%" de {schema}.% não lê a {schema}.%()', v_pol.nome, v_pol.tabela, v_pol.funcao;
    end if;
  end loop;

  select count(distinct d.objid) into v_n from pg_catalog.pg_depend d
   where d.classid = 'pg_catalog.pg_policy'::regclass and d.refclassid = 'pg_catalog.pg_proc'::regclass
     and d.refobjid = '{schema}.meu_paciente_id()'::regprocedure;
  if v_n <> 13 then
    raise exception 'hml-23 (reversa): % policies leem a {schema}.meu_paciente_id() (esperado: 13)', v_n;
  end if;
  select count(distinct d.objid) into v_n from pg_catalog.pg_depend d
   where d.classid = 'pg_catalog.pg_policy'::regclass and d.refclassid = 'pg_catalog.pg_proc'::regclass
     and d.refobjid = '{schema}.minha_nutricionista_id()'::regprocedure;
  if v_n <> 2 then
    raise exception 'hml-23 (reversa): % policies leem a {schema}.minha_nutricionista_id() (esperado: 2)', v_n;
  end if;

  if to_regprocedure('{schema}.meus_pacientes_ids()') is not null or to_regprocedure('{schema}.minhas_nutricionistas_ids()') is not null then
    raise exception 'hml-23 (reversa): as funções do conjunto ainda existem em {schema}';
  end if;

  select string_agg(p.proname::text, ',' order by p.proname) into v_nomes from pg_catalog.pg_proc p
   where p.pronamespace = '{schema}'::regnamespace and strpos(p.prosrc, 'meu_paciente_id()') > 0;
  if v_nomes is distinct from
     'financeiro_recibos,financeiro_resumo_periodo,financeiro_transacoes_visiveis,paciente_marcar_refeicao,pode_ler_comprovante,rotina_salvar' then
    raise exception 'hml-23 (reversa): com a {schema}.meu_paciente_id() no corpo: %', v_nomes;
  end if;

  -- as escalares de antes: sem ordem, search_path = {schema}, public; o logado executa e o visitante não
  foreach v_f in array array['{schema}.meu_paciente_id()', '{schema}.minha_nutricionista_id()'] loop
    if not coalesce((select p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path={schema}, public']
                            and strpos(p.prosrc, 'order by') = 0
                       from pg_catalog.pg_proc p where p.oid = v_f::regprocedure), false) then
      raise exception 'hml-23 (reversa): % diferente da de antes', v_f;
    end if;
    if not has_function_privilege('authenticated', v_f, 'EXECUTE') or has_function_privilege('anon', v_f, 'EXECUTE') then
      raise exception 'hml-23 (reversa): % — o logado executa e o visitante não (como antes)', v_f;
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
