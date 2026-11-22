-- Physiq bcode-0021, item 1 (só o código; decisão do dono 22/11/2026: «corrigir no código até 18/12; texto do 1 numa versão
-- seguinte»). Banco principal, staging + public. Idempotente e aditiva: 2 funções, 2 gatilhos em auth.users e 1 job, por schema.
-- Nada de hoje muda: login_iniciar, login_concluir, a escada, login_destravar e a tabela login_bloqueios (w08b) ficam iguais.
--   login_bloqueios_limpar()  apaga a linha sem bloqueio de vez, com a última tentativa (atualizado_em, gravado pela w08b nas linhas
--                             183, 219 e 240) há mais de 46 h e com o bloqueio por tempo e a tentativa em andamento já vencidos. Job de
--                             hora em hora (minuto 53): nenhuma linha passa de 47 h (o «2 dias» do login com senha, com 1 h de folga
--                             contra atraso ou rodada perdida do pg_cron). O bloqueio de vez fica até destravar ou até o login sair.
--   login_bloqueios_saiu()    + os gatilhos physiq_login_bloqueios_apagado_{schema} (after delete) e physiq_login_bloqueios_mudou_{schema}
--                             (after update of email, deleted_at) em auth.users: o login apagado de vez (o aluno; o delete from
--                             auth.users do master e do acesso do aluno), o soft delete (o profissional: e-mail embaralhado e
--                             deleted_at, no mesmo UPDATE) e a troca de e-mail levam a linha do e-mail de ANTES (old.email).
--                             Molde: physiq_restauracao_auth_{schema} (20261030010000_restaurar_login.sql, seção 5).
-- auth.users é um só para os 2 schemas (20261007210000_hml02a_staging_so_teste.sql:3-4): o gatilho do staging roda em TODA exclusão,
-- soft delete e troca de e-mail do Auth inteiro (só apaga em staging.login_bloqueios). Gatilho com erro derruba a exclusão do Auth
-- (precedente: 20261031170000_excluir_conta_desligar_login.sql): por isso, sem a tabela, ele sai sem fazer nada.
-- Aplicar (backup antes de produção: scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261122150000_contagens_prazo_e_exclusao.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261122150000_contagens_prazo_e_exclusao.sql --so staging
--   com o OK dele: … --so public. NUNCA sem --so. Depois, uma vez: select <schema>.login_bloqueios_limpar(); (ou esperar o minuto 53).
-- Reversa: supabase-principal/reversas/20261122150000_contagens_prazo_e_exclusao_reversa.sql
select set_config('lock_timeout', '5s', true);

create or replace function {schema}.login_bloqueios_limpar() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer;
begin
  delete from {schema}.login_bloqueios b
   where b.bloqueado_de_vez_em is null
     and b.atualizado_em < now() - interval '46 hours'
     and (b.bloqueado_ate is null or b.bloqueado_ate <= now())
     and (b.em_andamento_ate is null or b.em_andamento_ate <= now());
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function {schema}.login_bloqueios_limpar() from public, anon, authenticated;
grant execute on function {schema}.login_bloqueios_limpar() to service_role;

-- roda em toda exclusão, soft delete e troca de e-mail do Auth inteiro: sem a tabela, sai sem fazer nada (não quebra o Auth)
create or replace function {schema}.login_bloqueios_saiu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if to_regclass('{schema}.login_bloqueios') is null or old.email is null then
    return null;
  end if;
  delete from {schema}.login_bloqueios where email = lower(btrim(old.email));
  return null;
end;
$$;
revoke all on function {schema}.login_bloqueios_saiu() from public, anon, authenticated;

drop trigger if exists physiq_login_bloqueios_apagado_{schema} on auth.users;
create trigger physiq_login_bloqueios_apagado_{schema} after delete on auth.users
  for each row execute function {schema}.login_bloqueios_saiu();
drop trigger if exists physiq_login_bloqueios_mudou_{schema} on auth.users;
create trigger physiq_login_bloqueios_mudou_{schema} after update of email, deleted_at on auth.users
  for each row
  when (old.email is distinct from new.email or (new.deleted_at is not null and old.deleted_at is null))
  execute function {schema}.login_bloqueios_saiu();

-- o mesmo nome ATUALIZA o job
select cron.schedule('physiq-login-bloqueios-limpeza-{schema}', '53 * * * *', $$select {schema}.login_bloqueios_limpar()$$);

-- a conferência do fim (qualquer diferença desfaz o bloco inteiro do schema)
do $c$
declare
  v_f text;
begin
  foreach v_f in array array['{schema}.login_bloqueios_limpar()', '{schema}.login_bloqueios_saiu()'] loop
    if not (select pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=""'] from pg_proc pr where pr.oid = v_f::regprocedure) then
      raise exception 'bcode-0021: % sem SECURITY DEFINER ou sem o search_path vazio', v_f;
    end if;
    if has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'bcode-0021: o app ou o visitante executam %', v_f;
    end if;
  end loop;
  if not has_function_privilege('service_role', '{schema}.login_bloqueios_limpar()', 'execute') then
    raise exception 'bcode-0021: o servidor não executa {schema}.login_bloqueios_limpar()';
  end if;
  if (select count(*) from pg_trigger tg
       where tg.tgrelid = 'auth.users'::regclass and not tg.tgisinternal
         and tg.tgfoid = '{schema}.login_bloqueios_saiu()'::regprocedure
         and tg.tgname in ('physiq_login_bloqueios_apagado_{schema}', 'physiq_login_bloqueios_mudou_{schema}')) <> 2 then
    raise exception 'bcode-0021: os 2 gatilhos physiq_login_bloqueios_*_{schema} não estão em auth.users';
  end if;
  if not exists (select 1 from cron.job j where j.jobname = 'physiq-login-bloqueios-limpeza-{schema}' and j.active
                  and j.schedule = '53 * * * *' and j.command = 'select {schema}.login_bloqueios_limpar()') then
    raise exception 'bcode-0021: o job physiq-login-bloqueios-limpeza-{schema} fora do esperado';
  end if;
end $c$;
