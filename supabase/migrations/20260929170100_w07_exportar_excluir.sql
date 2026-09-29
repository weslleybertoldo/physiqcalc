-- Physiq W7 — Exportar e Excluir do aluno no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb). Idempotente. SÓ ACRESCENTA
-- 2 funções por schema, SÓ para a service_role (quem chama é a delete-my-account em modo servidor, a pedido das funções
-- exportar-meus-dados / excluir-minha-conta do banco principal, com o id do JWT resolvido pelo vínculo physiq_identidades):
--
--   physiq_exportar_aluno(p_user)            os dados do aluno neste schema (JSON) + nomes dos exercícios e treinos citados
--   physiq_excluir_aluno(p_user, p_simular)  P19 neste banco (simular = só conta o que apagaria/manteria)
--
-- P19 aqui (spec §8.2, tabela por tabela):
--   APAGA (os dados de treino do aluno e o que ele criou/enviou): tb_treino_series, tb_treino_concluido, tb_treino_dia_override,
--     treino_historico, exercicio_ordem_usuario, exercicio_substituicao_usuario, tb_exercicio_comentarios, tb_academias e
--     tb_academia_pesos, tb_exercicios_usuario, tb_grupos_treino_usuario e tb_grupos_exercicios_usuario (treinos e exercícios
--     próprios), a semana/séries apontando para esses treinos próprios, edge_rate_limits; a foto do login (physiq_profiles.foto_url).
--     O LOGIN sai pela borda depois desta função: "soft delete" do Auth (e-mail e identidades embaralhados, sem senha, sem
--     sessão — não dá para entrar de novo nem achar pelo e-mail; é irreversível) + o vínculo physiq_identidades.
--   FICA COM O PROFISSIONAL, DESLIGADO DO LOGIN (a linha do Auth fica só como âncora das chaves, sem login): physiq_profiles
--     (cadastro e medidas; status = 'excluido'), physiq_avaliacoes, physiq_registros_fotos (fotos que o profissional subiu),
--     a prescrição (tb_semana_treinos, tb_semana_dia_config, tb_series_padrao_usuario, tb_grupos_treino_perfis), physiq_user_tags,
--     physiq_pagamentos (com os comprovantes) e physiq_assinaturas.
--   RECUSA: professor, admin/master ou membro de equipe no espelho (a exclusão de profissional não é pelo app do aluno).
--
-- Aplica em public e staging (bloco DO, padrão do repo). Um schema de cada vez (staging primeiro), na MESMA sessão:
--   psql "<conexão>" -v ON_ERROR_STOP=1 -1 -c "set physiq.schemas = 'staging'" -f supabase/migrations/20260929170100_w07_exportar_excluir.sql
-- Sem o SET, roda nos 2. Backup antes: scripts/backup/pg_dump_tabelas.sh. Nenhum dado muda ao aplicar (só funções novas).

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;

    -- ───────────── Exportar ─────────────
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %1$I.physiq_exportar_aluno(p_user uuid) RETURNS jsonb
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$
        SELECT jsonb_build_object(
          'usuario_id', p_user,
          'perfil', (SELECT to_jsonb(p) FROM %1$I.physiq_profiles p WHERE p.id = p_user),
          'tabelas', jsonb_build_object(
            'physiq_avaliacoes', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.data_avaliacao, t.created_at), '[]'::jsonb) FROM %1$I.physiq_avaliacoes t WHERE t.user_id = p_user),
            'physiq_registros_fotos', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'storage_path' ORDER BY t.mes_ref, t.tipo), '[]'::jsonb) FROM %1$I.physiq_registros_fotos t WHERE t.user_id = p_user),
            'tb_treino_series', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.data_treino, t.numero_serie), '[]'::jsonb) FROM %1$I.tb_treino_series t WHERE t.user_id = p_user),
            'tb_treino_concluido', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.data_treino), '[]'::jsonb) FROM %1$I.tb_treino_concluido t WHERE t.user_id = p_user),
            'tb_treino_dia_override', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.data_treino), '[]'::jsonb) FROM %1$I.tb_treino_dia_override t WHERE t.user_id = p_user),
            'treino_historico', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.iniciado_em), '[]'::jsonb) FROM %1$I.treino_historico t WHERE t.user_id = p_user),
            'exercicio_ordem_usuario', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM %1$I.exercicio_ordem_usuario t WHERE t.user_id = p_user),
            'exercicio_substituicao_usuario', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.exercicio_substituicao_usuario t WHERE t.user_id = p_user),
            'tb_exercicios_usuario', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.tb_exercicios_usuario t WHERE t.user_id = p_user),
            'tb_grupos_treino_usuario', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.tb_grupos_treino_usuario t WHERE t.user_id = p_user),
            'tb_grupos_exercicios_usuario', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.ordem), '[]'::jsonb) FROM %1$I.tb_grupos_exercicios_usuario t WHERE t.user_id = p_user),
            'tb_exercicio_comentarios', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.tb_exercicio_comentarios t WHERE t.user_id = p_user),
            'tb_academias', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.tb_academias t WHERE t.user_id = p_user),
            'tb_academia_pesos', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM %1$I.tb_academia_pesos t WHERE t.user_id = p_user),
            'tb_semana_treinos', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.dia_semana, t.slot_idx), '[]'::jsonb) FROM %1$I.tb_semana_treinos t WHERE t.user_id = p_user),
            'tb_semana_dia_config', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.dia_semana), '[]'::jsonb) FROM %1$I.tb_semana_dia_config t WHERE t.user_id = p_user),
            'tb_series_padrao_usuario', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM %1$I.tb_series_padrao_usuario t WHERE t.user_id = p_user),
            'tb_grupos_treino_perfis', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.tb_grupos_treino_perfis t WHERE t.user_id = p_user),
            'physiq_pagamentos', (SELECT coalesce(jsonb_agg((to_jsonb(t) - ARRAY['pix_qr_code', 'pix_qr_code_base64', 'comprovante_path'])
                                     || jsonb_build_object('tem_comprovante', t.comprovante_path IS NOT NULL) ORDER BY t.created_at), '[]'::jsonb)
                                    FROM %1$I.physiq_pagamentos t WHERE t.user_id = p_user),
            'physiq_assinaturas', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.physiq_assinaturas t WHERE t.user_id = p_user)),
          'referencias', jsonb_build_object(
            'exercicios', (SELECT coalesce(jsonb_object_agg(e.id, e.nome), '{}'::jsonb) FROM %1$I.tb_exercicios e
                            WHERE e.id IN (SELECT s.exercicio_id FROM %1$I.tb_treino_series s WHERE s.user_id = p_user
                                           UNION SELECT c.exercicio_id FROM %1$I.tb_exercicio_comentarios c WHERE c.user_id = p_user
                                           UNION SELECT g.exercicio_id FROM %1$I.tb_grupos_exercicios_usuario g WHERE g.user_id = p_user
                                           UNION SELECT sp.exercicio_id FROM %1$I.tb_series_padrao_usuario sp WHERE sp.user_id = p_user)),
            'treinos', (SELECT coalesce(jsonb_object_agg(g.id, g.nome), '{}'::jsonb) FROM %1$I.tb_grupos_treino g
                         WHERE g.id IN (SELECT st.grupo_id FROM %1$I.tb_semana_treinos st WHERE st.user_id = p_user
                                        UNION SELECT gp.grupo_id FROM %1$I.tb_grupos_treino_perfis gp WHERE gp.user_id = p_user
                                        UNION SELECT o.grupo_id FROM %1$I.tb_treino_dia_override o WHERE o.user_id = p_user
                                        UNION SELECT sp.grupo_id FROM %1$I.tb_series_padrao_usuario sp WHERE sp.user_id = p_user))))
      $b$$f$, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_exportar_aluno(uuid) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_exportar_aluno(uuid) TO service_role', sch);

    -- ───────────── Excluir (P19) ─────────────
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %1$I.physiq_excluir_aluno(p_user uuid, p_simular boolean DEFAULT true) RETURNS jsonb
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $b$
      DECLARE
        v_role text;
        v_removido timestamptz;
        v_apaga jsonb;
        v_mantem jsonb;
      BEGIN
        IF p_user IS NULL THEN
          RAISE EXCEPTION 'physiq_excluir_aluno: p_user obrigatório';
        END IF;
        SELECT coalesce(u.raw_app_meta_data ->> 'role', ''), u.deleted_at INTO v_role, v_removido FROM auth.users u WHERE u.id = p_user;
        IF coalesce(v_role, '') IN ('admin', 'master', 'professor')
           OR EXISTS (SELECT 1 FROM %1$I.physiq_professores pr WHERE pr.id = p_user)
           OR EXISTS (SELECT 1 FROM %1$I.physiq_espelho_membros m WHERE m.treino_user_id = p_user AND m.ativo) THEN
          RETURN jsonb_build_object('ok', false, 'erro', 'profissional');
        END IF;

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
          'edge_rate_limits', (SELECT count(*) FROM %1$I.edge_rate_limits WHERE user_id = p_user));
        v_mantem := jsonb_build_object(
          'physiq_profiles', (SELECT count(*) FROM %1$I.physiq_profiles WHERE id = p_user),
          'physiq_avaliacoes', (SELECT count(*) FROM %1$I.physiq_avaliacoes WHERE user_id = p_user),
          'physiq_registros_fotos', (SELECT count(*) FROM %1$I.physiq_registros_fotos WHERE user_id = p_user),
          'tb_semana_treinos', (SELECT count(*) FROM %1$I.tb_semana_treinos WHERE user_id = p_user AND grupo_usuario_id IS NULL),
          'tb_semana_dia_config', (SELECT count(*) FROM %1$I.tb_semana_dia_config WHERE user_id = p_user),
          'tb_series_padrao_usuario', (SELECT count(*) FROM %1$I.tb_series_padrao_usuario WHERE user_id = p_user
                                          AND grupo_usuario_id IS NULL AND exercicio_usuario_id IS NULL),
          'tb_grupos_treino_perfis', (SELECT count(*) FROM %1$I.tb_grupos_treino_perfis WHERE user_id = p_user),
          'physiq_user_tags', (SELECT count(*) FROM %1$I.physiq_user_tags WHERE user_id = p_user),
          'physiq_pagamentos', (SELECT count(*) FROM %1$I.physiq_pagamentos WHERE user_id = p_user),
          'physiq_assinaturas', (SELECT count(*) FROM %1$I.physiq_assinaturas WHERE user_id = p_user));

        IF NOT coalesce(p_simular, true) THEN
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
          'apaga', v_apaga, 'mantem', v_mantem);
      END
      $b$$f$, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_excluir_aluno(uuid, boolean) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_excluir_aluno(uuid, boolean) TO service_role', sch);
  END LOOP;
END $mig$;
