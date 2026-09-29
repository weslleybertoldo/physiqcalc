-- Physiq W7 — App do aluno: Perfil (tela 5) + falha F4 (Exportar e Excluir para qualquer aluno — C88, R11, P19). Idempotente.
-- SÓ ACRESCENTA funções (nenhuma tabela, coluna ou política muda; nenhum dado muda ao aplicar):
--   · meu_perfil_aluno()          o card do aluno ("Aluno desde…", objetivo, foto) e "Meus profissionais" (nome, papel, foto,
--                                 WhatsApp — P24) — só as matrículas do próprio usuário (authenticated);
--   · minha_agenda(p_desde)       a agenda do aluno (N-53: próximas + as dos últimos 3 meses), de TODAS as matrículas dele (P7),
--                                 sem a observação interna do profissional (authenticated);
--   · exportar_dados_aluno(uid)   os dados do usuário neste banco, em JSON (SÓ service_role — a função exportar-meus-dados
--                                 chama com o id do JWT; o aluno nunca escolhe o id);
--   · excluir_dados_aluno(uid, simular)  a parte do banco principal da exclusão (SÓ service_role — excluir-minha-conta);
--   · previa_vinculo_por_codigo(uid, código)  o popup "confirmar o profissional" antes do vínculo (SÓ service_role — vincular-aluno).
--
-- P19 (Excluir minha conta) neste banco — decidido tabela por tabela com a spec §8.1:
--   APAGA (o login e o que o aluno enviou): auth.users (a função da borda, depois desta) → em cascata profiles e avisos da
--     pessoa; diario_alimentar (fotos e comentários do diário — os arquivos do bucket "diario" saem pela função da borda);
--     refeicoes_concluidas e metas_concluidas (os ✓ marcados pelo aluno); a foto do Perfil (bucket fotos-perfil, pasta da pessoa).
--   FICA COM O PROFISSIONAL, DESLIGADO DO LOGIN: a matrícula (pacientes: user_id vira NULL pela FK "on delete set null";
--     ativo = false e config.conta_excluida_em — para de contar no plano, de receber WhatsApp automático e de ser cobrada) e tudo
--     que pende dela (agenda, consultas, prontuário, anamneses, avaliações, planos, orientações, metas, exames, documentos,
--     cobranças com os comprovantes, recibos, lançamentos, anexos, pré-consulta); as mensagens de WhatsApp ainda pendentes
--     para o aluno são canceladas.
--   RECUSA: quem é profissional (master, dono ou membro de equipe, perfil de nutricionista) — a exclusão não é pelo app do aluno;
--     cobrança automática no cartão ligada (o aluno cancela em Perfil › Pagamentos antes).
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929170000_w07_perfil.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929170000_w07_perfil.sql --so public

-- ============================================================================================================
-- 1. Perfil do aluno: card e "Meus profissionais"
-- ============================================================================================================
create or replace function {schema}.meu_perfil_aluno() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_dados jsonb;
  v_meta jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  select p.nome, coalesce(p.dados_profissionais, '{}'::jsonb) into v_nome, v_dados from {schema}.profiles p where p.id = v_uid;
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta from auth.users u where u.id = v_uid;
  return jsonb_build_object(
    'nome', coalesce(nullif(btrim(v_nome), ''), v_meta ->> 'full_name', v_meta ->> 'name'),
    'foto_propria', nullif(btrim(coalesce(v_dados ->> 'foto_url', '')), ''),
    'foto_url', coalesce(nullif(btrim(coalesce(v_dados ->> 'foto_url', '')), ''), v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    'aluno_desde', (select min(p.created_at) from {schema}.pacientes p where p.user_id = v_uid and p.deleted_at is null),
    'objetivo', (select btrim(p.objetivo) from {schema}.pacientes p
                  where p.user_id = v_uid and p.deleted_at is null and nullif(btrim(coalesce(p.objetivo, '')), '') is not null
                  order by p.ativo desc, p.created_at limit 1),
    -- os responsáveis das matrículas (a mesma regra de módulos da minha_situacao: personal numa conta com Treino, nutricionista
    -- numa conta com Nutrição ou no site antigo sem conta); cada pessoa uma vez por papel
    'profissionais', coalesce((
      select jsonb_agg(x.j order by x.ordem, x.nome)
        from (
          select distinct on (r.prof_id, r.papel) r.ordem, coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1)) as nome,
            jsonb_build_object(
              'id', r.prof_id,
              'papel', r.papel,
              'nome', coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1)),
              'foto_url', coalesce(nullif(btrim(coalesce(pr.dados_profissionais ->> 'foto_url', '')), ''),
                                   u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
              'whatsapp', nullif(btrim(coalesce(pr.dados_profissionais ->> 'whatsapp_e164', '')), ''),
              'conta_nome', r.conta_nome) as j
            from (
              select p.personal_id as prof_id, 'personal'::text as papel, 1 as ordem, c.nome as conta_nome, p.created_at
                from {schema}.pacientes p join {schema}.contas c on c.id = p.conta_id
               where p.user_id = v_uid and p.deleted_at is null and p.personal_id is not null
                 and 'treino' = any({schema}.modulos_do_plano(c.plano))
              union all
              select p.nutricionista_id, 'nutricionista'::text, 2, c.nome, p.created_at
                from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
               where p.user_id = v_uid and p.deleted_at is null and p.nutricionista_id is not null
                 and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano)))
            ) r
            join {schema}.profiles pr on pr.id = r.prof_id
            left join auth.users u on u.id = r.prof_id
           order by r.prof_id, r.papel, r.created_at
        ) x), '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.meu_perfil_aluno() from public, anon;
grant execute on function {schema}.meu_perfil_aluno() to authenticated, service_role;

-- ============================================================================================================
-- 2. Agenda do aluno (N-53: próximas + as dos últimos 3 meses; não confirma nem desmarca)
-- ============================================================================================================
create or replace function {schema}.minha_agenda(p_desde timestamptz default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'paciente_id', a.paciente_id, 'titulo', a.titulo, 'inicio', a.inicio, 'fim', a.fim,
           'dia_inteiro', a.dia_inteiro, 'status', a.status, 'modulo', a.modulo,
           'profissional', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                              from {schema}.profiles pr where pr.id = a.nutricionista_id),
           'papel', case when a.nutricionista_id = p.personal_id then 'personal'
                         when a.nutricionista_id = p.nutricionista_id then 'nutricionista' end)
         order by a.inicio), '[]'::jsonb)
    from {schema}.agendamentos a
    join {schema}.pacientes p on p.id = a.paciente_id
   where auth.uid() is not null
     and p.user_id = auth.uid() and p.deleted_at is null and a.deleted_at is null
     and a.inicio >= greatest(coalesce(p_desde, now() - interval '90 days'), now() - interval '400 days');
$$;
revoke execute on function {schema}.minha_agenda(timestamptz) from public, anon;
grant execute on function {schema}.minha_agenda(timestamptz) to authenticated, service_role;

-- ============================================================================================================
-- 3. Exportar meus dados (C88, R11 — LGPD art. 18): o que é do usuário neste banco
--    Fora do arquivo: as anotações internas do profissional (prontuário e o resumo privado da matrícula), a contabilidade dele
--    (lançamentos) e códigos que dão acesso (link do diário, Pix copia e cola, payload do Mercado Pago). Fotos e anexos vão
--    como referência (nome, data, tamanho), não o arquivo.
-- ============================================================================================================
create or replace function {schema}.exportar_dados_aluno(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
$$;
revoke execute on function {schema}.exportar_dados_aluno(uuid) from public, anon, authenticated;
grant execute on function {schema}.exportar_dados_aluno(uuid) to service_role;

-- ============================================================================================================
-- 4. Excluir minha conta (P19) — a parte do banco principal (a borda apaga os arquivos e, por último, o login)
-- ============================================================================================================
create or replace function {schema}.excluir_dados_aluno(p_uid uuid, p_simular boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
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
      when exists (select 1 from {schema}.profiles p where p.id = p_uid and p.role in ('master', 'nutricionista')) then 'perfil_profissional'
      when exists (select 1 from {schema}.contas c where c.dono_id = p_uid) then 'dono'
      when exists (select 1 from {schema}.conta_membros m where m.user_id = p_uid and m.status <> 'removido') then 'membro'
    end into v_staff;
  if v_staff is not null then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', v_staff);
  end if;

  -- TODAS as matrículas do login (inclusive as da lixeira): o login some, nenhuma pode ficar apontando para ele
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from {schema}.pacientes p where p.user_id = p_uid;

  if exists (select 1 from {schema}.aluno_assinaturas a where a.paciente_id = any(v_ids) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
    from {schema}.diario_alimentar d where d.paciente_id = any(v_ids) and nullif(d.path, '') is not null;
  select count(*) into v_whats from {schema}.mensagens_whatsapp m where m.paciente_id = any(v_ids) and m.status = 'pendente';

  v_apaga := jsonb_build_object(
    'diario_alimentar', (select count(*) from {schema}.diario_alimentar d where d.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select count(*) from {schema}.refeicoes_concluidas r where r.paciente_id = any(v_ids)),
    'metas_concluidas', (select count(*) from {schema}.metas_concluidas r where r.paciente_id = any(v_ids)),
    'avisos', (select count(*) from {schema}.avisos a where a.destino_user_id = p_uid),
    'perfil', (select count(*) from {schema}.profiles p where p.id = p_uid),
    'whatsapp_pendentes_cancelados', v_whats);
  v_mantem := jsonb_build_object(
    'matriculas', coalesce(array_length(v_ids, 1), 0),
    'agendamentos', (select count(*) from {schema}.agendamentos a where a.paciente_id = any(v_ids)),
    'cobrancas', (select count(*) from {schema}.cobrancas c where c.paciente_id = any(v_ids)),
    'recibos', (select count(*) from {schema}.recibos r where r.paciente_id = any(v_ids)),
    'antropometrias', (select count(*) from {schema}.antropometrias a where a.paciente_id = any(v_ids)),
    'planos_alimentares', (select count(*) from {schema}.planos_alimentares a where a.paciente_id = any(v_ids)),
    'prontuario', (select count(*) from {schema}.registros_prontuario a where a.paciente_id = any(v_ids)));

  if not coalesce(p_simular, true) then
    delete from {schema}.diario_alimentar where paciente_id = any(v_ids);
    delete from {schema}.refeicoes_concluidas where paciente_id = any(v_ids);
    delete from {schema}.metas_concluidas where paciente_id = any(v_ids);
    update {schema}.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
     where paciente_id = any(v_ids) and status = 'pendente';
    update {schema}.pacientes
       set ativo = false,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = any(v_ids);
    -- o gatilho do espelho enfileirou esta pessoa (ativo mudou), mas o login vai sumir: o Treino já foi tratado pela borda
    delete from {schema}.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'matriculas', to_jsonb(v_ids),
    'apaga', v_apaga, 'mantem', v_mantem, 'arquivos', v_arquivos);
end;
$$;
revoke execute on function {schema}.excluir_dados_aluno(uuid, boolean) from public, anon, authenticated;
grant execute on function {schema}.excluir_dados_aluno(uuid, boolean) to service_role;

-- ============================================================================================================
-- 5. Prévia do vínculo pelo código do profissional (pedido dele, 29/09 ~18:00): ANTES de vincular, o popup mostra o nome, a
--    foto e o tipo do profissional (Nutricionista · Personal trainer (Ed. Física) · Acadêmico de Nutrição · Outra área) e o que
--    vai acontecer — a MESMA regra de hoje (vincular_aluno_por_codigo: P7, limite da faixa, próprio código…), rodada numa
--    subtransação que é desfeita em seguida (nada fica gravado). Só o que o aluno pode ver: nada de e-mail, telefone ou ids.
--    SÓ service_role (a função vincular-aluno chama com o id do JWT e limita as tentativas).
-- ============================================================================================================
create or replace function {schema}.previa_vinculo_por_codigo(p_user uuid, p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_res jsonb;
  v_prof jsonb;
begin
  if p_user is null or v_codigo = '' or length(v_codigo) > 60 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido');
  end if;
  select jsonb_build_object(
      'nome', coalesce(nullif(btrim(pr.nome), ''), u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
      'foto_url', coalesce(nullif(btrim(coalesce(pr.dados_profissionais ->> 'foto_url', '')), ''),
                           u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
      'tipo_perfil', pr.tipo_perfil,
      'papeis', to_jsonb(array(select x from unnest(m.papeis) x where x in ('personal', 'nutricionista'))))
    into v_prof
    from {schema}.conta_membros m
    left join {schema}.profiles pr on pr.id = m.user_id
    left join auth.users u on u.id = m.user_id
   where upper(m.codigo_convite) = v_codigo and m.user_id is not null
   order by (m.status = 'ativo') desc
   limit 1;
  if v_prof is null then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido');
  end if;
  begin
    v_res := {schema}.vincular_aluno_por_codigo(p_user, v_codigo);
    raise exception using errcode = 'PW707', message = 'previa do vinculo (desfeita)';
  exception when sqlstate 'PW707' then
    null; -- tudo o que a vinculação gravou volta; o resultado (v_res) fica
  end;
  return jsonb_build_object(
    'ok', coalesce((v_res ->> 'ok')::boolean, false),
    'erro', v_res ->> 'erro',
    'ja_era', coalesce((v_res ->> 'ja_era')::boolean, false),
    'conta_nome', v_res ->> 'conta_nome',
    'modulos', coalesce(v_res -> 'modulos', '[]'::jsonb),
    'profissional', v_prof);
end;
$$;
revoke execute on function {schema}.previa_vinculo_por_codigo(uuid, text) from public, anon, authenticated;
grant execute on function {schema}.previa_vinculo_por_codigo(uuid, text) to service_role;
