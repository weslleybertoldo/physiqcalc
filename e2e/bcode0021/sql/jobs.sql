-- bcode-0021: os jobs do schema {schema} e as rodadas deles no pg_cron desde {desde} (e2e/bcode0021/banco.py jobs). SÓ LEITURA.
-- Só nome, horário, ativo, contagens e a hora da última rodada (nunca a mensagem de volta: pode trazer texto de erro).
-- {desde} chega conferido pelo banco.py (uma data ISO com fuso). O mesmo texto roda no PGlite (harness_e2e.mjs).
select j.jobname as nome, j.schedule as horario, j.active as ativo,
       count(d.runid) as rodadas,
       count(d.runid) filter (where d.status = 'succeeded') as ok,
       max(d.start_time) as ultima
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid and d.start_time >= '{desde}'::timestamptz
 where j.jobname in ('physiq-login-bloqueios-limpeza-{schema}', 'physiq-limite-ip-limpeza-{schema}',
                     'physiq-avisos-erro-limpeza-{schema}', 'physiq-limites-limpeza-{schema}')
 group by j.jobname, j.schedule, j.active
 order by 1
