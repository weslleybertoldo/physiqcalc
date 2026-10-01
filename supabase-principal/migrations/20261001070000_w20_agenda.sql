-- Physiq W20 — Painel › Agenda + as regras novas da agenda (banco principal, staging e public). Idempotente; SÓ ACRESCENTA:
-- 3 tabelas novas, colunas novas com padrão compatível, funções e 2 gatilhos. Nenhuma política de agendamentos, calendários
-- ou bloqueios muda e nenhum dado de cliente é alterado (o site antigo do Nutri usa as MESMAS tabelas até a W28).
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: calendarios, agendamentos, bloqueios_agenda, avisos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001070000_w20_agenda.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001070000_w20_agenda.sql --so public
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O que entra (spec §11.3 W20 — N-11, N-53, N-66, NF12, R7 — e o pedido dele de 01/10 ~06:25, plano mestre §2):
--   1. Regras da agenda POR PROFISSIONAL (agenda_config; sem linha = os padrões): duração do slot (30 min), horário de atendimento
--      (08:00–18:00) e dias de atendimento (todos), quantas vezes o aluno reagenda cada consulta (1), a janela do reagendamento
--      (mes = só no mês da consulta · mes_seguinte = até o fim do mês seguinte · livre = qualquer mês) e se o aluno pode desistir.
--      A duração também pode ser POR CALENDÁRIO (calendarios.slot_minutos; vazio = a do profissional) — "por padrão e por agenda".
--   2. Travas de horário: RECORRENTES em agenda_travas (ex.: 13:00–14:00 todo dia, até o profissional liberar); a AVULSA é o
--      bloqueios_agenda de hoje (só aquele dia/aqueles horários — o site antigo já mostra).
--   3. Slots calculados NO BANCO (agenda_slots): só DENTRO do horário e dos dias de atendimento (default A); travado, bloqueado,
--      ocupado (qualquer calendário do mesmo profissional) ou passado não é livre. Painel e app usam a MESMA conta.
--   4. Pacote de consultas por aluno (agenda_pacotes: matrícula × profissional; N meses a partir de um mês, 1 consulta por mês). A
--      do mês conta como usada se o aluno fez, faltou, desistiu ou se o mês acabou sem consulta (default B).
--   5. O aluno confirma, reagenda (1 slot de início; a consulta mantém a duração; nº e janela pelas regras) e desiste pelo app;
--      com pacote, marca a consulta do mês (1 slot). Tudo por funções security definer que conferem as regras aqui.
--   6. Avisos (NF9, sem push — default D): sino do aluno por GATILHO quando o profissional marca, muda ou desmarca (vale também
--      para o que a nutri faz no site antigo); sino do profissional quando o aluno responde; e-mail ao aluno pela função
--      agenda-avisar (reserva aqui, sem repetir em 10 minutos para o mesmo aluno).
--   7. Card "Próximos compromissos" do Resumo (aluno_compromissos) e o pacote definido no aluno (aluno_definir_pacote).
--
-- Colunas novas de agendamentos (o site antigo não manda nenhuma → valem os padrões): reagendamentos (0), mes_referencia (o mês
-- da consulta para o pacote e a janela; vazio = o mês do início), origem ('profissional'), aluno_respondeu_em, aviso_email_em.

-- ============================================================================================================
-- 0. Colunas novas (padrão compatível com o site antigo)
-- ============================================================================================================
alter table {schema}.calendarios add column if not exists slot_minutos smallint
  check (slot_minutos is null or (slot_minutos between 5 and 240 and slot_minutos % 5 = 0));

alter table {schema}.agendamentos add column if not exists reagendamentos smallint not null default 0
  check (reagendamentos between 0 and 50);
alter table {schema}.agendamentos add column if not exists mes_referencia date;
alter table {schema}.agendamentos add column if not exists origem text not null default 'profissional'
  check (origem in ('profissional', 'aluno'));
alter table {schema}.agendamentos add column if not exists aluno_respondeu_em timestamptz;
alter table {schema}.agendamentos add column if not exists aviso_email_em timestamptz;
create index if not exists agendamentos_paciente_inicio_idx on {schema}.agendamentos (paciente_id, inicio) where deleted_at is null;

-- ============================================================================================================
-- 1. Regras da agenda do profissional
-- ============================================================================================================
create table if not exists {schema}.agenda_config (
  profissional_id uuid primary key references auth.users(id) on delete cascade,
  slot_minutos smallint not null default 30 check (slot_minutos between 5 and 240 and slot_minutos % 5 = 0),
  atende_inicio time not null default '08:00',
  atende_fim time not null default '18:00',
  dias smallint[] not null default '{0,1,2,3,4,5,6}' check (dias <@ '{0,1,2,3,4,5,6}'::smallint[]),
  reagendamentos_max smallint not null default 1 check (reagendamentos_max between 0 and 10),
  janela_reagendamento text not null default 'mes' check (janela_reagendamento in ('mes', 'mes_seguinte', 'livre')),
  desistencia boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_config_atendimento check (atende_fim > atende_inicio)
);
grant select, insert, update, delete on {schema}.agenda_config to authenticated;
grant all on {schema}.agenda_config to service_role;
alter table {schema}.agenda_config enable row level security;

drop policy if exists "agenda_config: ler" on {schema}.agenda_config;
create policy "agenda_config: ler" on {schema}.agenda_config for select to authenticated
  using (profissional_id = (select auth.uid()) or {schema}.eh_master()
         or exists (select 1 from {schema}.conta_membros m
                     where m.user_id = agenda_config.profissional_id and m.status = 'ativo' and {schema}.sou_dono(m.conta_id)));
drop policy if exists "agenda_config: as proprias" on {schema}.agenda_config;
create policy "agenda_config: as proprias" on {schema}.agenda_config for insert to authenticated
  with check (profissional_id = (select auth.uid()) or {schema}.eh_master());
drop policy if exists "agenda_config: editar as proprias" on {schema}.agenda_config;
create policy "agenda_config: editar as proprias" on {schema}.agenda_config for update to authenticated
  using (profissional_id = (select auth.uid()) or {schema}.eh_master())
  with check (profissional_id = (select auth.uid()) or {schema}.eh_master());
drop policy if exists "agenda_config: apagar as proprias" on {schema}.agenda_config;
create policy "agenda_config: apagar as proprias" on {schema}.agenda_config for delete to authenticated
  using (profissional_id = (select auth.uid()) or {schema}.eh_master());

drop trigger if exists trg_agenda_config_updated_at on {schema}.agenda_config;
create trigger trg_agenda_config_updated_at before update on {schema}.agenda_config
  for each row execute function {schema}.set_updated_at();

-- ============================================================================================================
-- 2. Travas recorrentes (a avulsa é o bloqueios_agenda de hoje)
-- ============================================================================================================
create table if not exists {schema}.agenda_travas (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references auth.users(id) on delete cascade,
  conta_id uuid references {schema}.contas(id) on delete set null,
  calendario_id uuid references {schema}.calendarios(id) on delete cascade,     -- null = todos os calendários do profissional
  dias smallint[] not null default '{0,1,2,3,4,5,6}' check (cardinality(dias) > 0 and dias <@ '{0,1,2,3,4,5,6}'::smallint[]),
  hora_inicio time not null,
  hora_fim time not null,
  motivo text check (motivo is null or char_length(motivo) <= 120),
  created_at timestamptz not null default now(),
  constraint agenda_travas_periodo check (hora_fim > hora_inicio)
);
create index if not exists agenda_travas_prof_idx on {schema}.agenda_travas (profissional_id);
grant select, insert, update, delete on {schema}.agenda_travas to authenticated;
grant all on {schema}.agenda_travas to service_role;
alter table {schema}.agenda_travas enable row level security;

drop policy if exists "agenda_travas: as proprias ou master" on {schema}.agenda_travas;
create policy "agenda_travas: as proprias ou master" on {schema}.agenda_travas for all to authenticated
  using (profissional_id = (select auth.uid()) or {schema}.eh_master())
  with check (profissional_id = (select auth.uid()) or {schema}.eh_master());
drop policy if exists "agenda_travas: dono da conta" on {schema}.agenda_travas;
create policy "agenda_travas: dono da conta" on {schema}.agenda_travas for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id))
  with check (conta_id is not null and {schema}.sou_dono(conta_id));

-- ============================================================================================================
-- 3. Pacote de consultas (por matrícula × profissional; gravado só pela aluno_definir_pacote)
-- ============================================================================================================
create table if not exists {schema}.agenda_pacotes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  profissional_id uuid not null references auth.users(id) on delete cascade,
  conta_id uuid references {schema}.contas(id) on delete set null,
  total smallint not null check (total between 1 and 60),
  mes_inicio date not null check (extract(day from mes_inicio) = 1),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  encerrado_em timestamptz
);
create unique index if not exists agenda_pacotes_ativo_uq on {schema}.agenda_pacotes (paciente_id, profissional_id) where encerrado_em is null;
grant select on {schema}.agenda_pacotes to authenticated;
grant all on {schema}.agenda_pacotes to service_role;
alter table {schema}.agenda_pacotes enable row level security;

drop policy if exists "agenda_pacotes: quem ve o aluno" on {schema}.agenda_pacotes;
create policy "agenda_pacotes: quem ve o aluno" on {schema}.agenda_pacotes for select to authenticated
  using ({schema}.pode_ver_aluno(paciente_id));

drop trigger if exists trg_agenda_pacotes_updated_at on {schema}.agenda_pacotes;
create trigger trg_agenda_pacotes_updated_at before update on {schema}.agenda_pacotes
  for each row execute function {schema}.set_updated_at();

-- ============================================================================================================
-- 4. Peças internas (sem EXECUTE para o app): datas em São Paulo, regras com os padrões, slots, janela e pacote
-- ============================================================================================================
create or replace function {schema}.w20_mes(p timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', timezone('America/Sao_Paulo', p))::date;
$$;

-- "qui, 15/10 às 14:00" (São Paulo)
create or replace function {schema}.w20_quando(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow from timezone('America/Sao_Paulo', p))::int + 1]
      || ', ' || to_char(timezone('America/Sao_Paulo', p), 'DD/MM') || ' às ' || to_char(timezone('America/Sao_Paulo', p), 'HH24:MI');
$$;

create or replace function {schema}.w20_minutos(p time) returns int
language sql immutable set search_path = '' as $$
  select (extract(hour from p) * 60 + extract(minute from p))::int;
$$;

-- as regras do profissional (sem linha em agenda_config = os padrões)
create or replace function {schema}.agenda_regras_de(p_prof uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slot_minutos', coalesce(c.slot_minutos, 30),
    'atende_inicio', to_char(coalesce(c.atende_inicio, '08:00'::time), 'HH24:MI'),
    'atende_fim', to_char(coalesce(c.atende_fim, '18:00'::time), 'HH24:MI'),
    'dias', to_jsonb(coalesce(c.dias, '{0,1,2,3,4,5,6}'::smallint[])),
    'reagendamentos_max', coalesce(c.reagendamentos_max, 1),
    'janela_reagendamento', coalesce(c.janela_reagendamento, 'mes'),
    'desistencia', coalesce(c.desistencia, true),
    'configurada', c.profissional_id is not null)
  from (select 1) x
  left join {schema}.agenda_config c on c.profissional_id = p_prof;
$$;

-- Slots de [p_de, p_ate] (no máximo 63 dias) do calendário do profissional: só dentro do horário e dos dias de atendimento;
-- cada um com o estado (passado · travado · bloqueado · ocupado · livre). p_duracao = minutos que a consulta ocupa a partir do
-- início do slot (padrão: 1 slot); p_ignorar = a própria consulta (no reagendamento ela não conflita com ela mesma).
create or replace function {schema}.agenda_slots(p_prof uuid, p_calendario uuid, p_de date, p_ate date,
                                                 p_duracao int default null, p_ignorar uuid default null)
returns table (s_inicio timestamptz, s_fim timestamptz, s_estado text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_slot int;
  v_ini int;
  v_fim int;
  v_dias smallint[];
  v_cal_slot int;
  v_dur int;
  v_dia date;
  v_dow smallint;
  v_m int;
  v_a timestamptz;
  v_b timestamptz;
begin
  if p_prof is null or p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then
    return;
  end if;
  select coalesce(c.slot_minutos, 30), {schema}.w20_minutos(coalesce(c.atende_inicio, '08:00'::time)),
         {schema}.w20_minutos(coalesce(c.atende_fim, '18:00'::time)), coalesce(c.dias, '{0,1,2,3,4,5,6}'::smallint[])
    into v_slot, v_ini, v_fim, v_dias
    from (select 1) x left join {schema}.agenda_config c on c.profissional_id = p_prof;
  if p_calendario is not null then
    select cal.slot_minutos into v_cal_slot from {schema}.calendarios cal where cal.id = p_calendario;
    v_slot := coalesce(v_cal_slot, v_slot);
  end if;
  v_dur := greatest(coalesce(p_duracao, v_slot), 5);
  for v_dia in select g::date from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') g loop
    v_dow := extract(dow from v_dia)::smallint;
    continue when not (v_dow = any (v_dias));
    v_m := v_ini;
    while v_m + v_dur <= v_fim loop
      v_a := (v_dia + make_interval(mins => v_m)) at time zone 'America/Sao_Paulo';
      v_b := v_a + make_interval(mins => v_dur);
      s_inicio := v_a;
      s_fim := v_b;
      s_estado := case
        when v_a <= now() then 'passado'
        when exists (select 1 from {schema}.agenda_travas t
                      where t.profissional_id = p_prof
                        and (t.calendario_id is null or p_calendario is null or t.calendario_id = p_calendario)
                        and v_dow = any (t.dias)
                        and {schema}.w20_minutos(t.hora_inicio) < v_m + v_dur
                        and (case when t.hora_fim = '00:00'::time then 1440 else {schema}.w20_minutos(t.hora_fim) end) > v_m) then 'travado'
        when exists (select 1 from {schema}.bloqueios_agenda b
                      where b.nutricionista_id = p_prof
                        and (b.calendario_id is null or p_calendario is null or b.calendario_id = p_calendario)
                        and b.inicio < v_b and b.fim > v_a) then 'bloqueado'
        when exists (select 1 from {schema}.agendamentos a
                      where a.nutricionista_id = p_prof and a.deleted_at is null
                        and a.status not in ('desmarcado', 'paciente_desmarcou')
                        and (p_ignorar is null or a.id <> p_ignorar)
                        and a.inicio < v_b and a.fim > v_a) then 'ocupado'
        else 'livre' end;
      return next;
      v_m := v_m + v_slot;
    end loop;
  end loop;
end;
$$;

-- A janela do reagendamento (default: só no mês da consulta). Nunca antes de hoje nem do mês da consulta, exceto "livre".
create or replace function {schema}.w20_janela(p_janela text, p_mes_ref date) returns table (j_de date, j_ate date)
language sql stable set search_path = '' as $$
  select case when p_janela = 'livre' then h.hoje else greatest(h.hoje, p_mes_ref) end,
         case p_janela
           when 'mes_seguinte' then ((p_mes_ref + interval '2 months')::date - 1)
           when 'livre' then h.hoje + 180
           else ((p_mes_ref + interval '1 month')::date - 1) end
    from (select timezone('America/Sao_Paulo', now())::date as hoje) h;
$$;

-- A situação do pacote ativo (matrícula × profissional), mês a mês: feita · faltou · desistiu · sem_consulta (usados) ·
-- agendada · livre. null = sem pacote.
create or replace function {schema}.agenda_pacote_situacao(p_paciente uuid, p_prof uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pac {schema}.agenda_pacotes%rowtype;
  v_mes_hoje date := {schema}.w20_mes(now());
  v_mes date;
  v_estado text;
  v_meses jsonb := '[]'::jsonb;
  v_usados int := 0;
  v_livres int := 0;
  i int;
  v_feita boolean;
  v_faltou boolean;
  v_desistiu boolean;
  v_futura boolean;
begin
  select * into v_pac from {schema}.agenda_pacotes
   where paciente_id = p_paciente and profissional_id = p_prof and encerrado_em is null;
  if not found then
    return null;
  end if;
  for i in 0 .. v_pac.total - 1 loop
    v_mes := (v_pac.mes_inicio + make_interval(months => i))::date;
    select coalesce(bool_or(a.status in ('agendado', 'encaixe', 'confirmado', 'paciente_confirmou') and a.fim <= now()), false),
           coalesce(bool_or(a.status = 'nao_compareceu'), false),
           coalesce(bool_or(a.status = 'paciente_desmarcou'), false),
           coalesce(bool_or(a.status in ('agendado', 'encaixe', 'confirmado', 'paciente_confirmou') and a.fim > now()), false)
      into v_feita, v_faltou, v_desistiu, v_futura
      from {schema}.agendamentos a
     where a.paciente_id = p_paciente and a.nutricionista_id = p_prof and a.deleted_at is null and not a.dia_inteiro
       and coalesce(a.mes_referencia, {schema}.w20_mes(a.inicio)) = v_mes;
    v_estado := case
      when v_feita then 'feita'
      when v_faltou then 'faltou'
      when v_futura then 'agendada'
      when v_desistiu then 'desistiu'
      when v_mes < v_mes_hoje then 'sem_consulta'
      else 'livre' end;
    if v_estado in ('feita', 'faltou', 'desistiu', 'sem_consulta') then
      v_usados := v_usados + 1;
    elsif v_estado = 'livre' then
      v_livres := v_livres + 1;
    end if;
    v_meses := v_meses || jsonb_build_object('mes', v_mes, 'estado', v_estado);
  end loop;
  return jsonb_build_object(
    'id', v_pac.id, 'paciente_id', v_pac.paciente_id, 'profissional_id', v_pac.profissional_id,
    'total', v_pac.total, 'mes_inicio', v_pac.mes_inicio,
    'mes_fim', (v_pac.mes_inicio + make_interval(months => v_pac.total - 1))::date,
    'usados', v_usados, 'restam', v_pac.total - v_usados, 'livres', v_livres, 'meses', v_meses);
end;
$$;

-- aviso no sino de alguém (nunca impede a ação que avisa)
create or replace function {schema}.w20_avisar(p_user uuid, p_titulo text, p_link text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then
    return;
  end if;
  insert into {schema}.avisos (destino_user_id, tipo, titulo, link) values (p_user, 'consulta_marcada', left(p_titulo, 200), p_link);
exception when others then
  null;
end;
$$;

revoke all on function {schema}.w20_mes(timestamptz) from public, anon, authenticated;
revoke all on function {schema}.w20_quando(timestamptz) from public, anon, authenticated;
revoke all on function {schema}.w20_minutos(time) from public, anon, authenticated;
revoke all on function {schema}.agenda_regras_de(uuid) from public, anon, authenticated;
revoke all on function {schema}.agenda_slots(uuid, uuid, date, date, int, uuid) from public, anon, authenticated;
revoke all on function {schema}.w20_janela(text, date) from public, anon, authenticated;
revoke all on function {schema}.agenda_pacote_situacao(uuid, uuid) from public, anon, authenticated;
revoke all on function {schema}.w20_avisar(uuid, text, text) from public, anon, authenticated;
grant execute on function {schema}.w20_mes(timestamptz) to service_role;
grant execute on function {schema}.w20_quando(timestamptz) to service_role;
grant execute on function {schema}.w20_minutos(time) to service_role;
grant execute on function {schema}.agenda_regras_de(uuid) to service_role;
grant execute on function {schema}.agenda_slots(uuid, uuid, date, date, int, uuid) to service_role;
grant execute on function {schema}.w20_janela(text, date) to service_role;
grant execute on function {schema}.agenda_pacote_situacao(uuid, uuid) to service_role;
grant execute on function {schema}.w20_avisar(uuid, text, text) to service_role;

-- ============================================================================================================
-- 5. Gatilhos de agendamentos: o mês da consulta e o aviso ao aluno
-- ============================================================================================================
-- mes_referencia: na criação, o mês do início; quando o PROFISSIONAL muda a data (aqui ou no site antigo), o mês novo; quando o
-- ALUNO reagenda (a função soma reagendamentos), fica o mês original — a janela e o pacote seguem a consulta daquele mês.
-- (Roda como quem grava — inclusive a nutri no site antigo —, então a conta é feita aqui mesmo, sem chamar função interna.)
create or replace function {schema}.agendamentos_w20_mes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.mes_referencia is null then
      new.mes_referencia := date_trunc('month', timezone('America/Sao_Paulo', new.inicio))::date;
    end if;
  elsif new.inicio is distinct from old.inicio and new.reagendamentos is not distinct from old.reagendamentos then
    new.mes_referencia := date_trunc('month', timezone('America/Sao_Paulo', new.inicio))::date;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_agendamentos_w20_mes on {schema}.agendamentos;
create trigger trg_agendamentos_w20_mes before insert or update of inicio on {schema}.agendamentos
  for each row execute function {schema}.agendamentos_w20_mes();

-- Sino do ALUNO (NF9 "consulta marcada"): quando o profissional marca uma consulta futura, muda a data ou desmarca/apaga. O próprio
-- aluno agindo pelo app não recebe aviso (as funções dele avisam o profissional). Erro aqui nunca impede salvar a agenda.
create or replace function {schema}.agendamentos_w20_avisar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_titulo text;
  v_vivo_antes boolean;
  v_vivo boolean;
begin
  if new.paciente_id is null or new.dia_inteiro then
    return new;
  end if;
  select p.user_id into v_user from {schema}.pacientes p where p.id = new.paciente_id and p.deleted_at is null and p.ativo;
  if v_user is null or v_user = auth.uid() then
    return new;
  end if;
  v_vivo := new.deleted_at is null and new.status not in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu');
  if tg_op = 'INSERT' then
    if not v_vivo or new.inicio <= now() then
      return new;
    end if;
    v_titulo := 'Consulta marcada: ' || {schema}.w20_quando(new.inicio) || '. Confirme no app';
  else
    v_vivo_antes := old.deleted_at is null and old.status not in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu');
    if v_vivo_antes and not v_vivo and (new.status = 'desmarcado' or new.deleted_at is not null) and old.inicio > now() then
      v_titulo := 'Consulta desmarcada: ' || {schema}.w20_quando(old.inicio);
    elsif v_vivo and new.inicio is distinct from old.inicio and new.inicio > now()
          and new.reagendamentos is not distinct from old.reagendamentos then
      v_titulo := 'Sua consulta mudou para ' || {schema}.w20_quando(new.inicio);
    elsif v_vivo and not v_vivo_antes and new.inicio > now() then
      v_titulo := 'Consulta marcada: ' || {schema}.w20_quando(new.inicio) || '. Confirme no app';
    else
      return new;
    end if;
  end if;
  perform {schema}.w20_avisar(v_user, v_titulo, '/perfil/agenda');
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists trg_agendamentos_w20_avisar on {schema}.agendamentos;
create trigger trg_agendamentos_w20_avisar after insert or update of inicio, status, deleted_at on {schema}.agendamentos
  for each row execute function {schema}.agendamentos_w20_avisar();

-- ============================================================================================================
-- 6. Painel: horários do dia (slot a slot) e o card "Próximos compromissos" + o pacote no aluno
-- ============================================================================================================
-- Quem chama: o dono do calendário, o dono da conta dele ou o master.
create or replace function {schema}.agenda_horarios(p_calendario uuid, p_de date, p_ate date, p_duracao int default null,
                                                    p_ignorar uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cal {schema}.calendarios%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sem_login';
  end if;
  select * into v_cal from {schema}.calendarios where id = p_calendario and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'calendario_inexistente');
  end if;
  if not (v_cal.nutricionista_id = auth.uid() or {schema}.eh_master() or (v_cal.conta_id is not null and {schema}.sou_dono(v_cal.conta_id))) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  return jsonb_build_object(
    'ok', true,
    'regras', {schema}.agenda_regras_de(v_cal.nutricionista_id) || jsonb_build_object('slot_calendario', v_cal.slot_minutos),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('inicio', s.s_inicio, 'fim', s.s_fim, 'estado', s.s_estado) order by s.s_inicio)
                         from {schema}.agenda_slots(v_cal.nutricionista_id, v_cal.id, p_de, p_ate, p_duracao, p_ignorar) s), '[]'::jsonb));
end;
$$;

-- As próximas consultas do aluno (de TODOS os profissionais dele — tela 7 mostra a da nutri no painel do personal; sem a
-- observação interna) e os pacotes. Quem chama: quem vê o aluno (a mesma regra do perfil, w14_matricula_da_rota).
create or replace function {schema}.aluno_compromissos(p_aluno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
begin
  select * into v_p from {schema}.pacientes where id = v_id;
  return jsonb_build_object(
    'ok', true,
    'paciente_id', v_id,
    'personal_id', v_p.personal_id,
    'nutricionista_id', v_p.nutricionista_id,
    'consultas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'inicio', a.inicio, 'fim', a.fim, 'dia_inteiro', a.dia_inteiro, 'status', a.status,
               'modulo', a.modulo, 'profissional_id', a.nutricionista_id, 'profissional', {schema}.nome_da_pessoa(a.nutricionista_id),
               'reagendamentos', a.reagendamentos, 'origem', a.origem) order by a.inicio)
        from (select * from {schema}.agendamentos x
               where x.paciente_id = v_id and x.deleted_at is null and x.fim >= now()
                 and x.status not in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu')
               order by x.inicio limit 6) a), '[]'::jsonb),
    'pacotes', coalesce((
      select jsonb_agg({schema}.agenda_pacote_situacao(v_id, k.profissional_id)
                       || jsonb_build_object('profissional', {schema}.nome_da_pessoa(k.profissional_id)) order by k.created_at)
        from {schema}.agenda_pacotes k where k.paciente_id = v_id and k.encerrado_em is null), '[]'::jsonb));
end;
$$;

-- O pacote do aluno com um profissional responsável (p_total = 0 encerra). Quem chama: o próprio profissional, o dono da
-- conta do aluno ou o master.
create or replace function {schema}.aluno_definir_pacote(p_aluno uuid, p_profissional uuid, p_total int, p_mes_inicio date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_p {schema}.pacientes%rowtype;
  v_mes date := date_trunc('month', coalesce(p_mes_inicio, timezone('America/Sao_Paulo', now())::date))::date;
begin
  select * into v_p from {schema}.pacientes where id = v_id for update;
  if p_profissional is null or p_profissional is distinct from v_p.personal_id and p_profissional is distinct from v_p.nutricionista_id then
    return jsonb_build_object('ok', false, 'erro', 'nao_responsavel');
  end if;
  if not (p_profissional = auth.uid() or {schema}.eh_master() or (v_p.conta_id is not null and {schema}.sou_dono(v_p.conta_id))) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if coalesce(p_total, 0) <= 0 then
    update {schema}.agenda_pacotes set encerrado_em = now()
     where paciente_id = v_id and profissional_id = p_profissional and encerrado_em is null;
    return jsonb_build_object('ok', true, 'pacote', null);
  end if;
  if p_total > 60 then
    return jsonb_build_object('ok', false, 'erro', 'total_invalido');
  end if;
  update {schema}.agenda_pacotes set total = p_total, mes_inicio = v_mes
   where paciente_id = v_id and profissional_id = p_profissional and encerrado_em is null;
  if not found then
    insert into {schema}.agenda_pacotes (paciente_id, profissional_id, conta_id, total, mes_inicio, criado_por)
    values (v_id, p_profissional, v_p.conta_id, p_total, v_mes, auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'pacote', {schema}.agenda_pacote_situacao(v_id, p_profissional)
                                                  || jsonb_build_object('profissional', {schema}.nome_da_pessoa(p_profissional)));
end;
$$;

-- E-mail ao aluno (função agenda-avisar): reserva as consultas novas do aluno com este profissional que ainda não saíram por
-- e-mail (aviso_email_em) e devolve o que o e-mail precisa. Nunca 2 e-mails da agenda ao mesmo aluno em 10 minutos.
create or replace function {schema}.agenda_reservar_email(p_agendamento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ag {schema}.agendamentos%rowtype;
  v_p {schema}.pacientes%rowtype;
  v_email text;
  v_lista jsonb;
begin
  if auth.uid() is null then
    raise exception 'sem_login';
  end if;
  select * into v_ag from {schema}.agendamentos where id = p_agendamento and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'agendamento_inexistente');
  end if;
  if not (v_ag.nutricionista_id = auth.uid() or {schema}.eh_master() or (v_ag.conta_id is not null and {schema}.sou_dono(v_ag.conta_id))) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  if v_ag.paciente_id is null then
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'sem_aluno');
  end if;
  select * into v_p from {schema}.pacientes where id = v_ag.paciente_id for update;
  if v_p.user_id is null then
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'sem_login');
  end if;
  v_email := lower(btrim(coalesce(v_p.email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'sem_email');
  end if;
  if exists (select 1 from {schema}.agendamentos a where a.paciente_id = v_p.id and a.aviso_email_em > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'repetido');
  end if;
  with alvo as (
    select a.id from {schema}.agendamentos a
     where a.paciente_id = v_p.id and a.nutricionista_id = v_ag.nutricionista_id and a.deleted_at is null and not a.dia_inteiro
       and a.aviso_email_em is null and a.inicio > now() and a.status in ('agendado', 'encaixe', 'confirmado')
     order by a.inicio limit 10
  ), marcados as (
    update {schema}.agendamentos a set aviso_email_em = now() from alvo where a.id = alvo.id
    returning a.id, a.inicio, a.fim, a.titulo, a.modulo
  )
  select jsonb_agg(jsonb_build_object('id', m.id, 'inicio', m.inicio, 'fim', m.fim, 'titulo', m.titulo, 'modulo', m.modulo) order by m.inicio)
    into v_lista from marcados m;
  if v_lista is null then
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'nada_novo');
  end if;
  return jsonb_build_object('ok', true, 'enviar', true, 'para', v_email, 'aluno', v_p.nome,
                            'quem', {schema}.nome_da_pessoa(v_ag.nutricionista_id), 'consultas', v_lista);
end;
$$;

-- O Resend falhou: desfaz a reserva (só a função, com a service_role)
create or replace function {schema}.agenda_reserva_email_falhou(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update {schema}.agendamentos set aviso_email_em = null where id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

-- ============================================================================================================
-- 7. App do aluno: a agenda (N-53 + regras), as regras/pacotes e as ações (confirmar, reagendar, desistir, marcar)
-- ============================================================================================================
-- minha_agenda (W7) + o que o app precisa para as ações: quem marcou, quantas vezes já reagendou, o mês da consulta e as regras
-- do profissional dela (mesma lista e mesma ordem de antes).
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

-- As regras e os pacotes de cada profissional do aluno (matrículas vivas e ativas).
create or replace function {schema}.minhas_regras_agenda() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'profissional_id', r.prof,
           'paciente_id', r.paciente_id,
           'papel', r.papel,
           'profissional', {schema}.nome_da_pessoa(r.prof),
           'regras', {schema}.agenda_regras_de(r.prof),
           'pacote', {schema}.agenda_pacote_situacao(r.paciente_id, r.prof),
           'tem_calendario', exists (select 1 from {schema}.calendarios c where c.nutricionista_id = r.prof and c.deleted_at is null))
         order by r.papel), '[]'::jsonb)
    from (
      select distinct on (x.prof) x.prof, x.paciente_id, x.papel
        from (select p.personal_id as prof, p.id as paciente_id, 'personal' as papel, p.created_at
                from {schema}.pacientes p
               where auth.uid() is not null and p.user_id = auth.uid() and p.deleted_at is null and p.ativo and p.personal_id is not null
              union all
              select p.nutricionista_id, p.id, 'nutricionista', p.created_at
                from {schema}.pacientes p
               where auth.uid() is not null and p.user_id = auth.uid() and p.deleted_at is null and p.ativo and p.nutricionista_id is not null) x
       order by x.prof, x.created_at
    ) r;
$$;
revoke execute on function {schema}.minhas_regras_agenda() from public, anon;
grant execute on function {schema}.minhas_regras_agenda() to authenticated, service_role;

-- A consulta do aluno que chama (ou erro)
create or replace function {schema}.w20_consulta_do_aluno(p_agendamento uuid) returns {schema}.agendamentos
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ag {schema}.agendamentos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sem_login';
  end if;
  select a.* into v_ag from {schema}.agendamentos a join {schema}.pacientes p on p.id = a.paciente_id
   where a.id = p_agendamento and a.deleted_at is null and p.user_id = auth.uid() and p.deleted_at is null;
  if not found then
    raise exception 'agendamento_inexistente';
  end if;
  return v_ag;
end;
$$;
revoke all on function {schema}.w20_consulta_do_aluno(uuid) from public, anon, authenticated;
grant execute on function {schema}.w20_consulta_do_aluno(uuid) to service_role;

-- Horários LIVRES para o aluno: reagendar a consulta p_agendamento (dentro da janela) ou marcar a do pacote com p_profissional.
-- Devolve só os inícios livres (o aluno não vê a agenda dos outros).
create or replace function {schema}.aluno_agenda_horarios(p_agendamento uuid default null, p_profissional uuid default null,
                                                          p_de date default null, p_ate date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ag {schema}.agendamentos%rowtype;
  v_regras jsonb;
  v_de date;
  v_ate date;
  v_jde date;
  v_jate date;
  v_cal uuid;
  v_prof uuid;
  v_dur int;
  v_pac jsonb;
  v_paciente uuid;
  v_hoje date := timezone('America/Sao_Paulo', now())::date;
  v_livres date[];
begin
  if auth.uid() is null then
    raise exception 'sem_login';
  end if;
  if p_agendamento is not null then
    v_ag := {schema}.w20_consulta_do_aluno(p_agendamento);
    if v_ag.dia_inteiro or v_ag.status in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu') or v_ag.inicio <= now() then
      return jsonb_build_object('ok', false, 'erro', 'nao_reagenda');
    end if;
    v_prof := v_ag.nutricionista_id;
    v_regras := {schema}.agenda_regras_de(v_prof);
    if v_ag.reagendamentos >= (v_regras ->> 'reagendamentos_max')::int then
      return jsonb_build_object('ok', false, 'erro', 'sem_reagendamentos');
    end if;
    select j.j_de, j.j_ate into v_jde, v_jate
      from {schema}.w20_janela(v_regras ->> 'janela_reagendamento', coalesce(v_ag.mes_referencia, {schema}.w20_mes(v_ag.inicio))) j;
    v_cal := v_ag.calendario_id;
    v_dur := greatest((extract(epoch from (v_ag.fim - v_ag.inicio)) / 60)::int, 5);
  else
    -- marcar a consulta do pacote: o profissional precisa ser responsável pelo aluno e ter pacote com mês livre
    select p.id into v_paciente from {schema}.pacientes p
     where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
       and (p.personal_id = p_profissional or p.nutricionista_id = p_profissional)
     order by p.created_at limit 1;
    if v_paciente is null then
      return jsonb_build_object('ok', false, 'erro', 'nao_responsavel');
    end if;
    v_prof := p_profissional;
    v_pac := {schema}.agenda_pacote_situacao(v_paciente, v_prof);
    if v_pac is null then
      return jsonb_build_object('ok', false, 'erro', 'sem_pacote');
    end if;
    select array_agg((m ->> 'mes')::date) into v_livres from jsonb_array_elements(v_pac -> 'meses') m where m ->> 'estado' = 'livre';
    if v_livres is null then
      return jsonb_build_object('ok', false, 'erro', 'pacote_sem_mes_livre');
    end if;
    v_jde := greatest(v_hoje, (select min(x) from unnest(v_livres) x));
    v_jate := ((select max(x) from unnest(v_livres) x) + interval '1 month')::date - 1;
    select c.id into v_cal from {schema}.calendarios c where c.nutricionista_id = v_prof and c.deleted_at is null
     order by c.padrao desc, c.created_at limit 1;
    if v_cal is null then
      return jsonb_build_object('ok', false, 'erro', 'sem_calendario');
    end if;
    v_dur := null;
    v_regras := {schema}.agenda_regras_de(v_prof);
  end if;
  v_de := greatest(coalesce(p_de, v_jde), v_jde);
  v_ate := least(coalesce(p_ate, v_jate), v_jate, v_de + 62);
  if v_ate < v_de then
    return jsonb_build_object('ok', true, 'janela', jsonb_build_object('de', v_jde, 'ate', v_jate), 'horarios', '[]'::jsonb, 'regras', v_regras);
  end if;
  return jsonb_build_object(
    'ok', true,
    'janela', jsonb_build_object('de', v_jde, 'ate', v_jate),
    'regras', v_regras,
    'horarios', coalesce((select jsonb_agg(jsonb_build_object('inicio', s.s_inicio, 'fim', s.s_fim) order by s.s_inicio)
                            from {schema}.agenda_slots(v_prof, v_cal, v_de, v_ate, v_dur, p_agendamento) s
                           where s.s_estado = 'livre'
                             and (v_livres is null or {schema}.w20_mes(s.s_inicio) = any (v_livres))), '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.aluno_agenda_horarios(uuid, uuid, date, date) from public, anon;
grant execute on function {schema}.aluno_agenda_horarios(uuid, uuid, date, date) to authenticated, service_role;

create or replace function {schema}.aluno_agenda_confirmar(p_agendamento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ag {schema}.agendamentos%rowtype := {schema}.w20_consulta_do_aluno(p_agendamento);
  v_nome text;
begin
  if v_ag.status in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu') or v_ag.fim <= now() then
    return jsonb_build_object('ok', false, 'erro', 'nao_confirma');
  end if;
  if v_ag.status = 'paciente_confirmou' then
    return jsonb_build_object('ok', true, 'ja_confirmada', true);
  end if;
  update {schema}.agendamentos set status = 'paciente_confirmou', confirmacao = 'confirmado', aluno_respondeu_em = now()
   where id = v_ag.id;
  select p.nome into v_nome from {schema}.pacientes p where p.id = v_ag.paciente_id;
  perform {schema}.w20_avisar(v_ag.nutricionista_id, coalesce(v_nome, 'O aluno') || ' confirmou a consulta de ' || {schema}.w20_quando(v_ag.inicio),
                              '/painel/agenda?data=' || to_char(timezone('America/Sao_Paulo', v_ag.inicio), 'YYYY-MM-DD'));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function {schema}.aluno_agenda_confirmar(uuid) from public, anon;
grant execute on function {schema}.aluno_agenda_confirmar(uuid) to authenticated, service_role;

create or replace function {schema}.aluno_agenda_desistir(p_agendamento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ag {schema}.agendamentos%rowtype := {schema}.w20_consulta_do_aluno(p_agendamento);
  v_regras jsonb := {schema}.agenda_regras_de(v_ag.nutricionista_id);
  v_nome text;
begin
  if not coalesce((v_regras ->> 'desistencia')::boolean, true) then
    return jsonb_build_object('ok', false, 'erro', 'desistencia_desligada');
  end if;
  if v_ag.status in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu') or v_ag.inicio <= now() then
    return jsonb_build_object('ok', false, 'erro', 'nao_desiste');
  end if;
  update {schema}.agendamentos set status = 'paciente_desmarcou', confirmacao = 'desmarcado', aluno_respondeu_em = now()
   where id = v_ag.id;
  select p.nome into v_nome from {schema}.pacientes p where p.id = v_ag.paciente_id;
  perform {schema}.w20_avisar(v_ag.nutricionista_id, coalesce(v_nome, 'O aluno') || ' desistiu da consulta de ' || {schema}.w20_quando(v_ag.inicio),
                              '/painel/agenda?data=' || to_char(timezone('America/Sao_Paulo', v_ag.inicio), 'YYYY-MM-DD'));
  return jsonb_build_object('ok', true, 'pacote', {schema}.agenda_pacote_situacao(v_ag.paciente_id, v_ag.nutricionista_id));
end;
$$;
revoke execute on function {schema}.aluno_agenda_desistir(uuid) from public, anon;
grant execute on function {schema}.aluno_agenda_desistir(uuid) to authenticated, service_role;

create or replace function {schema}.aluno_agenda_reagendar(p_agendamento uuid, p_inicio timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ag {schema}.agendamentos%rowtype := {schema}.w20_consulta_do_aluno(p_agendamento);
  v_regras jsonb;
  v_jde date;
  v_jate date;
  v_dia date := timezone('America/Sao_Paulo', p_inicio)::date;
  v_dur interval;
  v_estado text;
  v_nome text;
begin
  -- 1 marcação por vez na agenda deste profissional (2 alunos no mesmo horário: o 2º recebe "horario_ocupado")
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || v_ag.nutricionista_id::text, 0));
  select * into v_ag from {schema}.agendamentos where id = v_ag.id for update;
  if v_ag.dia_inteiro or v_ag.status in ('desmarcado', 'paciente_desmarcou', 'nao_compareceu') or v_ag.inicio <= now() then
    return jsonb_build_object('ok', false, 'erro', 'nao_reagenda');
  end if;
  v_regras := {schema}.agenda_regras_de(v_ag.nutricionista_id);
  if v_ag.reagendamentos >= (v_regras ->> 'reagendamentos_max')::int then
    return jsonb_build_object('ok', false, 'erro', 'sem_reagendamentos');
  end if;
  select j.j_de, j.j_ate into v_jde, v_jate
    from {schema}.w20_janela(v_regras ->> 'janela_reagendamento', coalesce(v_ag.mes_referencia, {schema}.w20_mes(v_ag.inicio))) j;
  if p_inicio is null or v_dia < v_jde or v_dia > v_jate then
    return jsonb_build_object('ok', false, 'erro', 'fora_da_janela', 'janela', jsonb_build_object('de', v_jde, 'ate', v_jate));
  end if;
  v_dur := v_ag.fim - v_ag.inicio;
  select s.s_estado into v_estado
    from {schema}.agenda_slots(v_ag.nutricionista_id, v_ag.calendario_id, v_dia, v_dia,
                               greatest((extract(epoch from v_dur) / 60)::int, 5), v_ag.id) s
   where s.s_inicio = p_inicio;
  if v_estado is distinct from 'livre' then
    return jsonb_build_object('ok', false, 'erro', case when v_estado is null then 'horario_invalido' else 'horario_ocupado' end);
  end if;
  update {schema}.agendamentos
     set inicio = p_inicio, fim = p_inicio + v_dur, reagendamentos = v_ag.reagendamentos + 1,
         status = 'paciente_confirmou', confirmacao = 'confirmado', aluno_respondeu_em = now(), aviso_email_em = null
   where id = v_ag.id;
  select p.nome into v_nome from {schema}.pacientes p where p.id = v_ag.paciente_id;
  perform {schema}.w20_avisar(v_ag.nutricionista_id,
    coalesce(v_nome, 'O aluno') || ' reagendou a consulta de ' || {schema}.w20_quando(v_ag.inicio) || ' para ' || {schema}.w20_quando(p_inicio),
    '/painel/agenda?data=' || to_char(timezone('America/Sao_Paulo', p_inicio), 'YYYY-MM-DD'));
  return jsonb_build_object('ok', true, 'inicio', p_inicio, 'fim', p_inicio + v_dur,
                            'reagendamentos', v_ag.reagendamentos + 1, 'reagendamentos_max', (v_regras ->> 'reagendamentos_max')::int);
end;
$$;
revoke execute on function {schema}.aluno_agenda_reagendar(uuid, timestamptz) from public, anon;
grant execute on function {schema}.aluno_agenda_reagendar(uuid, timestamptz) to authenticated, service_role;

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

revoke execute on function {schema}.agenda_horarios(uuid, date, date, int, uuid) from public, anon;
grant execute on function {schema}.agenda_horarios(uuid, date, date, int, uuid) to authenticated, service_role;
revoke execute on function {schema}.aluno_compromissos(uuid) from public, anon;
grant execute on function {schema}.aluno_compromissos(uuid) to authenticated, service_role;
revoke execute on function {schema}.aluno_definir_pacote(uuid, uuid, int, date) from public, anon;
grant execute on function {schema}.aluno_definir_pacote(uuid, uuid, int, date) to authenticated, service_role;
revoke execute on function {schema}.agenda_reservar_email(uuid) from public, anon;
grant execute on function {schema}.agenda_reservar_email(uuid) to authenticated, service_role;
revoke all on function {schema}.agenda_reserva_email_falhou(uuid[]) from public, anon, authenticated;
grant execute on function {schema}.agenda_reserva_email_falhou(uuid[]) to service_role;
