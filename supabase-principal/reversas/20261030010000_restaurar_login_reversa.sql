-- Reversa do restaurar-login (supabase-principal/migrations/20261030010000_restaurar_login.sql). Idempotente: roda com ou sem a migração
-- aplicada (inclusive a 1ª versão, de antes da revisão de segurança: restauracao_desafio_entrar, restauracao_usar e restauracao_concluir
-- também saem). Tira TUDO o que ela pôs: o gatilho em auth.users, o job da limpeza, as funções, as 2 tabelas (com as chaves de volta
-- guardadas e os desafios) e a trava app_config.restaurar_login. Nada de antes muda (a migração só acrescentou).
-- O efeito para quem usa: sem as tabelas, a restaurar-login e a chave-restauracao respondem "desligado" (as funções leem a trava, que some,
-- e a RPC que falta vira "desligado") — o celular novo cai na tela de entrar, como antes. As chaves que estão nos aparelhos ficam sem par no
-- servidor: se a migração voltar, ninguém restaura com elas (o app cria uma nova no próximo login ou na próxima abertura).
-- Para só PARAR (sem perder as chaves): a trava — update {schema}.app_config set valor = jsonb_set(valor, '{ligado}', 'false')
-- where chave = 'restaurar_login'; (vale na hora: toda RPC confere a trava).
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261030010000_restaurar_login_reversa.sql --so staging
--          (e --so public, se a migração tiver ido ao public)

select set_config('lock_timeout', '5s', true);

drop trigger if exists physiq_restauracao_auth_{schema} on auth.users;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-restauracao-limpeza-{schema}';

drop function if exists {schema}.restauracao_auth_mudou();
drop function if exists {schema}.restauracao_limpar();
drop function if exists {schema}.restauracao_gastar(text, text, bigint, timestamptz);
drop function if exists {schema}.restauracao_chave(text);
-- as da 1ª versão (antes da revisão de segurança)
drop function if exists {schema}.restauracao_concluir(text, bigint);
drop function if exists {schema}.restauracao_usar(text, text);
drop function if exists {schema}.restauracao_desafio_entrar();
drop function if exists {schema}.chave_restauracao_apagar(text, boolean);
drop function if exists {schema}.chave_restauracao_gravar(text, text, bytea, bigint, integer, text, uuid, boolean, boolean, boolean, text, text, text);
drop function if exists {schema}.chave_restauracao_desafio();
drop function if exists {schema}.restaurar_login_recusa(uuid);

drop table if exists {schema}.restauracao_desafios;
drop table if exists {schema}.chaves_restauracao;

delete from {schema}.app_config where chave = 'restaurar_login';

-- A conferência do fim: nada sobrou
do $c$
begin
  if to_regclass('{schema}.chaves_restauracao') is not null or to_regclass('{schema}.restauracao_desafios') is not null then
    raise exception 'reversa do restaurar-login: sobrou tabela em {schema}';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = '{schema}'
                and p.proname in ('restaurar_login_recusa', 'chave_restauracao_desafio', 'chave_restauracao_gravar', 'chave_restauracao_apagar',
                                  'restauracao_chave', 'restauracao_gastar', 'restauracao_limpar', 'restauracao_auth_mudou',
                                  'restauracao_desafio_entrar', 'restauracao_usar', 'restauracao_concluir')) then
    raise exception 'reversa do restaurar-login: sobrou função em {schema}';
  end if;
  if exists (select 1 from pg_trigger tg where tg.tgrelid = 'auth.users'::regclass and tg.tgname = 'physiq_restauracao_auth_{schema}') then
    raise exception 'reversa do restaurar-login: sobrou o gatilho physiq_restauracao_auth_{schema} em auth.users';
  end if;
  if exists (select 1 from {schema}.app_config where chave = 'restaurar_login') then
    raise exception 'reversa do restaurar-login: sobrou a trava em {schema}';
  end if;
  if exists (select 1 from cron.job j where j.jobname = 'physiq-restauracao-limpeza-{schema}') then
    raise exception 'reversa do restaurar-login: sobrou o job physiq-restauracao-limpeza-{schema}';
  end if;
end $c$;

notify pgrst, 'reload schema';
