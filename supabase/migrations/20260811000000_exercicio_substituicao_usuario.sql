-- Substituição de exercício no treino (troca "só do dia" ou "definitiva")
--
-- data_treino NULL  = substituição DEFINITIVA (vale em qualquer data)
-- data_treino = data = substituição SÓ DAQUELE DIA
--
-- Grupo pessoal + definitiva é resolvido editando tb_grupos_exercicios_usuario direto
-- (o exercício sai do grupo de verdade); esta tabela cobre:
--   (a) troca do dia em qualquer grupo;
--   (b) troca definitiva em grupo do treinador (catálogo é compartilhado, não pode ser editado).
--
-- Idempotente: roda em public (prod) e staging.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      CONTINUE;
    END IF;

    EXECUTE format($fmt$
      CREATE TABLE IF NOT EXISTS %I.exercicio_substituicao_usuario (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        grupo_id text NOT NULL,
        slot_idx integer NOT NULL DEFAULT 0,
        exercicio_origem_id text NOT NULL,
        exercicio_novo_id uuid,
        exercicio_novo_usuario_id uuid,
        data_treino date,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        CONSTRAINT exercicio_substituicao_novo_check
          CHECK (num_nonnulls(exercicio_novo_id, exercicio_novo_usuario_id) = 1)
      )$fmt$, s);

    -- FK do dono (mesmo padrão de exercicio_ordem_usuario)
    EXECUTE format(
      'ALTER TABLE %I.exercicio_substituicao_usuario
         DROP CONSTRAINT IF EXISTS exercicio_substituicao_usuario_user_id_fkey', s);
    EXECUTE format(
      'ALTER TABLE %I.exercicio_substituicao_usuario
         ADD CONSTRAINT exercicio_substituicao_usuario_user_id_fkey
         FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', s);

    -- Uma substituição por (user, grupo, slot, exercício de origem) em cada escopo.
    -- Índices parciais porque data_treino NULL não é comparável em UNIQUE comum.
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS exercicio_subst_%s_definitiva_uidx
         ON %I.exercicio_substituicao_usuario (user_id, grupo_id, slot_idx, exercicio_origem_id)
         WHERE data_treino IS NULL', s, s);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS exercicio_subst_%s_dia_uidx
         ON %I.exercicio_substituicao_usuario (user_id, grupo_id, slot_idx, exercicio_origem_id, data_treino)
         WHERE data_treino IS NOT NULL', s, s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS exercicio_subst_%s_user_grupo_idx
         ON %I.exercicio_substituicao_usuario (user_id, grupo_id)', s, s);

    -- RLS: cada um enxerga/mexe só no que é seu
    EXECUTE format('ALTER TABLE %I.exercicio_substituicao_usuario ENABLE ROW LEVEL SECURITY', s);
    EXECUTE format(
      'DROP POLICY IF EXISTS "Users manage own exercise substitution"
         ON %I.exercicio_substituicao_usuario', s);
    EXECUTE format(
      'CREATE POLICY "Users manage own exercise substitution"
         ON %I.exercicio_substituicao_usuario
         FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', s);

    -- PowerSync lê via publicação logical replication
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'powersync' AND schemaname = s
          AND tablename = 'exercicio_substituicao_usuario'
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION powersync ADD TABLE %I.exercicio_substituicao_usuario', s);
      END IF;
    END IF;
  END LOOP;
END $$;
