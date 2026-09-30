-- Physiq W7b — TREINOS PRONTOS do aluno sem profissional no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb). Idempotente.
-- SÓ ACRESCENTA 3 tabelas por schema (nenhum dado de hoje muda). Regra dele (29/09): "ele pode escolher e montar seu próprio
-- treino ou usar um treino pronto" — a 1ª versão é nossa (os 81 exercícios da biblioteca, por objetivo e nível) e ele revisa em
-- produção. A carga é o arquivo scripts/conteudo/treinos_prontos.json (scripts/conteudo/carregar_treinos_prontos.py --schema …).
--
--   physiq_treinos_prontos             nome, objetivo (emagrecer · manter · ganhar_massa), nível, dias por semana, divisão
--   physiq_treinos_prontos_grupos      a divisão (Treino A, B…) com os dias da semana (SEG…DOM, os códigos da tb_semana_treinos)
--   physiq_treinos_prontos_exercicios  exercício da biblioteca (tb_exercicios), séries, repetições (texto: "12" ou "8-12"),
--                                      descanso e observação
-- O aluno escolhe um e ele VIRA O TREINO DELE: o app copia para os treinos próprios dele (tb_grupos_treino_usuario,
-- tb_grupos_exercicios_usuario, tb_series_padrao_usuario, tb_semana_treinos) pelo PowerSync — funciona sem internet e ele pode
-- mudar depois, como os treinos próprios de hoje. Estas tabelas NÃO entram no PowerSync (o catálogo abre com internet e fica
-- guardado no aparelho). Leitura: qualquer pessoa logada (catálogo, sem dado pessoal); escrita: só a service_role (a carga; a
-- tela do master para editar é da W27).
--
-- Aplica em public e staging (bloco DO, padrão do repo). Um schema de cada vez (staging primeiro), na MESMA chamada:
--   set physiq.schemas = 'staging'; <este arquivo>     (Management API: os 2 no mesmo pedido)
-- Sem o SET, roda nos 2.

DO $mig$
DECLARE
  sch text;
  alvo text[] := coalesce(string_to_array(nullif(current_setting('physiq.schemas', true), ''), ','), ARRAY['public','staging']);
BEGIN
  FOREACH sch IN ARRAY alvo LOOP
    IF sch NOT IN ('public', 'staging') THEN
      RAISE EXCEPTION 'schema inválido em physiq.schemas: %', sch;
    END IF;

    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %1$I.physiq_treinos_prontos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo text NOT NULL UNIQUE,
        nome text NOT NULL CHECK (char_length(btrim(nome)) >= 2),
        objetivo text NOT NULL CHECK (objetivo IN ('emagrecer', 'manter', 'ganhar_massa')),
        nivel text NOT NULL CHECK (nivel IN ('iniciante', 'intermediario', 'avancado')),
        dias_por_semana integer NOT NULL CHECK (dias_por_semana BETWEEN 1 AND 7),
        divisao text NOT NULL,
        descricao text,
        ordem integer NOT NULL DEFAULT 0,
        ativo boolean NOT NULL DEFAULT true,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now())$f$, sch);

    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %1$I.physiq_treinos_prontos_grupos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        treino_id uuid NOT NULL REFERENCES %1$I.physiq_treinos_prontos(id) ON DELETE CASCADE,
        letra text NOT NULL CHECK (letra ~ '^[A-Z]$'),
        nome text NOT NULL CHECK (char_length(btrim(nome)) >= 2),
        dias text[] NOT NULL DEFAULT '{}' CHECK (dias <@ ARRAY['DOM','SEG','TER','QUA','QUI','SEX','SAB']::text[]),
        ordem integer NOT NULL DEFAULT 0,
        UNIQUE (treino_id, letra))$f$, sch);

    EXECUTE format($f$CREATE TABLE IF NOT EXISTS %1$I.physiq_treinos_prontos_exercicios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        grupo_id uuid NOT NULL REFERENCES %1$I.physiq_treinos_prontos_grupos(id) ON DELETE CASCADE,
        exercicio_id uuid NOT NULL REFERENCES %1$I.tb_exercicios(id) ON DELETE RESTRICT,
        ordem integer NOT NULL DEFAULT 0,
        series integer NOT NULL CHECK (series BETWEEN 1 AND 10),
        reps text NOT NULL CHECK (char_length(btrim(reps)) BETWEEN 1 AND 20),
        descanso_segundos integer CHECK (descanso_segundos IS NULL OR descanso_segundos BETWEEN 0 AND 600),
        observacao text)$f$, sch);

    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_treinos_prontos_grupos_treino_idx ON %I.physiq_treinos_prontos_grupos (treino_id, ordem)', sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS physiq_treinos_prontos_exercicios_grupo_idx ON %I.physiq_treinos_prontos_exercicios (grupo_id, ordem)', sch);

    -- RLS: catálogo para quem está logado (sem dado pessoal); escrita só pela service_role
    EXECUTE format('ALTER TABLE %I.physiq_treinos_prontos ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('ALTER TABLE %I.physiq_treinos_prontos_grupos ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('ALTER TABLE %I.physiq_treinos_prontos_exercicios ENABLE ROW LEVEL SECURITY', sch);
    EXECUTE format('DROP POLICY IF EXISTS "treinos prontos: logado le" ON %I.physiq_treinos_prontos', sch);
    EXECUTE format('CREATE POLICY "treinos prontos: logado le" ON %I.physiq_treinos_prontos FOR SELECT TO authenticated USING (ativo)', sch);
    EXECUTE format('DROP POLICY IF EXISTS "treinos prontos: logado le" ON %I.physiq_treinos_prontos_grupos', sch);
    EXECUTE format($f$CREATE POLICY "treinos prontos: logado le" ON %1$I.physiq_treinos_prontos_grupos FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM %1$I.physiq_treinos_prontos t WHERE t.id = treino_id AND t.ativo))$f$, sch);
    EXECUTE format('DROP POLICY IF EXISTS "treinos prontos: logado le" ON %I.physiq_treinos_prontos_exercicios', sch);
    EXECUTE format($f$CREATE POLICY "treinos prontos: logado le" ON %1$I.physiq_treinos_prontos_exercicios FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM %1$I.physiq_treinos_prontos_grupos g JOIN %1$I.physiq_treinos_prontos t ON t.id = g.treino_id
                      WHERE g.id = grupo_id AND t.ativo))$f$, sch);

    -- GRANT explícito (Data API, 30/10/2026): leitura para authenticated, tudo para a service_role, nada para anon
    EXECUTE format('REVOKE ALL ON %1$I.physiq_treinos_prontos, %1$I.physiq_treinos_prontos_grupos, %1$I.physiq_treinos_prontos_exercicios FROM anon', sch);
    EXECUTE format('GRANT SELECT ON %1$I.physiq_treinos_prontos, %1$I.physiq_treinos_prontos_grupos, %1$I.physiq_treinos_prontos_exercicios TO authenticated', sch);
    EXECUTE format('GRANT ALL ON %1$I.physiq_treinos_prontos, %1$I.physiq_treinos_prontos_grupos, %1$I.physiq_treinos_prontos_exercicios TO service_role', sch);
  END LOOP;
END $mig$;
