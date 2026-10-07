-- Homologação do Physiq — hml-01 no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) — H-03, H-10, H-12 e H-44 (07/10/2026).
-- Idempotente. Nenhum dado muda.
--
-- H-03. Os treinos montados (tb_grupos_treino = os "modelos" do painel, e os exercícios deles em tb_grupos_exercicios) deixam de
--   ser lidos sem login e por qualquer conta. Lê um grupo: o master; o professor dono (professor_id = ele); qualquer profissional
--   (staff), se o grupo é do catálogo global do master (professor_id vazio) — o "global ou meu" do painel; e o aluno que RECEBE o
--   grupo (tb_grupos_treino_perfis). O app do aluno recebe os treinos pelo PowerSync e pelas Edge Functions (service_role), que
--   não passam por aqui. Pastas (tb_pastas_treino) com a mesma regra, sem o aluno (o aluno não vê pasta); vínculos de pasta seguem
--   a pasta. Catálogo de exercícios e músculos: o visitante lê só o global (professor_id vazio); o profissional lê todos (o dono
--   da conta edita o treino do aluno do personal dele com a biblioteca do personal); o aluno, o global e o do professor dele.
-- H-10. Permissões da API no tamanho do uso: o visitante (anon) só lê os 2 catálogos (as outras policies dele são "nega" ou
--   dependem de login); authenticated perde TRUNCATE (não passa pelo RLS), TRIGGER, REFERENCES e MAINTAIN; tabelas e sequências
--   novas nascem assim (default privileges do postgres). Tabela nova que o visitante precise ler: GRANT SELECT explícito.
-- H-12. Funções: as que só o servidor chama (Edge Functions com service_role, pg_cron) fecham para anon/authenticated; as usadas
--   em policy de logado fecham só para o visitante; gatilhos sem EXECUTE; search_path fixo nas SECURITY DEFINER que não tinham.
-- H-44. physiq_profiles: o próprio aluno não muda mais as colunas de controle legadas (status, admin_locked, plano_nome,
--   plano_expiracao, mensalidade_valor, cobranca_pausada) — o valor antigo fica, como já acontecia com professor_id e conta_id.
--   Quem grava essas colunas são as Edge Functions (service_role) e as funções de exclusão (service_role): não passam pela guarda.
--
-- Aplica em public e staging (bloco DO, padrão do repo). Um schema de cada vez, na MESMA chamada (Management API database/query):
--   set physiq.schemas = 'staging'; <este arquivo>      ← primeiro
--   set physiq.schemas = 'public';  <este arquivo>      (produção, com backup)
-- Reversa: supabase/reversas/20261007200300_hml01_treino_grupos_e_permissoes_reversa.sql

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
  f record;
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    -- ===== H-03: quem lê um grupo de treino
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I.physiq_pode_ler_grupo(p_grupo uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$
      SELECT EXISTS (
        SELECT 1 FROM %I.tb_grupos_treino g
         WHERE g.id = p_grupo AND (
               %I.physiq_is_master()
            OR g.professor_id = auth.uid()
            OR (g.professor_id IS NULL AND %I.physiq_is_staff())
            OR EXISTS (SELECT 1 FROM %I.tb_grupos_treino_perfis gp WHERE gp.grupo_id = g.id AND gp.user_id = auth.uid()))) $b$$f$,
      sch, sch, sch, sch, sch);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_pode_ler_grupo(uuid) FROM PUBLIC, anon', sch);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_pode_ler_grupo(uuid) TO authenticated, service_role', sch);

    EXECUTE format('DROP POLICY IF EXISTS "Leitura publica grupos" ON %I.tb_grupos_treino', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Grupos: leitura do dono, do catalogo e de quem recebe" ON %I.tb_grupos_treino', sch);
    EXECUTE format('CREATE POLICY "Grupos: leitura do dono, do catalogo e de quem recebe" ON %I.tb_grupos_treino FOR SELECT TO authenticated USING (%I.physiq_pode_ler_grupo(id))', sch, sch);

    EXECUTE format('DROP POLICY IF EXISTS "Leitura publica grupos_exercicios" ON %I.tb_grupos_exercicios', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Exercicios do grupo: leitura de quem le o grupo" ON %I.tb_grupos_exercicios', sch);
    EXECUTE format('CREATE POLICY "Exercicios do grupo: leitura de quem le o grupo" ON %I.tb_grupos_exercicios FOR SELECT TO authenticated USING (%I.physiq_pode_ler_grupo(grupo_id))', sch, sch);

    EXECUTE format('DROP POLICY IF EXISTS "Pastas visiveis para autenticados" ON %I.tb_pastas_treino', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Pastas: leitura do dono e do catalogo" ON %I.tb_pastas_treino', sch);
    EXECUTE format('CREATE POLICY "Pastas: leitura do dono e do catalogo" ON %I.tb_pastas_treino FOR SELECT TO authenticated USING (%I.physiq_is_master() OR professor_id = (SELECT auth.uid()) OR (professor_id IS NULL AND %I.physiq_is_staff()))', sch, sch, sch);

    EXECUTE format('DROP POLICY IF EXISTS "Vinculos de pasta visiveis para autenticados" ON %I.tb_pastas_treino_grupos', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Vinculos de pasta: leitura de quem le a pasta" ON %I.tb_pastas_treino_grupos', sch);
    EXECUTE format('CREATE POLICY "Vinculos de pasta: leitura de quem le a pasta" ON %I.tb_pastas_treino_grupos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM %I.tb_pastas_treino p WHERE p.id = pasta_id))', sch, sch);

    -- catálogos: visitante só o global; profissional todos; aluno o global e o do professor dele
    EXECUTE format('DROP POLICY IF EXISTS "Leitura publica exercicios" ON %I.tb_exercicios', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Exercicios: catalogo global para visitante" ON %I.tb_exercicios', sch);
    EXECUTE format('CREATE POLICY "Exercicios: catalogo global para visitante" ON %I.tb_exercicios FOR SELECT TO anon USING (professor_id IS NULL)', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Exercicios: leitura para logados" ON %I.tb_exercicios', sch);
    EXECUTE format('CREATE POLICY "Exercicios: leitura para logados" ON %I.tb_exercicios FOR SELECT TO authenticated USING (professor_id IS NULL OR %I.physiq_is_staff() OR professor_id = (SELECT a.professor_id FROM %I.physiq_profiles a WHERE a.id = (SELECT auth.uid())))', sch, sch, sch);

    EXECUTE format('DROP POLICY IF EXISTS "grupos_musculares_select_all" ON %I.grupos_musculares', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Musculos: catalogo global para visitante" ON %I.grupos_musculares', sch);
    EXECUTE format('CREATE POLICY "Musculos: catalogo global para visitante" ON %I.grupos_musculares FOR SELECT TO anon USING (professor_id IS NULL)', sch);
    EXECUTE format('DROP POLICY IF EXISTS "Musculos: leitura para logados" ON %I.grupos_musculares', sch);
    EXECUTE format('CREATE POLICY "Musculos: leitura para logados" ON %I.grupos_musculares FOR SELECT TO authenticated USING (professor_id IS NULL OR %I.physiq_is_staff() OR professor_id = (SELECT a.professor_id FROM %I.physiq_profiles a WHERE a.id = (SELECT auth.uid())))', sch, sch, sch);

    -- ===== H-10: permissões da API
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', sch);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', sch);
    EXECUTE format('GRANT SELECT ON %I.tb_exercicios, %I.grupos_musculares TO anon', sch, sch);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON ALL TABLES IN SCHEMA %I FROM authenticated', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL ON TABLES FROM anon', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM anon', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM authenticated', sch);

    -- ===== H-12: funções (cada uma só se existir neste schema)
    FOR f IN SELECT * FROM (VALUES
        -- só o servidor (Edge Functions com service_role / pg_cron como postgres)
        ('physiq_gerar_codigo_professor(text)', 'servidor'),
        ('physiq_professor_pode_convidar(uuid)', 'servidor'),
        ('check_rate_limit(uuid, text, integer, integer)', 'servidor'),
        ('physiq_avisos_tolerancia()', 'servidor'),
        -- usadas em policy de logado ou da própria pessoa: fecham só para o visitante
        ('physiq_aluno_bloqueado(uuid)', 'logado'),
        ('physiq_professor_acesso_ok(uuid)', 'logado'),
        ('physiq_meu_professor()', 'logado'),
        -- gatilhos
        ('handle_new_user()', 'gatilho'),
        ('physiq_recebimentos_sync()', 'gatilho')
      ) AS t(assinatura, tipo)
    LOOP
      CONTINUE WHEN to_regprocedure(format('%I.%s', sch, f.assinatura)) IS NULL;
      IF f.tipo = 'servidor' THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC, anon, authenticated', sch, f.assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%s TO service_role', sch, f.assinatura);
      ELSIF f.tipo = 'logado' THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC, anon', sch, f.assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%s TO authenticated, service_role', sch, f.assinatura);
      ELSE
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC, anon, authenticated', sch, f.assinatura);
      END IF;
    END LOOP;
    -- search_path fixo nas SECURITY DEFINER que não tinham (os corpos já escrevem o schema de cada tabela)
    FOR f IN SELECT * FROM (VALUES ('physiq_aluno_bloqueado(uuid)'), ('physiq_avisos_tolerancia()'), ('physiq_gerar_codigo_professor(text)'),
                                   ('physiq_meu_professor()'), ('physiq_professor_pode_convidar(uuid)')) AS t(assinatura)
    LOOP
      CONTINUE WHEN to_regprocedure(format('%I.%s', sch, f.assinatura)) IS NULL;
      EXECUTE format('ALTER FUNCTION %I.%s SET search_path = %L', sch, f.assinatura, '');
    END LOOP;

    -- ===== H-44: guarda das colunas de controle do próprio aluno
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
          -- hml-01 / H-44: as colunas de controle legadas não mudam pelo próprio aluno
          IF OLD.id = auth.uid() THEN
            NEW.status := OLD.status;
            NEW.admin_locked := OLD.admin_locked;
            NEW.plano_nome := OLD.plano_nome;
            NEW.plano_expiracao := OLD.plano_expiracao;
            NEW.mensalidade_valor := OLD.mensalidade_valor;
            NEW.cobranca_pausada := OLD.cobranca_pausada;
          END IF;
        END IF;
        RETURN NEW;
      END $b$$f$, sch, sch);
  END LOOP;
END
$mig$;
