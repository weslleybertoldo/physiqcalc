-- Physiq W2 — espelho mínimo do núcleo no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb). Idempotente. SÓ ACRESCENTA.
-- Spec "Physiq Unificado - desenho aprovado" §8.2 (tabelas e colunas novas), §7.4 (troca de token).
--
-- Aplica em public e staging (bloco DO, padrão do repo). Para aplicar UM schema de cada vez (staging primeiro), na MESMA
-- sessão, antes do arquivo:
--   psql "<conexão>" -v ON_ERROR_STOP=1 -1 -c "set physiq.schemas = 'staging'" -f supabase/migrations/20260929030100_w02_espelho.sql
-- Sem o SET, roda nos 2. Backup antes: scripts/backup/pg_dump_tabelas.sh.
--
-- Tabelas novas (physiq_identidades, physiq_identidade_conflitos, physiq_espelho_membros): nenhum acesso pelo app
-- (RLS ligada sem política; GRANT só pro service_role) e FORA da publication do PowerSync — não sincronizam com o
-- aparelho (a spec só põe na publication o que o app lê pelo PowerSync). As colunas novas das tabelas sincronizadas
-- (physiq_profiles, tb_exercicios, tb_exercicios_usuario, tb_academias, tb_series_padrao_usuario) já seguem na
-- publication com a tabela, e as regras usam SELECT *; o app passa a enxergá-las pelo src/lib/powersync/schema.ts.

-- Delimitador $mig$ (e não $$): o corpo tem "$b$$f$" (fecha corpo de função + fecha format).
DO $mig$
DECLARE
  sch text;
  tbl text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;

    -- ===== vínculo de identidade: login do banco principal → usuário do Banco do Treino (trocar-token, scripts da virada)
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_identidades (
      principal_user_id uuid PRIMARY KEY,
      treino_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      email text,
      origem text NOT NULL CHECK (origem IN ('migracao', 'google', 'criado')),
      criado_em timestamptz NOT NULL DEFAULT now(),
      visto_em timestamptz
    )$f$, sch);

    -- ===== conflitos da troca: login por e-mail e senha, sem vínculo, com e-mail que já existe no Treino
    -- (ninguém toma a conta de outro criando um login com o e-mail dele — o master resolve no painel, W27)
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_identidade_conflitos (
      principal_user_id uuid PRIMARY KEY,
      email text NOT NULL,
      treino_user_id uuid,
      motivo text NOT NULL DEFAULT 'email_existente_sem_vinculo',
      tentativas integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      ultima_em timestamptz NOT NULL DEFAULT now(),
      resolvido_em timestamptz
    )$f$, sch);

    -- ===== espelho dos membros das contas (dono / personal / nutricionista por conta) — usado pelas funções do Treino
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_espelho_membros (
      conta_id uuid NOT NULL,
      treino_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      papeis text[] NOT NULL DEFAULT '{}',
      ativo boolean NOT NULL DEFAULT true,
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (conta_id, treino_user_id)
    )$f$, sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_espelho_membros_user_idx ON %I.physiq_espelho_membros (treino_user_id)', sch);

    FOREACH tbl IN ARRAY ARRAY['physiq_identidades', 'physiq_identidade_conflitos', 'physiq_espelho_membros'] LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, tbl);
      EXECUTE format('REVOKE ALL ON %I.%I FROM anon, authenticated', sch, tbl);
      EXECUTE format('GRANT ALL ON %I.%I TO service_role', sch, tbl);
    END LOOP;

    -- ===== colunas novas (todas opcionais)
    -- physiq_profiles: espelho da matrícula (conta) + próxima avaliação e troca do treino (NF7)
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS conta_id uuid', sch);
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS proxima_avaliacao date', sch);
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS proxima_troca_treino date', sch);
    -- physiq_professores: espelho do acesso da conta (a physiq_professor_acesso_ok passa a olhar isto na W28)
    EXECUTE format('ALTER TABLE %I.physiq_professores ADD COLUMN IF NOT EXISTS nucleo_acesso_ate date', sch);
    -- equivalência de exercícios (W9): listas fixas no código (src/treino/equivalencia.ts)
    FOREACH tbl IN ARRAY ARRAY['tb_exercicios', 'tb_exercicios_usuario'] LOOP
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS padrao_movimento text', sch, tbl);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS equipamento text', sch, tbl);
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS variacao text', sch, tbl);
    END LOOP;
    -- equipamentos da academia (NF11): vazio = sem filtro
    EXECUTE format('ALTER TABLE %I.tb_academias ADD COLUMN IF NOT EXISTS equipamentos text[]', sch);
    -- prescrição (NF1/NF2): repetições-alvo ("10" ou "8-12"), descanso e carga por exercício; observação na linha do treino
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD COLUMN IF NOT EXISTS reps_alvo text', sch);
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD COLUMN IF NOT EXISTS descanso_segundos integer', sch);
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD COLUMN IF NOT EXISTS carga_sugerida_kg numeric(6,2)', sch);
    EXECUTE format('ALTER TABLE %I.tb_series_padrao_usuario ADD COLUMN IF NOT EXISTS observacao text', sch);

    -- ===== achar o usuário do Treino pelo e-mail (só a trocar-token, e só quando o login do principal é Google)
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_auth_user_id_por_email(p_email text) RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$
      SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(btrim(p_email)) ORDER BY u.created_at LIMIT 1 $b$$f$, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_auth_user_id_por_email(text) FROM PUBLIC, anon, authenticated', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_auth_user_id_por_email(text) TO service_role', sch);

    -- ===== guardas: as colunas novas que vêm do núcleo não mudam pelo app (role authenticated, fora do master)
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $b$
      BEGIN
        IF current_setting('request.jwt.claims', true) IS NOT NULL
           AND current_setting('request.jwt.claims', true) <> ''
           AND (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
           AND NOT %I.physiq_is_master() THEN
          IF NEW.professor_id IS DISTINCT FROM OLD.professor_id THEN
            NEW.professor_id := OLD.professor_id;
          END IF;
          -- W2: a conta do aluno é espelho do núcleo (trocar-token / espelho-nucleo), nunca escrita pelo app
          IF NEW.conta_id IS DISTINCT FROM OLD.conta_id THEN
            NEW.conta_id := OLD.conta_id;
          END IF;
        END IF;
        RETURN NEW;
      END $b$$f$, sch, sch);
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_professores_guard() RETURNS trigger LANGUAGE plpgsql AS $b$
      BEGIN
        IF current_setting('request.jwt.claims', true) IS NOT NULL
           AND current_setting('request.jwt.claims', true) <> ''
           AND (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
           AND NOT %I.physiq_is_master() THEN
          NEW.status := OLD.status; NEW.codigo_convite := OLD.codigo_convite; NEW.plano_id := OLD.plano_id;
          NEW.trial_ate := OLD.trial_ate; NEW.adesao_paga_em := OLD.adesao_paga_em; NEW.ciclo_inicio := OLD.ciclo_inicio;
          NEW.ciclo_vence_em := OLD.ciclo_vence_em; NEW.ciclo_valor := OLD.ciclo_valor; NEW.anual_ate := OLD.anual_ate;
          NEW.cobranca_pausada := OLD.cobranca_pausada; NEW.acesso_liberado_ate := OLD.acesso_liberado_ate;
          NEW.alunos_bloqueados_em := OLD.alunos_bloqueados_em; NEW.alunos_bloqueados_msg := OLD.alunos_bloqueados_msg;
          NEW.email := OLD.email; NEW.created_at := OLD.created_at;
          -- W2: o acesso espelhado da conta não muda pelo app
          NEW.nucleo_acesso_ate := OLD.nucleo_acesso_ate;
        END IF;
        RETURN NEW;
      END $b$$f$, sch, sch);
  END LOOP;
END $mig$;
