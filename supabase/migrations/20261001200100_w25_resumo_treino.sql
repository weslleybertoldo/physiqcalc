-- Physiq W25 — Banco do Treino (public + staging). Idempotente; NENHUM dado muda (só 1 função nova, sem tabela nem índice).
-- Painel › Dashboard (tela 6, spec §11.3 W25, NF6, P28): o RESUMO DO TREINO da conta para quem está no painel — a função
-- painel-resumo-treino (verify_jwt = true: chamada com a sessão do Treino que a trocar-token deu) confere o JWT e chama esta
-- função com a service_role, UMA ida ao banco. O painel não lê as tabelas do Treino direto.
--
-- Quem vê o quê (a regra da W3, pode_ver_aluno_treino_por): master e o DONO da conta (espelho do núcleo) veem os alunos da conta;
-- o personal, só os dele (professor_id). Quem não é master nem membro da conta no espelho (nem professor de algum aluno dela) recebe
-- 'sem_acesso'.
--
-- Leve de propósito (a VM Nano trava com carga): cada bloco é 1 consulta pelos índices de user_id (e data) — a de séries só olha os
-- últimos 7 dias e, para cada exercício feito neles, a maior carga ANTES pelo índice único (user_id, exercicio_id, data_treino…);
-- nenhuma varre a tabela de séries inteira.
--
-- O que volta (as regras ficam no app, src/painel/dashboard/regras.ts, testadas — aqui só os dados):
--   alunos[]   id (usuário do Treino), principal_user_id (physiq_identidades), proxima_avaliacao (NF7), ultima_avaliacao,
--              ultimo_treino (o dia mais recente com treino concluído ou no histórico), e o que a adesão dos últimos 7 dias usa:
--              semana (tb_semana_treinos), dias_config (alternado), grupos disponíveis, trocas do dia e dias concluídos da janela;
--   historico[] treinos concluídos nos últimos 7 dias (Atividade recente: "Rafael concluiu o Treino A");
--   recordes[] por exercício e dia dos últimos 7 dias: a maior carga do dia e a maior ANTES dele (o app decide se é recorde).
--
-- Aplicar (backup das definições antes; um schema de cada vez, staging primeiro), pela Management API (database/query):
--   select set_config('physiq.schemas', 'staging', false);  <conteúdo deste arquivo>     (depois o mesmo com 'public')
-- Sem o set_config, roda nos 2 schemas.

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;

    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %1$I.painel_resumo_treino(p_usuario uuid, p_conta uuid, p_hoje date) RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $b$
      DECLARE
        v_master boolean;
        v_todos boolean;
        v_ids uuid[];
        v_de date;
        v_de_ts timestamptz;
        v_alunos jsonb;
        v_historico jsonb;
        v_recordes jsonb;
      BEGIN
        IF p_usuario IS NULL OR p_conta IS NULL OR p_hoje IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'erro', 'parametros');
        END IF;
        v_de := p_hoje - 6;  -- os últimos 7 dias, hoje incluído
        v_de_ts := (v_de::timestamp AT TIME ZONE 'America/Sao_Paulo');
        SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_usuario AND u.raw_app_meta_data ->> 'role' IN ('admin', 'master'))
          INTO v_master;
        -- o dono vê a conta inteira (P1); o personal, os dele
        v_todos := v_master OR EXISTS (
          SELECT 1 FROM %1$I.physiq_espelho_membros m
           WHERE m.conta_id = p_conta AND m.treino_user_id = p_usuario AND m.ativo AND 'dono' = ANY (m.papeis));
        IF NOT v_todos AND NOT EXISTS (
             SELECT 1 FROM %1$I.physiq_espelho_membros m WHERE m.conta_id = p_conta AND m.treino_user_id = p_usuario AND m.ativo)
           AND NOT EXISTS (SELECT 1 FROM %1$I.physiq_profiles a WHERE a.conta_id = p_conta AND a.professor_id = p_usuario) THEN
          RETURN jsonb_build_object('ok', false, 'erro', 'sem_acesso');
        END IF;

        SELECT coalesce(array_agg(a.id), '{}') INTO v_ids
          FROM %1$I.physiq_profiles a
         WHERE a.conta_id = p_conta AND a.id <> p_usuario AND (v_todos OR a.professor_id = p_usuario);

        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'id', a.id,
                 'principal_user_id', i.principal_user_id,
                 'nome', a.nome,
                 'criado_em', a.created_at,
                 'proxima_avaliacao', a.proxima_avaliacao,
                 'ultima_avaliacao', (SELECT max(av.data_avaliacao) FROM %1$I.physiq_avaliacoes av WHERE av.user_id = a.id),
                 'ultimo_treino', greatest(
                    (SELECT max(c.data_treino) FROM %1$I.tb_treino_concluido c WHERE c.user_id = a.id AND c.concluido AND c.data_treino <= p_hoje),
                    (SELECT max((h.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date) FROM %1$I.treino_historico h WHERE h.user_id = a.id)),
                 'semana', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia_semana', s.dia_semana, 'slot_idx', s.slot_idx, 'grupo_id', s.grupo_id,
                                 'grupo_usuario_id', s.grupo_usuario_id, 'extra', s.extra, 'extra_atrelado_grupo_id', s.extra_atrelado_grupo_id,
                                 'extra_atrelado_grupo_usuario_id', s.extra_atrelado_grupo_usuario_id)), '[]'::jsonb)
                              FROM %1$I.tb_semana_treinos s WHERE s.user_id = a.id),
                 'dias_config', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia_semana', d.dia_semana, 'alternado', d.alternado,
                                 'alternado_inicio', d.alternado_inicio)), '[]'::jsonb)
                                   FROM %1$I.tb_semana_dia_config d WHERE d.user_id = a.id),
                 'grupos_catalogo', (SELECT coalesce(jsonb_agg(gp.grupo_id), '[]'::jsonb) FROM %1$I.tb_grupos_treino_perfis gp
                                      WHERE gp.user_id = a.id AND gp.grupo_id IS NOT NULL),
                 'grupos_pessoais', (SELECT coalesce(jsonb_agg(gu.id), '[]'::jsonb) FROM %1$I.tb_grupos_treino_usuario gu WHERE gu.user_id = a.id),
                 'overrides', (SELECT coalesce(jsonb_agg(jsonb_build_object('data_treino', o.data_treino, 'slot_idx', o.slot_idx, 'grupo_id', o.grupo_id,
                                 'grupo_usuario_id', o.grupo_usuario_id)), '[]'::jsonb)
                                 FROM %1$I.tb_treino_dia_override o WHERE o.user_id = a.id AND o.data_treino BETWEEN v_de AND p_hoje),
                 'concluidos', (SELECT coalesce(jsonb_agg(jsonb_build_object('data_treino', c.data_treino, 'slot_idx', c.slot_idx)), '[]'::jsonb)
                                  FROM %1$I.tb_treino_concluido c WHERE c.user_id = a.id AND c.concluido AND c.data_treino BETWEEN v_de AND p_hoje)
               )), '[]'::jsonb)
          INTO v_alunos
          FROM %1$I.physiq_profiles a
          LEFT JOIN %1$I.physiq_identidades i ON i.treino_user_id = a.id
         WHERE a.id = ANY (v_ids);

        SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'nome_treino', x.nome_treino, 'concluido_em', x.concluido_em)
                 ORDER BY x.concluido_em DESC), '[]'::jsonb)
          INTO v_historico
          FROM (SELECT h.user_id, h.nome_treino, h.concluido_em FROM %1$I.treino_historico h
                 WHERE h.user_id = ANY (v_ids) AND h.concluido_em >= v_de_ts
                 ORDER BY h.concluido_em DESC LIMIT 40) x;

        WITH dia AS (
          SELECT s.user_id, s.exercicio_id, s.exercicio_usuario_id, s.data_treino, max(s.peso) AS peso, max(s.updated_at) AS quando
            FROM %1$I.tb_treino_series s
           WHERE s.user_id = ANY (v_ids) AND s.data_treino BETWEEN v_de AND p_hoje AND s.concluida AND coalesce(s.peso, 0) > 0
           GROUP BY 1, 2, 3, 4
        )
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'user_id', d.user_id, 'exercicio_id', d.exercicio_id, 'exercicio_usuario_id', d.exercicio_usuario_id,
                 'exercicio', coalesce(e.nome, eu.nome), 'data_treino', d.data_treino, 'peso', d.peso, 'quando', d.quando,
                 'anterior', CASE WHEN d.exercicio_id IS NOT NULL THEN
                     (SELECT max(s2.peso) FROM %1$I.tb_treino_series s2
                       WHERE s2.user_id = d.user_id AND s2.exercicio_id = d.exercicio_id AND s2.data_treino < d.data_treino AND s2.concluida)
                   ELSE
                     (SELECT max(s2.peso) FROM %1$I.tb_treino_series s2
                       WHERE s2.user_id = d.user_id AND s2.exercicio_usuario_id = d.exercicio_usuario_id AND s2.data_treino < d.data_treino AND s2.concluida)
                   END)), '[]'::jsonb)
          INTO v_recordes
          FROM dia d
          LEFT JOIN %1$I.tb_exercicios e ON e.id = d.exercicio_id
          LEFT JOIN %1$I.tb_exercicios_usuario eu ON eu.id = d.exercicio_usuario_id;

        RETURN jsonb_build_object('ok', true, 'hoje', p_hoje, 'de', v_de, 'todos', v_todos,
                                  'alunos', v_alunos, 'historico', v_historico, 'recordes', v_recordes);
      END
      $b$
    $f$, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.painel_resumo_treino(uuid, uuid, date) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.painel_resumo_treino(uuid, uuid, date) TO service_role', sch);
    EXECUTE format($c$COMMENT ON FUNCTION %I.painel_resumo_treino(uuid, uuid, date) IS 'W25: resumo do treino da conta para o Dashboard do painel (só a função painel-resumo-treino chama, com a service_role)'$c$, sch);
  END LOOP;
END $mig$;
