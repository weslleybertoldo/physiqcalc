-- PhysiqNutri — W24 Avaliação integrada. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919230000_avaliacoes_integradas.sql`
-- (roda em public E staging, trocando {schema}). Sem bloco compartilhado.
-- Depende da base (eh_master, set_updated_at), de pacientes (W1) e do trigger genérico tocar_paciente() (W5).

-- Avaliação integrada = documento DATADO da nutricionista que CONGELA, na hora da geração, a última anamnese (W5), a última
-- antropometria (W6), os exames da data mais recente (W18) e a última aplicação de cada questionário (W19), com alertas
-- automáticos e um PARECER editável. As seções donas continuam sendo a fonte da verdade e podem mudar depois sem alterar o
-- documento — 'Regerar síntese' é uma ação explícita. Cálculo energético e plano alimentar NÃO entram (são do Acompanhamento, W23).
--   `fontes`  = ids e datas do que foi usado: {anamnese_id, anamnese_data, antropometria_id, antropometria_data, exames_data,
--               exames_n, questionarios: [{id, titulo, data}]}
--   `sintese` = os 4 blocos já resolvidos: {anamnese: {titulo, data, itens: [{pergunta, resposta}], texto_livre},
--               antropometria: {data, peso, altura, imc, classificacao, percentual_gordura, massa_gorda, massa_magra, rcq, protocolo},
--               exames: {data, itens: [{exame, valor, unidade, referencia, situacao}]},
--               questionarios: [{id, titulo, data, pontuacao, maximo, faixa, nivel}]}
--   `texto`   = parecer em markdown simples (blocos da W10), até 8.000 caracteres.
-- Exclusão SOFT (Lixeira, W32).
create table if not exists {schema}.avaliacoes_integradas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data timestamptz not null default now(),             -- data/hora da avaliação (o app manda agora)
  titulo text not null,
  fontes jsonb not null default '{}'::jsonb,           -- ids/datas das fontes usadas (congeladas)
  sintese jsonb not null default '{}'::jsonb,          -- os 4 blocos resolvidos (congelados)
  texto text,                                          -- parecer da nutricionista (markdown simples)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                              -- lixeira (W32)
  constraint avaliacoes_integradas_titulo_chk check (length(btrim(titulo)) > 0),
  constraint avaliacoes_integradas_texto_chk check (texto is null or length(texto) <= 8000),
  constraint avaliacoes_integradas_fontes_obj check (jsonb_typeof(fontes) = 'object'),
  constraint avaliacoes_integradas_sintese_obj check (jsonb_typeof(sintese) = 'object')
);
create index if not exists avaliacoes_integradas_paciente_data_idx on {schema}.avaliacoes_integradas (paciente_id, data desc);
create index if not exists avaliacoes_integradas_nutri_idx on {schema}.avaliacoes_integradas (nutricionista_id);
grant all on {schema}.avaliacoes_integradas to anon, authenticated, service_role;
alter table {schema}.avaliacoes_integradas enable row level security;

drop policy if exists "avaliacoes_integradas: ler as proprias ou master" on {schema}.avaliacoes_integradas;
create policy "avaliacoes_integradas: ler as proprias ou master" on {schema}.avaliacoes_integradas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- criar exige enxergar o paciente (RLS de `pacientes`): fecha a brecha de pendurar avaliação em paciente de outra nutricionista
drop policy if exists "avaliacoes_integradas: criar as proprias ou master" on {schema}.avaliacoes_integradas;
create policy "avaliacoes_integradas: criar as proprias ou master" on {schema}.avaliacoes_integradas
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "avaliacoes_integradas: editar as proprias ou master" on {schema}.avaliacoes_integradas;
create policy "avaliacoes_integradas: editar as proprias ou master" on {schema}.avaliacoes_integradas
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "avaliacoes_integradas: apagar as proprias ou master" on {schema}.avaliacoes_integradas;
create policy "avaliacoes_integradas: apagar as proprias ou master" on {schema}.avaliacoes_integradas
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_avaliacoes_integradas_updated_at on {schema}.avaliacoes_integradas;
create trigger trg_avaliacoes_integradas_updated_at before update on {schema}.avaliacoes_integradas
  for each row execute function {schema}.set_updated_at();

-- Avaliação nova/editada mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_avaliacoes_integradas_toca_paciente on {schema}.avaliacoes_integradas;
create trigger trg_avaliacoes_integradas_toca_paciente after insert or update on {schema}.avaliacoes_integradas
  for each row execute function {schema}.tocar_paciente();
