-- Physiq H1 — REVERSA de supabase-principal/migrations/20261002173000_h1_agenda_ajustes.sql (só se o H1 quebrar produção).
-- Volta minha_agenda e aluno_agenda_marcar ao corpo da W20 (20261001070000_w20_agenda.sql, copiado aqui sem mudar uma letra): o
-- papel volta a vir pela ordem personal → nutricionista e a consulta que o aluno marca pelo pacote volta a nascer pela área do papel
-- (o gatilho da W2 põe a base dela). Nenhum dado muda: as consultas que o aluno marcou com a tag padrão ficam como estão.
--
-- Aplicar (backup ANTES — as definições das 2 funções):
--   python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261002173000_h1_agenda_ajustes_reversa.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261002173000_h1_agenda_ajustes_reversa.sql --so public
-- Depois: reverter o PR do H1 (o app novo continua certo sem esta parte do banco: o ícone e a cor saem da área no próprio app).

create or replace function {schema}.minha_agenda(p_desde timestamptz default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'paciente_id', a.paciente_id, 'titulo', a.titulo, 'inicio', a.inicio, 'fim', a.fim,
           'dia_inteiro', a.dia_inteiro, 'status', a.status, 'modulo', a.modulo,
           'profissional', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                              from {schema}.profiles pr where pr.id = a.nutricionista_id),
           'papel', case when a.nutricionista_id = p.personal_id then 'personal'
                         when a.nutricionista_id = p.nutricionista_id then 'nutricionista' end,
           'profissional_id', a.nutricionista_id,
           'reagendamentos', a.reagendamentos,
           'origem', a.origem,
           'mes_referencia', coalesce(a.mes_referencia, {schema}.w20_mes(a.inicio)),
           'regras', {schema}.agenda_regras_de(a.nutricionista_id))
         order by a.inicio), '[]'::jsonb)
    from {schema}.agendamentos a
    join {schema}.pacientes p on p.id = a.paciente_id
   where auth.uid() is not null
     and p.user_id = auth.uid() and p.deleted_at is null and a.deleted_at is null
     and a.inicio >= greatest(coalesce(p_desde, now() - interval '90 days'), now() - interval '400 days');
$$;
revoke execute on function {schema}.minha_agenda(timestamptz) from public, anon;
grant execute on function {schema}.minha_agenda(timestamptz) to authenticated, service_role;

-- O aluno com pacote marca a consulta de um mês livre (1 slot, no calendário padrão do profissional).
create or replace function {schema}.aluno_agenda_marcar(p_profissional uuid, p_inicio timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_p {schema}.pacientes%rowtype;
  v_pac jsonb;
  v_cal {schema}.calendarios%rowtype;
  v_mes date := {schema}.w20_mes(p_inicio);
  v_dia date := timezone('America/Sao_Paulo', p_inicio)::date;
  v_estado text;
  v_fim timestamptz;
  v_id uuid;
  v_papel text;
begin
  if auth.uid() is null then
    raise exception 'sem_login';
  end if;
  select * into v_p from {schema}.pacientes p
   where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
     and (p.personal_id = p_profissional or p.nutricionista_id = p_profissional)
   order by p.created_at limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_responsavel');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || p_profissional::text, 0));
  v_pac := {schema}.agenda_pacote_situacao(v_p.id, p_profissional);
  if v_pac is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_pacote');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_pac -> 'meses') m where (m ->> 'mes')::date = v_mes and m ->> 'estado' = 'livre') then
    return jsonb_build_object('ok', false, 'erro', 'mes_sem_consulta_livre');
  end if;
  select * into v_cal from {schema}.calendarios c where c.nutricionista_id = p_profissional and c.deleted_at is null
   order by c.padrao desc, c.created_at limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_calendario');
  end if;
  select s.s_estado, s.s_fim into v_estado, v_fim
    from {schema}.agenda_slots(p_profissional, v_cal.id, v_dia, v_dia) s where s.s_inicio = p_inicio;
  if v_estado is distinct from 'livre' then
    return jsonb_build_object('ok', false, 'erro', case when v_estado is null then 'horario_invalido' else 'horario_ocupado' end);
  end if;
  v_papel := case when v_p.personal_id = p_profissional and v_p.nutricionista_id is distinct from p_profissional then 'treino'
                  when v_p.nutricionista_id = p_profissional and v_p.personal_id is distinct from p_profissional then 'nutricao'
                  else 'geral' end;
  insert into {schema}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo,
                                     conta_id, origem, mes_referencia, aluno_respondeu_em)
  values (p_profissional, v_cal.id, v_p.id,
          case v_papel when 'treino' then 'Consulta de treino' when 'nutricao' then 'Consulta de nutrição' else 'Consulta' end,
          p_inicio, v_fim, 'paciente_confirmou', 'confirmado', v_papel, coalesce(v_p.conta_id, v_cal.conta_id), 'aluno', v_mes, now())
  returning id into v_id;
  perform {schema}.w20_avisar(p_profissional, coalesce(v_p.nome, 'O aluno') || ' marcou uma consulta para ' || {schema}.w20_quando(p_inicio),
                              '/painel/agenda?data=' || to_char(v_dia, 'YYYY-MM-DD'));
  return jsonb_build_object('ok', true, 'id', v_id, 'inicio', p_inicio, 'fim', v_fim);
end;
$$;
revoke execute on function {schema}.aluno_agenda_marcar(uuid, timestamptz) from public, anon;
grant execute on function {schema}.aluno_agenda_marcar(uuid, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
