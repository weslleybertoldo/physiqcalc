-- Nº de séries que aparecem no app, por usuário e treino — geral do treino OU por exercício.
--
-- Antes: o app criava 3 séries só quando o exercício nunca tinha sido feito; depois
-- copiava a estrutura do último treino (1 série feita → 1 série no dia seguinte).
-- Agora manda o configurado aqui: linha do EXERCÍCIO (exercicio_id/exercicio_usuario_id)
-- > linha GERAL do treino (exercício NULL) > padrão 3. Peso/reps seguem do histórico.
--
-- grupo_id (treino do treinador) OU grupo_usuario_id (treino pessoal), nunca ambos.
-- exercicio_id (catálogo) OU exercicio_usuario_id (pessoal) OU nenhum (= geral do treino).
-- Idempotente: roda em public (prod) e staging; evolui a 1ª versão (sem colunas de exercício).

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      CONTINUE;
    END IF;

    EXECUTE format($fmt$
      CREATE TABLE IF NOT EXISTS %I.tb_series_padrao_usuario (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        grupo_id uuid REFERENCES %I.tb_grupos_treino(id) ON DELETE CASCADE,
        grupo_usuario_id uuid REFERENCES %I.tb_grupos_treino_usuario(id) ON DELETE CASCADE,
        exercicio_id uuid REFERENCES %I.tb_exercicios(id) ON DELETE CASCADE,
        exercicio_usuario_id uuid REFERENCES %I.tb_exercicios_usuario(id) ON DELETE CASCADE,
        num_series integer NOT NULL DEFAULT 3,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tb_series_padrao_usuario_alvo_check
          CHECK (num_nonnulls(grupo_id, grupo_usuario_id) = 1),
        CONSTRAINT tb_series_padrao_usuario_exercicio_check
          CHECK (num_nonnulls(exercicio_id, exercicio_usuario_id) <= 1),
        CONSTRAINT tb_series_padrao_usuario_num_check
          CHECK (num_series BETWEEN 1 AND 10)
      )$fmt$, s, s, s, s, s);

    -- evolução da 1ª versão (mesma sessão 02/09): colunas por exercício
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD COLUMN IF NOT EXISTS exercicio_id uuid', s);
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD COLUMN IF NOT EXISTS exercicio_usuario_id uuid', s);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tb_series_padrao_usuario_exercicio_id_fkey'
                   AND connamespace = s::regnamespace) THEN
      EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD CONSTRAINT tb_series_padrao_usuario_exercicio_id_fkey
                        FOREIGN KEY (exercicio_id) REFERENCES %I.tb_exercicios(id) ON DELETE CASCADE', s, s);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tb_series_padrao_usuario_exercicio_usuario_id_fkey'
                   AND connamespace = s::regnamespace) THEN
      EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD CONSTRAINT tb_series_padrao_usuario_exercicio_usuario_id_fkey
                        FOREIGN KEY (exercicio_usuario_id) REFERENCES %I.tb_exercicios_usuario(id) ON DELETE CASCADE', s, s);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tb_series_padrao_usuario_exercicio_check'
                   AND connamespace = s::regnamespace) THEN
      EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD CONSTRAINT tb_series_padrao_usuario_exercicio_check
                        CHECK (num_nonnulls(exercicio_id, exercicio_usuario_id) <= 1)', s);
    END IF;

    -- 1 linha por (usuário, treino, exercício-ou-geral): índice de expressão cobre os NULLs
    EXECUTE format('DROP INDEX IF EXISTS %I.tb_series_padrao_%s_grupo_uidx', s, s);
    EXECUTE format('DROP INDEX IF EXISTS %I.tb_series_padrao_%s_grupo_usuario_uidx', s, s);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS tb_series_padrao_%s_alvo_uidx
         ON %I.tb_series_padrao_usuario (
           user_id,
           coalesce(grupo_id::text, ''''), coalesce(grupo_usuario_id::text, ''''),
           coalesce(exercicio_id::text, ''''), coalesce(exercicio_usuario_id::text, '''')
         )', s, s);

    -- RLS: o aluno lê E grava o que é dele (adicionar/remover série no app espelha aqui);
    -- o admin grava via edge function (service role) e lê ao vivo pelo Realtime (política admin).
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ENABLE ROW LEVEL SECURITY', s);
    EXECUTE format('DROP POLICY IF EXISTS "Usuario le suas series padrao" ON %I.tb_series_padrao_usuario', s);
    EXECUTE format('DROP POLICY IF EXISTS "Usuario gerencia suas series padrao" ON %I.tb_series_padrao_usuario', s);
    EXECUTE format(
      'CREATE POLICY "Usuario gerencia suas series padrao" ON %I.tb_series_padrao_usuario
         FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', s);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_series_padrao" ON %I.tb_series_padrao_usuario', s);
    EXECUTE format(
      'CREATE POLICY "admin_all_series_padrao" ON %I.tb_series_padrao_usuario
         FOR ALL TO authenticated
         USING (((auth.jwt() -> ''app_metadata'') ->> ''role'') = ''admin'')
         WITH CHECK (((auth.jwt() -> ''app_metadata'') ->> ''role'') = ''admin'')', s);

    -- PowerSync lê via publicação (stream by_user)
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'powersync' AND schemaname = s AND tablename = 'tb_series_padrao_usuario'
      ) THEN
        EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I.tb_series_padrao_usuario', s);
      END IF;
    END IF;

    -- Realtime: o admin acompanha ao vivo o que o aluno muda no app (postgres_changes)
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = s AND tablename = 'tb_series_padrao_usuario'
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.tb_series_padrao_usuario', s);
      END IF;
    END IF;
  END LOOP;
END $$;
