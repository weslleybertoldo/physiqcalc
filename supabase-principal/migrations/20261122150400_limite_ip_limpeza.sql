-- Physiq bcode-0021, item 2 (decisão do dono 22/11/2026: «corrigir no código até 18/12; texto do 1 numa versão seguinte»).
-- Os códigos feitos a partir do IP saem no prazo da Política («Contagem de tentativas | só um código feito a partir do IP: 1 dia
-- nas páginas sem login e 2 dias no login com senha», src/publico/legal/politica.ts), de hora em hora — hoje só saíam por sorteio
-- (1 em 50 logins, w08b; 1 em 100 pedidos públicos, hml-05c), e em 22/11/2026 havia 11 + 11 vencidos, desde 06/10.
-- Banco principal, staging + public. Idempotente e aditiva: 1 função e 1 job por schema; login_iniciar e limite_publico ficam
-- como estão (o sorteio segue, sem efeito; o freio só olha a janela atual).
--   {schema}.limite_ip_limpar()  login_tentativas_ip parado há mais de 46 h; publico_pedidos_ip com a hora começada há mais de 22 h.
--                                Job no minuto 19: nenhum passa de 47 h / 23 h (1 h de folga contra atraso do pg_cron).
--                                Sem a tabela, pula (a reversa da hml-05c apaga a publico_pedidos_ip).
-- Só a service_role (o pg_cron roda como o dono do job). Nada para public, anon e authenticated.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging --dry-run; depois sem o --dry-run;
--          com o OK de produção: --so public. NUNCA sem --so (sem ele o script roda staging → public → compartilhado).
-- Reversa: supabase-principal/reversas/20261122150400_limite_ip_limpeza_reversa.sql
select set_config('lock_timeout', '5s', true);

create or replace function {schema}.limite_ip_limpar() returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_login integer := 0;
  v_publico integer := 0;
begin
  if to_regclass('{schema}.login_tentativas_ip') is not null then
    delete from {schema}.login_tentativas_ip t where t.atualizado_em < now() - interval '46 hours';
    get diagnostics v_login = row_count;
  end if;
  if to_regclass('{schema}.publico_pedidos_ip') is not null then
    delete from {schema}.publico_pedidos_ip p where p.janela < now() - interval '22 hours';
    get diagnostics v_publico = row_count;
  end if;
  return jsonb_build_object('login', v_login, 'publico', v_publico);
end;
$$;
revoke all on function {schema}.limite_ip_limpar() from public, anon, authenticated;
grant execute on function {schema}.limite_ip_limpar() to service_role;

select cron.schedule('physiq-limite-ip-limpeza-{schema}', '19 * * * *', $$select {schema}.limite_ip_limpar()$$);

-- conferência: a função é definer com o search_path vazio, só o servidor executa e o job está como o esperado
do $c$
declare
  v_f text := '{schema}.limite_ip_limpar()';
begin
  if not (select pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=""']
            from pg_catalog.pg_proc pr where pr.oid = v_f::regprocedure) then
    raise exception 'bcode-0021: % sem SECURITY DEFINER ou sem o search_path vazio', v_f;
  end if;
  if has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute') then
    raise exception 'bcode-0021: o app ou o visitante executam %', v_f;
  end if;
  if not has_function_privilege('service_role', v_f, 'execute') then
    raise exception 'bcode-0021: o servidor não executa %', v_f;
  end if;
  if not exists (select 1 from cron.job j
                  where j.jobname = 'physiq-limite-ip-limpeza-{schema}' and j.schedule = '19 * * * *'
                    and j.command = 'select {schema}.limite_ip_limpar()' and j.active) then
    raise exception 'bcode-0021: o job physiq-limite-ip-limpeza-{schema} fora do esperado';
  end if;
end $c$;
