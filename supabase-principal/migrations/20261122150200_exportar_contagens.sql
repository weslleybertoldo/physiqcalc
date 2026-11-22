-- Physiq bcode-0021, item 7 (só o código; decisão do dono 22/11/2026): o «Exportar meus dados» traz a contagem de senhas erradas do login
-- (login_bloqueios, W8b) — só a linha do e-mail do login da pessoa. Banco principal, staging + public. Idempotente. Troca 1 função:
-- {schema}.exportar_dados_aluno(uuid) (o resto da exportação, os grants e quem chama ficam iguais).
--   A GUARDA (molde: reversas/20261012220000_wa3_dieta_livre_reversa.sql:557-559): o md5 do corpo vivo tem de ser o da wa3
--   (20261012220000_wa3_dieta_livre.sql:970-1071, com o schema no lugar do marcador) ou o deste arquivo (já aplicado). Outro corpo → para
--   e nada muda: alguém trocou a função fora do repo (conferir o corpo vivo antes de seguir).
--   O corpo: o da wa3 sem mudança + o bloco "bcode-0021 (item 7)" entre os acessos (wa3:1062) e os aceites (wa3:1064). Pessoa sem linha
--   (ou sem login) → "login_bloqueios": [].
-- Aplicar junto ou depois do item 1 (20261122150000): sem o prazo, a exportação levaria contagens de meses.
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261122150200_exportar_contagens.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261122150200_exportar_contagens.sql --so staging
--   com o OK dele: … --so public. NUNCA sem --so.
-- Reversa: supabase-principal/reversas/20261122150200_exportar_contagens_reversa.sql
select set_config('lock_timeout', '5s', true);

-- 1. a guarda: o corpo vivo é o da wa3 ou o deste arquivo
do $c$
declare
  v_md5 text;
begin
  select md5(p.prosrc) into v_md5 from pg_catalog.pg_proc p where p.oid = to_regprocedure('{schema}.exportar_dados_aluno(uuid)');
  if v_md5 is null or v_md5 <> all (case when '{schema}' = 'staging' then array['db23fd0f6f870c2711cf427ccd469d0d', 'c09e7327d89df2dca860d70430b94cfd']
                                                                     else array['4f04f467788c726246ac0dd662a30548', '66da8567c0c0ce9e68918edad1dc46a1'] end) then
    raise exception 'bcode-0021: {schema}.exportar_dados_aluno não é o corpo da wa3 nem o deste arquivo (md5 %): nada mudou', coalesce(v_md5, 'sem a função');
  end if;
end $c$;

-- 2. o corpo: o da wa3 + o bloco do item 7
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

  -- W-A (12/10/2026): as rotinas e a dieta livre do aluno — TODAS as linhas dele (com as arquivadas, as apagadas e o histórico; sem
  -- o id de quem mudou, o molde do 'aceites' sem registrado_por) — e os acessos das matrículas dele
  v_tabelas := v_tabelas || jsonb_build_object(
    'rotinas', (select coalesce(jsonb_agg(to_jsonb(t) - array['criada_por', 'alterada_por', 'arquivada_por'] order by t.criada_em), '[]') from {schema}.rotinas t where t.dono_user_id = p_uid),
    'rotinas_feitas', (select coalesce(jsonb_agg(to_jsonb(f) order by f.dia, f.feita_em), '[]') from {schema}.rotinas_feitas f join {schema}.rotinas t on t.id = f.rotina_id where t.dono_user_id = p_uid),
    'rotinas_historico', (select coalesce(jsonb_agg(to_jsonb(h) - 'por' order by h.em), '[]') from {schema}.rotinas_historico h join {schema}.rotinas t on t.id = h.rotina_id where t.dono_user_id = p_uid),
    'aluno_alimentos', (select coalesce(jsonb_agg(to_jsonb(t) - 'busca' order by t.criado_em), '[]') from {schema}.aluno_alimentos t where t.dono_user_id = p_uid),
    'aluno_receitas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em), '[]') from {schema}.aluno_receitas t where t.dono_user_id = p_uid),
    'aluno_receita_itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.receita_id, i.ordem), '[]') from {schema}.aluno_receita_itens i join {schema}.aluno_receitas t on t.id = i.receita_id where t.dono_user_id = p_uid),
    'aluno_dia_refeicoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.dia, t.criado_em), '[]') from {schema}.aluno_dia_refeicoes t where t.dono_user_id = p_uid),
    'aluno_dia_itens', (select coalesce(jsonb_agg(to_jsonb(t) order by t.dia, t.criado_em), '[]') from {schema}.aluno_dia_itens t where t.dono_user_id = p_uid),
    'aluno_acessos', (select coalesce(jsonb_agg(to_jsonb(a) - 'alterado_por' order by a.paciente_id, a.chave), '[]') from {schema}.aluno_acessos a where a.paciente_id = any(v_ids)));

  -- bcode-0021 (item 7): a contagem de senhas erradas do login (login_bloqueios, W8b), só a linha do e-mail do login da pessoa
  v_tabelas := v_tabelas || jsonb_build_object(
    'login_bloqueios', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from {schema}.login_bloqueios b
                         where b.email = lower(btrim(coalesce(v_login ->> 'email', '')))));

  -- hml-12 (H-30): os aceites do titular e os do responsável pelas matrículas dele (sem quem registrou)
  select coalesce(jsonb_agg(to_jsonb(a) - 'registrado_por' order by a.em, a.id), '[]'::jsonb) into v_aceites
    from {schema}.aceites a where a.user_id = p_uid or a.paciente_id = any(v_ids);

  return jsonb_build_object('login', v_login, 'perfil', v_perfil, 'matriculas', v_matriculas, 'tabelas', v_tabelas,
                            'aceites', v_aceites);
end;
$function$;
revoke all on function {schema}.exportar_dados_aluno(uuid) from public, anon, authenticated;
grant execute on function {schema}.exportar_dados_aluno(uuid) to service_role;

-- 3. a conferência do fim (qualquer diferença desfaz o bloco inteiro do schema)
do $c$
declare
  r record;
begin
  select p.oid, md5(p.prosrc) as m, p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'] as definer_sp into r
    from pg_catalog.pg_proc p where p.oid = '{schema}.exportar_dados_aluno(uuid)'::regprocedure;
  if r.m is distinct from (case when '{schema}' = 'staging' then 'c09e7327d89df2dca860d70430b94cfd' else '66da8567c0c0ce9e68918edad1dc46a1' end) then
    raise exception 'bcode-0021: {schema}.exportar_dados_aluno não ficou com o corpo deste arquivo (md5 %)', r.m;
  end if;
  if not r.definer_sp then
    raise exception 'bcode-0021: {schema}.exportar_dados_aluno sem SECURITY DEFINER ou sem o search_path vazio';
  end if;
  if pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
    raise exception 'bcode-0021: {schema}.exportar_dados_aluno fora do esperado (só o servidor executa)';
  end if;
end $c$;
