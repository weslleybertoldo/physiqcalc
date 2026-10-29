-- Reversa da virada dos textos legais (supabase-principal/migrations/20261029200000_virada_textos_legais.sql). Idempotente: roda com
-- ou sem a migração aplicada. Devolve a chave {schema}.app_config 'textos_legais' ao que a hml-12 deixou: o staging à versão em revisão
-- (2026-10-08) e o public à versão nula (desligado: sem a porta do aceite, sem a regra de idade, e as RPCs agem como as de antes).
-- NUNCA apaga prova de aceite: os aceites gravados ficam na tabela {schema}.aceites (só crescem). Junto, no código: o revert do PR da
-- virada (a versão do app volta a 2026-10-08 e as telas voltam a depender do build de staging) — com a versão do banco ATRÁS da do
-- app, ninguém consegue aceitar (a tela mostra "Não deu para registrar agora" e manda o aviso de erro).
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261029200000_virada_textos_legais_reversa.sql --so staging
--          (e --so public, se a virada tiver ido ao public)

select set_config('lock_timeout', '5s', true);

update {schema}.app_config
   set valor = jsonb_build_object('versao', case when '{schema}' = 'staging' then '2026-10-08' end)
 where chave = 'textos_legais';

-- A conferência do fim: o staging na versão de revisão; o public desligado (versão nula)
do $c$
begin
  if '{schema}' = 'staging' and {schema}.versao_dos_textos() is distinct from '2026-10-08' then
    raise exception 'reversa da virada: o staging não voltou à versão 2026-10-08';
  end if;
  if '{schema}' <> 'staging' and {schema}.versao_dos_textos() is not null then
    raise exception 'reversa da virada: o {schema} não voltou à versão nula (desligado)';
  end if;
end $c$;
