-- bcode-0021: a leitura ANTES de aplicar no PRINCIPAL, schema {schema} (e2e/bcode0021/banco.py leitura). SÓ LEITURA (o banco.py põe
-- "set transaction read only" na frente). Devolve só contagens, booleanos, datas, a versão dos textos e md5 — nenhum e-mail, IP ou id.
-- As lacunas da especificação: 4 (o md5 do corpo vivo da exportação), 5 (as contagens de hoje e a versão dos textos) e 6 (quem aplica
-- pode pôr gatilho em auth.users), mais as linhas vencidas de cada tabela que os itens 1, 2, 3a e 4 tocam.
-- O mesmo texto roda no PGlite (~/projetos/physiqcalc-scratch/bcode0021/harness_e2e.mjs).
select
  {schema}.versao_dos_textos() as versao_dos_textos,
  (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('{schema}.exportar_dados_aluno(uuid)')) as md5_exportar,
  -- item 1: a contagem de senha errada (o predicado da login_bloqueios_limpar) e o bloqueio de vez sem login vivo (decisão dele)
  (select count(*) from {schema}.login_bloqueios) as lb_total,
  (select count(*) from {schema}.login_bloqueios b
    where b.bloqueado_de_vez_em is null and b.atualizado_em < now() - interval '46 hours'
      and (b.bloqueado_ate is null or b.bloqueado_ate <= now()) and (b.em_andamento_ate is null or b.em_andamento_ate <= now())) as lb_vencidas,
  (select count(*) from {schema}.login_bloqueios b
    where b.bloqueado_de_vez_em is not null
      and not exists (select 1 from auth.users u where lower(btrim(u.email)) = b.email and u.deleted_at is null)) as lb_de_vez_sem_login,
  (select min(b.atualizado_em) from {schema}.login_bloqueios b) as lb_mais_velha,
  -- item 2: os códigos do IP (login parado há mais de 46 h; hora pública começada há mais de 22 h)
  (select count(*) from {schema}.login_tentativas_ip) as ip_login_total,
  (select count(*) from {schema}.login_tentativas_ip t where t.atualizado_em < now() - interval '46 hours') as ip_login_vencidas,
  (select min(t.atualizado_em) from {schema}.login_tentativas_ip t) as ip_login_mais_velha,
  (select count(*) from {schema}.publico_pedidos_ip) as ip_publico_total,
  (select count(*) from {schema}.publico_pedidos_ip q where q.janela < now() - interval '22 hours') as ip_publico_vencidas,
  (select min(q.janela) from {schema}.publico_pedidos_ip q) as ip_publico_mais_velha,
  -- item 3a: os avisos de erro (mais de 29 d 22 h)
  (select count(*) from {schema}.avisos_erro) as avisos_total,
  (select count(*) from {schema}.avisos_erro a
    where coalesce(a.ultimo_aviso_em, a.primeiro_em) < now() - interval '29 days 22 hours') as avisos_vencidos,
  (select min(coalesce(a.ultimo_aviso_em, a.primeiro_em)) from {schema}.avisos_erro a) as avisos_mais_velho,
  (select count(*) from {schema}.avisos_erro_hora) as avisos_hora_total,
  (select count(*) from {schema}.avisos_erro_hora h where h.hora < now() - interval '29 days 22 hours') as avisos_hora_vencidas,
  -- item 4 (o projeto inteiro: auth.sessions é uma só para os 2 schemas)
  (select count(*) from auth.sessions) as sessoes,
  (select count(*) from auth.sessions s where s.ip is not null) as sessoes_com_ip,
  (select count(*) from auth.sessions s where s.ip is not null
      and coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) < now() - interval '30 days') as sessoes_com_ip_paradas_30d,
  (select count(*) from auth.sessions s where s.ip = '2a06:98c0:3600::103'::inet) as sessoes_ip_do_worker,
  -- o pg_cron e a lacuna 6 (o usuário da Management API pode pôr gatilho em auth.users)
  exists (select 1 from pg_extension where extname = 'pg_cron') as tem_pg_cron,
  has_table_privilege('auth.users', 'TRIGGER') as pode_gatilho_auth_users
