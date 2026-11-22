-- Physiq bcode-0021, item 4 (decisão do dono 22/11/2026: «corrigir no código até 18/12»; o caso: «4: apagar as sessões ou o IP»).
-- As sessões do login (auth.sessions) guardavam o IP do aparelho sem prazo, e a Política não cita o IP da sessão: em 22/11/2026
-- o Conferente contou 173 sessões antigas com IP de fora da nuvem (principal: 140, de 20/09 a 14/10; Treino: 33, de 21/03 a 06/10),
-- nenhuma usada em 30 dias. Desde ~15/10 o Auth só vê o IP do Worker da Cloudflare ou do servidor (medido, não travado).
-- O que faz: apaga SÓ o IP das sessões (ip = null), uma vez, nos 2 bancos. Ninguém sai: a sessão, o refresh e a chave de entrada
-- no celular novo seguem iguais; no próximo refresh o Auth grava de novo o IP de quem chamou (hoje o do Worker ou do servidor).
-- Sem reversa, de propósito: o IP apagado não volta (e a cópia diária não leva as sessões, docs/backup.md).
-- auth.sessions é uma só para os schemas staging e public: por isso o bloco é o compartilhado (roda 1 vez por projeto).
--
-- O ALVO VAI NA MESMA CHAMADA, senão o arquivo para sem mexer em nada (conf-0051, 22/11/2026: o «todas» não pode sair por engano).
-- Pela Management API, um projeto por vez (principal hkxvtsbwctxkrqzkkdoz e Treino uxwpwdbbnlticxgtzcsb), o dry-run antes:
--   ensaio (o staging; só as sessões das contas de teste do domínio próprio, src/nucleo/contasTeste.ts):
--     begin; set physiq.bcode0021_ip = 'teste'; <este arquivo>; rollback;      ← dry-run
--     set physiq.bcode0021_ip = 'teste'; <este arquivo>
--   produção (só com o OK dele no caso da produção; todas as sessões):
--     begin; set physiq.bcode0021_ip = 'todas'; <este arquivo>; rollback;      ← dry-run
--     set physiq.bcode0021_ip = 'todas'; <este arquivo>
-- Pelo apply_migration_principal.py não há como passar o alvo: o arquivo para (é de propósito). O alvo sai da conexão no fim
-- (reset), porque o pooler reaproveita a sessão do Postgres.
--
-- Antes e depois, só leitura (pela Management API; nunca imprimir IP):
--   select count(*) as sessoes,
--          count(*) filter (where s.ip is not null) as com_ip,
--          count(*) filter (where s.ip is not null
--                             and coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) < now() - interval '30 days')
--            as com_ip_paradas_30d
--     from auth.sessions s;
--   Depois da produção: com_ip_paradas_30d = 0 (o com_ip volta a crescer com os refresh de agora, com o IP do Worker ou do
--   servidor). Depois do ensaio: só as sessões das contas de teste ficam sem IP (e2e/bcode0021/sessoes.py prova numa conta).
-- @@ compartilhado
select set_config('lock_timeout', '5s', true);
do $c$
declare
  v_alvo text := current_setting('physiq.bcode0021_ip', true);
begin
  if v_alvo = 'teste' then
    update auth.sessions s set ip = null from auth.users u
     where u.id = s.user_id and s.ip is not null
       and lower(u.email) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiqcalc\.com\.br$';
  elsif v_alvo = 'todas' then
    update auth.sessions set ip = null where ip is not null;
  else
    raise exception 'bcode-0021 item 4: escolha o alvo na mesma chamada (set physiq.bcode0021_ip = teste, o ensaio, ou todas, a produção); recebi %',
      coalesce(nullif(v_alvo, ''), 'nada');
  end if;
end $c$;
reset physiq.bcode0021_ip;
