-- Physiq hml-14d (B21 · D28, 09/10/2026) — as listas do painel MASTER com página do BANCO (banco principal, staging + public).
-- Idempotente; só funções (nenhuma tabela, coluna, política ou dado muda).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009060000_hml14d_master_paginado.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009060000_hml14d_master_paginado.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009060000_hml14d_master_paginado_reversa.sql
--
-- Hoje as 5 RPCs das listas do master devolvem a lista INTEIRA (Contas, Financeiro e Integrações montam a w27_conta_linha de TODAS
-- as contas; o Sem conta já tem 76 pessoas em produção) e a busca de Contas é feita no navegador. Aqui, no molde da lixeira_da_conta
-- da hml-14b (drop da assinatura antiga + create com os parâmetros novos de padrão null — com as 2 o PostgREST não escolhe):
--   master_contas(p_filtros, p_offset, p_limite)          master_financeiro(p_filtro, p_offset, p_limite)
--   master_integracoes(p_offset, p_limite)                master_alunos_do_app(p_offset, p_limite, p_busca)
--   master_sem_conta(p_busca, p_offset, p_limite)
--     · chamada como antes (os parâmetros novos nulos: o APK antigo, a produção de hoje, o e2e/w27/api.py com {"p_filtros": {}})
--       → a MESMA resposta de hoje (o texto de 20261002010000_w27_master.sql e de 20260929190000_w07b_sem_profissional.sql);
--     · com p_offset ou p_limite (no App do aluno, também p_busca) → UMA página: as chaves de hoje + total (com o filtro e a busca);
--       no Financeiro, + faturas_total (o chip "Faturas recentes" mostrava o tamanho da lista, até 40, como se fosse o total — P6).
--       Limite 20 por padrão, de 1 a 100; a ordem de hoje + o id (desempate). Contas, Financeiro e Integrações filtram, ordenam e
--       contam sobre uma base LEVE (a situação pela w27_situacao — a mesma conta da w27_conta_linha — e o dono) e montam a
--       w27_conta_linha SÓ das linhas da página; o resumo é o de hoje. Busca sem acento e sem caixa (texto_busca dos 2 lados) e
--       literal (os curingas do LIKE vindos da tela viram texto).
--   master_alunos(p_filtros, p_offset, p_limite) — mesma assinatura (create or replace): a busca passa a ser pela coluna
--     pacientes.busca (nome, apelido, e-mail, tags e os DÍGITOS do CPF e do telefone — hml-14b) + os dígitos do termo (3 ou mais),
--     literal, e a ordem ganha o desempate pelo id (o molde da alunos_da_conta). Sem busca: a resposta de hoje.

-- ============================================================================================================
-- 1. Contas
-- ============================================================================================================
drop function if exists {schema}.master_contas(jsonb);

create or replace function {schema}.master_contas(p_filtros jsonb default '{}'::jsonb, p_offset integer default null,
  p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busca text := lower(btrim(coalesce(v_f ->> 'busca', '')));
  v_sit text := nullif(v_f ->> 'situacao', '');
  v_origem text := nullif(v_f ->> 'origem', '');
  v_todas jsonb;
  -- hml-14d (B21): a página
  v_q text;
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_r jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_offset is null and p_limite is null then
    -- a chamada de hoje (sem página): o texto da W27, igual
    select coalesce(jsonb_agg(x.l order by {schema}.w27_peso(x.l ->> 'situacao_efetiva'), lower(x.l ->> 'nome')), '[]'::jsonb) into v_todas
      from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c) x;
    return jsonb_build_object(
      'ok', true, 'hoje', {schema}.cobranca_hoje(),
      'resumo', jsonb_build_object(
        'todas', jsonb_array_length(v_todas),
        'ativas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' in ('ativa', 'teste', 'isenta')),
        'vencidas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'vencida'),
        'suspensas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' in ('suspensa', 'cancelada'))),
      'contas', coalesce((
        select jsonb_agg(e) from jsonb_array_elements(v_todas) e
         where (v_origem is null or e ->> 'origem' = v_origem)
           and (v_sit is null
                or (v_sit = 'ativas' and e ->> 'situacao_efetiva' in ('ativa', 'teste', 'isenta'))
                or (v_sit = 'suspensas' and e ->> 'situacao_efetiva' in ('suspensa', 'cancelada'))
                or e ->> 'situacao_efetiva' = v_sit)
           and (v_busca = '' or lower(e ->> 'nome') like '%' || v_busca || '%'
                or lower(coalesce(e #>> '{dono,nome}', '')) like '%' || v_busca || '%'
                or lower(coalesce(e #>> '{dono,email}', '')) like '%' || v_busca || '%')), '[]'::jsonb));
  end if;

  -- hml-14d (B21): a busca literal, sem acento e sem caixa (nome da conta, nome e e-mail do dono — o que a tela mostra)
  v_q := {schema}.texto_busca(btrim(regexp_replace(coalesce(v_f ->> 'busca', ''), '\s+', ' ', 'g')));
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  with base as (
    -- a base leve: a situação que vale hoje (a mesma conta da w27_conta_linha) sem montar a linha
    select c.id, c.nome, c.origem, c.dono_id,
           {schema}.w27_situacao(c.origem, c.cobranca_legada, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias) as sit
      from {schema}.contas c
  ), filtrada as (
    select b.* from base b
     where (v_origem is null or b.origem = v_origem)
       and (v_sit is null
            or (v_sit = 'ativas' and b.sit in ('ativa', 'teste', 'isenta'))
            or (v_sit = 'suspensas' and b.sit in ('suspensa', 'cancelada'))
            or b.sit = v_sit)
       and (v_q = ''
            or {schema}.texto_busca(b.nome) like '%' || v_q || '%'
            or {schema}.texto_busca({schema}.w27_nome(b.dono_id)) like '%' || v_q || '%'
            or {schema}.texto_busca((select u.email from auth.users u where u.id = b.dono_id)) like '%' || v_q || '%')
  ), pagina as (
    select fl.id, fl.nome, fl.sit from filtrada fl
     order by {schema}.w27_peso(fl.sit), lower(fl.nome), fl.id
    offset v_off limit v_lim
  )
  select jsonb_build_object(
    'ok', true, 'hoje', {schema}.cobranca_hoje(),
    'resumo', (select jsonb_build_object(
        'todas', count(*),
        'ativas', count(*) filter (where b.sit in ('ativa', 'teste', 'isenta')),
        'vencidas', count(*) filter (where b.sit = 'vencida'),
        'suspensas', count(*) filter (where b.sit in ('suspensa', 'cancelada')))
      from base b),
    'total', (select count(*) from filtrada),
    'contas', coalesce((select jsonb_agg({schema}.w27_conta_linha(pg.id) order by {schema}.w27_peso(pg.sit), lower(pg.nome), pg.id)
                          from pagina pg), '[]'::jsonb))
    into v_r;
  return v_r;
end;
$$;

-- ============================================================================================================
-- 2. Financeiro
-- ============================================================================================================
drop function if exists {schema}.master_financeiro(text);

create or replace function {schema}.master_financeiro(p_filtro text default 'todas', p_offset integer default null,
  p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := {schema}.cobranca_hoje();
  v_ini date := date_trunc('month', {schema}.cobranca_hoje())::date;
  v_todas jsonb;
  v_filtro text := coalesce(nullif(p_filtro, ''), 'todas');
  -- hml-14d (B21): a página
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_r jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_offset is null and p_limite is null then
    -- a chamada de hoje (sem página): o texto da W27, igual
    select coalesce(jsonb_agg(x.l order by {schema}.w27_peso(x.l ->> 'situacao_efetiva'), x.l ->> 'vence_em', lower(x.l ->> 'nome')), '[]'::jsonb) into v_todas
      from (select {schema}.w27_conta_linha(c.id) as l from {schema}.contas c where c.origem <> 'app') x;
    return jsonb_build_object(
      'ok', true, 'hoje', v_hoje, 'filtro', v_filtro,
      'resumo', jsonb_build_object(
        'todas', jsonb_array_length(v_todas),
        'vencidas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'vencida'),
        'tolerancia', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'ativa'
                        and (e ->> 'vence_em')::date < v_hoje and coalesce((e ->> 'tolerancia_dias')::integer, 0) > 0),
        'teste', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'teste'),
        'isentas', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'isenta'),
        'em_dia', (select count(*) from jsonb_array_elements(v_todas) e where e ->> 'situacao_efetiva' = 'ativa'),
        'legadas', (select count(*) from jsonb_array_elements(v_todas) e where (e ->> 'cobranca_legada')::boolean),
        'recebido_mes', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status = 'approved'
                                   and (f.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0),
        'em_aberto', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status in ('pending', 'in_process')), 0)),
      'contas', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_todas) e
         where case v_filtro
                 when 'vencidas' then e ->> 'situacao_efetiva' = 'vencida'
                 when 'tolerancia' then e ->> 'situacao_efetiva' = 'ativa' and (e ->> 'vence_em')::date < v_hoje and coalesce((e ->> 'tolerancia_dias')::integer, 0) > 0
                 when 'teste' then e ->> 'situacao_efetiva' = 'teste'
                 when 'isentas' then e ->> 'situacao_efetiva' = 'isenta'
                 when 'em_dia' then e ->> 'situacao_efetiva' = 'ativa'
                 when 'legadas' then (e ->> 'cobranca_legada')::boolean
                 else true end), '[]'::jsonb),
      'faturas', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f.id, 'conta_id', f.conta_id, 'conta_nome', c.nome, 'tipo', f.tipo, 'valor', f.valor, 'status', f.status, 'forma', f.forma,
          'cobre_de', f.cobre_de, 'cobre_ate', f.cobre_ate, 'pago_em', f.pago_em, 'criado_em', f.criado_em, 'descricao', f.descricao,
          'registrado_por', case when f.registrado_por is null then null else {schema}.w27_nome(f.registrado_por) end) order by f.criado_em desc)
        from (select * from {schema}.conta_faturas order by criado_em desc limit 40) f join {schema}.contas c on c.id = f.conta_id), '[]'::jsonb));
  end if;

  with base as (
    -- a base leve (as contas de profissional): a situação que vale hoje, sem montar a linha
    select c.id, c.nome, c.vence_em, c.tolerancia_dias, c.cobranca_legada,
           {schema}.w27_situacao(c.origem, c.cobranca_legada, c.situacao, c.teste_ate, c.vence_em, c.tolerancia_dias) as sit
      from {schema}.contas c where c.origem <> 'app'
  ), filtrada as (
    select b.* from base b
     where case v_filtro
             when 'vencidas' then b.sit = 'vencida'
             when 'tolerancia' then b.sit = 'ativa' and b.vence_em < v_hoje and coalesce(b.tolerancia_dias, 0) > 0
             when 'teste' then b.sit = 'teste'
             when 'isentas' then b.sit = 'isenta'
             when 'em_dia' then b.sit = 'ativa'
             when 'legadas' then b.cobranca_legada
             else true end
  ), pagina as (
    -- a ordem de hoje (o vence_em era comparado como o texto AAAA-MM-DD do jsonb: a mesma ordem da data) + o id
    select fl.id, fl.nome, fl.sit, fl.vence_em from filtrada fl
     order by {schema}.w27_peso(fl.sit), fl.vence_em, lower(fl.nome), fl.id
    offset v_off limit v_lim
  )
  select jsonb_build_object(
    'ok', true, 'hoje', v_hoje, 'filtro', v_filtro,
    'resumo', (select jsonb_build_object(
        'todas', count(*),
        'vencidas', count(*) filter (where b.sit = 'vencida'),
        'tolerancia', count(*) filter (where b.sit = 'ativa' and b.vence_em < v_hoje and coalesce(b.tolerancia_dias, 0) > 0),
        'teste', count(*) filter (where b.sit = 'teste'),
        'isentas', count(*) filter (where b.sit = 'isenta'),
        'em_dia', count(*) filter (where b.sit = 'ativa'),
        'legadas', count(*) filter (where b.cobranca_legada),
        'recebido_mes', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status = 'approved'
                                   and (f.pago_em at time zone 'America/Sao_Paulo')::date >= v_ini), 0),
        'em_aberto', coalesce((select sum(f.valor) from {schema}.conta_faturas f where f.status in ('pending', 'in_process')), 0))
      from base b),
    'total', (select count(*) from filtrada),
    'contas', coalesce((select jsonb_agg({schema}.w27_conta_linha(pg.id) order by {schema}.w27_peso(pg.sit), pg.vence_em, lower(pg.nome), pg.id)
                          from pagina pg), '[]'::jsonb),
    -- o cartão "Faturas recentes" continua com as 40 mais novas (a tela mostra 10 — P6); o chip passa a ser o total do banco
    'faturas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'conta_id', f.conta_id, 'conta_nome', c.nome, 'tipo', f.tipo, 'valor', f.valor, 'status', f.status, 'forma', f.forma,
        'cobre_de', f.cobre_de, 'cobre_ate', f.cobre_ate, 'pago_em', f.pago_em, 'criado_em', f.criado_em, 'descricao', f.descricao,
        'registrado_por', case when f.registrado_por is null then null else {schema}.w27_nome(f.registrado_por) end) order by f.criado_em desc)
      from (select * from {schema}.conta_faturas order by criado_em desc limit 40) f join {schema}.contas c on c.id = f.conta_id), '[]'::jsonb),
    'faturas_total', (select count(*) from {schema}.conta_faturas f join {schema}.contas c on c.id = f.conta_id))
    into v_r;
  return v_r;
end;
$$;

-- ============================================================================================================
-- 3. Integrações
-- ============================================================================================================
drop function if exists {schema}.master_integracoes();

create or replace function {schema}.master_integracoes(p_offset integer default null, p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  -- hml-14d (B21): a página
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_offset is null and p_limite is null then
    -- a chamada de hoje (sem página): o texto da W27, igual
    return jsonb_build_object('ok', true, 'contas', coalesce((
      select jsonb_agg({schema}.w27_conta_linha(c.id) order by c.origem = 'app' desc, lower(c.nome)) from {schema}.contas c), '[]'::jsonb),
      'resumo', jsonb_build_object(
        'pix_manual', (select count(*) from {schema}.contas c where c.recebimento_modo = 'pix_manual'),
        'mercadopago', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago'),
        'nenhum', (select count(*) from {schema}.contas c where c.recebimento_modo = 'nenhum'),
        'com_chave', (select count(distinct k.conta_id) from {schema}.recebimento_chaves k where k.ativa)));
  end if;
  return jsonb_build_object('ok', true,
    'total', (select count(*) from {schema}.contas c),
    'contas', coalesce((
      select jsonb_agg({schema}.w27_conta_linha(pg.id) order by pg.eh_app desc, pg.chave, pg.id)
        from (select c.id, c.origem = 'app' as eh_app, lower(c.nome) as chave from {schema}.contas c
               order by c.origem = 'app' desc, lower(c.nome), c.id
              offset v_off limit v_lim) pg), '[]'::jsonb),
    'resumo', jsonb_build_object(
      'pix_manual', (select count(*) from {schema}.contas c where c.recebimento_modo = 'pix_manual'),
      'mercadopago', (select count(*) from {schema}.contas c where c.recebimento_modo = 'mercadopago'),
      'nenhum', (select count(*) from {schema}.contas c where c.recebimento_modo = 'nenhum'),
      'com_chave', (select count(distinct k.conta_id) from {schema}.recebimento_chaves k where k.ativa)));
end;
$$;

-- ============================================================================================================
-- 4. App do aluno (os alunos sem profissional — W7b)
-- ============================================================================================================
drop function if exists {schema}.master_alunos_do_app();

create or replace function {schema}.master_alunos_do_app(p_offset integer default null, p_limite integer default null,
  p_busca text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  -- hml-14d (B21): a página e a busca (nome, apelido, e-mail, tags e os dígitos de CPF/telefone — a coluna busca — e o e-mail do
  -- login, o que a tela mostra), sem acento, literal
  v_app uuid;
  v_q text := {schema}.texto_busca(btrim(regexp_replace(coalesce(p_busca, ''), '\s+', ' ', 'g')));
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_r jsonb;
begin
  if not {schema}.sou_master() then
    return jsonb_build_object('ok', false, 'erro', 'so_master');
  end if;
  if p_offset is null and p_limite is null and p_busca is null then
    -- a chamada de hoje (sem página): o texto da W7b, igual
    return jsonb_build_object('ok', true, 'conta_id', {schema}.conta_do_app(), 'alunos', coalesce((
      select jsonb_agg(jsonb_build_object(
          'paciente_id', p.id, 'user_id', p.user_id, 'nome', p.nome, 'email', lower(coalesce(u.email, p.email)), 'ativo', p.ativo,
          'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor, 'objetivo', p.objetivo_app,
          'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate, 'pausada', p.cobranca_pausada,
          'assinatura', (select s.status from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1),
          'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo, 'criado_em', p.created_at)
        order by p.ativo desc, p.created_at desc)
        from {schema}.pacientes p
        left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
        left join auth.users u on u.id = p.user_id
       where p.conta_id = {schema}.conta_do_app() and p.deleted_at is null), '[]'::jsonb));
  end if;

  v_app := {schema}.conta_do_app();
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  with base as (
    select p.id, p.ativo, p.created_at
      from {schema}.pacientes p
      left join auth.users u on u.id = p.user_id
     where p.conta_id = v_app and p.deleted_at is null
       and (v_q = ''
            or coalesce(p.busca, '') like '%' || v_q || '%'
            or (length(v_dig) >= 3 and coalesce(p.busca, '') like '%' || v_dig || '%')
            or {schema}.texto_busca(u.email) like '%' || v_q || '%')
  ), pagina as (
    select b.id from base b
     order by b.ativo desc, b.created_at desc, b.id
    offset v_off limit v_lim
  )
  select jsonb_build_object('ok', true, 'conta_id', v_app, 'total', (select count(*) from base), 'alunos', coalesce((
    select jsonb_agg(jsonb_build_object(
        'paciente_id', p.id, 'user_id', p.user_id, 'nome', p.nome, 'email', lower(coalesce(u.email, p.email)), 'ativo', p.ativo,
        'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor, 'objetivo', p.objetivo_app,
        'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate, 'pausada', p.cobranca_pausada,
        'assinatura', (select s.status from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1),
        'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo, 'criado_em', p.created_at)
      order by p.ativo desc, p.created_at desc, p.id)
      from pagina pg
      join {schema}.pacientes p on p.id = pg.id
      left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
      left join auth.users u on u.id = p.user_id), '[]'::jsonb))
    into v_r;
  return v_r;
end;
$$;

-- ============================================================================================================
-- 5. Alunos › Sem conta (C8: login sem matrícula nem conta)
-- ============================================================================================================
drop function if exists {schema}.master_sem_conta(text);

create or replace function {schema}.master_sem_conta(p_busca text default null, p_offset integer default null,
  p_limite integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_busca text := lower(btrim(coalesce(p_busca, '')));
  -- hml-14d (B21): a página e a busca sem acento, literal (o e-mail e o nome do perfil, como hoje)
  v_q text;
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_r jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  if p_offset is null and p_limite is null then
    -- a chamada de hoje (sem página): o texto da W27, igual
    return jsonb_build_object('ok', true, 'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.id, 'nome', {schema}.w27_nome(u.id), 'email', lower(u.email), 'papel', pr.role,
                                          'criado_em', u.created_at, 'ultimo_acesso', u.last_sign_in_at) order by u.created_at desc)
        from auth.users u join {schema}.profiles pr on pr.id = u.id
       where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
         and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
         and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido')
         and (v_busca = '' or lower(u.email) like '%' || v_busca || '%' or lower(coalesce(pr.nome, '')) like '%' || v_busca || '%')), '[]'::jsonb));
  end if;

  v_q := {schema}.texto_busca(btrim(regexp_replace(coalesce(p_busca, ''), '\s+', ' ', 'g')));
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  with base as (
    select u.id, u.created_at
      from auth.users u join {schema}.profiles pr on pr.id = u.id
     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido')
       and (v_q = '' or {schema}.texto_busca(u.email) like '%' || v_q || '%' or {schema}.texto_busca(pr.nome) like '%' || v_q || '%')
  ), pagina as (
    select b.id from base b
     order by b.created_at desc, b.id
    offset v_off limit v_lim
  )
  select jsonb_build_object('ok', true, 'total', (select count(*) from base), 'pessoas', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nome', {schema}.w27_nome(u.id), 'email', lower(u.email), 'papel', pr.role,
                                        'criado_em', u.created_at, 'ultimo_acesso', u.last_sign_in_at) order by u.created_at desc, u.id)
      from pagina pg join auth.users u on u.id = pg.id join {schema}.profiles pr on pr.id = u.id), '[]'::jsonb))
    into v_r;
  return v_r;
end;
$$;

-- ============================================================================================================
-- 6. Alunos (mesma assinatura): a busca pela coluna busca (+ os dígitos de CPF/telefone), literal, e o desempate pelo id
-- ============================================================================================================
create or replace function {schema}.master_alunos(p_filtros jsonb default '{}'::jsonb, p_offset integer default 0, p_limite integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  -- hml-14d (B19): o termo sem acento e sem caixa (o mesmo texto_busca da coluna busca) e os DÍGITOS dele — a coluna busca guarda
  -- nome, apelido, e-mail, tags e os dígitos do CPF e do telefone (hml-14b); o molde da alunos_da_conta
  v_busca text := {schema}.texto_busca(btrim(regexp_replace(coalesce(v_f ->> 'busca', ''), '\s+', ' ', 'g')));
  v_dig text := regexp_replace(coalesce(v_f ->> 'busca', ''), '\D', '', 'g');
  v_conta uuid := nullif(v_f ->> 'conta_id', '')::uuid;
  v_modo text := coalesce(nullif(v_f ->> 'modo', ''), 'ativos');
  v_app uuid := {schema}.conta_do_app();
  v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_lista jsonb;
begin
  if not {schema}.sou_master() then return jsonb_build_object('ok', false, 'erro', 'so_master'); end if;
  -- busca literal (sem curinga do LIKE vindo da tela)
  v_busca := replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_');
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or coalesce(p.busca, '') like '%' || v_busca || '%'
            or (length(v_dig) >= 3 and coalesce(p.busca, '') like '%' || v_dig || '%'))
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
  )
  select count(*) into v_total from filtrada;
  with dupla as (
    select p.user_id from {schema}.pacientes p
     where p.user_id is not null and p.ativo and p.deleted_at is null and p.conta_id is not null and p.conta_id is distinct from v_app
     group by p.user_id having count(distinct p.conta_id) > 1
  ), base as (
    select p.*, c.nome as conta_nome, c.origem as conta_origem, c.plano as conta_plano, c.alunos_bloqueados_em as conta_bloq,
           (p.user_id is not null and p.user_id in (select d.user_id from dupla d)) as p7
      from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
     where p.deleted_at is null
       and (v_conta is null or p.conta_id = v_conta)
       and (v_busca = '' or coalesce(p.busca, '') like '%' || v_busca || '%'
            or (length(v_dig) >= 3 and coalesce(p.busca, '') like '%' || v_dig || '%'))
  ), filtrada as (
    select * from base b
     where case v_modo
             when 'ativos' then b.ativo and b.acesso_bloqueado_em is null and b.conta_id is distinct from v_app
             when 'app' then b.conta_id = v_app
             when 'bloqueados' then b.acesso_bloqueado_em is not null or b.conta_bloq is not null
             when 'inativos' then not b.ativo
             when 'sem_responsavel' then b.ativo and b.personal_id is null and b.nutricionista_id is null and b.conta_id is distinct from v_app
             when 'p7' then b.p7 and b.ativo
             else true end
     order by case when v_modo = 'p7' then coalesce(b.user_id::text, '') else '' end, lower(coalesce(b.nome, '')), b.created_at, b.id
     offset v_off limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', b.id, 'nome', b.nome, 'email', coalesce(lower((select u.email from auth.users u where u.id = b.user_id)), lower(b.email)),
      'user_id', b.user_id, 'tem_login', b.user_id is not null, 'ativo', b.ativo, 'criado_em', b.created_at,
      'conta', case when b.conta_id is null then null else jsonb_build_object('id', b.conta_id, 'nome', b.conta_nome, 'origem', b.conta_origem,
                                                                               'eh_app', b.conta_id = v_app) end,
      'personal', case when b.personal_id is null then null else jsonb_build_object('id', b.personal_id, 'nome', {schema}.w27_nome(b.personal_id)) end,
      'nutricionista', case when b.nutricionista_id is null then null else jsonb_build_object('id', b.nutricionista_id, 'nome', {schema}.w27_nome(b.nutricionista_id)) end,
      'modulos', to_jsonb({schema}.w13_modulos_do_aluno(b.personal_id, b.nutricionista_id, b.conta_plano)),
      'bloqueado', b.acesso_bloqueado_em is not null, 'conta_bloqueada', b.conta_bloq is not null, 'p7', b.p7,
      'app', case when b.conta_id = v_app then jsonb_build_object('plano', (select pa.nome from {schema}.planos_aluno pa where pa.id = b.plano_aluno_id),
                                                                   'valor', b.mensalidade_valor, 'teste_ate', b.app_teste_ate, 'pago_ate', b.mensalidade_pago_ate,
                                                                   'encerrada_em', b.app_encerrada_em, 'objetivo', b.objetivo_app) end)
      order by case when v_modo = 'p7' then coalesce(b.user_id::text, '') else '' end, lower(coalesce(b.nome, '')), b.created_at, b.id), '[]'::jsonb)
    into v_lista from filtrada b;
  return jsonb_build_object('ok', true, 'modo', v_modo, 'total', v_total, 'offset', v_off, 'limite', v_lim, 'alunos', v_lista,
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
                                                            'modulos', to_jsonb({schema}.modulos_do_plano(c.plano))) order by c.origem = 'app', lower(c.nome))
                          from {schema}.contas c), '[]'::jsonb),
    'contagens', jsonb_build_object(
      'ativos', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.acesso_bloqueado_em is null and p.conta_id is distinct from v_app),
      'app', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.conta_id = v_app),
      'p7', (select count(*) from {schema}.pacientes p where p.deleted_at is null and p.ativo and p.user_id in (
                select q.user_id from {schema}.pacientes q where q.user_id is not null and q.ativo and q.deleted_at is null and q.conta_id is not null
                   and q.conta_id is distinct from v_app group by q.user_id having count(distinct q.conta_id) > 1)),
      'sem_conta', (select count(*) from auth.users u join {schema}.profiles pr on pr.id = u.id
                     where coalesce(pr.role, '') <> 'master' and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('master', 'admin')
                       and not exists (select 1 from {schema}.pacientes p where p.user_id = u.id and p.deleted_at is null)
                       and not exists (select 1 from {schema}.conta_membros m where m.user_id = u.id and m.status <> 'removido'))));
end;
$$;

-- ============================================================================================================
-- 7. Execução: só quem tem login (as funções conferem o master) e o servidor — os default privileges dão EXECUTE ao anon
--    em toda função nova
-- ============================================================================================================
revoke all on function {schema}.master_contas(jsonb, integer, integer), {schema}.master_financeiro(text, integer, integer),
  {schema}.master_integracoes(integer, integer), {schema}.master_alunos_do_app(integer, integer, text),
  {schema}.master_sem_conta(text, integer, integer), {schema}.master_alunos(jsonb, integer, integer)
  from public, anon;
grant execute on function {schema}.master_contas(jsonb, integer, integer), {schema}.master_financeiro(text, integer, integer),
  {schema}.master_integracoes(integer, integer), {schema}.master_alunos_do_app(integer, integer, text),
  {schema}.master_sem_conta(text, integer, integer), {schema}.master_alunos(jsonb, integer, integer)
  to authenticated, service_role;

-- ============================================================================================================
-- 8. Conferência (desfaz tudo se algo sair diferente): 1 função por nome, DEFINER com search_path, só o logado e o servidor;
--    sem login = a recusa de sempre; como master (só nesta transação): a chamada de hoje continua com as chaves de hoje e a página
--    traz a MESMA lista (o mesmo conjunto, na mesma ordem de hoje) com o total — nos dados de verdade deste schema
-- ============================================================================================================
do $$
declare
  v_nome text;
  v_assinatura text;
  v_velha jsonb;
  v_nova jsonb;
  v_n integer;
begin
  foreach v_nome in array array['master_contas', 'master_financeiro', 'master_integracoes', 'master_alunos_do_app', 'master_sem_conta', 'master_alunos'] loop
    if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = '{schema}' and p.proname = v_nome) <> 1 then
      raise exception 'hml-14d: tem de sobrar UMA % em {schema}', v_nome;
    end if;
  end loop;
  foreach v_assinatura in array array['{schema}.master_contas(jsonb, integer, integer)', '{schema}.master_financeiro(text, integer, integer)',
    '{schema}.master_integracoes(integer, integer)', '{schema}.master_alunos_do_app(integer, integer, text)',
    '{schema}.master_sem_conta(text, integer, integer)', '{schema}.master_alunos(jsonb, integer, integer)'] loop
    if not (select p.prosecdef and p.proconfig is not null from pg_catalog.pg_proc p where p.oid = v_assinatura::regprocedure) then
      raise exception 'hml-14d: % sem SECURITY DEFINER ou sem search_path', v_assinatura;
    end if;
    if has_function_privilege('anon', v_assinatura, 'EXECUTE') or not has_function_privilege('authenticated', v_assinatura, 'EXECUTE') then
      raise exception 'hml-14d: % fora do esperado (só o logado e o servidor)', v_assinatura;
    end if;
  end loop;

  -- sem login: a recusa de sempre, nas chamadas com os argumentos de hoje (a mesma resolução que o PostgREST faz)
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  if {schema}.master_contas('{}'::jsonb) is distinct from jsonb_build_object('ok', false, 'erro', 'so_master')
     or {schema}.master_financeiro('todas') is distinct from jsonb_build_object('ok', false, 'erro', 'so_master')
     or {schema}.master_integracoes() is distinct from jsonb_build_object('ok', false, 'erro', 'so_master')
     or {schema}.master_alunos_do_app() is distinct from jsonb_build_object('ok', false, 'erro', 'so_master')
     or {schema}.master_sem_conta(null::text) is distinct from jsonb_build_object('ok', false, 'erro', 'so_master') then
    raise exception 'hml-14d: alguma lista do master respondeu sem login';
  end if;

  -- como master (o claim do JWT, só nesta transação)
  perform set_config('request.jwt.claims', '{"app_metadata":{"role":"master"}}', true);
  v_velha := {schema}.master_contas('{}'::jsonb);
  v_nova := {schema}.master_contas('{}'::jsonb, 0, 100);
  v_n := least(jsonb_array_length(v_velha -> 'contas'), 100);
  if v_velha ? 'total' or not (v_nova ? 'total') or (v_nova ->> 'total')::integer <> jsonb_array_length(v_velha -> 'contas')
     or v_nova -> 'resumo' is distinct from v_velha -> 'resumo'
     or (jsonb_array_length(v_velha -> 'contas') <= 100
         and (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(v_nova -> 'contas') e)
             is distinct from (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(v_velha -> 'contas') e))
     or (select array_agg((e ->> 'situacao_efetiva') || '|' || lower(e ->> 'nome') order by i) from jsonb_array_elements(v_nova -> 'contas') with ordinality t(e, i))
        is distinct from (select array_agg((e ->> 'situacao_efetiva') || '|' || lower(e ->> 'nome') order by i) from jsonb_array_elements(v_velha -> 'contas') with ordinality t(e, i) where i <= v_n) then
    raise exception 'hml-14d: master_contas com página difere da de hoje (total %, de hoje %)', v_nova ->> 'total', jsonb_array_length(v_velha -> 'contas');
  end if;
  v_velha := {schema}.master_financeiro('todas');
  v_nova := {schema}.master_financeiro('todas', 0, 100);
  v_n := least(jsonb_array_length(v_velha -> 'contas'), 100);
  if v_velha ? 'faturas_total' or not (v_nova ? 'faturas_total') or (v_nova ->> 'total')::integer <> jsonb_array_length(v_velha -> 'contas')
     or v_nova -> 'resumo' is distinct from v_velha -> 'resumo' or v_nova -> 'faturas' is distinct from v_velha -> 'faturas'
     or (jsonb_array_length(v_velha -> 'contas') <= 100
         and (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(v_nova -> 'contas') e)
             is distinct from (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(v_velha -> 'contas') e))
     or (select array_agg((e ->> 'situacao_efetiva') || '|' || coalesce(e ->> 'vence_em', '-') || '|' || lower(e ->> 'nome') order by i) from jsonb_array_elements(v_nova -> 'contas') with ordinality t(e, i))
        is distinct from (select array_agg((e ->> 'situacao_efetiva') || '|' || coalesce(e ->> 'vence_em', '-') || '|' || lower(e ->> 'nome') order by i) from jsonb_array_elements(v_velha -> 'contas') with ordinality t(e, i) where i <= v_n) then
    raise exception 'hml-14d: master_financeiro com página difere da de hoje';
  end if;
  v_velha := {schema}.master_integracoes();
  v_nova := {schema}.master_integracoes(0, 100);
  v_n := least(jsonb_array_length(v_velha -> 'contas'), 100);
  if v_velha ? 'total' or (v_nova ->> 'total')::integer <> jsonb_array_length(v_velha -> 'contas') or v_nova -> 'resumo' is distinct from v_velha -> 'resumo'
     or (select array_agg((e ->> 'eh_app') || '|' || lower(e ->> 'nome') order by i) from jsonb_array_elements(v_nova -> 'contas') with ordinality t(e, i))
        is distinct from (select array_agg((e ->> 'eh_app') || '|' || lower(e ->> 'nome') order by i) from jsonb_array_elements(v_velha -> 'contas') with ordinality t(e, i) where i <= v_n) then
    raise exception 'hml-14d: master_integracoes com página difere da de hoje';
  end if;
  v_velha := {schema}.master_alunos_do_app();
  v_nova := {schema}.master_alunos_do_app(0, 100);
  v_n := least(jsonb_array_length(v_velha -> 'alunos'), 100);
  if v_velha ? 'total' or (v_nova ->> 'total')::integer <> jsonb_array_length(v_velha -> 'alunos') or v_nova -> 'conta_id' is distinct from v_velha -> 'conta_id'
     or (select array_agg((e ->> 'ativo') || '|' || (e ->> 'criado_em') order by i) from jsonb_array_elements(v_nova -> 'alunos') with ordinality t(e, i))
        is distinct from (select array_agg((e ->> 'ativo') || '|' || (e ->> 'criado_em') order by i) from jsonb_array_elements(v_velha -> 'alunos') with ordinality t(e, i) where i <= v_n) then
    raise exception 'hml-14d: master_alunos_do_app com página difere da de hoje';
  end if;
  v_velha := {schema}.master_sem_conta(null::text);
  v_nova := {schema}.master_sem_conta(null::text, 0, 100);
  v_n := least(jsonb_array_length(v_velha -> 'pessoas'), 100);
  if v_velha ? 'total' or (v_nova ->> 'total')::integer <> jsonb_array_length(v_velha -> 'pessoas')
     or (select array_agg(e ->> 'criado_em' order by i) from jsonb_array_elements(v_nova -> 'pessoas') with ordinality t(e, i))
        is distinct from (select array_agg(e ->> 'criado_em' order by i) from jsonb_array_elements(v_velha -> 'pessoas') with ordinality t(e, i) where i <= v_n) then
    raise exception 'hml-14d: master_sem_conta com página difere da de hoje';
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$$;

notify pgrst, 'reload schema';
