-- PhysiqCalc — ambiente de STAGING via schema separado (espelha public.*)
-- Idempotente. Sem dados. Padrão seazone-support-hub. Gerado por introspecção 2026-06-18.
-- Enums ficam em public (tipo compartilhado); tabelas staging usam o tipo public.<enum>.

CREATE SCHEMA IF NOT EXISTS staging;

-- ---------- Tabelas (LIKE INCLUDING ALL) ----------
CREATE TABLE IF NOT EXISTS staging.app_config (LIKE public.app_config INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.edge_rate_limits (LIKE public.edge_rate_limits INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.exercicio_ordem_usuario (LIKE public.exercicio_ordem_usuario INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.grupos_musculares (LIKE public.grupos_musculares INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.physiq_avaliacoes (LIKE public.physiq_avaliacoes INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.physiq_profiles (LIKE public.physiq_profiles INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.physiq_tags (LIKE public.physiq_tags INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.physiq_user_tags (LIKE public.physiq_user_tags INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_exercicio_comentarios (LIKE public.tb_exercicio_comentarios INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_exercicios (LIKE public.tb_exercicios INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_exercicios_usuario (LIKE public.tb_exercicios_usuario INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_grupos_exercicios (LIKE public.tb_grupos_exercicios INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_grupos_exercicios_usuario (LIKE public.tb_grupos_exercicios_usuario INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_grupos_treino (LIKE public.tb_grupos_treino INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_grupos_treino_perfis (LIKE public.tb_grupos_treino_perfis INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_grupos_treino_usuario (LIKE public.tb_grupos_treino_usuario INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_semana_treinos (LIKE public.tb_semana_treinos INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_treino_concluido (LIKE public.tb_treino_concluido INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_treino_dia_override (LIKE public.tb_treino_dia_override INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tb_treino_series (LIKE public.tb_treino_series INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.treino_historico (LIKE public.treino_historico INCLUDING ALL);

-- ---------- Sequences próprias do staging (serial; evita vazar a sequence do public) ----------
CREATE SEQUENCE IF NOT EXISTS staging.edge_rate_limits_id_seq;
ALTER TABLE staging.edge_rate_limits ALTER COLUMN id SET DEFAULT nextval('staging.edge_rate_limits_id_seq'::regclass);
ALTER SEQUENCE staging.edge_rate_limits_id_seq OWNED BY staging.edge_rate_limits.id;

-- ---------- Funções (public -> staging; search_path resolve tabelas em staging, tipos/enums em public) ----------
CREATE OR REPLACE FUNCTION staging.check_rate_limit(p_user_id uuid, p_endpoint text, p_max_count integer, p_window_secs integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO staging, public, 'pg_temp'
AS $function$
DECLARE
  recent_count integer;
BEGIN
  -- Limpa registros antigos do user/endpoint (best-effort, não bloqueia)
  DELETE FROM staging.edge_rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND created_at < now() - (p_window_secs || ' seconds')::interval;

  SELECT COUNT(*) INTO recent_count
  FROM staging.edge_rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND created_at >= now() - (p_window_secs || ' seconds')::interval;

  IF recent_count >= p_max_count THEN
    RETURN false;
  END IF;

  INSERT INTO staging.edge_rate_limits (user_id, endpoint) VALUES (p_user_id, p_endpoint);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION staging.generate_physiq_user_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO staging, public
AS $function$
DECLARE current_year INT := EXTRACT(YEAR FROM NOW()); next_seq INT;
BEGIN
  SELECT COALESCE(MAX((LEFT(user_code::text, LENGTH(user_code::text)-4))::int), 0) + 1 INTO next_seq FROM staging.physiq_profiles WHERE RIGHT(user_code::text, 4) = current_year::text;
  NEW.user_code := (next_seq::text || current_year::text)::bigint; RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION staging.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO staging, public
AS $function$
BEGIN
  INSERT INTO staging.physiq_profiles (id, nome, email, foto_url) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), NEW.email, COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''));
  RETURN NEW;
END; $function$;

-- ---------- FKs (intra-staging; refs a auth.* preservadas) ----------
ALTER TABLE staging.physiq_profiles DROP CONSTRAINT IF EXISTS physiq_profiles_id_fkey;
ALTER TABLE staging.physiq_profiles ADD CONSTRAINT physiq_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE staging.physiq_user_tags DROP CONSTRAINT IF EXISTS physiq_user_tags_user_id_fkey;
ALTER TABLE staging.physiq_user_tags ADD CONSTRAINT physiq_user_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.physiq_user_tags DROP CONSTRAINT IF EXISTS physiq_user_tags_tag_id_fkey;
ALTER TABLE staging.physiq_user_tags ADD CONSTRAINT physiq_user_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES staging.physiq_tags(id) ON DELETE CASCADE;
ALTER TABLE staging.physiq_avaliacoes DROP CONSTRAINT IF EXISTS physiq_avaliacoes_user_id_fkey;
ALTER TABLE staging.physiq_avaliacoes ADD CONSTRAINT physiq_avaliacoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_exercicios DROP CONSTRAINT IF EXISTS tb_grupos_exercicios_grupo_id_fkey;
ALTER TABLE staging.tb_grupos_exercicios ADD CONSTRAINT tb_grupos_exercicios_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES staging.tb_grupos_treino(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_exercicios DROP CONSTRAINT IF EXISTS tb_grupos_exercicios_exercicio_id_fkey;
ALTER TABLE staging.tb_grupos_exercicios ADD CONSTRAINT tb_grupos_exercicios_exercicio_id_fkey FOREIGN KEY (exercicio_id) REFERENCES staging.tb_exercicios(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_semana_treinos DROP CONSTRAINT IF EXISTS tb_semana_treinos_grupo_id_fkey;
ALTER TABLE staging.tb_semana_treinos ADD CONSTRAINT tb_semana_treinos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES staging.tb_grupos_treino(id) ON DELETE SET NULL;
ALTER TABLE staging.tb_treino_dia_override DROP CONSTRAINT IF EXISTS tb_treino_dia_override_user_id_fkey;
ALTER TABLE staging.tb_treino_dia_override ADD CONSTRAINT tb_treino_dia_override_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_treino_dia_override DROP CONSTRAINT IF EXISTS tb_treino_dia_override_grupo_id_fkey;
ALTER TABLE staging.tb_treino_dia_override ADD CONSTRAINT tb_treino_dia_override_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES staging.tb_grupos_treino(id) ON DELETE SET NULL;
ALTER TABLE staging.tb_treino_series DROP CONSTRAINT IF EXISTS tb_treino_series_user_id_fkey;
ALTER TABLE staging.tb_treino_series ADD CONSTRAINT tb_treino_series_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_treino_series DROP CONSTRAINT IF EXISTS tb_treino_series_exercicio_id_fkey;
ALTER TABLE staging.tb_treino_series ADD CONSTRAINT tb_treino_series_exercicio_id_fkey FOREIGN KEY (exercicio_id) REFERENCES staging.tb_exercicios(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_treino_concluido DROP CONSTRAINT IF EXISTS tb_treino_concluido_user_id_fkey;
ALTER TABLE staging.tb_treino_concluido ADD CONSTRAINT tb_treino_concluido_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_exercicios_usuario DROP CONSTRAINT IF EXISTS tb_exercicios_usuario_user_id_fkey;
ALTER TABLE staging.tb_exercicios_usuario ADD CONSTRAINT tb_exercicios_usuario_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_treino_usuario DROP CONSTRAINT IF EXISTS tb_grupos_treino_usuario_user_id_fkey;
ALTER TABLE staging.tb_grupos_treino_usuario ADD CONSTRAINT tb_grupos_treino_usuario_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_exercicios_usuario DROP CONSTRAINT IF EXISTS tb_grupos_exercicios_usuario_user_id_fkey;
ALTER TABLE staging.tb_grupos_exercicios_usuario ADD CONSTRAINT tb_grupos_exercicios_usuario_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_exercicios_usuario DROP CONSTRAINT IF EXISTS tb_grupos_exercicios_usuario_grupo_usuario_id_fkey;
ALTER TABLE staging.tb_grupos_exercicios_usuario ADD CONSTRAINT tb_grupos_exercicios_usuario_grupo_usuario_id_fkey FOREIGN KEY (grupo_usuario_id) REFERENCES staging.tb_grupos_treino_usuario(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_exercicios_usuario DROP CONSTRAINT IF EXISTS tb_grupos_exercicios_usuario_exercicio_id_fkey;
ALTER TABLE staging.tb_grupos_exercicios_usuario ADD CONSTRAINT tb_grupos_exercicios_usuario_exercicio_id_fkey FOREIGN KEY (exercicio_id) REFERENCES staging.tb_exercicios(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_grupos_exercicios_usuario DROP CONSTRAINT IF EXISTS tb_grupos_exercicios_usuario_exercicio_usuario_id_fkey;
ALTER TABLE staging.tb_grupos_exercicios_usuario ADD CONSTRAINT tb_grupos_exercicios_usuario_exercicio_usuario_id_fkey FOREIGN KEY (exercicio_usuario_id) REFERENCES staging.tb_exercicios_usuario(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_treino_dia_override DROP CONSTRAINT IF EXISTS tb_treino_dia_override_grupo_usuario_id_fkey;
ALTER TABLE staging.tb_treino_dia_override ADD CONSTRAINT tb_treino_dia_override_grupo_usuario_id_fkey FOREIGN KEY (grupo_usuario_id) REFERENCES staging.tb_grupos_treino_usuario(id) ON DELETE SET NULL;
ALTER TABLE staging.tb_treino_series DROP CONSTRAINT IF EXISTS tb_treino_series_exercicio_usuario_id_fkey;
ALTER TABLE staging.tb_treino_series ADD CONSTRAINT tb_treino_series_exercicio_usuario_id_fkey FOREIGN KEY (exercicio_usuario_id) REFERENCES staging.tb_exercicios_usuario(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_exercicio_comentarios DROP CONSTRAINT IF EXISTS tb_exercicio_comentarios_user_id_fkey;
ALTER TABLE staging.tb_exercicio_comentarios ADD CONSTRAINT tb_exercicio_comentarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_exercicio_comentarios DROP CONSTRAINT IF EXISTS tb_exercicio_comentarios_exercicio_id_fkey;
ALTER TABLE staging.tb_exercicio_comentarios ADD CONSTRAINT tb_exercicio_comentarios_exercicio_id_fkey FOREIGN KEY (exercicio_id) REFERENCES staging.tb_exercicios(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_exercicio_comentarios DROP CONSTRAINT IF EXISTS tb_exercicio_comentarios_exercicio_usuario_id_fkey;
ALTER TABLE staging.tb_exercicio_comentarios ADD CONSTRAINT tb_exercicio_comentarios_exercicio_usuario_id_fkey FOREIGN KEY (exercicio_usuario_id) REFERENCES staging.tb_exercicios_usuario(id) ON DELETE CASCADE;
ALTER TABLE staging.exercicio_ordem_usuario DROP CONSTRAINT IF EXISTS exercicio_ordem_usuario_user_id_fkey;
ALTER TABLE staging.exercicio_ordem_usuario ADD CONSTRAINT exercicio_ordem_usuario_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE staging.treino_historico DROP CONSTRAINT IF EXISTS treino_historico_user_id_fkey;
ALTER TABLE staging.treino_historico ADD CONSTRAINT treino_historico_user_id_fkey FOREIGN KEY (user_id) REFERENCES staging.physiq_profiles(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_semana_treinos DROP CONSTRAINT IF EXISTS tb_semana_treinos_user_id_fkey;
ALTER TABLE staging.tb_semana_treinos ADD CONSTRAINT tb_semana_treinos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE staging.tb_semana_treinos DROP CONSTRAINT IF EXISTS tb_semana_treinos_grupo_usuario_id_fkey;
ALTER TABLE staging.tb_semana_treinos ADD CONSTRAINT tb_semana_treinos_grupo_usuario_id_fkey FOREIGN KEY (grupo_usuario_id) REFERENCES staging.tb_grupos_treino_usuario(id) ON DELETE SET NULL;
ALTER TABLE staging.tb_grupos_treino_perfis DROP CONSTRAINT IF EXISTS tb_grupos_treino_perfis_grupo_id_fkey;
ALTER TABLE staging.tb_grupos_treino_perfis ADD CONSTRAINT tb_grupos_treino_perfis_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES staging.tb_grupos_treino(id) ON DELETE CASCADE;

-- ---------- RLS ----------
ALTER TABLE staging.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.edge_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.exercicio_ordem_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.grupos_musculares ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.physiq_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.physiq_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.physiq_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.physiq_user_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_exercicio_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_exercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_exercicios_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_grupos_exercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_grupos_exercicios_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_grupos_treino ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_grupos_treino_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_grupos_treino_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_semana_treinos ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_treino_concluido ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_treino_dia_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tb_treino_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.treino_historico ENABLE ROW LEVEL SECURITY;

-- ---------- Policies ----------
DROP POLICY IF EXISTS "Usuario le proprios overrides" ON staging.tb_treino_dia_override;
CREATE POLICY "Usuario le proprios overrides" ON staging.tb_treino_dia_override AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario acessa propria semana" ON staging.tb_semana_treinos;
CREATE POLICY "Usuario acessa propria semana" ON staging.tb_semana_treinos AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "admin_all_grupos_treino_perfis" ON staging.tb_grupos_treino_perfis;
CREATE POLICY "admin_all_grupos_treino_perfis" ON staging.tb_grupos_treino_perfis AS PERMISSIVE FOR ALL TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)) WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));
DROP POLICY IF EXISTS "Users read own profile" ON staging.physiq_profiles;
CREATE POLICY "Users read own profile" ON staging.physiq_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
DROP POLICY IF EXISTS "Users update own profile" ON staging.physiq_profiles;
CREATE POLICY "Users update own profile" ON staging.physiq_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id));
DROP POLICY IF EXISTS "Users insert own profile" ON staging.physiq_profiles;
CREATE POLICY "Users insert own profile" ON staging.physiq_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS "Deny all public access on physiq_tags" ON staging.physiq_tags;
CREATE POLICY "Deny all public access on physiq_tags" ON staging.physiq_tags AS PERMISSIVE FOR ALL TO anon USING (false);
DROP POLICY IF EXISTS "Deny all public access on physiq_user_tags" ON staging.physiq_user_tags;
CREATE POLICY "Deny all public access on physiq_user_tags" ON staging.physiq_user_tags AS PERMISSIVE FOR ALL TO anon USING (false);
DROP POLICY IF EXISTS "Users read own avaliacoes" ON staging.physiq_avaliacoes;
CREATE POLICY "Users read own avaliacoes" ON staging.physiq_avaliacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Deny anon access on avaliacoes" ON staging.physiq_avaliacoes;
CREATE POLICY "Deny anon access on avaliacoes" ON staging.physiq_avaliacoes AS PERMISSIVE FOR ALL TO anon USING (false);
DROP POLICY IF EXISTS "Leitura publica exercicios" ON staging.tb_exercicios;
CREATE POLICY "Leitura publica exercicios" ON staging.tb_exercicios AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Leitura publica grupos" ON staging.tb_grupos_treino;
CREATE POLICY "Leitura publica grupos" ON staging.tb_grupos_treino AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Leitura publica grupos_exercicios" ON staging.tb_grupos_exercicios;
CREATE POLICY "Leitura publica grupos_exercicios" ON staging.tb_grupos_exercicios AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Usuario acessa proprias series" ON staging.tb_treino_series;
CREATE POLICY "Usuario acessa proprias series" ON staging.tb_treino_series AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario acessa proprios concluidos" ON staging.tb_treino_concluido;
CREATE POLICY "Usuario acessa proprios concluidos" ON staging.tb_treino_concluido AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario acessa seus exercicios" ON staging.tb_exercicios_usuario;
CREATE POLICY "Usuario acessa seus exercicios" ON staging.tb_exercicios_usuario AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario acessa seus grupos" ON staging.tb_grupos_treino_usuario;
CREATE POLICY "Usuario acessa seus grupos" ON staging.tb_grupos_treino_usuario AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario acessa seus vinculos" ON staging.tb_grupos_exercicios_usuario;
CREATE POLICY "Usuario acessa seus vinculos" ON staging.tb_grupos_exercicios_usuario AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario acessa seus comentarios" ON staging.tb_exercicio_comentarios;
CREATE POLICY "Usuario acessa seus comentarios" ON staging.tb_exercicio_comentarios AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "grupos_musculares_select_all" ON staging.grupos_musculares;
CREATE POLICY "grupos_musculares_select_all" ON staging.grupos_musculares AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Users manage own exercise order" ON staging.exercicio_ordem_usuario;
CREATE POLICY "Users manage own exercise order" ON staging.exercicio_ordem_usuario AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario ve seus treinos" ON staging.treino_historico;
CREATE POLICY "Usuario ve seus treinos" ON staging.treino_historico AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario insere seus treinos" ON staging.treino_historico;
CREATE POLICY "Usuario insere seus treinos" ON staging.treino_historico AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario deleta seus treinos" ON staging.treino_historico;
CREATE POLICY "Usuario deleta seus treinos" ON staging.treino_historico AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario insere proprio override" ON staging.tb_treino_dia_override;
CREATE POLICY "Usuario insere proprio override" ON staging.tb_treino_dia_override AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario atualiza proprio override" ON staging.tb_treino_dia_override;
CREATE POLICY "Usuario atualiza proprio override" ON staging.tb_treino_dia_override AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Usuario deleta proprio override" ON staging.tb_treino_dia_override;
CREATE POLICY "Usuario deleta proprio override" ON staging.tb_treino_dia_override AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admin gerencia catalogo exercicios" ON staging.tb_exercicios;
CREATE POLICY "Admin gerencia catalogo exercicios" ON staging.tb_exercicios AS PERMISSIVE FOR ALL TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)) WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));
DROP POLICY IF EXISTS "Service role only" ON staging.app_config;
CREATE POLICY "Service role only" ON staging.app_config AS PERMISSIVE FOR ALL TO public USING (false);

-- ---------- Triggers (em tabelas public -> staging; triggers em auth.* NÃO são replicados) ----------
DROP TRIGGER IF EXISTS set_physiq_user_code ON staging.physiq_profiles;
CREATE TRIGGER set_physiq_user_code BEFORE INSERT ON staging.physiq_profiles FOR EACH ROW WHEN ((new.user_code IS NULL)) EXECUTE FUNCTION staging.generate_physiq_user_code();

-- ---------- Grants ----------
GRANT USAGE ON SCHEMA staging TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA staging TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA staging TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA staging TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
