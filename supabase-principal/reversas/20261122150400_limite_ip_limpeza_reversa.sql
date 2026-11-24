-- Reversa do bcode-0021, item 2 (supabase-principal/migrations/20261122150400_limite_ip_limpeza.sql). Idempotente.
-- Os códigos do IP voltam a sair só pelo sorteio de login_iniciar e limite_publico; o que já saiu não volta.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          (e --so public, se a migração foi ao public)
select set_config('lock_timeout', '5s', true);

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-limite-ip-limpeza-{schema}';
drop function if exists {schema}.limite_ip_limpar();

do $c$
begin
  if exists (select 1 from cron.job j where j.jobname = 'physiq-limite-ip-limpeza-{schema}')
     or to_regprocedure('{schema}.limite_ip_limpar()') is not null then
    raise exception 'reversa do bcode-0021 (item 2): sobrou o job ou a função em {schema}';
  end if;
end $c$;
