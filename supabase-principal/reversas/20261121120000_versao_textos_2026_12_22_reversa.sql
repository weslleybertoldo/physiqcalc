-- Reversa da versão nova dos textos (supabase-principal/migrations/20261121120000_versao_textos_2026_12_22.sql). Idempotente: roda com
-- ou sem a migração aplicada. Devolve a chave {schema}.app_config 'textos_legais' à versão de antes, 2026-10-29 (a virada), nos 2 schemas.
-- Uso normal: depois da prova do PR no staging (o staging volta a 2026-10-29 junto com a branch staging de volta à main). Em 22/12, se
-- for preciso desfazer: esta reversa no public + o revert do PR (o app volta a 2026-10-29).
-- NUNCA apaga prova de aceite: os aceites gravados ficam na tabela {schema}.aceites (só crescem).
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261121120000_versao_textos_2026_12_22_reversa.sql --so staging
--          (e --so public, se a versão nova tiver ido ao public)

select set_config('lock_timeout', '5s', true);

update {schema}.app_config
   set valor = jsonb_build_object('versao', '2026-10-29')
 where chave = 'textos_legais';

-- A conferência do fim: a versão de antes nos 2 schemas
do $c$
begin
  if {schema}.versao_dos_textos() is distinct from '2026-10-29' then
    raise exception 'reversa da versão nova dos textos: o {schema} não voltou à versão 2026-10-29';
  end if;
end $c$;
