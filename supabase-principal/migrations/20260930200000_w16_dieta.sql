-- Physiq W16 — Perfil do aluno › Dieta + "Editar treino e dieta" (banco principal, staging e public). Idempotente; NENHUM dado
-- muda: só políticas de RLS e funções. Spec §11.3 W16, §4.1 (quem vê e edita o quê), §8.1 (RLS da nutrição), NF9, R14.
--
-- Aplicar (backup ANTES, ver scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930200000_w16_dieta.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930200000_w16_dieta.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930200000_w16_dieta.sql --so public
--
-- O que muda (e o que NÃO muda para o site antigo do Nutri, que edita as mesmas tabelas até a W28):
--   1. Nutricionista REMOVIDA da equipe (W5) deixa de ler a dieta que ela criou: as políticas antigas do Nutri ("ler os
--      proprios": nutricionista_id = auth.uid()) continuam, mas agora somam com uma RESTRITIVA — lê quem ainda vê o aluno
--      (pode_ver_aluno: dono, personal e nutricionista responsáveis, a nutri do paciente sem conta), o próprio aluno e o master.
--      Quem continua na equipe não perde nada (a nutri responsável sempre passa no pode_ver_aluno). O prontuário fica na W18.
--   2. O DONO da conta vê a dieta toda do aluno (spec 4.1 "Dieta: dono vê"): metas, orientações, suplementos, manipulados,
--      cálculos e registros do acompanhamento ganham "ver pela conta (nutrição)" — o personal continua vendo só o plano e os ✓.
--   3. Quem pode editar a nutrição do aluno (a nutricionista responsável e o dono com papel de nutricionista — as restritivas da W3
--      continuam) escreve também no que outra nutri da conta criou (antes só o autor do registro escrevia).
--   4. aluno_avisar_plano: o "Salvar e enviar ao aluno" da tela 8 cria o aviso "plano atualizado" no sino do aluno (NF9).
--      Nenhuma mensagem de WhatsApp nem e-mail.
--   5. aluno_treino (W15) passa a devolver também a conta da matrícula (a função treino-leitura do Treino confere).

-- ============================================================================================================
-- Quem vê a NUTRIÇÃO do aluno (sem o personal): master, a nutri do paciente sem conta, o dono da conta e a nutricionista
-- responsável (spec 4.1). É a leitura "pela conta" das tabelas da dieta que não são o plano.
-- ============================================================================================================
create or replace function {schema}.pode_ver_nutricao_aluno(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.pacientes p
     where p.id = p_paciente and (
           (p.conta_id is null and p.nutricionista_id = auth.uid())
        or (p.conta_id is not null and (
                {schema}.sou_dono(p.conta_id)
             or (p.nutricionista_id = auth.uid() and {schema}.tenho_papel(p.conta_id, 'nutricionista'))))));
$$;
revoke execute on function {schema}.pode_ver_nutricao_aluno(uuid) from public, anon;
grant execute on function {schema}.pode_ver_nutricao_aluno(uuid) to authenticated, service_role;

-- a matrícula é do próprio login (o aluno lê a própria dieta — o site antigo lê direto das tabelas; o app novo, pela minha_dieta)
create or replace function {schema}.paciente_do_meu_login(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from {schema}.pacientes p where p.id = p_paciente and p.user_id = auth.uid());
$$;
revoke execute on function {schema}.paciente_do_meu_login(uuid) from public, anon;
grant execute on function {schema}.paciente_do_meu_login(uuid) to authenticated, service_role;

-- ============================================================================================================
-- 1 + 2 + 3. Políticas das tabelas da dieta
-- ============================================================================================================
do $w16$
declare
  t text;
  do_aluno text[] := array['planos_alimentares', 'metas', 'orientacoes', 'indicacoes_produto', 'formulas_manipuladas',
                           'calculos_energeticos', 'registros_diarios', 'refeicoes_concluidas'];
  -- as que o dono passa a ver pela conta (o plano e os ✓ já tinham "ver pela conta" desde a W2, com o personal junto)
  ver_conta text[] := array['metas', 'orientacoes', 'indicacoes_produto', 'formulas_manipuladas', 'calculos_energeticos', 'registros_diarios'];
  -- as que a nutri responsável e o dono-nutri escrevem mesmo quando outra pessoa da conta criou (os ✓ são só do aluno)
  editar_conta text[] := array['planos_alimentares', 'metas', 'orientacoes', 'indicacoes_produto', 'formulas_manipuladas',
                               'calculos_energeticos', 'registros_diarios'];
  leitura text := '({schema}.eh_master() or {schema}.pode_ver_aluno(paciente_id) or {schema}.paciente_do_meu_login(paciente_id))';
  edicao text := '{schema}.pode_editar_aluno(paciente_id, ''nutricao'')';
begin
  foreach t in array do_aluno || array['refeicoes', 'itens_refeicao'] loop
    if to_regclass(format('{schema}.%I', t)) is null then
      raise exception 'W16: tabela {schema}.% não existe', t;
    end if;
  end loop;

  foreach t in array do_aluno loop
    execute format('drop policy if exists %I on {schema}.%I', t || ': W16 leitura so quem ve o aluno', t);
    execute format('create policy %I on {schema}.%I as restrictive for select to authenticated using %s',
                   t || ': W16 leitura so quem ve o aluno', t, leitura);
  end loop;

  foreach t in array ver_conta loop
    execute format('drop policy if exists %I on {schema}.%I', t || ': W16 ver pela conta (nutricao)', t);
    execute format('create policy %I on {schema}.%I for select to authenticated using ({schema}.pode_ver_nutricao_aluno(paciente_id))',
                   t || ': W16 ver pela conta (nutricao)', t);
  end loop;

  foreach t in array editar_conta loop
    execute format('drop policy if exists %I on {schema}.%I', t || ': W16 criar pela conta (nutricao)', t);
    execute format('drop policy if exists %I on {schema}.%I', t || ': W16 editar pela conta (nutricao)', t);
    execute format('drop policy if exists %I on {schema}.%I', t || ': W16 apagar pela conta (nutricao)', t);
    execute format('create policy %I on {schema}.%I for insert to authenticated with check (%s and nutricionista_id = (select auth.uid()))',
                   t || ': W16 criar pela conta (nutricao)', t, edicao);
    execute format('create policy %I on {schema}.%I for update to authenticated using (%s) with check (%s)',
                   t || ': W16 editar pela conta (nutricao)', t, edicao, edicao);
    execute format('create policy %I on {schema}.%I for delete to authenticated using (%s)',
                   t || ': W16 apagar pela conta (nutricao)', t, edicao);
  end loop;
end;
$w16$;

-- refeições e itens seguem o plano (não têm paciente_id)
drop policy if exists "refeicoes: W16 leitura so quem ve o aluno" on {schema}.refeicoes;
create policy "refeicoes: W16 leitura so quem ve o aluno" on {schema}.refeicoes as restrictive for select to authenticated
  using ({schema}.eh_master() or exists (
    select 1 from {schema}.planos_alimentares p
     where p.id = refeicoes.plano_id and ({schema}.pode_ver_aluno(p.paciente_id) or {schema}.paciente_do_meu_login(p.paciente_id))));
drop policy if exists "itens_refeicao: W16 leitura so quem ve o aluno" on {schema}.itens_refeicao;
create policy "itens_refeicao: W16 leitura so quem ve o aluno" on {schema}.itens_refeicao as restrictive for select to authenticated
  using ({schema}.eh_master() or exists (
    select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
     where r.id = itens_refeicao.refeicao_id and ({schema}.pode_ver_aluno(p.paciente_id) or {schema}.paciente_do_meu_login(p.paciente_id))));

drop policy if exists "refeicoes: W16 editar pela conta (nutricao)" on {schema}.refeicoes;
create policy "refeicoes: W16 editar pela conta (nutricao)" on {schema}.refeicoes for all to authenticated
  using (exists (select 1 from {schema}.planos_alimentares p where p.id = refeicoes.plano_id and {schema}.pode_editar_aluno(p.paciente_id, 'nutricao')))
  with check (exists (select 1 from {schema}.planos_alimentares p where p.id = refeicoes.plano_id and {schema}.pode_editar_aluno(p.paciente_id, 'nutricao')));
drop policy if exists "itens_refeicao: W16 editar pela conta (nutricao)" on {schema}.itens_refeicao;
create policy "itens_refeicao: W16 editar pela conta (nutricao)" on {schema}.itens_refeicao for all to authenticated
  using (exists (select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
                  where r.id = itens_refeicao.refeicao_id and {schema}.pode_editar_aluno(p.paciente_id, 'nutricao')))
  with check (exists (select 1 from {schema}.refeicoes r join {schema}.planos_alimentares p on p.id = r.plano_id
                       where r.id = itens_refeicao.refeicao_id and {schema}.pode_editar_aluno(p.paciente_id, 'nutricao')));

-- ============================================================================================================
-- 4. "Salvar e enviar ao aluno" (tela 8): o aviso "plano atualizado" no sino do aluno (NF9). Só avisa o que quem chama pode
--    mudar (treino: personal responsável ou dono-personal; dieta: nutricionista responsável ou dono-nutri; master os dois).
--    Não repete o mesmo aviso não lido dos últimos 10 minutos. Nada de WhatsApp nem e-mail.
--    Erros (raise): sem_login, sem_acesso, aluno_inexistente (da w14_matricula_da_rota). Retorno: {ok, avisado, sem_login, repetido}
-- ============================================================================================================
create or replace function {schema}.aluno_avisar_plano(p_aluno uuid, p_modulos text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_user uuid;
  v_treino boolean;
  v_dieta boolean;
  v_titulo text;
  v_link text;
begin
  v_treino := 'treino' = any(coalesce(p_modulos, array[]::text[])) and {schema}.pode_editar_aluno(v_id, 'treino');
  v_dieta := 'dieta' = any(coalesce(p_modulos, array[]::text[])) and {schema}.pode_editar_aluno(v_id, 'nutricao');
  if not v_treino and not v_dieta then
    return jsonb_build_object('ok', false, 'erro', 'sem_modulo');
  end if;
  select user_id into v_user from {schema}.pacientes where id = v_id;
  if v_user is null then
    return jsonb_build_object('ok', true, 'avisado', false, 'sem_login', true);
  end if;
  v_titulo := case when v_treino and v_dieta then 'Seu treino e sua dieta foram atualizados'
                   when v_treino then 'Seu treino foi atualizado'
                   else 'Sua dieta foi atualizada' end;
  v_link := case when v_treino and v_dieta then '/' when v_treino then '/treino' else '/dieta' end;
  if exists (select 1 from {schema}.avisos a
              where a.destino_user_id = v_user and a.tipo = 'plano_atualizado' and a.titulo = v_titulo and a.lido_em is null
                and a.criado_em > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true, 'avisado', false, 'repetido', true);
  end if;
  insert into {schema}.avisos (destino_user_id, tipo, titulo, link) values (v_user, 'plano_atualizado', v_titulo, v_link);
  return jsonb_build_object('ok', true, 'avisado', true);
end;
$$;
revoke execute on function {schema}.aluno_avisar_plano(uuid, text[]) from public, anon;
grant execute on function {schema}.aluno_avisar_plano(uuid, text[]) to authenticated, service_role;

-- ============================================================================================================
-- 5. aluno_treino (W15) + a conta da matrícula: a treino-leitura do Treino só devolve o treino do aluno DESTA conta
--    (caso P7: o mesmo login com matrículas em 2 contas)
-- ============================================================================================================
create or replace function {schema}.aluno_treino(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
begin
  select * into v_p from {schema}.pacientes where id = v_id;
  return jsonb_build_object(
    'ok', true,
    'paciente_id', v_p.id,
    'user_id', v_p.user_id,
    'treino_user_id', v_p.treino_user_id,
    'conta_id', v_p.conta_id
  );
end;
$$;
revoke execute on function {schema}.aluno_treino(uuid) from public, anon;
grant execute on function {schema}.aluno_treino(uuid) to authenticated, service_role;
