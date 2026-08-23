-- Treino alternado por dia da semana + treinos extras atrelados.
-- tb_semana_dia_config: 1 linha por (user, dia) com o toggle e a âncora da rotação.
-- tb_semana_treinos ganha linhas "extra" (slot_idx >= 100) atreladas a um treino
-- da rotação (ou a todos, quando os campos de atrelamento são NULL).
-- Idempotente; aplica em public E staging.

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'staging'] LOOP
    EXECUTE format('ALTER TABLE %I.tb_semana_treinos ADD COLUMN IF NOT EXISTS extra boolean NOT NULL DEFAULT false', s);
    EXECUTE format('ALTER TABLE %I.tb_semana_treinos ADD COLUMN IF NOT EXISTS extra_atrelado_grupo_id uuid', s);
    EXECUTE format('ALTER TABLE %I.tb_semana_treinos ADD COLUMN IF NOT EXISTS extra_atrelado_grupo_usuario_id uuid', s);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.tb_semana_dia_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      dia_semana text NOT NULL,
      alternado boolean NOT NULL DEFAULT false,
      alternado_inicio date,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, dia_semana)
    )', s);
    EXECUTE format('ALTER TABLE %I.tb_semana_dia_config ENABLE ROW LEVEL SECURITY', s);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = s AND tablename = 'tb_semana_dia_config'
        AND policyname = 'Usuario le propria config da semana'
    ) THEN
      EXECUTE format('CREATE POLICY "Usuario le propria config da semana" ON %I.tb_semana_dia_config FOR SELECT TO authenticated USING (auth.uid() = user_id)', s);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'powersync' AND schemaname = s AND tablename = 'tb_semana_dia_config'
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I.tb_semana_dia_config', s);
    END IF;
  END LOOP;
END $$;
