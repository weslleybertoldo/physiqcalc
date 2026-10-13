-- Physiq W-A (Acessos do aluno) — P1, migration 2 de 3: as ROTINAS (creatina, remédio, hábito… com horário, dias e lembrete).
-- Banco principal, staging + public. Idempotente. Depende da wa1 (wa_rota, wa_aviso_aluno).
-- Spec: docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md §2.2 (padrões 6, 7, 8, 9), §5.1 (wa2), §5.5.
-- SÓ ACRESCENTA:
--   · rotinas (dono = o login do ALUNO; origem aluno | profissional — não muda se a matrícula sumir; paciente_id = a matrícula de
--     onde o profissional criou, nula na do aluno, on delete set null), rotinas_feitas (o ✓ por dia), rotinas_historico (criou |
--     mudou | arquivou, só os campos mudados). RLS: SELECT só do dono; o profissional lê pelas RPCs (padrão 9); sem policy de escrita;
--   · RPCs do aluno: minhas_rotinas, rotina_salvar, rotina_arquivar, rotina_marcar, rotinas_ordenar; do profissional:
--     rotinas_do_aluno, rotina_prof_salvar, rotina_prof_arquivar (a função `aluno-dia` da P2 chama como a pessoa);
--   · internas: wa_rotina_campos, wa_rotina_json, wa_rotina_gravar, wa_rotina_arquivar.
-- Limites (decisão da spec, §10 "incerto b"): até 30 vivas por aluno; o ✓ hoje ou ontem (São Paulo) e só no dia da semana dela.
-- Apagar = arquivar (some do app; o profissional ainda vê "apagada pelo aluno em dd/mm" e o histórico). Nenhum nome de rotina em raise.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012210000_wa2_rotinas.sql --so staging|public [--dry-run]
-- Testes: python3 e2e/wa/sql_wa.py --grupo rotinas · Reversa: supabase-principal/reversas/20261012210000_wa2_rotinas_reversa.sql

-- ============================================================================================================
-- 1. As tabelas
-- ============================================================================================================
create table if not exists {schema}.rotinas (
  id uuid primary key default gen_random_uuid(),
  dono_user_id uuid not null references auth.users(id) on delete cascade,
  origem text not null,
  paciente_id uuid references {schema}.pacientes(id) on delete set null,
  criada_por uuid references auth.users(id) on delete set null,
  nome text not null,
  detalhe text,
  tipo text not null default 'outro',
  horario time,
  dias_semana smallint[] not null default '{1,2,3,4,5,6,7}',
  lembrete boolean not null default false,
  ordem integer not null default 0,
  arquivada_em timestamptz,
  arquivada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  alterada_em timestamptz not null default now(),
  alterada_por uuid references auth.users(id) on delete set null,
  constraint rotinas_origem_chk check (origem in ('aluno', 'profissional') and (origem = 'profissional' or paciente_id is null)),
  constraint rotinas_nome_chk check (char_length(btrim(nome)) between 1 and 60 and char_length(nome) <= 60),
  constraint rotinas_detalhe_chk check (detalhe is null or char_length(detalhe) between 1 and 120),
  constraint rotinas_tipo_chk check (tipo in ('suplemento', 'remedio', 'habito', 'outro')),
  constraint rotinas_dias_chk check (cardinality(dias_semana) between 1 and 7 and dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[]),
  constraint rotinas_lembrete_chk check (not lembrete or horario is not null),
  constraint rotinas_ordem_chk check (ordem >= 0)
);
create index if not exists rotinas_dono_vivas_idx on {schema}.rotinas (dono_user_id) where arquivada_em is null;
create index if not exists rotinas_paciente_idx on {schema}.rotinas (paciente_id) where paciente_id is not null;
comment on table {schema}.rotinas is
  'W-A: rotinas do aluno (dono = o login do aluno; origem aluno|profissional). Grava só as RPCs; o profissional lê pelas RPCs.';

create table if not exists {schema}.rotinas_feitas (
  rotina_id uuid not null references {schema}.rotinas(id) on delete cascade,
  dia date not null,
  feita_em timestamptz not null default now(),
  primary key (rotina_id, dia)
);

create table if not exists {schema}.rotinas_historico (
  id uuid primary key default gen_random_uuid(),
  rotina_id uuid not null references {schema}.rotinas(id) on delete cascade,
  por uuid references auth.users(id) on delete set null,
  quem text not null,
  o_que text not null,
  antes jsonb,
  depois jsonb,
  em timestamptz not null default now(),
  constraint rotinas_historico_quem_chk check (quem in ('aluno', 'profissional')),
  constraint rotinas_historico_o_que_chk check (o_que in ('criou', 'mudou', 'arquivou'))
);
create index if not exists rotinas_historico_rotina_idx on {schema}.rotinas_historico (rotina_id, em desc);

alter table {schema}.rotinas enable row level security;
alter table {schema}.rotinas_feitas enable row level security;
alter table {schema}.rotinas_historico enable row level security;
revoke all on table {schema}.rotinas, {schema}.rotinas_feitas, {schema}.rotinas_historico from public, anon;
revoke insert, update, delete, truncate, references, trigger on table {schema}.rotinas, {schema}.rotinas_feitas, {schema}.rotinas_historico
  from authenticated;
grant select on table {schema}.rotinas, {schema}.rotinas_feitas, {schema}.rotinas_historico to authenticated;
grant select, insert, update, delete on table {schema}.rotinas, {schema}.rotinas_feitas, {schema}.rotinas_historico to service_role;

drop policy if exists "rotinas: ler as proprias" on {schema}.rotinas;
create policy "rotinas: ler as proprias" on {schema}.rotinas for select to authenticated using (dono_user_id = (select auth.uid()));
drop policy if exists "rotinas_feitas: ler as proprias" on {schema}.rotinas_feitas;
create policy "rotinas_feitas: ler as proprias" on {schema}.rotinas_feitas for select to authenticated
  using (exists (select 1 from {schema}.rotinas r where r.id = rotina_id and r.dono_user_id = (select auth.uid())));
drop policy if exists "rotinas_historico: ler as proprias" on {schema}.rotinas_historico;
create policy "rotinas_historico: ler as proprias" on {schema}.rotinas_historico for select to authenticated
  using (exists (select 1 from {schema}.rotinas r where r.id = rotina_id and r.dono_user_id = (select auth.uid())));

-- ============================================================================================================
-- 2. As internas
-- ============================================================================================================
-- os campos validados: p_dados por cima de p_base (null = criar). { ok, nome, detalhe, tipo, horario 'HH:MM'|null, dias_semana,
-- lembrete } ou { ok: false, erro: 'dados_invalidos' }. Chave desconhecida é ignorada; chave conhecida com tipo errado recusa.
create or replace function {schema}.wa_rotina_campos(p_dados jsonb, p_base {schema}.rotinas) returns jsonb
language plpgsql immutable security definer set search_path = '' as $$
declare
  d jsonb := p_dados;
  v_ruim constant jsonb := jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  v_nome text;
  v_detalhe text;
  v_tipo text;
  v_horario text;
  v_dias smallint[];
  v_lembrete boolean;
begin
  if d is null or jsonb_typeof(d) <> 'object' then
    return v_ruim;
  end if;
  if d ? 'nome' then
    if jsonb_typeof(d -> 'nome') <> 'string' then return v_ruim; end if;
    v_nome := regexp_replace(btrim(d ->> 'nome'), '\s+', ' ', 'g');
  else
    v_nome := p_base.nome;
  end if;
  if v_nome is null or char_length(v_nome) not between 1 and 60 then return v_ruim; end if;
  if d ? 'detalhe' then
    if jsonb_typeof(d -> 'detalhe') not in ('string', 'null') then return v_ruim; end if;
    v_detalhe := nullif(regexp_replace(btrim(coalesce(d ->> 'detalhe', '')), '\s+', ' ', 'g'), '');
  else
    v_detalhe := p_base.detalhe;
  end if;
  if v_detalhe is not null and char_length(v_detalhe) > 120 then return v_ruim; end if;
  if d ? 'tipo' then
    if jsonb_typeof(d -> 'tipo') <> 'string' then return v_ruim; end if;
    v_tipo := d ->> 'tipo';
  else
    v_tipo := coalesce(p_base.tipo, 'outro');
  end if;
  if v_tipo not in ('suplemento', 'remedio', 'habito', 'outro') then return v_ruim; end if;
  if d ? 'horario' then
    if jsonb_typeof(d -> 'horario') = 'null' then
      v_horario := null;
    elsif jsonb_typeof(d -> 'horario') = 'string' and (d ->> 'horario') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      v_horario := d ->> 'horario';
    else
      return v_ruim;
    end if;
  else
    v_horario := to_char(p_base.horario, 'HH24:MI');
  end if;
  if d ? 'dias_semana' then
    if jsonb_typeof(d -> 'dias_semana') <> 'array' or jsonb_array_length(d -> 'dias_semana') not between 1 and 7
       or exists (select 1 from jsonb_array_elements(d -> 'dias_semana') e where jsonb_typeof(e) <> 'number' or e::text !~ '^[1-7]$') then
      return v_ruim;
    end if;
    v_dias := array(select distinct (e::text)::smallint from jsonb_array_elements(d -> 'dias_semana') e order by 1);
  else
    v_dias := coalesce(p_base.dias_semana, '{1,2,3,4,5,6,7}'::smallint[]);
  end if;
  if d ? 'lembrete' then
    if jsonb_typeof(d -> 'lembrete') <> 'boolean' then return v_ruim; end if;
    v_lembrete := (d ->> 'lembrete')::boolean;
  else
    v_lembrete := coalesce(p_base.lembrete, false);
  end if;
  if v_lembrete and v_horario is null then return v_ruim; end if;
  return jsonb_build_object('ok', true, 'nome', v_nome, 'detalhe', v_detalhe, 'tipo', v_tipo, 'horario', v_horario,
                            'dias_semana', to_jsonb(v_dias), 'lembrete', v_lembrete);
end;
$$;

create or replace function {schema}.wa_rotina_json(r {schema}.rotinas) returns jsonb
language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'origem', r.origem, 'paciente_id', r.paciente_id, 'nome', r.nome, 'detalhe', r.detalhe,
    'tipo', r.tipo, 'horario', to_char(r.horario, 'HH24:MI'), 'dias_semana', to_jsonb(r.dias_semana), 'lembrete', r.lembrete,
    'ordem', r.ordem, 'criada_em', r.criada_em, 'alterada_em', r.alterada_em, 'arquivada_em', r.arquivada_em);
$$;

-- cria (p_id null) ou muda (p_id de uma rotina VIVA que quem chama já conferiu) e escreve o histórico. p_quem = aluno | profissional;
-- p_paciente = a matrícula da rota (só na criação pelo profissional). { ok, rotina } · dados_invalidos · limite (31ª viva).
create or replace function {schema}.wa_rotina_gravar(p_id uuid, p_dono uuid, p_dados jsonb, p_quem text, p_paciente uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_base {schema}.rotinas%rowtype;
  v_novo {schema}.rotinas%rowtype;
  v_c jsonb;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
  v_k text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_rotinas:' || p_dono::text));
  if p_id is null then
    v_c := {schema}.wa_rotina_campos(p_dados, null::{schema}.rotinas);
    if not (v_c ->> 'ok')::boolean then return v_c; end if;
    if (select count(*) from {schema}.rotinas r where r.dono_user_id = p_dono and r.arquivada_em is null) >= 30 then
      return jsonb_build_object('ok', false, 'erro', 'limite');
    end if;
    insert into {schema}.rotinas (dono_user_id, origem, paciente_id, criada_por, nome, detalhe, tipo, horario, dias_semana, lembrete,
                                  ordem, alterada_por)
    values (p_dono, p_quem, case when p_quem = 'profissional' then p_paciente end, v_uid, v_c ->> 'nome', v_c ->> 'detalhe',
            v_c ->> 'tipo', (v_c ->> 'horario')::time,
            array(select (x)::smallint from jsonb_array_elements_text(v_c -> 'dias_semana') x),
            (v_c ->> 'lembrete')::boolean,
            coalesce((select max(r.ordem) + 1 from {schema}.rotinas r where r.dono_user_id = p_dono and r.arquivada_em is null), 0),
            v_uid)
    returning * into v_novo;
    insert into {schema}.rotinas_historico (rotina_id, por, quem, o_que, antes, depois)
    values (v_novo.id, v_uid, p_quem, 'criou', null, v_c - 'ok');
    return jsonb_build_object('ok', true, 'rotina', {schema}.wa_rotina_json(v_novo));
  end if;
  select * into v_base from {schema}.rotinas r where r.id = p_id for update;
  v_c := {schema}.wa_rotina_campos(p_dados, v_base);
  if not (v_c ->> 'ok')::boolean then return v_c; end if;
  foreach v_k in array array['nome', 'detalhe', 'tipo', 'horario', 'dias_semana', 'lembrete'] loop
    if (v_c -> v_k) is distinct from ({schema}.wa_rotina_json(v_base) -> v_k) then
      v_antes := v_antes || jsonb_build_object(v_k, {schema}.wa_rotina_json(v_base) -> v_k);
      v_depois := v_depois || jsonb_build_object(v_k, v_c -> v_k);
    end if;
  end loop;
  if v_depois = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'rotina', {schema}.wa_rotina_json(v_base));
  end if;
  update {schema}.rotinas
     set nome = v_c ->> 'nome', detalhe = v_c ->> 'detalhe', tipo = v_c ->> 'tipo', horario = (v_c ->> 'horario')::time,
         dias_semana = array(select (x)::smallint from jsonb_array_elements_text(v_c -> 'dias_semana') x),
         lembrete = (v_c ->> 'lembrete')::boolean, alterada_em = now(), alterada_por = v_uid
   where id = p_id
  returning * into v_novo;
  insert into {schema}.rotinas_historico (rotina_id, por, quem, o_que, antes, depois) values (p_id, v_uid, p_quem, 'mudou', v_antes, v_depois);
  return jsonb_build_object('ok', true, 'rotina', {schema}.wa_rotina_json(v_novo));
end;
$$;

-- arquiva uma rotina VIVA que quem chama já conferiu (some do app; o histórico fica)
create or replace function {schema}.wa_rotina_arquivar(p_id uuid, p_quem text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  update {schema}.rotinas set arquivada_em = now(), arquivada_por = v_uid, alterada_em = now(), alterada_por = v_uid
   where id = p_id and arquivada_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  insert into {schema}.rotinas_historico (rotina_id, por, quem, o_que) values (p_id, v_uid, p_quem, 'arquivou');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function {schema}.wa_rotina_campos(jsonb, {schema}.rotinas), {schema}.wa_rotina_json({schema}.rotinas),
  {schema}.wa_rotina_gravar(uuid, uuid, jsonb, text, uuid), {schema}.wa_rotina_arquivar(uuid, text) from public, anon, authenticated;
grant execute on function {schema}.wa_rotina_campos(jsonb, {schema}.rotinas), {schema}.wa_rotina_json({schema}.rotinas),
  {schema}.wa_rotina_gravar(uuid, uuid, jsonb, text, uuid), {schema}.wa_rotina_arquivar(uuid, text) to service_role;

-- ============================================================================================================
-- 3. As RPCs do ALUNO (dono = o token; nada de dono/matrícula do corpo)
-- ============================================================================================================
-- { ok, hoje, rotinas: [vivas, por hora], feitas: [{ rotina_id, dia, feita_em }] no intervalo } · sem_login · dados_invalidos (> 31 dias)
create or replace function {schema}.minhas_rotinas(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 30 then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  return jsonb_build_object('ok', true, 'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'rotinas', coalesce((select jsonb_agg({schema}.wa_rotina_json(r) order by r.horario nulls last, r.ordem, r.criada_em)
                           from {schema}.rotinas r where r.dono_user_id = v_uid and r.arquivada_em is null), '[]'::jsonb),
    'feitas', coalesce((select jsonb_agg(jsonb_build_object('rotina_id', f.rotina_id, 'dia', f.dia, 'feita_em', f.feita_em)
                                         order by f.dia, f.feita_em)
                          from {schema}.rotinas_feitas f join {schema}.rotinas r on r.id = f.rotina_id
                         where r.dono_user_id = v_uid and r.arquivada_em is null and f.dia between p_de and p_ate), '[]'::jsonb));
end;
$$;

-- criar (p_id null; só quem é aluno — a regra do meu_paciente_id: login vivo com matrícula viva, inclusive o app sem profissional)
-- ou mudar QUALQUER rotina viva dele (as do profissional também — P8b). { ok, rotina } · sem_login · sem_acesso · nao_encontrado ·
-- dados_invalidos · limite
create or replace function {schema}.rotina_salvar(p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_id is null then
    if {schema}.meu_paciente_id() is null then
      return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
    end if;
    return {schema}.wa_rotina_gravar(null, v_uid, p_dados, 'aluno', null);
  end if;
  if not exists (select 1 from {schema}.rotinas r where r.id = p_id and r.dono_user_id = v_uid and r.arquivada_em is null) then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  return {schema}.wa_rotina_gravar(p_id, v_uid, p_dados, 'aluno', null);
end;
$$;

create or replace function {schema}.rotina_arquivar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if not exists (select 1 from {schema}.rotinas r where r.id = p_id and r.dono_user_id = v_uid and r.arquivada_em is null) then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  return {schema}.wa_rotina_arquivar(p_id, 'aluno');
end;
$$;

-- o ✓: hoje ou ontem (São Paulo), no dia da semana da rotina; só o aluno marca. { ok, feita } · sem_login · nao_encontrado · dados_invalidos
create or replace function {schema}.rotina_marcar(p_id uuid, p_dia date, p_feita boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias smallint[];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_dia is null or p_feita is null or p_dia not in (v_hoje, v_hoje - 1) then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  select r.dias_semana into v_dias from {schema}.rotinas r where r.id = p_id and r.dono_user_id = v_uid and r.arquivada_em is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if not (extract(isodow from p_dia)::smallint = any(v_dias)) then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if p_feita then
    insert into {schema}.rotinas_feitas (rotina_id, dia) values (p_id, p_dia) on conflict (rotina_id, dia) do nothing;
  else
    delete from {schema}.rotinas_feitas where rotina_id = p_id and dia = p_dia;
  end if;
  return jsonb_build_object('ok', true, 'feita', p_feita);
end;
$$;

-- a ordem da lista (≤ 30 ids, sem repetir, todas vivas dele). { ok } · sem_login · dados_invalidos · nao_encontrado
create or replace function {schema}.rotinas_ordenar(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 30 or array_position(p_ids, null) is not null
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if (select count(*) from {schema}.rotinas r where r.id = any(p_ids) and r.dono_user_id = v_uid and r.arquivada_em is null)
     <> cardinality(p_ids) then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  update {schema}.rotinas r set ordem = x.i - 1 from unnest(p_ids) with ordinality as x(id, i) where r.id = x.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================================================
-- 4. As RPCs do PROFISSIONAL (a matrícula da rota; padrões 7 e 9)
-- ============================================================================================================
-- as do aluno (todo profissional que vê uma matrícula viva dele) + as de profissional das matrículas que quem chama vê; com as
-- arquivadas (50 mais novas), as feitas do intervalo e o histórico (100 mais novos). { ok, paciente_id, tem_login, pode_criar,
-- rotinas[+ pode_editar, criada_por_nome, arquivada_pelo_aluno], feitas, historico } · sem_login · sem_acesso · aluno_inexistente ·
-- dados_invalidos
create or replace function {schema}.rotinas_do_aluno(p_aluno uuid, p_de date, p_ate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
  v_id uuid;
  v_user uuid;
  v_pode boolean;
  v_ids uuid[];
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 30 then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  v_r := {schema}.wa_rota(p_aluno);
  if not (v_r ->> 'ok')::boolean then return v_r; end if;
  v_id := (v_r ->> 'id')::uuid;
  select p.user_id into v_user from {schema}.pacientes p where p.id = v_id;
  if v_user is null then
    return jsonb_build_object('ok', true, 'paciente_id', v_id, 'tem_login', false, 'pode_criar', false,
                              'rotinas', '[]'::jsonb, 'feitas', '[]'::jsonb, 'historico', '[]'::jsonb);
  end if;
  v_pode := {schema}.w14_pode_editar(v_id);
  select coalesce(array_agg(x.id), array[]::uuid[]) into v_ids from (
    (select r.id from {schema}.rotinas r
      where r.dono_user_id = v_user and r.arquivada_em is null
        and (r.origem = 'aluno' or (r.paciente_id is not null and {schema}.pode_mexer_no_acesso(r.paciente_id))))
    union all
    (select r.id from {schema}.rotinas r
      where r.dono_user_id = v_user and r.arquivada_em is not null
        and (r.origem = 'aluno' or (r.paciente_id is not null and {schema}.pode_mexer_no_acesso(r.paciente_id)))
      order by r.arquivada_em desc limit 50)) x;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'tem_login', true, 'pode_criar', v_pode,
    'rotinas', coalesce((
      select jsonb_agg({schema}.wa_rotina_json(r) || jsonb_build_object(
               'pode_editar', v_pode and r.origem = 'profissional' and r.paciente_id = v_id and r.arquivada_em is null,
               'criada_por_nome', case when r.origem = 'profissional' then {schema}.nome_da_pessoa(r.criada_por) end,
               'arquivada_pelo_aluno', r.arquivada_em is not null and r.arquivada_por is not distinct from v_user)
             order by r.arquivada_em nulls first, r.horario nulls last, r.ordem, r.criada_em)
        from {schema}.rotinas r where r.id = any(v_ids)), '[]'::jsonb),
    'feitas', coalesce((
      select jsonb_agg(jsonb_build_object('rotina_id', f.rotina_id, 'dia', f.dia, 'feita_em', f.feita_em) order by f.dia, f.feita_em)
        from {schema}.rotinas_feitas f where f.rotina_id = any(v_ids) and f.dia between p_de and p_ate), '[]'::jsonb),
    'historico', coalesce((
      select jsonb_agg(h.j order by h.em desc) from (
        select jsonb_build_object('rotina_id', x.rotina_id, 'quem', x.quem, 'o_que', x.o_que, 'antes', x.antes, 'depois', x.depois,
                                  'em', x.em, 'por_nome', case when x.quem = 'profissional' then {schema}.nome_da_pessoa(x.por) end) as j,
               x.em
          from {schema}.rotinas_historico x where x.rotina_id = any(v_ids) order by x.em desc limit 100) h), '[]'::jsonb));
end;
$$;

-- criar para o aluno (origem profissional, paciente_id = a matrícula da rota; aviso no sino, 1 por dia) ou mudar uma de profissional
-- DESTA matrícula. { ok, rotina } · sem_login · sem_acesso · aluno_inexistente · sem_login_do_aluno · so_do_aluno (a rotina é do aluno)
-- · nao_encontrado (de outra matrícula, arquivada ou inexistente) · dados_invalidos · limite
create or replace function {schema}.rotina_prof_salvar(p_aluno uuid, p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
  v_id uuid;
  v_user uuid;
  v_rot {schema}.rotinas%rowtype;
begin
  v_r := {schema}.wa_rota(p_aluno);
  if not (v_r ->> 'ok')::boolean then return v_r; end if;
  v_id := (v_r ->> 'id')::uuid;
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  select p.user_id into v_user from {schema}.pacientes p where p.id = v_id;
  if v_user is null then return jsonb_build_object('ok', false, 'erro', 'sem_login_do_aluno'); end if;
  if p_id is null then
    v_r := {schema}.wa_rotina_gravar(null, v_user, p_dados, 'profissional', v_id);
    if (v_r ->> 'ok')::boolean then
      perform {schema}.wa_aviso_aluno(v_user, 'Seu profissional criou uma rotina para você', '/perfil/rotinas');
    end if;
    return v_r;
  end if;
  select * into v_rot from {schema}.rotinas r where r.id = p_id and r.dono_user_id = v_user and r.arquivada_em is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if v_rot.origem = 'aluno' then return jsonb_build_object('ok', false, 'erro', 'so_do_aluno'); end if;
  if v_rot.paciente_id is distinct from v_id then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return {schema}.wa_rotina_gravar(p_id, v_user, p_dados, 'profissional', v_id);
end;
$$;

create or replace function {schema}.rotina_prof_arquivar(p_aluno uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
  v_id uuid;
  v_user uuid;
  v_rot {schema}.rotinas%rowtype;
begin
  v_r := {schema}.wa_rota(p_aluno);
  if not (v_r ->> 'ok')::boolean then return v_r; end if;
  v_id := (v_r ->> 'id')::uuid;
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  select p.user_id into v_user from {schema}.pacientes p where p.id = v_id;
  if v_user is null then return jsonb_build_object('ok', false, 'erro', 'sem_login_do_aluno'); end if;
  select * into v_rot from {schema}.rotinas r where r.id = p_id and r.dono_user_id = v_user and r.arquivada_em is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if v_rot.origem = 'aluno' then return jsonb_build_object('ok', false, 'erro', 'so_do_aluno'); end if;
  if v_rot.paciente_id is distinct from v_id then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return {schema}.wa_rotina_arquivar(p_id, 'profissional');
end;
$$;

revoke all on function {schema}.minhas_rotinas(date, date), {schema}.rotina_salvar(uuid, jsonb), {schema}.rotina_arquivar(uuid),
  {schema}.rotina_marcar(uuid, date, boolean), {schema}.rotinas_ordenar(uuid[]), {schema}.rotinas_do_aluno(uuid, date, date),
  {schema}.rotina_prof_salvar(uuid, uuid, jsonb), {schema}.rotina_prof_arquivar(uuid, uuid) from public, anon;
grant execute on function {schema}.minhas_rotinas(date, date), {schema}.rotina_salvar(uuid, jsonb), {schema}.rotina_arquivar(uuid),
  {schema}.rotina_marcar(uuid, date, boolean), {schema}.rotinas_ordenar(uuid[]), {schema}.rotinas_do_aluno(uuid, date, date),
  {schema}.rotina_prof_salvar(uuid, uuid, jsonb), {schema}.rotina_prof_arquivar(uuid, uuid) to authenticated, service_role;

-- ============================================================================================================
-- 5. Conferência
-- ============================================================================================================
do $wa$
declare
  v_t regclass;
  v_f text;
  r record;
begin
  foreach v_t in array array['{schema}.rotinas'::regclass, '{schema}.rotinas_feitas'::regclass, '{schema}.rotinas_historico'::regclass] loop
    if not exists (select 1 from pg_catalog.pg_class c where c.oid = v_t and c.relrowsecurity) then
      raise exception 'wa2: % sem RLS', v_t;
    end if;
    if exists (select 1 from pg_catalog.pg_policy p where p.polrelid = v_t and p.polcmd <> 'r') then
      raise exception 'wa2: % com policy de escrita', v_t;
    end if;
    if pg_catalog.has_table_privilege('anon', v_t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
       or pg_catalog.has_table_privilege('authenticated', v_t, 'INSERT, UPDATE, DELETE, TRUNCATE')
       or not pg_catalog.has_table_privilege('authenticated', v_t, 'SELECT') then
      raise exception 'wa2: % com privilégio fora do esperado', v_t;
    end if;
  end loop;
  foreach v_f in array array['{schema}.minhas_rotinas(date, date)', '{schema}.rotina_salvar(uuid, jsonb)', '{schema}.rotina_arquivar(uuid)',
                             '{schema}.rotina_marcar(uuid, date, boolean)', '{schema}.rotinas_ordenar(uuid[])',
                             '{schema}.rotinas_do_aluno(uuid, date, date)', '{schema}.rotina_prof_salvar(uuid, uuid, jsonb)',
                             '{schema}.rotina_prof_arquivar(uuid, uuid)'] loop
    select p.oid, p.prosecdef, p.proconfig into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if r.oid is null or not r.prosecdef or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%')
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa2: % fora do esperado (definer, search_path, logado e servidor)', v_f;
    end if;
  end loop;
  foreach v_f in array array['{schema}.wa_rotina_campos(jsonb, {schema}.rotinas)', '{schema}.wa_rotina_json({schema}.rotinas)',
                             '{schema}.wa_rotina_gravar(uuid, uuid, jsonb, text, uuid)', '{schema}.wa_rotina_arquivar(uuid, text)'] loop
    select p.oid, p.prosecdef, p.proconfig into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if r.oid is null or not r.prosecdef or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%')
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa2: % fora do esperado (interna: só o servidor)', v_f;
    end if;
  end loop;
end
$wa$;
