-- Physiq W25 — Painel › Dashboard (banco principal, staging e public; spec §11.3 W25, §4.4 linha "Dashboard", §5 N-9, NF6, P1, P28).
-- Idempotente; NENHUM dado muda: só 2 funções novas de LEITURA (security definer, com a mesma regra de quem vê da lista de Alunos).
--
-- Aplicar (backup ANTES — definições das funções; nenhuma existe hoje):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001200000_w25_dashboard.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001200000_w25_dashboard.sql --so public
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK). O site antigo do Nutri não usa nada daqui.
--
-- 1. alunos_novos_por_mes(conta, meses) — "Novos alunos por mês" (N-9: o "Novos pacientes por mês" do Dashboard do Nutri vai para a
--    página Alunos) e o "+N este mês" do KPI "Alunos ativos" do Dashboard: as matrículas criadas em cada mês (fuso de São Paulo), fora
--    da lixeira — a regra do Nutri (novosPacientesPorMes) —, com a regra P1 da alunos_da_conta (o dono e o master contam a conta
--    inteira; o membro, só os alunos em que é responsável com o papel). O mês atual é o último.
-- 2. painel_resumo(conta) — o que o Dashboard precisa do principal e que nenhuma tela de hoje devolve, por aluno ATIVO que você vê (o
--    filtro padrão "Ativos" da página Alunos — ativo, fora da lixeira e sem bloqueio — e a mesma P1):
--      · nascimento (aniversariantes), módulos, responsáveis, login e o ajuste "acesso ao app" (W14);
--      · a última antropometria (avaliação vencida pela P28, somada às avaliações do Banco do Treino no app);
--      · DIETA só para quem vê o clínico do aluno (pode_ver_clinico: nutricionista da conta que vê o aluno, ou o master — a regra
--        clínica da W18/W24; personal e dono sem papel de nutri recebem dieta = null): os planos que podem ser o "plano atual"
--        (o favorito mais recente e o mais recente — o app escolhe pela planoAtivo, a mesma regra do app e do Resumo do aluno), as
--        refeições com o nº de alimentos e os dias da semana (NF3), os ✓ dos últimos 8 dias e a data do último ✓.
--    As regras (adesão, "sem marcar a dieta há 3 dias", aniversariantes da semana, avaliação vencida) ficam no app
--    (src/painel/dashboard/regras.ts), testadas — aqui só os dados.

-- ============================================================================================================
-- 1. Novos alunos por mês (página Alunos e o KPI do Dashboard)
-- ============================================================================================================
create or replace function {schema}.alunos_novos_por_mes(p_conta uuid, p_meses integer default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_dono boolean;
  v_personal boolean;
  v_nutri boolean;
  v_n integer := least(greatest(coalesce(p_meses, 6), 1), 24);
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_de date;
  v_meses jsonb;
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
  v_dono := {schema}.sou_dono(p_conta) or v_master;
  v_personal := {schema}.tenho_papel(p_conta, 'personal');
  v_nutri := {schema}.tenho_papel(p_conta, 'nutricionista');
  v_de := (v_mes_atual - make_interval(months => v_n - 1))::date;

  with meses as (
    select (v_de + make_interval(months => g))::date as mes from generate_series(0, v_n - 1) g
  ), novos as (
    select date_trunc('month', (p.created_at at time zone 'America/Sao_Paulo'))::date as mes, count(*)::integer as n
      from {schema}.pacientes p
     where p.conta_id = p_conta and p.deleted_at is null
       and p.created_at >= (v_de::timestamp at time zone 'America/Sao_Paulo')
       and (v_dono or (p.personal_id = v_uid and v_personal) or (p.nutricionista_id = v_uid and v_nutri))
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'novos', coalesce(n.n, 0)) order by m.mes), '[]'::jsonb)
    into v_meses
    from meses m left join novos n on n.mes = m.mes;

  return jsonb_build_object('ok', true, 'meses', v_meses, 'mes_atual', to_char(v_mes_atual, 'YYYY-MM'), 'dono', v_dono);
end;
$$;

-- ============================================================================================================
-- 2. O resumo do principal para o Dashboard
-- ============================================================================================================
create or replace function {schema}.painel_resumo(p_conta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := {schema}.eh_master();
  v_c {schema}.contas%rowtype;
  v_dono boolean;
  v_personal boolean;
  v_nutri boolean;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_alunos jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select * into v_c from {schema}.contas where id = p_conta;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  if not ({schema}.sou_membro(p_conta) or v_master) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  v_dono := {schema}.sou_dono(p_conta) or v_master;
  v_personal := {schema}.tenho_papel(p_conta, 'personal');
  v_nutri := {schema}.tenho_papel(p_conta, 'nutricionista');

  with base as (
    -- o filtro padrão "Ativos" da página Alunos (alunos_da_conta) com a P1
    select p.id, p.user_id, p.treino_user_id, p.nome, p.apelido, p.nascimento, p.created_at, p.personal_id, p.nutricionista_id, p.config,
           {schema}.w13_foto_do_aluno(p.foto_url, p.user_id) as foto,
           {schema}.w13_modulos_do_aluno(p.personal_id, p.nutricionista_id, v_c.plano) as modulos
      from {schema}.pacientes p
     where p.conta_id = p_conta and p.deleted_at is null and p.ativo and p.acesso_bloqueado_em is null
       and (v_dono or (p.personal_id = v_uid and v_personal) or (p.nutricionista_id = v_uid and v_nutri))
  ), comdieta as (
    select b.*, ('nutricao' = any(b.modulos) and {schema}.pode_ver_clinico(b.id)) as le_dieta from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'rota_id', coalesce(b.treino_user_id, b.id),
           'user_id', b.user_id,
           'treino_user_id', b.treino_user_id,
           'nome', b.nome,
           'apelido', b.apelido,
           'foto_url', b.foto,
           'nascimento', b.nascimento,
           'criado_em', b.created_at,
           'modulos', to_jsonb(b.modulos),
           'personal_id', b.personal_id,
           'nutricionista_id', b.nutricionista_id,
           'tem_login', b.user_id is not null,
           'acesso_app', {schema}.w14_ajuste(b.config, 'acesso_app', b.user_id is not null),
           'ultima_antropometria', (select max((a.data at time zone 'America/Sao_Paulo')::date) from {schema}.antropometrias a
                                     where a.paciente_id = b.id and a.deleted_at is null),
           'dieta', case when not b.le_dieta then null else jsonb_build_object(
              'planos', (
                select coalesce(jsonb_agg(jsonb_build_object(
                         'id', pl.id, 'favorito', pl.favorito, 'created_at', pl.created_at,
                         'refeicoes', (select coalesce(jsonb_agg(jsonb_build_object(
                                          'id', r.id, 'nome', r.nome, 'horario', r.horario, 'ordem', r.ordem, 'dias_semana', to_jsonb(r.dias_semana),
                                          'itens', (select count(*) from {schema}.itens_refeicao i where i.refeicao_id = r.id))), '[]'::jsonb)
                                         from {schema}.refeicoes r where r.plano_id = pl.id))), '[]'::jsonb)
                  from (
                    -- os candidatos a plano atual (planoAtivo: o favorito mais recente; sem favorito, o mais recente)
                    (select x.id, x.favorito, x.created_at from {schema}.planos_alimentares x
                      where x.paciente_id = b.id and x.deleted_at is null and x.favorito order by x.created_at desc, x.id limit 1)
                    union
                    (select x.id, x.favorito, x.created_at from {schema}.planos_alimentares x
                      where x.paciente_id = b.id and x.deleted_at is null order by x.created_at desc, x.id limit 1)
                  ) pl),
              'concluidas', (select coalesce(jsonb_agg(jsonb_build_object('refeicao_id', rc.refeicao_id, 'data', rc.data)), '[]'::jsonb)
                               from {schema}.refeicoes_concluidas rc
                              where rc.paciente_id = b.id and rc.data between v_hoje - 7 and v_hoje),
              'ultima_marcacao', (select max(rc.data) from {schema}.refeicoes_concluidas rc where rc.paciente_id = b.id and rc.data <= v_hoje)
           ) end
         ) order by lower(b.nome), b.id), '[]'::jsonb)
    into v_alunos
    from comdieta b;

  return jsonb_build_object(
    'ok', true, 'hoje', v_hoje, 'alunos', v_alunos,
    'conta', jsonb_build_object('id', v_c.id, 'nome', v_c.nome, 'modulos', to_jsonb({schema}.modulos_do_plano(v_c.plano))),
    'eu', jsonb_build_object('id', v_uid, 'dono', v_dono, 'personal', v_personal, 'nutricionista', v_nutri, 'master', v_master));
end;
$$;

revoke execute on function {schema}.alunos_novos_por_mes(uuid, integer), {schema}.painel_resumo(uuid) from public, anon;
grant execute on function {schema}.alunos_novos_por_mes(uuid, integer), {schema}.painel_resumo(uuid) to authenticated, service_role;
