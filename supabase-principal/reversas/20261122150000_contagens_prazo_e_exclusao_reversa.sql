-- Reversa do bcode-0021 item 1 no banco principal (supabase-principal/migrations/20261122150000_contagens_prazo_e_exclusao.sql).
-- Idempotente: roda com ou sem a migração aplicada. Tira o que ela pôs, por schema: os 2 gatilhos em auth.users, o job e as 2 funções.
-- A contagem volta a não ter prazo nem a sair com o login; o que a limpeza e os gatilhos já apagaram não volta. Nada de antes muda.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261122150000_contagens_prazo_e_exclusao_reversa.sql --so staging
--          (e --so public, se a migração foi ao public). Independente da reversa do item 7 (20261122150200): a tabela fica.
select set_config('lock_timeout', '5s', true);

drop trigger if exists physiq_login_bloqueios_apagado_{schema} on auth.users;
drop trigger if exists physiq_login_bloqueios_mudou_{schema} on auth.users;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-login-bloqueios-limpeza-{schema}';

drop function if exists {schema}.login_bloqueios_saiu();
drop function if exists {schema}.login_bloqueios_limpar();

-- a conferência do fim: nada sobrou
do $c$
begin
  if exists (select 1 from pg_trigger tg where tg.tgrelid = 'auth.users'::regclass
              and tg.tgname in ('physiq_login_bloqueios_apagado_{schema}', 'physiq_login_bloqueios_mudou_{schema}'))
     or exists (select 1 from cron.job j where j.jobname = 'physiq-login-bloqueios-limpeza-{schema}')
     or to_regprocedure('{schema}.login_bloqueios_limpar()') is not null
     or to_regprocedure('{schema}.login_bloqueios_saiu()') is not null then
    raise exception 'reversa bcode-0021: sobrou gatilho, job ou função em {schema}';
  end if;
end $c$;
