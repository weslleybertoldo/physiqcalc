-- PhysiqNutri — W8 Meus alimentos. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919070000_alimentos.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at).

-- Texto de busca sem acento e sem caixa. Imutável (só lower + translate, sem depender da extensão unaccent) pra
-- poder virar coluna gerada; o app normaliza o termo digitado do mesmo jeito (alimentosUtil.normalizarBusca).
create or replace function {schema}.texto_busca(t text) returns text language sql immutable as $$
  select translate(lower(coalesce(t, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy');
$$;

-- Alimentos: base pública TACO (fonte = 'taco', sem dona — todo mundo lê, ninguém edita) e alimentos PRÓPRIOS da
-- nutricionista (fonte = 'proprio', nutricionista_id obrigatório). Valores nutricionais sempre POR 100 g do
-- alimento; `porcao_g` é só a porção de referência sugerida. Macros mais usados em colunas (busca/lista/plano);
-- os demais nutrientes em `nutrientes` jsonb ({colesterol_mg, calcio_mg, ferro_mg, …}) — chave ausente/null =
-- não determinado na fonte. `codigo` = identificador estável da fonte pública (ex.: 'taco:1') que torna o seed
-- idempotente (upsert); alimento próprio não tem código. Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.alimentos (
  id uuid primary key default gen_random_uuid(),
  fonte text not null default 'proprio',
  nutricionista_id uuid references auth.users(id) on delete cascade,
  codigo text,
  nome text not null,
  grupo text,
  porcao_g numeric(7,2) not null default 100,
  energia_kcal numeric(9,2),
  proteina_g numeric(9,2),
  carboidrato_g numeric(9,2),
  lipidio_g numeric(9,2),
  fibra_g numeric(9,2),
  sodio_mg numeric(9,2),
  nutrientes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint alimentos_fonte_chk check (fonte in ('taco', 'proprio')),
  constraint alimentos_dono_chk check ((fonte = 'taco' and nutricionista_id is null) or (fonte = 'proprio' and nutricionista_id is not null)),
  constraint alimentos_nome_chk check (length(btrim(nome)) > 0),
  constraint alimentos_porcao_chk check (porcao_g > 0 and porcao_g < 100000),
  constraint alimentos_nutrientes_obj check (jsonb_typeof(nutrientes) = 'object'),
  constraint alimentos_valores_chk check (
    (energia_kcal is null or energia_kcal >= 0) and (proteina_g is null or proteina_g >= 0) and (carboidrato_g is null or carboidrato_g >= 0)
    and (lipidio_g is null or lipidio_g >= 0) and (fibra_g is null or fibra_g >= 0) and (sodio_mg is null or sodio_mg >= 0)
  )
);
alter table {schema}.alimentos add column if not exists busca text
  generated always as ({schema}.texto_busca(nome)) stored;

create unique index if not exists alimentos_codigo_uq on {schema}.alimentos (codigo);           -- nulls distintos (próprios)
create index if not exists alimentos_nutri_fonte_idx on {schema}.alimentos (nutricionista_id, fonte);
create index if not exists alimentos_fonte_grupo_idx on {schema}.alimentos (fonte, grupo);
create index if not exists alimentos_busca_idx on {schema}.alimentos (busca);

-- Índice trigram pra busca `ilike '%termo%'` quando a extensão existir (Supabase tem); senão o ilike simples serve.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create extension if not exists pg_trgm with schema extensions;
    execute 'create index if not exists alimentos_busca_trgm on {schema}.alimentos using gin (busca extensions.gin_trgm_ops)';
  end if;
end
$$;

grant all on {schema}.alimentos to anon, authenticated, service_role;
alter table {schema}.alimentos enable row level security;

-- RLS: TACO é de todo mundo (só leitura); alimento próprio só da dona; master vê e mexe em tudo.
drop policy if exists "alimentos: ler taco, os proprios ou master" on {schema}.alimentos;
create policy "alimentos: ler taco, os proprios ou master" on {schema}.alimentos
  for select to authenticated using (fonte = 'taco' or nutricionista_id = auth.uid() or {schema}.eh_master());

drop policy if exists "alimentos: criar os proprios ou master" on {schema}.alimentos;
create policy "alimentos: criar os proprios ou master" on {schema}.alimentos
  for insert to authenticated with check ((fonte = 'proprio' and nutricionista_id = auth.uid()) or {schema}.eh_master());

drop policy if exists "alimentos: editar os proprios ou master" on {schema}.alimentos;
create policy "alimentos: editar os proprios ou master" on {schema}.alimentos
  for update to authenticated
  using ((fonte = 'proprio' and nutricionista_id = auth.uid()) or {schema}.eh_master())
  with check ((fonte = 'proprio' and nutricionista_id = auth.uid()) or {schema}.eh_master());

drop policy if exists "alimentos: apagar os proprios ou master" on {schema}.alimentos;
create policy "alimentos: apagar os proprios ou master" on {schema}.alimentos
  for delete to authenticated using ((fonte = 'proprio' and nutricionista_id = auth.uid()) or {schema}.eh_master());

drop trigger if exists trg_alimentos_updated_at on {schema}.alimentos;
create trigger trg_alimentos_updated_at before update on {schema}.alimentos
  for each row execute function {schema}.set_updated_at();

-- Medidas caseiras do alimento ("1 colher de sopa cheia" = 25 g). Seguem o alimento: quem lê o alimento lê as
-- medidas; só a dona do alimento próprio (ou master) cria/edita/apaga.
create table if not exists {schema}.medidas_caseiras (
  id uuid primary key default gen_random_uuid(),
  alimento_id uuid not null references {schema}.alimentos(id) on delete cascade,
  descricao text not null,
  gramas numeric(7,2) not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  constraint medidas_caseiras_descricao_chk check (length(btrim(descricao)) > 0),
  constraint medidas_caseiras_gramas_chk check (gramas > 0 and gramas < 100000)
);
create index if not exists medidas_caseiras_alimento_idx on {schema}.medidas_caseiras (alimento_id, ordem);
grant all on {schema}.medidas_caseiras to anon, authenticated, service_role;
alter table {schema}.medidas_caseiras enable row level security;

drop policy if exists "medidas: ler as do alimento visivel" on {schema}.medidas_caseiras;
create policy "medidas: ler as do alimento visivel" on {schema}.medidas_caseiras
  for select to authenticated using (exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and (a.fonte = 'taco' or a.nutricionista_id = auth.uid() or {schema}.eh_master())
  ));

drop policy if exists "medidas: criar nos proprios ou master" on {schema}.medidas_caseiras;
create policy "medidas: criar nos proprios ou master" on {schema}.medidas_caseiras
  for insert to authenticated with check ({schema}.eh_master() or exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and a.fonte = 'proprio' and a.nutricionista_id = auth.uid()
  ));

drop policy if exists "medidas: editar nos proprios ou master" on {schema}.medidas_caseiras;
create policy "medidas: editar nos proprios ou master" on {schema}.medidas_caseiras
  for update to authenticated
  using ({schema}.eh_master() or exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and a.fonte = 'proprio' and a.nutricionista_id = auth.uid()
  ))
  with check ({schema}.eh_master() or exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and a.fonte = 'proprio' and a.nutricionista_id = auth.uid()
  ));

drop policy if exists "medidas: apagar nos proprios ou master" on {schema}.medidas_caseiras;
create policy "medidas: apagar nos proprios ou master" on {schema}.medidas_caseiras
  for delete to authenticated using ({schema}.eh_master() or exists (
    select 1 from {schema}.alimentos a where a.id = alimento_id and a.fonte = 'proprio' and a.nutricionista_id = auth.uid()
  ));

-- Grupos existentes (pro filtro da tela), respeitando a RLS de quem chama.
create or replace function {schema}.grupos_alimentos() returns table (grupo text, total bigint)
language sql stable security invoker as $$
  select a.grupo, count(*)::bigint from {schema}.alimentos a
  where a.deleted_at is null and a.grupo is not null
  group by a.grupo order by a.grupo;
$$;
grant execute on function {schema}.grupos_alimentos() to authenticated, service_role;
