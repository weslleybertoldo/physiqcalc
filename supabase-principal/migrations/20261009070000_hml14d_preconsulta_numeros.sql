-- Physiq hml-14d (B21 · D35, 09/10/2026) — os NÚMEROS da Pré-consulta contados no BANCO (banco principal, staging + public).
-- Idempotente; só 1 função NOVA (nenhuma tabela, coluna, política, dado ou função de hoje muda — o APK antigo e a produção atual
-- continuam lendo como antes).
-- Aplicar:
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009070000_hml14d_preconsulta_numeros.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261009070000_hml14d_preconsulta_numeros.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261009070000_hml14d_preconsulta_numeros_reversa.sql
--
-- Hoje o topo da Pré-consulta (Respostas novas; no mês, com as 8 semanas; ligadas; importadas; "N no total"), a aba Formulários
-- ("N respostas · M novas" de cada um) e o número da aba Respostas saem de uma leitura de até 1000 respostas no navegador
-- (listarRespostas): acima de 1000 os números mentem e divergem do número do menu (contado no banco). Aqui:
--   preconsulta_numeros(p_conta, p_inicio_mes, p_agora)   SECURITY INVOKER: a RLS de quem chama decide (P1 + a regra clínica da
--     W18/W21), sobre o MESMO recorte da respostas_da_conta (o que é da conta + o que é meu sem conta, do site antigo), só as vivas.
--     Devolve { ok, total, novas (sem aluno ligado), ligadas (com aluno), importadas, mes (respondidas desde p_inicio_mes — o 1º dia
--     do mês no fuso do navegador, que a tela manda — até o mesmo dia do mês seguinte), semanas (8 inteiros, a mais antiga primeiro:
--     a posição k conta as respondidas entre 7 − k e 8 − k semanas inteiras antes de p_agora), por_formulario { "<formulario_id>":
--     { total, novas } } } — as MESMAS regras que a tela aplicava (ehNova, respostasDoMes, respostasPorSemana e
--     respostasPorFormulario de src/painel/preconsulta/respostasUtil.ts até 33cfae9; a tela agora só mostra o que vem daqui).

create or replace function {schema}.preconsulta_numeros(p_conta uuid, p_inicio_mes timestamptz, p_agora timestamptz default now())
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with p as (
    -- sem o início do mês: o do mês corrente em São Paulo (a tela sempre manda o dela)
    select coalesce(p_inicio_mes, date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as ini,
           coalesce(p_agora, now()) as agora
  ), vivas as (
    -- o recorte da conta ativa (o mesmo da respostas_da_conta e do número do menu); a RLS decide o resto
    select r.formulario_id, r.paciente_id, r.importada_em, r.respondido_em
      from {schema}.respostas_preconsulta r
     where r.deleted_at is null
       and (r.conta_id = p_conta or (r.conta_id is null and r.nutricionista_id = (select auth.uid())))
  ), semana as (
    -- quantas semanas inteiras antes de agora (a desta semana = 0; as do futuro dão negativo e ficam fora, como na tela)
    select floor(extract(epoch from (p.agora - v.respondido_em)) / 604800)::integer as i from vivas v cross join p
  )
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from vivas),
    'novas', (select count(*) from vivas v where v.paciente_id is null),
    'ligadas', (select count(*) from vivas v where v.paciente_id is not null),
    'importadas', (select count(*) from vivas v where v.importada_em is not null),
    -- o mês seguinte contado no calendário de São Paulo (sem horário de verão: a meia-noite do 1º dia continua a mesma hora)
    'mes', (select count(*) from vivas v cross join p
             where v.respondido_em >= p.ini
               and v.respondido_em < ((p.ini at time zone 'America/Sao_Paulo') + interval '1 month') at time zone 'America/Sao_Paulo'),
    'semanas', (select jsonb_agg((select count(*) from semana s where s.i = 7 - k.k) order by k.k) from generate_series(0, 7) as k(k)),
    'por_formulario', coalesce((
      select jsonb_object_agg(x.formulario_id, jsonb_build_object('total', x.total, 'novas', x.novas))
        from (select v.formulario_id, count(*) as total, count(*) filter (where v.paciente_id is null) as novas
                from vivas v where v.formulario_id is not null group by v.formulario_id) x), '{}'::jsonb)
  );
$$;

-- os default privileges do projeto dão EXECUTE ao anon em toda função nova → revogar e dar só a quem tem login
revoke all on function {schema}.preconsulta_numeros(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function {schema}.preconsulta_numeros(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ============================================================================================================
-- Conferência (desfaz tudo se algo sair diferente)
-- ============================================================================================================
do $$
declare
  v_j jsonb;
begin
  if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p
       where p.oid = '{schema}.preconsulta_numeros(uuid, timestamptz, timestamptz)'::regprocedure) then
    raise exception 'hml-14d: preconsulta_numeros tem de ser SECURITY INVOKER com search_path';
  end if;
  if has_function_privilege('anon', '{schema}.preconsulta_numeros(uuid, timestamptz, timestamptz)', 'EXECUTE')
     or not has_function_privilege('authenticated', '{schema}.preconsulta_numeros(uuid, timestamptz, timestamptz)', 'EXECUTE') then
    raise exception 'hml-14d: preconsulta_numeros fora do esperado (só o logado e o servidor)';
  end if;
  -- rodando de verdade (uma conta que não existe, sem login: tudo zero)
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  v_j := {schema}.preconsulta_numeros('00000000-0000-4000-8000-0000000000aa'::uuid, now());
  if v_j is distinct from jsonb_build_object('ok', true, 'total', 0, 'novas', 0, 'ligadas', 0, 'importadas', 0, 'mes', 0,
                                             'semanas', '[0, 0, 0, 0, 0, 0, 0, 0]'::jsonb, 'por_formulario', '{}'::jsonb) then
    raise exception 'hml-14d: preconsulta_numeros de uma conta vazia = %', v_j;
  end if;
end
$$;

notify pgrst, 'reload schema';
