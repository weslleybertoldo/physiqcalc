-- Physiq W-A (Acessos do aluno) — P1, migration 3 de 3: a DIETA LIVRE (o dia do aluno com a Dieta "Pode mexer") e a LGPD das tabelas
-- novas. Banco principal, staging + public. Idempotente. Depende da wa1 (aluno_dieta_liberada, wa_rota) e da wa2 (rotinas).
-- Spec: docs/superpowers/specs/2026-10-12-w-a-acessos-do-aluno-design.md §2.2 (padrões 10, 11, 12, 17), §5.1 (wa3 e LGPD), §5.5.
-- SÓ ACRESCENTA — e troca 3 funções de LGPD a partir do corpo VIVO de cada schema (12/10/2026, conferido por md5):
--   · aluno_alimentos, aluno_receitas + aluno_receita_itens (só do aluno — P6), aluno_dia_refeicoes (as refeições extras) e
--     aluno_dia_itens (o que ele põe e tira no DIA — P5; o plano da nutri não muda). Tudo o que aponta para tabela da nutri
--     (refeicoes, itens_refeicao, alimentos) é ON DELETE SET NULL com o RETRATO na linha (nome + macros): a nutri apaga de verdade
--     (refeicao_excluir, item_excluir, o copiar semana, a lixeira) e nada dela trava (C2 da revisão). RLS: SELECT do dono; sem
--     policy de escrita;
--   · RPCs do aluno (a função `aluno-dia` da P2 chama como a pessoa): meu_dia, dia_adicionar, dia_tirar, dia_desfazer,
--     dia_extra_salvar, dia_extra_excluir, dia_extra_marcar, meus_alimentos, meu_alimento_salvar, meu_alimento_excluir,
--     minha_receita_salvar, minha_receita_excluir, buscar_alimentos_do_aluno; do profissional: dia_do_aluno;
--   · internas: wa_uuid, wa_numero, wa_texto, wa_matriculas_dieta, wa_plano_ativo, wa_refeicao_do_dia, wa_alimento_visivel,
--     wa_macros_da_receita, wa_dieta_liberada_alguma, wa_dia_item_json, wa_dados_do_aluno (a LGPD: contar e apagar);
--   · LGPD (C1 da revisão): exportar_dados_aluno ({schema}, o corpo vivo da hml12 — com 'aceites' — + as 8 tabelas e os acessos),
--     excluir_dados_aluno e excluir_conta_profissional (o corpo vivo de CADA schema, com os nomes explícitos: no staging os da hml02b,
--     com o bucket diario-staging; no public os da w07/w2l) contam ('rotinas_e_dieta') e apagam na MESMA transação.
-- O dia é de São Paulo; o aluno grava hoje ou ontem. A refeição do plano diz a matrícula do dia; a refeição extra vai para a matrícula
-- do plano ativo do app (o favorito mais novo; sem favorito, o mais novo) — o servidor decide, nunca o corpo. Liberada = a linha
-- "mexer" E nutricionista de verdade (aluno_dieta_liberada). Limites: 100 itens e 10 extras por dia; 300 alimentos e 100 receitas
-- (30 itens cada). Nenhum nome de alimento em raise.
-- Aplicar — STAGING: --so staging (tudo do staging, inclusive as 2 exclusões do staging com o nome explícito; NÃO usar
-- --compartilhado no staging). PRODUÇÃO (backup antes): --so public (tabelas, RPCs, a exportar) e DEPOIS --compartilhado (as 2
-- exclusões do public); nessa ordem — as exclusões novas chamam o que o --so public cria. Dry-run antes de cada um.
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012220000_wa3_dieta_livre.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012220000_wa3_dieta_livre.sql --so public [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261012220000_wa3_dieta_livre.sql --compartilhado [--dry-run]
-- Testes: python3 e2e/wa/sql_wa.py --grupo dieta,lgpd · Reversa: supabase-principal/reversas/20261012220000_wa3_dieta_livre_reversa.sql

-- ============================================================================================================
-- 1. As tabelas
-- ============================================================================================================
create table if not exists {schema}.aluno_alimentos (
  id uuid primary key default gen_random_uuid(),
  dono_user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  porcao_g numeric(7,2) not null default 100,
  energia_kcal numeric(9,2) not null default 0,
  proteina_g numeric(9,2) not null default 0,
  carboidrato_g numeric(9,2) not null default 0,
  lipidio_g numeric(9,2) not null default 0,
  fibra_g numeric(9,2) not null default 0,
  criado_em timestamptz not null default now(),
  alterado_em timestamptz not null default now(),
  deleted_at timestamptz,
  constraint aluno_alimentos_nome_chk check (char_length(btrim(nome)) between 1 and 80 and char_length(nome) <= 80),
  constraint aluno_alimentos_porcao_chk check (porcao_g > 0 and porcao_g < 10000),
  constraint aluno_alimentos_valores_chk check (energia_kcal between 0 and 1000 and proteina_g between 0 and 100
    and carboidrato_g between 0 and 100 and lipidio_g between 0 and 100 and fibra_g between 0 and 100)
);
alter table {schema}.aluno_alimentos add column if not exists busca text generated always as ({schema}.texto_busca(nome)) stored;
create index if not exists aluno_alimentos_dono_idx on {schema}.aluno_alimentos (dono_user_id) where deleted_at is null;

create table if not exists {schema}.aluno_receitas (
  id uuid primary key default gen_random_uuid(),
  dono_user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  porcoes integer not null default 1,
  criado_em timestamptz not null default now(),
  alterado_em timestamptz not null default now(),
  deleted_at timestamptz,
  constraint aluno_receitas_nome_chk check (char_length(btrim(nome)) between 1 and 80 and char_length(nome) <= 80),
  constraint aluno_receitas_porcoes_chk check (porcoes between 1 and 100)
);
create index if not exists aluno_receitas_dono_idx on {schema}.aluno_receitas (dono_user_id) where deleted_at is null;

create table if not exists {schema}.aluno_receita_itens (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references {schema}.aluno_receitas(id) on delete cascade,
  alimento_id uuid references {schema}.alimentos(id) on delete set null,
  aluno_alimento_id uuid references {schema}.aluno_alimentos(id) on delete set null,
  nome text not null,
  energia_kcal numeric(9,2) not null default 0,
  proteina_g numeric(9,2) not null default 0,
  carboidrato_g numeric(9,2) not null default 0,
  lipidio_g numeric(9,2) not null default 0,
  fibra_g numeric(9,2) not null default 0,
  quantidade_g numeric(8,2) not null,
  ordem integer not null default 0,
  constraint aluno_receita_itens_origem_chk check (num_nonnulls(alimento_id, aluno_alimento_id) <= 1),
  constraint aluno_receita_itens_nome_chk check (char_length(nome) between 1 and 120),
  constraint aluno_receita_itens_qtd_chk check (quantidade_g > 0 and quantidade_g < 10000 and ordem >= 0)
);
create index if not exists aluno_receita_itens_receita_idx on {schema}.aluno_receita_itens (receita_id, ordem);

create table if not exists {schema}.aluno_dia_refeicoes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  dono_user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  nome text not null,
  horario time,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  alterado_em timestamptz not null default now(),
  deleted_at timestamptz,
  constraint aluno_dia_refeicoes_nome_chk check (char_length(btrim(nome)) between 1 and 40 and char_length(nome) <= 40)
);
create index if not exists aluno_dia_refeicoes_dono_dia_idx on {schema}.aluno_dia_refeicoes (dono_user_id, dia) where deleted_at is null;
create index if not exists aluno_dia_refeicoes_paciente_dia_idx on {schema}.aluno_dia_refeicoes (paciente_id, dia);

create table if not exists {schema}.aluno_dia_itens (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  dono_user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  tipo text not null,
  refeicao_id uuid references {schema}.refeicoes(id) on delete set null,
  extra_id uuid references {schema}.aluno_dia_refeicoes(id) on delete cascade,
  item_refeicao_id uuid references {schema}.itens_refeicao(id) on delete set null,
  alimento_id uuid references {schema}.alimentos(id) on delete set null,
  aluno_alimento_id uuid references {schema}.aluno_alimentos(id) on delete set null,
  aluno_receita_id uuid references {schema}.aluno_receitas(id) on delete set null,
  quantidade_g numeric(8,2),
  porcoes numeric(6,2),
  refeicao_nome text not null,
  nome text not null,
  energia_kcal numeric(10,2) not null default 0,
  proteina_g numeric(10,2) not null default 0,
  carboidrato_g numeric(10,2) not null default 0,
  lipidio_g numeric(10,2) not null default 0,
  fibra_g numeric(10,2) not null default 0,
  criado_em timestamptz not null default now(),
  deleted_at timestamptz,
  constraint aluno_dia_itens_tipo_chk check (tipo in ('adicionado', 'tirado')),
  constraint aluno_dia_itens_lugar_chk check (num_nonnulls(refeicao_id, extra_id) <= 1),
  constraint aluno_dia_itens_origem_chk check (num_nonnulls(alimento_id, aluno_alimento_id, aluno_receita_id) <= 1),
  constraint aluno_dia_itens_formato_chk check (
       (tipo = 'tirado' and extra_id is null and alimento_id is null and aluno_alimento_id is null and aluno_receita_id is null
        and porcoes is null)
    or (tipo = 'adicionado' and item_refeicao_id is null)),
  constraint aluno_dia_itens_qtd_chk check (num_nonnulls(quantidade_g, porcoes) <= 1
    and (quantidade_g is null or (quantidade_g > 0 and quantidade_g < 10000)) and (porcoes is null or (porcoes > 0 and porcoes <= 20))),
  constraint aluno_dia_itens_nomes_chk check (char_length(refeicao_nome) between 1 and 80 and char_length(nome) between 1 and 120)
);
create index if not exists aluno_dia_itens_dono_dia_idx on {schema}.aluno_dia_itens (dono_user_id, dia) where deleted_at is null;
create index if not exists aluno_dia_itens_paciente_dia_idx on {schema}.aluno_dia_itens (paciente_id, dia);
create unique index if not exists aluno_dia_itens_tirado_uq on {schema}.aluno_dia_itens (item_refeicao_id, dia)
  where tipo = 'tirado' and deleted_at is null and item_refeicao_id is not null;
-- os índices das FKs para as tabelas da nutri: o SET NULL de um delete da nutri não varre a tabela inteira
create index if not exists aluno_dia_itens_refeicao_idx on {schema}.aluno_dia_itens (refeicao_id) where refeicao_id is not null;
create index if not exists aluno_dia_itens_item_idx on {schema}.aluno_dia_itens (item_refeicao_id) where item_refeicao_id is not null;
create index if not exists aluno_dia_itens_alimento_idx on {schema}.aluno_dia_itens (alimento_id) where alimento_id is not null;
create index if not exists aluno_receita_itens_alimento_idx on {schema}.aluno_receita_itens (alimento_id) where alimento_id is not null;
comment on table {schema}.aluno_dia_itens is
  'W-A: o que o aluno pôs/tirou no DIA (o plano da nutri não muda), com o retrato. FKs da nutri ON DELETE SET NULL. Só as RPCs gravam.';

do $wa$
declare
  v_t text;
begin
  foreach v_t in array array['aluno_alimentos', 'aluno_receitas', 'aluno_receita_itens', 'aluno_dia_refeicoes', 'aluno_dia_itens'] loop
    execute format('alter table {schema}.%I enable row level security', v_t);
    execute format('revoke all on table {schema}.%I from public, anon', v_t);
    execute format('revoke insert, update, delete, truncate, references, trigger on table {schema}.%I from authenticated', v_t);
    execute format('grant select on table {schema}.%I to authenticated', v_t);
    execute format('grant select, insert, update, delete on table {schema}.%I to service_role', v_t);
  end loop;
end
$wa$;

drop policy if exists "aluno_alimentos: ler os proprios" on {schema}.aluno_alimentos;
create policy "aluno_alimentos: ler os proprios" on {schema}.aluno_alimentos for select to authenticated
  using (dono_user_id = (select auth.uid()));
drop policy if exists "aluno_receitas: ler as proprias" on {schema}.aluno_receitas;
create policy "aluno_receitas: ler as proprias" on {schema}.aluno_receitas for select to authenticated
  using (dono_user_id = (select auth.uid()));
drop policy if exists "aluno_receita_itens: ler os das proprias" on {schema}.aluno_receita_itens;
create policy "aluno_receita_itens: ler os das proprias" on {schema}.aluno_receita_itens for select to authenticated
  using (exists (select 1 from {schema}.aluno_receitas r where r.id = receita_id and r.dono_user_id = (select auth.uid())));
drop policy if exists "aluno_dia_refeicoes: ler as proprias" on {schema}.aluno_dia_refeicoes;
create policy "aluno_dia_refeicoes: ler as proprias" on {schema}.aluno_dia_refeicoes for select to authenticated
  using (dono_user_id = (select auth.uid()));
drop policy if exists "aluno_dia_itens: ler os proprios" on {schema}.aluno_dia_itens;
create policy "aluno_dia_itens: ler os proprios" on {schema}.aluno_dia_itens for select to authenticated
  using (dono_user_id = (select auth.uid()));

-- ============================================================================================================
-- 2. As internas (a forma de cada campo e as regras de "o que é dele")
-- ============================================================================================================
create or replace function {schema}.wa_uuid(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then p::uuid end;
$$;

-- número JSON no intervalo (senão null)
create or replace function {schema}.wa_numero(p jsonb, p_min numeric, p_max numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number' then
    case when (p #>> '{}')::numeric between p_min and p_max then (p #>> '{}')::numeric end end;
$$;

-- texto JSON aparado (espaços seguidos viram 1) com o tamanho no intervalo (senão null)
create or replace function {schema}.wa_texto(p jsonb, p_min integer, p_max integer) returns text
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'string' then
    case when char_length(regexp_replace(btrim(p #>> '{}'), '\s+', ' ', 'g')) between p_min and p_max
         then regexp_replace(btrim(p #>> '{}'), '\s+', ' ', 'g') end end;
$$;

-- as matrículas com Nutrição do login (a MESMA regra da minha_dieta: nutricionista responsável numa conta com Nutrição ou o site
-- antigo; login desativado = nenhuma), na ordem de criação
create or replace function {schema}.wa_matriculas_dieta(p_uid uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id order by p.created_at), array[]::uuid[])
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    join auth.users u on u.id = p.user_id
   where p.user_id = p_uid and p.deleted_at is null and p.nutricionista_id is not null
     and (p.conta_id is null or 'nutricao' = any({schema}.modulos_do_plano(c.plano)))
     and (u.banned_until is null or u.banned_until <= now());
$$;

-- o plano ativo do app (src/nutricao/app/dia.ts › planoAtivo): o favorito mais novo; sem favorito, o mais novo
create or replace function {schema}.wa_plano_ativo(p_uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pl.id from {schema}.planos_alimentares pl
   where pl.paciente_id = any({schema}.wa_matriculas_dieta(p_uid)) and pl.deleted_at is null
   order by pl.favorito desc, pl.created_at desc, pl.id
   limit 1;
$$;

-- a refeição de um plano VIVO do aluno que vale no dia (sem dias marcados = todos): { paciente_id, nome } ou null
create or replace function {schema}.wa_refeicao_do_dia(p_uid uuid, p_refeicao uuid, p_dia date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('paciente_id', pl.paciente_id, 'nome', r.nome)
    from {schema}.refeicoes r join {schema}.planos_alimentares pl on pl.id = r.plano_id
   where r.id = p_refeicao and pl.deleted_at is null and pl.paciente_id = any({schema}.wa_matriculas_dieta(p_uid))
     and (cardinality(r.dias_semana) = 0 or extract(isodow from p_dia)::smallint = any(r.dias_semana));
$$;

-- o alimento da base que o aluno enxerga (P6 ao contrário: a base própria da nutri é dela): a TACO viva e os dos planos vivos dele
create or replace function {schema}.wa_alimento_visivel(p_uid uuid, p_alimento uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from {schema}.alimentos a
     where a.id = p_alimento and (
           (a.fonte = 'taco' and a.deleted_at is null)
        or exists (select 1 from {schema}.itens_refeicao i
                     join {schema}.refeicoes r on r.id = i.refeicao_id
                     join {schema}.planos_alimentares pl on pl.id = r.plano_id
                    where i.alimento_id = a.id and pl.deleted_at is null
                      and pl.paciente_id = any({schema}.wa_matriculas_dieta(p_uid)))));
$$;

-- os macros de UMA porção da receita (pelo retrato dos itens: não muda se o alimento sumir)
create or replace function {schema}.wa_macros_da_receita(p_receita uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'energia_kcal', round(coalesce(sum(i.energia_kcal * i.quantidade_g / 100), 0) / rc.porcoes, 2),
    'proteina_g', round(coalesce(sum(i.proteina_g * i.quantidade_g / 100), 0) / rc.porcoes, 2),
    'carboidrato_g', round(coalesce(sum(i.carboidrato_g * i.quantidade_g / 100), 0) / rc.porcoes, 2),
    'lipidio_g', round(coalesce(sum(i.lipidio_g * i.quantidade_g / 100), 0) / rc.porcoes, 2),
    'fibra_g', round(coalesce(sum(i.fibra_g * i.quantidade_g / 100), 0) / rc.porcoes, 2))
    from {schema}.aluno_receitas rc left join {schema}.aluno_receita_itens i on i.receita_id = rc.id
   where rc.id = p_receita
   group by rc.porcoes;
$$;

-- alguma matrícula dele com a Dieta liberada? (os alimentos e as receitas são do LOGIN, não de uma matrícula)
create or replace function {schema}.wa_dieta_liberada_alguma(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from unnest({schema}.wa_matriculas_dieta(p_uid)) m where {schema}.aluno_dieta_liberada(m));
$$;

create or replace function {schema}.wa_dia_item_json(i {schema}.aluno_dia_itens) returns jsonb
language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object('id', i.id, 'paciente_id', i.paciente_id, 'dia', i.dia, 'tipo', i.tipo, 'refeicao_id', i.refeicao_id,
    'extra_id', i.extra_id, 'item_refeicao_id', i.item_refeicao_id, 'alimento_id', i.alimento_id,
    'aluno_alimento_id', i.aluno_alimento_id, 'aluno_receita_id', i.aluno_receita_id, 'quantidade_g', i.quantidade_g,
    'porcoes', i.porcoes, 'refeicao_nome', i.refeicao_nome, 'nome', i.nome, 'energia_kcal', i.energia_kcal,
    'proteina_g', i.proteina_g, 'carboidrato_g', i.carboidrato_g, 'lipidio_g', i.lipidio_g, 'fibra_g', i.fibra_g,
    'criado_em', i.criado_em);
$$;

-- a LGPD das tabelas novas DO ALUNO (dono = o login): conta e, com p_apagar, apaga — na mesma transação de quem chama (as exclusões
-- não esperam o cascade do login: a do aluno apaga o login por último, a do profissional faz soft delete). Os acessos da matrícula
-- (aluno_acessos/_log) são do profissional e ficam com a matrícula.
create or replace function {schema}.wa_dados_do_aluno(p_uid uuid, p_apagar boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_uid is null then
    return 0;
  end if;
  select (select count(*) from {schema}.rotinas r where r.dono_user_id = p_uid)
       + (select count(*) from {schema}.aluno_alimentos a where a.dono_user_id = p_uid)
       + (select count(*) from {schema}.aluno_receitas rc where rc.dono_user_id = p_uid)
       + (select count(*) from {schema}.aluno_dia_refeicoes e where e.dono_user_id = p_uid)
       + (select count(*) from {schema}.aluno_dia_itens i where i.dono_user_id = p_uid)
    into v_n;
  if coalesce(p_apagar, false) then
    delete from {schema}.aluno_dia_itens where dono_user_id = p_uid;
    delete from {schema}.aluno_dia_refeicoes where dono_user_id = p_uid;
    delete from {schema}.aluno_receitas where dono_user_id = p_uid;   -- os itens caem por cascade
    delete from {schema}.aluno_alimentos where dono_user_id = p_uid;
    delete from {schema}.rotinas where dono_user_id = p_uid;          -- as feitas e o histórico caem por cascade
  end if;
  return v_n;
end;
$$;

revoke all on function {schema}.wa_uuid(text), {schema}.wa_numero(jsonb, numeric, numeric), {schema}.wa_texto(jsonb, integer, integer),
  {schema}.wa_matriculas_dieta(uuid), {schema}.wa_plano_ativo(uuid), {schema}.wa_refeicao_do_dia(uuid, uuid, date),
  {schema}.wa_alimento_visivel(uuid, uuid), {schema}.wa_macros_da_receita(uuid), {schema}.wa_dieta_liberada_alguma(uuid),
  {schema}.wa_dia_item_json({schema}.aluno_dia_itens), {schema}.wa_dados_do_aluno(uuid, boolean) from public, anon, authenticated;
grant execute on function {schema}.wa_uuid(text), {schema}.wa_numero(jsonb, numeric, numeric), {schema}.wa_texto(jsonb, integer, integer),
  {schema}.wa_matriculas_dieta(uuid), {schema}.wa_plano_ativo(uuid), {schema}.wa_refeicao_do_dia(uuid, uuid, date),
  {schema}.wa_alimento_visivel(uuid, uuid), {schema}.wa_macros_da_receita(uuid), {schema}.wa_dieta_liberada_alguma(uuid),
  {schema}.wa_dia_item_json({schema}.aluno_dia_itens), {schema}.wa_dados_do_aluno(uuid, boolean) to service_role;

-- ============================================================================================================
-- 3. As RPCs do ALUNO — o dia (dono e matrícula saem do token e do banco; nunca do corpo)
-- ============================================================================================================
-- lê o dia mesmo travada: { ok, dia, hoje, pode_gravar, matriculas: [{ paciente_id, liberada }], plano_ativo: { plano_id,
-- paciente_id } | null, extras, itens } · sem_login · dados_invalidos
create or replace function {schema}.meu_dia(p_dia date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ids uuid[];
  v_plano uuid;
  v_pac uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_dia is null then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  v_ids := {schema}.wa_matriculas_dieta(v_uid);
  v_plano := {schema}.wa_plano_ativo(v_uid);
  select pl.paciente_id into v_pac from {schema}.planos_alimentares pl where pl.id = v_plano;
  return jsonb_build_object('ok', true, 'dia', p_dia, 'hoje', v_hoje, 'pode_gravar', p_dia in (v_hoje, v_hoje - 1),
    'matriculas', coalesce((select jsonb_agg(jsonb_build_object('paciente_id', m.id, 'liberada', {schema}.aluno_dieta_liberada(m.id))
                                             order by m.n)
                              from unnest(v_ids) with ordinality as m(id, n)), '[]'::jsonb),
    'plano_ativo', case when v_plano is null then null else jsonb_build_object('plano_id', v_plano, 'paciente_id', v_pac) end,
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'paciente_id', e.paciente_id, 'nome', e.nome,
                                                            'horario', to_char(e.horario, 'HH24:MI'), 'concluida_em', e.concluida_em)
                                         order by e.horario nulls last, e.criado_em)
                          from {schema}.aluno_dia_refeicoes e
                         where e.dono_user_id = v_uid and e.dia = p_dia and e.deleted_at is null), '[]'::jsonb),
    'itens', coalesce((select jsonb_agg({schema}.wa_dia_item_json(i) order by i.criado_em)
                         from {schema}.aluno_dia_itens i
                        where i.dono_user_id = v_uid and i.dia = p_dia and i.deleted_at is null), '[]'::jsonb));
end;
$$;

-- põe um alimento (da TACO ou dos planos dele, em gramas), um alimento dele (gramas) ou uma receita dele (porções) numa refeição do
-- plano do dia ou numa extra dele. p_dados: { refeicao_id | extra_id, alimento_id | aluno_alimento_id | aluno_receita_id,
-- quantidade_g | porcoes }. { ok, item } · sem_login · dados_invalidos · nao_encontrado · dieta_travada · limite (100 no dia)
create or replace function {schema}.dia_adicionar(p_dia date, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  d jsonb := p_dados;
  v_ruim constant jsonb := jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  v_lugar jsonb;
  v_ref uuid;
  v_extra uuid;
  v_pac uuid;
  v_ref_nome text;
  v_alim uuid;
  v_aalim uuid;
  v_rec uuid;
  v_qtd numeric;
  v_por numeric;
  v_nome text;
  v_mac jsonb;
  v_fator numeric;
  v_novo {schema}.aluno_dia_itens%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_dia is null or p_dia not in (v_hoje, v_hoje - 1) or d is null or jsonb_typeof(d) <> 'object' then return v_ruim; end if;
  -- onde: exatamente uma refeição do plano do dia OU uma extra dele (do mesmo dia)
  if (d ? 'refeicao_id') = (d ? 'extra_id') then return v_ruim; end if;
  if d ? 'refeicao_id' then
    v_ref := {schema}.wa_uuid(d ->> 'refeicao_id');
    if v_ref is null then return v_ruim; end if;
    v_lugar := {schema}.wa_refeicao_do_dia(v_uid, v_ref, p_dia);
    if v_lugar is null then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
    v_pac := (v_lugar ->> 'paciente_id')::uuid;
    v_ref_nome := v_lugar ->> 'nome';
  else
    v_extra := {schema}.wa_uuid(d ->> 'extra_id');
    if v_extra is null then return v_ruim; end if;
    select e.paciente_id, e.nome into v_pac, v_ref_nome from {schema}.aluno_dia_refeicoes e
     where e.id = v_extra and e.dono_user_id = v_uid and e.dia = p_dia and e.deleted_at is null;
    if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  end if;
  if not {schema}.aluno_dieta_liberada(v_pac) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  -- o quê: exatamente uma origem; a receita em porções, o resto em gramas
  if ((d ? 'alimento_id')::int + (d ? 'aluno_alimento_id')::int + (d ? 'aluno_receita_id')::int) <> 1 then return v_ruim; end if;
  if d ? 'aluno_receita_id' then
    v_rec := {schema}.wa_uuid(d ->> 'aluno_receita_id');
    v_por := {schema}.wa_numero(d -> 'porcoes', 0.01, 20);
    if v_rec is null or v_por is null or d ? 'quantidade_g' then return v_ruim; end if;
    select rc.nome into v_nome from {schema}.aluno_receitas rc where rc.id = v_rec and rc.dono_user_id = v_uid and rc.deleted_at is null;
    if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
    v_mac := {schema}.wa_macros_da_receita(v_rec);
    v_fator := v_por;
  else
    v_qtd := {schema}.wa_numero(d -> 'quantidade_g', 0.01, 9999.99);
    if v_qtd is null or d ? 'porcoes' then return v_ruim; end if;
    if d ? 'alimento_id' then
      v_alim := {schema}.wa_uuid(d ->> 'alimento_id');
      if v_alim is null then return v_ruim; end if;
      if not {schema}.wa_alimento_visivel(v_uid, v_alim) then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
      select a.nome, jsonb_build_object('energia_kcal', coalesce(a.energia_kcal, 0), 'proteina_g', coalesce(a.proteina_g, 0),
                                        'carboidrato_g', coalesce(a.carboidrato_g, 0), 'lipidio_g', coalesce(a.lipidio_g, 0),
                                        'fibra_g', coalesce(a.fibra_g, 0))
        into v_nome, v_mac from {schema}.alimentos a where a.id = v_alim;
    else
      v_aalim := {schema}.wa_uuid(d ->> 'aluno_alimento_id');
      if v_aalim is null then return v_ruim; end if;
      select a.nome, jsonb_build_object('energia_kcal', a.energia_kcal, 'proteina_g', a.proteina_g, 'carboidrato_g', a.carboidrato_g,
                                        'lipidio_g', a.lipidio_g, 'fibra_g', a.fibra_g)
        into v_nome, v_mac from {schema}.aluno_alimentos a where a.id = v_aalim and a.dono_user_id = v_uid and a.deleted_at is null;
      if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
    end if;
    v_fator := v_qtd / 100;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_dia:' || v_uid::text || ':' || p_dia::text));
  if (select count(*) from {schema}.aluno_dia_itens i where i.dono_user_id = v_uid and i.dia = p_dia and i.deleted_at is null) >= 100 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  insert into {schema}.aluno_dia_itens (paciente_id, dono_user_id, dia, tipo, refeicao_id, extra_id, alimento_id, aluno_alimento_id,
    aluno_receita_id, quantidade_g, porcoes, refeicao_nome, nome, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g)
  values (v_pac, v_uid, p_dia, 'adicionado', v_ref, v_extra, v_alim, v_aalim, v_rec, v_qtd, v_por, left(v_ref_nome, 80), left(v_nome, 120),
    round((v_mac ->> 'energia_kcal')::numeric * v_fator, 2), round((v_mac ->> 'proteina_g')::numeric * v_fator, 2),
    round((v_mac ->> 'carboidrato_g')::numeric * v_fator, 2), round((v_mac ->> 'lipidio_g')::numeric * v_fator, 2),
    round((v_mac ->> 'fibra_g')::numeric * v_fator, 2))
  returning * into v_novo;
  return jsonb_build_object('ok', true, 'item', {schema}.wa_dia_item_json(v_novo));
end;
$$;

-- tira um item do plano SÓ naquele dia (o plano não muda), com o retrato. Idempotente: já tirado no dia → o mesmo.
-- { ok, item } · sem_login · dados_invalidos · nao_encontrado · dieta_travada · limite
create or replace function {schema}.dia_tirar(p_dia date, p_item uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_i record;
  v_lugar jsonb;
  v_pac uuid;
  v_gramas numeric;
  v_a record;
  v_novo {schema}.aluno_dia_itens%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_dia is null or p_item is null or p_dia not in (v_hoje, v_hoje - 1) then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  select i.id, i.refeicao_id, i.alimento_id, i.quantidade_g, i.medida_caseira_id, i.quantidade_medida into v_i
    from {schema}.itens_refeicao i where i.id = p_item;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  v_lugar := {schema}.wa_refeicao_do_dia(v_uid, v_i.refeicao_id, p_dia);
  if v_lugar is null then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  v_pac := (v_lugar ->> 'paciente_id')::uuid;
  if not {schema}.aluno_dieta_liberada(v_pac) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_dia:' || v_uid::text || ':' || p_dia::text));
  select * into v_novo from {schema}.aluno_dia_itens x
   where x.tipo = 'tirado' and x.item_refeicao_id = p_item and x.dia = p_dia and x.deleted_at is null;
  if found then return jsonb_build_object('ok', true, 'item', {schema}.wa_dia_item_json(v_novo)); end if;
  if (select count(*) from {schema}.aluno_dia_itens x where x.dono_user_id = v_uid and x.dia = p_dia and x.deleted_at is null) >= 100 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  -- os gramas do item (dietaUtil.gramasDoItem: pela medida caseira quando houver; senão quantidade_g)
  v_gramas := coalesce((select round(v_i.quantidade_medida * m.gramas, 2) from {schema}.medidas_caseiras m
                         where m.id = v_i.medida_caseira_id and m.alimento_id = v_i.alimento_id and v_i.quantidade_medida > 0),
                       v_i.quantidade_g);
  select a.nome, coalesce(a.energia_kcal, 0) as k, coalesce(a.proteina_g, 0) as p, coalesce(a.carboidrato_g, 0) as c,
         coalesce(a.lipidio_g, 0) as l, coalesce(a.fibra_g, 0) as f
    into v_a from {schema}.alimentos a where a.id = v_i.alimento_id;
  insert into {schema}.aluno_dia_itens (paciente_id, dono_user_id, dia, tipo, refeicao_id, item_refeicao_id, quantidade_g, refeicao_nome,
    nome, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g)
  values (v_pac, v_uid, p_dia, 'tirado', v_i.refeicao_id, p_item, v_gramas, left(v_lugar ->> 'nome', 80), left(coalesce(v_a.nome, 'Alimento'), 120),
    round(v_a.k * v_gramas / 100, 2), round(v_a.p * v_gramas / 100, 2), round(v_a.c * v_gramas / 100, 2),
    round(v_a.l * v_gramas / 100, 2), round(v_a.f * v_gramas / 100, 2))
  returning * into v_novo;
  return jsonb_build_object('ok', true, 'item', {schema}.wa_dia_item_json(v_novo));
end;
$$;

-- desfaz um "pus" (tira o que ele pôs) ou um "tirei" (volta o item do plano): a linha dele, hoje/ontem, com a Dieta liberada
-- { ok } · sem_login · dados_invalidos · nao_encontrado · dieta_travada
create or replace function {schema}.dia_desfazer(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_x {schema}.aluno_dia_itens%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_x from {schema}.aluno_dia_itens i where i.id = p_id and i.dono_user_id = v_uid and i.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if v_x.dia not in (v_hoje, v_hoje - 1) then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  if not {schema}.aluno_dieta_liberada(v_x.paciente_id) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  update {schema}.aluno_dia_itens set deleted_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- a refeição extra: criar (p_id null; p_dados { dia 'YYYY-MM-DD' (hoje/ontem), nome, horario 'HH:MM'|null, ja_comi (padrão true) } —
-- a matrícula é a do plano ativo) ou mudar (nome, horario, ja_comi). { ok, extra } · sem_login · dados_invalidos · nao_encontrado ·
-- dieta_travada · limite (10 no dia)
create or replace function {schema}.dia_extra_salvar(p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  d jsonb := p_dados;
  v_ruim constant jsonb := jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  v_e {schema}.aluno_dia_refeicoes%rowtype;
  v_dia date;
  v_pac uuid;
  v_nome text;
  v_hora time;
  v_comi boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if d is null or jsonb_typeof(d) <> 'object' then return v_ruim; end if;
  if d ? 'nome' then
    v_nome := {schema}.wa_texto(d -> 'nome', 1, 40);
    if v_nome is null then return v_ruim; end if;
  end if;
  if d ? 'horario' and jsonb_typeof(d -> 'horario') <> 'null' then
    if jsonb_typeof(d -> 'horario') <> 'string' or (d ->> 'horario') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return v_ruim; end if;
    v_hora := (d ->> 'horario')::time;
  end if;
  if d ? 'ja_comi' then
    if jsonb_typeof(d -> 'ja_comi') <> 'boolean' then return v_ruim; end if;
    v_comi := (d ->> 'ja_comi')::boolean;
  end if;
  if p_id is null then
    if v_nome is null or jsonb_typeof(d -> 'dia') is distinct from 'string' or (d ->> 'dia') !~ '^\d{4}-\d{2}-\d{2}$' then return v_ruim; end if;
    begin
      v_dia := (d ->> 'dia')::date;
    exception when others then
      return v_ruim;
    end;
    if v_dia not in (v_hoje, v_hoje - 1) then return v_ruim; end if;
    select pl.paciente_id into v_pac from {schema}.planos_alimentares pl where pl.id = {schema}.wa_plano_ativo(v_uid);
    if v_pac is null then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
    if not {schema}.aluno_dieta_liberada(v_pac) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_dia:' || v_uid::text || ':' || v_dia::text));
    if (select count(*) from {schema}.aluno_dia_refeicoes e where e.dono_user_id = v_uid and e.dia = v_dia and e.deleted_at is null) >= 10 then
      return jsonb_build_object('ok', false, 'erro', 'limite');
    end if;
    insert into {schema}.aluno_dia_refeicoes (paciente_id, dono_user_id, dia, nome, horario, concluida_em)
    values (v_pac, v_uid, v_dia, v_nome, v_hora, case when coalesce(v_comi, true) then now() end)
    returning * into v_e;
  else
    select * into v_e from {schema}.aluno_dia_refeicoes e where e.id = p_id and e.dono_user_id = v_uid and e.deleted_at is null for update;
    if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
    if v_e.dia not in (v_hoje, v_hoje - 1) or d ? 'dia' then return v_ruim; end if;
    if not {schema}.aluno_dieta_liberada(v_e.paciente_id) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
    update {schema}.aluno_dia_refeicoes
       set nome = coalesce(v_nome, nome),
           horario = case when d ? 'horario' then v_hora else horario end,
           concluida_em = case when v_comi is null then concluida_em when v_comi then coalesce(concluida_em, now()) end,
           alterado_em = now()
     where id = p_id
    returning * into v_e;
  end if;
  return jsonb_build_object('ok', true, 'extra', jsonb_build_object('id', v_e.id, 'paciente_id', v_e.paciente_id, 'dia', v_e.dia,
    'nome', v_e.nome, 'horario', to_char(v_e.horario, 'HH24:MI'), 'concluida_em', v_e.concluida_em));
end;
$$;

-- apaga a refeição extra (e o que ele pôs nela). { ok } · sem_login · nao_encontrado · dados_invalidos · dieta_travada
create or replace function {schema}.dia_extra_excluir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_e {schema}.aluno_dia_refeicoes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  select * into v_e from {schema}.aluno_dia_refeicoes e where e.id = p_id and e.dono_user_id = v_uid and e.deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if v_e.dia not in (v_hoje, v_hoje - 1) then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  if not {schema}.aluno_dieta_liberada(v_e.paciente_id) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  update {schema}.aluno_dia_itens set deleted_at = now() where extra_id = p_id and deleted_at is null;
  update {schema}.aluno_dia_refeicoes set deleted_at = now(), alterado_em = now() where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- o ✓ da refeição extra (o ✓ das refeições do plano segue na paciente_marcar_refeicao). { ok, concluida_em } · sem_login ·
-- nao_encontrado · dados_invalidos · dieta_travada
create or replace function {schema}.dia_extra_marcar(p_id uuid, p_feita boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_e {schema}.aluno_dia_refeicoes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_feita is null then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  select * into v_e from {schema}.aluno_dia_refeicoes e where e.id = p_id and e.dono_user_id = v_uid and e.deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if v_e.dia not in (v_hoje, v_hoje - 1) then return jsonb_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  if not {schema}.aluno_dieta_liberada(v_e.paciente_id) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  update {schema}.aluno_dia_refeicoes set concluida_em = case when p_feita then coalesce(concluida_em, now()) end, alterado_em = now()
   where id = p_id returning * into v_e;
  return jsonb_build_object('ok', true, 'concluida_em', v_e.concluida_em);
end;
$$;

-- ============================================================================================================
-- 4. As RPCs do ALUNO — os alimentos e as receitas DELE (P6: só dele; não entram na base da nutri)
-- ============================================================================================================
-- { ok, alimentos: [vivos], receitas: [vivas, com os itens e os macros de 1 porção] } · sem_login (lê mesmo travada)
create or replace function {schema}.meus_alimentos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  return jsonb_build_object('ok', true,
    'alimentos', coalesce((select jsonb_agg(to_jsonb(a) - 'busca' - 'dono_user_id' - 'deleted_at' order by a.nome, a.id)
                             from {schema}.aluno_alimentos a where a.dono_user_id = v_uid and a.deleted_at is null), '[]'::jsonb),
    'receitas', coalesce((select jsonb_agg(jsonb_build_object('id', rc.id, 'nome', rc.nome, 'porcoes', rc.porcoes,
                                   'por_porcao', {schema}.wa_macros_da_receita(rc.id),
                                   'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'alimento_id', i.alimento_id,
                                                        'aluno_alimento_id', i.aluno_alimento_id, 'nome', i.nome,
                                                        'quantidade_g', i.quantidade_g) order by i.ordem, i.id)
                                                        from {schema}.aluno_receita_itens i where i.receita_id = rc.id), '[]'::jsonb))
                                 order by rc.nome, rc.id)
                            from {schema}.aluno_receitas rc where rc.dono_user_id = v_uid and rc.deleted_at is null), '[]'::jsonb));
end;
$$;

-- criar (p_id null) ou mudar um alimento dele (por 100 g; porcao_g = a porção de referência). p_dados: { nome, porcao_g,
-- energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g } (na criação, só o nome é obrigatório; o resto vale 0/100).
-- Exige a Dieta liberada em alguma matrícula. { ok, alimento } · sem_login · dados_invalidos · nao_encontrado · dieta_travada · limite (300)
create or replace function {schema}.meu_alimento_salvar(p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d jsonb := p_dados;
  v_ruim constant jsonb := jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  v_a {schema}.aluno_alimentos%rowtype;
  v_k text;
  v_v numeric;
  v_n jsonb := '{}'::jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if d is null or jsonb_typeof(d) <> 'object' then return v_ruim; end if;
  if not {schema}.wa_dieta_liberada_alguma(v_uid) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  if d ? 'nome' then
    if {schema}.wa_texto(d -> 'nome', 1, 80) is null then return v_ruim; end if;
    v_n := v_n || jsonb_build_object('nome', {schema}.wa_texto(d -> 'nome', 1, 80));
  end if;
  if d ? 'porcao_g' then
    v_v := {schema}.wa_numero(d -> 'porcao_g', 0.01, 9999.99);
    if v_v is null then return v_ruim; end if;
    v_n := v_n || jsonb_build_object('porcao_g', v_v);
  end if;
  foreach v_k in array array['energia_kcal', 'proteina_g', 'carboidrato_g', 'lipidio_g', 'fibra_g'] loop
    if d ? v_k then
      v_v := {schema}.wa_numero(d -> v_k, 0, case when v_k = 'energia_kcal' then 1000 else 100 end);
      if v_v is null then return v_ruim; end if;
      v_n := v_n || jsonb_build_object(v_k, v_v);
    end if;
  end loop;
  if p_id is null then
    if not (v_n ? 'nome') then return v_ruim; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_alimentos:' || v_uid::text));
    if (select count(*) from {schema}.aluno_alimentos a where a.dono_user_id = v_uid and a.deleted_at is null) >= 300 then
      return jsonb_build_object('ok', false, 'erro', 'limite');
    end if;
    insert into {schema}.aluno_alimentos (dono_user_id, nome, porcao_g, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g)
    values (v_uid, v_n ->> 'nome', coalesce((v_n ->> 'porcao_g')::numeric, 100), coalesce((v_n ->> 'energia_kcal')::numeric, 0),
            coalesce((v_n ->> 'proteina_g')::numeric, 0), coalesce((v_n ->> 'carboidrato_g')::numeric, 0),
            coalesce((v_n ->> 'lipidio_g')::numeric, 0), coalesce((v_n ->> 'fibra_g')::numeric, 0))
    returning * into v_a;
  else
    update {schema}.aluno_alimentos a
       set nome = coalesce(v_n ->> 'nome', a.nome), porcao_g = coalesce((v_n ->> 'porcao_g')::numeric, a.porcao_g),
           energia_kcal = coalesce((v_n ->> 'energia_kcal')::numeric, a.energia_kcal),
           proteina_g = coalesce((v_n ->> 'proteina_g')::numeric, a.proteina_g),
           carboidrato_g = coalesce((v_n ->> 'carboidrato_g')::numeric, a.carboidrato_g),
           lipidio_g = coalesce((v_n ->> 'lipidio_g')::numeric, a.lipidio_g),
           fibra_g = coalesce((v_n ->> 'fibra_g')::numeric, a.fibra_g), alterado_em = now()
     where a.id = p_id and a.dono_user_id = v_uid and a.deleted_at is null
    returning * into v_a;
    if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  end if;
  return jsonb_build_object('ok', true, 'alimento', to_jsonb(v_a) - 'busca' - 'dono_user_id' - 'deleted_at');
end;
$$;

-- apaga (lixeira: deleted_at) — o que ele já pôs nos dias segue pelo retrato. { ok } · sem_login · nao_encontrado · dieta_travada
create or replace function {schema}.meu_alimento_excluir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if not {schema}.wa_dieta_liberada_alguma(v_uid) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  update {schema}.aluno_alimentos set deleted_at = now(), alterado_em = now()
   where id = p_id and dono_user_id = v_uid and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- criar (p_id null) ou mudar uma receita dele: { nome, porcoes (1–100), itens: [{ alimento_id | aluno_alimento_id, quantidade_g }]
-- (1–30; com "itens", a lista inteira é trocada) } — cada item guarda o retrato (nome + macros por 100 g).
-- { ok, receita } · sem_login · dados_invalidos · nao_encontrado · dieta_travada · limite (100)
create or replace function {schema}.minha_receita_salvar(p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d jsonb := p_dados;
  v_ruim constant jsonb := jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  v_nome text;
  v_porcoes numeric;
  v_rc {schema}.aluno_receitas%rowtype;
  v_it jsonb;
  v_ord integer := 0;
  v_alim uuid;
  v_aalim uuid;
  v_qtd numeric;
  v_x record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if d is null or jsonb_typeof(d) <> 'object' then return v_ruim; end if;
  if not {schema}.wa_dieta_liberada_alguma(v_uid) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  if d ? 'nome' then
    v_nome := {schema}.wa_texto(d -> 'nome', 1, 80);
    if v_nome is null then return v_ruim; end if;
  end if;
  if d ? 'porcoes' then
    v_porcoes := {schema}.wa_numero(d -> 'porcoes', 1, 100);
    if v_porcoes is null or v_porcoes <> trunc(v_porcoes) then return v_ruim; end if;
  end if;
  if d ? 'itens' then
    if jsonb_typeof(d -> 'itens') <> 'array' or jsonb_array_length(d -> 'itens') not between 1 and 30 then return v_ruim; end if;
  end if;
  if p_id is null then
    if v_nome is null or not (d ? 'itens') then return v_ruim; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_receitas:' || v_uid::text));
    if (select count(*) from {schema}.aluno_receitas r where r.dono_user_id = v_uid and r.deleted_at is null) >= 100 then
      return jsonb_build_object('ok', false, 'erro', 'limite');
    end if;
    insert into {schema}.aluno_receitas (dono_user_id, nome, porcoes) values (v_uid, v_nome, coalesce(v_porcoes, 1)::integer)
    returning * into v_rc;
  else
    update {schema}.aluno_receitas r set nome = coalesce(v_nome, r.nome), porcoes = coalesce(v_porcoes::integer, r.porcoes),
           alterado_em = now()
     where r.id = p_id and r.dono_user_id = v_uid and r.deleted_at is null
    returning * into v_rc;
    if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  end if;
  if d ? 'itens' then
    delete from {schema}.aluno_receita_itens where receita_id = v_rc.id;
    for v_it in select e from jsonb_array_elements(d -> 'itens') e loop
      if jsonb_typeof(v_it) <> 'object' or ((v_it ? 'alimento_id')::int + (v_it ? 'aluno_alimento_id')::int) <> 1 then
        raise exception 'wa_receita_item_invalido' using errcode = 'P0001';
      end if;
      v_qtd := {schema}.wa_numero(v_it -> 'quantidade_g', 0.01, 9999.99);
      if v_qtd is null then raise exception 'wa_receita_item_invalido' using errcode = 'P0001'; end if;
      if v_it ? 'alimento_id' then
        v_alim := {schema}.wa_uuid(v_it ->> 'alimento_id');
        v_aalim := null;
        if v_alim is null or not {schema}.wa_alimento_visivel(v_uid, v_alim) then
          raise exception 'wa_receita_item_nao_encontrado' using errcode = 'P0001';
        end if;
        select a.nome, coalesce(a.energia_kcal, 0) as k, coalesce(a.proteina_g, 0) as p, coalesce(a.carboidrato_g, 0) as c,
               coalesce(a.lipidio_g, 0) as l, coalesce(a.fibra_g, 0) as f into v_x from {schema}.alimentos a where a.id = v_alim;
      else
        v_aalim := {schema}.wa_uuid(v_it ->> 'aluno_alimento_id');
        v_alim := null;
        select a.nome, a.energia_kcal as k, a.proteina_g as p, a.carboidrato_g as c, a.lipidio_g as l, a.fibra_g as f into v_x
          from {schema}.aluno_alimentos a where a.id = v_aalim and a.dono_user_id = v_uid and a.deleted_at is null;
        if not found then raise exception 'wa_receita_item_nao_encontrado' using errcode = 'P0001'; end if;
      end if;
      insert into {schema}.aluno_receita_itens (receita_id, alimento_id, aluno_alimento_id, nome, energia_kcal, proteina_g, carboidrato_g,
                                                lipidio_g, fibra_g, quantidade_g, ordem)
      values (v_rc.id, v_alim, v_aalim, left(v_x.nome, 120), v_x.k, v_x.p, v_x.c, v_x.l, v_x.f, v_qtd, v_ord);
      v_ord := v_ord + 1;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'receita', jsonb_build_object('id', v_rc.id, 'nome', v_rc.nome, 'porcoes', v_rc.porcoes,
    'por_porcao', {schema}.wa_macros_da_receita(v_rc.id),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'alimento_id', i.alimento_id, 'aluno_alimento_id', i.aluno_alimento_id,
                                                           'nome', i.nome, 'quantidade_g', i.quantidade_g) order by i.ordem)
                         from {schema}.aluno_receita_itens i where i.receita_id = v_rc.id), '[]'::jsonb)));
exception when sqlstate 'P0001' then
  -- só as 2 recusas acima (a lista de itens volta inteira junto: a função é uma transação só)
  if sqlerrm = 'wa_receita_item_invalido' then return v_ruim; end if;
  if sqlerrm = 'wa_receita_item_nao_encontrado' then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  raise;
end;
$$;

create or replace function {schema}.minha_receita_excluir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if not {schema}.wa_dieta_liberada_alguma(v_uid) then return jsonb_build_object('ok', false, 'erro', 'dieta_travada'); end if;
  update {schema}.aluno_receitas set deleted_at = now(), alterado_em = now() where id = p_id and dono_user_id = v_uid and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- a busca do aluno (padrão 11): as receitas e os alimentos dele, os dos planos dele e a TACO; 20 por página, nessa ordem.
-- p_termo ≥ 2 letras (sem acento; texto_busca — o mesmo do app) e ≤ 60. { ok, itens: [{ tipo receita|meu|plano|taco, id, nome,
-- porcao_g, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g (por 100 g; a receita, por porção) }], pagina, tem_mais }
create or replace function {schema}.buscar_alimentos_do_aluno(p_termo text, p_pagina integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_t text := {schema}.texto_busca(regexp_replace(btrim(coalesce(p_termo, '')), '\s+', ' ', 'g'));
  v_ids uuid[];
  v_lista jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_pagina is null or p_pagina < 0 or p_pagina > 50 or char_length(v_t) > 60 then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if char_length(v_t) < 2 then
    return jsonb_build_object('ok', true, 'itens', '[]'::jsonb, 'pagina', p_pagina, 'tem_mais', false);
  end if;
  v_ids := {schema}.wa_matriculas_dieta(v_uid);
  select coalesce(jsonb_agg(x.j order by x.grupo, x.nome, x.id), '[]'::jsonb) into v_lista from (
    select c.grupo, c.nome, c.id, jsonb_build_object('tipo', c.tipo, 'id', c.id, 'nome', c.nome, 'porcao_g', c.porcao_g) || c.mac as j
      from (
        select 1 as grupo, 'receita' as tipo, rc.id, rc.nome, null::numeric as porcao_g, {schema}.wa_macros_da_receita(rc.id) as mac
          from {schema}.aluno_receitas rc
         where rc.dono_user_id = v_uid and rc.deleted_at is null and position(v_t in {schema}.texto_busca(rc.nome)) > 0
        union all
        select 1, 'meu', a.id, a.nome, a.porcao_g, jsonb_build_object('energia_kcal', a.energia_kcal, 'proteina_g', a.proteina_g,
               'carboidrato_g', a.carboidrato_g, 'lipidio_g', a.lipidio_g, 'fibra_g', a.fibra_g)
          from {schema}.aluno_alimentos a where a.dono_user_id = v_uid and a.deleted_at is null and position(v_t in a.busca) > 0
        union all
        select case when al.fonte = 'taco' then 3 else 2 end, case when al.fonte = 'taco' then 'taco' else 'plano' end, al.id, al.nome,
               al.porcao_g, jsonb_build_object('energia_kcal', coalesce(al.energia_kcal, 0), 'proteina_g', coalesce(al.proteina_g, 0),
               'carboidrato_g', coalesce(al.carboidrato_g, 0), 'lipidio_g', coalesce(al.lipidio_g, 0), 'fibra_g', coalesce(al.fibra_g, 0))
          from {schema}.alimentos al
         where position(v_t in al.busca) > 0
           and ((al.fonte = 'taco' and al.deleted_at is null)
             or al.id in (select i.alimento_id from {schema}.itens_refeicao i
                            join {schema}.refeicoes r on r.id = i.refeicao_id
                            join {schema}.planos_alimentares pl on pl.id = r.plano_id
                           where pl.deleted_at is null and pl.paciente_id = any(v_ids)))
      ) c
     order by c.grupo, c.nome, c.id
    offset p_pagina * 20 limit 21) x;
  return jsonb_build_object('ok', true, 'pagina', p_pagina, 'tem_mais', jsonb_array_length(v_lista) > 20,
    'itens', coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(v_lista) with ordinality as t(e, n) where n <= 20),
                      '[]'::jsonb));
end;
$$;

-- ============================================================================================================
-- 5. A RPC do PROFISSIONAL — o dia a dia (P7, Q1: a nutri e o personal veem; só a matrícula da rota; só leitura)
-- ============================================================================================================
-- { ok, paciente_id, nivel ver|mexer, liberada, extras, itens } (≤ 31 dias; com os retratos — a refeição que a nutri tirou do
-- plano vem com refeicao_id null) · sem_login · sem_acesso · aluno_inexistente · dados_invalidos
create or replace function {schema}.dia_do_aluno(p_aluno uuid, p_de date, p_ate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
  v_id uuid;
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 30 then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  v_r := {schema}.wa_rota(p_aluno);
  if not (v_r ->> 'ok')::boolean then return v_r; end if;
  v_id := (v_r ->> 'id')::uuid;
  return jsonb_build_object('ok', true, 'paciente_id', v_id,
    'nivel', coalesce((select a.nivel from {schema}.aluno_acessos a where a.paciente_id = v_id and a.chave = 'dieta'), 'ver'),
    'liberada', {schema}.aluno_dieta_liberada(v_id),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'dia', e.dia, 'nome', e.nome, 'horario', to_char(e.horario, 'HH24:MI'),
                                                            'concluida_em', e.concluida_em) order by e.dia, e.horario nulls last, e.criado_em)
                          from {schema}.aluno_dia_refeicoes e
                         where e.paciente_id = v_id and e.dia between p_de and p_ate and e.deleted_at is null), '[]'::jsonb),
    'itens', coalesce((select jsonb_agg({schema}.wa_dia_item_json(i) order by i.dia, i.criado_em)
                         from {schema}.aluno_dia_itens i
                        where i.paciente_id = v_id and i.dia between p_de and p_ate and i.deleted_at is null), '[]'::jsonb));
end;
$$;

revoke all on function {schema}.meu_dia(date), {schema}.dia_adicionar(date, jsonb), {schema}.dia_tirar(date, uuid), {schema}.dia_desfazer(uuid),
  {schema}.dia_extra_salvar(uuid, jsonb), {schema}.dia_extra_excluir(uuid), {schema}.dia_extra_marcar(uuid, boolean),
  {schema}.meus_alimentos(), {schema}.meu_alimento_salvar(uuid, jsonb), {schema}.meu_alimento_excluir(uuid),
  {schema}.minha_receita_salvar(uuid, jsonb), {schema}.minha_receita_excluir(uuid), {schema}.buscar_alimentos_do_aluno(text, integer),
  {schema}.dia_do_aluno(uuid, date, date) from public, anon;
grant execute on function {schema}.meu_dia(date), {schema}.dia_adicionar(date, jsonb), {schema}.dia_tirar(date, uuid), {schema}.dia_desfazer(uuid),
  {schema}.dia_extra_salvar(uuid, jsonb), {schema}.dia_extra_excluir(uuid), {schema}.dia_extra_marcar(uuid, boolean),
  {schema}.meus_alimentos(), {schema}.meu_alimento_salvar(uuid, jsonb), {schema}.meu_alimento_excluir(uuid),
  {schema}.minha_receita_salvar(uuid, jsonb), {schema}.minha_receita_excluir(uuid), {schema}.buscar_alimentos_do_aluno(text, integer),
  {schema}.dia_do_aluno(uuid, date, date) to authenticated, service_role;

-- ============================================================================================================
-- 6. Conferência da dieta livre (algo fora do esperado → exceção → o bloco do schema inteiro volta)
-- ============================================================================================================
do $wa$
declare
  v_t text;
  v_oid regclass;
  v_f text;
  r record;
begin
  foreach v_t in array array['aluno_alimentos', 'aluno_receitas', 'aluno_receita_itens', 'aluno_dia_refeicoes', 'aluno_dia_itens'] loop
    v_oid := to_regclass('{schema}.' || v_t);
    if v_oid is null or not exists (select 1 from pg_catalog.pg_class c where c.oid = v_oid and c.relrowsecurity) then
      raise exception 'wa3: {schema}.% sem RLS', v_t;
    end if;
    if exists (select 1 from pg_catalog.pg_policy p where p.polrelid = v_oid and p.polcmd <> 'r') then
      raise exception 'wa3: {schema}.% com policy de escrita', v_t;
    end if;
    if pg_catalog.has_table_privilege('anon', v_oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
       or pg_catalog.has_table_privilege('authenticated', v_oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
       or not pg_catalog.has_table_privilege('authenticated', v_oid, 'SELECT') then
      raise exception 'wa3: {schema}.% com privilégio fora do esperado', v_t;
    end if;
  end loop;
  -- as FKs para as tabelas da nutri e para os autores: SET NULL (C2/I5); o dono: CASCADE
  if exists (select 1 from pg_catalog.pg_constraint c
              where c.contype = 'f' and c.conrelid in ('{schema}.aluno_receita_itens'::regclass, '{schema}.aluno_dia_itens'::regclass)
                and c.confrelid in ('{schema}.refeicoes'::regclass, '{schema}.itens_refeicao'::regclass, '{schema}.alimentos'::regclass)
                and c.confdeltype <> 'n') then
    raise exception 'wa3: FK para tabela da nutri sem ON DELETE SET NULL em {schema}';
  end if;
  foreach v_f in array array['{schema}.meu_dia(date)', '{schema}.dia_adicionar(date, jsonb)', '{schema}.dia_tirar(date, uuid)',
                             '{schema}.dia_desfazer(uuid)', '{schema}.dia_extra_salvar(uuid, jsonb)', '{schema}.dia_extra_excluir(uuid)',
                             '{schema}.dia_extra_marcar(uuid, boolean)', '{schema}.meus_alimentos()', '{schema}.meu_alimento_salvar(uuid, jsonb)',
                             '{schema}.meu_alimento_excluir(uuid)', '{schema}.minha_receita_salvar(uuid, jsonb)',
                             '{schema}.minha_receita_excluir(uuid)', '{schema}.buscar_alimentos_do_aluno(text, integer)',
                             '{schema}.dia_do_aluno(uuid, date, date)'] loop
    select p.oid, p.prosecdef, p.proconfig into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if r.oid is null or not r.prosecdef or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%')
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa3: % fora do esperado (definer, search_path, logado e servidor)', v_f;
    end if;
  end loop;
  foreach v_f in array array['{schema}.wa_uuid(text)', '{schema}.wa_numero(jsonb, numeric, numeric)', '{schema}.wa_texto(jsonb, integer, integer)',
                             '{schema}.wa_matriculas_dieta(uuid)', '{schema}.wa_plano_ativo(uuid)', '{schema}.wa_refeicao_do_dia(uuid, uuid, date)',
                             '{schema}.wa_alimento_visivel(uuid, uuid)', '{schema}.wa_macros_da_receita(uuid)',
                             '{schema}.wa_dieta_liberada_alguma(uuid)', '{schema}.wa_dia_item_json({schema}.aluno_dia_itens)',
                             '{schema}.wa_dados_do_aluno(uuid, boolean)'] loop
    select p.oid into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if r.oid is null or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa3: % fora do esperado (interna: só o servidor)', v_f;
    end if;
  end loop;
end
$wa$;

-- ============================================================================================================
-- 7. LGPD (C1 da revisão): a exportar ({schema}) e as 2 exclusões do STAGING a partir do corpo VIVO (gerado — Task 6 do plano)
-- ============================================================================================================
-- >>> LGPD por schema
-- gerado por gerar_lgpd_wa3.py a partir do corpo VIVO (12/10/2026, md5 conferido) — não editar à mão
CREATE OR REPLACE FUNCTION {schema}.exportar_dados_aluno(p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
  v_planos uuid[];
  v_refeicoes uuid[];
  v_login jsonb;
  v_perfil jsonb;
  v_matriculas jsonb;
  v_tabelas jsonb := '{}'::jsonb;
  v_aceites jsonb;  -- hml-12 (H-30)
begin
  if p_uid is null then
    raise exception 'exportar_dados_aluno: p_uid obrigatório';
  end if;
  select jsonb_build_object(
           'id', u.id, 'email', u.email, 'telefone', u.phone, 'criado_em', u.created_at, 'ultimo_login', u.last_sign_in_at,
           'email_confirmado_em', u.email_confirmed_at,
           'entra_com', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb),
           'nome_no_login', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           'foto_no_login', coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'))
    into v_login from auth.users u where u.id = p_uid;
  select to_jsonb(p) - array['carimbo_url', 'recebimento', 'codigo_cadastro'] into v_perfil from {schema}.profiles p where p.id = p_uid;

  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from {schema}.pacientes p where p.user_id = p_uid and p.deleted_at is null;
  select coalesce(jsonb_agg((to_jsonb(p) - array['busca', 'resumo', 'link_codigo']) || jsonb_build_object(
           'conta_nome', c.nome,
           'personal_nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.personal_id),
           'nutricionista_nome', (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr where pr.id = p.nutricionista_id),
           'plano_aluno_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id))
         order by p.created_at), '[]'::jsonb)
    into v_matriculas
    from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id
   where p.id = any(v_ids);

  select coalesce(array_agg(pl.id), array[]::uuid[]) into v_planos from {schema}.planos_alimentares pl where pl.paciente_id = any(v_ids) and pl.deleted_at is null;
  select coalesce(array_agg(r.id), array[]::uuid[]) into v_refeicoes from {schema}.refeicoes r where r.plano_id = any(v_planos);

  v_tabelas := jsonb_build_object(
    'agendamentos', (select coalesce(jsonb_agg(to_jsonb(t) - array['observacao'] order by t.inicio), '[]') from {schema}.agendamentos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'consultas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.consultas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'planos_alimentares', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.planos_alimentares t where t.id = any(v_planos)),
    'refeicoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.plano_id, t.ordem), '[]') from {schema}.refeicoes t where t.id = any(v_refeicoes)),
    'itens_refeicao', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('alimento', al.nome) order by t.refeicao_id, t.ordem), '[]')
                         from {schema}.itens_refeicao t left join {schema}.alimentos al on al.id = t.alimento_id where t.refeicao_id = any(v_refeicoes)),
    'orientacoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.orientacoes t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'metas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.metas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'metas_concluidas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.metas_concluidas t where t.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.refeicoes_concluidas t where t.paciente_id = any(v_ids)),
    'diario_alimentar', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.data_hora), '[]') from {schema}.diario_alimentar t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'registros_diarios', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.registros_diarios t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'antropometrias', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.antropometrias t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'calculos_energeticos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.calculos_energeticos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'fotos_evolucao', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.data), '[]') from {schema}.fotos_evolucao t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'anamneses', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.anamneses t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'respostas_questionario', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.respostas_questionario t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'respostas_preconsulta', (select coalesce(jsonb_agg(to_jsonb(t) order by t.respondido_em), '[]') from {schema}.respostas_preconsulta t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'pedidos_exame', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.pedidos_exame t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'resultados_exame', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.resultados_exame t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'suplementos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.indicacoes_produto t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'formulas_manipuladas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.formulas_manipuladas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'medicamentos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.medicamentos_paciente t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'analises_farmaco', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.analises_farmaco t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'avaliacoes_integradas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.avaliacoes_integradas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'gestacoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.gestacoes t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'registros_gestacionais', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.registros_gestacionais t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'documentos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.documentos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'anexos', (select coalesce(jsonb_agg(to_jsonb(t) - array['path'] order by t.created_at), '[]') from {schema}.anexos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'cobrancas', (select coalesce(jsonb_agg((to_jsonb(t) - array['pix_qr', 'pix_copia_cola', 'comprovante_path'])
                                             || jsonb_build_object('tem_comprovante', t.comprovante_path is not null) order by t.created_at), '[]')
                    from {schema}.cobrancas t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'recibos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.data), '[]') from {schema}.recibos t where t.paciente_id = any(v_ids) and t.deleted_at is null),
    'assinaturas', (select coalesce(jsonb_agg(to_jsonb(t) - array['payload'] order by t.criado_em), '[]') from {schema}.aluno_assinaturas t where t.paciente_id = any(v_ids)),
    'mensagens_whatsapp', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.mensagens_whatsapp t where t.paciente_id = any(v_ids)),
    'cadastros_pendentes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from {schema}.cadastros_pendentes t where t.paciente_id = any(v_ids)),
    'avisos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em), '[]') from {schema}.avisos t where t.destino_user_id = p_uid));

  -- W-A (12/10/2026): as rotinas e a dieta livre do aluno — TODAS as linhas dele (com as arquivadas, as apagadas e o histórico; sem
  -- o id de quem mudou, o molde do 'aceites' sem registrado_por) — e os acessos das matrículas dele
  v_tabelas := v_tabelas || jsonb_build_object(
    'rotinas', (select coalesce(jsonb_agg(to_jsonb(t) - array['criada_por', 'alterada_por', 'arquivada_por'] order by t.criada_em), '[]') from {schema}.rotinas t where t.dono_user_id = p_uid),
    'rotinas_feitas', (select coalesce(jsonb_agg(to_jsonb(f) order by f.dia, f.feita_em), '[]') from {schema}.rotinas_feitas f join {schema}.rotinas t on t.id = f.rotina_id where t.dono_user_id = p_uid),
    'rotinas_historico', (select coalesce(jsonb_agg(to_jsonb(h) - 'por' order by h.em), '[]') from {schema}.rotinas_historico h join {schema}.rotinas t on t.id = h.rotina_id where t.dono_user_id = p_uid),
    'aluno_alimentos', (select coalesce(jsonb_agg(to_jsonb(t) - 'busca' order by t.criado_em), '[]') from {schema}.aluno_alimentos t where t.dono_user_id = p_uid),
    'aluno_receitas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em), '[]') from {schema}.aluno_receitas t where t.dono_user_id = p_uid),
    'aluno_receita_itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.receita_id, i.ordem), '[]') from {schema}.aluno_receita_itens i join {schema}.aluno_receitas t on t.id = i.receita_id where t.dono_user_id = p_uid),
    'aluno_dia_refeicoes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.dia, t.criado_em), '[]') from {schema}.aluno_dia_refeicoes t where t.dono_user_id = p_uid),
    'aluno_dia_itens', (select coalesce(jsonb_agg(to_jsonb(t) order by t.dia, t.criado_em), '[]') from {schema}.aluno_dia_itens t where t.dono_user_id = p_uid),
    'aluno_acessos', (select coalesce(jsonb_agg(to_jsonb(a) - 'alterado_por' order by a.paciente_id, a.chave), '[]') from {schema}.aluno_acessos a where a.paciente_id = any(v_ids)));

  -- hml-12 (H-30): os aceites do titular e os do responsável pelas matrículas dele (sem quem registrou)
  select coalesce(jsonb_agg(to_jsonb(a) - 'registrado_por' order by a.em, a.id), '[]'::jsonb) into v_aceites
    from {schema}.aceites a where a.user_id = p_uid or a.paciente_id = any(v_ids);

  return jsonb_build_object('login', v_login, 'perfil', v_perfil, 'matriculas', v_matriculas, 'tabelas', v_tabelas,
                            'aceites', v_aceites);
end;
$function$;

-- as 2 exclusões do STAGING (o corpo vivo da hml02b, com o bucket diario-staging); no --so public este bloco não roda
do $wa_lgpd$
begin
  if '{schema}' = 'staging' then
    execute $wa_corpo$CREATE OR REPLACE FUNCTION staging.excluir_dados_aluno(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff text;
  v_ids uuid[];
  v_arquivos jsonb;
  v_apaga jsonb;
  v_mantem jsonb;
  v_whats integer;
begin
  if p_uid is null then
    raise exception 'excluir_dados_aluno: p_uid obrigatório';
  end if;
  -- quem é profissional não exclui pelo app do aluno (a conta dele sustenta alunos e equipe — nunca deixar conta órfã)
  select case
      when exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin')) then 'master'
      when exists (select 1 from staging.profiles p where p.id = p_uid and p.role in ('master', 'nutricionista')) then 'perfil_profissional'
      when exists (select 1 from staging.contas c where c.dono_id = p_uid) then 'dono'
      when exists (select 1 from staging.conta_membros m where m.user_id = p_uid and m.status <> 'removido') then 'membro'
    end into v_staff;
  if v_staff is not null then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', v_staff);
  end if;

  -- TODAS as matrículas do login (inclusive as da lixeira): o login some, nenhuma pode ficar apontando para ele
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from staging.pacientes p where p.user_id = p_uid;

  if exists (select 1 from staging.aluno_assinaturas a where a.paciente_id = any(v_ids) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario-staging', 'path', d.path)), '[]'::jsonb) into v_arquivos
    from staging.diario_alimentar d where d.paciente_id = any(v_ids) and nullif(d.path, '') is not null;
  select count(*) into v_whats from staging.mensagens_whatsapp m where m.paciente_id = any(v_ids) and m.status = 'pendente';

  v_apaga := jsonb_build_object(
    'diario_alimentar', (select count(*) from staging.diario_alimentar d where d.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select count(*) from staging.refeicoes_concluidas r where r.paciente_id = any(v_ids)),
    'metas_concluidas', (select count(*) from staging.metas_concluidas r where r.paciente_id = any(v_ids)),
    'avisos', (select count(*) from staging.avisos a where a.destino_user_id = p_uid),
    'perfil', (select count(*) from staging.profiles p where p.id = p_uid),
    'whatsapp_pendentes_cancelados', v_whats,
    'rotinas_e_dieta', staging.wa_dados_do_aluno(p_uid, false));  -- W-A
  v_mantem := jsonb_build_object(
    'matriculas', coalesce(array_length(v_ids, 1), 0),
    'agendamentos', (select count(*) from staging.agendamentos a where a.paciente_id = any(v_ids)),
    'cobrancas', (select count(*) from staging.cobrancas c where c.paciente_id = any(v_ids)),
    'recibos', (select count(*) from staging.recibos r where r.paciente_id = any(v_ids)),
    'antropometrias', (select count(*) from staging.antropometrias a where a.paciente_id = any(v_ids)),
    'planos_alimentares', (select count(*) from staging.planos_alimentares a where a.paciente_id = any(v_ids)),
    'prontuario', (select count(*) from staging.registros_prontuario a where a.paciente_id = any(v_ids)));

  if not coalesce(p_simular, true) then
    delete from staging.diario_alimentar where paciente_id = any(v_ids);
    delete from staging.refeicoes_concluidas where paciente_id = any(v_ids);
    delete from staging.metas_concluidas where paciente_id = any(v_ids);
    perform staging.wa_dados_do_aluno(p_uid, true);  -- W-A: rotinas, alimentos, receitas e o dia livre (antes do login sair)
    update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
     where paciente_id = any(v_ids) and status = 'pendente';
    update staging.pacientes
       set ativo = false,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = any(v_ids);
    -- o gatilho do espelho enfileirou esta pessoa (ativo mudou), mas o login vai sumir: o Treino já foi tratado pela borda
    delete from staging.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'matriculas', to_jsonb(v_ids),
    'apaga', v_apaga, 'mantem', v_mantem, 'arquivos', v_arquivos);
end;
$function$$wa_corpo$;
    execute $wa_corpo$CREATE OR REPLACE FUNCTION staging.excluir_conta_profissional(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_simular boolean := coalesce(p_simular, true);
  v_contas_dono uuid[];
  v_c record;
  v_m record;
  v_nome text;
  v_perfil text;
  v_ids_aluno uuid[];
  v_aluno jsonb := null;
  v_arquivos jsonb := '[]'::jsonb;
  v_whats integer := 0;
  v_dono jsonb := '[]'::jsonb;
  v_equipes jsonb := '[]'::jsonb;
  v_ex_equipes integer := 0;
  v_sem_conta jsonb := null;
  v_eu_nutri boolean;
  v_alunos jsonb;
  v_resumo_alunos jsonb;
  v_membros jsonb;
  v_cobrancas jsonb;
  v_pront jsonb;
  v_convites integer;
  v_lixeira integer;
  v_removidos integer;
  v_revogados integer;
  v_chaves integer;
  v_whats_conta integer;
  v_treino integer;
  v_nutri integer;
  v_feito jsonb;
  v_email_login text;
  v_perfis jsonb := '[]'::jsonb;
begin
  if p_uid is null then
    raise exception 'excluir_conta_profissional: p_uid obrigatório';
  end if;

  -- o master nunca exclui por aqui (a conta do app — origem 'app' — é dele e nunca é afetada)
  if exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin'))
     or exists (select 1 from staging.profiles p where p.id = p_uid and p.role = 'master') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
  end if;

  -- contas de que é dono: a linha da conta (dono_id — continua apontando para ele depois de excluir: o pedido de novo acha) ou o
  -- papel 'dono' numa equipe ainda ativa
  select coalesce(array_agg(distinct c.id), array[]::uuid[]) into v_contas_dono
    from staging.contas c
   where c.dono_id = p_uid
      or exists (select 1 from staging.conta_membros m
                  where m.conta_id = c.id and m.user_id = p_uid and m.status <> 'removido' and 'dono' = any(m.papeis));
  if exists (select 1 from staging.contas c where c.id = any(v_contas_dono) and c.origem = 'app') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'conta_do_app');
  end if;
  if exists (select 1 from staging.contas c where c.id = any(v_contas_dono) and c.cobranca_legada) then
    return jsonb_build_object('ok', false, 'erro', 'conta_legada');
  end if;

  -- é (ou já foi) profissional? Sem conta, sem equipe (nem passada) e sem o perfil de nutricionista do site antigo = só aluno: o
  -- caminho é o de sempre (excluir_dados_aluno — a borda sem o campo novo)
  if coalesce(array_length(v_contas_dono, 1), 0) = 0
     and not exists (select 1 from staging.conta_membros m where m.user_id = p_uid)
     and not exists (select 1 from staging.profiles p where p.id = p_uid and p.role = 'nutricionista') then
    return jsonb_build_object('ok', false, 'erro', 'nao_profissional');
  end if;

  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
         lower(u.email)
    into v_nome, v_email_login from auth.users u left join staging.profiles pr on pr.id = u.id where u.id = p_uid;

  -- ---------- a parte de ALUNO (quem também é aluno em alguma conta — a mesma lista da excluir_dados_aluno, W7) ----------
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids_aluno from staging.pacientes p where p.user_id = p_uid;
  if exists (select 1 from staging.aluno_assinaturas a where a.paciente_id = any(v_ids_aluno) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;
  -- toda recusa vem ANTES de mudar qualquer coisa: a cobrança automática das contas dele (plano e alunos → ele) a borda cancela no
  -- Mercado Pago antes de pedir o "excluir"; sobrou alguma viva (o cancelamento falhou ou nasceu outra no meio) → nada muda
  if not v_simular and (
       exists (select 1 from staging.conta_assinaturas a where a.conta_id = any(v_contas_dono) and a.status in ('authorized', 'pending', 'paused'))
    or exists (select 1 from staging.aluno_assinaturas a
                where a.status in ('authorized', 'pending', 'paused')
                  and (a.conta_id = any(v_contas_dono)
                       or exists (select 1 from staging.pacientes p where p.id = a.paciente_id and p.conta_id = any(v_contas_dono))))) then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_ativa');
  end if;
  if coalesce(array_length(v_ids_aluno, 1), 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario-staging', 'path', d.path)), '[]'::jsonb) into v_arquivos
      from staging.diario_alimentar d where d.paciente_id = any(v_ids_aluno) and nullif(d.path, '') is not null;
    select count(*) into v_whats from staging.mensagens_whatsapp m where m.paciente_id = any(v_ids_aluno) and m.status = 'pendente';
    v_aluno := jsonb_build_object(
      'matriculas', coalesce(array_length(v_ids_aluno, 1), 0),
      'contas', (select coalesce(jsonb_agg(distinct c.nome), '[]'::jsonb) from staging.pacientes p join staging.contas c on c.id = p.conta_id
                  where p.id = any(v_ids_aluno) and c.origem <> 'app' and not (c.id = any(v_contas_dono))),
      'apaga', jsonb_build_object(
        'diario_alimentar', (select count(*) from staging.diario_alimentar d where d.paciente_id = any(v_ids_aluno)),
        'refeicoes_concluidas', (select count(*) from staging.refeicoes_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'metas_concluidas', (select count(*) from staging.metas_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'whatsapp_pendentes_cancelados', v_whats,
        'rotinas_e_dieta', staging.wa_dados_do_aluno(p_uid, false)),  -- W-A
      'mantem', jsonb_build_object(
        'agendamentos', (select count(*) from staging.agendamentos a where a.paciente_id = any(v_ids_aluno)),
        'cobrancas', (select count(*) from staging.cobrancas c where c.paciente_id = any(v_ids_aluno)),
        'recibos', (select count(*) from staging.recibos r where r.paciente_id = any(v_ids_aluno)),
        'antropometrias', (select count(*) from staging.antropometrias a where a.paciente_id = any(v_ids_aluno)),
        'planos_alimentares', (select count(*) from staging.planos_alimentares a where a.paciente_id = any(v_ids_aluno)),
        'prontuario', (select count(*) from staging.registros_prontuario a where a.paciente_id = any(v_ids_aluno))));
    if not v_simular then
      delete from staging.diario_alimentar where paciente_id = any(v_ids_aluno);
      delete from staging.refeicoes_concluidas where paciente_id = any(v_ids_aluno);
      delete from staging.metas_concluidas where paciente_id = any(v_ids_aluno);
      update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
       where paciente_id = any(v_ids_aluno) and status = 'pendente';
      -- o login sai por soft delete (a linha do Auth fica): a matrícula fica desligada dele aqui, como o "set null" faria
      update staging.pacientes
         set ativo = false, user_id = null,
             config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
       where id = any(v_ids_aluno);
    end if;
  end if;

  -- ---------- DONO: cada conta ----------
  for v_c in select c.* from staging.contas c where c.id = any(v_contas_dono) order by c.criado_em loop
    v_eu_nutri := 'nutricao' = any(staging.modulos_do_plano(v_c.plano))
      and exists (select 1 from staging.conta_membros m where m.conta_id = v_c.id and m.user_id = p_uid and m.status = 'ativo'
                    and 'nutricionista' = any(m.papeis));
    -- os alunos (fora da lixeira) e para onde vão — a mesma regra do gatilho pacientes_app_assumir (W7b)
    select jsonb_build_object(
             'total', count(*),
             'para_o_app', count(*) filter (where x.destino = 'app'),
             'guardados', count(*) filter (where x.destino <> 'app'),
             'lista', coalesce((jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'destino', x.destino) order by x.nome)
                                 filter (where x.ordem <= 100)), '[]'::jsonb))
      into v_resumo_alunos
      from (select p.id, p.nome, row_number() over (order by p.nome) as ordem,
                   case when p.user_id is not null and p.user_id <> p_uid and p.ativo and v_c.origem in ('nova', 'legado_calc')
                          and not exists (select 1 from staging.pacientes o where o.user_id = p.user_id and o.conta_id is distinct from v_c.id
                                            and o.deleted_at is null and o.ativo)
                          and not exists (select 1 from staging.profiles pr where pr.id = p.user_id and pr.role = 'master')
                        then 'app' else 'guardado' end as destino
              from staging.pacientes p where p.conta_id = v_c.id and p.deleted_at is null) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', coalesce(staging.nome_da_pessoa(m.user_id), m.email_convite), 'email', coalesce(u.email, m.email_convite),
             'papeis', to_jsonb(m.papeis), 'status', m.status) order by m.status, coalesce(staging.nome_da_pessoa(m.user_id), m.email_convite)), '[]'::jsonb)
      into v_membros
      from staging.conta_membros m left join auth.users u on u.id = m.user_id
     where m.conta_id = v_c.id and m.status in ('ativo', 'convidado') and m.user_id is distinct from p_uid;
    select count(*) into v_convites from staging.convites cv where cv.conta_id = v_c.id and cv.status = 'pendente';
    v_cobrancas := jsonb_build_object(
      'plano', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mp_preapproval_id', a.mp_preapproval_id, 'status', a.status,
                                                              'simulada', coalesce(a.payload ->> 'simulada', '') = 'true')), '[]'::jsonb)
                  from staging.conta_assinaturas a where a.conta_id = v_c.id and a.status in ('authorized', 'pending', 'paused')),
      'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'paciente_id', a.paciente_id, 'mp_preapproval_id', a.mp_preapproval_id,
                                                               'status', a.status)), '[]'::jsonb)
                   from staging.aluno_assinaturas a
                  where a.status in ('authorized', 'pending', 'paused')
                    and (a.conta_id = v_c.id or exists (select 1 from staging.pacientes p where p.id = a.paciente_id and p.conta_id = v_c.id))));
    -- os prontuários (todas as matrículas da conta, inclusive as da lixeira): o que o dono vê e o que é "Só nutricionistas"
    select coalesce(jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', v_c.id, 'nome', p.nome, 'registros', x.total,
                                                 'restritos', x.restritos) order by p.nome), '[]'::jsonb)
      into v_pront
      from staging.pacientes p
      join lateral (select count(*) as total,
                           count(*) filter (where r.visibilidade = 'nutricionistas' and not v_eu_nutri) as restritos
                      from staging.registros_prontuario r where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
     where p.conta_id = v_c.id;

    v_feito := null;
    if not v_simular then
      -- a) as matrículas para a lixeira, como no aluno_remover: o gatilho pacientes_app_assumir (W7b) leva quem tem login para o app
      update staging.pacientes set deleted_at = now() where conta_id = v_c.id and deleted_at is null;
      get diagnostics v_lixeira = row_count;
      -- b) a equipe perde o acesso (sou_membro na hora; o Treino pelo espelho) e fica sabendo pelo sino, como no remover_membro
      select count(*) into v_removidos from staging.conta_membros m
       where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is distinct from p_uid;
      insert into staging.avisos (destino_user_id, tipo, titulo, link)
      select m.user_id, 'membro_removido', left('Você não faz mais parte da equipe de ' || v_c.nome || ' (a conta foi encerrada)', 160), null
        from staging.conta_membros m where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is not null and m.user_id <> p_uid;
      update staging.conta_membros
         set status = 'removido', removido_em = now(),
             removido_motivo = case when user_id = p_uid then 'conta_excluida' else removido_motivo end
       where conta_id = v_c.id and status <> 'removido';
      -- c) convites (aluno e membro) que ninguém aceitou não levam mais ninguém para a conta
      update staging.convites set status = 'revogado' where conta_id = v_c.id and status = 'pendente';
      get diagnostics v_revogados = row_count;
      -- d) ninguém paga mais por Pix a uma conta encerrada; mensagens automáticas pendentes saem da fila
      update staging.recebimento_chaves set ativa = false, atualizado_em = now() where conta_id = v_c.id and ativa;
      get diagnostics v_chaves = row_count;
      update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o profissional excluiu a conta', updated_at = now()
       where status = 'pendente' and (conta_id = v_c.id or nutricionista_id = p_uid);
      get diagnostics v_whats_conta = row_count;
      -- e) a conta fica (as matrículas da lixeira guardam o histórico), cancelada
      update staging.contas set situacao = 'cancelada' where id = v_c.id and situacao <> 'cancelada';
      v_feito := jsonb_build_object('alunos_na_lixeira', v_lixeira, 'membros_removidos', v_removidos, 'convites_revogados', v_revogados,
                                    'chaves_pix_desligadas', v_chaves, 'whatsapp_cancelados', v_whats_conta);
      if v_c.situacao <> 'cancelada' or v_lixeira > 0 or v_removidos > 0 or v_revogados > 0 or v_chaves > 0 or v_whats_conta > 0 then
        insert into staging.conta_eventos (conta_id, tipo, antes, depois, por)
        values (v_c.id, 'situacao', jsonb_build_object('situacao', v_c.situacao),
                jsonb_build_object('situacao', 'cancelada', 'acao', 'conta_excluida_pelo_dono', 'w2l', true,
                                   'alunos_para_o_app', v_resumo_alunos -> 'para_o_app') || v_feito, p_uid);
      end if;
    end if;

    v_dono := v_dono || jsonb_build_object(
      'id', v_c.id, 'nome', v_c.nome, 'origem', v_c.origem, 'plano', v_c.plano, 'situacao', v_c.situacao, 'eu_nutri', v_eu_nutri,
      'alunos', v_resumo_alunos, 'membros', v_membros, 'convites_pendentes', v_convites, 'cobrancas', v_cobrancas, 'prontuarios', v_pront,
      'feito', v_feito);
  end loop;

  -- ---------- pacientes sem conta do site antigo do Nutri (os da própria nutricionista — regra de hoje: nutricionista_id) ----------
  if exists (select 1 from staging.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid) then
    select jsonb_build_object(
             'alunos', (select count(*) from staging.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid and p.deleted_at is null),
             'prontuarios', coalesce((
               select jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', null, 'nome', p.nome, 'registros', x.total, 'restritos', 0)
                                order by p.nome)
                 from staging.pacientes p
                 join lateral (select count(*) as total from staging.registros_prontuario r
                                where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
                where p.conta_id is null and p.nutricionista_id = p_uid), '[]'::jsonb))
      into v_sem_conta;
    if not v_simular then
      update staging.pacientes set deleted_at = now() where conta_id is null and nutricionista_id = p_uid and deleted_at is null;
    end if;
  end if;

  -- ---------- MEMBRO (não dono): sai da equipe como no remover_membro, sem novo responsável ----------
  for v_m in select m.*, c.nome as conta_nome, c.dono_id
               from staging.conta_membros m join staging.contas c on c.id = m.conta_id
              where m.user_id = p_uid and m.status <> 'removido' and not (m.conta_id = any(v_contas_dono))
              order by m.criado_em loop
    select count(*) filter (where p.personal_id = p_uid), count(*) filter (where p.nutricionista_id = p_uid)
      into v_treino, v_nutri
      from staging.pacientes p where p.conta_id = v_m.conta_id and p.deleted_at is null;
    if not v_simular then
      update staging.pacientes set personal_id = null where conta_id = v_m.conta_id and personal_id = p_uid;
      update staging.pacientes set nutricionista_id = null where conta_id = v_m.conta_id and nutricionista_id = p_uid;
      update staging.convites set status = 'revogado'
       where conta_id = v_m.conta_id and tipo = 'aluno' and status = 'pendente' and responsavel_id = p_uid;
      get diagnostics v_revogados = row_count;
      update staging.conta_membros set status = 'removido', removido_em = now(), removido_motivo = 'conta_excluida' where id = v_m.id;
      insert into staging.conta_eventos (conta_id, tipo, antes, depois, por)
      values (v_m.conta_id, 'membro', jsonb_build_object('membro_id', v_m.id, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
              jsonb_build_object('acao', 'saiu_excluiu_a_conta', 'w2l', true, 'membro_id', v_m.id, 'user_id', p_uid, 'alunos_treino', v_treino,
                                 'alunos_nutricao', v_nutri, 'convites_de_aluno_revogados', v_revogados), p_uid);
      if v_m.dono_id is not null and v_m.dono_id <> p_uid then
        insert into staging.avisos (destino_user_id, tipo, titulo, link)
        values (v_m.dono_id, 'geral', left(coalesce(v_nome, 'Um profissional') || ' excluiu a conta e saiu da equipe'
                  || case when v_treino + v_nutri > 0 then ' · ' || (v_treino + v_nutri) || ' aluno(s) sem responsável' else '' end, 160),
                '/painel/alunos');
      end if;
    end if;
    v_equipes := v_equipes || jsonb_build_object('conta_id', v_m.conta_id, 'conta_nome', v_m.conta_nome,
      'dono_nome', staging.nome_da_pessoa(v_m.dono_id), 'papeis', to_jsonb(v_m.papeis), 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri);
  end loop;
  select count(*) into v_ex_equipes from staging.conta_membros m
   where m.user_id = p_uid and m.status = 'removido' and not (m.conta_id = any(v_contas_dono)) and m.removido_motivo is null;

  v_perfil := case when jsonb_array_length(v_dono) > 0 then 'dono'
                   when jsonb_array_length(v_equipes) > 0 then 'membro'
                   else 'ex_profissional' end;

  -- ---------- a pessoa (o login sai pela borda, por soft delete) ----------
  if not v_simular then
    -- o perfil: anônimo aqui e no ESPELHO (o gatilho handle_new_user cria o perfil nos 2 schemas). Fica o nome e o CRN/CREF só onde
    -- ele assina algo (w2l_limpar_perfil). No staging só conta de teste chega aqui (a borda recusa conta real) e, mesmo assim, o
    -- espelho em public só é limpo com e-mail de teste
    v_perfis := jsonb_build_array(staging.w2l_limpar_perfil(p_uid, 'staging'));
    if 'staging' = 'public' then
      v_perfis := v_perfis || staging.w2l_limpar_perfil(p_uid, 'staging');
    elsif staging.email_de_teste(v_email_login) then
      v_perfis := v_perfis || staging.w2l_limpar_perfil(p_uid, 'public');
    end if;
    delete from staging.avisos where destino_user_id = p_uid;
    perform staging.wa_dados_do_aluno(p_uid, true);  -- W-A: as rotinas e a dieta livre dele (o login sai por soft delete: o cascade não vem)
    delete from staging.push_aparelhos where user_id = p_uid;
    update staging.whatsapp_instancias
       set status = 'desconectado', qr_code = null, numero_conectado = null, erro = 'conta excluída', updated_at = now()
     where nutricionista_id = p_uid and status <> 'desconectado';
    -- os gatilhos do espelho enfileiraram esta pessoa, mas o login vai sair: o Treino dela é tratado pela borda (delete-my-account).
    -- Os alunos e a equipe seguem na fila (a borda dispara o espelho logo depois).
    delete from staging.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object(
    'ok', true, 'simulacao', v_simular, 'perfil', v_perfil, 'nome', v_nome,
    'contas_dono', v_dono, 'equipes', v_equipes, 'ex_equipes', v_ex_equipes, 'sem_conta', v_sem_conta,
    'aluno', v_aluno, 'arquivos', v_arquivos, 'perfis', v_perfis);
end;
$function$$wa_corpo$;
  end if;
end
$wa_lgpd$;
-- <<< LGPD por schema

-- ============================================================================================================
-- 8. Conferência da LGPD do schema (a exportar com 'aceites' + as tabelas novas; no staging, as 2 exclusões com diario-staging)
-- ============================================================================================================
do $wa$
declare
  v_f text;
  r record;
begin
  -- a exportar: o corpo vivo (com 'aceites', hml12) + as tabelas novas; só o servidor
  select p.oid, p.prosrc into r from pg_catalog.pg_proc p where p.oid = '{schema}.exportar_dados_aluno(uuid)'::regprocedure;
  if position('''aceites'', v_aceites' in r.prosrc) = 0 or position('''rotinas_historico''' in r.prosrc) = 0
     or position('''aluno_dia_itens''' in r.prosrc) = 0 or position('''aluno_acessos''' in r.prosrc) = 0
     or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
    raise exception 'wa3: {schema}.exportar_dados_aluno fora do esperado (aceites + W-A, só o servidor)';
  end if;
  -- as 2 exclusões do STAGING: o bucket diario-staging (hml02b) + a W-A; só o servidor
  if '{schema}' = 'staging' then
    foreach v_f in array array['staging.excluir_dados_aluno(uuid, boolean)', 'staging.excluir_conta_profissional(uuid, boolean)'] loop
      select p.oid, p.prosrc into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
      if position('''diario-staging''' in r.prosrc) = 0 or position('''bucket'', ''diario'',' in r.prosrc) > 0
         or position('staging.wa_dados_do_aluno(p_uid, true)' in r.prosrc) = 0 or position('''rotinas_e_dieta''' in r.prosrc) = 0
         or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
         or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
        raise exception 'wa3: % fora do esperado (diario-staging + W-A, só o servidor)', v_f;
      end if;
    end loop;
  end if;
end
$wa$;

-- @@ compartilhado
-- PRODUÇÃO (roda 1x, DEPOIS do --so public): as 2 exclusões do PUBLIC a partir do corpo VIVO (gerado — Task 6 do plano)
-- >>> LGPD compartilhado
-- gerado por gerar_lgpd_wa3.py a partir do corpo VIVO (12/10/2026, md5 conferido) — não editar à mão
-- as 2 exclusões do PUBLIC (o corpo vivo da w07 e da w2l, com o bucket diario)
CREATE OR REPLACE FUNCTION public.excluir_dados_aluno(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff text;
  v_ids uuid[];
  v_arquivos jsonb;
  v_apaga jsonb;
  v_mantem jsonb;
  v_whats integer;
begin
  if p_uid is null then
    raise exception 'excluir_dados_aluno: p_uid obrigatório';
  end if;
  -- quem é profissional não exclui pelo app do aluno (a conta dele sustenta alunos e equipe — nunca deixar conta órfã)
  select case
      when exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin')) then 'master'
      when exists (select 1 from public.profiles p where p.id = p_uid and p.role in ('master', 'nutricionista')) then 'perfil_profissional'
      when exists (select 1 from public.contas c where c.dono_id = p_uid) then 'dono'
      when exists (select 1 from public.conta_membros m where m.user_id = p_uid and m.status <> 'removido') then 'membro'
    end into v_staff;
  if v_staff is not null then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', v_staff);
  end if;

  -- TODAS as matrículas do login (inclusive as da lixeira): o login some, nenhuma pode ficar apontando para ele
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from public.pacientes p where p.user_id = p_uid;

  if exists (select 1 from public.aluno_assinaturas a where a.paciente_id = any(v_ids) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
    from public.diario_alimentar d where d.paciente_id = any(v_ids) and nullif(d.path, '') is not null;
  select count(*) into v_whats from public.mensagens_whatsapp m where m.paciente_id = any(v_ids) and m.status = 'pendente';

  v_apaga := jsonb_build_object(
    'diario_alimentar', (select count(*) from public.diario_alimentar d where d.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select count(*) from public.refeicoes_concluidas r where r.paciente_id = any(v_ids)),
    'metas_concluidas', (select count(*) from public.metas_concluidas r where r.paciente_id = any(v_ids)),
    'avisos', (select count(*) from public.avisos a where a.destino_user_id = p_uid),
    'perfil', (select count(*) from public.profiles p where p.id = p_uid),
    'whatsapp_pendentes_cancelados', v_whats,
    'rotinas_e_dieta', public.wa_dados_do_aluno(p_uid, false));  -- W-A
  v_mantem := jsonb_build_object(
    'matriculas', coalesce(array_length(v_ids, 1), 0),
    'agendamentos', (select count(*) from public.agendamentos a where a.paciente_id = any(v_ids)),
    'cobrancas', (select count(*) from public.cobrancas c where c.paciente_id = any(v_ids)),
    'recibos', (select count(*) from public.recibos r where r.paciente_id = any(v_ids)),
    'antropometrias', (select count(*) from public.antropometrias a where a.paciente_id = any(v_ids)),
    'planos_alimentares', (select count(*) from public.planos_alimentares a where a.paciente_id = any(v_ids)),
    'prontuario', (select count(*) from public.registros_prontuario a where a.paciente_id = any(v_ids)));

  if not coalesce(p_simular, true) then
    delete from public.diario_alimentar where paciente_id = any(v_ids);
    delete from public.refeicoes_concluidas where paciente_id = any(v_ids);
    delete from public.metas_concluidas where paciente_id = any(v_ids);
    perform public.wa_dados_do_aluno(p_uid, true);  -- W-A: rotinas, alimentos, receitas e o dia livre (antes do login sair)
    update public.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
     where paciente_id = any(v_ids) and status = 'pendente';
    update public.pacientes
       set ativo = false,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = any(v_ids);
    -- o gatilho do espelho enfileirou esta pessoa (ativo mudou), mas o login vai sumir: o Treino já foi tratado pela borda
    delete from public.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'matriculas', to_jsonb(v_ids),
    'apaga', v_apaga, 'mantem', v_mantem, 'arquivos', v_arquivos);
end;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_conta_profissional(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_simular boolean := coalesce(p_simular, true);
  v_contas_dono uuid[];
  v_c record;
  v_m record;
  v_nome text;
  v_perfil text;
  v_ids_aluno uuid[];
  v_aluno jsonb := null;
  v_arquivos jsonb := '[]'::jsonb;
  v_whats integer := 0;
  v_dono jsonb := '[]'::jsonb;
  v_equipes jsonb := '[]'::jsonb;
  v_ex_equipes integer := 0;
  v_sem_conta jsonb := null;
  v_eu_nutri boolean;
  v_alunos jsonb;
  v_resumo_alunos jsonb;
  v_membros jsonb;
  v_cobrancas jsonb;
  v_pront jsonb;
  v_convites integer;
  v_lixeira integer;
  v_removidos integer;
  v_revogados integer;
  v_chaves integer;
  v_whats_conta integer;
  v_treino integer;
  v_nutri integer;
  v_feito jsonb;
  v_email_login text;
  v_perfis jsonb := '[]'::jsonb;
begin
  if p_uid is null then
    raise exception 'excluir_conta_profissional: p_uid obrigatório';
  end if;

  -- o master nunca exclui por aqui (a conta do app — origem 'app' — é dele e nunca é afetada)
  if exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin'))
     or exists (select 1 from public.profiles p where p.id = p_uid and p.role = 'master') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
  end if;

  -- contas de que é dono: a linha da conta (dono_id — continua apontando para ele depois de excluir: o pedido de novo acha) ou o
  -- papel 'dono' numa equipe ainda ativa
  select coalesce(array_agg(distinct c.id), array[]::uuid[]) into v_contas_dono
    from public.contas c
   where c.dono_id = p_uid
      or exists (select 1 from public.conta_membros m
                  where m.conta_id = c.id and m.user_id = p_uid and m.status <> 'removido' and 'dono' = any(m.papeis));
  if exists (select 1 from public.contas c where c.id = any(v_contas_dono) and c.origem = 'app') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'conta_do_app');
  end if;
  if exists (select 1 from public.contas c where c.id = any(v_contas_dono) and c.cobranca_legada) then
    return jsonb_build_object('ok', false, 'erro', 'conta_legada');
  end if;

  -- é (ou já foi) profissional? Sem conta, sem equipe (nem passada) e sem o perfil de nutricionista do site antigo = só aluno: o
  -- caminho é o de sempre (excluir_dados_aluno — a borda sem o campo novo)
  if coalesce(array_length(v_contas_dono, 1), 0) = 0
     and not exists (select 1 from public.conta_membros m where m.user_id = p_uid)
     and not exists (select 1 from public.profiles p where p.id = p_uid and p.role = 'nutricionista') then
    return jsonb_build_object('ok', false, 'erro', 'nao_profissional');
  end if;

  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
         lower(u.email)
    into v_nome, v_email_login from auth.users u left join public.profiles pr on pr.id = u.id where u.id = p_uid;

  -- ---------- a parte de ALUNO (quem também é aluno em alguma conta — a mesma lista da excluir_dados_aluno, W7) ----------
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids_aluno from public.pacientes p where p.user_id = p_uid;
  if exists (select 1 from public.aluno_assinaturas a where a.paciente_id = any(v_ids_aluno) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;
  -- toda recusa vem ANTES de mudar qualquer coisa: a cobrança automática das contas dele (plano e alunos → ele) a borda cancela no
  -- Mercado Pago antes de pedir o "excluir"; sobrou alguma viva (o cancelamento falhou ou nasceu outra no meio) → nada muda
  if not v_simular and (
       exists (select 1 from public.conta_assinaturas a where a.conta_id = any(v_contas_dono) and a.status in ('authorized', 'pending', 'paused'))
    or exists (select 1 from public.aluno_assinaturas a
                where a.status in ('authorized', 'pending', 'paused')
                  and (a.conta_id = any(v_contas_dono)
                       or exists (select 1 from public.pacientes p where p.id = a.paciente_id and p.conta_id = any(v_contas_dono))))) then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_ativa');
  end if;
  if coalesce(array_length(v_ids_aluno, 1), 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
      from public.diario_alimentar d where d.paciente_id = any(v_ids_aluno) and nullif(d.path, '') is not null;
    select count(*) into v_whats from public.mensagens_whatsapp m where m.paciente_id = any(v_ids_aluno) and m.status = 'pendente';
    v_aluno := jsonb_build_object(
      'matriculas', coalesce(array_length(v_ids_aluno, 1), 0),
      'contas', (select coalesce(jsonb_agg(distinct c.nome), '[]'::jsonb) from public.pacientes p join public.contas c on c.id = p.conta_id
                  where p.id = any(v_ids_aluno) and c.origem <> 'app' and not (c.id = any(v_contas_dono))),
      'apaga', jsonb_build_object(
        'diario_alimentar', (select count(*) from public.diario_alimentar d where d.paciente_id = any(v_ids_aluno)),
        'refeicoes_concluidas', (select count(*) from public.refeicoes_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'metas_concluidas', (select count(*) from public.metas_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'whatsapp_pendentes_cancelados', v_whats,
        'rotinas_e_dieta', public.wa_dados_do_aluno(p_uid, false)),  -- W-A
      'mantem', jsonb_build_object(
        'agendamentos', (select count(*) from public.agendamentos a where a.paciente_id = any(v_ids_aluno)),
        'cobrancas', (select count(*) from public.cobrancas c where c.paciente_id = any(v_ids_aluno)),
        'recibos', (select count(*) from public.recibos r where r.paciente_id = any(v_ids_aluno)),
        'antropometrias', (select count(*) from public.antropometrias a where a.paciente_id = any(v_ids_aluno)),
        'planos_alimentares', (select count(*) from public.planos_alimentares a where a.paciente_id = any(v_ids_aluno)),
        'prontuario', (select count(*) from public.registros_prontuario a where a.paciente_id = any(v_ids_aluno))));
    if not v_simular then
      delete from public.diario_alimentar where paciente_id = any(v_ids_aluno);
      delete from public.refeicoes_concluidas where paciente_id = any(v_ids_aluno);
      delete from public.metas_concluidas where paciente_id = any(v_ids_aluno);
      update public.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
       where paciente_id = any(v_ids_aluno) and status = 'pendente';
      -- o login sai por soft delete (a linha do Auth fica): a matrícula fica desligada dele aqui, como o "set null" faria
      update public.pacientes
         set ativo = false, user_id = null,
             config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
       where id = any(v_ids_aluno);
    end if;
  end if;

  -- ---------- DONO: cada conta ----------
  for v_c in select c.* from public.contas c where c.id = any(v_contas_dono) order by c.criado_em loop
    v_eu_nutri := 'nutricao' = any(public.modulos_do_plano(v_c.plano))
      and exists (select 1 from public.conta_membros m where m.conta_id = v_c.id and m.user_id = p_uid and m.status = 'ativo'
                    and 'nutricionista' = any(m.papeis));
    -- os alunos (fora da lixeira) e para onde vão — a mesma regra do gatilho pacientes_app_assumir (W7b)
    select jsonb_build_object(
             'total', count(*),
             'para_o_app', count(*) filter (where x.destino = 'app'),
             'guardados', count(*) filter (where x.destino <> 'app'),
             'lista', coalesce((jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'destino', x.destino) order by x.nome)
                                 filter (where x.ordem <= 100)), '[]'::jsonb))
      into v_resumo_alunos
      from (select p.id, p.nome, row_number() over (order by p.nome) as ordem,
                   case when p.user_id is not null and p.user_id <> p_uid and p.ativo and v_c.origem in ('nova', 'legado_calc')
                          and not exists (select 1 from public.pacientes o where o.user_id = p.user_id and o.conta_id is distinct from v_c.id
                                            and o.deleted_at is null and o.ativo)
                          and not exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.role = 'master')
                        then 'app' else 'guardado' end as destino
              from public.pacientes p where p.conta_id = v_c.id and p.deleted_at is null) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', coalesce(public.nome_da_pessoa(m.user_id), m.email_convite), 'email', coalesce(u.email, m.email_convite),
             'papeis', to_jsonb(m.papeis), 'status', m.status) order by m.status, coalesce(public.nome_da_pessoa(m.user_id), m.email_convite)), '[]'::jsonb)
      into v_membros
      from public.conta_membros m left join auth.users u on u.id = m.user_id
     where m.conta_id = v_c.id and m.status in ('ativo', 'convidado') and m.user_id is distinct from p_uid;
    select count(*) into v_convites from public.convites cv where cv.conta_id = v_c.id and cv.status = 'pendente';
    v_cobrancas := jsonb_build_object(
      'plano', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mp_preapproval_id', a.mp_preapproval_id, 'status', a.status,
                                                              'simulada', coalesce(a.payload ->> 'simulada', '') = 'true')), '[]'::jsonb)
                  from public.conta_assinaturas a where a.conta_id = v_c.id and a.status in ('authorized', 'pending', 'paused')),
      'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'paciente_id', a.paciente_id, 'mp_preapproval_id', a.mp_preapproval_id,
                                                               'status', a.status)), '[]'::jsonb)
                   from public.aluno_assinaturas a
                  where a.status in ('authorized', 'pending', 'paused')
                    and (a.conta_id = v_c.id or exists (select 1 from public.pacientes p where p.id = a.paciente_id and p.conta_id = v_c.id))));
    -- os prontuários (todas as matrículas da conta, inclusive as da lixeira): o que o dono vê e o que é "Só nutricionistas"
    select coalesce(jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', v_c.id, 'nome', p.nome, 'registros', x.total,
                                                 'restritos', x.restritos) order by p.nome), '[]'::jsonb)
      into v_pront
      from public.pacientes p
      join lateral (select count(*) as total,
                           count(*) filter (where r.visibilidade = 'nutricionistas' and not v_eu_nutri) as restritos
                      from public.registros_prontuario r where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
     where p.conta_id = v_c.id;

    v_feito := null;
    if not v_simular then
      -- a) as matrículas para a lixeira, como no aluno_remover: o gatilho pacientes_app_assumir (W7b) leva quem tem login para o app
      update public.pacientes set deleted_at = now() where conta_id = v_c.id and deleted_at is null;
      get diagnostics v_lixeira = row_count;
      -- b) a equipe perde o acesso (sou_membro na hora; o Treino pelo espelho) e fica sabendo pelo sino, como no remover_membro
      select count(*) into v_removidos from public.conta_membros m
       where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is distinct from p_uid;
      insert into public.avisos (destino_user_id, tipo, titulo, link)
      select m.user_id, 'membro_removido', left('Você não faz mais parte da equipe de ' || v_c.nome || ' (a conta foi encerrada)', 160), null
        from public.conta_membros m where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is not null and m.user_id <> p_uid;
      update public.conta_membros
         set status = 'removido', removido_em = now(),
             removido_motivo = case when user_id = p_uid then 'conta_excluida' else removido_motivo end
       where conta_id = v_c.id and status <> 'removido';
      -- c) convites (aluno e membro) que ninguém aceitou não levam mais ninguém para a conta
      update public.convites set status = 'revogado' where conta_id = v_c.id and status = 'pendente';
      get diagnostics v_revogados = row_count;
      -- d) ninguém paga mais por Pix a uma conta encerrada; mensagens automáticas pendentes saem da fila
      update public.recebimento_chaves set ativa = false, atualizado_em = now() where conta_id = v_c.id and ativa;
      get diagnostics v_chaves = row_count;
      update public.mensagens_whatsapp set status = 'cancelada', erro = 'o profissional excluiu a conta', updated_at = now()
       where status = 'pendente' and (conta_id = v_c.id or nutricionista_id = p_uid);
      get diagnostics v_whats_conta = row_count;
      -- e) a conta fica (as matrículas da lixeira guardam o histórico), cancelada
      update public.contas set situacao = 'cancelada' where id = v_c.id and situacao <> 'cancelada';
      v_feito := jsonb_build_object('alunos_na_lixeira', v_lixeira, 'membros_removidos', v_removidos, 'convites_revogados', v_revogados,
                                    'chaves_pix_desligadas', v_chaves, 'whatsapp_cancelados', v_whats_conta);
      if v_c.situacao <> 'cancelada' or v_lixeira > 0 or v_removidos > 0 or v_revogados > 0 or v_chaves > 0 or v_whats_conta > 0 then
        insert into public.conta_eventos (conta_id, tipo, antes, depois, por)
        values (v_c.id, 'situacao', jsonb_build_object('situacao', v_c.situacao),
                jsonb_build_object('situacao', 'cancelada', 'acao', 'conta_excluida_pelo_dono', 'w2l', true,
                                   'alunos_para_o_app', v_resumo_alunos -> 'para_o_app') || v_feito, p_uid);
      end if;
    end if;

    v_dono := v_dono || jsonb_build_object(
      'id', v_c.id, 'nome', v_c.nome, 'origem', v_c.origem, 'plano', v_c.plano, 'situacao', v_c.situacao, 'eu_nutri', v_eu_nutri,
      'alunos', v_resumo_alunos, 'membros', v_membros, 'convites_pendentes', v_convites, 'cobrancas', v_cobrancas, 'prontuarios', v_pront,
      'feito', v_feito);
  end loop;

  -- ---------- pacientes sem conta do site antigo do Nutri (os da própria nutricionista — regra de hoje: nutricionista_id) ----------
  if exists (select 1 from public.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid) then
    select jsonb_build_object(
             'alunos', (select count(*) from public.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid and p.deleted_at is null),
             'prontuarios', coalesce((
               select jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', null, 'nome', p.nome, 'registros', x.total, 'restritos', 0)
                                order by p.nome)
                 from public.pacientes p
                 join lateral (select count(*) as total from public.registros_prontuario r
                                where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
                where p.conta_id is null and p.nutricionista_id = p_uid), '[]'::jsonb))
      into v_sem_conta;
    if not v_simular then
      update public.pacientes set deleted_at = now() where conta_id is null and nutricionista_id = p_uid and deleted_at is null;
    end if;
  end if;

  -- ---------- MEMBRO (não dono): sai da equipe como no remover_membro, sem novo responsável ----------
  for v_m in select m.*, c.nome as conta_nome, c.dono_id
               from public.conta_membros m join public.contas c on c.id = m.conta_id
              where m.user_id = p_uid and m.status <> 'removido' and not (m.conta_id = any(v_contas_dono))
              order by m.criado_em loop
    select count(*) filter (where p.personal_id = p_uid), count(*) filter (where p.nutricionista_id = p_uid)
      into v_treino, v_nutri
      from public.pacientes p where p.conta_id = v_m.conta_id and p.deleted_at is null;
    if not v_simular then
      update public.pacientes set personal_id = null where conta_id = v_m.conta_id and personal_id = p_uid;
      update public.pacientes set nutricionista_id = null where conta_id = v_m.conta_id and nutricionista_id = p_uid;
      update public.convites set status = 'revogado'
       where conta_id = v_m.conta_id and tipo = 'aluno' and status = 'pendente' and responsavel_id = p_uid;
      get diagnostics v_revogados = row_count;
      update public.conta_membros set status = 'removido', removido_em = now(), removido_motivo = 'conta_excluida' where id = v_m.id;
      insert into public.conta_eventos (conta_id, tipo, antes, depois, por)
      values (v_m.conta_id, 'membro', jsonb_build_object('membro_id', v_m.id, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
              jsonb_build_object('acao', 'saiu_excluiu_a_conta', 'w2l', true, 'membro_id', v_m.id, 'user_id', p_uid, 'alunos_treino', v_treino,
                                 'alunos_nutricao', v_nutri, 'convites_de_aluno_revogados', v_revogados), p_uid);
      if v_m.dono_id is not null and v_m.dono_id <> p_uid then
        insert into public.avisos (destino_user_id, tipo, titulo, link)
        values (v_m.dono_id, 'geral', left(coalesce(v_nome, 'Um profissional') || ' excluiu a conta e saiu da equipe'
                  || case when v_treino + v_nutri > 0 then ' · ' || (v_treino + v_nutri) || ' aluno(s) sem responsável' else '' end, 160),
                '/painel/alunos');
      end if;
    end if;
    v_equipes := v_equipes || jsonb_build_object('conta_id', v_m.conta_id, 'conta_nome', v_m.conta_nome,
      'dono_nome', public.nome_da_pessoa(v_m.dono_id), 'papeis', to_jsonb(v_m.papeis), 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri);
  end loop;
  select count(*) into v_ex_equipes from public.conta_membros m
   where m.user_id = p_uid and m.status = 'removido' and not (m.conta_id = any(v_contas_dono)) and m.removido_motivo is null;

  v_perfil := case when jsonb_array_length(v_dono) > 0 then 'dono'
                   when jsonb_array_length(v_equipes) > 0 then 'membro'
                   else 'ex_profissional' end;

  -- ---------- a pessoa (o login sai pela borda, por soft delete) ----------
  if not v_simular then
    -- o perfil: anônimo aqui e no ESPELHO (o gatilho handle_new_user cria o perfil nos 2 schemas). Fica o nome e o CRN/CREF só onde
    -- ele assina algo (w2l_limpar_perfil). No staging só conta de teste chega aqui (a borda recusa conta real) e, mesmo assim, o
    -- espelho em public só é limpo com e-mail de teste
    v_perfis := jsonb_build_array(public.w2l_limpar_perfil(p_uid, 'public'));
    if 'public' = 'public' then
      v_perfis := v_perfis || public.w2l_limpar_perfil(p_uid, 'staging');
    elsif public.email_de_teste(v_email_login) then
      v_perfis := v_perfis || public.w2l_limpar_perfil(p_uid, 'public');
    end if;
    delete from public.avisos where destino_user_id = p_uid;
    perform public.wa_dados_do_aluno(p_uid, true);  -- W-A: as rotinas e a dieta livre dele (o login sai por soft delete: o cascade não vem)
    delete from public.push_aparelhos where user_id = p_uid;
    update public.whatsapp_instancias
       set status = 'desconectado', qr_code = null, numero_conectado = null, erro = 'conta excluída', updated_at = now()
     where nutricionista_id = p_uid and status <> 'desconectado';
    -- os gatilhos do espelho enfileiraram esta pessoa, mas o login vai sair: o Treino dela é tratado pela borda (delete-my-account).
    -- Os alunos e a equipe seguem na fila (a borda dispara o espelho logo depois).
    delete from public.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object(
    'ok', true, 'simulacao', v_simular, 'perfil', v_perfil, 'nome', v_nome,
    'contas_dono', v_dono, 'equipes', v_equipes, 'ex_equipes', v_ex_equipes, 'sem_conta', v_sem_conta,
    'aluno', v_aluno, 'arquivos', v_arquivos, 'perfis', v_perfis);
end;
$function$;

-- <<< LGPD compartilhado

do $wa$
declare
  v_f text;
  r record;
begin
  foreach v_f in array array['public.excluir_dados_aluno(uuid, boolean)', 'public.excluir_conta_profissional(uuid, boolean)'] loop
    select p.oid, p.prosrc into r from pg_catalog.pg_proc p where p.oid = to_regprocedure(v_f);
    if position('''bucket'', ''diario'', ''path''' in r.prosrc) = 0 or position('diario-staging' in r.prosrc) > 0
       or position('public.wa_dados_do_aluno(p_uid, true)' in r.prosrc) = 0 or position('''rotinas_e_dieta''' in r.prosrc) = 0
       or to_regprocedure('public.wa_dados_do_aluno(uuid, boolean)') is null
       or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'wa3: % fora do esperado (bucket diario + W-A, só o servidor; o --so public tem de vir antes)', v_f;
    end if;
  end loop;
end
$wa$;
