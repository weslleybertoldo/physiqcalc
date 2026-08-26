-- Remoção de exercício do treino ("remover neste dia" / "remover definitivo")
--
-- Reaproveita exercicio_substituicao_usuario: uma linha SEM exercício novo
-- (exercicio_novo_id e exercicio_novo_usuario_id ambos NULL) significa que o
-- exercício de origem foi REMOVIDO do treino naquele escopo:
--   data_treino = data  → removido só naquele dia
--   data_treino NULL    → removido definitivamente (grupo do treinador)
-- Grupo pessoal + definitivo continua editando tb_grupos_exercicios_usuario direto.
--
-- Antes o CHECK exigia exatamente 1 exercício novo; agora aceita 0 ou 1
-- (2 preenchidos continua inválido).
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
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'exercicio_substituicao_usuario'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.exercicio_substituicao_usuario
         DROP CONSTRAINT IF EXISTS exercicio_substituicao_novo_check', s);
    EXECUTE format(
      'ALTER TABLE %I.exercicio_substituicao_usuario
         ADD CONSTRAINT exercicio_substituicao_novo_check
         CHECK (num_nonnulls(exercicio_novo_id, exercicio_novo_usuario_id) <= 1)', s);
  END LOOP;
END $$;
