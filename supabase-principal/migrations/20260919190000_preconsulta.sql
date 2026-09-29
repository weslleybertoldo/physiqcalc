-- PhysiqNutri — W20 Pré-consulta. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919190000_preconsulta.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (profiles, eh_master, set_updated_at) e de pacientes (W1).
-- Sem bloco único: as duas RPCs públicas são por schema (security definer com search_path fixo no schema).

-- Formulários de pré-consulta. A nutricionista monta a partir de um modelo de anamnese (cada pergunta vira texto livre), de um
-- questionário de saúde (perguntas + faixas copiadas — o resultado sai na hora pra quem responde) ou em branco, e compartilha o
-- link público /f/<slug>. `perguntas` no MESMO formato da W19 ({id, texto, tipo escala|sim_nao|multipla|texto, max, pontos_sim,
-- opcoes [{texto, pontos}]}); `faixas` só na origem questionario ({min, max, rotulo, nivel}). `origem_id` só documenta de onde
-- veio (modelo de anamnese ou questionário). O público NÃO lê a tabela: passa pela RPC preconsulta_formulario. Exclusão SOFT.
create table if not exists {schema}.formularios_preconsulta (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  descricao text not null default '',
  origem text not null default 'personalizado',
  origem_id uuid,
  perguntas jsonb not null default '[]'::jsonb,
  faixas jsonb not null default '[]'::jsonb,
  slug text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint formularios_preconsulta_origem_check check (origem in ('anamnese', 'questionario', 'personalizado')),
  constraint formularios_preconsulta_perguntas_check check (jsonb_typeof(perguntas) = 'array'),
  constraint formularios_preconsulta_faixas_check check (jsonb_typeof(faixas) = 'array'),
  constraint formularios_preconsulta_slug_key unique (slug)
);
create index if not exists formularios_preconsulta_nutri_idx on {schema}.formularios_preconsulta (nutricionista_id);
grant all on {schema}.formularios_preconsulta to anon, authenticated, service_role;
alter table {schema}.formularios_preconsulta enable row level security;

drop policy if exists "formularios_preconsulta: ler os proprios ou master" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: ler os proprios ou master" on {schema}.formularios_preconsulta
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "formularios_preconsulta: criar os proprios ou master" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: criar os proprios ou master" on {schema}.formularios_preconsulta
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "formularios_preconsulta: editar os proprios ou master" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: editar os proprios ou master" on {schema}.formularios_preconsulta
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "formularios_preconsulta: apagar os proprios ou master" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: apagar os proprios ou master" on {schema}.formularios_preconsulta
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_formularios_preconsulta_updated_at on {schema}.formularios_preconsulta;
create trigger trg_formularios_preconsulta_updated_at before update on {schema}.formularios_preconsulta
  for each row execute function {schema}.set_updated_at();

-- Respostas recebidas pelo link público. Título, perguntas e faixas são CÓPIA do formulário na hora (o formulário pode ser
-- editado/excluído depois sem mexer no histórico — padrão das W15–W19); `respostas` = {id da pergunta: valor}; pontuação, faixa e
-- nível calculados pela RPC ao gravar. Quem respondeu: nome (obrigatório), e-mail e telefone. `paciente_id` fica NULL até a
-- nutricionista vincular (W21). SEM policy de INSERT: só a RPC preconsulta_responder (security definer) grava. Exclusão SOFT.
create table if not exists {schema}.respostas_preconsulta (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  formulario_id uuid references {schema}.formularios_preconsulta(id) on delete set null,
  titulo text not null default '',
  perguntas jsonb not null default '[]'::jsonb,
  faixas jsonb not null default '[]'::jsonb,
  respostas jsonb not null default '{}'::jsonb,
  pontuacao numeric not null default 0,
  faixa text not null default '',
  nivel text not null default '',
  nome text not null,
  email text not null default '',
  telefone text not null default '',
  paciente_id uuid references {schema}.pacientes(id) on delete set null,
  respondido_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint respostas_preconsulta_perguntas_check check (jsonb_typeof(perguntas) = 'array'),
  constraint respostas_preconsulta_faixas_check check (jsonb_typeof(faixas) = 'array'),
  constraint respostas_preconsulta_respostas_check check (jsonb_typeof(respostas) = 'object'),
  constraint respostas_preconsulta_nivel_check check (nivel in ('baixo', 'moderado', 'alto', ''))
);
create index if not exists respostas_preconsulta_nutri_data_idx on {schema}.respostas_preconsulta (nutricionista_id, respondido_em desc);
create index if not exists respostas_preconsulta_formulario_idx on {schema}.respostas_preconsulta (formulario_id);
grant all on {schema}.respostas_preconsulta to anon, authenticated, service_role;
alter table {schema}.respostas_preconsulta enable row level security;

drop policy if exists "respostas_preconsulta: ler as proprias ou master" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: ler as proprias ou master" on {schema}.respostas_preconsulta
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "respostas_preconsulta: editar as proprias ou master" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: editar as proprias ou master" on {schema}.respostas_preconsulta
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "respostas_preconsulta: apagar as proprias ou master" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: apagar as proprias ou master" on {schema}.respostas_preconsulta
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_respostas_preconsulta_updated_at on {schema}.respostas_preconsulta;
create trigger trg_respostas_preconsulta_updated_at before update on {schema}.respostas_preconsulta
  for each row execute function {schema}.set_updated_at();

-- RPC pública 1: o formulário VIVO e ATIVO pelo slug (id, título, descrição, perguntas, faixas, nome da profissional) ou NULL.
-- security definer: roda como o dono (postgres) e enxerga a tabela mesmo sem policy pro anon; o search_path fixo no schema
-- garante que o `staging` lê o `staging`. Só anon/authenticated executam (revoke do public).
create or replace function {schema}.preconsulta_formulario(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = {schema}, public
as $$
  select jsonb_build_object(
    'id', f.id,
    'titulo', f.titulo,
    'descricao', f.descricao,
    'perguntas', f.perguntas,
    'faixas', f.faixas,
    'nutricionista', coalesce(p.nome, '')
  )
  from formularios_preconsulta f
  left join profiles p on p.id = f.nutricionista_id
  where f.slug = lower(trim(coalesce(p_slug, '')))
    and f.ativo
    and f.deleted_at is null
  limit 1;
$$;
revoke all on function {schema}.preconsulta_formulario(text) from public;
grant execute on function {schema}.preconsulta_formulario(text) to anon, authenticated;

-- RPC pública 2: grava uma resposta. Valida (slug vivo/ativo → 'formulario_nao_encontrado'; nome 2–120 → 'nome_invalido'; e-mail
-- vazio ou com '@' e ≤ 160 → 'email_invalido'; telefone ≤ 30 → 'telefone_invalido'; respostas = objeto com ≥ 1 resposta válida
-- entre os ids das perguntas → 'sem_respostas'; rate limit: 30 respostas do MESMO formulário na última hora → 'muitas_respostas'),
-- calcula pontuação/faixa/nível iterando `perguntas` (escala = least(max, greatest(0, round(valor))); sim_nao = pontos_sim se
-- true; multipla = pontos da opção pelo índice; texto = 0; faixa = 1ª com min ≤ pontos ≤ max) e insere com o nutricionista_id
-- do formulário, copiando título/perguntas/faixas. Devolve {id, pontuacao, faixa, nivel}.
create or replace function {schema}.preconsulta_responder(p_slug text, p_nome text, p_email text, p_telefone text, p_respostas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  f record;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_pergunta jsonb;
  v_id text;
  v_tipo text;
  v_resp jsonb;
  v_texto text;
  v_max numeric;
  v_p numeric;
  v_idx integer;
  v_n_opcoes integer;
  v_n integer := 0;
  v_pontos numeric := 0;
  v_respostas jsonb := '{}'::jsonb;
  v_faixa jsonb;
  v_fmin numeric;
  v_fmax numeric;
  v_rotulo text := '';
  v_nivel text := '';
  v_qtd integer;
  v_novo_id uuid;
begin
  select * into f
    from formularios_preconsulta
   where slug = lower(trim(coalesce(p_slug, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'formulario_nao_encontrado';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if length(v_telefone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'sem_respostas';
  end if;

  -- pontuação por tipo (mesmas regras do app, questionariosUtil.pontuarPergunta); só respostas válidas contam e são gravadas
  for v_pergunta in select value from jsonb_array_elements(f.perguntas) loop
    if jsonb_typeof(v_pergunta) <> 'object' then
      continue;
    end if;
    v_id := v_pergunta ->> 'id';
    if v_id is null or v_id = '' or not (p_respostas ? v_id) then
      continue;
    end if;
    v_tipo := coalesce(v_pergunta ->> 'tipo', 'escala');
    v_resp := p_respostas -> v_id;
    if v_tipo = 'escala' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_max := case when (v_pergunta ->> 'max') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'max')::numeric else 4 end;
      v_p := least(v_max, greatest(0, round((v_resp #>> '{}')::numeric)));
      v_respostas := v_respostas || jsonb_build_object(v_id, v_p);
      v_pontos := v_pontos + v_p;
      v_n := v_n + 1;
    elsif v_tipo = 'sim_nao' then
      if jsonb_typeof(v_resp) <> 'boolean' then
        continue;
      end if;
      if (v_resp #>> '{}')::boolean then
        v_pontos := v_pontos + case when (v_pergunta ->> 'pontos_sim') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'pontos_sim')::numeric else 1 end;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, (v_resp #>> '{}')::boolean);
      v_n := v_n + 1;
    elsif v_tipo = 'multipla' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_n_opcoes := case when jsonb_typeof(v_pergunta -> 'opcoes') = 'array' then jsonb_array_length(v_pergunta -> 'opcoes') else 0 end;
      v_idx := floor((v_resp #>> '{}')::numeric)::integer;
      if v_idx < 0 or v_idx >= v_n_opcoes or (v_resp #>> '{}')::numeric <> v_idx then
        continue;
      end if;
      v_pontos := v_pontos + case when ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                  then greatest(0, ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos')::numeric) else 0 end;
      v_respostas := v_respostas || jsonb_build_object(v_id, v_idx);
      v_n := v_n + 1;
    else
      if jsonb_typeof(v_resp) <> 'string' then
        continue;
      end if;
      v_texto := trim(v_resp #>> '{}');
      if v_texto = '' then
        continue;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, left(v_texto, 500));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'sem_respostas';
  end if;

  -- rate limit simples por formulário: 30 respostas na última hora (conta também as da lixeira)
  select count(*) into v_qtd
    from respostas_preconsulta
   where formulario_id = f.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitas_respostas';
  end if;

  v_pontos := round(v_pontos, 2);
  for v_faixa in select value from jsonb_array_elements(f.faixas) loop
    if jsonb_typeof(v_faixa) <> 'object' then
      continue;
    end if;
    v_fmin := case when (v_faixa ->> 'min') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'min')::numeric end;
    v_fmax := case when (v_faixa ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'max')::numeric end;
    if v_fmin is null or v_fmax is null then
      continue;
    end if;
    if v_pontos >= least(v_fmin, v_fmax) and v_pontos <= greatest(v_fmin, v_fmax) then
      v_nivel := case when (v_faixa ->> 'nivel') in ('baixo', 'moderado', 'alto') then v_faixa ->> 'nivel' else 'baixo' end;
      v_rotulo := left(trim(coalesce(v_faixa ->> 'rotulo', '')), 60);
      if v_rotulo = '' then
        v_rotulo := initcap(v_nivel);
      end if;
      exit;
    end if;
  end loop;

  insert into respostas_preconsulta (nutricionista_id, formulario_id, titulo, perguntas, faixas, respostas, pontuacao, faixa, nivel, nome, email, telefone)
  values (f.nutricionista_id, f.id, f.titulo, f.perguntas, f.faixas, v_respostas, v_pontos, v_rotulo, v_nivel, v_nome, v_email, v_telefone)
  returning id into v_novo_id;

  return jsonb_build_object('id', v_novo_id, 'pontuacao', v_pontos, 'faixa', v_rotulo, 'nivel', v_nivel);
end;
$$;
revoke all on function {schema}.preconsulta_responder(text, text, text, text, jsonb) from public;
grant execute on function {schema}.preconsulta_responder(text, text, text, text, jsonb) to anon, authenticated;
