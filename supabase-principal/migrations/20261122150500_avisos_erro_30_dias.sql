-- Physiq bcode-0021, item 3 (decisão do dono 22/11/2026: «corrigir no código até 18/12; texto do 1 numa versão seguinte»).
-- Os avisos de erro saem em até 30 dias mesmo sem aviso novo («Avisos de erro | 30 dias», src/publico/legal/politica.ts).
-- Hoje a {schema}.registrar_aviso_erro (hml-10) só apaga o que passou de 30 dias quando chega um aviso: em 22/11/2026, 7 de 15
-- tinham mais de 30 dias. Agora um job de hora em hora (minuto 47) apaga o que passou de 29 dias e 22 horas (com a hora do job,
-- nada passa de 30 dias nem com 1 rodada perdida do pg_cron, a mesma folga dos itens 1 e 2) e esta migração apaga uma vez o que
-- já passou. A registrar_aviso_erro não muda.
-- A cópia no Telegram é a outra metade do item 3 (o grupo só dos avisos com o apagar automático): não é SQL, vai no caso.
-- Banco principal, staging + public. Idempotente: o cron.schedule troca o job de mesmo nome.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging --dry-run; depois sem o --dry-run;
--          com o OK de produção: --so public. NUNCA sem --so.
-- Reversa: supabase-principal/reversas/20261122150500_avisos_erro_30_dias_reversa.sql (o que foi apagado não volta).
select set_config('lock_timeout', '5s', true);

do $c$
begin
  if to_regclass('{schema}.avisos_erro') is null or to_regclass('{schema}.avisos_erro_hora') is null then
    raise exception 'bcode-0021: as tabelas dos avisos de erro não existem em {schema} (falta a hml-10)';
  end if;
end $c$;

-- o comando do job vai inteiro aqui (molde: physiq-push-limpeza-{schema}, 20261001100000_w20c_push.sql); o delete do with roda
-- sempre, mesmo sem ninguém ler o resultado dele
select cron.schedule('physiq-avisos-erro-limpeza-{schema}', '47 * * * *',
  $$with velhos as (delete from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < now() - interval '29 days 22 hours') delete from {schema}.avisos_erro_hora where hora < now() - interval '29 days 22 hours'$$);

delete from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < now() - interval '29 days 22 hours';
delete from {schema}.avisos_erro_hora where hora < now() - interval '29 days 22 hours';

-- conferência: o job ativo e nada com mais de 30 dias
do $c$
begin
  if not exists (select 1 from cron.job j
                  where j.jobname = 'physiq-avisos-erro-limpeza-{schema}' and j.schedule = '47 * * * *' and j.active
                    and j.command like 'with velhos as (delete from {schema}.avisos_erro %') then
    raise exception 'bcode-0021: o job physiq-avisos-erro-limpeza-{schema} fora do esperado';
  end if;
  if exists (select 1 from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < now() - interval '30 days')
     or exists (select 1 from {schema}.avisos_erro_hora where hora < now() - interval '30 days') then
    raise exception 'bcode-0021: sobrou aviso de erro com mais de 30 dias em {schema}';
  end if;
end $c$;
