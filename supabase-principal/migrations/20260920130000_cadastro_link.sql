-- PhysiqNutri — W41 Cadastro de paciente por LINK público + fila "Paciente pendente" (Aprovar / Reprovar). Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920130000_cadastro_link.sql` (public + staging).
-- Depende da base (profiles, eh_master, set_updated_at) e de pacientes (W1). Padrão do link público da pré-consulta (W20):
-- RPCs security definer com search_path fixo no schema — o cliente anon não lê nem escreve nas tabelas. Sem bloco compartilhado.

-- 1) Código do link de cadastro da profissional: 1 link fixo por profissional → /c/<codigo>. Perfis existentes ganham código já;
--    perfis novos (trigger em auth.users) recebem pelo default.
alter table {schema}.profiles add column if not exists codigo_cadastro text;
update {schema}.profiles set codigo_cadastro = substr(md5(gen_random_uuid()::text), 1, 10) where codigo_cadastro is null;
alter table {schema}.profiles alter column codigo_cadastro set default substr(md5(gen_random_uuid()::text), 1, 10);
create unique index if not exists profiles_codigo_cadastro_uidx on {schema}.profiles (codigo_cadastro);

-- 2) Cadastros pendentes = o que o paciente preencheu pelo link. Mesmos campos do cadastro de paciente + observações.
--    SEM policy de INSERT: só a RPC cadastro_publico_enviar (security definer) grava. A profissional lê/edita/apaga os dela.
create table if not exists {schema}.cadastros_pendentes (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  apelido text,
  nascimento date,
  telefone text,                                   -- só dígitos
  cpf text,                                        -- só dígitos
  email text,
  genero text check (genero is null or genero in ('masculino', 'feminino', 'outro')),
  observacoes text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'reprovado')),
  paciente_id uuid references {schema}.pacientes(id) on delete set null,   -- preenchido no Aprovar
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cadastros_pendentes_nutri_status_idx on {schema}.cadastros_pendentes (nutricionista_id, status, created_at desc);
grant all on {schema}.cadastros_pendentes to anon, authenticated, service_role;
alter table {schema}.cadastros_pendentes enable row level security;

drop policy if exists "cadastros_pendentes: ler os proprios ou master" on {schema}.cadastros_pendentes;
create policy "cadastros_pendentes: ler os proprios ou master" on {schema}.cadastros_pendentes
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "cadastros_pendentes: editar os proprios ou master" on {schema}.cadastros_pendentes;
create policy "cadastros_pendentes: editar os proprios ou master" on {schema}.cadastros_pendentes
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "cadastros_pendentes: apagar os proprios ou master" on {schema}.cadastros_pendentes;
create policy "cadastros_pendentes: apagar os proprios ou master" on {schema}.cadastros_pendentes
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_cadastros_pendentes_updated_at on {schema}.cadastros_pendentes;
create trigger trg_cadastros_pendentes_updated_at before update on {schema}.cadastros_pendentes
  for each row execute function {schema}.set_updated_at();

-- 3) RPC pública 1: quem é a profissional do link (nome + código) ou NULL se o código não existe / perfil inativo.
create or replace function {schema}.cadastro_publico_info(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = {schema}, public
as $$
  select jsonb_build_object('nutricionista', coalesce(p.nome, ''), 'codigo', p.codigo_cadastro)
  from profiles p
  where p.codigo_cadastro = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
  limit 1;
$$;
revoke all on function {schema}.cadastro_publico_info(text) from public;
grant execute on function {schema}.cadastro_publico_info(text) to anon, authenticated;

-- 4) RPC pública 2: grava o cadastro pendente. Valida (código vivo → 'link_nao_encontrado'; nome 2–120 → 'nome_invalido';
--    telefone só dígitos 10/11 → 'telefone_invalido'; CPF 11 dígitos → 'cpf_invalido'; e-mail com '@' ≤ 160 → 'email_invalido';
--    gênero masculino/feminino/outro → 'genero_invalido'; nascimento AAAA-MM-DD entre 1900 e hoje → 'nascimento_invalido';
--    rate limit 30 cadastros por profissional na última hora → 'muitos_cadastros'; mesmo CPF, e-mail ou telefone+nome já PENDENTE
--    → 'cadastro_repetido'). Devolve {id}.
create or replace function {schema}.cadastro_publico_enviar(
  p_codigo text, p_nome text, p_apelido text, p_nascimento text, p_telefone text, p_cpf text, p_email text, p_genero text, p_observacoes text
)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_nutri uuid;
  v_nome text := left(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 120);
  v_apelido text := nullif(left(trim(coalesce(p_apelido, '')), 60), '');
  v_nascimento date;
  v_telefone text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_genero text := nullif(lower(trim(coalesce(p_genero, ''))), '');
  v_obs text := nullif(left(trim(coalesce(p_observacoes, '')), 2000), '');
  v_qtd integer;
  v_novo_id uuid;
begin
  select p.id into v_nutri
    from profiles p
   where p.codigo_cadastro = lower(trim(coalesce(p_codigo, '')))
     and p.ativo
   limit 1;
  if v_nutri is null then
    raise exception 'link_nao_encontrado';
  end if;
  if length(v_nome) < 2 then
    raise exception 'nome_invalido';
  end if;
  if v_telefone is not null and length(v_telefone) not in (10, 11) then
    raise exception 'telefone_invalido';
  end if;
  if v_cpf is not null and length(v_cpf) <> 11 then
    raise exception 'cpf_invalido';
  end if;
  if v_email is not null and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then
    raise exception 'genero_invalido';
  end if;
  if nullif(trim(coalesce(p_nascimento, '')), '') is not null then
    begin
      v_nascimento := trim(p_nascimento)::date;
    exception when others then
      raise exception 'nascimento_invalido';
    end;
    if v_nascimento > current_date or v_nascimento < date '1900-01-01' then
      raise exception 'nascimento_invalido';
    end if;
  end if;
  select count(*) into v_qtd
    from cadastros_pendentes
   where nutricionista_id = v_nutri
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitos_cadastros';
  end if;
  if exists (
    select 1 from cadastros_pendentes c
     where c.nutricionista_id = v_nutri
       and c.status = 'pendente'
       and ((v_cpf is not null and c.cpf = v_cpf)
         or (v_email is not null and c.email = v_email)
         or (v_telefone is not null and c.telefone = v_telefone and lower(c.nome) = lower(v_nome)))
  ) then
    raise exception 'cadastro_repetido';
  end if;
  insert into cadastros_pendentes (nutricionista_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_nutri, v_nome, v_apelido, v_nascimento, v_telefone, v_cpf, v_email, v_genero, v_obs)
  returning id into v_novo_id;
  return jsonb_build_object('id', v_novo_id);
end;
$$;
revoke all on function {schema}.cadastro_publico_enviar(text, text, text, text, text, text, text, text, text) from public;
grant execute on function {schema}.cadastro_publico_enviar(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- 5) RPC autenticada: APROVAR = criar o paciente igual ao cadastro de hoje (mesmas colunas; observações vão pro `resumo`) e marcar
--    o pendente como aprovado — uma transação. security INVOKER: vale a RLS da própria profissional (só enxerga/aprova os dela;
--    o insert em pacientes passa pela policy "criar os proprios ou master").
create or replace function {schema}.cadastro_pendente_aprovar(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = {schema}, public
as $$
declare
  c record;
  v_paciente uuid;
begin
  select * into c from cadastros_pendentes where id = p_id and status = 'pendente' limit 1;
  if not found then
    raise exception 'cadastro_nao_encontrado';
  end if;
  insert into pacientes (nutricionista_id, nome, apelido, nascimento, telefone, cpf, email, genero, resumo)
  values (c.nutricionista_id, c.nome, c.apelido, c.nascimento, c.telefone, c.cpf, c.email, c.genero,
          case when c.observacoes is null then null else 'Informado no cadastro pelo link: ' || c.observacoes end)
  returning id into v_paciente;
  update cadastros_pendentes set status = 'aprovado', paciente_id = v_paciente, decidido_em = now() where id = p_id;
  return v_paciente;
end;
$$;
revoke all on function {schema}.cadastro_pendente_aprovar(uuid) from public;
grant execute on function {schema}.cadastro_pendente_aprovar(uuid) to authenticated;
