-- bcode-0021: a leitura ANTES de aplicar no BANCO DO TREINO, schema {schema} (e2e/bcode0021/banco.py leitura). SÓ LEITURA (o
-- banco.py põe "set transaction read only" na frente). Devolve só contagens, booleanos, datas, nomes de endpoint e md5 — nenhum
-- e-mail, IP ou id. As lacunas da especificação: 1 (o pg_cron), 2 (os endpoints vivos de edge_rate_limits), 3 (a FK de user_id),
-- 4 (o md5 do corpo vivo da exportação), 5 (as contagens de hoje) e 6 (quem aplica pode criar a função e o gatilho), mais o item 4.
-- O mesmo texto roda no PGlite (~/projetos/physiqcalc-scratch/bcode0021/harness_e2e.mjs).
select
  exists (select 1 from pg_extension where extname = 'pg_cron') as tem_pg_cron,
  exists (select 1 from pg_available_extensions where name = 'pg_cron') as pg_cron_disponivel,
  (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('{schema}.physiq_exportar_aluno(uuid)')) as md5_exportar,
  -- item 1: a contagem de limites por endpoint (a de mais de 22 h sai na 1ª limpeza)
  (select coalesce(jsonb_agg(jsonb_build_object('endpoint', e.endpoint, 'n', e.n, 'desde', e.desde, 'vencidas', e.vencidas)
                             order by e.endpoint), '[]'::jsonb)
     from (select l.endpoint, count(*) as n, min(l.created_at) as desde,
                  count(*) filter (where l.created_at < now() - interval '22 hours') as vencidas
             from {schema}.edge_rate_limits l group by l.endpoint) e) as endpoints,
  (select count(*) from {schema}.edge_rate_limits) as limites_total,
  (select count(*) from {schema}.edge_rate_limits l where l.created_at < now() - interval '22 hours') as limites_vencidas,
  (select min(l.created_at) from {schema}.edge_rate_limits l) as limites_mais_velha,
  -- lacuna 3: a ação da FK de user_id (a = nenhuma, r = restrict, c = cascata, n = set null, d = default); null = sem FK
  (select string_agg(c.confdeltype::text, ',' order by c.conname) from pg_constraint c
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = to_regclass('{schema}.edge_rate_limits') and c.contype = 'f' and a.attname = 'user_id') as fk_user_id,
  -- lacuna 6: quem aplica pode pôr o gatilho em physiq_identidades e criar função no schema
  has_table_privilege('{schema}.physiq_identidades', 'TRIGGER') as pode_gatilho_identidades,
  has_schema_privilege('{schema}', 'CREATE') as pode_criar_no_schema,
  -- item 4 (o projeto inteiro: auth.sessions é uma só para os 2 schemas)
  (select count(*) from auth.sessions) as sessoes,
  (select count(*) from auth.sessions s where s.ip is not null) as sessoes_com_ip,
  (select count(*) from auth.sessions s where s.ip is not null
      and coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) < now() - interval '30 days') as sessoes_com_ip_paradas_30d
