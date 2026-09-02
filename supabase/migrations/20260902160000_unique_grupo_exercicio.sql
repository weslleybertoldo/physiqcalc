-- tb_grupos_exercicios: o mesmo exercício não pode entrar 2x no mesmo treino.
--
-- Bug real (02/09): clique duplo no checkbox do admin antes do recarregamento inseriu
-- "Crucifixo Invertido" duas vezes no "Treino D + Superior" (a tabela só tinha PK em id).
-- O front ficou idempotente; aqui a garantia fica no banco.
--
-- Idempotente: roda em public (prod) e staging. Antes de criar a UNIQUE, apaga as
-- linhas repetidas mantendo a de menor ordem (empate: menor id).

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'tb_grupos_exercicios'
    ) THEN
      CONTINUE;
    END IF;

    -- dedupe: mantém 1 linha por par (grupo_id, exercicio_id)
    EXECUTE format(
      'DELETE FROM %I.tb_grupos_exercicios ge
        USING %I.tb_grupos_exercicios keep
        WHERE keep.grupo_id = ge.grupo_id
          AND keep.exercicio_id = ge.exercicio_id
          AND (COALESCE(keep.ordem, 0), keep.id) < (COALESCE(ge.ordem, 0), ge.id)', s, s);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = s AND t.relname = 'tb_grupos_exercicios'
        AND c.conname = 'tb_grupos_exercicios_grupo_exercicio_key'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.tb_grupos_exercicios
           ADD CONSTRAINT tb_grupos_exercicios_grupo_exercicio_key UNIQUE (grupo_id, exercicio_id)', s);
    END IF;
  END LOOP;
END $$;
