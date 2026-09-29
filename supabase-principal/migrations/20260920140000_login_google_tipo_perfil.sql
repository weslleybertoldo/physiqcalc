-- PhysiqNutri — W44 Login com Google + escolha do perfil no 1º acesso (pedido dele 20/09/2026: "preciso de login pelo google,
-- igual o physiqcal. e quando o usuario logar, ele terá 3 opções para escolher 1: Academico de Nutrição, Nutricionista e
-- 3 Outra área relacionada"). Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920140000_login_google_tipo_perfil.sql` (roda em
-- public E staging trocando {schema}). O Google em si é configuração do Auth (client OAuth + cadastro liberado), feita pela
-- Management API — nada aqui. Quem entra pelo Google ganha o perfil pelo trigger handle_new_user da base (role nutricionista).

-- 1) Perfil: como a pessoa usa o app. NULL = ainda não escolheu → a tela "Bem-vindo(a)" aparece antes do Consultório
--    (ConsultorioLayout). `area_outra` = texto livre só quando tipo_perfil = 'outra_area'. A dona grava pela policy
--    'perfil: editar o proprio' (o papel continua travado por ela).
alter table {schema}.profiles add column if not exists tipo_perfil text;
alter table {schema}.profiles drop constraint if exists profiles_tipo_perfil_check;
alter table {schema}.profiles add constraint profiles_tipo_perfil_check
  check (tipo_perfil is null or tipo_perfil in ('academico', 'nutricionista', 'outra_area'));
alter table {schema}.profiles add column if not exists area_outra text;
alter table {schema}.profiles drop constraint if exists profiles_area_outra_check;
alter table {schema}.profiles add constraint profiles_area_outra_check
  check (area_outra is null or char_length(area_outra) <= 60);

-- 2) Quem já existia (contas criadas pelo master como nutricionistas, antes do cadastro pelo Google) não passa pela escolha:
--    vira 'nutricionista'. Só perfis criados até agora — quem entrar pelo Google depois escolhe na tela.
update {schema}.profiles set tipo_perfil = 'nutricionista'
  where tipo_perfil is null and role in ('nutricionista', 'master') and created_at < now();
