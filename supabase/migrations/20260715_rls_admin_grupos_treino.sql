-- Admin não conseguia escrever nas tabelas de grupos de treino pela UI:
-- as 3 tabelas só tinham policy de SELECT, então DELETE via PostgREST
-- afetava 0 linhas SEM erro (RLS filtra silenciosamente) e INSERT dava 42501.
-- Mesmo padrão do incidente tb_exercicios (05/06). Policies de admin iguais
-- à "Admin gerencia catalogo exercicios" (app_metadata.role = 'admin').

DO $$
DECLARE
  sch text;
  tab text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    FOREACH tab IN ARRAY ARRAY['tb_grupos_treino', 'tb_grupos_exercicios', 'grupos_musculares'] LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS "Admin gerencia %s" ON %I.%I', tab, sch, tab);
      EXECUTE format(
        $q$CREATE POLICY "Admin gerencia %s" ON %I.%I
             AS PERMISSIVE FOR ALL TO authenticated
             USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
             WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$q$,
        tab, sch, tab);
    END LOOP;
  END LOOP;
END $$;
