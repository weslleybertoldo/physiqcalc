-- Planos globais (catálogo compartilhado entre alunos) + pagamento manual registrado pelo admin
-- (ex.: dinheiro vivo). Idempotente. Aplicar em public E staging.

DO $$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    -- catálogo global de planos; a atribuição ao aluno segue em physiq_profiles.plano_nome
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.physiq_planos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )$f$, sch);

    EXECUTE format('ALTER TABLE %I.physiq_planos ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read planos" ON %I.physiq_planos', sch);
    EXECUTE format('CREATE POLICY "Authenticated read planos" ON %I.physiq_planos FOR SELECT TO authenticated USING (true)', sch);
    -- catálogo gerido pelo admin precisa de policy de escrita além do SELECT (lição tb_exercicios 05/06)
    EXECUTE format('DROP POLICY IF EXISTS "Admin gerencia planos" ON %I.physiq_planos', sch);
    EXECUTE format($f$CREATE POLICY "Admin gerencia planos" ON %I.physiq_planos FOR ALL TO authenticated
      USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
      WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin')$f$, sch);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.physiq_planos TO authenticated', sch);
    EXECUTE format('GRANT ALL ON %I.physiq_planos TO service_role', sch);
    EXECUTE format('REVOKE ALL ON %I.physiq_planos FROM anon', sch);

    -- seed: planos já usados nos perfis deste schema
    EXECUTE format($f$INSERT INTO %I.physiq_planos (nome)
      SELECT DISTINCT btrim(plano_nome) FROM %I.physiq_profiles
      WHERE plano_nome IS NOT NULL AND btrim(plano_nome) <> ''
      ON CONFLICT (nome) DO NOTHING$f$, sch, sch);

    -- pagamento manual (registrado pelo admin, sem transação MP): tipo 'manual' + método
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos DROP CONSTRAINT IF EXISTS physiq_pagamentos_tipo_check', sch);
    EXECUTE format($f$ALTER TABLE %I.physiq_pagamentos ADD CONSTRAINT physiq_pagamentos_tipo_check
      CHECK (tipo IN ('pix', 'cartao', 'manual'))$f$, sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS metodo text', sch);
  END LOOP;

  -- staging ganha os mesmos planos do public (catálogo de teste não fica vazio)
  INSERT INTO staging.physiq_planos (nome)
    SELECT nome FROM public.physiq_planos
    ON CONFLICT (nome) DO NOTHING;
END $$;
