-- Physiq W3 — regras do login único no BANCO PRINCIPAL (Supabase hkxvtsbwctxkrqzkkdoz). Idempotente.
-- Spec "Physiq Unificado - desenho aprovado" §11.3 W3, §4.1/4.2 (contas, papéis, entrada), §7.4 (login único),
-- §8.1 (RLS da nutrição), §8.4 (script 01), §9 (erros), P7/P8/P9/P12/P13/P25/P26.
--
-- ORDEM (W2 → W3): esta migração entra ANTES do scripts/virada/01_identidades_contas.py criar contas e matrículas — as
-- políticas permissivas novas da W2 (pode_ver_aluno, "editar pela conta") passariam a valer para as contas novas, e as
-- restritivas daqui fecham a escrita da nutrição a quem é nutricionista de verdade.
--
-- Aplicar (backup ANTES, ver scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929070000_w03_regras.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929070000_w03_regras.sql --so public
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929070000_w03_regras.sql --compartilhado
--
-- O que muda para o site antigo do Nutri (nutri.physiqcalc.com.br), de propósito:
--   · profiles: o app não muda mais o próprio papel, o teste, o "pago até" nem a isenção (antes qualquer um podia) —
--     "ninguém novo vira nutricionista sozinho" (W3, pronto quando);
--   · a escrita nas ~38 tabelas da nutrição passa a exigir nutricionista (a nutri de hoje, enquanto não tem conta; depois do
--     script 01, a nutricionista de uma conta com o módulo Nutrição) — a nutri e o master continuam iguais;
--   · nada muda na leitura, no paciente nem nas páginas públicas (/f, /d, /c usam funções security definer).

-- ============================================================================================================
-- 1. profiles: papel, teste, "pago até" e isenção só pelo servidor (gatilho, Mercado Pago) e pelo master
-- ============================================================================================================
create or replace function {schema}.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    new.id := old.id;
    new.role := old.role;
    new.teste_ate := old.teste_ate;
    new.pago_ate := old.pago_ate;
    new.isento_assinatura := old.isento_assinatura;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profiles_guard on {schema}.profiles;
create trigger trg_profiles_guard before update on {schema}.profiles for each row execute function {schema}.profiles_guard();

-- ============================================================================================================
-- 2. Quem escreve a nutrição (spec 8.1: "escrita exige ser nutricionista numa conta com Nutrição")
--    · nutricionista ativa de uma conta cujo plano tem Nutrição; ou
--    · a nutricionista de hoje (profiles.role = 'nutricionista') que ainda não é membro de conta nenhuma (a janela entre
--      esta migração e o script 01, e quem o script não achar) — quem já é membro de alguma conta só vale pela conta.
--    O master (JWT) sempre escreve.
-- ============================================================================================================
create or replace function {schema}.escrevo_nutricao() returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master()
      or exists (
           select 1 from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
            where m.user_id = auth.uid() and m.status = 'ativo' and 'nutricionista' = any(m.papeis)
              and 'nutricao' = any({schema}.modulos_do_plano(c.plano)))
      or (exists (select 1 from {schema}.profiles p where p.id = auth.uid() and p.role = 'nutricionista')
          and not exists (select 1 from {schema}.conta_membros m where m.user_id = auth.uid()));
$$;
revoke execute on function {schema}.escrevo_nutricao() from public, anon;
grant execute on function {schema}.escrevo_nutricao() to authenticated, service_role;

-- ============================================================================================================
-- 3. Políticas RESTRITIVAS da nutrição (somam com as permissivas de hoje: as duas precisam passar).
--    Tabela do aluno (paciente_id): escreve quem é nutricionista E pode editar a nutrição daquele aluno (a responsável ou
--    o dono com papel de nutricionista; no site antigo, a dona do paciente sem conta). Biblioteca (alimentos, receitas,
--    modelos…): escreve quem é nutricionista. O paciente escreve só pelas funções (paciente_marcar_refeicao, diário),
--    que não passam por RLS.
-- ============================================================================================================
do $restritivas$
declare
  t text;
  do_aluno text[] := array['analises_farmaco', 'anamneses', 'antropometrias', 'avaliacoes_integradas', 'calculos_energeticos',
    'consultas', 'diario_alimentar', 'documentos', 'formulas_manipuladas', 'fotos_evolucao', 'gestacoes', 'indicacoes_produto',
    'medicamentos_paciente', 'metas', 'orientacoes', 'pedidos_exame', 'planos_alimentares', 'refeicoes_concluidas',
    'registros_diarios', 'registros_gestacionais', 'respostas_questionario', 'resultados_exame'];
  biblioteca text[] := array['alimentos', 'exames_catalogo', 'grupos_receita', 'ingredientes_receita',
    'interacoes_farmaco_nutriente', 'itens_refeicao', 'medidas_caseiras', 'modelos_anamnese', 'modelos_documento',
    'modelos_formula', 'modelos_meta', 'modelos_orientacao', 'produtos', 'questionarios', 'receitas', 'refeicoes'];
  regra text;
begin
  foreach t in array do_aluno || biblioteca loop
    if to_regclass(format('{schema}.%I', t)) is null then
      raise exception 'W3: tabela {schema}.% não existe (a lista da nutrição mudou?)', t;
    end if;
    regra := case when t = any(do_aluno)
      then '({schema}.eh_master() or ({schema}.escrevo_nutricao() and {schema}.pode_editar_aluno(paciente_id, ''nutricao'')))'
      else '({schema}.eh_master() or {schema}.escrevo_nutricao())' end;
    execute format('drop policy if exists %I on {schema}.%I', t || ': W3 escrita so nutricionista (insert)', t);
    execute format('drop policy if exists %I on {schema}.%I', t || ': W3 escrita so nutricionista (update)', t);
    execute format('drop policy if exists %I on {schema}.%I', t || ': W3 escrita so nutricionista (delete)', t);
    execute format('create policy %I on {schema}.%I as restrictive for insert to authenticated with check %s',
                   t || ': W3 escrita so nutricionista (insert)', t, regra);
    execute format('create policy %I on {schema}.%I as restrictive for update to authenticated using %s with check %s',
                   t || ': W3 escrita so nutricionista (update)', t, regra, regra);
    execute format('create policy %I on {schema}.%I as restrictive for delete to authenticated using %s',
                   t || ': W3 escrita so nutricionista (delete)', t, regra);
  end loop;
end;
$restritivas$;

-- pacientes (matrícula): ninguém se põe como "nutricionista responsável" sem ser nutricionista (o site antigo cria
-- paciente com nutricionista_id = quem cria; um 'pessoa' ou um personal não viram nutri por esse caminho)
drop policy if exists "pacientes: W3 nutricionista responsavel so nutricionista (insert)" on {schema}.pacientes;
create policy "pacientes: W3 nutricionista responsavel so nutricionista (insert)" on {schema}.pacientes
  as restrictive for insert to authenticated
  with check ({schema}.eh_master() or nutricionista_id is distinct from (select auth.uid()) or {schema}.escrevo_nutricao());
drop policy if exists "pacientes: W3 nutricionista responsavel so nutricionista (update)" on {schema}.pacientes;
create policy "pacientes: W3 nutricionista responsavel so nutricionista (update)" on {schema}.pacientes
  as restrictive for update to authenticated
  using (true)
  with check ({schema}.eh_master() or nutricionista_id is distinct from (select auth.uid()) or {schema}.escrevo_nutricao());

-- paciente criado pelo site antigo do Nutri depois do script 01 entra na conta 'legado_nutri' da nutricionista (o site antigo
-- não conhece conta) — assim a matrícula nasce no lugar certo e o painel novo acha o aluno
create or replace function {schema}.pacientes_conta_da_nutri() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conta_id is null and new.nutricionista_id is not null then
    select c.id into new.conta_id
      from {schema}.contas c join {schema}.conta_membros m on m.conta_id = c.id
     where m.user_id = new.nutricionista_id and m.status = 'ativo' and 'nutricionista' = any(m.papeis) and c.origem = 'legado_nutri'
     order by c.criado_em limit 1;
    if new.conta_id is not null then
      new.origem := coalesce(new.origem, 'nutri');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pacientes_conta_da_nutri on {schema}.pacientes;
create trigger trg_pacientes_conta_da_nutri before insert on {schema}.pacientes
  for each row execute function {schema}.pacientes_conta_da_nutri();

-- ============================================================================================================
-- 4. Situação da pessoa (spec 7.4, passo 2): contas, papéis, módulos, matrículas, bloqueios, se precisa do Treino, o
--    legado do Nutri (trava de assinatura de hoje) e o aviso "o Physiq mudou". O app guarda no aparelho (abre sem internet).
-- ============================================================================================================
create or replace function {schema}.minha_situacao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_app jsonb;
  v_meta jsonb;
  v_perfil record;
  v_master boolean;
  v_calc boolean;
  v_contas jsonb;
  v_matriculas jsonb;
  v_modulos text[];
  v_precisa_treino boolean;
  v_nutri boolean;
  v_legado_nutri jsonb;
  v_aviso_cfg jsonb;
  v_publico text;
  v_aviso jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  select u.email, coalesce(u.raw_app_meta_data, '{}'::jsonb), coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_app, v_meta from auth.users u where u.id = v_uid;
  select p.nome, p.role, p.teste_ate, p.pago_ate, p.isento_assinatura, coalesce(p.config, '{}'::jsonb) as config
    into v_perfil from {schema}.profiles p where p.id = v_uid;
  v_master := coalesce(v_app ->> 'role', '') = 'master' or coalesce(v_perfil.role, '') = 'master';
  -- veio do Calc: marcado pelo script 01 (app_metadata.calc / origem = 'calc')
  v_calc := coalesce(v_app ->> 'calc', '') = 'true' or coalesce(v_app ->> 'origem', '') = 'calc';

  -- contas em que é membro ativo (as com Treino primeiro: o painel de hoje é o do Calc), com papéis e números do menu
  select coalesce(jsonb_agg(x.j order by x.tem_treino desc, x.dono desc, x.nome), '[]'::jsonb) into v_contas from (
    select c.nome, ('treino' = any({schema}.modulos_do_plano(c.plano))) as tem_treino, ('dono' = any(m.papeis)) as dono,
      jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'origem', c.origem, 'plano', c.plano,
        'modulos', to_jsonb({schema}.modulos_do_plano(c.plano)), 'faixa', c.faixa, 'periodicidade', c.periodicidade,
        'situacao', c.situacao, 'teste_ate', c.teste_ate, 'vence_em', c.vence_em, 'tolerancia_dias', c.tolerancia_dias,
        'cobranca_legada', c.cobranca_legada, 'isenta_motivo', c.isenta_motivo,
        'alunos_bloqueados_em', c.alunos_bloqueados_em, 'alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'dono_id', c.dono_id,
        'dono_nome', (select coalesce(nullif(btrim(pd.nome), ''), pd.email) from {schema}.profiles pd where pd.id = c.dono_id),
        'membro_id', m.id, 'papeis', to_jsonb(m.papeis), 'codigo_convite', m.codigo_convite,
        'profissionais', (select count(*) from {schema}.conta_membros x where x.conta_id = c.id and x.status = 'ativo'),
        'alunos_ativos', {schema}.conta_alunos_ativos(c.id),
        'limite_alunos', {schema}.conta_limite_alunos(c.id)) as j
      from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo') x;

  -- matrículas (aluno): os módulos são os responsáveis que ele tem numa conta com aquele módulo (spec 4.1); no site
  -- antigo (sem conta) a nutricionista responsável vale como Nutrição
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) into v_matriculas
  from (
    select p.created_at as criado,
      jsonb_build_object(
        'id', p.id, 'conta_id', p.conta_id, 'conta_nome', c.nome, 'conta_origem', c.origem, 'ativo', p.ativo,
        'origem', p.origem, 'modulos', to_jsonb(array_remove(array[
            case when p.personal_id is not null and p.conta_id is not null and 'treino' = any({schema}.modulos_do_plano(c.plano)) then 'treino' end,
            case when p.nutricionista_id is not null and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))) then 'nutricao' end
          ], null)),
        'bloqueada', p.acesso_bloqueado_em is not null, 'bloqueio_msg', p.acesso_bloqueado_msg,
        'bloqueado_por_pagamento', p.bloqueado_por_pagamento,
        'conta_alunos_bloqueados_em', c.alunos_bloqueados_em, 'conta_alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'personal', case when p.personal_id is null then null else jsonb_build_object('id', p.personal_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id)) end,
        'nutricionista', case when p.nutricionista_id is null then null else jsonb_build_object('id', p.nutricionista_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id)) end
      ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = v_uid and p.deleted_at is null
  ) x;
  -- módulos do aluno = a união dos módulos das matrículas
  select coalesce(array_agg(distinct m.valor), array[]::text[]) into v_modulos
    from jsonb_array_elements(v_matriculas) e, jsonb_array_elements_text(e -> 'modulos') as m(valor);

  -- quem veio do Calc e ainda não tem matrícula (o "aluno sem professor" de hoje) continua com o treino dele
  if coalesce(jsonb_array_length(v_matriculas), 0) = 0 and v_calc and not ('treino' = any(v_modulos)) then
    v_modulos := v_modulos || array['treino'];
  end if;

  -- precisa da sessão do Banco do Treino (spec 7.4, passo 3): master, personal ou dono de conta com Treino, aluno com Treino
  -- ou quem veio do Calc (tem treino guardado lá)
  v_precisa_treino := v_master or v_calc or 'treino' = any(v_modulos) or exists (
    select 1 from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo' and 'treino' = any({schema}.modulos_do_plano(c.plano))
       and (m.papeis && array['dono', 'personal']));

  -- legado do Nutri: a trava de assinatura de hoje (assinaturaUtil.ts do site antigo) para quem é nutricionista/master lá
  v_nutri := coalesce(v_perfil.role, '') in ('nutricionista', 'master') or exists (
    select 1 from jsonb_array_elements(v_contas) e where e ->> 'origem' = 'legado_nutri');
  if v_nutri then
    select jsonb_build_object(
        'role', v_perfil.role, 'teste_ate', v_perfil.teste_ate, 'pago_ate', v_perfil.pago_ate,
        'isento_assinatura', coalesce(v_perfil.isento_assinatura, false),
        'assinatura', (select jsonb_build_object('status', a.status, 'valor', a.valor, 'proximo_vencimento', a.proximo_vencimento)
                         from {schema}.assinaturas a where a.nutricionista_id = v_uid order by a.updated_at desc nulls last limit 1))
      into v_legado_nutri;
  end if;

  -- aviso "o Physiq mudou" (NF14): texto do público de quem entra (Calc primeiro) — liga/desliga em app_config
  select a.valor into v_aviso_cfg from {schema}.app_config a where a.chave = 'aviso_mudanca';
  v_publico := case when v_calc then 'calc'
                    when coalesce(v_perfil.role, '') in ('nutricionista', 'paciente', 'master')
                      or exists (select 1 from jsonb_array_elements(v_matriculas) e where e ->> 'conta_origem' = 'legado_nutri' or e ->> 'origem' = 'nutri')
                      or v_nutri then 'nutri'
                    else null end;
  if v_aviso_cfg is not null and v_publico is not null then
    v_aviso := jsonb_build_object(
      'publico', v_publico,
      'ativo', coalesce((v_aviso_cfg ->> 'ativo')::boolean, false) and coalesce((v_aviso_cfg -> v_publico ->> 'ativo')::boolean, false),
      'titulo', v_aviso_cfg -> v_publico ->> 'titulo',
      'texto', v_aviso_cfg -> v_publico ->> 'texto',
      'versao', coalesce(v_aviso_cfg ->> 'versao', '1'),
      'visto', (v_perfil.config -> 'aviso_mudanca_visto' ->> coalesce(v_aviso_cfg ->> 'versao', '1')) is not null);
  end if;

  return jsonb_build_object(
    'versao', 1,
    'user_id', v_uid,
    'email', v_email,
    'nome', coalesce(nullif(btrim(v_perfil.nome), ''), v_meta ->> 'full_name', v_meta ->> 'name', split_part(coalesce(v_email, ''), '@', 1)),
    'foto_url', coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    'master', v_master,
    'papel_legado', v_perfil.role,
    'calc', v_calc,
    'contas', v_contas,
    'matriculas', v_matriculas,
    'modulos_aluno', to_jsonb(coalesce(v_modulos, array[]::text[])),
    'precisa_treino', v_precisa_treino,
    'sem_nada', not v_master and jsonb_array_length(v_contas) = 0 and jsonb_array_length(v_matriculas) = 0 and not v_calc,
    'legado_nutri', v_legado_nutri,
    'aviso_mudanca', v_aviso,
    'gerado_em', now());
end;
$$;
revoke execute on function {schema}.minha_situacao() from public, anon;
grant execute on function {schema}.minha_situacao() to authenticated, service_role;

-- aviso "o Physiq mudou": visto uma vez por pessoa (por versão do texto), em qualquer aparelho
create or replace function {schema}.marcar_aviso_mudanca(p_versao text default '1') returns void
language sql volatile security definer set search_path = '' as $$
  update {schema}.profiles
     set config = jsonb_set(coalesce(config, '{}'::jsonb), array['aviso_mudanca_visto'],
                            coalesce(config -> 'aviso_mudanca_visto', '{}'::jsonb) || jsonb_build_object(coalesce(nullif(btrim(p_versao), ''), '1'), now()), true)
   where id = auth.uid();
$$;
revoke execute on function {schema}.marcar_aviso_mudanca(text) from public, anon;
grant execute on function {schema}.marcar_aviso_mudanca(text) to authenticated, service_role;

-- textos do aviso (o master liga/desliga e edita; a carga não sobrescreve o que já existe). Público "nutri" desligado até a
-- W28 (a virada de quem usa o Nutri); "calc" ligado — o corte da W3 é de quem usa o Calc (spec 0, 11.3 W3, W28 passo 12).
insert into {schema}.app_config (chave, valor, publica) values ('aviso_mudanca', jsonb_build_object(
  'ativo', true,
  'versao', '1',
  'calc', jsonb_build_object('ativo', true,
    'titulo', 'O PhysiqCalc agora é o Physiq',
    'texto', 'Seu treino continua aqui, do mesmo jeito, com todo o seu histórico. A partir de agora você entra com a conta do Physiq (Google ou e-mail e senha). Aos poucos a dieta, as avaliações e os pagamentos passam a ficar no mesmo app.'),
  'nutri', jsonb_build_object('ativo', false,
    'titulo', 'O PhysiqNutri agora faz parte do Physiq',
    'texto', 'Sua conta é a mesma: entre com o mesmo e-mail e senha (ou Google). Por enquanto a dieta e o consultório continuam no site do PhysiqNutri; aos poucos tudo passa para cá.')
), true)
on conflict (chave) do nothing;

-- ============================================================================================================
-- 5. Matrícula e conta pelo servidor (vincular-aluno, pos-login, script 01). Só service_role: nenhuma é chamada pelo app.
-- ============================================================================================================

-- cria a matrícula do aluno numa conta (idempotente: 1 matrícula por login e conta). Recusa como o Calc e o P7:
-- aluno ativo em OUTRA conta ("Este aluno já está com outro profissional") e o limite da faixa.
create or replace function {schema}.matricular_na_conta(
  p_user uuid, p_conta uuid, p_personal uuid, p_nutricionista uuid, p_origem text default 'novo',
  p_ignorar_regras boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta {schema}.contas%rowtype;
  v_existente {schema}.pacientes%rowtype;
  v_nome text;
  v_email text;
  v_id uuid;
begin
  select * into v_conta from {schema}.contas where id = p_conta for update;  -- serializa o limite da faixa
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conta_inexistente');
  end if;
  select * into v_existente from {schema}.pacientes
   where user_id = p_user and conta_id = p_conta and deleted_at is null order by created_at limit 1;
  if found then
    -- mesma conta: completa o responsável do outro módulo (ex.: já era da nutri e agora entrou pelo código do personal)
    update {schema}.pacientes set
        personal_id = coalesce(personal_id, p_personal),
        nutricionista_id = coalesce(nutricionista_id, p_nutricionista)
     where id = v_existente.id and ((personal_id is null and p_personal is not null) or (nutricionista_id is null and p_nutricionista is not null));
    return jsonb_build_object('ok', true, 'paciente_id', v_existente.id, 'ja_era', true);
  end if;
  if not p_ignorar_regras then
    if v_conta.situacao in ('suspensa', 'cancelada') then
      return jsonb_build_object('ok', false, 'erro', 'profissional_inativo');
    end if;
    if exists (select 1 from {schema}.pacientes p where p.user_id = p_user and p.deleted_at is null and p.ativo
                  and p.conta_id is distinct from p_conta) then
      return jsonb_build_object('ok', false, 'erro', 'outro_profissional');
    end if;
    if not {schema}.conta_pode_adicionar_aluno(p_conta) then
      return jsonb_build_object('ok', false, 'erro', 'limite_plano', 'limite', {schema}.conta_limite_alunos(p_conta));
    end if;
  end if;
  select coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name',
                  split_part(u.email, '@', 1)), u.email
    into v_nome, v_email
    from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = p_user;
  if v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'usuario_inexistente');
  end if;
  insert into {schema}.pacientes (nutricionista_id, personal_id, conta_id, user_id, nome, email, origem, ativo)
  values (p_nutricionista, p_personal, p_conta, p_user, coalesce(v_nome, 'Aluno'), v_email, p_origem, true)
  returning id into v_id;
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'ja_era', false);
end;
$$;

-- o código do profissional (?prof=PROF-NOME-SOBRENOME) leva à conta certa (spec 4.2, C6): matrícula com o responsável
-- do módulo que o profissional tem naquela conta
create or replace function {schema}.vincular_aluno_por_codigo(p_user uuid, p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_membro {schema}.conta_membros%rowtype;
  v_conta {schema}.contas%rowtype;
  v_mods text[];
  v_personal uuid;
  v_nutri uuid;
  v_res jsonb;
begin
  if v_codigo = '' or length(v_codigo) > 60 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido');
  end if;
  select * into v_membro from {schema}.conta_membros m
   where upper(m.codigo_convite) = v_codigo and m.user_id is not null order by (m.status = 'ativo') desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido');
  end if;
  if v_membro.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'erro', 'profissional_inativo');
  end if;
  select * into v_conta from {schema}.contas where id = v_membro.conta_id;
  if v_membro.user_id = p_user or exists (select 1 from {schema}.conta_membros m
       where m.conta_id = v_conta.id and m.user_id = p_user and m.status = 'ativo') then
    return jsonb_build_object('ok', false, 'erro', 'proprio_codigo');
  end if;
  v_mods := {schema}.modulos_do_plano(v_conta.plano);
  v_personal := case when 'personal' = any(v_membro.papeis) and 'treino' = any(v_mods) then v_membro.user_id end;
  v_nutri := case when 'nutricionista' = any(v_membro.papeis) and 'nutricao' = any(v_mods) then v_membro.user_id end;
  if v_personal is null and v_nutri is null then
    -- dono sem papel de módulo: o aluno entra na conta sem responsável (o dono reatribui)
    null;
  end if;
  v_res := {schema}.matricular_na_conta(p_user, v_conta.id, v_personal, v_nutri, 'novo', false);
  return v_res || jsonb_build_object('conta_id', v_conta.id, 'conta_nome', v_conta.nome,
    'profissional', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = v_membro.user_id),
    'modulos', to_jsonb(array_remove(array[case when v_personal is not null then 'treino' end, case when v_nutri is not null then 'nutricao' end], null)));
end;
$$;

-- convites pendentes do e-mail (spec 8.1: "o aceite é pela função do 1º login, com e-mail confirmado"): membro (convite ou
-- linha 'convidado' de conta_membros) vira membro ativo; aluno vira matrícula com o responsável do convite
create or replace function {schema}.aceitar_convites_do_email(p_user uuid, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_c record;
  v_mods text[];
  v_res jsonb;
  v_aceitos integer := 0;
  v_recusados jsonb := '[]'::jsonb;
begin
  if v_email = '' then
    return jsonb_build_object('aceitos', 0, 'recusados', v_recusados);
  end if;
  -- membros convidados direto na equipe (conta_membros sem login ainda)
  for v_c in select m.* from {schema}.conta_membros m
              where m.user_id is null and m.status = 'convidado' and lower(m.email_convite) = v_email loop
    if exists (select 1 from {schema}.conta_membros x where x.conta_id = v_c.conta_id and x.user_id = p_user) then
      update {schema}.conta_membros set status = 'removido', removido_em = now() where id = v_c.id;
    else
      update {schema}.conta_membros set user_id = p_user, status = 'ativo' where id = v_c.id;
      v_aceitos := v_aceitos + 1;
    end if;
    perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  end loop;
  -- convites (tabela convites)
  for v_c in select c.* from {schema}.convites c
              where c.status = 'pendente' and lower(c.email) = v_email order by c.enviado_em loop
    v_mods := {schema}.modulos_do_plano((select plano from {schema}.contas where id = v_c.conta_id));
    if v_c.tipo = 'membro' then
      if not {schema}.papeis_permitidos(v_c.conta_id, v_c.papeis) then
        v_recusados := v_recusados || jsonb_build_object('convite_id', v_c.id, 'erro', 'papel_sem_modulo');
        continue;
      end if;
      insert into {schema}.conta_membros as cm (conta_id, user_id, papeis, status)
      values (v_c.conta_id, p_user, v_c.papeis, 'ativo')
      on conflict (conta_id, user_id) where user_id is not null do update
        set papeis = (select array(select distinct unnest(cm.papeis || excluded.papeis))),
            status = 'ativo', removido_em = null;
      update {schema}.convites set status = 'aceito', aceito_em = now() where id = v_c.id;
      perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
      v_aceitos := v_aceitos + 1;
    else
      v_res := {schema}.matricular_na_conta(p_user, v_c.conta_id,
        case when 'treino' = any(v_c.modulos) and 'treino' = any(v_mods) then v_c.responsavel_id end,
        case when 'nutricao' = any(v_c.modulos) and 'nutricao' = any(v_mods) then v_c.responsavel_id end,
        'novo', false);
      if coalesce((v_res ->> 'ok')::boolean, false) then
        update {schema}.convites set status = 'aceito', aceito_em = now() where id = v_c.id;
        v_aceitos := v_aceitos + 1;
      else
        v_recusados := v_recusados || jsonb_build_object('convite_id', v_c.id, 'erro', v_res ->> 'erro');
      end if;
    end if;
  end loop;
  return jsonb_build_object('aceitos', v_aceitos, 'recusados', v_recusados);
end;
$$;

-- conta de profissional de treino vinda do Calc (script 01 e a ponte do pos-login): 'legado_calc' Só Treino com a regra de
-- hoje (cobrança legada até a W28, preço lido na virada) ou 'nova' (convidado pelo master depois do corte, teste de 14 dias).
-- Idempotente: 1 conta por dono e origem; o membro dono+personal leva o MESMO código de convite do Calc.
create or replace function {schema}.registrar_profissional_treino(
  p_user uuid, p_nome text, p_codigo text, p_origem text,
  p_faixa text default 'f10', p_situacao text default 'teste', p_teste_ate date default null, p_vence_em date default null,
  p_tolerancia integer default 0, p_isenta_motivo text default null, p_treino_user_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conta uuid;
  v_criada boolean := false;
  v_codigo text := nullif(upper(btrim(coalesce(p_codigo, ''))), '');
  v_codigo_ok boolean := true;
  v_membro {schema}.conta_membros%rowtype;
begin
  if p_origem not in ('legado_calc', 'nova') then
    raise exception 'origem inválida: %', p_origem;
  end if;
  select c.id into v_conta from {schema}.contas c
   where c.dono_id = p_user and c.origem = p_origem and 'treino' = any({schema}.modulos_do_plano(c.plano))
   order by c.criado_em limit 1;
  if v_conta is null then
    -- já é personal numa conta com Treino (ex.: conta nova de onde o Treino copiou o professor): não cria outra
    select m.conta_id into v_conta from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = p_user and m.status = 'ativo' and 'personal' = any(m.papeis)
       and 'treino' = any({schema}.modulos_do_plano(c.plano))
     order by ('dono' = any(m.papeis)) desc, c.criado_em limit 1;
    if v_conta is not null then
      return jsonb_build_object('conta_id', v_conta, 'criada', false, 'codigo_ok', true, 'ja_era_personal', true);
    end if;
  end if;
  if v_conta is null then
    insert into {schema}.contas (nome, dono_id, origem, plano, faixa, situacao, teste_ate, vence_em, tolerancia_dias,
                                 cobranca_legada, isenta_motivo, regra_pix)
    values (coalesce(nullif(btrim(p_nome), ''), 'Conta'), p_user, p_origem, 'treino', coalesce(p_faixa, 'f10'),
            coalesce(p_situacao, 'teste'), p_teste_ate, p_vence_em, greatest(0, coalesce(p_tolerancia, 0)),
            p_origem = 'legado_calc', p_isenta_motivo, 'mes')
    returning id into v_conta;
    v_criada := true;
    insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
    values (v_conta, 'outro', jsonb_build_object('criada_por', 'W3', 'origem', p_origem), null);
  end if;
  if v_codigo is not null and exists (select 1 from {schema}.conta_membros m
       where upper(m.codigo_convite) = v_codigo and not (m.conta_id = v_conta and m.user_id = p_user)) then
    v_codigo_ok := false;  -- código já usado por outro membro: não duplica (vai pro relatório)
  end if;
  select * into v_membro from {schema}.conta_membros where conta_id = v_conta and user_id = p_user;
  if not found then
    insert into {schema}.conta_membros (conta_id, user_id, papeis, status, codigo_convite, treino_user_id)
    values (v_conta, p_user, array['dono', 'personal'], 'ativo', case when v_codigo_ok then v_codigo end, p_treino_user_id);
  else
    update {schema}.conta_membros set
        papeis = (select array(select distinct unnest(papeis || array['dono', 'personal']))),
        status = 'ativo', removido_em = null,
        codigo_convite = coalesce(codigo_convite, case when v_codigo_ok then v_codigo end),
        treino_user_id = coalesce(p_treino_user_id, treino_user_id)
     where id = v_membro.id;
  end if;
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  return jsonb_build_object('conta_id', v_conta, 'criada', v_criada, 'codigo_ok', v_codigo_ok);
end;
$$;

-- conta da nutricionista do Nutri (script 01): 'legado_nutri' Só Nutrição, faixa livre, com a situação da assinatura de
-- hoje (a trava de verdade continua no site antigo até a W28) e os pacientes dela ligados à conta. Idempotente.
create or replace function {schema}.registrar_nutri_legado(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_perfil {schema}.profiles%rowtype;
  v_conta uuid;
  v_criada boolean := false;
  v_status text;
  v_prox timestamptz;
  v_situacao text;
  v_teste date;
  v_vence date;
  v_isenta text;
  v_ligados integer;
  v_master boolean;
begin
  select * into v_perfil from {schema}.profiles where id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_perfil');
  end if;
  v_master := v_perfil.role = 'master'
              or coalesce((select raw_app_meta_data ->> 'role' from auth.users where id = p_user), '') = 'master';
  select a.status, a.proximo_vencimento into v_status, v_prox
    from {schema}.assinaturas a where a.nutricionista_id = p_user order by a.updated_at desc nulls last limit 1;
  -- mesma ordem da situacaoAssinatura() do site antigo: isento > cartão ativo > PIX pago > teste > vencida
  if v_master then
    v_situacao := 'isenta'; v_isenta := 'master';
  elsif coalesce(v_perfil.isento_assinatura, false) then
    v_situacao := 'isenta'; v_isenta := 'isenta no PhysiqNutri';
  elsif v_status = 'authorized' then
    v_situacao := 'ativa'; v_vence := (coalesce(v_prox, now() + interval '30 days') at time zone 'America/Sao_Paulo')::date;
  elsif v_perfil.pago_ate is not null and v_perfil.pago_ate > now() then
    v_situacao := 'ativa'; v_vence := (v_perfil.pago_ate at time zone 'America/Sao_Paulo')::date;
  elsif v_perfil.teste_ate is not null and v_perfil.teste_ate > now() then
    v_situacao := 'teste'; v_teste := (v_perfil.teste_ate at time zone 'America/Sao_Paulo')::date;
  else
    v_situacao := 'vencida';
    v_vence := (coalesce(v_perfil.pago_ate, v_perfil.teste_ate) at time zone 'America/Sao_Paulo')::date;
  end if;
  select c.id into v_conta from {schema}.contas c
   where c.dono_id = p_user and c.origem = 'legado_nutri' order by c.criado_em limit 1;
  if v_conta is null then
    insert into {schema}.contas (nome, dono_id, origem, plano, faixa, situacao, teste_ate, vence_em, tolerancia_dias,
                                 cobranca_legada, isenta_motivo, regra_pix, bloquear_app_inadimplente)
    values (coalesce(nullif(btrim(v_perfil.nome), ''), v_perfil.email, 'Conta'), p_user, 'legado_nutri', 'nutricao', 'livre',
            v_situacao, v_teste, v_vence, 0, true, v_isenta, '30dias', true)
    returning id into v_conta;
    v_criada := true;
    insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
    values (v_conta, 'outro', jsonb_build_object('criada_por', 'W3', 'origem', 'legado_nutri'), null);
  end if;
  insert into {schema}.conta_membros as cm (conta_id, user_id, papeis, status)
  values (v_conta, p_user, array['dono', 'nutricionista'], 'ativo')
  on conflict (conta_id, user_id) where user_id is not null do update
    set papeis = (select array(select distinct unnest(cm.papeis || array['dono', 'nutricionista']))),
        status = 'ativo', removido_em = null;
  -- os pacientes dela (sem conta ainda) passam a ser matrículas da conta
  update {schema}.pacientes set conta_id = v_conta, origem = coalesce(origem, 'nutri')
   where nutricionista_id = p_user and conta_id is null;
  get diagnostics v_ligados = row_count;
  perform {schema}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', p_user));
  return jsonb_build_object('ok', true, 'conta_id', v_conta, 'criada', v_criada, 'situacao', v_situacao, 'pacientes_ligados', v_ligados);
end;
$$;

revoke execute on function {schema}.matricular_na_conta(uuid, uuid, uuid, uuid, text, boolean),
  {schema}.vincular_aluno_por_codigo(uuid, text), {schema}.aceitar_convites_do_email(uuid, text),
  {schema}.registrar_profissional_treino(uuid, text, text, text, text, text, date, date, integer, text, uuid),
  {schema}.registrar_nutri_legado(uuid)
  from public, anon, authenticated;
grant execute on function {schema}.matricular_na_conta(uuid, uuid, uuid, uuid, text, boolean),
  {schema}.vincular_aluno_por_codigo(uuid, text), {schema}.aceitar_convites_do_email(uuid, text),
  {schema}.registrar_profissional_treino(uuid, text, text, text, text, text, date, date, integer, text, uuid),
  {schema}.registrar_nutri_legado(uuid)
  to service_role;

-- @@ compartilhado
-- (roda 1x, depois dos 2 schemas) ------------------------------------------------------------------------------

-- P25: a conta tem senha? (a 1ª entrada com Google numa conta criada com senha troca a senha antiga por uma aleatória —
-- pos-login). Só o servidor pergunta.
create or replace function public.physiq_tem_senha(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.encrypted_password is not null and u.encrypted_password <> '' from auth.users u where u.id = p_user), false);
$$;
revoke execute on function public.physiq_tem_senha(uuid) from public, anon, authenticated;
grant execute on function public.physiq_tem_senha(uuid) to service_role;
