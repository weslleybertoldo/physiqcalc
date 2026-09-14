-- Recebimentos do professor como LISTA (pedido 13/09/2026): "Integração com Mercado Pago" (só master) + chaves Pix
-- criadas pelo professor no popup "Adicionar"; SÓ 1 ATIVO por professor. O ativo é ESPELHADO (trigger) em
-- physiq_professores.pix_*/pix_exibir e em physiq_integracoes.tipo — a tela Pagamentos do aluno e as edges
-- (mp-payments) continuam lendo o modelo antigo sem mudança. public + staging.
DO $mig$
DECLARE sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_recebimentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id uuid NOT NULL REFERENCES %I.physiq_professores(id) ON DELETE CASCADE,
      tipo text NOT NULL CHECK (tipo IN ('pix','mercadopago')),
      pix_tipo text NULL CHECK (pix_tipo IS NULL OR pix_tipo IN ('cpf','cnpj','email','telefone','aleatoria')),
      pix_chave text NULL,
      pix_favorecido text NULL,
      pix_banco text NULL,
      ativo boolean NOT NULL DEFAULT false,
      criado_em timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT physiq_recebimentos_pix_completo CHECK (tipo <> 'pix' OR (pix_tipo IS NOT NULL AND pix_chave IS NOT NULL))
    )$f$, sch, sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_recebimentos_professor_idx ON %I.physiq_recebimentos (professor_id)', sch);
    -- só 1 ativo por professor; só 1 item Mercado Pago por professor
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS physiq_recebimentos_um_ativo ON %I.physiq_recebimentos (professor_id) WHERE ativo', sch);
    EXECUTE format($f$CREATE UNIQUE INDEX IF NOT EXISTS physiq_recebimentos_um_mp ON %I.physiq_recebimentos (professor_id) WHERE tipo = 'mercadopago'$f$, sch);

    EXECUTE format('ALTER TABLE %I.physiq_recebimentos ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.physiq_recebimentos TO authenticated', sch);
    EXECUTE format('GRANT ALL ON %I.physiq_recebimentos TO service_role', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor gerencia os proprios recebimentos" ON %I.physiq_recebimentos', sch);
    -- professor (staff) só nas próprias linhas; item 'mercadopago' só o master (mesma regra da edge master-professores)
    EXECUTE format($f$CREATE POLICY "Professor gerencia os proprios recebimentos" ON %I.physiq_recebimentos FOR ALL TO authenticated
      USING (professor_id = auth.uid() AND %I.physiq_is_staff())
      WITH CHECK (professor_id = auth.uid() AND %I.physiq_is_staff() AND (tipo <> 'mercadopago' OR %I.physiq_is_master()))$f$, sch, sch, sch, sch);

    -- carga inicial ANTES do trigger (não mexe no estado atual): Mercado Pago de quem já tem a integração; Pix de quem já tem chave
    EXECUTE format($f$INSERT INTO %I.physiq_recebimentos (professor_id, tipo, ativo)
      SELECT i.professor_id, 'mercadopago', true FROM %I.physiq_integracoes i
      WHERE i.tipo = 'mercadopago'
        AND NOT EXISTS (SELECT 1 FROM %I.physiq_recebimentos r WHERE r.professor_id = i.professor_id AND r.tipo = 'mercadopago')$f$, sch, sch, sch);
    EXECUTE format($f$INSERT INTO %I.physiq_recebimentos (professor_id, tipo, pix_tipo, pix_chave, pix_favorecido, pix_banco, ativo)
      SELECT p.id, 'pix', p.pix_tipo, p.pix_chave, p.pix_favorecido, p.pix_banco,
             (p.pix_exibir AND COALESCE(i.tipo, 'pix_manual') <> 'mercadopago')
      FROM %I.physiq_professores p LEFT JOIN %I.physiq_integracoes i ON i.professor_id = p.id
      WHERE p.pix_chave IS NOT NULL AND p.pix_tipo IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM %I.physiq_recebimentos r WHERE r.professor_id = p.id AND r.tipo = 'pix')$f$, sch, sch, sch, sch);

    -- espelho: o recebimento ATIVO manda em physiq_professores.pix_*/pix_exibir e em physiq_integracoes.tipo
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_recebimentos_sync() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp AS $fn$
      DECLARE pid uuid; r record;
      BEGIN
        pid := COALESCE(NEW.professor_id, OLD.professor_id);
        SELECT * INTO r FROM physiq_recebimentos WHERE professor_id = pid AND ativo LIMIT 1;
        IF r.id IS NULL THEN
          UPDATE physiq_professores SET pix_tipo = NULL, pix_chave = NULL, pix_favorecido = NULL, pix_banco = NULL, pix_exibir = false WHERE id = pid;
          UPDATE physiq_integracoes SET tipo = 'pix_manual', atualizado_em = now() WHERE professor_id = pid AND tipo = 'mercadopago';
        ELSIF r.tipo = 'pix' THEN
          UPDATE physiq_professores SET pix_tipo = r.pix_tipo, pix_chave = r.pix_chave, pix_favorecido = r.pix_favorecido, pix_banco = r.pix_banco, pix_exibir = true WHERE id = pid;
          INSERT INTO physiq_integracoes (professor_id, tipo, atualizado_em) VALUES (pid, 'pix_manual', now())
            ON CONFLICT (professor_id) DO UPDATE SET tipo = 'pix_manual', atualizado_em = now();
        ELSE
          UPDATE physiq_professores SET pix_tipo = NULL, pix_chave = NULL, pix_favorecido = NULL, pix_banco = NULL, pix_exibir = false WHERE id = pid;
          INSERT INTO physiq_integracoes (professor_id, tipo, atualizado_em) VALUES (pid, 'mercadopago', now())
            ON CONFLICT (professor_id) DO UPDATE SET tipo = 'mercadopago', atualizado_em = now();
        END IF;
        RETURN NULL;
      END $fn$$f$, sch, sch);
    EXECUTE format('DROP TRIGGER IF EXISTS physiq_recebimentos_sync_trg ON %I.physiq_recebimentos', sch);
    EXECUTE format('CREATE TRIGGER physiq_recebimentos_sync_trg AFTER INSERT OR UPDATE OR DELETE ON %I.physiq_recebimentos FOR EACH ROW EXECUTE FUNCTION %I.physiq_recebimentos_sync()', sch, sch);

    -- ligar em 1 chamada (RPC): desliga os outros e liga o escolhido — ou cria o item Mercado Pago do master (p_id NULL + p_tipo).
    -- SECURITY INVOKER: a RLS acima continua valendo (só as próprias linhas; 'mercadopago' só master).
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_recebimentos_ativar(p_id uuid DEFAULT NULL, p_tipo text DEFAULT NULL) RETURNS uuid
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = %I, pg_temp AS $fn$
      DECLARE pid uuid := auth.uid(); rid uuid := p_id;
      BEGIN
        UPDATE physiq_recebimentos SET ativo = false WHERE professor_id = pid AND ativo AND (rid IS NULL OR id <> rid);
        IF rid IS NULL THEN
          IF p_tipo IS DISTINCT FROM 'mercadopago' THEN RAISE EXCEPTION 'recebimento_invalido'; END IF;
          INSERT INTO physiq_recebimentos (professor_id, tipo, ativo) VALUES (pid, 'mercadopago', true) RETURNING id INTO rid;
        ELSE
          UPDATE physiq_recebimentos SET ativo = true WHERE id = rid AND professor_id = pid;
          IF NOT FOUND THEN RAISE EXCEPTION 'recebimento_nao_encontrado'; END IF;
        END IF;
        RETURN rid;
      END $fn$$f$, sch, sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_recebimentos_ativar(uuid, text) TO authenticated', sch);
  END LOOP;
END $mig$;
