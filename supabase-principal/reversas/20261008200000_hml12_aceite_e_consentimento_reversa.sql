-- Reversa da hml-12 (supabase-principal/migrations/20261008200000_hml12_aceite_e_consentimento.sql). Idempotente: roda com ou sem
-- a migração aplicada.
--   · saem os 2 gatilhos da idade, as funções novas (versao_dos_textos, idade_em, saude_vigente, responsavel_vigente,
--     legal_da_situacao, idade_minima_guarda, aceitar_no_acesso, aluno_responsavel, aluno_responsavel_registrar e as sobrecargas
--     entrar_sem_profissional de 5 e preconsulta_responder de 6 argumentos) e a chave textos_legais;
--   · minha_situacao, exportar_dados_aluno, entrar_sem_profissional (2), preconsulta_responder (5), cadastro_link_enviar e
--     aluno_pendente_decidir voltam ao corpo de antes (pg_get_functiondef do banco vivo, 08/10/2026; CREATE OR REPLACE mantém dono e ACL);
--   · a prova de aceite NÃO é apagada: a tabela vira {schema}.aceites_reversa_hml12 (índices renomeados junto, sem privilégio da
--     API; o backup continua lendo) e as 2 colunas do consentimento em respostas_preconsulta ficam (inofensivas).
-- No staging, o front da hml-12 chama as RPCs novas: reverter o front junto. A conferência no fim desfaz tudo se algo sair diferente
-- (os 6 corpos com o md5 de antes, nenhuma função nova sobrando).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]   (produção; backup antes)

drop trigger if exists trg_pacientes_idade_minima on {schema}.pacientes;
drop trigger if exists trg_cadastros_pendentes_idade_minima on {schema}.cadastros_pendentes;
drop function if exists {schema}.idade_minima_guarda();
drop function if exists {schema}.aceitar_no_acesso(text, text, boolean, date, text);
drop function if exists {schema}.entrar_sem_profissional(text, text, date, text, text);
drop function if exists {schema}.preconsulta_responder(text, text, text, text, jsonb, text);
drop function if exists {schema}.aluno_responsavel_registrar(uuid, jsonb);
drop function if exists {schema}.aluno_responsavel(uuid);

-- as 6 funções como estavam
CREATE OR REPLACE FUNCTION {schema}.minha_situacao()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_conta_app uuid := {schema}.conta_do_app();
begin
  if v_uid is null then
    return null;
  end if;
  select u.email, coalesce(u.raw_app_meta_data, '{}'::jsonb), coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_app, v_meta from auth.users u where u.id = v_uid;
  select p.nome, p.role, p.teste_ate, p.pago_ate, p.isento_assinatura, coalesce(p.config, '{}'::jsonb) as config,
         nullif(btrim(p.dados_profissionais ->> 'foto_url'), '') as foto  -- W5: a foto do Perfil
    into v_perfil from {schema}.profiles p where p.id = v_uid;
  v_master := coalesce(v_app ->> 'role', '') = 'master' or coalesce(v_perfil.role, '') = 'master';
  -- veio do Calc: marcado pelo script 01 (app_metadata.calc / origem = 'calc')
  v_calc := coalesce(v_app ->> 'calc', '') = 'true' or coalesce(v_app ->> 'origem', '') = 'calc';

  -- contas em que é membro ativo (as com Treino primeiro: o painel de hoje é o do Calc), com papéis e números do menu
  select coalesce(jsonb_agg(x.j order by x.eh_app, x.tem_treino desc, x.dono desc, x.nome), '[]'::jsonb) into v_contas from (
    select c.nome, (c.origem = 'app') as eh_app, ('treino' = any({schema}.modulos_do_plano(c.plano))) as tem_treino, ('dono' = any(m.papeis)) as dono,
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
        'limite_alunos', {schema}.conta_limite_alunos(c.id),
        -- W4
        'assinatura', (select jsonb_build_object('status', a.status, 'proximo_vencimento', a.proximo_vencimento, 'valor', a.valor)
                         from {schema}.conta_assinaturas a where a.conta_id = c.id),
        'valor_mensal', {schema}.conta_preco(c.id, c.plano, c.faixa, 1)) as j
      from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.user_id = v_uid and m.status = 'ativo') x;

  -- matrículas (aluno): os módulos são os responsáveis que ele tem numa conta com aquele módulo (spec 4.1); no site
  -- antigo (sem conta) a nutricionista responsável vale como Nutrição. W7b: na conta do app, o plano manda (só a ativa).
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) into v_matriculas
  from (
    select p.created_at as criado,
      jsonb_build_object(
        'id', p.id, 'conta_id', p.conta_id, 'conta_nome', c.nome, 'conta_origem', c.origem, 'ativo', p.ativo,
        'origem', p.origem, 'modulos', to_jsonb(case
            when c.origem = 'app' then case when p.ativo then coalesce(
                (select array(select md from unnest(pa.modulos) md where md in ('treino', 'nutricao'))
                   from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id), array['treino']::text[]) else array[]::text[] end
            else array_remove(array[
              case when p.personal_id is not null and p.conta_id is not null and 'treino' = any({schema}.modulos_do_plano(c.plano)) then 'treino' end,
              case when p.nutricionista_id is not null and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano))) then 'nutricao' end
            ], null) end),
        'bloqueada', p.acesso_bloqueado_em is not null, 'bloqueio_msg', p.acesso_bloqueado_msg,
        -- W14 (R12, P15): o ajuste "acesso ao app" desta matrícula (sem a chave = ligado: quem tem login)
        'acesso_app', {schema}.w14_ajuste(p.config, 'acesso_app', true),
        'bloqueado_por_pagamento', p.bloqueado_por_pagamento,
        'conta_alunos_bloqueados_em', c.alunos_bloqueados_em, 'conta_alunos_bloqueados_msg', c.alunos_bloqueados_msg,
        'personal', case when p.personal_id is null then null else jsonb_build_object('id', p.personal_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id)) end,
        'nutricionista', case when p.nutricionista_id is null then null else jsonb_build_object('id', p.nutricionista_id,
            'nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id)) end,
        -- W7b: aluno sem profissional (conta do app)
        'app', coalesce(c.origem = 'app', false),
        'app_plano', case when c.origem = 'app' then (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id) end,
        'objetivo_app', p.objetivo_app,
        'teste_ate', case when c.origem = 'app' then p.app_teste_ate end
      ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = v_uid and p.deleted_at is null
  ) x;
  -- módulos do aluno = a união dos módulos das matrículas
  select coalesce(array_agg(distinct m.valor), array[]::text[]) into v_modulos
    from jsonb_array_elements(v_matriculas) e, jsonb_array_elements_text(e -> 'modulos') as m(valor);

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
    'foto_url', coalesce(v_perfil.foto, v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    'master', v_master,
    'papel_legado', v_perfil.role,
    'calc', v_calc,
    'contas', v_contas,
    'matriculas', v_matriculas,
    'modulos_aluno', to_jsonb(coalesce(v_modulos, array[]::text[])),
    'precisa_treino', v_precisa_treino,
    -- W7b: sem conta e sem matrícula → Boas-vindas (código do profissional, "Treinar sem profissional" ou "Sou profissional")
    'sem_nada', not v_master and jsonb_array_length(v_contas) = 0 and jsonb_array_length(v_matriculas) = 0,
    'legado_nutri', v_legado_nutri,
    'aviso_mudanca', v_aviso,
    'conta_app', v_conta_app,
    'gerado_em', now());
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.exportar_dados_aluno(p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
  v_planos uuid[];
  v_refeicoes uuid[];
  v_login jsonb;
  v_perfil jsonb;
  v_matriculas jsonb;
  v_tabelas jsonb := '{}'::jsonb;
begin
  if p_uid is null then
    raise exception 'exportar_dados_aluno: p_uid obrigatório';
  end if;
  select jsonb_build_object(
           'id', u.id, 'email', u.email, 'telefone', u.phone, 'criado_em', u.created_at, 'ultimo_login', u.last_sign_in_at,
           'email_confirmado_em', u.email_confirmed_at,
           'entra_com', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb),
           'nome_no_login', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           'foto_no_login', coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'))
    into v_login from auth.users u where u.id = p_uid;
  select to_jsonb(p) - array['carimbo_url', 'recebimento', 'codigo_cadastro'] into v_perfil from {schema}.profiles p where p.id = p_uid;

  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from {schema}.pacientes p where p.user_id = p_uid and p.deleted_at is null;
  select coalesce(jsonb_agg((to_jsonb(p) - array['busca', 'resumo', 'link_codigo']) || jsonb_build_object(
           'conta_nome', c.nome,
           'personal_nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id),
           'nutricionista_nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id),
           'plano_aluno_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id))
         order by p.created_at), '[]'::jsonb)
    into v_matriculas
    from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
   where p.id = any(v_ids);

  select coalesce(array_agg(pl.id), array[]::uuid[]) into v_planos from {schema}.planos_alimentares pl where pl.paciente_id = any(v_ids) and pl.deleted_at is null;
  select coalesce(array_agg(r.id), array[]::uuid[]) into v_refeicoes from {schema}.refeicoes r where r.plano_id = any(v_planos);

  v_tabelas := jsonb_build_object(
    'agendamentos', (select coalesce(jsonb_agg(to_jsonb(t) - array['observacao'] order by t.inicio), '[]') from {schema}.agendamentos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'consultas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.consultas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'planos_alimentares', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.planos_alimentares t where t.id = any(v_planos)),
    'refeicoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.plano_id, t.ordem), '[]') from {schema}.refeicoes t where t.id = any(v_refeicoes)),
    'itens_refeicao', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('alimento', al.nome) order by t.refeicao_id, t.ordem), '[]')
                         from {schema}.itens_refeicao t left join {schema}.alimentos al on al.id = t.alimento_id where t.refeicao_id = any(v_refeicoes)),
    'orientacoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.orientacoes t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'metas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.metas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'metas_concluidas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.metas_concluidas t where t.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.refeicoes_concluidas t where t.paciente_id = any(v_ids)),
    'diario_alimentar', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.data_hora), '[]') from {schema}.diario_alimentar t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'registros_diarios', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.registros_diarios t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'antropometrias', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.antropometrias t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'calculos_energeticos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.calculos_energeticos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'fotos_evolucao', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.data), '[]') from {schema}.fotos_evolucao t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'anamneses', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.anamneses t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'respostas_questionario', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.respostas_questionario t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'respostas_preconsulta', (select coalesce(jsonb_agg(to_jsonb(t) order by t.respondido_em), '[]') from {schema}.respostas_preconsulta t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'pedidos_exame', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.pedidos_exame t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'resultados_exame', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.resultados_exame t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'suplementos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.indicacoes_produto t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'formulas_manipuladas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.formulas_manipuladas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'medicamentos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.medicamentos_paciente t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'analises_farmaco', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.analises_farmaco t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'avaliacoes_integradas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.avaliacoes_integradas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'gestacoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.gestacoes t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'registros_gestacionais', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.registros_gestacionais t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'documentos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.documentos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'anexos', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.created_at), '[]') from {schema}.anexos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'cobrancas', (select coalesce(jsonb_agg((to_jsonb(t) - array['pix_qr', 'pix_copia_cola', 'comprovante_path'])
                                             || jsonb_build_object('tem_comprovante', t.comprovante_path is not null) order by t.created_at), '[]')
                    from {schema}.cobrancas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'recibos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.recibos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'assinaturas', (select coalesce(jsonb_agg(to_jsonb(t) - array['payload'] order by t.criado_em), '[]') from {schema}.aluno_assinaturas t where t.paciente_id = any(v_ids)),
    'mensagens_whatsapp', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.mensagens_whatsapp t where t.paciente_id = any(v_ids)),
    'cadastros_pendentes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.cadastros_pendentes t where t.paciente_id = any(v_ids)),
    'avisos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em), '[]') from {schema}.avisos t where t.destino_user_id = p_uid));

  return jsonb_build_object('login', v_login, 'perfil', v_perfil, 'matriculas', v_matriculas, 'tabelas', v_tabelas);
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.entrar_sem_profissional(p_objetivo text, p_plano text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  if nullif(btrim(coalesce(p_objetivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'objetivo_invalido');
  end if;
  if nullif(btrim(coalesce(p_plano, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'plano_invalido');
  end if;
  return {schema}.matricular_no_app(v_uid, p_objetivo, p_plano, 'entrou', true);
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.preconsulta_responder(p_slug text, p_nome text, p_email text, p_telefone text, p_respostas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO '{schema}', 'public'
AS $function$
declare
  f record;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_pergunta jsonb;
  v_id text;
  v_tipo text;
  v_resp jsonb;
  v_texto text;
  v_max numeric;
  v_p numeric;
  v_idx integer;
  v_n_opcoes integer;
  v_n integer := 0;
  v_pontos numeric := 0;
  v_respostas jsonb := '{}'::jsonb;
  v_faixa jsonb;
  v_fmin numeric;
  v_fmax numeric;
  v_rotulo text := '';
  v_nivel text := '';
  v_qtd integer;
  v_novo_id uuid;
begin
  perform {schema}.limite_publico('preconsulta_responder', 20, 'muitas_respostas');  -- hml-05c: limite por IP
  select * into f
    from formularios_preconsulta
   where slug = lower(trim(coalesce(p_slug, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'formulario_nao_encontrado';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if length(v_telefone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'sem_respostas';
  end if;

  -- pontuação por tipo (mesmas regras do app, questionariosUtil.pontuarPergunta); só respostas válidas contam e são gravadas
  for v_pergunta in select value from jsonb_array_elements(f.perguntas) loop
    if jsonb_typeof(v_pergunta) <> 'object' then
      continue;
    end if;
    v_id := v_pergunta ->> 'id';
    if v_id is null or v_id = '' or not (p_respostas ? v_id) then
      continue;
    end if;
    v_tipo := coalesce(v_pergunta ->> 'tipo', 'escala');
    v_resp := p_respostas -> v_id;
    if v_tipo = 'escala' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_max := case when (v_pergunta ->> 'max') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'max')::numeric else 4 end;
      v_p := least(v_max, greatest(0, round((v_resp #>> '{}')::numeric)));
      v_respostas := v_respostas || jsonb_build_object(v_id, v_p);
      v_pontos := v_pontos + v_p;
      v_n := v_n + 1;
    elsif v_tipo = 'sim_nao' then
      if jsonb_typeof(v_resp) <> 'boolean' then
        continue;
      end if;
      if (v_resp #>> '{}')::boolean then
        v_pontos := v_pontos + case when (v_pergunta ->> 'pontos_sim') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'pontos_sim')::numeric else 1 end;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, (v_resp #>> '{}')::boolean);
      v_n := v_n + 1;
    elsif v_tipo = 'multipla' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_n_opcoes := case when jsonb_typeof(v_pergunta -> 'opcoes') = 'array' then jsonb_array_length(v_pergunta -> 'opcoes') else 0 end;
      v_idx := floor((v_resp #>> '{}')::numeric)::integer;
      if v_idx < 0 or v_idx >= v_n_opcoes or (v_resp #>> '{}')::numeric <> v_idx then
        continue;
      end if;
      v_pontos := v_pontos + case when ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                  then greatest(0, ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos')::numeric) else 0 end;
      v_respostas := v_respostas || jsonb_build_object(v_id, v_idx);
      v_n := v_n + 1;
    else
      if jsonb_typeof(v_resp) <> 'string' then
        continue;
      end if;
      v_texto := trim(v_resp #>> '{}');
      if v_texto = '' then
        continue;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, left(v_texto, 500));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'sem_respostas';
  end if;

  -- rate limit simples por formulário: 30 respostas na última hora (conta também as da lixeira)
  select count(*) into v_qtd
    from respostas_preconsulta
   where formulario_id = f.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitas_respostas';
  end if;

  v_pontos := round(v_pontos, 2);
  for v_faixa in select value from jsonb_array_elements(f.faixas) loop
    if jsonb_typeof(v_faixa) <> 'object' then
      continue;
    end if;
    v_fmin := case when (v_faixa ->> 'min') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'min')::numeric end;
    v_fmax := case when (v_faixa ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'max')::numeric end;
    if v_fmin is null or v_fmax is null then
      continue;
    end if;
    if v_pontos >= least(v_fmin, v_fmax) and v_pontos <= greatest(v_fmin, v_fmax) then
      v_nivel := case when (v_faixa ->> 'nivel') in ('baixo', 'moderado', 'alto') then v_faixa ->> 'nivel' else 'baixo' end;
      v_rotulo := left(trim(coalesce(v_faixa ->> 'rotulo', '')), 60);
      if v_rotulo = '' then
        v_rotulo := initcap(v_nivel);
      end if;
      exit;
    end if;
  end loop;

  insert into respostas_preconsulta (nutricionista_id, formulario_id, titulo, perguntas, faixas, respostas, pontuacao, faixa, nivel, nome, email, telefone)
  values (f.nutricionista_id, f.id, f.titulo, f.perguntas, f.faixas, v_respostas, v_pontos, v_rotulo, v_nivel, v_nome, v_email, v_telefone)
  returning id into v_novo_id;

  return jsonb_build_object('id', v_novo_id, 'pontuacao', v_pontos, 'faixa', v_rotulo, 'nivel', v_nivel);
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.cadastro_link_enviar(p_codigo text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_dono_user uuid;
  v_dono_conta uuid;
  v_nome text := left(regexp_replace(btrim(coalesce(v_d ->> 'nome', '')), '\s+', ' ', 'g'), 120);
  v_apelido text := nullif(left(regexp_replace(btrim(coalesce(v_d ->> 'apelido', '')), '\s+', ' ', 'g'), 60), '');
  v_email text := nullif(lower(btrim(coalesce(v_d ->> 'email', ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(v_d ->> 'telefone', ''), '\D', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(v_d ->> 'cpf', ''), '\D', '', 'g'), '');
  v_genero text := nullif(lower(btrim(coalesce(v_d ->> 'genero', ''))), '');
  v_obs text := nullif(left(btrim(coalesce(v_d ->> 'observacoes', '')), 2000), '');
  v_nasc date;
  v_qtd integer;
  v_id uuid;
begin
  select d.user_id, d.conta_id into v_dono_user, v_dono_conta from {schema}.w13_dono_do_codigo(p_codigo) d;
  if v_dono_user is null then return jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'); end if;
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160) then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_tel is not null and length(v_tel) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'telefone_invalido'); end if;
  if v_cpf is not null and length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'cpf_invalido'); end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then return jsonb_build_object('ok', false, 'erro', 'genero_invalido'); end if;
  if nullif(btrim(coalesce(v_d ->> 'nascimento', '')), '') is not null then
    begin
      v_nasc := (v_d ->> 'nascimento')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end;
    if v_nasc > current_date or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido'); end if;
  end if;
  -- staging: só contato de teste (P26)
  if '{schema}' = 'staging' and v_email is not null and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  select count(*) into v_qtd from {schema}.cadastros_pendentes cp
   where cp.nutricionista_id = v_dono_user and cp.created_at > now() - interval '1 hour';
  if v_qtd >= 30 then return jsonb_build_object('ok', false, 'erro', 'muitos_cadastros'); end if;
  if exists (select 1 from {schema}.cadastros_pendentes cp
              where cp.nutricionista_id = v_dono_user and cp.status = 'pendente'
                and ((v_cpf is not null and cp.cpf = v_cpf)
                  or (v_email is not null and cp.email = v_email)
                  or (v_tel is not null and cp.telefone = v_tel and lower(cp.nome) = lower(v_nome)))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_repetido');
  end if;
  -- hml-05b (H-18): e-mail ou CPF que já é de um aluno vira cadastro pendente como os outros — quem preenche o link não fica
  -- sabendo se a pessoa já é aluna em alguma conta; o profissional vê o aviso ao aprovar (o gatilho pacientes_unicos_email_cpf
  -- recusa com paciente_email_repetido / paciente_cpf_repetido, que o painel já mostra).
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_apelido, v_nasc, v_tel, v_cpf, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.aluno_pendente_decidir(p_conta uuid, p_pendente uuid, p_aprovar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cp {schema}.cadastros_pendentes%rowtype;
  v_c {schema}.contas%rowtype;
  v_mods text[];
  v_personal uuid;
  v_nutri uuid;
  v_id uuid;
  v_rep text[];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_c from {schema}.contas where id = p_conta for update;  -- serializa o limite da faixa
  if not found then return jsonb_build_object('ok', false, 'erro', 'conta_inexistente'); end if;
  select * into v_cp from {schema}.cadastros_pendentes where id = p_pendente for update;
  if not found or v_cp.status <> 'pendente' then return jsonb_build_object('ok', false, 'erro', 'cadastro_nao_encontrado'); end if;
  if not (v_cp.conta_id = p_conta or (v_cp.conta_id is null and exists (select 1 from {schema}.conta_membros m
            where m.conta_id = p_conta and m.status = 'ativo' and m.user_id = v_cp.nutricionista_id))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_nao_encontrado');
  end if;
  if not ({schema}.sou_dono(p_conta) or {schema}.eh_master() or ({schema}.sou_membro(p_conta) and v_cp.nutricionista_id = v_uid)) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if not coalesce(p_aprovar, false) then
    update {schema}.cadastros_pendentes set status = 'reprovado', decidido_em = now() where id = p_pendente;
    return jsonb_build_object('ok', true, 'pendente_id', p_pendente, 'status', 'reprovado');
  end if;
  -- W16b: o e-mail/CPF do cadastro não pode ser de outro aluno (alguém pode ter cadastrado a pessoa depois do pedido)
  select coalesce(array_agg(distinct c order by c), '{}') into v_rep
    from {schema}.paciente_conflitos_novos(null, false, null, null, null, null, v_cp.email, v_cp.cpf) c;
  if cardinality(v_rep) > 0 then
    return jsonb_build_object('ok', false, 'erro', case when 'email' = any(v_rep) then 'email_repetido' else 'cpf_repetido' end,
                              'campos', to_jsonb(v_rep));
  end if;
  if {schema}.w13_conta_travada(p_conta) then return jsonb_build_object('ok', false, 'erro', 'conta_travada'); end if;
  if not {schema}.conta_pode_adicionar_aluno(p_conta) then return {schema}.w13_erro_limite(p_conta); end if;
  -- o responsável é o dono do link, nos módulos que ele atende na conta
  v_mods := {schema}.modulos_do_plano(v_c.plano);
  select case when 'treino' = any(v_mods) and 'personal' = any(m.papeis) then m.user_id end,
         case when 'nutricao' = any(v_mods) and 'nutricionista' = any(m.papeis) then m.user_id end
    into v_personal, v_nutri
    from {schema}.conta_membros m where m.conta_id = p_conta and m.user_id = v_cp.nutricionista_id and m.status = 'ativo';
  insert into {schema}.pacientes (nutricionista_id, personal_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, resumo, origem, ativo)
  values (v_nutri, v_personal, p_conta, v_cp.nome, v_cp.apelido, v_cp.nascimento, v_cp.telefone, v_cp.cpf, v_cp.email, v_cp.genero,
          case when v_cp.observacoes is null then null else 'Informado no cadastro pelo link: ' || v_cp.observacoes end, 'novo', true)
  returning id into v_id;
  update {schema}.cadastros_pendentes set status = 'aprovado', paciente_id = v_id, decidido_em = now(),
         conta_id = coalesce(conta_id, p_conta) where id = p_pendente;
  insert into {schema}.conta_eventos (conta_id, tipo, depois, por)
  values (p_conta, 'outro', jsonb_build_object('w13', 'pendente_aprovado', 'paciente_id', v_id, 'pendente_id', p_pendente), v_uid);
  return jsonb_build_object('ok', true, 'pendente_id', p_pendente, 'status', 'aprovado', 'paciente_id', v_id, 'rota_id', v_id);
end;
$function$;

drop function if exists {schema}.legal_da_situacao(uuid);
drop function if exists {schema}.saude_vigente(uuid);
drop function if exists {schema}.responsavel_vigente(uuid);
drop function if exists {schema}.idade_em(date);
drop function if exists {schema}.versao_dos_textos();

-- a prova fica: a tabela e os índices com outro nome (um reaplicar da migração cria a tabela de novo, limpa)
do $$
begin
  if to_regclass('{schema}.aceites') is not null then
    if to_regclass('{schema}.aceites_reversa_hml12') is not null then
      raise exception 'reversa hml-12: {schema}.aceites_reversa_hml12 já existe (reversa anterior): juntar as 2 à mão antes';
    end if;
    alter table {schema}.aceites rename to aceites_reversa_hml12;
    alter index if exists {schema}.aceites_pkey rename to aceites_reversa_hml12_pkey;
    alter index if exists {schema}.aceites_textos_um_por_versao rename to aceites_reversa_hml12_textos_um_por_versao;
    alter index if exists {schema}.aceites_titular rename to aceites_reversa_hml12_titular;
    alter index if exists {schema}.aceites_matricula rename to aceites_reversa_hml12_matricula;
    revoke all on table {schema}.aceites_reversa_hml12 from public, anon, authenticated, service_role;
  end if;
end
$$;

delete from {schema}.app_config where chave = 'textos_legais';

-- conferência: senão o bloco inteiro volta
do $$
declare
  r record;
  v_md5 text;
  v_papel text;
  v_oid regprocedure;
  v_t regclass := to_regclass('{schema}.aceites_reversa_hml12');
begin
  -- os 6 corpos = os de antes (md5 do corpo vivo em 08/10/2026, por schema)
  for r in
    select * from (values ('{schema}.minha_situacao()', 'dec664f2c5fe8a84f91cc90cdf1d04c8', '5014ba8dc2415a4ddb138bea6f34b76c'),
                          ('{schema}.exportar_dados_aluno(uuid)', '7cccdbc5e8fb33ec2dce08d2e5d0bbcb', 'be2e4dec8a3ee66a99b5be1637713e1a'),
                          ('{schema}.entrar_sem_profissional(text, text)', '0188fb03f295f00449365c673d79dfca', 'dac45f7e94b8bcf608ad8fc46ce198d1'),
                          ('{schema}.preconsulta_responder(text, text, text, text, jsonb)', '96a3f8b397c80dd4fcf0cdb6933f2fbc', '750dfc299282c229bdc8b9f205d4135b'),
                          ('{schema}.cadastro_link_enviar(text, jsonb)', '4949c487e8e06e08e39916d961735178', '822e29e615d89ca122768a5dbb058141'),
                          ('{schema}.aluno_pendente_decidir(uuid, uuid, boolean)', '9c4afbc6cf59ff2888d190f94454cab0', 'b47ff24be6d7c466d43b21bea7d12f07')) as x(f, md5_staging, md5_public)
  loop
    select md5(p.prosrc) into v_md5 from pg_catalog.pg_proc p where p.oid = to_regprocedure(r.f);
    if v_md5 is distinct from (case when '{schema}' = 'staging' then r.md5_staging else r.md5_public end) then
      raise exception 'reversa hml-12: % não voltou ao corpo de antes', r.f;
    end if;
  end loop;
  -- o EXECUTE de antes nas 6
  for r in
    select * from (values ('{schema}.minha_situacao()', false, true), ('{schema}.exportar_dados_aluno(uuid)', false, false),
                          ('{schema}.entrar_sem_profissional(text, text)', false, true),
                          ('{schema}.preconsulta_responder(text, text, text, text, jsonb)', true, true),
                          ('{schema}.cadastro_link_enviar(text, jsonb)', false, false),
                          ('{schema}.aluno_pendente_decidir(uuid, uuid, boolean)', false, true)) as x(f, anon, logado)
  loop
    v_oid := to_regprocedure(r.f);
    if pg_catalog.has_function_privilege('public', v_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') <> r.anon
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') <> r.logado
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'reversa hml-12: % com o EXECUTE diferente do de antes', r.f;
    end if;
  end loop;
  -- nenhuma função nova sobrando, nenhum gatilho, nenhuma chave
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where n.nspname = '{schema}'
                and (p.proname in ('versao_dos_textos', 'idade_em', 'saude_vigente', 'responsavel_vigente', 'legal_da_situacao',
                                   'idade_minima_guarda', 'aceitar_no_acesso', 'aluno_responsavel', 'aluno_responsavel_registrar')
                     or (p.proname = 'entrar_sem_profissional' and p.pronargs <> 2)
                     or (p.proname = 'preconsulta_responder' and p.pronargs <> 5))) then
    raise exception 'reversa hml-12: sobrou função nova em {schema}';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger t
              where not t.tgisinternal and t.tgname in ('trg_pacientes_idade_minima', 'trg_cadastros_pendentes_idade_minima')
                and t.tgrelid in ('{schema}.pacientes'::regclass, '{schema}.cadastros_pendentes'::regclass)) then
    raise exception 'reversa hml-12: sobrou gatilho da idade em {schema}';
  end if;
  if exists (select 1 from {schema}.app_config a where a.chave = 'textos_legais') then
    raise exception 'reversa hml-12: sobrou a chave textos_legais em {schema}.app_config';
  end if;
  -- a tabela: não existe com o nome de uso; a guardada (se houver) sem privilégio da API
  if to_regclass('{schema}.aceites') is not null then
    raise exception 'reversa hml-12: {schema}.aceites ainda existe com o nome de uso';
  end if;
  if v_t is not null then
    foreach v_papel in array array['public', 'anon', 'authenticated', 'service_role'] loop
      if pg_catalog.has_table_privilege(v_papel, v_t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or pg_catalog.has_any_column_privilege(v_papel, v_t, 'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception 'reversa hml-12: {schema}.aceites_reversa_hml12 com privilégio para %', v_papel;
      end if;
    end loop;
  end if;
end
$$;
