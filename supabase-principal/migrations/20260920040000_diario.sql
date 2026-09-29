-- PhysiqNutri — W30 Diário alimentar. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920040000_diario.sql`
-- (roda em public E staging, trocando {schema}; o bloco final (depois do marcador que fica sozinho na linha) roda 1x).
-- Depende da base (eh_master, set_updated_at), de pacientes (W1: link_codigo, ativo, deleted_at) e do trigger genérico
-- tocar_paciente() (W5).

-- Registro do diário = FOTO da refeição que o PACIENTE envia pelo link público /d/<link_codigo> SEM login: o cliente anon sobe o
-- objeto no bucket PRIVADO `diario` (policy do Storage valida a pasta) e grava a linha pela RPC `diario_enviar`. NÃO existe policy
-- de INSERT nesta tabela — só a RPC grava (padrão `respostas_preconsulta` da W20). A nutricionista vê a foto por URL assinada,
-- reage (otimo/bom/atencao/evitar + comentário) e exclui (soft; o objeto é removido pelo app).
-- `path` = <nutricionista_id>/<paciente_id>/<uuid>.<ext>: a 1ª pasta é a dona e a 2ª o paciente.
create table if not exists {schema}.diario_alimentar (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,   -- copiada do paciente pela RPC
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data_hora timestamptz not null default now() check (data_hora <= now() + interval '5 minutes'),
  refeicao text not null check (refeicao in ('cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro')),
  path text not null unique,                          -- objeto no bucket `diario`
  mime text not null,
  tamanho bigint not null check (tamanho > 0),        -- bytes
  comentario text not null default '' check (char_length(comentario) <= 500),
  reacao_nutri text check (reacao_nutri is null or reacao_nutri in ('otimo', 'bom', 'atencao', 'evitar')),
  comentario_nutri text not null default '' check (char_length(comentario_nutri) <= 300),
  reagido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                              -- lixeira (W32)
);
create index if not exists diario_alimentar_nutri_data_idx on {schema}.diario_alimentar (nutricionista_id, data_hora desc);
create index if not exists diario_alimentar_paciente_data_idx on {schema}.diario_alimentar (paciente_id, data_hora desc);
-- 'Só não reagidas' (parcial: só as vivas sem reação)
create index if not exists diario_alimentar_nao_reagidas_idx on {schema}.diario_alimentar (nutricionista_id, data_hora desc)
  where deleted_at is null and reacao_nutri is null;
grant all on {schema}.diario_alimentar to anon, authenticated, service_role;
alter table {schema}.diario_alimentar enable row level security;

drop policy if exists "diario_alimentar: ler as proprias ou master" on {schema}.diario_alimentar;
create policy "diario_alimentar: ler as proprias ou master" on {schema}.diario_alimentar
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- SEM policy de INSERT: só a RPC `diario_enviar` (security definer) grava — nem a dona insere direto.
drop policy if exists "diario_alimentar: editar as proprias ou master" on {schema}.diario_alimentar;
create policy "diario_alimentar: editar as proprias ou master" on {schema}.diario_alimentar
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "diario_alimentar: apagar as proprias ou master" on {schema}.diario_alimentar;
create policy "diario_alimentar: apagar as proprias ou master" on {schema}.diario_alimentar
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_diario_alimentar_updated_at on {schema}.diario_alimentar;
create trigger trg_diario_alimentar_updated_at before update on {schema}.diario_alimentar
  for each row execute function {schema}.set_updated_at();

-- Registro novo/reação mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_diario_alimentar_toca_paciente on {schema}.diario_alimentar;
create trigger trg_diario_alimentar_toca_paciente after insert or update on {schema}.diario_alimentar
  for each row execute function {schema}.tocar_paciente();

-- RPC pública 1: quem é o paciente do link (id, nutricionista e o nome de tratamento — apelido ou 1º nome) se ele está VIVO e
-- ATIVO, ou NULL. security definer: o anon nunca lê `pacientes`; o search_path fixo garante que o `staging` lê o `staging`.
create or replace function {schema}.diario_paciente(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = {schema}, public
as $$
  select jsonb_build_object(
    'paciente_id', p.id,
    'nutricionista_id', p.nutricionista_id,
    'nome', coalesce(nullif(trim(p.apelido), ''), split_part(trim(p.nome), ' ', 1))
  )
  from pacientes p
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
  limit 1;
$$;
revoke all on function {schema}.diario_paciente(text) from public;
grant execute on function {schema}.diario_paciente(text) to anon, authenticated;

-- RPC pública 2: grava o registro DEPOIS do upload. Valida: código vivo/ativo ('codigo_invalido'), refeição ('refeicao_invalida'),
-- path = <nutricionista_id>/<paciente_id>/<uuid>.<ext> do PRÓPRIO paciente ('path_invalido'), objeto já no bucket `diario`
-- ('arquivo_nao_encontrado'), mime/tamanho ('arquivo_invalido'), data_hora ≤ agora + 5 min ('data_invalida') e rate limit de
-- 30 envios do MESMO paciente na última hora ('muitos_envios'). Insere copiando nutricionista_id do paciente e devolve {id, data_hora}.
-- Erros saem com errcode P0001 e a mensagem = código (o app traduz).
create or replace function {schema}.diario_enviar(p_codigo text, p_path text, p_mime text, p_tamanho bigint, p_refeicao text, p_comentario text, p_data_hora timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  pac record;
  v_path text := trim(coalesce(p_path, ''));
  v_data timestamptz := coalesce(p_data_hora, now());
  v_comentario text := left(trim(coalesce(p_comentario, '')), 500);
  v_mime text := lower(trim(coalesce(p_mime, '')));
  v_qtd integer;
  v_id uuid;
begin
  select id, nutricionista_id into pac
    from pacientes
   where link_codigo = lower(trim(coalesce(p_codigo, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'codigo_invalido';
  end if;
  if p_refeicao is null or p_refeicao not in ('cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro') then
    raise exception using errcode = 'P0001', message = 'refeicao_invalida';
  end if;
  if v_path !~ ('^' || pac.nutricionista_id::text || '/' || pac.id::text || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception using errcode = 'P0001', message = 'path_invalido';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'diario' and o.name = v_path) then
    raise exception using errcode = 'P0001', message = 'arquivo_nao_encontrado';
  end if;
  if v_mime = '' or v_mime not like 'image/%' or p_tamanho is null or p_tamanho <= 0 or p_tamanho > 10485760 then
    raise exception using errcode = 'P0001', message = 'arquivo_invalido';
  end if;
  if v_data > now() + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'data_invalida';
  end if;
  select count(*) into v_qtd
    from diario_alimentar
   where paciente_id = pac.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception using errcode = 'P0001', message = 'muitos_envios';
  end if;
  insert into diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario)
  values (pac.nutricionista_id, pac.id, v_data, p_refeicao, v_path, v_mime, p_tamanho, v_comentario)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'data_hora', v_data);
end;
$$;
revoke all on function {schema}.diario_enviar(text, text, text, bigint, text, text, timestamptz) from public;
grant execute on function {schema}.diario_enviar(text, text, text, bigint, text, text, timestamptz) to anon, authenticated;

-- RPC pública 3: os registros VIVOS dos últimos 7 dias do paciente (a partir da meia-noite de São Paulo de hoje − 6 dias), mais
-- recente primeiro, SEM path (a foto só a nutricionista vê). Código inválido → [].
create or replace function {schema}.diario_listar(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = {schema}, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'data_hora', d.data_hora,
      'refeicao', d.refeicao,
      'comentario', d.comentario,
      'reacao_nutri', d.reacao_nutri,
      'comentario_nutri', d.comentario_nutri,
      'reagido_em', d.reagido_em
    ) order by d.data_hora desc, d.created_at desc), '[]'::jsonb)
  from diario_alimentar d
  join pacientes p on p.id = d.paciente_id
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    and d.deleted_at is null
    and d.data_hora >= (((now() at time zone 'America/Sao_Paulo')::date - 6)::timestamp at time zone 'America/Sao_Paulo');
$$;
revoke all on function {schema}.diario_listar(text) from public;
grant execute on function {schema}.diario_listar(text) to anon, authenticated;

-- @@ compartilhado
-- (roda 1x) Bucket PRIVADO `diario`, único pros 2 schemas — o path começa com o id da nutricionista e o do paciente, então nada
-- colide e o smoke do staging limpa só o que criou. Limite 10 MB e só imagem (JPEG/PNG/WebP/HEIC/HEIF): o app valida antes pra dar
-- mensagem amigável; o bucket recusa no servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diario', 'diario', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A pasta é válida quando a 1ª parte é a nutricionista e a 2ª um paciente VIVO e ATIVO dela — em `public` OU em `staging` (o Storage
-- é único pros 2 schemas) — e o arquivo é <uuid>.<ext>. security definer: o anon não enxerga `pacientes`.
create or replace function public.diario_pasta_valida(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  partes text[] := storage.foldername(p_name);
  v_nutri uuid;
  v_pac uuid;
begin
  if p_name is null or array_length(partes, 1) is distinct from 2 then
    return false;
  end if;
  begin
    v_nutri := partes[1]::uuid;
    v_pac := partes[2]::uuid;
  exception when others then
    return false;
  end;
  if storage.filename(p_name) !~ '^[0-9a-f-]{36}\.[a-z0-9]{2,5}$' then
    return false;
  end if;
  return exists (select 1 from public.pacientes p where p.id = v_pac and p.nutricionista_id = v_nutri and p.ativo and p.deleted_at is null)
      or exists (select 1 from staging.pacientes p where p.id = v_pac and p.nutricionista_id = v_nutri and p.ativo and p.deleted_at is null);
end;
$$;
revoke all on function public.diario_pasta_valida(text) from public;
grant execute on function public.diario_pasta_valida(text) to anon, authenticated, service_role;

-- Policies do Storage (uma só, o bucket é compartilhado). Nomes próprios ('diario: …') pra não colidir com 'anexos: ' (W14) e
-- 'evolucao: ' (W22) na mesma tabela `storage.objects`. O paciente (anon) só SOBE, e só na pasta válida; ler/apagar é da dona
-- (1ª pasta = auth.uid()) ou do master.
drop policy if exists "diario: subir na pasta de um paciente valido" on storage.objects;
create policy "diario: subir na pasta de um paciente valido" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'diario' and public.diario_pasta_valida(name));
drop policy if exists "diario: ler as proprias ou master" on storage.objects;
create policy "diario: ler as proprias ou master" on storage.objects
  for select to authenticated
  using (bucket_id = 'diario' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
drop policy if exists "diario: apagar as proprias ou master" on storage.objects;
create policy "diario: apagar as proprias ou master" on storage.objects
  for delete to authenticated
  using (bucket_id = 'diario' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_master()));
