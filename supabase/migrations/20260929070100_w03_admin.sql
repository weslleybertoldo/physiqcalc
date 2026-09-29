-- Physiq W3 — quem vê o aluno no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb). Idempotente. SÓ ACRESCENTA.
-- Spec "Physiq Unificado - desenho aprovado" §8.2: pode_ver_aluno_treino(aluno) = master OU professor_id = auth.uid() OU
-- membro da mesma conta no espelho (o DONO vê todos os alunos da conta; o personal só os dele). As funções admin-* passam a
-- usar esta regra (W3) pela variante _por (chamada com a service_role, que não tem auth.uid()).
--
-- Aplica em public e staging (bloco DO, padrão do repo). Um schema de cada vez (staging primeiro), na MESMA sessão:
--   psql "<conexão>" -v ON_ERROR_STOP=1 -1 -c "set physiq.schemas = 'staging'" -f supabase/migrations/20260929070100_w03_admin.sql
-- Sem o SET, roda nos 2. Backup antes: scripts/backup/pg_dump_tabelas.sh. Nenhum dado muda (só funções novas).

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;

    -- a regra, para qualquer usuário (só o servidor chama: revela quem vê quem)
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.pode_ver_aluno_treino_por(p_aluno uuid, p_usuario uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$
        SELECT p_usuario IS NOT NULL AND p_aluno IS NOT NULL AND (
             p_aluno = p_usuario
          OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_usuario AND u.raw_app_meta_data ->> 'role' IN ('admin', 'master'))
          OR EXISTS (SELECT 1 FROM %I.physiq_profiles a WHERE a.id = p_aluno AND a.professor_id = p_usuario)
          OR EXISTS (SELECT 1 FROM %I.physiq_profiles a
                       JOIN %I.physiq_espelho_membros m ON m.conta_id = a.conta_id
                      WHERE a.id = p_aluno AND a.conta_id IS NOT NULL AND m.treino_user_id = p_usuario
                        AND m.ativo AND 'dono' = ANY (m.papeis)))
      $b$$f$, sch, sch, sch, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.pode_ver_aluno_treino_por(uuid, uuid) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.pode_ver_aluno_treino_por(uuid, uuid) TO service_role', sch);

    -- a mesma regra para quem está logado (RLS e telas): o usuário é o do JWT
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.pode_ver_aluno_treino(p_aluno uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$
        SELECT %I.pode_ver_aluno_treino_por(p_aluno, auth.uid())
      $b$$f$, sch, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.pode_ver_aluno_treino(uuid) FROM PUBLIC, anon', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.pode_ver_aluno_treino(uuid) TO authenticated, service_role', sch);

    -- contas em que o usuário é DONO no espelho (as listas das admin-* somam os alunos dessas contas)
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.contas_onde_sou_dono_treino(p_usuario uuid) RETURNS SETOF uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$
        SELECT m.conta_id FROM %I.physiq_espelho_membros m
         WHERE m.treino_user_id = p_usuario AND m.ativo AND 'dono' = ANY (m.papeis)
      $b$$f$, sch, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.contas_onde_sou_dono_treino(uuid) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.contas_onde_sou_dono_treino(uuid) TO service_role', sch);
  END LOOP;
END $mig$;
