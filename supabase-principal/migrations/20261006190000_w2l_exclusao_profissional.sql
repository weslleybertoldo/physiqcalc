-- Physiq W2 da loja (Google Play) — "Excluir minha conta" do PROFISSIONAL (dono, membro de equipe e quem já foi membro) no BANCO
-- PRINCIPAL. Idempotente. A Play exige excluir a conta dentro do app e por uma página web (/excluir-conta); até aqui só o aluno
-- excluía (excluir_dados_aluno, W7) e o profissional recebia 403 "profissional".
--
-- Decisão do Weslley (06/10/2026, "1"): antes o profissional baixa os prontuários (ZIP no aparelho — w2l_prontuarios_para_baixar);
-- o histórico fica com o aluno, EXATAMENTE como no aluno_remover (W13) + o gatilho pacientes_app_assumir (W7b): a matrícula vai
-- para a lixeira (nunca purgada — lixeira_purgar não apaga pacientes) e o aluno com login vira aluno do app com 7 dias grátis.
-- Base legal da guarda: Res. CFN 594/2017 art. 3º V–VI e Lei 13.787/2018 (20 anos).
--
-- Aplicar (SÓ staging nesta fase; produção é a fase seguinte, com backup — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261006190000_w2l_exclusao_profissional.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261006190000_w2l_exclusao_profissional.sql --so staging
-- Sem bloco compartilhado (nada em auth.users nem no Storage). Reversa: supabase-principal/reversas/20261006190000_w2l_exclusao_profissional_reversa.sql
--
-- O que entra:
--   1. conta_membros.removido_motivo + o CHECK × FK corrigido (bug "apagar login de membro falha": user_id "on delete set null" ×
--      check (user_id is not null or email_convite is not null)). O CHECK passa a aceitar user_id vazio SÓ na linha que a exclusão
--      de conta marcou (status 'removido' + removido_motivo 'conta_excluida'). Por que não "todo removido": ~50 tabelas têm
--      nutricionista_id → auth.users ON DELETE CASCADE (inclusive pacientes e registros_prontuario); com o CHECK aberto, o "Excluir"
--      ANTIGO do aluno (que apaga o login de verdade) passaria a apagar o login de um ex-membro e levaria junto, em cascata, tudo o que
--      ele registrou para os alunos da equipe. Hoje esse caso para no CHECK — e continua parando.
--   2. excluir_conta_profissional(uid, simular) — SÓ service_role (a borda excluir-minha-conta, com o id do JWT, no pedido do app novo
--      { fluxo: "profissional" }). simular = a conferência (contagens e listas; nada muda); senão exclui, idempotente:
--        · a parte de ALUNO de quem também é aluno (a mesma lista da excluir_dados_aluno, W7) — primeiro, para o gatilho do app não
--          matricular a própria pessoa no app;
--        · DONO, por conta: matrículas para a lixeira (o gatilho da W7b leva quem tem login para o app, 7 dias grátis + aviso), equipe
--          removida com aviso no sino (como o remover_membro), convites revogados, chave Pix desligada, WhatsApp pendente cancelado,
--          situação 'cancelada' — a linha da conta FICA (as matrículas da lixeira guardam o histórico);
--        · MEMBRO (não dono): sai da equipe como no remover_membro sem novo responsável — os alunos dele ficam "sem responsável" na
--          conta do dono, os registros dele ficam com a conta; o dono recebe aviso no sino;
--        · o cadastro da pessoa limpo (fica o nome e o registro profissional, que identificam o autor no prontuário), avisos e
--          aparelhos de push apagados, a conexão do WhatsApp desligada.
--      O login sai depois, pela borda, por SOFT DELETE (auth.admin.deleteUser(id, true)) — o hard delete apagaria em cascata as
--      matrículas e os prontuários (ver o item 1). A cobrança automática (plano e alunos → este profissional) é cancelada pela borda
--      ANTES; aqui o "excluir" recusa (cobranca_ativa) se ainda houver alguma viva.
--      Recusas: profissional/master (o master nunca exclui por aqui; a conta do app nunca é afetada) · nao_profissional (só aluno: o
--      caminho é o de sempre) · assinatura_ativa (a pessoa, como aluna, tem cobrança no cartão — cancela em Perfil › Pagamentos, a regra
--      da W7) · conta_legada (cobrança ainda no app antigo) · cobranca_ativa.
--   3. w2l_prontuarios_para_baixar(conta, pacientes) — authenticated, só o DONO (ou o master): as anotações do prontuário que ele vê
--      (a regra da aluno_anotacoes: "Equipe" + "Só nutricionistas" para quem vê o clínico), inclusive das matrículas da lixeira —
--      o app monta 1 PDF por paciente (prontuarioPdf.ts) e o ZIP. p_conta vazio = os pacientes sem conta do site antigo (da própria).
-- O que NÃO muda: excluir_dados_aluno, aluno_remover, remover_membro e o gatilho pacientes_app_assumir ficam como estão.

-- ============================================================================================================
-- 1. conta_membros: o marcador da exclusão e o CHECK × FK
-- ============================================================================================================
alter table {schema}.conta_membros add column if not exists removido_motivo text;
alter table {schema}.conta_membros drop constraint if exists conta_membros_removido_motivo_check;
alter table {schema}.conta_membros add constraint conta_membros_removido_motivo_check
  check (removido_motivo is null or removido_motivo in ('conta_excluida'));
alter table {schema}.conta_membros drop constraint if exists conta_membros_check;
alter table {schema}.conta_membros drop constraint if exists conta_membros_pessoa_ou_convite;
alter table {schema}.conta_membros add constraint conta_membros_pessoa_ou_convite
  check (user_id is not null or email_convite is not null or (status = 'removido' and removido_motivo = 'conta_excluida'));

-- a guarda da W2 + o marcador: pelo app (authenticated, fora do master) ninguém marca uma linha como "conta excluída"
create or replace function {schema}.conta_membros_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono muda papéis, situação e o e-mail do convite; quem é a pessoa (e o vínculo com o Treino) é do servidor
    new.id := old.id; new.conta_id := old.conta_id; new.user_id := old.user_id; new.treino_user_id := old.treino_user_id;
    new.codigo_convite := old.codigo_convite; new.criado_em := old.criado_em;
    -- W2 da loja: o marcador da exclusão de conta (o que deixa o login sair sem quebrar o CHECK) é só do servidor
    new.removido_motivo := old.removido_motivo;
  end if;
  return new;
end;
$$;

-- ============================================================================================================
-- 2. A exclusão do profissional (conferência e exclusão) — SÓ service_role
-- ============================================================================================================
create or replace function {schema}.excluir_conta_profissional(p_uid uuid, p_simular boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
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
begin
  if p_uid is null then
    raise exception 'excluir_conta_profissional: p_uid obrigatório';
  end if;

  -- o master nunca exclui por aqui (a conta do app — origem 'app' — é dele e nunca é afetada)
  if exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin'))
     or exists (select 1 from {schema}.profiles p where p.id = p_uid and p.role = 'master') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
  end if;

  -- contas de que é dono: a linha da conta (dono_id — continua apontando para ele depois de excluir: o pedido de novo acha) ou o
  -- papel 'dono' numa equipe ainda ativa
  select coalesce(array_agg(distinct c.id), array[]::uuid[]) into v_contas_dono
    from {schema}.contas c
   where c.dono_id = p_uid
      or exists (select 1 from {schema}.conta_membros m
                  where m.conta_id = c.id and m.user_id = p_uid and m.status <> 'removido' and 'dono' = any(m.papeis));
  if exists (select 1 from {schema}.contas c where c.id = any(v_contas_dono) and c.origem = 'app') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'conta_do_app');
  end if;
  if exists (select 1 from {schema}.contas c where c.id = any(v_contas_dono) and c.cobranca_legada) then
    return jsonb_build_object('ok', false, 'erro', 'conta_legada');
  end if;

  -- é (ou já foi) profissional? Sem conta, sem equipe (nem passada) e sem o perfil de nutricionista do site antigo = só aluno: o
  -- caminho é o de sempre (excluir_dados_aluno — a borda sem o campo novo)
  if coalesce(array_length(v_contas_dono, 1), 0) = 0
     and not exists (select 1 from {schema}.conta_membros m where m.user_id = p_uid)
     and not exists (select 1 from {schema}.profiles p where p.id = p_uid and p.role = 'nutricionista') then
    return jsonb_build_object('ok', false, 'erro', 'nao_profissional');
  end if;

  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1))
    into v_nome from auth.users u left join {schema}.profiles pr on pr.id = u.id where u.id = p_uid;

  -- ---------- a parte de ALUNO (quem também é aluno em alguma conta — a mesma lista da excluir_dados_aluno, W7) ----------
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids_aluno from {schema}.pacientes p where p.user_id = p_uid;
  if exists (select 1 from {schema}.aluno_assinaturas a where a.paciente_id = any(v_ids_aluno) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;
  -- toda recusa vem ANTES de mudar qualquer coisa: a cobrança automática das contas dele (plano e alunos → ele) a borda cancela no
  -- Mercado Pago antes de pedir o "excluir"; sobrou alguma viva (o cancelamento falhou ou nasceu outra no meio) → nada muda
  if not v_simular and (
       exists (select 1 from {schema}.conta_assinaturas a where a.conta_id = any(v_contas_dono) and a.status in ('authorized', 'pending', 'paused'))
    or exists (select 1 from {schema}.aluno_assinaturas a
                where a.status in ('authorized', 'pending', 'paused')
                  and (a.conta_id = any(v_contas_dono)
                       or exists (select 1 from {schema}.pacientes p where p.id = a.paciente_id and p.conta_id = any(v_contas_dono))))) then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_ativa');
  end if;
  if coalesce(array_length(v_ids_aluno, 1), 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
      from {schema}.diario_alimentar d where d.paciente_id = any(v_ids_aluno) and nullif(d.path, '') is not null;
    select count(*) into v_whats from {schema}.mensagens_whatsapp m where m.paciente_id = any(v_ids_aluno) and m.status = 'pendente';
    v_aluno := jsonb_build_object(
      'matriculas', coalesce(array_length(v_ids_aluno, 1), 0),
      'contas', (select coalesce(jsonb_agg(distinct c.nome), '[]'::jsonb) from {schema}.pacientes p join {schema}.contas c on c.id = p.conta_id
                  where p.id = any(v_ids_aluno) and c.origem <> 'app' and not (c.id = any(v_contas_dono))),
      'apaga', jsonb_build_object(
        'diario_alimentar', (select count(*) from {schema}.diario_alimentar d where d.paciente_id = any(v_ids_aluno)),
        'refeicoes_concluidas', (select count(*) from {schema}.refeicoes_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'metas_concluidas', (select count(*) from {schema}.metas_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'whatsapp_pendentes_cancelados', v_whats),
      'mantem', jsonb_build_object(
        'agendamentos', (select count(*) from {schema}.agendamentos a where a.paciente_id = any(v_ids_aluno)),
        'cobrancas', (select count(*) from {schema}.cobrancas c where c.paciente_id = any(v_ids_aluno)),
        'recibos', (select count(*) from {schema}.recibos r where r.paciente_id = any(v_ids_aluno)),
        'antropometrias', (select count(*) from {schema}.antropometrias a where a.paciente_id = any(v_ids_aluno)),
        'planos_alimentares', (select count(*) from {schema}.planos_alimentares a where a.paciente_id = any(v_ids_aluno)),
        'prontuario', (select count(*) from {schema}.registros_prontuario a where a.paciente_id = any(v_ids_aluno))));
    if not v_simular then
      delete from {schema}.diario_alimentar where paciente_id = any(v_ids_aluno);
      delete from {schema}.refeicoes_concluidas where paciente_id = any(v_ids_aluno);
      delete from {schema}.metas_concluidas where paciente_id = any(v_ids_aluno);
      update {schema}.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
       where paciente_id = any(v_ids_aluno) and status = 'pendente';
      -- o login sai por soft delete (a linha do Auth fica): a matrícula fica desligada dele aqui, como o "set null" faria
      update {schema}.pacientes
         set ativo = false, user_id = null,
             config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
       where id = any(v_ids_aluno);
    end if;
  end if;

  -- ---------- DONO: cada conta ----------
  for v_c in select c.* from {schema}.contas c where c.id = any(v_contas_dono) order by c.criado_em loop
    v_eu_nutri := 'nutricao' = any({schema}.modulos_do_plano(v_c.plano))
      and exists (select 1 from {schema}.conta_membros m where m.conta_id = v_c.id and m.user_id = p_uid and m.status = 'ativo'
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
                          and not exists (select 1 from {schema}.pacientes o where o.user_id = p.user_id and o.conta_id is distinct from v_c.id
                                            and o.deleted_at is null and o.ativo)
                          and not exists (select 1 from {schema}.profiles pr where pr.id = p.user_id and pr.role = 'master')
                        then 'app' else 'guardado' end as destino
              from {schema}.pacientes p where p.conta_id = v_c.id and p.deleted_at is null) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', coalesce({schema}.nome_da_pessoa(m.user_id), m.email_convite), 'email', coalesce(u.email, m.email_convite),
             'papeis', to_jsonb(m.papeis), 'status', m.status) order by m.status, coalesce({schema}.nome_da_pessoa(m.user_id), m.email_convite)), '[]'::jsonb)
      into v_membros
      from {schema}.conta_membros m left join auth.users u on u.id = m.user_id
     where m.conta_id = v_c.id and m.status in ('ativo', 'convidado') and m.user_id is distinct from p_uid;
    select count(*) into v_convites from {schema}.convites cv where cv.conta_id = v_c.id and cv.status = 'pendente';
    v_cobrancas := jsonb_build_object(
      'plano', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mp_preapproval_id', a.mp_preapproval_id, 'status', a.status,
                                                              'simulada', coalesce(a.payload ->> 'simulada', '') = 'true')), '[]'::jsonb)
                  from {schema}.conta_assinaturas a where a.conta_id = v_c.id and a.status in ('authorized', 'pending', 'paused')),
      'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'paciente_id', a.paciente_id, 'mp_preapproval_id', a.mp_preapproval_id,
                                                               'status', a.status)), '[]'::jsonb)
                   from {schema}.aluno_assinaturas a
                  where a.status in ('authorized', 'pending', 'paused')
                    and (a.conta_id = v_c.id or exists (select 1 from {schema}.pacientes p where p.id = a.paciente_id and p.conta_id = v_c.id))));
    -- os prontuários (todas as matrículas da conta, inclusive as da lixeira): o que o dono vê e o que é "Só nutricionistas"
    select coalesce(jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', v_c.id, 'nome', p.nome, 'registros', x.total,
                                                 'restritos', x.restritos) order by p.nome), '[]'::jsonb)
      into v_pront
      from {schema}.pacientes p
      join lateral (select count(*) as total,
                           count(*) filter (where r.visibilidade = 'nutricionistas' and not v_eu_nutri) as restritos
                      from {schema}.registros_prontuario r where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
     where p.conta_id = v_c.id;

    v_feito := null;
    if not v_simular then
      -- a) as matrículas para a lixeira, como no aluno_remover: o gatilho pacientes_app_assumir (W7b) leva quem tem login para o app
      update {schema}.pacientes set deleted_at = now() where conta_id = v_c.id and deleted_at is null;
      get diagnostics v_lixeira = row_count;
      -- b) a equipe perde o acesso (sou_membro na hora; o Treino pelo espelho) e fica sabendo pelo sino, como no remover_membro
      insert into {schema}.avisos (destino_user_id, tipo, titulo, link)
      select m.user_id, 'membro_removido', left('Você não faz mais parte da equipe de ' || v_c.nome || ' (a conta foi encerrada)', 160), null
        from {schema}.conta_membros m where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is not null and m.user_id <> p_uid;
      update {schema}.conta_membros
         set status = 'removido', removido_em = now(),
             removido_motivo = case when user_id = p_uid then 'conta_excluida' else removido_motivo end
       where conta_id = v_c.id and status <> 'removido';
      get diagnostics v_removidos = row_count;
      -- c) convites (aluno e membro) que ninguém aceitou não levam mais ninguém para a conta
      update {schema}.convites set status = 'revogado' where conta_id = v_c.id and status = 'pendente';
      get diagnostics v_revogados = row_count;
      -- d) ninguém paga mais por Pix a uma conta encerrada; mensagens automáticas pendentes saem da fila
      update {schema}.recebimento_chaves set ativa = false, atualizado_em = now() where conta_id = v_c.id and ativa;
      get diagnostics v_chaves = row_count;
      update {schema}.mensagens_whatsapp set status = 'cancelada', erro = 'o profissional excluiu a conta', updated_at = now()
       where status = 'pendente' and (conta_id = v_c.id or nutricionista_id = p_uid);
      get diagnostics v_whats_conta = row_count;
      -- e) a conta fica (as matrículas da lixeira guardam o histórico), cancelada
      update {schema}.contas set situacao = 'cancelada' where id = v_c.id and situacao <> 'cancelada';
      v_feito := jsonb_build_object('alunos_na_lixeira', v_lixeira, 'membros_removidos', v_removidos, 'convites_revogados', v_revogados,
                                    'chaves_pix_desligadas', v_chaves, 'whatsapp_cancelados', v_whats_conta);
      if v_c.situacao <> 'cancelada' or v_lixeira > 0 or v_removidos > 0 or v_revogados > 0 or v_chaves > 0 or v_whats_conta > 0 then
        insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
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
  if exists (select 1 from {schema}.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid) then
    select jsonb_build_object(
             'alunos', (select count(*) from {schema}.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid and p.deleted_at is null),
             'prontuarios', coalesce((
               select jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', null, 'nome', p.nome, 'registros', x.total, 'restritos', 0)
                                order by p.nome)
                 from {schema}.pacientes p
                 join lateral (select count(*) as total from {schema}.registros_prontuario r
                                where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
                where p.conta_id is null and p.nutricionista_id = p_uid), '[]'::jsonb))
      into v_sem_conta;
    if not v_simular then
      update {schema}.pacientes set deleted_at = now() where conta_id is null and nutricionista_id = p_uid and deleted_at is null;
    end if;
  end if;

  -- ---------- MEMBRO (não dono): sai da equipe como no remover_membro, sem novo responsável ----------
  for v_m in select m.*, c.nome as conta_nome, c.dono_id
               from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
              where m.user_id = p_uid and m.status <> 'removido' and not (m.conta_id = any(v_contas_dono))
              order by m.criado_em loop
    select count(*) filter (where p.personal_id = p_uid), count(*) filter (where p.nutricionista_id = p_uid)
      into v_treino, v_nutri
      from {schema}.pacientes p where p.conta_id = v_m.conta_id and p.deleted_at is null;
    if not v_simular then
      update {schema}.pacientes set personal_id = null where conta_id = v_m.conta_id and personal_id = p_uid;
      update {schema}.pacientes set nutricionista_id = null where conta_id = v_m.conta_id and nutricionista_id = p_uid;
      update {schema}.convites set status = 'revogado'
       where conta_id = v_m.conta_id and tipo = 'aluno' and status = 'pendente' and responsavel_id = p_uid;
      get diagnostics v_revogados = row_count;
      update {schema}.conta_membros set status = 'removido', removido_em = now(), removido_motivo = 'conta_excluida' where id = v_m.id;
      insert into {schema}.conta_eventos (conta_id, tipo, antes, depois, por)
      values (v_m.conta_id, 'membro', jsonb_build_object('membro_id', v_m.id, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
              jsonb_build_object('acao', 'saiu_excluiu_a_conta', 'w2l', true, 'membro_id', v_m.id, 'user_id', p_uid, 'alunos_treino', v_treino,
                                 'alunos_nutricao', v_nutri, 'convites_de_aluno_revogados', v_revogados), p_uid);
      if v_m.dono_id is not null and v_m.dono_id <> p_uid then
        insert into {schema}.avisos (destino_user_id, tipo, titulo, link)
        values (v_m.dono_id, 'geral', left(coalesce(v_nome, 'Um profissional') || ' excluiu a conta e saiu da equipe'
                  || case when v_treino + v_nutri > 0 then ' · ' || (v_treino + v_nutri) || ' aluno(s) sem responsável' else '' end, 160),
                '/painel/alunos');
      end if;
    end if;
    v_equipes := v_equipes || jsonb_build_object('conta_id', v_m.conta_id, 'conta_nome', v_m.conta_nome,
      'dono_nome', {schema}.nome_da_pessoa(v_m.dono_id), 'papeis', to_jsonb(v_m.papeis), 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri);
  end loop;
  select count(*) into v_ex_equipes from {schema}.conta_membros m
   where m.user_id = p_uid and m.status = 'removido' and not (m.conta_id = any(v_contas_dono)) and m.removido_motivo is null;

  v_perfil := case when jsonb_array_length(v_dono) > 0 then 'dono'
                   when jsonb_array_length(v_equipes) > 0 then 'membro'
                   else 'ex_profissional' end;

  -- ---------- a pessoa (o login sai pela borda, por soft delete) ----------
  if not v_simular then
    -- fica o nome e o registro profissional (CRN/CREF): identificam o autor das anotações no prontuário, que fica guardado
    update {schema}.profiles
       set email = null, carimbo_url = null, codigo_cadastro = null, ativo = false,
           dados_profissionais = jsonb_strip_nulls(jsonb_build_object(
             'registro', dados_profissionais ->> 'registro', 'crn', dados_profissionais ->> 'crn', 'cref', dados_profissionais ->> 'cref')),
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = p_uid;
    delete from {schema}.avisos where destino_user_id = p_uid;
    delete from {schema}.push_aparelhos where user_id = p_uid;
    update {schema}.whatsapp_instancias
       set status = 'desconectado', qr_code = null, numero_conectado = null, erro = 'conta excluída', updated_at = now()
     where nutricionista_id = p_uid and status <> 'desconectado';
    -- os gatilhos do espelho enfileiraram esta pessoa, mas o login vai sair: o Treino dela é tratado pela borda (delete-my-account).
    -- Os alunos e a equipe seguem na fila (a borda dispara o espelho logo depois).
    delete from {schema}.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object(
    'ok', true, 'simulacao', v_simular, 'perfil', v_perfil, 'nome', v_nome,
    'contas_dono', v_dono, 'equipes', v_equipes, 'ex_equipes', v_ex_equipes, 'sem_conta', v_sem_conta,
    'aluno', v_aluno, 'arquivos', v_arquivos);
end;
$$;
revoke execute on function {schema}.excluir_conta_profissional(uuid, boolean) from public, anon, authenticated;
grant execute on function {schema}.excluir_conta_profissional(uuid, boolean) to service_role;

-- ============================================================================================================
-- 3. Os prontuários que o dono baixa antes de excluir (o app monta 1 PDF por paciente e o ZIP) — authenticated, só o dono
-- ============================================================================================================
create or replace function {schema}.w2l_prontuarios_para_baixar(p_conta uuid, p_pacientes uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_clinico boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  if coalesce(array_length(p_pacientes, 1), 0) = 0 or array_length(p_pacientes, 1) > 50 then
    return jsonb_build_object('ok', false, 'erro', 'selecao_invalida');
  end if;
  if p_conta is not null and not ({schema}.sou_dono(p_conta) or {schema}.eh_master()) then
    return jsonb_build_object('ok', false, 'erro', 'so_dono');
  end if;
  -- a regra da aluno_anotacoes (W18): "Só nutricionistas" só para quem vê o clínico; sem conta (site antigo) = a própria nutricionista
  v_clinico := p_conta is null or {schema}.eh_master() or {schema}.tenho_papel(p_conta, 'nutricionista');
  return jsonb_build_object(
    'ok', true, 'clinico', v_clinico, 'emissor', {schema}.nome_da_pessoa(v_uid),
    'pacientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'nascimento', p.nascimento, 'na_lixeira', p.deleted_at is not null,
               'registros', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'data', r.data, 'texto', r.texto, 'created_at', r.created_at, 'visibilidade', r.visibilidade,
                          'autor_id', r.nutricionista_id, 'autor_nome', {schema}.nome_da_pessoa(r.nutricionista_id), 'autor_papel', r.autor_papel)
                          order by r.data desc, r.created_at desc)
                   from {schema}.registros_prontuario r
                  where r.paciente_id = p.id and r.deleted_at is null and (r.visibilidade = 'equipe' or v_clinico)), '[]'::jsonb))
             order by p.nome)
        from {schema}.pacientes p
       where p.id = any(p_pacientes)
         and ((p_conta is not null and p.conta_id = p_conta) or (p_conta is null and p.conta_id is null and p.nutricionista_id = v_uid))),
      '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.w2l_prontuarios_para_baixar(uuid, uuid[]) from public, anon;
grant execute on function {schema}.w2l_prontuarios_para_baixar(uuid, uuid[]) to authenticated, service_role;
