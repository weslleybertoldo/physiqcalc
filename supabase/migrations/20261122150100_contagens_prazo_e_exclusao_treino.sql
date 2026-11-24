-- Physiq bcode-0021, item 1 no BANCO DO TREINO (uxwpwdbbnlticxgtzcsb). Só o código (decisão do dono 22/11/2026). Idempotente e aditiva:
-- 2 funções, 1 gatilho e 1 job, por schema. UM schema por chamada. Nada de hoje muda (check_rate_limit, as funções da borda, as tabelas).
--   physiq_limites_limpar()        apaga de edge_rate_limits o que passou de 22 h. Job de hora em hora (minuto 17): nada passa de 23 h. A
--                                  maior janela do repo é 1 h (trocar-token, 20 por hora); as outras são 60 s.
--   physiq_limites_vinculo_saiu()  + o gatilho physiq_limites_vinculo_<schema> (after delete em physiq_identidades): sai a linha gravada
--                                  pelo id do PRINCIPAL (a trocar-token conta por principal.id). As linhas pelo id do Treino já saem nas
--                                  physiq_excluir_* (w07, w2l). O vínculo sai por último na exclusão (delete-my-account) e em cascata
--                                  quando o login do Treino é apagado (w02_espelho: treino_user_id … on delete cascade).
--   O pg_cron é ligado se faltar (DO condicional: o create extension puro quebra na 2ª rodada,
--   supabase-principal/migrations/20260920050000_lixeira.sql:73-81). A extensão vale para o banco inteiro (staging e public).
-- Management API, numa chamada só: set physiq.schemas = 'staging'; <este arquivo>   (dry-run: begin; set …; <este arquivo>; rollback;)
-- Com o OK dele: set physiq.schemas = 'public'; <este arquivo>. Sem o set, para (o padrão antigo do repo rodava nos 2).
-- Depois, uma vez: select <schema>.physiq_limites_limpar(); (ou esperar o minuto 17).
-- Reversa: supabase/reversas/20261122150100_contagens_prazo_e_exclusao_treino_reversa.sql
select set_config('lock_timeout', '5s', true);

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end
$$;

do $mig$
declare
  v_amb text := current_setting('physiq.schemas', true);
  v_f text;
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;

  execute format($sql$
create or replace function %I.physiq_limites_limpar() returns integer
language plpgsql volatile security definer set search_path = '' as $b$
declare
  v_n integer;
begin
  delete from %I.edge_rate_limits where created_at < now() - interval '22 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$b$
$sql$, v_amb, v_amb);
  execute format('revoke all on function %I.physiq_limites_limpar() from public, anon, authenticated', v_amb);
  execute format('grant execute on function %I.physiq_limites_limpar() to service_role', v_amb);

  execute format($sql$
create or replace function %I.physiq_limites_vinculo_saiu() returns trigger
language plpgsql security definer set search_path = '' as $b$
begin
  delete from %I.edge_rate_limits where user_id = old.principal_user_id;
  return null;
end;
$b$
$sql$, v_amb, v_amb);
  execute format('revoke all on function %I.physiq_limites_vinculo_saiu() from public, anon, authenticated', v_amb);
  execute format('drop trigger if exists %I on %I.physiq_identidades', 'physiq_limites_vinculo_' || v_amb, v_amb);
  execute format('create trigger %I after delete on %I.physiq_identidades for each row execute function %I.physiq_limites_vinculo_saiu()',
                 'physiq_limites_vinculo_' || v_amb, v_amb, v_amb);

  -- o mesmo nome ATUALIZA o job
  perform cron.schedule('physiq-limites-limpeza-' || v_amb, '17 * * * *', format('select %I.physiq_limites_limpar()', v_amb));

  -- a conferência do fim (qualquer diferença desfaz a chamada inteira)
  foreach v_f in array array[format('%I.physiq_limites_limpar()', v_amb), format('%I.physiq_limites_vinculo_saiu()', v_amb)] loop
    if not (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'bcode-0021: % sem SECURITY DEFINER ou sem o search_path vazio', v_f;
    end if;
    if has_function_privilege('anon', v_f, 'EXECUTE') or has_function_privilege('authenticated', v_f, 'EXECUTE') then
      raise exception 'bcode-0021: o app ou o visitante executam %', v_f;
    end if;
  end loop;
  if not has_function_privilege('service_role', format('%I.physiq_limites_limpar()', v_amb), 'EXECUTE') then
    raise exception 'bcode-0021: o servidor não executa %.physiq_limites_limpar()', v_amb;
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger tg
                  where tg.tgrelid = format('%I.physiq_identidades', v_amb)::regclass and not tg.tgisinternal
                    and tg.tgname = 'physiq_limites_vinculo_' || v_amb
                    and tg.tgfoid = format('%I.physiq_limites_vinculo_saiu()', v_amb)::regprocedure) then
    raise exception 'bcode-0021: o gatilho physiq_limites_vinculo_% não está em %.physiq_identidades', v_amb, v_amb;
  end if;
  if not exists (select 1 from cron.job j where j.jobname = 'physiq-limites-limpeza-' || v_amb and j.active and j.schedule = '17 * * * *'
                  and j.command = format('select %I.physiq_limites_limpar()', v_amb)) then
    raise exception 'bcode-0021: o job physiq-limites-limpeza-% fora do esperado', v_amb;
  end if;
end
$mig$;
