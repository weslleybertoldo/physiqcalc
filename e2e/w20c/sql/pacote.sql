-- Physiq W20c — o pacote com a consulta desmarcada PELO PROFISSIONAL (decisão dele 01/10 ~09:45), no staging, numa transação
-- DESFEITA no fim (raise exception devolve o resultado; nada fica gravado). Rafael Moura (aluno da massa da W20):
--   A) Rafael × Camila, 6 consultas desde 3 meses atrás: M-3 o PROFISSIONAL desmarcou ('desmarcado') · M-2 o ALUNO desistiu
--      ('paciente_desmarcou') · M-1 o ALUNO faltou ('nao_compareceu') · M (este mês) o profissional desmarcou de novo.
--      Esperado: M-3 'desmarcada' (não conta; o pacote anda 1 mês), M-2 'desistiu' e M-1 'faltou' (contam), M 'livre' (ainda
--      dá para marcar a do mês) → usados 2 · restam 4 de 6 · devolvidos 1 · 7 meses (fim = M+3).
--      (Antes, M-3 era 'sem_consulta' e contava → restam 3, fim = M+2.)
--   B) Rafael × Bruno, 6 desde 3 meses atrás: M-3 APAGADA pelo profissional (Lixeira, status agendado) · M-2 nada · M-1 uma falta
--      apagada (status de falta: segue contando como antes) → M-3 'desmarcada', M-2 e M-1 'sem_consulta' → usados 2 · restam 4.
do $t$
declare
  rafael_p uuid := '87431624-7a3b-4659-adec-2f1b7b8c1926';
  camila uuid := 'b0c674ea-ed01-49db-ab17-50d0a0902c02';
  bruno uuid := '03210117-7512-41b6-acfc-924a8a0299c2';
  cal_camila uuid := '383f706f-bb52-450c-a5a5-3c2abf82ad5f';
  m0 date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  ini date := (date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '3 months')::date;
  cal_bruno uuid;
  sa jsonb;
  sb jsonb;
  function_ok boolean;
begin
  -- cenário limpo (as consultas da massa da W20 com a Camila e o Bruno saem SÓ dentro desta transação, que é desfeita)
  delete from staging.agendamentos where paciente_id = rafael_p and nutricionista_id in (camila, bruno);
  delete from staging.agenda_pacotes where paciente_id = rafael_p and profissional_id in (camila, bruno);
  insert into staging.agenda_pacotes (paciente_id, profissional_id, total, mes_inicio) values (rafael_p, camila, 6, ini), (rafael_p, bruno, 6, ini);
  select id into cal_bruno from staging.calendarios where nutricionista_id = bruno and deleted_at is null order by created_at limit 1;
  if cal_bruno is null then
    insert into staging.calendarios (nutricionista_id, nome, cor, padrao) values (bruno, 'Studio W20c', '#a78bfa', true) returning id into cal_bruno;
  end if;
  -- A) Camila
  insert into staging.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo) values
    (camila, cal_camila, rafael_p, 'A M-3 profissional desmarcou', ((ini + interval '9 days') + time '10:00') at time zone 'America/Sao_Paulo', ((ini + interval '9 days') + time '10:30') at time zone 'America/Sao_Paulo', 'desmarcado', 'desmarcado', 'nutricao'),
    (camila, cal_camila, rafael_p, 'A M-2 aluno desistiu', ((ini + interval '1 month 9 days') + time '10:00') at time zone 'America/Sao_Paulo', ((ini + interval '1 month 9 days') + time '10:30') at time zone 'America/Sao_Paulo', 'paciente_desmarcou', 'desmarcado', 'nutricao'),
    (camila, cal_camila, rafael_p, 'A M-1 aluno faltou', ((ini + interval '2 months 9 days') + time '10:00') at time zone 'America/Sao_Paulo', ((ini + interval '2 months 9 days') + time '10:30') at time zone 'America/Sao_Paulo', 'nao_compareceu', 'a_confirmar', 'nutricao'),
    (camila, cal_camila, rafael_p, 'A M profissional desmarcou', ((m0 + interval '27 days') + time '10:00') at time zone 'America/Sao_Paulo', ((m0 + interval '27 days') + time '10:30') at time zone 'America/Sao_Paulo', 'desmarcado', 'desmarcado', 'nutricao');
  -- B) Bruno
  insert into staging.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo, deleted_at) values
    (bruno, cal_bruno, rafael_p, 'B M-3 apagada pelo profissional', ((ini + interval '9 days') + time '10:00') at time zone 'America/Sao_Paulo', ((ini + interval '9 days') + time '10:30') at time zone 'America/Sao_Paulo', 'agendado', 'a_confirmar', 'treino', now()),
    (bruno, cal_bruno, rafael_p, 'B M-1 falta apagada', ((ini + interval '2 months 9 days') + time '10:00') at time zone 'America/Sao_Paulo', ((ini + interval '2 months 9 days') + time '10:30') at time zone 'America/Sao_Paulo', 'nao_compareceu', 'a_confirmar', 'treino', now());
  sa := staging.agenda_pacote_situacao(rafael_p, camila);
  sb := staging.agenda_pacote_situacao(rafael_p, bruno);
  raise exception 'RESULTADO %', jsonb_build_object(
    'mes_atual', m0, 'inicio', ini,
    'A_meses', (select jsonb_agg(x ->> 'estado' order by x ->> 'mes') from jsonb_array_elements(sa -> 'meses') x),
    'A', jsonb_build_object('usados', sa -> 'usados', 'restam', sa -> 'restam', 'total', sa -> 'total', 'livres', sa -> 'livres', 'devolvidos', sa -> 'devolvidos', 'mes_fim', sa -> 'mes_fim'),
    'A_ok', (sa ->> 'usados')::int = 2 and (sa ->> 'restam')::int = 4 and (sa ->> 'devolvidos')::int = 1 and jsonb_array_length(sa -> 'meses') = 7
            and (sa -> 'meses' -> 0 ->> 'estado') = 'desmarcada' and (sa -> 'meses' -> 1 ->> 'estado') = 'desistiu'
            and (sa -> 'meses' -> 2 ->> 'estado') = 'faltou' and (sa -> 'meses' -> 3 ->> 'estado') = 'livre'
            and (sa ->> 'mes_fim')::date = (m0 + interval '3 months')::date,
    'B_meses', (select jsonb_agg(x ->> 'estado' order by x ->> 'mes') from jsonb_array_elements(sb -> 'meses') x),
    'B', jsonb_build_object('usados', sb -> 'usados', 'restam', sb -> 'restam', 'devolvidos', sb -> 'devolvidos', 'mes_fim', sb -> 'mes_fim'),
    'B_ok', (sb ->> 'usados')::int = 2 and (sb ->> 'restam')::int = 4 and (sb ->> 'devolvidos')::int = 1
            and (sb -> 'meses' -> 0 ->> 'estado') = 'desmarcada' and (sb -> 'meses' -> 1 ->> 'estado') = 'sem_consulta'
            and (sb -> 'meses' -> 2 ->> 'estado') = 'sem_consulta');
end $t$;
