-- Physiq W2 da loja (Google Play) — "Excluir minha conta" do PROFISSIONAL no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb).
-- Idempotente. SÓ ACRESCENTA 1 função por schema, SÓ para a service_role: quem chama é a delete-my-account em modo servidor (ações
-- novas conferir_profissional / excluir_profissional), a pedido da excluir-minha-conta do banco principal no pedido do app novo
-- ({ fluxo: "profissional" }), com o id do Treino resolvido pelo vínculo physiq_identidades. A physiq_excluir_aluno (W7) não muda.
--
--   physiq_excluir_profissional(p_user, p_simular)
--     FICA COM OS ALUNOS (decisão do Weslley, 06/10/2026): o que ele montou para eles — tb_grupos_treino, tb_grupos_exercicios,
--       tb_exercicios e tb_pastas_treino dele (a leitura desses é pública: a semana do aluno continua abrindo), as avaliações e fotos
--       que ele subiu (são do aluno: physiq_avaliacoes / physiq_registros_fotos, user_id = o aluno), tags e prescrição;
--     OS ALUNOS ficam sem profissional (physiq_profiles.professor_id vazio — o espelho do principal faz o mesmo para quem tem vínculo;
--       aqui vale também para quem nunca entrou no app novo);
--     O PROFESSOR sem acesso: physiq_professores 'suspenso' (o código dele não liga mais ninguém — vincular-professor recusa), sem
--       e-mail, foto e Pix; recebimentos e integrações dele apagados; convites pendentes revogados; o espelho de equipe inativo;
--     COBRANÇA: as assinaturas antigas do Calc (plano dele e alunos → ele) que a borda do principal já cancelou no Mercado Pago (a
--       mesma chamada PUT /preapproval) ficam 'cancelled' aqui também;
--     O QUE É DELE COMO USUÁRIO: a mesma lista da physiq_excluir_aluno (séries, concluídos, histórico, academias, treinos e exercícios
--       próprios, comentários…) — o perfil fica com status 'excluido' e sem foto.
--     O LOGIN sai pela borda depois desta função ("soft delete" do Auth, como o do aluno) + o vínculo physiq_identidades.
--     RECUSA: admin/master (403 "profissional").
--
-- Aplica em public e staging (bloco DO, padrão do repo). Um schema de cada vez, na MESMA chamada (Management API database/query):
--   set physiq.schemas = 'staging'; <este arquivo>      ← SÓ ISTO nesta fase
--   set physiq.schemas = 'public';  <este arquivo>      (produção: fase seguinte, com backup — scripts/backup/pg_dump_tabelas.sh)
-- Sem o SET, roda nos 2. Nenhum dado muda ao aplicar (só a função nova).

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;

    EXECUTE format($f$CREATE OR REPLACE FUNCTION %1$I.physiq_excluir_profissional(p_user uuid, p_simular boolean DEFAULT true) RETURNS jsonb
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $b$
      DECLARE
        v_role text;
        v_removido timestamptz;
        v_alunos uuid[];
        v_cobrancas jsonb;
        v_apaga jsonb;
        v_mantem jsonb;
      BEGIN
        IF p_user IS NULL THEN
          RAISE EXCEPTION 'physiq_excluir_profissional: p_user obrigatório';
        END IF;
        SELECT coalesce(u.raw_app_meta_data ->> 'role', ''), u.deleted_at INTO v_role, v_removido FROM auth.users u WHERE u.id = p_user;
        IF coalesce(v_role, '') IN ('admin', 'master') THEN
          RETURN jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
        END IF;

        SELECT coalesce(array_agg(p.id), ARRAY[]::uuid[]) INTO v_alunos
          FROM %1$I.physiq_profiles p WHERE p.professor_id = p_user AND p.id <> p_user;

        -- assinaturas antigas do Calc ainda vivas (a borda do principal confere com as do núcleo e cancela no Mercado Pago)
        v_cobrancas := jsonb_build_object(
          'plano', (SELECT coalesce(jsonb_agg(jsonb_build_object('mp_preapproval_id', a.mp_preapproval_id, 'status', a.status)), '[]'::jsonb)
                      FROM %1$I.physiq_assinaturas a
                     WHERE a.user_id = p_user AND a.contexto = 'plano_professor' AND a.status IN ('authorized', 'pending', 'paused')),
          'alunos', (SELECT coalesce(jsonb_agg(jsonb_build_object('mp_preapproval_id', a.mp_preapproval_id, 'status', a.status)), '[]'::jsonb)
                       FROM %1$I.physiq_assinaturas a
                      WHERE a.user_id = ANY(v_alunos) AND a.contexto = 'aluno' AND a.status IN ('authorized', 'pending', 'paused')));

        v_apaga := jsonb_build_object(
          'tb_treino_series', (SELECT count(*) FROM %1$I.tb_treino_series WHERE user_id = p_user),
          'tb_treino_concluido', (SELECT count(*) FROM %1$I.tb_treino_concluido WHERE user_id = p_user),
          'tb_treino_dia_override', (SELECT count(*) FROM %1$I.tb_treino_dia_override WHERE user_id = p_user),
          'treino_historico', (SELECT count(*) FROM %1$I.treino_historico WHERE user_id = p_user),
          'exercicio_ordem_usuario', (SELECT count(*) FROM %1$I.exercicio_ordem_usuario WHERE user_id = p_user),
          'exercicio_substituicao_usuario', (SELECT count(*) FROM %1$I.exercicio_substituicao_usuario WHERE user_id = p_user),
          'tb_exercicio_comentarios', (SELECT count(*) FROM %1$I.tb_exercicio_comentarios WHERE user_id = p_user),
          'tb_academias', (SELECT count(*) FROM %1$I.tb_academias WHERE user_id = p_user),
          'tb_academia_pesos', (SELECT count(*) FROM %1$I.tb_academia_pesos WHERE user_id = p_user),
          'tb_exercicios_usuario', (SELECT count(*) FROM %1$I.tb_exercicios_usuario WHERE user_id = p_user),
          'tb_grupos_treino_usuario', (SELECT count(*) FROM %1$I.tb_grupos_treino_usuario WHERE user_id = p_user),
          'tb_grupos_exercicios_usuario', (SELECT count(*) FROM %1$I.tb_grupos_exercicios_usuario WHERE user_id = p_user),
          'tb_semana_treinos_proprios', (SELECT count(*) FROM %1$I.tb_semana_treinos WHERE user_id = p_user AND grupo_usuario_id IS NOT NULL),
          'tb_series_padrao_proprias', (SELECT count(*) FROM %1$I.tb_series_padrao_usuario WHERE user_id = p_user
                                           AND (grupo_usuario_id IS NOT NULL OR exercicio_usuario_id IS NOT NULL)),
          'edge_rate_limits', (SELECT count(*) FROM %1$I.edge_rate_limits WHERE user_id = p_user),
          'physiq_recebimentos', (SELECT count(*) FROM %1$I.physiq_recebimentos WHERE professor_id = p_user),
          'physiq_integracoes', (SELECT count(*) FROM %1$I.physiq_integracoes WHERE professor_id = p_user),
          'physiq_convites_pendentes', (SELECT count(*) FROM %1$I.physiq_convites WHERE professor_id = p_user AND status = 'pendente'));
        v_mantem := jsonb_build_object(
          'alunos', coalesce(array_length(v_alunos, 1), 0),
          'treinos_montados', (SELECT count(*) FROM %1$I.tb_grupos_treino WHERE professor_id = p_user),
          'exercicios_proprios', (SELECT count(*) FROM %1$I.tb_exercicios WHERE professor_id = p_user),
          'pastas', (SELECT count(*) FROM %1$I.tb_pastas_treino WHERE professor_id = p_user),
          'professor', (SELECT count(*) FROM %1$I.physiq_professores WHERE id = p_user),
          'physiq_pagamentos', (SELECT count(*) FROM %1$I.physiq_pagamentos WHERE user_id = p_user),
          'physiq_assinaturas', (SELECT count(*) FROM %1$I.physiq_assinaturas WHERE user_id = p_user));

        IF NOT coalesce(p_simular, true) THEN
          -- o professor: sem acesso, sem código válido e sem os dados de recebimento (o que ele montou para os alunos fica)
          UPDATE %1$I.physiq_professores
             SET status = 'suspenso', acesso_liberado_ate = NULL, nucleo_acesso_ate = NULL, email = NULL, foto_url = NULL,
                 pix_tipo = NULL, pix_chave = NULL, pix_favorecido = NULL, pix_banco = NULL, pix_exibir = false
           WHERE id = p_user;
          DELETE FROM %1$I.physiq_recebimentos WHERE professor_id = p_user;
          DELETE FROM %1$I.physiq_integracoes WHERE professor_id = p_user;
          UPDATE %1$I.physiq_convites SET status = 'revogado' WHERE professor_id = p_user AND status = 'pendente';
          UPDATE %1$I.physiq_espelho_membros SET ativo = false, atualizado_em = now() WHERE treino_user_id = p_user AND ativo;
          -- os alunos ficam sem profissional
          UPDATE %1$I.physiq_profiles SET professor_id = NULL WHERE professor_id = p_user AND id <> p_user;
          -- as assinaturas antigas do Calc já canceladas no Mercado Pago pela borda do principal
          UPDATE %1$I.physiq_assinaturas SET status = 'cancelled', updated_at = now()
           WHERE status IN ('authorized', 'pending', 'paused')
             AND ((user_id = p_user AND contexto = 'plano_professor') OR (user_id = ANY(v_alunos) AND contexto = 'aluno'));
          -- o que é dele como usuário (a mesma lista da physiq_excluir_aluno, W7)
          DELETE FROM %1$I.tb_treino_series WHERE user_id = p_user;
          DELETE FROM %1$I.tb_treino_concluido WHERE user_id = p_user;
          DELETE FROM %1$I.tb_treino_dia_override WHERE user_id = p_user;
          DELETE FROM %1$I.treino_historico WHERE user_id = p_user;
          DELETE FROM %1$I.exercicio_ordem_usuario WHERE user_id = p_user;
          DELETE FROM %1$I.exercicio_substituicao_usuario WHERE user_id = p_user;
          DELETE FROM %1$I.tb_exercicio_comentarios WHERE user_id = p_user;
          DELETE FROM %1$I.tb_academia_pesos WHERE user_id = p_user;
          DELETE FROM %1$I.tb_academias WHERE user_id = p_user;
          DELETE FROM %1$I.tb_semana_treinos WHERE user_id = p_user AND grupo_usuario_id IS NOT NULL;
          DELETE FROM %1$I.tb_series_padrao_usuario WHERE user_id = p_user AND (grupo_usuario_id IS NOT NULL OR exercicio_usuario_id IS NOT NULL);
          DELETE FROM %1$I.tb_grupos_exercicios_usuario WHERE user_id = p_user;
          DELETE FROM %1$I.tb_exercicios_usuario WHERE user_id = p_user;
          DELETE FROM %1$I.tb_grupos_treino_usuario WHERE user_id = p_user;
          DELETE FROM %1$I.edge_rate_limits WHERE user_id = p_user;
          UPDATE %1$I.physiq_profiles SET status = 'excluido', foto_url = NULL WHERE id = p_user;
        END IF;

        -- login_removido: o "soft delete" do Auth já foi feito (a borda não repete — a exclusão pode ser pedida de novo)
        RETURN jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'login_removido', v_removido IS NOT NULL,
          'apaga', v_apaga, 'mantem', v_mantem, 'cobrancas', v_cobrancas);
      END
      $b$$f$, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_excluir_profissional(uuid, boolean) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_excluir_profissional(uuid, boolean) TO service_role', sch);
  END LOOP;
END $mig$;
