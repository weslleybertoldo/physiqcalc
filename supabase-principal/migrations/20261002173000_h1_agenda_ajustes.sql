-- Physiq H1 (ajustes da agenda achados na W2, 02/10/2026) — banco principal, staging e public. Idempotente; só troca o corpo de 2
-- funções do app do aluno (mesma assinatura e o mesmo formato de resposta; nenhuma tabela, coluna, política ou dado muda; nenhuma
-- consulta já marcada muda).
--
-- Aplicar (backup ANTES — as definições das 2 funções + scripts/backup/backup_principal.py: agendamentos, calendarios, agenda_tags):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002173000_h1_agenda_ajustes.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002173000_h1_agenda_ajustes.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002173000_h1_agenda_ajustes.sql --so public
-- Desfazer: supabase-principal/reversas/20261002173000_h1_agenda_ajustes_reversa.sql (mesmo script, --so <schema>) — volta as 2
-- funções ao corpo da W20 (20261001070000_w20_agenda.sql).
--
--   1. minha_agenda (a Agenda e o Início do app do aluno): o "papel" de quem marcou. Quando o MESMO profissional é o personal E a
--      nutricionista do aluno, a ÁREA da consulta decide (nutrição → nutricionista; treino → personal; geral → sem papel) — antes
--      vinha sempre "personal": a consulta de nutrição saía com o halter, "Personal trainer" e "Confirmado pelo personal". Com 1 papel
--      só, nada muda. O app novo já tira o ícone e a cor da área (a área vence o papel); isto acerta também o texto e o app antigo.
--   2. aluno_agenda_marcar (o aluno marca a consulta do pacote, no calendário padrão do profissional): grava tag_id = a tag padrão do
--      calendário (viva e do profissional) e a área dela (modulo e o título sugerido seguem a tag — o gatilho da W2 confere). Sem tag
--      padrão, como antes: a área pelo papel (só personal → treino; só nutri → nutrição; os dois → geral) e o gatilho põe a base dela.
--   D4 continua: o aluno não vê a tag — nenhuma das 2 devolve tag (aluno_agenda_marcar devolve só ok, id, inicio, fim).

create or replace function {schema}.minha_agenda(p_desde timestamptz default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'paciente_id', a.paciente_id, 'titulo', a.titulo, 'inicio', a.inicio, 'fim', a.fim,
           'dia_inteiro', a.dia_inteiro, 'status', a.status, 'modulo', a.modulo,
           'profissional', (select coalesce(nullif(btrim(pr.nome), ''), split_part(coalesce(pr.email, ''), '@', 1))
                              from {schema}.profiles pr where pr.id = a.nutricionista_id),
           -- H1: o mesmo profissional nos 2 papéis → a área da consulta decide (geral: sem papel)
           'papel', case when a.nutricionista_id = p.personal_id and a.nutricionista_id = p.nutricionista_id
                           then case a.modulo when 'treino' then 'personal' when 'nutricao' then 'nutricionista' end
                         when a.nutricionista_id = p.personal_id then 'personal'
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

-- O aluno com pacote marca a consulta de um mês livre (1 slot, no calendário padrão do profissional). H1: com a tag padrão do
-- calendário.
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
  v_tag uuid;
  v_area text;
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
  -- H1: a tag padrão do calendário (viva e do profissional) decide a área; sem ela, a área pelo papel (como antes)
  if v_cal.tag_padrao_id is not null then
    select t.id, t.area into v_tag, v_area from {schema}.agenda_tags t
     where t.id = v_cal.tag_padrao_id and t.profissional_id = p_profissional and t.deleted_at is null;
  end if;
  v_area := coalesce(v_area, v_papel);
  insert into {schema}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo, tag_id,
                                     conta_id, origem, mes_referencia, aluno_respondeu_em)
  values (p_profissional, v_cal.id, v_p.id,
          case v_area when 'treino' then 'Consulta de treino' when 'nutricao' then 'Consulta de nutrição' else 'Consulta' end,
          p_inicio, v_fim, 'paciente_confirmou', 'confirmado', v_area, v_tag, coalesce(v_p.conta_id, v_cal.conta_id), 'aluno', v_mes, now())
  returning id into v_id;
  perform {schema}.w20_avisar(p_profissional, coalesce(v_p.nome, 'O aluno') || ' marcou uma consulta para ' || {schema}.w20_quando(p_inicio),
                              '/painel/agenda?data=' || to_char(v_dia, 'YYYY-MM-DD'));
  return jsonb_build_object('ok', true, 'id', v_id, 'inicio', p_inicio, 'fim', v_fim);
end;
$$;
revoke execute on function {schema}.aluno_agenda_marcar(uuid, timestamptz) from public, anon;
grant execute on function {schema}.aluno_agenda_marcar(uuid, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
