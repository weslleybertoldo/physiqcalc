-- Pausar cobrança por perfil: aluno pausado não vê pendência nem opções de pagamento.
ALTER TABLE public.physiq_profiles ADD COLUMN IF NOT EXISTS cobranca_pausada boolean NOT NULL DEFAULT false;
ALTER TABLE staging.physiq_profiles ADD COLUMN IF NOT EXISTS cobranca_pausada boolean NOT NULL DEFAULT false;
