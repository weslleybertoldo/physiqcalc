-- SaaS: master → professores → alunos (plano + protótipo v6 de 12/09/2026).
-- Idempotente. Aplica em public (prod) e staging. Só ADICIONA colunas/tabelas/policies —
-- o app antigo ignora o que não conhece, então pode ir pro banco antes do frontend.
--
-- Papéis: JWT app_metadata.role = 'admin' | 'master' → master; 'professor' → professor; sem role → aluno.
-- Vínculo: physiq_profiles.professor_id. Catálogos ganham professor_id (NULL = global do master).
-- Cobrança do professor: physiq_professores (plano, ciclo pós-pago, trial, anual, trava) +
-- physiq_pagamentos.contexto = 'plano_professor'. Pix manual do aluno: tipo 'pix_manual' + comprovante.

-- Delimitador $mig$ (e não $$): o corpo tem "$b$$f$" (fecha corpo de função + fecha format), que contém "$$" e encerraria o bloco.
DO $mig$
DECLARE
  sch text;
  tbl text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public','staging'] LOOP
    -- ===== planos dos professores (editáveis pelo master) =====
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_planos_professor (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL UNIQUE,
      min_alunos int NOT NULL DEFAULT 1,
      max_alunos int NULL,
      valor_mensal numeric(10,2) NOT NULL,
      valor_anual numeric(10,2) NULL,
      ordem int NOT NULL DEFAULT 0,
      ativo boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    )$f$, sch);
    EXECUTE format($f$INSERT INTO %I.physiq_planos_professor (nome, min_alunos, max_alunos, valor_mensal, valor_anual, ordem) VALUES
      ('Start', 1, 10, 39.90, 399.00, 1),
      ('Studio', 11, 30, 79.90, 799.00, 2),
      ('Pro', 31, 100, 149.90, 1499.00, 3),
      ('Ilimitado', 1, NULL, 300.00, 3000.00, 4)
      ON CONFLICT (nome) DO NOTHING$f$, sch);
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_planos_professor_hist (
      id bigserial PRIMARY KEY,
      plano_id uuid NULL,
      professor_id uuid NULL,
      alterado_por uuid NULL,
      alterado_em timestamptz NOT NULL DEFAULT now(),
      antes jsonb, depois jsonb
    )$f$, sch);

    -- ===== professores =====
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_professores (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      nome text NOT NULL,
      email text,
      foto_url text,
      status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso')),
      codigo_convite text NOT NULL UNIQUE,
      pix_tipo text CHECK (pix_tipo IN ('cpf','cnpj','email','telefone','aleatoria')),
      pix_chave text, pix_favorecido text, pix_banco text,
      pix_exibir boolean NOT NULL DEFAULT true,
      plano_id uuid NULL REFERENCES %I.physiq_planos_professor(id),
      trial_ate date, adesao_paga_em date,
      ciclo_inicio date, ciclo_vence_em date, ciclo_valor numeric(10,2), anual_ate date,
      cobranca_pausada boolean NOT NULL DEFAULT false,
      acesso_liberado_ate date,
      alunos_bloqueados_em timestamptz, alunos_bloqueados_msg text,
      created_at timestamptz NOT NULL DEFAULT now()
    )$f$, sch, sch);

    -- ===== vínculo aluno -> professor =====
    EXECUTE format('ALTER TABLE %I.physiq_profiles ADD COLUMN IF NOT EXISTS professor_id uuid NULL REFERENCES %I.physiq_professores(id) ON DELETE SET NULL', sch, sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_profiles_professor_idx ON %I.physiq_profiles (professor_id)', sch);

    -- ===== catálogos com dono (NULL = global do master) =====
    FOREACH tbl IN ARRAY ARRAY['tb_exercicios','grupos_musculares','tb_grupos_treino','tb_pastas_treino','physiq_tags','physiq_planos'] LOOP
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS professor_id uuid NULL', sch, tbl);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (professor_id)', tbl || '_professor_idx', sch, tbl);
    END LOOP;

    -- ===== pagamentos: contexto (aluno | plano_professor), pix manual com comprovante =====
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS contexto text NOT NULL DEFAULT ''aluno''', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos DROP CONSTRAINT IF EXISTS physiq_pagamentos_contexto_check', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD CONSTRAINT physiq_pagamentos_contexto_check CHECK (contexto IN (''aluno'',''plano_professor''))', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS plano_id uuid NULL', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS tipo_cobranca text NULL', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS comprovante_path text NULL', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS confirmado_por uuid NULL', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD COLUMN IF NOT EXISTS recusado_motivo text NULL', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos DROP CONSTRAINT IF EXISTS physiq_pagamentos_tipo_check', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD CONSTRAINT physiq_pagamentos_tipo_check CHECK (tipo IN (''pix'',''cartao'',''manual'',''pix_manual''))', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos DROP CONSTRAINT IF EXISTS physiq_pagamentos_status_check', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD CONSTRAINT physiq_pagamentos_status_check CHECK (status IN (''pending'',''approved'',''rejected'',''cancelled'',''expired'',''refunded'',''charged_back'',''in_process'',''aguardando_confirmacao''))', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos DROP CONSTRAINT IF EXISTS physiq_pagamentos_pix_manual_comprovante', sch);
    EXECUTE format('ALTER TABLE %I.physiq_pagamentos ADD CONSTRAINT physiq_pagamentos_pix_manual_comprovante CHECK (tipo <> ''pix_manual'' OR comprovante_path IS NOT NULL)', sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_pagamentos_contexto_idx ON %I.physiq_pagamentos (contexto, user_id)', sch);
    EXECUTE format('ALTER TABLE %I.physiq_assinaturas ADD COLUMN IF NOT EXISTS contexto text NOT NULL DEFAULT ''aluno''', sch);

    -- ===== convites, integrações, avisos =====
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_convites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id uuid NULL REFERENCES %I.physiq_professores(id) ON DELETE CASCADE,
      email text NOT NULL,
      papel text NOT NULL DEFAULT 'aluno' CHECK (papel IN ('aluno','professor')),
      status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito','revogado')),
      criado_por uuid NULL,
      enviado_em timestamptz NOT NULL DEFAULT now(),
      aceito_em timestamptz NULL
    )$f$, sch, sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_convites_email_idx ON %I.physiq_convites (lower(email)) WHERE status = ''pendente''', sch);
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_integracoes (
      professor_id uuid PRIMARY KEY REFERENCES %I.physiq_professores(id) ON DELETE CASCADE,
      tipo text NOT NULL DEFAULT 'pix_manual' CHECK (tipo IN ('mercadopago','pix_manual','none')),
      status text NOT NULL DEFAULT 'ativa',
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      atualizado_em timestamptz NOT NULL DEFAULT now()
    )$f$, sch, sch);
    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %I.physiq_avisos_plano (
      id bigserial PRIMARY KEY,
      professor_id uuid NOT NULL REFERENCES %I.physiq_professores(id) ON DELETE CASCADE,
      ciclo_vence_em date NOT NULL,
      dia int NOT NULL,
      canal text NOT NULL DEFAULT 'app',
      mensagem text NULL,
      enviado_em timestamptz NOT NULL DEFAULT now(),
      UNIQUE (professor_id, ciclo_vence_em, dia, canal)
    )$f$, sch, sch);

    -- ===== app_config (regras gerais editáveis na aba Planos do master) =====
    EXECUTE format($f$INSERT INTO %I.app_config (key, value)
      SELECT k, v FROM (VALUES ('adesao_professor','500'), ('tolerancia_dias','7'), ('trial_dias','14'), ('itens_pagina','20')) AS t(k, v)
      WHERE NOT EXISTS (SELECT 1 FROM %I.app_config c WHERE c.key = t.k)$f$, sch, sch);

    -- ===== funções de papel / acesso =====
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_papel() RETURNS text LANGUAGE sql STABLE AS $b$
      SELECT CASE WHEN (auth.jwt()->'app_metadata'->>'role') IN ('admin','master') THEN 'master'
                  WHEN (auth.jwt()->'app_metadata'->>'role') = 'professor' THEN 'professor'
                  ELSE 'aluno' END $b$$f$, sch);
    EXECUTE format('CREATE OR REPLACE FUNCTION %I.physiq_is_master() RETURNS boolean LANGUAGE sql STABLE AS $b$ SELECT %I.physiq_papel() = ''master'' $b$', sch, sch);
    EXECUTE format('CREATE OR REPLACE FUNCTION %I.physiq_is_staff() RETURNS boolean LANGUAGE sql STABLE AS $b$ SELECT %I.physiq_papel() IN (''master'',''professor'') $b$', sch, sch);
    -- acesso do professor liberado? (ativo E: cobrança pausada | liberado até | trial | anual | ciclo dentro da tolerância)
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_professor_acesso_ok(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $b$
      SELECT COALESCE((
        SELECT p.status = 'ativo' AND (
               p.cobranca_pausada
            OR p.acesso_liberado_ate >= current_date
            OR p.trial_ate >= current_date
            OR p.anual_ate >= current_date
            OR (p.ciclo_vence_em + COALESCE((SELECT value::int FROM %I.app_config WHERE key = 'tolerancia_dias'), 7)) >= current_date)
        FROM %I.physiq_professores p WHERE p.id = pid), false) $b$$f$, sch, sch, sch);
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_aluno_bloqueado(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $b$
      SELECT COALESCE((SELECT pr.alunos_bloqueados_em IS NOT NULL
                       FROM %I.physiq_profiles a JOIN %I.physiq_professores pr ON pr.id = a.professor_id
                       WHERE a.id = uid), false) $b$$f$, sch, sch, sch);
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_professor_pode_convidar(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $b$
      SELECT COALESCE((
        SELECT pl.max_alunos IS NULL OR p.plano_id IS NULL OR (SELECT count(*) FROM %I.physiq_profiles a WHERE a.professor_id = p.id AND COALESCE(a.status,'ativo') <> 'bloqueado') < pl.max_alunos
        FROM %I.physiq_professores p LEFT JOIN %I.physiq_planos_professor pl ON pl.id = p.plano_id
        WHERE p.id = pid AND p.status = 'ativo'), false) $b$$f$, sch, sch, sch, sch);
    -- código PROF-NOME-SOBRENOME; homônimo -> -INICIAIS, -INICIAIS1, -INICIAIS2 ... (default assumido 12/09)
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_gerar_codigo_professor(p_nome text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $b$
      DECLARE base text; iniciais text; cand text; n int := 0;
      BEGIN
        base := regexp_replace(upper(translate(btrim(COALESCE(p_nome, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^A-Z0-9]+', '-', 'g');
        base := btrim(base, '-');
        IF base = '' THEN base := 'PROFESSOR'; END IF;
        base := 'PROF-' || base;
        IF NOT EXISTS (SELECT 1 FROM %I.physiq_professores WHERE codigo_convite = base) THEN RETURN base; END IF;
        iniciais := (SELECT string_agg(left(w, 1), '') FROM regexp_split_to_table(replace(base, 'PROF-', ''), '-') AS w);
        cand := base || '-' || iniciais;
        WHILE EXISTS (SELECT 1 FROM %I.physiq_professores WHERE codigo_convite = cand) LOOP
          n := n + 1; cand := base || '-' || iniciais || n::text;
        END LOOP;
        RETURN cand;
      END $b$$f$, sch, sch, sch);
    -- dados públicos do professor pro aluno (nome, pix se exibido, bloqueio) — só do PRÓPRIO professor
    EXECUTE format('DROP FUNCTION IF EXISTS %I.physiq_meu_professor()', sch);
    EXECUTE format($f$CREATE FUNCTION %I.physiq_meu_professor() RETURNS TABLE (id uuid, nome text, pix_tipo text, pix_chave text, pix_favorecido text, pix_banco text, alunos_bloqueados boolean, alunos_bloqueados_msg text)
      LANGUAGE sql STABLE SECURITY DEFINER AS $b$
      SELECT p.id, p.nome,
             CASE WHEN p.pix_exibir THEN p.pix_tipo END, CASE WHEN p.pix_exibir THEN p.pix_chave END,
             CASE WHEN p.pix_exibir THEN p.pix_favorecido END, CASE WHEN p.pix_exibir THEN p.pix_banco END,
             p.alunos_bloqueados_em IS NOT NULL, p.alunos_bloqueados_msg
      FROM %I.physiq_profiles a JOIN %I.physiq_professores p ON p.id = a.professor_id
      WHERE a.id = auth.uid() $b$$f$, sch, sch, sch);

    -- ===== guardas: aluno não muda professor_id; professor não muda plano/ciclo/bloqueio =====
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $b$
      BEGIN
        IF current_setting('request.jwt.claims', true) IS NOT NULL
           AND current_setting('request.jwt.claims', true) <> ''
           AND (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
           AND NOT %I.physiq_is_master()
           AND NEW.professor_id IS DISTINCT FROM OLD.professor_id THEN
          NEW.professor_id := OLD.professor_id;
        END IF;
        RETURN NEW;
      END $b$$f$, sch, sch);
    EXECUTE format('DROP TRIGGER IF EXISTS physiq_profiles_guard_trg ON %I.physiq_profiles', sch);
    EXECUTE format('CREATE TRIGGER physiq_profiles_guard_trg BEFORE UPDATE ON %I.physiq_profiles FOR EACH ROW EXECUTE FUNCTION %I.physiq_profiles_guard()', sch, sch);
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
        END IF;
        RETURN NEW;
      END $b$$f$, sch, sch);
    EXECUTE format('DROP TRIGGER IF EXISTS physiq_professores_guard_trg ON %I.physiq_professores', sch);
    EXECUTE format('CREATE TRIGGER physiq_professores_guard_trg BEFORE UPDATE ON %I.physiq_professores FOR EACH ROW EXECUTE FUNCTION %I.physiq_professores_guard()', sch, sch);

    -- ===== RLS das tabelas novas =====
    FOREACH tbl IN ARRAY ARRAY['physiq_planos_professor','physiq_planos_professor_hist','physiq_professores','physiq_convites','physiq_integracoes','physiq_avisos_plano'] LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO authenticated', sch, tbl);
      EXECUTE format('GRANT ALL ON %I.%I TO service_role', sch, tbl);
      EXECUTE format('REVOKE ALL ON %I.%I FROM anon', sch, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Master tudo" ON %I.%I', sch, tbl);
      EXECUTE format('CREATE POLICY "Master tudo" ON %I.%I FOR ALL TO authenticated USING (%I.physiq_is_master()) WITH CHECK (%I.physiq_is_master())', sch, tbl, sch, sch);
    END LOOP;
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO authenticated, service_role', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read planos professor" ON %I.physiq_planos_professor', sch);
    EXECUTE format('CREATE POLICY "Authenticated read planos professor" ON %I.physiq_planos_professor FOR SELECT TO authenticated USING (true)', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor le e edita a propria linha" ON %I.physiq_professores', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor le a propria linha" ON %I.physiq_professores', sch);
    EXECUTE format('CREATE POLICY "Professor le a propria linha" ON %I.physiq_professores FOR SELECT TO authenticated USING (id = auth.uid())', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor edita a propria linha" ON %I.physiq_professores', sch);
    EXECUTE format('CREATE POLICY "Professor edita a propria linha" ON %I.physiq_professores FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid())', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor gerencia convites de aluno" ON %I.physiq_convites', sch);
    EXECUTE format('CREATE POLICY "Professor gerencia convites de aluno" ON %I.physiq_convites FOR ALL TO authenticated USING (professor_id = auth.uid() AND papel = ''aluno'') WITH CHECK (professor_id = auth.uid() AND papel = ''aluno'' AND %I.physiq_professor_acesso_ok(auth.uid()))', sch, sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor le a propria integracao" ON %I.physiq_integracoes', sch);
    EXECUTE format('CREATE POLICY "Professor le a propria integracao" ON %I.physiq_integracoes FOR SELECT TO authenticated USING (professor_id = auth.uid())', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor le os proprios avisos" ON %I.physiq_avisos_plano', sch);
    EXECUTE format('CREATE POLICY "Professor le os proprios avisos" ON %I.physiq_avisos_plano FOR SELECT TO authenticated USING (professor_id = auth.uid())', sch);

    -- catálogos: master tudo; professor só nas próprias linhas (e só com acesso ok); leitura existente continua
    FOREACH tbl IN ARRAY ARRAY['tb_exercicios','grupos_musculares','tb_grupos_treino','tb_pastas_treino','physiq_tags','physiq_planos'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS "Staff gerencia catalogo" ON %I.%I', sch, tbl);
      EXECUTE format($f$CREATE POLICY "Staff gerencia catalogo" ON %I.%I FOR ALL TO authenticated
        USING (%I.physiq_is_master() OR (%I.physiq_is_staff() AND professor_id = auth.uid()))
        WITH CHECK (%I.physiq_is_master() OR (%I.physiq_is_staff() AND professor_id = auth.uid() AND %I.physiq_professor_acesso_ok(auth.uid())))$f$, sch, tbl, sch, sch, sch, sch, sch);
    END LOOP;
    -- professor lê tags e planos de aluno (catálogo do master + os dele) — tabelas sem leitura pública
    EXECUTE format('DROP POLICY IF EXISTS "Staff le tags" ON %I.physiq_tags', sch);
    EXECUTE format('CREATE POLICY "Staff le tags" ON %I.physiq_tags FOR SELECT TO authenticated USING (%I.physiq_is_staff() AND (professor_id IS NULL OR professor_id = auth.uid()))', sch, sch);

    -- exercícios do treino: professor só em treinos dele
    EXECUTE format('DROP POLICY IF EXISTS "Staff gerencia exercicios do treino" ON %I.tb_grupos_exercicios', sch);
    EXECUTE format($f$CREATE POLICY "Staff gerencia exercicios do treino" ON %I.tb_grupos_exercicios FOR ALL TO authenticated
      USING (%I.physiq_is_master() OR (%I.physiq_is_staff() AND EXISTS (SELECT 1 FROM %I.tb_grupos_treino g WHERE g.id = tb_grupos_exercicios.grupo_id AND g.professor_id = auth.uid())))
      WITH CHECK (%I.physiq_is_master() OR (%I.physiq_is_staff() AND %I.physiq_professor_acesso_ok(auth.uid()) AND EXISTS (SELECT 1 FROM %I.tb_grupos_treino g WHERE g.id = tb_grupos_exercicios.grupo_id AND g.professor_id = auth.uid())))$f$,
      sch, sch, sch, sch, sch, sch, sch, sch);
    -- quem vê o treino: professor liga treino (dele ou global) a ALUNO DELE
    EXECUTE format('DROP POLICY IF EXISTS "Staff gerencia perfis do treino" ON %I.tb_grupos_treino_perfis', sch);
    EXECUTE format($f$CREATE POLICY "Staff gerencia perfis do treino" ON %I.tb_grupos_treino_perfis FOR ALL TO authenticated
      USING (%I.physiq_is_master() OR (%I.physiq_is_staff() AND EXISTS (SELECT 1 FROM %I.physiq_profiles a WHERE a.id = tb_grupos_treino_perfis.user_id AND a.professor_id = auth.uid())))
      WITH CHECK (%I.physiq_is_master() OR (%I.physiq_is_staff() AND %I.physiq_professor_acesso_ok(auth.uid())
        AND EXISTS (SELECT 1 FROM %I.physiq_profiles a WHERE a.id = tb_grupos_treino_perfis.user_id AND a.professor_id = auth.uid())
        AND EXISTS (SELECT 1 FROM %I.tb_grupos_treino g WHERE g.id = tb_grupos_treino_perfis.grupo_id AND (g.professor_id IS NULL OR g.professor_id = auth.uid()))))$f$,
      sch, sch, sch, sch, sch, sch, sch, sch, sch);
    -- pastas: professor só nas pastas dele
    EXECUTE format('DROP POLICY IF EXISTS "Staff gerencia treinos da pasta" ON %I.tb_pastas_treino_grupos', sch);
    EXECUTE format($f$CREATE POLICY "Staff gerencia treinos da pasta" ON %I.tb_pastas_treino_grupos FOR ALL TO authenticated
      USING (%I.physiq_is_master() OR (%I.physiq_is_staff() AND EXISTS (SELECT 1 FROM %I.tb_pastas_treino p WHERE p.id = tb_pastas_treino_grupos.pasta_id AND p.professor_id = auth.uid())))
      WITH CHECK (%I.physiq_is_master() OR (%I.physiq_is_staff() AND %I.physiq_professor_acesso_ok(auth.uid()) AND EXISTS (SELECT 1 FROM %I.tb_pastas_treino p WHERE p.id = tb_pastas_treino_grupos.pasta_id AND p.professor_id = auth.uid())))$f$,
      sch, sch, sch, sch, sch, sch, sch, sch);
    -- registros fotográficos: professor gerencia os dos alunos dele (mesmo poder do admin antigo)
    EXECUTE format('DROP POLICY IF EXISTS "Staff gerencia registros dos seus alunos" ON %I.physiq_registros_fotos', sch);
    EXECUTE format($f$CREATE POLICY "Staff gerencia registros dos seus alunos" ON %I.physiq_registros_fotos FOR ALL TO authenticated
      USING (%I.physiq_is_master() OR (%I.physiq_is_staff() AND EXISTS (SELECT 1 FROM %I.physiq_profiles a WHERE a.id = physiq_registros_fotos.user_id AND a.professor_id = auth.uid())))
      WITH CHECK (%I.physiq_is_master() OR (%I.physiq_is_staff() AND %I.physiq_professor_acesso_ok(auth.uid()) AND EXISTS (SELECT 1 FROM %I.physiq_profiles a WHERE a.id = physiq_registros_fotos.user_id AND a.professor_id = auth.uid())))$f$,
      sch, sch, sch, sch, sch, sch, sch, sch);

    -- perfis: master tudo; professor lê/atualiza os próprios alunos (edges usam service_role; isto cobre REST direto)
    EXECUTE format('DROP POLICY IF EXISTS "Professor gerencia seus alunos" ON %I.physiq_profiles', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Master gerencia perfis" ON %I.physiq_profiles', sch);
    EXECUTE format('CREATE POLICY "Master gerencia perfis" ON %I.physiq_profiles FOR ALL TO authenticated USING (%I.physiq_is_master()) WITH CHECK (%I.physiq_is_master())', sch, sch, sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor le seus alunos" ON %I.physiq_profiles', sch);
    EXECUTE format('CREATE POLICY "Professor le seus alunos" ON %I.physiq_profiles FOR SELECT TO authenticated USING (%I.physiq_is_staff() AND professor_id = auth.uid())', sch, sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor atualiza seus alunos" ON %I.physiq_profiles', sch);
    EXECUTE format('CREATE POLICY "Professor atualiza seus alunos" ON %I.physiq_profiles FOR UPDATE TO authenticated USING (%I.physiq_is_staff() AND professor_id = auth.uid()) WITH CHECK (%I.physiq_is_staff() AND professor_id = auth.uid() AND %I.physiq_professor_acesso_ok(auth.uid()))', sch, sch, sch, sch);

    -- pagamentos: aluno insere só pix_manual com comprovante, aguardando confirmação, contexto aluno
    EXECUTE format('DROP POLICY IF EXISTS "Aluno avisa pix manual" ON %I.physiq_pagamentos', sch);
    EXECUTE format($f$CREATE POLICY "Aluno avisa pix manual" ON %I.physiq_pagamentos FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND tipo = 'pix_manual' AND status = 'aguardando_confirmacao' AND contexto = 'aluno'
                  AND comprovante_path IS NOT NULL AND NOT %I.physiq_aluno_bloqueado(auth.uid()))$f$, sch, sch);
    EXECUTE format('DROP POLICY IF EXISTS "Professor le pagamentos dos seus alunos" ON %I.physiq_pagamentos', sch);
    EXECUTE format($f$CREATE POLICY "Professor le pagamentos dos seus alunos" ON %I.physiq_pagamentos FOR SELECT TO authenticated
      USING (%I.physiq_is_master() OR (%I.physiq_is_staff() AND EXISTS (SELECT 1 FROM %I.physiq_profiles a WHERE a.id = physiq_pagamentos.user_id AND a.professor_id = auth.uid())))$f$, sch, sch, sch, sch);

    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_meu_professor() TO authenticated, service_role', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_papel(), %I.physiq_is_master(), %I.physiq_is_staff() TO authenticated, service_role, anon', sch, sch, sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_professor_acesso_ok(uuid), %I.physiq_aluno_bloqueado(uuid), %I.physiq_professor_pode_convidar(uuid) TO authenticated, service_role', sch, sch, sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_gerar_codigo_professor(text) TO service_role', sch);
  END LOOP;

  -- ===== dados iniciais =====
  -- public: admins atuais viram professores (o master também é professor dos próprios alunos);
  -- alunos existentes → Weslley (weslleybertoldo18@gmail.com), que segue no Mercado Pago.
  INSERT INTO public.physiq_professores (id, nome, email, foto_url, codigo_convite, plano_id)
    SELECT u.id, COALESCE(NULLIF(pr.nome, ''), split_part(u.email, '@', 1)), u.email, pr.foto_url,
           public.physiq_gerar_codigo_professor(COALESCE(NULLIF(pr.nome, ''), split_part(u.email, '@', 1))), NULL
    FROM auth.users u LEFT JOIN public.physiq_profiles pr ON pr.id = u.id
    WHERE u.raw_app_meta_data->>'role' IN ('admin','master')
    ORDER BY (u.email = 'weslleybertoldo18@gmail.com') DESC, u.created_at
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.physiq_integracoes (professor_id, tipo)
    SELECT id, 'mercadopago' FROM public.physiq_professores WHERE email = 'weslleybertoldo18@gmail.com'
    ON CONFLICT (professor_id) DO NOTHING;
  UPDATE public.physiq_profiles a SET professor_id = w.id
    FROM (SELECT id FROM public.physiq_professores ORDER BY (email = 'weslleybertoldo18@gmail.com') DESC, created_at LIMIT 1) w
    WHERE a.professor_id IS NULL AND a.id NOT IN (SELECT id FROM public.physiq_professores);
  -- staging: admin de teste vira professor; todos os perfis de teste → ele
  INSERT INTO staging.physiq_professores (id, nome, email, codigo_convite)
    SELECT u.id, COALESCE(NULLIF(pr.nome, ''), split_part(u.email, '@', 1)), u.email,
           staging.physiq_gerar_codigo_professor(COALESCE(NULLIF(pr.nome, ''), split_part(u.email, '@', 1)))
    FROM auth.users u LEFT JOIN staging.physiq_profiles pr ON pr.id = u.id
    WHERE u.email = 'admin.teste.claude@physiqcalc.app'
    ON CONFLICT (id) DO NOTHING;
  UPDATE staging.physiq_profiles a SET professor_id = w.id
    FROM (SELECT id FROM staging.physiq_professores WHERE email = 'admin.teste.claude@physiqcalc.app' LIMIT 1) w
    WHERE a.professor_id IS NULL AND a.id NOT IN (SELECT id FROM staging.physiq_professores);
END $mig$;

-- ===== storage: comprovantes (privado) + professor sobe registros dos seus alunos =====
INSERT INTO storage.buckets (id, name, public) VALUES ('comprovantes','comprovantes',false), ('comprovantes-staging','comprovantes-staging',false) ON CONFLICT (id) DO NOTHING;
-- caminho do objeto: prof/<professor_id>/<aluno_id>/<yyyy-mm>-<timestamp>.<ext>
DROP POLICY IF EXISTS "comprovantes_aluno_insert" ON storage.objects;
CREATE POLICY "comprovantes_aluno_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('comprovantes','comprovantes-staging') AND split_part(name, '/', 1) = 'prof' AND split_part(name, '/', 3) = auth.uid()::text);
DROP POLICY IF EXISTS "comprovantes_leitura_dono_professor_master" ON storage.objects;
CREATE POLICY "comprovantes_leitura_dono_professor_master" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('comprovantes','comprovantes-staging') AND (
    split_part(name, '/', 3) = auth.uid()::text
    OR split_part(name, '/', 2) = auth.uid()::text
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','master')));
-- mídia de exercício (bucket público `exercicios`): professor só escreve a imagem dos PRÓPRIOS exercícios (objeto = <exercicio_id>.<ext>)
DROP POLICY IF EXISTS "exercicios_professor_write" ON storage.objects;
CREATE POLICY "exercicios_professor_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('exercicios','exercicios-staging') AND (auth.jwt()->'app_metadata'->>'role') = 'professor' AND (
      EXISTS (SELECT 1 FROM public.tb_exercicios e WHERE e.professor_id = auth.uid() AND e.id::text = split_part(name, '.', 1))
   OR EXISTS (SELECT 1 FROM staging.tb_exercicios e WHERE e.professor_id = auth.uid() AND e.id::text = split_part(name, '.', 1))))
  WITH CHECK (bucket_id IN ('exercicios','exercicios-staging') AND (auth.jwt()->'app_metadata'->>'role') = 'professor' AND (
      EXISTS (SELECT 1 FROM public.tb_exercicios e WHERE e.professor_id = auth.uid() AND e.id::text = split_part(name, '.', 1))
   OR EXISTS (SELECT 1 FROM staging.tb_exercicios e WHERE e.professor_id = auth.uid() AND e.id::text = split_part(name, '.', 1))));
-- registros fotográficos: professor tem o mesmo poder do admin antigo, mas só na pasta dos alunos dele
DROP POLICY IF EXISTS "registros_professor_write" ON storage.objects;
CREATE POLICY "registros_professor_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('registros','registros-staging') AND (auth.jwt()->'app_metadata'->>'role') = 'professor' AND (
      EXISTS (SELECT 1 FROM public.physiq_profiles a WHERE a.id::text = (storage.foldername(name))[1] AND a.professor_id = auth.uid())
   OR EXISTS (SELECT 1 FROM staging.physiq_profiles a WHERE a.id::text = (storage.foldername(name))[1] AND a.professor_id = auth.uid())))
  WITH CHECK (bucket_id IN ('registros','registros-staging') AND (auth.jwt()->'app_metadata'->>'role') = 'professor' AND (
      EXISTS (SELECT 1 FROM public.physiq_profiles a WHERE a.id::text = (storage.foldername(name))[1] AND a.professor_id = auth.uid())
   OR EXISTS (SELECT 1 FROM staging.physiq_profiles a WHERE a.id::text = (storage.foldername(name))[1] AND a.professor_id = auth.uid())));
