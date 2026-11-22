-- Physiq bcode-0021, item 7 no BANCO DO TREINO (uxwpwdbbnlticxgtzcsb; só o código, decisão do dono 22/11/2026): o «Exportar meus dados»
-- traz a contagem de limites da pessoa (edge_rate_limits) — as linhas pelo id do Treino dela E pelo id do principal (a trocar-token conta
-- por principal.id; o vínculo physiq_identidades diz qual é). Idempotente. UM schema por chamada. Troca 1 função:
-- <schema>.physiq_exportar_aluno(uuid) (quem chama, a delete-my-account com a ação exportar, fica igual).
--   A GUARDA: o md5 do corpo vivo tem de ser o da w07 (20260929170100_w07_exportar_excluir.sql:36-75, com o schema no lugar do %1$I) ou o
--   deste arquivo (já aplicado). Outro corpo → para e nada muda (conferir o corpo vivo antes de seguir).
--   O corpo: o da w07 sem mudança, com edge_rate_limits depois de physiq_assinaturas (w07:63). Sem linha → "edge_rate_limits": [].
-- Aplicar junto ou depois do item 1 (20261122150100): sem o prazo, a exportação levaria contagens velhas.
-- Management API, numa chamada só: set physiq.schemas = 'staging'; <este arquivo>   (dry-run: begin; set …; <este arquivo>; rollback;)
-- Com o OK dele: set physiq.schemas = 'public'; <este arquivo>. Sem o set, para (o padrão antigo do repo rodava nos 2).
-- Reversa: supabase/reversas/20261122150300_exportar_contagens_treino_reversa.sql
select set_config('lock_timeout', '5s', true);

DO $mig$
DECLARE
  v_amb text := current_setting('physiq.schemas', true);
  v_f text;
  v_md5 text;
  r record;
BEGIN
  IF v_amb IS NULL OR v_amb NOT IN ('staging', 'public') THEN
    RAISE EXCEPTION 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  END IF;
  v_f := format('%I.physiq_exportar_aluno(uuid)', v_amb);

  -- 1. a guarda: o corpo vivo é o da w07 ou o deste arquivo
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(v_f);
  IF v_md5 IS NULL OR v_md5 <> ALL (CASE v_amb WHEN 'staging' THEN ARRAY['ff0021c543d4a58500d22550cd547fe4', '587173c1ec2a57036ab5d6409e41681b']
                                                          ELSE ARRAY['49867a0c29007040886294c9e9d9b4e0', 'f93c5f6008eef62d9701a7a5a771fb02'] END) THEN
    RAISE EXCEPTION 'bcode-0021: % não é o corpo da w07 nem o deste arquivo (md5 %): nada mudou', v_f, coalesce(v_md5, 'sem a função');
  END IF;

  -- 2. o corpo: o da w07 + edge_rate_limits (as linhas pelos 2 ids da pessoa)
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
            'physiq_assinaturas', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM %1$I.physiq_assinaturas t WHERE t.user_id = p_user),
            'edge_rate_limits', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]'::jsonb) FROM %1$I.edge_rate_limits t
                                  WHERE t.user_id = p_user
                                     OR t.user_id = (SELECT i.principal_user_id FROM %1$I.physiq_identidades i WHERE i.treino_user_id = p_user))),
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
      $b$$f$, v_amb);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_exportar_aluno(uuid) FROM PUBLIC, anon, authenticated', v_amb);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_exportar_aluno(uuid) TO service_role', v_amb);

  -- 3. a conferência do fim (qualquer diferença desfaz a chamada inteira)
  SELECT p.oid, md5(p.prosrc) AS m, p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""'] AS definer_sp INTO r
    FROM pg_catalog.pg_proc p WHERE p.oid = v_f::regprocedure;
  IF r.m IS DISTINCT FROM (CASE v_amb WHEN 'staging' THEN '587173c1ec2a57036ab5d6409e41681b' ELSE 'f93c5f6008eef62d9701a7a5a771fb02' END) THEN
    RAISE EXCEPTION 'bcode-0021: % não ficou com o corpo deste arquivo (md5 %)', v_f, r.m;
  END IF;
  IF NOT r.definer_sp THEN
    RAISE EXCEPTION 'bcode-0021: % sem SECURITY DEFINER ou sem o search_path vazio', v_f;
  END IF;
  IF has_function_privilege('anon', r.oid, 'EXECUTE') OR has_function_privilege('authenticated', r.oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'bcode-0021: % fora do esperado (só o servidor executa)', v_f;
  END IF;
END
$mig$;
