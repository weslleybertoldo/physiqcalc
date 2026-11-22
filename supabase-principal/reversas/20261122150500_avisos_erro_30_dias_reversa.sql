-- Reversa do bcode-0021, item 3 (supabase-principal/migrations/20261122150500_avisos_erro_30_dias.sql). Idempotente.
-- Os avisos de erro voltam a sair só quando chega um aviso novo (a registrar_aviso_erro da hml-10); o que já saiu não volta.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          (e --so public, se a migração foi ao public)
select set_config('lock_timeout', '5s', true);

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-avisos-erro-limpeza-{schema}';

do $c$
begin
  if exists (select 1 from cron.job j where j.jobname = 'physiq-avisos-erro-limpeza-{schema}') then
    raise exception 'reversa do bcode-0021 (item 3): sobrou o job physiq-avisos-erro-limpeza-{schema}';
  end if;
end $c$;
