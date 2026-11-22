-- bcode-0021: os jobs que já moram no pg_cron (e2e/bcode0021/banco.py leitura; só roda se o pg_cron existir). SÓ LEITURA.
-- Só nome, horário e se está ativo (os minutos ocupados, antes de pôr os jobs novos), dos jobs que terminam em -{schema}.
select count(*) as jobs_total,
       coalesce(jsonb_agg(jsonb_build_object('nome', j.jobname, 'horario', j.schedule, 'ativo', j.active) order by j.jobname)
                  filter (where j.jobname like '%-{schema}'), '[]'::jsonb) as jobs_do_schema
  from cron.job j
