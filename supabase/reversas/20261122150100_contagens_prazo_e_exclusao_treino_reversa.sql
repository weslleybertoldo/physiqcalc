-- Reversa do bcode-0021 item 1 no BANCO DO TREINO (supabase/migrations/20261122150100_contagens_prazo_e_exclusao_treino.sql). Idempotente:
-- roda com ou sem a migração aplicada. UM schema por chamada. Tira o job, o gatilho em physiq_identidades e as 2 funções. O pg_cron fica
-- no banco (pode haver outro job; a extensão não é desta reversa). O que a limpeza e o gatilho já apagaram não volta.
-- Management API, numa chamada só: set physiq.schemas = 'staging'; <este arquivo>   (e 'public', se a migração foi ao public)
select set_config('lock_timeout', '5s', true);

do $rev$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-limites-limpeza-' || v_amb;
  end if;
  execute format('drop trigger if exists %I on %I.physiq_identidades', 'physiq_limites_vinculo_' || v_amb, v_amb);
  execute format('drop function if exists %I.physiq_limites_vinculo_saiu()', v_amb);
  execute format('drop function if exists %I.physiq_limites_limpar()', v_amb);

  -- a conferência do fim: nada sobrou
  if to_regprocedure(format('%I.physiq_limites_limpar()', v_amb)) is not null
     or to_regprocedure(format('%I.physiq_limites_vinculo_saiu()', v_amb)) is not null
     or exists (select 1 from pg_catalog.pg_trigger tg join pg_catalog.pg_class c on c.oid = tg.tgrelid
                 join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = v_amb and tg.tgname = 'physiq_limites_vinculo_' || v_amb) then
    raise exception 'reversa bcode-0021: sobrou função ou gatilho em %', v_amb;
  end if;
  -- 2 IFs: o plpgsql prepara a expressão inteira antes de avaliar (sem o schema cron, um "and exists (… cron.job)" quebraria)
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job j where j.jobname = 'physiq-limites-limpeza-' || v_amb) then
      raise exception 'reversa bcode-0021: sobrou o job physiq-limites-limpeza-%', v_amb;
    end if;
  end if;
end
$rev$;
