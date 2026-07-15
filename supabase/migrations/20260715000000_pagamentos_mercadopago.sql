-- Pagamentos Mercado Pago: mensalidade por aluno, pagamentos (Pix manual) e assinaturas (cartão recorrente).
-- Idempotente. Aplicar em public E staging.

DO $$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    -- valor da mensalidade definido pelo admin (NULL = sem cobrança)
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS mensalidade_valor numeric', sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.physiq_pagamentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        tipo text NOT NULL CHECK (tipo IN ('pix', 'cartao')),
        valor numeric NOT NULL CHECK (valor > 0),
        mes_ref date NOT NULL,
        mp_payment_id text UNIQUE,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back', 'in_process')),
        pix_qr_code text,
        pix_qr_code_base64 text,
        pix_expira_em timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )$f$, sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_pagamentos_user_mes_idx ON %I.physiq_pagamentos (user_id, mes_ref DESC)', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS pix_expira_em timestamptz', sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.physiq_assinaturas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        mp_preapproval_id text UNIQUE,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'authorized', 'paused', 'cancelled')),
        valor numeric NOT NULL CHECK (valor > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )$f$, sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_assinaturas_user_idx ON %I.physiq_assinaturas (user_id)', sch);

    -- RLS: aluno lê o próprio; escrita só via service_role (edge functions)
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('ALTER TABLE %I.physiq_assinaturas ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Users read own pagamentos" ON %I.physiq_pagamentos', sch);
    EXECUTE format('CREATE POLICY "Users read own pagamentos" ON %I.physiq_pagamentos FOR SELECT TO authenticated USING (auth.uid() = user_id)', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Users read own assinaturas" ON %I.physiq_assinaturas', sch);
    EXECUTE format('CREATE POLICY "Users read own assinaturas" ON %I.physiq_assinaturas FOR SELECT TO authenticated USING (auth.uid() = user_id)', sch);

    -- defesa em camadas: nenhum write direto de client
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I.physiq_pagamentos FROM anon, authenticated', sch);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I.physiq_assinaturas FROM anon, authenticated', sch);
    EXECUTE format('REVOKE SELECT ON %I.physiq_pagamentos FROM anon', sch);
    EXECUTE format('REVOKE SELECT ON %I.physiq_assinaturas FROM anon', sch);
  END LOOP;
END $$;
