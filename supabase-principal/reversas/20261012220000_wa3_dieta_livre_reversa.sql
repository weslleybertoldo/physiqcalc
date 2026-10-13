-- REVERSA da 20261012220000_wa3_dieta_livre.sql (W-A P1). Idempotente. Rodar ANTES da reversa da wa2 e da wa1.
--   · as 3 funções de LGPD voltam ao corpo de ANTES (gerado do corpo vivo de 12/10 por gerar_lgpd_wa3.py; md5 conferido no fim);
--   · saem as 14 RPCs e as 11 internas da wa3;
--   · tabela VAZIA é apagada; com linha, NÃO: vira <nome>_reversa_wa3 (índices renomeados, sem policy e sem privilégio da API —
--     o backup segue lendo), para decidir com calma (o molde da reversa da hml-12).
-- STAGING:  python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261012220000_wa3_dieta_livre_reversa.sql --so staging
-- PRODUÇÃO (backup antes): --compartilhado PRIMEIRO (as 2 exclusões do public voltam — o corpo de antes não cita nada da W-A),
--           DEPOIS --so public. (O --so public recusa se o --compartilhado ainda não rodou.)

-- 0. ordem certa no public: as exclusões do public já voltaram?
do $wa$
begin
  if '{schema}' = 'public' and exists (select 1 from pg_catalog.pg_proc p
       where p.oid in (to_regprocedure('public.excluir_dados_aluno(uuid, boolean)'), to_regprocedure('public.excluir_conta_profissional(uuid, boolean)'))
         and position('wa_dados_do_aluno' in p.prosrc) > 0) then
    raise exception 'reversa wa3: rode o --compartilhado ANTES do --so public';
  end if;
end
$wa$;

-- 1. os corpos de antes (a exportar com {schema}; as 2 exclusões do staging só no staging)
-- >>> LGPD por schema
-- corpos de ANTES, gerados por gerar_lgpd_wa3.py a partir do corpo VIVO (12/10/2026, md5 conferido) — não editar à mão
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
  v_aceites jsonb;  -- hml-12 (H-30)
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

  -- hml-12 (H-30): os aceites do titular e os do responsável pelas matrículas dele (sem quem registrou)
  select coalesce(jsonb_agg(to_jsonb(a) - 'registrado_por' order by a.em, a.id), '[]'::jsonb) into v_aceites
    from {schema}.aceites a where a.user_id = p_uid or a.paciente_id = any(v_ids);

  return jsonb_build_object('login', v_login, 'perfil', v_perfil, 'matriculas', v_matriculas, 'tabelas', v_tabelas,
                            'aceites', v_aceites);
end;
$function$;

do $wa_lgpd$
begin
  if '{schema}' = 'staging' then
    execute $wa_corpo$CREATE OR REPLACE FUNCTION staging.excluir_dados_aluno(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff text;
  v_ids uuid[];
  v_arquivos jsonb;
  v_apaga jsonb;
  v_mantem jsonb;
  v_whats integer;
begin
  if p_uid is null then
    raise exception 'excluir_dados_aluno: p_uid obrigatório';
  end if;
  -- quem é profissional não exclui pelo app do aluno (a conta dele sustenta alunos e equipe — nunca deixar conta órfã)
  select case
      when exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin')) then 'master'
      when exists (select 1 from staging.profiles p where p.id = p_uid and p.role in ('master', 'nutricionista')) then 'perfil_profissional'
      when exists (select 1 from staging.contas c where c.dono_id = p_uid) then 'dono'
      when exists (select 1 from staging.conta_membros m where m.user_id = p_uid and m.status <> 'removido') then 'membro'
    end into v_staff;
  if v_staff is not null then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', v_staff);
  end if;

  -- TODAS as matrículas do login (inclusive as da lixeira): o login some, nenhuma pode ficar apontando para ele
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from staging.pacientes p where p.user_id = p_uid;

  if exists (select 1 from staging.aluno_assinaturas a where a.paciente_id = any(v_ids) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario-staging', 'path', d.path)), '[]'::jsonb) into v_arquivos
    from staging.diario_alimentar d where d.paciente_id = any(v_ids) and nullif(d.path, '') is not null;
  select count(*) into v_whats from staging.mensagens_whatsapp m where m.paciente_id = any(v_ids) and m.status = 'pendente';

  v_apaga := jsonb_build_object(
    'diario_alimentar', (select count(*) from staging.diario_alimentar d where d.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select count(*) from staging.refeicoes_concluidas r where r.paciente_id = any(v_ids)),
    'metas_concluidas', (select count(*) from staging.metas_concluidas r where r.paciente_id = any(v_ids)),
    'avisos', (select count(*) from staging.avisos a where a.destino_user_id = p_uid),
    'perfil', (select count(*) from staging.profiles p where p.id = p_uid),
    'whatsapp_pendentes_cancelados', v_whats);
  v_mantem := jsonb_build_object(
    'matriculas', coalesce(array_length(v_ids, 1), 0),
    'agendamentos', (select count(*) from staging.agendamentos a where a.paciente_id = any(v_ids)),
    'cobrancas', (select count(*) from staging.cobrancas c where c.paciente_id = any(v_ids)),
    'recibos', (select count(*) from staging.recibos r where r.paciente_id = any(v_ids)),
    'antropometrias', (select count(*) from staging.antropometrias a where a.paciente_id = any(v_ids)),
    'planos_alimentares', (select count(*) from staging.planos_alimentares a where a.paciente_id = any(v_ids)),
    'prontuario', (select count(*) from staging.registros_prontuario a where a.paciente_id = any(v_ids)));

  if not coalesce(p_simular, true) then
    delete from staging.diario_alimentar where paciente_id = any(v_ids);
    delete from staging.refeicoes_concluidas where paciente_id = any(v_ids);
    delete from staging.metas_concluidas where paciente_id = any(v_ids);
    update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
     where paciente_id = any(v_ids) and status = 'pendente';
    update staging.pacientes
       set ativo = false,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = any(v_ids);
    -- o gatilho do espelho enfileirou esta pessoa (ativo mudou), mas o login vai sumir: o Treino já foi tratado pela borda
    delete from staging.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'matriculas', to_jsonb(v_ids),
    'apaga', v_apaga, 'mantem', v_mantem, 'arquivos', v_arquivos);
end;
$function$$wa_corpo$;
    execute $wa_corpo$CREATE OR REPLACE FUNCTION staging.excluir_conta_profissional(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_simular boolean := coalesce(p_simular, true);
  v_contas_dono uuid[];
  v_c record;
  v_m record;
  v_nome text;
  v_perfil text;
  v_ids_aluno uuid[];
  v_aluno jsonb := null;
  v_arquivos jsonb := '[]'::jsonb;
  v_whats integer := 0;
  v_dono jsonb := '[]'::jsonb;
  v_equipes jsonb := '[]'::jsonb;
  v_ex_equipes integer := 0;
  v_sem_conta jsonb := null;
  v_eu_nutri boolean;
  v_alunos jsonb;
  v_resumo_alunos jsonb;
  v_membros jsonb;
  v_cobrancas jsonb;
  v_pront jsonb;
  v_convites integer;
  v_lixeira integer;
  v_removidos integer;
  v_revogados integer;
  v_chaves integer;
  v_whats_conta integer;
  v_treino integer;
  v_nutri integer;
  v_feito jsonb;
  v_email_login text;
  v_perfis jsonb := '[]'::jsonb;
begin
  if p_uid is null then
    raise exception 'excluir_conta_profissional: p_uid obrigatório';
  end if;

  -- o master nunca exclui por aqui (a conta do app — origem 'app' — é dele e nunca é afetada)
  if exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin'))
     or exists (select 1 from staging.profiles p where p.id = p_uid and p.role = 'master') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
  end if;

  -- contas de que é dono: a linha da conta (dono_id — continua apontando para ele depois de excluir: o pedido de novo acha) ou o
  -- papel 'dono' numa equipe ainda ativa
  select coalesce(array_agg(distinct c.id), array[]::uuid[]) into v_contas_dono
    from staging.contas c
   where c.dono_id = p_uid
      or exists (select 1 from staging.conta_membros m
                  where m.conta_id = c.id and m.user_id = p_uid and m.status <> 'removido' and 'dono' = any(m.papeis));
  if exists (select 1 from staging.contas c where c.id = any(v_contas_dono) and c.origem = 'app') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'conta_do_app');
  end if;
  if exists (select 1 from staging.contas c where c.id = any(v_contas_dono) and c.cobranca_legada) then
    return jsonb_build_object('ok', false, 'erro', 'conta_legada');
  end if;

  -- é (ou já foi) profissional? Sem conta, sem equipe (nem passada) e sem o perfil de nutricionista do site antigo = só aluno: o
  -- caminho é o de sempre (excluir_dados_aluno — a borda sem o campo novo)
  if coalesce(array_length(v_contas_dono, 1), 0) = 0
     and not exists (select 1 from staging.conta_membros m where m.user_id = p_uid)
     and not exists (select 1 from staging.profiles p where p.id = p_uid and p.role = 'nutricionista') then
    return jsonb_build_object('ok', false, 'erro', 'nao_profissional');
  end if;

  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
         lower(u.email)
    into v_nome, v_email_login from auth.users u left join staging.profiles pr on pr.id = u.id where u.id = p_uid;

  -- ---------- a parte de ALUNO (quem também é aluno em alguma conta — a mesma lista da excluir_dados_aluno, W7) ----------
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids_aluno from staging.pacientes p where p.user_id = p_uid;
  if exists (select 1 from staging.aluno_assinaturas a where a.paciente_id = any(v_ids_aluno) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;
  -- toda recusa vem ANTES de mudar qualquer coisa: a cobrança automática das contas dele (plano e alunos → ele) a borda cancela no
  -- Mercado Pago antes de pedir o "excluir"; sobrou alguma viva (o cancelamento falhou ou nasceu outra no meio) → nada muda
  if not v_simular and (
       exists (select 1 from staging.conta_assinaturas a where a.conta_id = any(v_contas_dono) and a.status in ('authorized', 'pending', 'paused'))
    or exists (select 1 from staging.aluno_assinaturas a
                where a.status in ('authorized', 'pending', 'paused')
                  and (a.conta_id = any(v_contas_dono)
                       or exists (select 1 from staging.pacientes p where p.id = a.paciente_id and p.conta_id = any(v_contas_dono))))) then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_ativa');
  end if;
  if coalesce(array_length(v_ids_aluno, 1), 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario-staging', 'path', d.path)), '[]'::jsonb) into v_arquivos
      from staging.diario_alimentar d where d.paciente_id = any(v_ids_aluno) and nullif(d.path, '') is not null;
    select count(*) into v_whats from staging.mensagens_whatsapp m where m.paciente_id = any(v_ids_aluno) and m.status = 'pendente';
    v_aluno := jsonb_build_object(
      'matriculas', coalesce(array_length(v_ids_aluno, 1), 0),
      'contas', (select coalesce(jsonb_agg(distinct c.nome), '[]'::jsonb) from staging.pacientes p join staging.contas c on c.id = p.conta_id
                  where p.id = any(v_ids_aluno) and c.origem <> 'app' and not (c.id = any(v_contas_dono))),
      'apaga', jsonb_build_object(
        'diario_alimentar', (select count(*) from staging.diario_alimentar d where d.paciente_id = any(v_ids_aluno)),
        'refeicoes_concluidas', (select count(*) from staging.refeicoes_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'metas_concluidas', (select count(*) from staging.metas_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'whatsapp_pendentes_cancelados', v_whats),
      'mantem', jsonb_build_object(
        'agendamentos', (select count(*) from staging.agendamentos a where a.paciente_id = any(v_ids_aluno)),
        'cobrancas', (select count(*) from staging.cobrancas c where c.paciente_id = any(v_ids_aluno)),
        'recibos', (select count(*) from staging.recibos r where r.paciente_id = any(v_ids_aluno)),
        'antropometrias', (select count(*) from staging.antropometrias a where a.paciente_id = any(v_ids_aluno)),
        'planos_alimentares', (select count(*) from staging.planos_alimentares a where a.paciente_id = any(v_ids_aluno)),
        'prontuario', (select count(*) from staging.registros_prontuario a where a.paciente_id = any(v_ids_aluno))));
    if not v_simular then
      delete from staging.diario_alimentar where paciente_id = any(v_ids_aluno);
      delete from staging.refeicoes_concluidas where paciente_id = any(v_ids_aluno);
      delete from staging.metas_concluidas where paciente_id = any(v_ids_aluno);
      update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
       where paciente_id = any(v_ids_aluno) and status = 'pendente';
      -- o login sai por soft delete (a linha do Auth fica): a matrícula fica desligada dele aqui, como o "set null" faria
      update staging.pacientes
         set ativo = false, user_id = null,
             config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
       where id = any(v_ids_aluno);
    end if;
  end if;

  -- ---------- DONO: cada conta ----------
  for v_c in select c.* from staging.contas c where c.id = any(v_contas_dono) order by c.criado_em loop
    v_eu_nutri := 'nutricao' = any(staging.modulos_do_plano(v_c.plano))
      and exists (select 1 from staging.conta_membros m where m.conta_id = v_c.id and m.user_id = p_uid and m.status = 'ativo'
                    and 'nutricionista' = any(m.papeis));
    -- os alunos (fora da lixeira) e para onde vão — a mesma regra do gatilho pacientes_app_assumir (W7b)
    select jsonb_build_object(
             'total', count(*),
             'para_o_app', count(*) filter (where x.destino = 'app'),
             'guardados', count(*) filter (where x.destino <> 'app'),
             'lista', coalesce((jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'destino', x.destino) order by x.nome)
                                 filter (where x.ordem <= 100)), '[]'::jsonb))
      into v_resumo_alunos
      from (select p.id, p.nome, row_number() over (order by p.nome) as ordem,
                   case when p.user_id is not null and p.user_id <> p_uid and p.ativo and v_c.origem in ('nova', 'legado_calc')
                          and not exists (select 1 from staging.pacientes o where o.user_id = p.user_id and o.conta_id is distinct from v_c.id
                                            and o.deleted_at is null and o.ativo)
                          and not exists (select 1 from staging.profiles pr where pr.id = p.user_id and pr.role = 'master')
                        then 'app' else 'guardado' end as destino
              from staging.pacientes p where p.conta_id = v_c.id and p.deleted_at is null) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', coalesce(staging.nome_da_pessoa(m.user_id), m.email_convite), 'email', coalesce(u.email, m.email_convite),
             'papeis', to_jsonb(m.papeis), 'status', m.status) order by m.status, coalesce(staging.nome_da_pessoa(m.user_id), m.email_convite)), '[]'::jsonb)
      into v_membros
      from staging.conta_membros m left join auth.users u on u.id = m.user_id
     where m.conta_id = v_c.id and m.status in ('ativo', 'convidado') and m.user_id is distinct from p_uid;
    select count(*) into v_convites from staging.convites cv where cv.conta_id = v_c.id and cv.status = 'pendente';
    v_cobrancas := jsonb_build_object(
      'plano', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mp_preapproval_id', a.mp_preapproval_id, 'status', a.status,
                                                              'simulada', coalesce(a.payload ->> 'simulada', '') = 'true')), '[]'::jsonb)
                  from staging.conta_assinaturas a where a.conta_id = v_c.id and a.status in ('authorized', 'pending', 'paused')),
      'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'paciente_id', a.paciente_id, 'mp_preapproval_id', a.mp_preapproval_id,
                                                               'status', a.status)), '[]'::jsonb)
                   from staging.aluno_assinaturas a
                  where a.status in ('authorized', 'pending', 'paused')
                    and (a.conta_id = v_c.id or exists (select 1 from staging.pacientes p where p.id = a.paciente_id and p.conta_id = v_c.id))));
    -- os prontuários (todas as matrículas da conta, inclusive as da lixeira): o que o dono vê e o que é "Só nutricionistas"
    select coalesce(jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', v_c.id, 'nome', p.nome, 'registros', x.total,
                                                 'restritos', x.restritos) order by p.nome), '[]'::jsonb)
      into v_pront
      from staging.pacientes p
      join lateral (select count(*) as total,
                           count(*) filter (where r.visibilidade = 'nutricionistas' and not v_eu_nutri) as restritos
                      from staging.registros_prontuario r where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
     where p.conta_id = v_c.id;

    v_feito := null;
    if not v_simular then
      -- a) as matrículas para a lixeira, como no aluno_remover: o gatilho pacientes_app_assumir (W7b) leva quem tem login para o app
      update staging.pacientes set deleted_at = now() where conta_id = v_c.id and deleted_at is null;
      get diagnostics v_lixeira = row_count;
      -- b) a equipe perde o acesso (sou_membro na hora; o Treino pelo espelho) e fica sabendo pelo sino, como no remover_membro
      select count(*) into v_removidos from staging.conta_membros m
       where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is distinct from p_uid;
      insert into staging.avisos (destino_user_id, tipo, titulo, link)
      select m.user_id, 'membro_removido', left('Você não faz mais parte da equipe de ' || v_c.nome || ' (a conta foi encerrada)', 160), null
        from staging.conta_membros m where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is not null and m.user_id <> p_uid;
      update staging.conta_membros
         set status = 'removido', removido_em = now(),
             removido_motivo = case when user_id = p_uid then 'conta_excluida' else removido_motivo end
       where conta_id = v_c.id and status <> 'removido';
      -- c) convites (aluno e membro) que ninguém aceitou não levam mais ninguém para a conta
      update staging.convites set status = 'revogado' where conta_id = v_c.id and status = 'pendente';
      get diagnostics v_revogados = row_count;
      -- d) ninguém paga mais por Pix a uma conta encerrada; mensagens automáticas pendentes saem da fila
      update staging.recebimento_chaves set ativa = false, atualizado_em = now() where conta_id = v_c.id and ativa;
      get diagnostics v_chaves = row_count;
      update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o profissional excluiu a conta', updated_at = now()
       where status = 'pendente' and (conta_id = v_c.id or nutricionista_id = p_uid);
      get diagnostics v_whats_conta = row_count;
      -- e) a conta fica (as matrículas da lixeira guardam o histórico), cancelada
      update staging.contas set situacao = 'cancelada' where id = v_c.id and situacao <> 'cancelada';
      v_feito := jsonb_build_object('alunos_na_lixeira', v_lixeira, 'membros_removidos', v_removidos, 'convites_revogados', v_revogados,
                                    'chaves_pix_desligadas', v_chaves, 'whatsapp_cancelados', v_whats_conta);
      if v_c.situacao <> 'cancelada' or v_lixeira > 0 or v_removidos > 0 or v_revogados > 0 or v_chaves > 0 or v_whats_conta > 0 then
        insert into staging.conta_eventos (conta_id, tipo, antes, depois, por)
        values (v_c.id, 'situacao', jsonb_build_object('situacao', v_c.situacao),
                jsonb_build_object('situacao', 'cancelada', 'acao', 'conta_excluida_pelo_dono', 'w2l', true,
                                   'alunos_para_o_app', v_resumo_alunos -> 'para_o_app') || v_feito, p_uid);
      end if;
    end if;

    v_dono := v_dono || jsonb_build_object(
      'id', v_c.id, 'nome', v_c.nome, 'origem', v_c.origem, 'plano', v_c.plano, 'situacao', v_c.situacao, 'eu_nutri', v_eu_nutri,
      'alunos', v_resumo_alunos, 'membros', v_membros, 'convites_pendentes', v_convites, 'cobrancas', v_cobrancas, 'prontuarios', v_pront,
      'feito', v_feito);
  end loop;

  -- ---------- pacientes sem conta do site antigo do Nutri (os da própria nutricionista — regra de hoje: nutricionista_id) ----------
  if exists (select 1 from staging.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid) then
    select jsonb_build_object(
             'alunos', (select count(*) from staging.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid and p.deleted_at is null),
             'prontuarios', coalesce((
               select jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', null, 'nome', p.nome, 'registros', x.total, 'restritos', 0)
                                order by p.nome)
                 from staging.pacientes p
                 join lateral (select count(*) as total from staging.registros_prontuario r
                                where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
                where p.conta_id is null and p.nutricionista_id = p_uid), '[]'::jsonb))
      into v_sem_conta;
    if not v_simular then
      update staging.pacientes set deleted_at = now() where conta_id is null and nutricionista_id = p_uid and deleted_at is null;
    end if;
  end if;

  -- ---------- MEMBRO (não dono): sai da equipe como no remover_membro, sem novo responsável ----------
  for v_m in select m.*, c.nome as conta_nome, c.dono_id
               from staging.conta_membros m join staging.contas c on c.id = m.conta_id
              where m.user_id = p_uid and m.status <> 'removido' and not (m.conta_id = any(v_contas_dono))
              order by m.criado_em loop
    select count(*) filter (where p.personal_id = p_uid), count(*) filter (where p.nutricionista_id = p_uid)
      into v_treino, v_nutri
      from staging.pacientes p where p.conta_id = v_m.conta_id and p.deleted_at is null;
    if not v_simular then
      update staging.pacientes set personal_id = null where conta_id = v_m.conta_id and personal_id = p_uid;
      update staging.pacientes set nutricionista_id = null where conta_id = v_m.conta_id and nutricionista_id = p_uid;
      update staging.convites set status = 'revogado'
       where conta_id = v_m.conta_id and tipo = 'aluno' and status = 'pendente' and responsavel_id = p_uid;
      get diagnostics v_revogados = row_count;
      update staging.conta_membros set status = 'removido', removido_em = now(), removido_motivo = 'conta_excluida' where id = v_m.id;
      insert into staging.conta_eventos (conta_id, tipo, antes, depois, por)
      values (v_m.conta_id, 'membro', jsonb_build_object('membro_id', v_m.id, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
              jsonb_build_object('acao', 'saiu_excluiu_a_conta', 'w2l', true, 'membro_id', v_m.id, 'user_id', p_uid, 'alunos_treino', v_treino,
                                 'alunos_nutricao', v_nutri, 'convites_de_aluno_revogados', v_revogados), p_uid);
      if v_m.dono_id is not null and v_m.dono_id <> p_uid then
        insert into staging.avisos (destino_user_id, tipo, titulo, link)
        values (v_m.dono_id, 'geral', left(coalesce(v_nome, 'Um profissional') || ' excluiu a conta e saiu da equipe'
                  || case when v_treino + v_nutri > 0 then ' · ' || (v_treino + v_nutri) || ' aluno(s) sem responsável' else '' end, 160),
                '/painel/alunos');
      end if;
    end if;
    v_equipes := v_equipes || jsonb_build_object('conta_id', v_m.conta_id, 'conta_nome', v_m.conta_nome,
      'dono_nome', staging.nome_da_pessoa(v_m.dono_id), 'papeis', to_jsonb(v_m.papeis), 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri);
  end loop;
  select count(*) into v_ex_equipes from staging.conta_membros m
   where m.user_id = p_uid and m.status = 'removido' and not (m.conta_id = any(v_contas_dono)) and m.removido_motivo is null;

  v_perfil := case when jsonb_array_length(v_dono) > 0 then 'dono'
                   when jsonb_array_length(v_equipes) > 0 then 'membro'
                   else 'ex_profissional' end;

  -- ---------- a pessoa (o login sai pela borda, por soft delete) ----------
  if not v_simular then
    -- o perfil: anônimo aqui e no ESPELHO (o gatilho handle_new_user cria o perfil nos 2 schemas). Fica o nome e o CRN/CREF só onde
    -- ele assina algo (w2l_limpar_perfil). No staging só conta de teste chega aqui (a borda recusa conta real) e, mesmo assim, o
    -- espelho em public só é limpo com e-mail de teste
    v_perfis := jsonb_build_array(staging.w2l_limpar_perfil(p_uid, 'staging'));
    if 'staging' = 'public' then
      v_perfis := v_perfis || staging.w2l_limpar_perfil(p_uid, 'staging');
    elsif staging.email_de_teste(v_email_login) then
      v_perfis := v_perfis || staging.w2l_limpar_perfil(p_uid, 'public');
    end if;
    delete from staging.avisos where destino_user_id = p_uid;
    delete from staging.push_aparelhos where user_id = p_uid;
    update staging.whatsapp_instancias
       set status = 'desconectado', qr_code = null, numero_conectado = null, erro = 'conta excluída', updated_at = now()
     where nutricionista_id = p_uid and status <> 'desconectado';
    -- os gatilhos do espelho enfileiraram esta pessoa, mas o login vai sair: o Treino dela é tratado pela borda (delete-my-account).
    -- Os alunos e a equipe seguem na fila (a borda dispara o espelho logo depois).
    delete from staging.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object(
    'ok', true, 'simulacao', v_simular, 'perfil', v_perfil, 'nome', v_nome,
    'contas_dono', v_dono, 'equipes', v_equipes, 'ex_equipes', v_ex_equipes, 'sem_conta', v_sem_conta,
    'aluno', v_aluno, 'arquivos', v_arquivos, 'perfis', v_perfis);
end;
$function$$wa_corpo$;
  end if;
end
$wa_lgpd$;
-- <<< LGPD por schema

-- 2. as RPCs e as internas
drop function if exists {schema}.meu_dia(date);
drop function if exists {schema}.dia_adicionar(date, jsonb);
drop function if exists {schema}.dia_tirar(date, uuid);
drop function if exists {schema}.dia_desfazer(uuid);
drop function if exists {schema}.dia_extra_salvar(uuid, jsonb);
drop function if exists {schema}.dia_extra_excluir(uuid);
drop function if exists {schema}.dia_extra_marcar(uuid, boolean);
drop function if exists {schema}.meus_alimentos();
drop function if exists {schema}.meu_alimento_salvar(uuid, jsonb);
drop function if exists {schema}.meu_alimento_excluir(uuid);
drop function if exists {schema}.minha_receita_salvar(uuid, jsonb);
drop function if exists {schema}.minha_receita_excluir(uuid);
drop function if exists {schema}.buscar_alimentos_do_aluno(text, integer);
drop function if exists {schema}.dia_do_aluno(uuid, date, date);
drop function if exists {schema}.wa_dados_do_aluno(uuid, boolean);
drop function if exists {schema}.wa_dieta_liberada_alguma(uuid);
drop function if exists {schema}.wa_macros_da_receita(uuid);
drop function if exists {schema}.wa_alimento_visivel(uuid, uuid);
drop function if exists {schema}.wa_refeicao_do_dia(uuid, uuid, date);
drop function if exists {schema}.wa_plano_ativo(uuid);
drop function if exists {schema}.wa_matriculas_dieta(uuid);
drop function if exists {schema}.wa_texto(jsonb, integer, integer);
drop function if exists {schema}.wa_numero(jsonb, numeric, numeric);
drop function if exists {schema}.wa_uuid(text);
do $wa$
begin
  if to_regclass('{schema}.aluno_dia_itens') is not null then
    execute 'drop function if exists {schema}.wa_dia_item_json({schema}.aluno_dia_itens)';
  end if;
end
$wa$;

-- 3. as tabelas (as filhas primeiro): vazia → drop; com linha → guardada como <nome>_reversa_wa3
do $wa$
declare
  v_t text;
  v_oid regclass;
  v_n bigint;
  v_i text;
  v_p text;
begin
  foreach v_t in array array['aluno_dia_itens', 'aluno_receita_itens', 'aluno_dia_refeicoes', 'aluno_receitas', 'aluno_alimentos'] loop
    v_oid := to_regclass('{schema}.' || v_t);
    continue when v_oid is null;
    for v_p in select p.polname from pg_catalog.pg_policy p where p.polrelid = v_oid loop
      execute format('drop policy %I on {schema}.%I', v_p, v_t);
    end loop;
    execute format('select count(*) from {schema}.%I', v_t) into v_n;
    if v_n = 0 then
      execute format('drop table {schema}.%I cascade', v_t);
    else
      for v_i in select c.relname from pg_catalog.pg_index x join pg_catalog.pg_class c on c.oid = x.indexrelid where x.indrelid = v_oid loop
        execute format('alter index {schema}.%I rename to %I', v_i, left(v_i, 50) || '_rev_wa3');
      end loop;
      execute format('alter table {schema}.%I rename to %I', v_t, v_t || '_reversa_wa3');
      execute format('revoke all on table {schema}.%I from public, anon, authenticated', v_t || '_reversa_wa3');
      raise notice 'reversa wa3: {schema}.% guardada como %_reversa_wa3 (% linhas)', v_t, v_t, v_n;
    end if;
  end loop;
end
$wa$;

-- 4. conferência
do $wa$
declare
  r record;
begin
  select md5(p.prosrc) as m into r from pg_catalog.pg_proc p where p.oid = '{schema}.exportar_dados_aluno(uuid)'::regprocedure;
  if r.m is distinct from (case when '{schema}' = 'staging' then '4dd161d50abfce46f353b133673b591e' else 'ea724ab45105ff110ce819d48c321083' end) then
    raise exception 'reversa wa3: {schema}.exportar_dados_aluno não voltou ao corpo de antes';
  end if;
  if '{schema}' = 'staging' then
    if (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'staging.excluir_dados_aluno(uuid, boolean)'::regprocedure)
         is distinct from '8f3fe5b3028f18907afb4908befcdb3f'
       or (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'staging.excluir_conta_profissional(uuid, boolean)'::regprocedure)
         is distinct from 'cf5a7246238a554c1831697d9301d654' then
      raise exception 'reversa wa3: as exclusões do staging não voltaram ao corpo de antes';
    end if;
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where n.nspname = '{schema}' and p.proname in ('meu_dia', 'dia_adicionar', 'dia_tirar', 'dia_desfazer', 'dia_extra_salvar',
                'dia_extra_excluir', 'dia_extra_marcar', 'meus_alimentos', 'meu_alimento_salvar', 'meu_alimento_excluir',
                'minha_receita_salvar', 'minha_receita_excluir', 'buscar_alimentos_do_aluno', 'dia_do_aluno', 'wa_dados_do_aluno',
                'wa_dieta_liberada_alguma', 'wa_macros_da_receita', 'wa_alimento_visivel', 'wa_refeicao_do_dia', 'wa_plano_ativo',
                'wa_matriculas_dieta', 'wa_texto', 'wa_numero', 'wa_uuid', 'wa_dia_item_json')) then
    raise exception 'reversa wa3: sobrou função da wa3 em {schema}';
  end if;
  if to_regclass('{schema}.aluno_alimentos') is not null or to_regclass('{schema}.aluno_receitas') is not null
     or to_regclass('{schema}.aluno_receita_itens') is not null or to_regclass('{schema}.aluno_dia_refeicoes') is not null
     or to_regclass('{schema}.aluno_dia_itens') is not null then
    raise exception 'reversa wa3: sobrou tabela da wa3 com o nome de uso em {schema}';
  end if;
end
$wa$;

-- @@ compartilhado
-- PRODUÇÃO (roda 1x, ANTES do --so public): as 2 exclusões do public voltam ao corpo de antes
-- >>> LGPD compartilhado
-- corpos de ANTES, gerados por gerar_lgpd_wa3.py a partir do corpo VIVO (12/10/2026, md5 conferido) — não editar à mão
CREATE OR REPLACE FUNCTION public.excluir_dados_aluno(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff text;
  v_ids uuid[];
  v_arquivos jsonb;
  v_apaga jsonb;
  v_mantem jsonb;
  v_whats integer;
begin
  if p_uid is null then
    raise exception 'excluir_dados_aluno: p_uid obrigatório';
  end if;
  -- quem é profissional não exclui pelo app do aluno (a conta dele sustenta alunos e equipe — nunca deixar conta órfã)
  select case
      when exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin')) then 'master'
      when exists (select 1 from public.profiles p where p.id = p_uid and p.role in ('master', 'nutricionista')) then 'perfil_profissional'
      when exists (select 1 from public.contas c where c.dono_id = p_uid) then 'dono'
      when exists (select 1 from public.conta_membros m where m.user_id = p_uid and m.status <> 'removido') then 'membro'
    end into v_staff;
  if v_staff is not null then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', v_staff);
  end if;

  -- TODAS as matrículas do login (inclusive as da lixeira): o login some, nenhuma pode ficar apontando para ele
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from public.pacientes p where p.user_id = p_uid;

  if exists (select 1 from public.aluno_assinaturas a where a.paciente_id = any(v_ids) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
    from public.diario_alimentar d where d.paciente_id = any(v_ids) and nullif(d.path, '') is not null;
  select count(*) into v_whats from public.mensagens_whatsapp m where m.paciente_id = any(v_ids) and m.status = 'pendente';

  v_apaga := jsonb_build_object(
    'diario_alimentar', (select count(*) from public.diario_alimentar d where d.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select count(*) from public.refeicoes_concluidas r where r.paciente_id = any(v_ids)),
    'metas_concluidas', (select count(*) from public.metas_concluidas r where r.paciente_id = any(v_ids)),
    'avisos', (select count(*) from public.avisos a where a.destino_user_id = p_uid),
    'perfil', (select count(*) from public.profiles p where p.id = p_uid),
    'whatsapp_pendentes_cancelados', v_whats);
  v_mantem := jsonb_build_object(
    'matriculas', coalesce(array_length(v_ids, 1), 0),
    'agendamentos', (select count(*) from public.agendamentos a where a.paciente_id = any(v_ids)),
    'cobrancas', (select count(*) from public.cobrancas c where c.paciente_id = any(v_ids)),
    'recibos', (select count(*) from public.recibos r where r.paciente_id = any(v_ids)),
    'antropometrias', (select count(*) from public.antropometrias a where a.paciente_id = any(v_ids)),
    'planos_alimentares', (select count(*) from public.planos_alimentares a where a.paciente_id = any(v_ids)),
    'prontuario', (select count(*) from public.registros_prontuario a where a.paciente_id = any(v_ids)));

  if not coalesce(p_simular, true) then
    delete from public.diario_alimentar where paciente_id = any(v_ids);
    delete from public.refeicoes_concluidas where paciente_id = any(v_ids);
    delete from public.metas_concluidas where paciente_id = any(v_ids);
    update public.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
     where paciente_id = any(v_ids) and status = 'pendente';
    update public.pacientes
       set ativo = false,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = any(v_ids);
    -- o gatilho do espelho enfileirou esta pessoa (ativo mudou), mas o login vai sumir: o Treino já foi tratado pela borda
    delete from public.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'matriculas', to_jsonb(v_ids),
    'apaga', v_apaga, 'mantem', v_mantem, 'arquivos', v_arquivos);
end;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_conta_profissional(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_simular boolean := coalesce(p_simular, true);
  v_contas_dono uuid[];
  v_c record;
  v_m record;
  v_nome text;
  v_perfil text;
  v_ids_aluno uuid[];
  v_aluno jsonb := null;
  v_arquivos jsonb := '[]'::jsonb;
  v_whats integer := 0;
  v_dono jsonb := '[]'::jsonb;
  v_equipes jsonb := '[]'::jsonb;
  v_ex_equipes integer := 0;
  v_sem_conta jsonb := null;
  v_eu_nutri boolean;
  v_alunos jsonb;
  v_resumo_alunos jsonb;
  v_membros jsonb;
  v_cobrancas jsonb;
  v_pront jsonb;
  v_convites integer;
  v_lixeira integer;
  v_removidos integer;
  v_revogados integer;
  v_chaves integer;
  v_whats_conta integer;
  v_treino integer;
  v_nutri integer;
  v_feito jsonb;
  v_email_login text;
  v_perfis jsonb := '[]'::jsonb;
begin
  if p_uid is null then
    raise exception 'excluir_conta_profissional: p_uid obrigatório';
  end if;

  -- o master nunca exclui por aqui (a conta do app — origem 'app' — é dele e nunca é afetada)
  if exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin'))
     or exists (select 1 from public.profiles p where p.id = p_uid and p.role = 'master') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
  end if;

  -- contas de que é dono: a linha da conta (dono_id — continua apontando para ele depois de excluir: o pedido de novo acha) ou o
  -- papel 'dono' numa equipe ainda ativa
  select coalesce(array_agg(distinct c.id), array[]::uuid[]) into v_contas_dono
    from public.contas c
   where c.dono_id = p_uid
      or exists (select 1 from public.conta_membros m
                  where m.conta_id = c.id and m.user_id = p_uid and m.status <> 'removido' and 'dono' = any(m.papeis));
  if exists (select 1 from public.contas c where c.id = any(v_contas_dono) and c.origem = 'app') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'conta_do_app');
  end if;
  if exists (select 1 from public.contas c where c.id = any(v_contas_dono) and c.cobranca_legada) then
    return jsonb_build_object('ok', false, 'erro', 'conta_legada');
  end if;

  -- é (ou já foi) profissional? Sem conta, sem equipe (nem passada) e sem o perfil de nutricionista do site antigo = só aluno: o
  -- caminho é o de sempre (excluir_dados_aluno — a borda sem o campo novo)
  if coalesce(array_length(v_contas_dono, 1), 0) = 0
     and not exists (select 1 from public.conta_membros m where m.user_id = p_uid)
     and not exists (select 1 from public.profiles p where p.id = p_uid and p.role = 'nutricionista') then
    return jsonb_build_object('ok', false, 'erro', 'nao_profissional');
  end if;

  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
         lower(u.email)
    into v_nome, v_email_login from auth.users u left join public.profiles pr on pr.id = u.id where u.id = p_uid;

  -- ---------- a parte de ALUNO (quem também é aluno em alguma conta — a mesma lista da excluir_dados_aluno, W7) ----------
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids_aluno from public.pacientes p where p.user_id = p_uid;
  if exists (select 1 from public.aluno_assinaturas a where a.paciente_id = any(v_ids_aluno) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;
  -- toda recusa vem ANTES de mudar qualquer coisa: a cobrança automática das contas dele (plano e alunos → ele) a borda cancela no
  -- Mercado Pago antes de pedir o "excluir"; sobrou alguma viva (o cancelamento falhou ou nasceu outra no meio) → nada muda
  if not v_simular and (
       exists (select 1 from public.conta_assinaturas a where a.conta_id = any(v_contas_dono) and a.status in ('authorized', 'pending', 'paused'))
    or exists (select 1 from public.aluno_assinaturas a
                where a.status in ('authorized', 'pending', 'paused')
                  and (a.conta_id = any(v_contas_dono)
                       or exists (select 1 from public.pacientes p where p.id = a.paciente_id and p.conta_id = any(v_contas_dono))))) then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_ativa');
  end if;
  if coalesce(array_length(v_ids_aluno, 1), 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
      from public.diario_alimentar d where d.paciente_id = any(v_ids_aluno) and nullif(d.path, '') is not null;
    select count(*) into v_whats from public.mensagens_whatsapp m where m.paciente_id = any(v_ids_aluno) and m.status = 'pendente';
    v_aluno := jsonb_build_object(
      'matriculas', coalesce(array_length(v_ids_aluno, 1), 0),
      'contas', (select coalesce(jsonb_agg(distinct c.nome), '[]'::jsonb) from public.pacientes p join public.contas c on c.id = p.conta_id
                  where p.id = any(v_ids_aluno) and c.origem <> 'app' and not (c.id = any(v_contas_dono))),
      'apaga', jsonb_build_object(
        'diario_alimentar', (select count(*) from public.diario_alimentar d where d.paciente_id = any(v_ids_aluno)),
        'refeicoes_concluidas', (select count(*) from public.refeicoes_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'metas_concluidas', (select count(*) from public.metas_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'whatsapp_pendentes_cancelados', v_whats),
      'mantem', jsonb_build_object(
        'agendamentos', (select count(*) from public.agendamentos a where a.paciente_id = any(v_ids_aluno)),
        'cobrancas', (select count(*) from public.cobrancas c where c.paciente_id = any(v_ids_aluno)),
        'recibos', (select count(*) from public.recibos r where r.paciente_id = any(v_ids_aluno)),
        'antropometrias', (select count(*) from public.antropometrias a where a.paciente_id = any(v_ids_aluno)),
        'planos_alimentares', (select count(*) from public.planos_alimentares a where a.paciente_id = any(v_ids_aluno)),
        'prontuario', (select count(*) from public.registros_prontuario a where a.paciente_id = any(v_ids_aluno))));
    if not v_simular then
      delete from public.diario_alimentar where paciente_id = any(v_ids_aluno);
      delete from public.refeicoes_concluidas where paciente_id = any(v_ids_aluno);
      delete from public.metas_concluidas where paciente_id = any(v_ids_aluno);
      update public.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
       where paciente_id = any(v_ids_aluno) and status = 'pendente';
      -- o login sai por soft delete (a linha do Auth fica): a matrícula fica desligada dele aqui, como o "set null" faria
      update public.pacientes
         set ativo = false, user_id = null,
             config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
       where id = any(v_ids_aluno);
    end if;
  end if;

  -- ---------- DONO: cada conta ----------
  for v_c in select c.* from public.contas c where c.id = any(v_contas_dono) order by c.criado_em loop
    v_eu_nutri := 'nutricao' = any(public.modulos_do_plano(v_c.plano))
      and exists (select 1 from public.conta_membros m where m.conta_id = v_c.id and m.user_id = p_uid and m.status = 'ativo'
                    and 'nutricionista' = any(m.papeis));
    -- os alunos (fora da lixeira) e para onde vão — a mesma regra do gatilho pacientes_app_assumir (W7b)
    select jsonb_build_object(
             'total', count(*),
             'para_o_app', count(*) filter (where x.destino = 'app'),
             'guardados', count(*) filter (where x.destino <> 'app'),
             'lista', coalesce((jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'destino', x.destino) order by x.nome)
                                 filter (where x.ordem <= 100)), '[]'::jsonb))
      into v_resumo_alunos
      from (select p.id, p.nome, row_number() over (order by p.nome) as ordem,
                   case when p.user_id is not null and p.user_id <> p_uid and p.ativo and v_c.origem in ('nova', 'legado_calc')
                          and not exists (select 1 from public.pacientes o where o.user_id = p.user_id and o.conta_id is distinct from v_c.id
                                            and o.deleted_at is null and o.ativo)
                          and not exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.role = 'master')
                        then 'app' else 'guardado' end as destino
              from public.pacientes p where p.conta_id = v_c.id and p.deleted_at is null) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', coalesce(public.nome_da_pessoa(m.user_id), m.email_convite), 'email', coalesce(u.email, m.email_convite),
             'papeis', to_jsonb(m.papeis), 'status', m.status) order by m.status, coalesce(public.nome_da_pessoa(m.user_id), m.email_convite)), '[]'::jsonb)
      into v_membros
      from public.conta_membros m left join auth.users u on u.id = m.user_id
     where m.conta_id = v_c.id and m.status in ('ativo', 'convidado') and m.user_id is distinct from p_uid;
    select count(*) into v_convites from public.convites cv where cv.conta_id = v_c.id and cv.status = 'pendente';
    v_cobrancas := jsonb_build_object(
      'plano', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mp_preapproval_id', a.mp_preapproval_id, 'status', a.status,
                                                              'simulada', coalesce(a.payload ->> 'simulada', '') = 'true')), '[]'::jsonb)
                  from public.conta_assinaturas a where a.conta_id = v_c.id and a.status in ('authorized', 'pending', 'paused')),
      'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'paciente_id', a.paciente_id, 'mp_preapproval_id', a.mp_preapproval_id,
                                                               'status', a.status)), '[]'::jsonb)
                   from public.aluno_assinaturas a
                  where a.status in ('authorized', 'pending', 'paused')
                    and (a.conta_id = v_c.id or exists (select 1 from public.pacientes p where p.id = a.paciente_id and p.conta_id = v_c.id))));
    -- os prontuários (todas as matrículas da conta, inclusive as da lixeira): o que o dono vê e o que é "Só nutricionistas"
    select coalesce(jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', v_c.id, 'nome', p.nome, 'registros', x.total,
                                                 'restritos', x.restritos) order by p.nome), '[]'::jsonb)
      into v_pront
      from public.pacientes p
      join lateral (select count(*) as total,
                           count(*) filter (where r.visibilidade = 'nutricionistas' and not v_eu_nutri) as restritos
                      from public.registros_prontuario r where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
     where p.conta_id = v_c.id;

    v_feito := null;
    if not v_simular then
      -- a) as matrículas para a lixeira, como no aluno_remover: o gatilho pacientes_app_assumir (W7b) leva quem tem login para o app
      update public.pacientes set deleted_at = now() where conta_id = v_c.id and deleted_at is null;
      get diagnostics v_lixeira = row_count;
      -- b) a equipe perde o acesso (sou_membro na hora; o Treino pelo espelho) e fica sabendo pelo sino, como no remover_membro
      select count(*) into v_removidos from public.conta_membros m
       where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is distinct from p_uid;
      insert into public.avisos (destino_user_id, tipo, titulo, link)
      select m.user_id, 'membro_removido', left('Você não faz mais parte da equipe de ' || v_c.nome || ' (a conta foi encerrada)', 160), null
        from public.conta_membros m where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is not null and m.user_id <> p_uid;
      update public.conta_membros
         set status = 'removido', removido_em = now(),
             removido_motivo = case when user_id = p_uid then 'conta_excluida' else removido_motivo end
       where conta_id = v_c.id and status <> 'removido';
      -- c) convites (aluno e membro) que ninguém aceitou não levam mais ninguém para a conta
      update public.convites set status = 'revogado' where conta_id = v_c.id and status = 'pendente';
      get diagnostics v_revogados = row_count;
      -- d) ninguém paga mais por Pix a uma conta encerrada; mensagens automáticas pendentes saem da fila
      update public.recebimento_chaves set ativa = false, atualizado_em = now() where conta_id = v_c.id and ativa;
      get diagnostics v_chaves = row_count;
      update public.mensagens_whatsapp set status = 'cancelada', erro = 'o profissional excluiu a conta', updated_at = now()
       where status = 'pendente' and (conta_id = v_c.id or nutricionista_id = p_uid);
      get diagnostics v_whats_conta = row_count;
      -- e) a conta fica (as matrículas da lixeira guardam o histórico), cancelada
      update public.contas set situacao = 'cancelada' where id = v_c.id and situacao <> 'cancelada';
      v_feito := jsonb_build_object('alunos_na_lixeira', v_lixeira, 'membros_removidos', v_removidos, 'convites_revogados', v_revogados,
                                    'chaves_pix_desligadas', v_chaves, 'whatsapp_cancelados', v_whats_conta);
      if v_c.situacao <> 'cancelada' or v_lixeira > 0 or v_removidos > 0 or v_revogados > 0 or v_chaves > 0 or v_whats_conta > 0 then
        insert into public.conta_eventos (conta_id, tipo, antes, depois, por)
        values (v_c.id, 'situacao', jsonb_build_object('situacao', v_c.situacao),
                jsonb_build_object('situacao', 'cancelada', 'acao', 'conta_excluida_pelo_dono', 'w2l', true,
                                   'alunos_para_o_app', v_resumo_alunos -> 'para_o_app') || v_feito, p_uid);
      end if;
    end if;

    v_dono := v_dono || jsonb_build_object(
      'id', v_c.id, 'nome', v_c.nome, 'origem', v_c.origem, 'plano', v_c.plano, 'situacao', v_c.situacao, 'eu_nutri', v_eu_nutri,
      'alunos', v_resumo_alunos, 'membros', v_membros, 'convites_pendentes', v_convites, 'cobrancas', v_cobrancas, 'prontuarios', v_pront,
      'feito', v_feito);
  end loop;

  -- ---------- pacientes sem conta do site antigo do Nutri (os da própria nutricionista — regra de hoje: nutricionista_id) ----------
  if exists (select 1 from public.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid) then
    select jsonb_build_object(
             'alunos', (select count(*) from public.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid and p.deleted_at is null),
             'prontuarios', coalesce((
               select jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', null, 'nome', p.nome, 'registros', x.total, 'restritos', 0)
                                order by p.nome)
                 from public.pacientes p
                 join lateral (select count(*) as total from public.registros_prontuario r
                                where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
                where p.conta_id is null and p.nutricionista_id = p_uid), '[]'::jsonb))
      into v_sem_conta;
    if not v_simular then
      update public.pacientes set deleted_at = now() where conta_id is null and nutricionista_id = p_uid and deleted_at is null;
    end if;
  end if;

  -- ---------- MEMBRO (não dono): sai da equipe como no remover_membro, sem novo responsável ----------
  for v_m in select m.*, c.nome as conta_nome, c.dono_id
               from public.conta_membros m join public.contas c on c.id = m.conta_id
              where m.user_id = p_uid and m.status <> 'removido' and not (m.conta_id = any(v_contas_dono))
              order by m.criado_em loop
    select count(*) filter (where p.personal_id = p_uid), count(*) filter (where p.nutricionista_id = p_uid)
      into v_treino, v_nutri
      from public.pacientes p where p.conta_id = v_m.conta_id and p.deleted_at is null;
    if not v_simular then
      update public.pacientes set personal_id = null where conta_id = v_m.conta_id and personal_id = p_uid;
      update public.pacientes set nutricionista_id = null where conta_id = v_m.conta_id and nutricionista_id = p_uid;
      update public.convites set status = 'revogado'
       where conta_id = v_m.conta_id and tipo = 'aluno' and status = 'pendente' and responsavel_id = p_uid;
      get diagnostics v_revogados = row_count;
      update public.conta_membros set status = 'removido', removido_em = now(), removido_motivo = 'conta_excluida' where id = v_m.id;
      insert into public.conta_eventos (conta_id, tipo, antes, depois, por)
      values (v_m.conta_id, 'membro', jsonb_build_object('membro_id', v_m.id, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
              jsonb_build_object('acao', 'saiu_excluiu_a_conta', 'w2l', true, 'membro_id', v_m.id, 'user_id', p_uid, 'alunos_treino', v_treino,
                                 'alunos_nutricao', v_nutri, 'convites_de_aluno_revogados', v_revogados), p_uid);
      if v_m.dono_id is not null and v_m.dono_id <> p_uid then
        insert into public.avisos (destino_user_id, tipo, titulo, link)
        values (v_m.dono_id, 'geral', left(coalesce(v_nome, 'Um profissional') || ' excluiu a conta e saiu da equipe'
                  || case when v_treino + v_nutri > 0 then ' · ' || (v_treino + v_nutri) || ' aluno(s) sem responsável' else '' end, 160),
                '/painel/alunos');
      end if;
    end if;
    v_equipes := v_equipes || jsonb_build_object('conta_id', v_m.conta_id, 'conta_nome', v_m.conta_nome,
      'dono_nome', public.nome_da_pessoa(v_m.dono_id), 'papeis', to_jsonb(v_m.papeis), 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri);
  end loop;
  select count(*) into v_ex_equipes from public.conta_membros m
   where m.user_id = p_uid and m.status = 'removido' and not (m.conta_id = any(v_contas_dono)) and m.removido_motivo is null;

  v_perfil := case when jsonb_array_length(v_dono) > 0 then 'dono'
                   when jsonb_array_length(v_equipes) > 0 then 'membro'
                   else 'ex_profissional' end;

  -- ---------- a pessoa (o login sai pela borda, por soft delete) ----------
  if not v_simular then
    -- o perfil: anônimo aqui e no ESPELHO (o gatilho handle_new_user cria o perfil nos 2 schemas). Fica o nome e o CRN/CREF só onde
    -- ele assina algo (w2l_limpar_perfil). No staging só conta de teste chega aqui (a borda recusa conta real) e, mesmo assim, o
    -- espelho em public só é limpo com e-mail de teste
    v_perfis := jsonb_build_array(public.w2l_limpar_perfil(p_uid, 'public'));
    if 'public' = 'public' then
      v_perfis := v_perfis || public.w2l_limpar_perfil(p_uid, 'staging');
    elsif public.email_de_teste(v_email_login) then
      v_perfis := v_perfis || public.w2l_limpar_perfil(p_uid, 'public');
    end if;
    delete from public.avisos where destino_user_id = p_uid;
    delete from public.push_aparelhos where user_id = p_uid;
    update public.whatsapp_instancias
       set status = 'desconectado', qr_code = null, numero_conectado = null, erro = 'conta excluída', updated_at = now()
     where nutricionista_id = p_uid and status <> 'desconectado';
    -- os gatilhos do espelho enfileiraram esta pessoa, mas o login vai sair: o Treino dela é tratado pela borda (delete-my-account).
    -- Os alunos e a equipe seguem na fila (a borda dispara o espelho logo depois).
    delete from public.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object(
    'ok', true, 'simulacao', v_simular, 'perfil', v_perfil, 'nome', v_nome,
    'contas_dono', v_dono, 'equipes', v_equipes, 'ex_equipes', v_ex_equipes, 'sem_conta', v_sem_conta,
    'aluno', v_aluno, 'arquivos', v_arquivos, 'perfis', v_perfis);
end;
$function$;

-- <<< LGPD compartilhado
do $wa$
begin
  if (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'public.excluir_dados_aluno(uuid, boolean)'::regprocedure)
       is distinct from 'd42e0be27ad6da09c4819da90beafd74'
     or (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'public.excluir_conta_profissional(uuid, boolean)'::regprocedure)
       is distinct from 'a3304def2b8c95bac6a32773fba47cb5' then
    raise exception 'reversa wa3: as exclusões do public não voltaram ao corpo de antes';
  end if;
end
$wa$;
