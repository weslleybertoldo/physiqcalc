-- PhysiqNutri — W32 Lixeira. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920050000_lixeira.sql`
-- (roda em public E staging, trocando {schema}; o bloco final (depois do marcador que fica sozinho na linha) roda 1x).
-- Depende das tabelas com soft delete (`deleted_at`) das Ws anteriores: respostas_preconsulta (W20/W21), anamneses (W5),
-- antropometrias (W6), planos_alimentares (W9 — refeicoes/itens_refeicao caem por cascade) e pacientes (W1 — NUNCA purgados).

-- A Lixeira (tela /lixeira) NÃO tem tabela própria: lista por PostgREST o que tem `deleted_at` não nulo nas 5 fontes da
-- referência (as policies 'da dona ou master' de SELECT/UPDATE/DELETE não escondem linha excluída), restaura com UPDATE
-- `deleted_at = null` e apaga de vez com DELETE. Esta migration só cria a PURGA: o que ficou mais de 30 dias na lixeira é
-- apagado de vez — exceto pacientes, que são mantidos até a nutricionista restaurar (como a referência).
--
-- `lixeira_purgar()`: security definer (o cron roda sem sessão). COM sessão (auth.uid() não nulo) purga SÓ o que é da própria
-- nutricionista — a tela chama ao abrir (purga preguiçosa, determinística no smoke); SEM sessão (pg_cron) purga de todas.
-- Devolve jsonb {tabela: linhas apagadas}.
create or replace function {schema}.lixeira_purgar()
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_uid uuid := auth.uid();
  v_limite timestamptz := now() - interval '30 days';
  n_respostas integer := 0;
  n_anamneses integer := 0;
  n_antropometrias integer := 0;
  n_planos integer := 0;
begin
  delete from respostas_preconsulta
   where deleted_at is not null and deleted_at < v_limite
     and (v_uid is null or nutricionista_id = v_uid);
  get diagnostics n_respostas = row_count;

  delete from anamneses
   where deleted_at is not null and deleted_at < v_limite
     and (v_uid is null or nutricionista_id = v_uid);
  get diagnostics n_anamneses = row_count;

  delete from antropometrias
   where deleted_at is not null and deleted_at < v_limite
     and (v_uid is null or nutricionista_id = v_uid);
  get diagnostics n_antropometrias = row_count;

  -- refeições e itens do plano caem por cascade (FKs da W9)
  delete from planos_alimentares
   where deleted_at is not null and deleted_at < v_limite
     and (v_uid is null or nutricionista_id = v_uid);
  get diagnostics n_planos = row_count;

  return jsonb_build_object(
    'respostas_preconsulta', n_respostas,
    'anamneses', n_anamneses,
    'antropometrias', n_antropometrias,
    'planos_alimentares', n_planos
  );
end;
$$;
-- os default privileges do projeto dão EXECUTE explícito ao anon em toda função nova → revogar dos dois (public E anon)
revoke all on function {schema}.lixeira_purgar() from public;
revoke all on function {schema}.lixeira_purgar() from anon;
grant execute on function {schema}.lixeira_purgar() to authenticated, service_role;

-- Índices PARCIAIS só das linhas excluídas (poucas): listagem da lixeira por dona + purga por data.
create index if not exists respostas_preconsulta_lixeira_idx on {schema}.respostas_preconsulta (nutricionista_id, deleted_at desc) where deleted_at is not null;
create index if not exists anamneses_lixeira_idx on {schema}.anamneses (nutricionista_id, deleted_at desc) where deleted_at is not null;
create index if not exists antropometrias_lixeira_idx on {schema}.antropometrias (nutricionista_id, deleted_at desc) where deleted_at is not null;
create index if not exists planos_alimentares_lixeira_idx on {schema}.planos_alimentares (nutricionista_id, deleted_at desc) where deleted_at is not null;
create index if not exists pacientes_lixeira_idx on {schema}.pacientes (nutricionista_id, deleted_at desc) where deleted_at is not null;

-- @@ compartilhado
-- Purga AGENDADA: pg_cron (disponível no projeto, 1.6.4) roda a purga de madrugada nos 2 schemas (03:15 UTC = 00:15 em SP).
-- Sem sessão, a função purga de TODAS as nutricionistas. `cron.schedule` com o mesmo nome ATUALIZA o job (idempotente).
-- O `create extension` fica num DO condicional: o `if not exists` puro AINDA dispara o event trigger do Supabase
-- (`grant_pg_cron_access`), que quebra na 2ª rodada com 'dependent privileges exist'. O próprio trigger já dá ao `postgres`
-- o acesso ao schema `cron` na 1ª rodada — nenhum grant manual aqui.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end
$$;
select cron.schedule('lixeira-purga-public', '15 3 * * *', $$select public.lixeira_purgar()$$);
select cron.schedule('lixeira-purga-staging', '15 3 * * *', $$select staging.lixeira_purgar()$$);
