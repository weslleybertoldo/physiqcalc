-- Reversa da hml-22 (supabase-principal/migrations/20261014200000_hml22_master_2fa.sql). Idempotente: roda com ou sem a migração
-- aplicada. Volta os corpos de ANTES da hml-22 do eh_master (public: o claim, com search_path=public; staging: o claim OU o perfil
-- master do staging, search_path '') e do sou_master, e SÓ DEPOIS apaga as 2 funções novas (master_aal_ok, master_aal_regra) — nessa
-- ordem, porque os corpos novos chamam a master_aal_ok (o Postgres não guarda essa dependência: apagar antes quebraria o eh_master).
-- Os corpos abaixo são cópia letra por letra dos de antes (20260919000000_base.sql:13-16, 20261007210000_hml02a_staging_so_teste.sql:32-36
-- e 20260929190000_w07b_sem_profissional.sql:115-118): a conferência das definições (pg_get_functiondef) compara o texto.
-- Grants: nenhum muda (create or replace). O que o 2FA gravou no Auth (o fator do master) fica: sem a regra, o fator não pesa no banco.
--
-- ANTES desta reversa, a volta mais rápida: apagar o fator do master pelo admin (docs/master-2fa.md) — com 0 fator, a migração já
-- devolve o mesmo de hoje, sem publicar nada.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

do $do$
begin
  if '{schema}' = 'public' then
    create or replace function public.eh_master() returns boolean
    language sql stable security definer set search_path = public as $f$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false);
$f$;
  elsif '{schema}' = 'staging' then
    create or replace function staging.eh_master() returns boolean
    language sql stable security definer set search_path = '' as $f$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'master', false)
      or exists (select 1 from staging.profiles pr where pr.id = auth.uid() and pr.role = 'master');
$f$;
  else
    raise exception 'hml-22 (reversa): schema inesperado ({schema})';
  end if;
end
$do$;

create or replace function {schema}.sou_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (select 1 from {schema}.profiles pr where pr.id = auth.uid() and pr.role = 'master');
$$;

drop function if exists {schema}.master_aal_ok();
drop function if exists {schema}.master_aal_regra(boolean, text);

notify pgrst, 'reload schema';
