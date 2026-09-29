-- PhysiqNutri — W38 marca no alimento próprio + busca pela marca. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920110000_alimentos_marca.sql`
-- (roda em public E staging, trocando {schema}). Depende da W8 (alimentos, texto_busca).

-- Marca do alimento PRÓPRIO (ex.: "Italac"): a etiqueta da lista mostra a marca no lugar de "Meu alimento".
-- A TACO é a referência (Tabela Brasileira de Composição de Alimentos) e nunca tem marca.
alter table {schema}.alimentos add column if not exists marca text;
alter table {schema}.alimentos drop constraint if exists alimentos_marca_chk;
alter table {schema}.alimentos add constraint alimentos_marca_chk
  check (marca is null or (length(btrim(marca)) between 1 and 80 and fonte = 'proprio'));

-- A coluna gerada `busca` passa a incluir a marca (buscar "italac" acha o alimento). Expressão de coluna gerada não
-- se altera: derruba os índices, recria a coluna e os índices (mesma regra da W8 + a marca).
drop index if exists {schema}.alimentos_busca_trgm;
drop index if exists {schema}.alimentos_busca_idx;
alter table {schema}.alimentos drop column if exists busca;
alter table {schema}.alimentos add column busca text
  generated always as ({schema}.texto_busca(btrim(nome || ' ' || coalesce(marca, '')))) stored;
create index if not exists alimentos_busca_idx on {schema}.alimentos (busca);

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create extension if not exists pg_trgm with schema extensions;
    execute 'create index if not exists alimentos_busca_trgm on {schema}.alimentos using gin (busca extensions.gin_trgm_ops)';
  end if;
end
$$;
