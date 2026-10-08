-- Reversa da hml-07 no BANCO DO TREINO. Rodar com set physiq.schemas = 'public' e depois 'staging' (tira a leitura de
-- cada um); a rodada do 'staging' (a última) apaga também as funções dos logins, o schema `backup` e o papel.
-- Parar antes os timers do notebook (scripts/backup/diario/instalar.sh --desinstalar).
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'physiq_backup') then
    return;
  end if;
  execute format('alter default privileges for role postgres in schema %I revoke select on tables from physiq_backup', v_amb);
  execute format('alter default privileges for role postgres in schema %I revoke select on sequences from physiq_backup', v_amb);
  execute format('revoke select on all tables in schema %I from physiq_backup', v_amb);
  execute format('revoke select on all sequences in schema %I from physiq_backup', v_amb);
  execute format('revoke usage on schema %I from physiq_backup', v_amb);
  if v_amb = 'staging' then
    drop function if exists backup.logins_usuarios();
    drop function if exists backup.logins_identidades();
    drop schema if exists backup;
    drop role physiq_backup;
  end if;
end
$$;
