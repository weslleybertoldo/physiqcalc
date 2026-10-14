-- Physiq hml-22 (H-22 · o 2FA do master no site · 14/10/2026) — o master que TEM um fator verificado no Auth (o TOTP do app
-- autenticador) só é master com o token aal2 (o que sai depois do código de 6 números). Banco principal, staging + public.
-- Idempotente; 2 funções novas e o corpo de 2 que existem — nenhuma tabela, coluna, policy, gatilho, grant de tabela ou dado muda.
--
-- O porquê: o master vê os dados de todas as contas, inclusive os de saúde. Hoje basta a senha (ou o Google). Com o 2FA, quem tem a
-- senha dele e não tem o celular entra como pessoa comum: as policies, as RPCs e as funções master_* dizem "não é master".
--
-- A regra (decisão do dono, 14/10/2026: "desligado até você cadastrar o código no celular"):
--   · sem fator verificado → tudo igual a hoje (hoje há 0 fator nos 2 projetos: com 0 fator, cada função devolve o mesmo de hoje);
--   · com fator verificado → master só com aal2 no token; em aal1 (só a senha ou o Google) = pessoa comum.
--   O fator dele é o interruptor: apagar o fator pelo admin (docs/master-2fa.md) = a volta imediata, sem publicar nada.
--
--   master_aal_regra(tem_fator, aal)  a regra pura (a matriz A da prova): aal2 → true; sem fator → true; com fator e sem aal2 →
--                                     false. Fator nulo ("não sei") só abre com aal2.
--   master_aal_ok()                   a regra para quem chama: o aal do token (auth.jwt()) PRIMEIRO — aal2 decide sem a busca — e só
--                                     fora do aal2 o fator verificado em auth.mfa_factors (auth.uid()). SECURITY DEFINER, dono
--                                     postgres, como o eh_master de hoje: só o postgres lê auth.mfa_factors. Ninguém chama de fora: só
--                                     o eh_master e o sou_master.
--   eh_master()                       a regra de HOJE de cada schema (os 2 são diferentes desde a H-04: public = o claim; staging = o
--                                     claim OU o perfil master do staging) e, só para quem passa nela, o aal2 (decide sozinho) ou a
--                                     master_aal_ok() — o mesmo que "case when <regra de hoje> then master_aal_ok() else false end",
--                                     escrito em plpgsql por desempenho (§2 abaixo). Quem não é master não paga nada a mais. Vale para
--                                     as 363 policies, as 69 funções e o pode_ver_clinico que o chamam.
--   sou_master()                      o claim OU o perfil master do schema (a MESMA semântica de hoje) no mesmo case — sem isso, o
--                                     perfil master da produção (o gatilho sincronizar_papel_do_jwt copia o claim) deixaria as 20
--                                     funções master_* abertas em aal1.
--   Os grants de eh_master/sou_master não mudam (create or replace). O public.eh_master passa de search_path=public para '' (o corpo
--   já é todo qualificado). A minha_situacao NÃO muda: é por ela que o site sabe que a conta é master e mostra a tela do código.
--
-- Ordem: staging primeiro (com o E2E de fator real na conta de teste); produção ANTES do merge do site. Com 0 fator, nada muda.
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261014200000_hml22_master_2fa.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261014200000_hml22_master_2fa.sql --so public
-- Reversa: supabase-principal/reversas/20261014200000_hml22_master_2fa_reversa.sql (os corpos de hoje e depois o drop das 2 novas).

-- ============================================================================================================
-- 1. A regra pura e a regra para quem chama
-- ============================================================================================================
create or replace function {schema}.master_aal_regra(p_tem_fator boolean, p_aal text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_aal = 'aal2', false) or (p_tem_fator is false);
$$;

-- o aal ANTES da busca (decisão da sessão principal, 14/10/2026): aal2 → true sem tocar no auth.mfa_factors (com fator, o estado normal
-- do master é aal2: o caminho rápido); só fora do aal2 a busca do fator (índice mfa_factors_user_id_idx). É a master_aal_regra na
-- mesma ordem — regra(*, aal2) = true —, só que sem pagar a busca quando o aal já decide.
create or replace function {schema}.master_aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select case when j.aal = 'aal2' then true
              else {schema}.master_aal_regra(
                     exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
                     j.aal)
         end
  from (select auth.jwt() ->> 'aal' as aal) j;
$$;

-- só o eh_master e o sou_master chamam (definer, como o postgres); o logado, o visitante e o PUBLIC não (os default privileges dão a todos)
revoke all on function {schema}.master_aal_ok() from public, anon, authenticated;
revoke all on function {schema}.master_aal_regra(boolean, text) from public, anon, authenticated;

-- ============================================================================================================
-- 2. eh_master: a regra de hoje de cada schema e, para quem passa nela, o aal e o fator (por isso o do: o mesmo arquivo roda nos 2
--    schemas e os 2 corpos são diferentes desde a H-04). Em plpgsql, e não em SQL, por desempenho (as 363 policies o chamam por
--    LINHA): a 1ª condição é a regra de hoje — quem não é master sai ali, sem nada a mais (medido: o mesmo de hoje ou menos); o
--    aal2 decide sem chamar a master_aal_ok (master_aal_regra(*, 'aal2') = true); só o master fora do aal2 paga a busca do fator.
-- ============================================================================================================
do $do$
begin
  if '{schema}' = 'public' then
    create or replace function public.eh_master() returns boolean
    language plpgsql stable security definer set search_path = '' as $f$
begin
  -- a regra de hoje do public: o claim master do token
  if not coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false) then
    return false;
  end if;
  if coalesce(auth.jwt() ->> 'aal' = 'aal2', false) then
    return true;
  end if;
  return public.master_aal_ok();
end
$f$;
  elsif '{schema}' = 'staging' then
    create or replace function staging.eh_master() returns boolean
    language plpgsql stable security definer set search_path = '' as $f$
begin
  -- a regra de hoje do staging (H-04): o claim master OU o perfil master do staging
  if not coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false) then
    if not exists (select 1 from staging.profiles pr where pr.id = auth.uid() and pr.role = 'master') then
      return false;
    end if;
  end if;
  if coalesce(auth.jwt() ->> 'aal' = 'aal2', false) then
    return true;
  end if;
  return staging.master_aal_ok();
end
$f$;
  else
    raise exception 'hml-22: schema inesperado ({schema})';
  end if;
end
$do$;

-- ============================================================================================================
-- 3. sou_master: o claim OU o perfil master do schema (a semântica de hoje), no mesmo case
-- ============================================================================================================
create or replace function {schema}.sou_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select case when coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false)
                or exists (select 1 from {schema}.profiles pr where pr.id = auth.uid() and pr.role = 'master')
              then {schema}.master_aal_ok() else false end;
$$;

-- ============================================================================================================
-- 4. Conferência (desfaz tudo se algo sair diferente) — sem login e sem ler tabela: a matriz A, os atributos e os grants
-- ============================================================================================================
do $$
declare
  v_f text;
  v_cel record;
  v_esperado boolean;
begin
  -- a matriz A: tem_fator {false, true, null} × aal {aal1, aal2, null} → só (false, *) e (*, aal2) abrem
  for v_cel in
    select t.tem_fator, a.aal from (values (false), (true), (null::boolean)) t(tem_fator), (values ('aal1'), ('aal2'), (null::text)) a(aal)
  loop
    v_esperado := (v_cel.tem_fator is false) or (v_cel.aal = 'aal2');
    if {schema}.master_aal_regra(v_cel.tem_fator, v_cel.aal) is distinct from coalesce(v_esperado, false) then
      raise exception 'hml-22: master_aal_regra(%, %) fora da matriz A', v_cel.tem_fator, v_cel.aal;
    end if;
  end loop;

  -- as 3 que leem o Auth ou o perfil: DEFINER, STABLE e search_path '' (o corpo é todo qualificado)
  foreach v_f in array array['{schema}.master_aal_ok()', '{schema}.eh_master()', '{schema}.sou_master()'] loop
    if not (select p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
            from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-22: % tem de ser SECURITY DEFINER, STABLE e com search_path vazio', v_f;
    end if;
  end loop;
  if (select p.prosecdef or p.provolatile <> 'i' from pg_catalog.pg_proc p
      where p.oid = '{schema}.master_aal_regra(boolean, text)'::regprocedure) then
    raise exception 'hml-22: master_aal_regra tem de ser INVOKER e IMMUTABLE';
  end if;

  -- o eh_master e o sou_master passam pela regra nova
  if (select count(*) from pg_catalog.pg_proc p
      where p.oid in ('{schema}.eh_master()'::regprocedure, '{schema}.sou_master()'::regprocedure)
        and p.prosrc like '%{schema}.master_aal_ok()%') <> 2 then
    raise exception 'hml-22: eh_master/sou_master sem o master_aal_ok';
  end if;

  -- as 2 novas: ninguém de fora (nem o logado nem o visitante); o eh_master segue chamável pelos 2 (as policies o chamam como quem
  -- pede). O sou_master já era só do servidor e das definer (w07b) — o create or replace não mexe em grant nenhum.
  foreach v_f in array array['{schema}.master_aal_ok()', '{schema}.master_aal_regra(boolean, text)'] loop
    if has_function_privilege('anon', v_f, 'EXECUTE') or has_function_privilege('authenticated', v_f, 'EXECUTE') then
      raise exception 'hml-22: % chamável de fora', v_f;
    end if;
  end loop;
  if not has_function_privilege('authenticated', '{schema}.eh_master()', 'EXECUTE')
     or not has_function_privilege('anon', '{schema}.eh_master()', 'EXECUTE') then
    raise exception 'hml-22: eh_master perdeu o EXECUTE do logado ou do visitante';
  end if;
end
$$;

notify pgrst, 'reload schema';
