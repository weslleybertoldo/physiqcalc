-- PhysiqNutri — W27 Fármaco-nutrientes. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920020000_farmaco_nutrientes.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1) e do trigger
-- genérico tocar_paciente() (W5). Sem bloco compartilhado: o seed da base do sistema roda por schema.
--
-- A referência só mostra o vazio ('Nenhuma análise fármaco-nutriente' / 'Registre os medicamentos em uso…'); a análise é NOSSA:
--   `interacoes_farmaco_nutriente` = BASE de interações fármaco × nutriente. As DO SISTEMA (nutricionista_id NULL, `codigo`
--                                    'sistema:*', texto próprio do PhysiqNutri) nascem aqui, são visíveis a todas e ninguém edita/
--                                    apaga (só duplica — a cópia é própria e editável). As PRÓPRIAS têm nutricionista_id.
--                                    O app casa o medicamento do paciente por NOME ou SINÔNIMO (sem acento/caixa).
--   `medicamentos_paciente`         = o que a nutricionista digitou pro paciente (nome, dose, posologia, início, ativo =
--                                    Suspender/Retomar). `interacao_id` só documenta a escolha no autocomplete — o cruzamento é
--                                    SEMPRE por nome/sinônimo normalizado.
--   `analises_farmaco`              = documento CONGELADO (como a W24): cópia dos medicamentos ATIVOS e das interações encontradas
--                                    na hora, em jsonb, + parecer em markdown simples (W10). Editar só mexe em título/parecer.
-- Exclusão SOFT nas três (deleted_at → Lixeira, W32).

-- ---- Base de interações ----
create table if not exists {schema}.interacoes_farmaco_nutriente (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid references auth.users(id) on delete cascade,   -- NULL = interação do sistema
  codigo text,                                                          -- 'sistema:<slug>' (só nas do sistema)
  medicamento text not null,                                            -- nome genérico ('Metformina')
  sinonimos text[] not null default '{}'::text[],                       -- marcas/nomes comuns ('Glifage', 'Glucoformin')
  classe text not null default '',
  nutriente text not null,
  efeito text not null,
  gravidade text not null default 'moderada',
  conduta text not null,
  fonte text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint interacoes_fn_medicamento_check check (char_length(medicamento) between 1 and 120),
  constraint interacoes_fn_nutriente_check check (char_length(nutriente) between 1 and 120),
  constraint interacoes_fn_efeito_check check (char_length(efeito) between 1 and 300),
  constraint interacoes_fn_conduta_check check (char_length(conduta) between 1 and 1000),
  constraint interacoes_fn_classe_check check (char_length(classe) <= 120),
  constraint interacoes_fn_fonte_check check (char_length(fonte) <= 300),
  constraint interacoes_fn_gravidade_check check (gravidade in ('baixa', 'moderada', 'alta'))
);
create unique index if not exists interacoes_fn_codigo_uidx on {schema}.interacoes_farmaco_nutriente (codigo) where codigo is not null;
create index if not exists interacoes_fn_nutri_idx on {schema}.interacoes_farmaco_nutriente (nutricionista_id);
create index if not exists interacoes_fn_medicamento_idx on {schema}.interacoes_farmaco_nutriente (medicamento);
grant all on {schema}.interacoes_farmaco_nutriente to anon, authenticated, service_role;
alter table {schema}.interacoes_farmaco_nutriente enable row level security;

drop policy if exists "interacoes_fn: ler do sistema, as proprias ou master" on {schema}.interacoes_farmaco_nutriente;
create policy "interacoes_fn: ler do sistema, as proprias ou master" on {schema}.interacoes_farmaco_nutriente
  for select to authenticated using (nutricionista_id is null or nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "interacoes_fn: criar as proprias ou master" on {schema}.interacoes_farmaco_nutriente;
create policy "interacoes_fn: criar as proprias ou master" on {schema}.interacoes_farmaco_nutriente
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "interacoes_fn: editar as proprias ou master" on {schema}.interacoes_farmaco_nutriente;
create policy "interacoes_fn: editar as proprias ou master" on {schema}.interacoes_farmaco_nutriente
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "interacoes_fn: apagar as proprias ou master" on {schema}.interacoes_farmaco_nutriente;
create policy "interacoes_fn: apagar as proprias ou master" on {schema}.interacoes_farmaco_nutriente
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_interacoes_fn_updated_at on {schema}.interacoes_farmaco_nutriente;
create trigger trg_interacoes_fn_updated_at before update on {schema}.interacoes_farmaco_nutriente
  for each row execute function {schema}.set_updated_at();

-- ---- Medicamentos em uso do paciente ----
create table if not exists {schema}.medicamentos_paciente (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  medicamento text not null,                                            -- o que ela digitou
  interacao_id uuid references {schema}.interacoes_farmaco_nutriente(id) on delete set null,   -- só documenta o autocomplete
  dose text not null default '',
  posologia text not null default '',
  inicio date,
  ativo boolean not null default true,                                  -- Suspender/Retomar (reversível)
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint medicamentos_paciente_medicamento_check check (char_length(medicamento) between 1 and 120),
  constraint medicamentos_paciente_dose_check check (char_length(dose) <= 300),
  constraint medicamentos_paciente_posologia_check check (char_length(posologia) <= 300),
  constraint medicamentos_paciente_observacao_check check (char_length(observacao) <= 300)
);
create index if not exists medicamentos_paciente_paciente_idx on {schema}.medicamentos_paciente (paciente_id, ativo desc, created_at);
create index if not exists medicamentos_paciente_nutri_idx on {schema}.medicamentos_paciente (nutricionista_id);
grant all on {schema}.medicamentos_paciente to anon, authenticated, service_role;
alter table {schema}.medicamentos_paciente enable row level security;

drop policy if exists "medicamentos_paciente: ler os proprios ou master" on {schema}.medicamentos_paciente;
create policy "medicamentos_paciente: ler os proprios ou master" on {schema}.medicamentos_paciente
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "medicamentos_paciente: criar os proprios ou master" on {schema}.medicamentos_paciente;
create policy "medicamentos_paciente: criar os proprios ou master" on {schema}.medicamentos_paciente
  for insert to authenticated with check (
    {schema}.eh_master()
    or (nutricionista_id = auth.uid() and exists (select 1 from {schema}.pacientes p where p.id = paciente_id))
  );
drop policy if exists "medicamentos_paciente: editar os proprios ou master" on {schema}.medicamentos_paciente;
create policy "medicamentos_paciente: editar os proprios ou master" on {schema}.medicamentos_paciente
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "medicamentos_paciente: apagar os proprios ou master" on {schema}.medicamentos_paciente;
create policy "medicamentos_paciente: apagar os proprios ou master" on {schema}.medicamentos_paciente
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_medicamentos_paciente_updated_at on {schema}.medicamentos_paciente;
create trigger trg_medicamentos_paciente_updated_at before update on {schema}.medicamentos_paciente
  for each row execute function {schema}.set_updated_at();
-- Medicamento criado/editado mexe em `pacientes.updated_at` (trigger genérico da W5).
drop trigger if exists trg_medicamentos_paciente_toca_paciente on {schema}.medicamentos_paciente;
create trigger trg_medicamentos_paciente_toca_paciente after insert or update on {schema}.medicamentos_paciente
  for each row execute function {schema}.tocar_paciente();

-- ---- Análises (documento congelado) ----
create table if not exists {schema}.analises_farmaco (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data timestamptz not null default now(),
  titulo text not null,
  medicamentos jsonb not null default '[]'::jsonb,   -- cópia dos ATIVOS na hora: [{medicamento, dose, posologia}]
  interacoes jsonb not null default '[]'::jsonb,     -- cópia das encontradas: [{id, medicamento, nutriente, efeito, gravidade, conduta, origem}]
  parecer text not null default '',                  -- markdown simples (W10)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint analises_farmaco_titulo_check check (char_length(titulo) between 1 and 160),
  constraint analises_farmaco_parecer_check check (char_length(parecer) <= 8000),
  constraint analises_farmaco_medicamentos_check check (jsonb_typeof(medicamentos) = 'array'),
  constraint analises_farmaco_interacoes_check check (jsonb_typeof(interacoes) = 'array')
);
create index if not exists analises_farmaco_paciente_data_idx on {schema}.analises_farmaco (paciente_id, data desc);
create index if not exists analises_farmaco_nutri_idx on {schema}.analises_farmaco (nutricionista_id);
grant all on {schema}.analises_farmaco to anon, authenticated, service_role;
alter table {schema}.analises_farmaco enable row level security;

drop policy if exists "analises_farmaco: ler as proprias ou master" on {schema}.analises_farmaco;
create policy "analises_farmaco: ler as proprias ou master" on {schema}.analises_farmaco
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "analises_farmaco: criar as proprias ou master" on {schema}.analises_farmaco;
create policy "analises_farmaco: criar as proprias ou master" on {schema}.analises_farmaco
  for insert to authenticated with check (
    {schema}.eh_master()
    or (nutricionista_id = auth.uid() and exists (select 1 from {schema}.pacientes p where p.id = paciente_id))
  );
drop policy if exists "analises_farmaco: editar as proprias ou master" on {schema}.analises_farmaco;
create policy "analises_farmaco: editar as proprias ou master" on {schema}.analises_farmaco
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "analises_farmaco: apagar as proprias ou master" on {schema}.analises_farmaco;
create policy "analises_farmaco: apagar as proprias ou master" on {schema}.analises_farmaco
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_analises_farmaco_updated_at on {schema}.analises_farmaco;
create trigger trg_analises_farmaco_updated_at before update on {schema}.analises_farmaco
  for each row execute function {schema}.set_updated_at();
drop trigger if exists trg_analises_farmaco_toca_paciente on {schema}.analises_farmaco;
create trigger trg_analises_farmaco_toca_paciente after insert or update on {schema}.analises_farmaco
  for each row execute function {schema}.tocar_paciente();

-- ---- SEED da base do sistema (texto próprio e curto; 1 linha por par medicamento × nutriente). Idempotente por `codigo`. ----
insert into {schema}.interacoes_farmaco_nutriente (codigo, medicamento, sinonimos, classe, nutriente, efeito, gravidade, conduta, fonte)
select v.codigo, v.medicamento, v.sinonimos, v.classe, v.nutriente, v.efeito, v.gravidade, v.conduta, 'bula/literatura de interações fármaco-nutriente'
from (values
  ('sistema:metformina-b12', 'Metformina', array['Glifage', 'Glucoformin']::text[], 'Antidiabético (biguanida)', 'Vitamina B12',
   'reduz a absorção intestinal de vitamina B12 no uso prolongado', 'moderada',
   'Acompanhar a B12 sérica a cada 1-2 anos; reforçar carnes, ovos e laticínios e suplementar quando estiver baixa.'),
  ('sistema:metformina-acido-folico', 'Metformina', array['Glifage', 'Glucoformin']::text[], 'Antidiabético (biguanida)', 'Ácido fólico',
   'pode reduzir levemente os níveis de folato', 'baixa',
   'Garantir folhas verde-escuras, leguminosas e grãos fortificados no dia a dia.'),
  ('sistema:omeprazol-b12', 'Omeprazol', array['Pantoprazol', 'Esomeprazol', 'Lansoprazol', 'IBP']::text[], 'Inibidor da bomba de prótons', 'Vitamina B12',
   'com menos ácido gástrico a B12 dos alimentos não é liberada', 'moderada',
   'Monitorar a B12 no uso acima de 1 ano; se precisar suplementar, a forma livre do suplemento não depende do ácido.'),
  ('sistema:omeprazol-magnesio', 'Omeprazol', array['Pantoprazol', 'Esomeprazol', 'Lansoprazol', 'IBP']::text[], 'Inibidor da bomba de prótons', 'Magnésio',
   'uso prolongado reduz a absorção de magnésio', 'moderada',
   'Acompanhar o magnésio sérico depois de 1 ano de uso; incluir sementes, castanhas, folhas e leguminosas.'),
  ('sistema:omeprazol-calcio', 'Omeprazol', array['Pantoprazol', 'Esomeprazol', 'Lansoprazol', 'IBP']::text[], 'Inibidor da bomba de prótons', 'Cálcio',
   'o carbonato de cálcio é mal absorvido sem ácido gástrico', 'baixa',
   'Se suplementar, preferir citrato de cálcio e tomar junto das refeições.'),
  ('sistema:omeprazol-ferro', 'Omeprazol', array['Pantoprazol', 'Esomeprazol', 'Lansoprazol', 'IBP']::text[], 'Inibidor da bomba de prótons', 'Ferro',
   'menor absorção do ferro não-heme', 'baixa',
   'Combinar as fontes de ferro com vitamina C na mesma refeição; acompanhar a ferritina se houver anemia.'),
  ('sistema:levotiroxina-calcio', 'Levotiroxina', array['Puran T4', 'Synthroid', 'Euthyrox']::text[], 'Hormônio tireoidiano', 'Cálcio e laticínios',
   'o cálcio se liga ao hormônio e reduz muito a absorção', 'alta',
   'Intervalo mínimo de 4 h entre o remédio e leite, queijo, iogurte ou suplemento de cálcio.'),
  ('sistema:levotiroxina-ferro', 'Levotiroxina', array['Puran T4', 'Synthroid', 'Euthyrox']::text[], 'Hormônio tireoidiano', 'Ferro',
   'os sais de ferro reduzem a absorção do hormônio', 'alta',
   'Tomar o suplemento de ferro pelo menos 4 h depois da levotiroxina.'),
  ('sistema:levotiroxina-soja-fibras', 'Levotiroxina', array['Puran T4', 'Synthroid', 'Euthyrox']::text[], 'Hormônio tireoidiano', 'Soja e fibras',
   'soja e fibras em excesso reduzem a absorção', 'moderada',
   'Manter o consumo constante e nunca tomar o remédio junto de soja, farelos ou suplemento de fibras.'),
  ('sistema:levotiroxina-cafe', 'Levotiroxina', array['Puran T4', 'Synthroid', 'Euthyrox']::text[], 'Hormônio tireoidiano', 'Café',
   'café logo depois da dose reduz a absorção', 'moderada',
   'Tomar em jejum só com água e esperar 30-60 min para o café e o café da manhã.'),
  ('sistema:varfarina-vitamina-k', 'Varfarina', array['Marevan', 'Coumadin']::text[], 'Anticoagulante', 'Vitamina K',
   'a vitamina K antagoniza o efeito anticoagulante', 'alta',
   'Não cortar as folhas verdes: manter a ingestão CONSTANTE semana a semana e avisar o médico antes de mudar a dieta.'),
  ('sistema:varfarina-omega3', 'Varfarina', array['Marevan', 'Coumadin']::text[], 'Anticoagulante', 'Ômega-3, vitamina E, alho e ginkgo',
   'potencializam o efeito e aumentam o risco de sangramento', 'alta',
   'Evitar suplementos de ômega-3, vitamina E, alho e ginkgo sem liberação do médico.'),
  ('sistema:estatina-toranja', 'Sinvastatina', array['Atorvastatina', 'Rosuvastatina', 'estatina']::text[], 'Estatina', 'Toranja (grapefruit)',
   'a toranja inibe o metabolismo da estatina e eleva o nível no sangue', 'alta',
   'Evitar toranja e o suco dela durante o tratamento; laranja e limão podem.'),
  ('sistema:estatina-coq10', 'Sinvastatina', array['Atorvastatina', 'Rosuvastatina', 'estatina']::text[], 'Estatina', 'Coenzima Q10',
   'as estatinas reduzem a síntese de coenzima Q10', 'baixa',
   'Em dor muscular persistente, discutir com o médico a suplementação de coenzima Q10.'),
  ('sistema:furosemida-potassio', 'Furosemida', array['Lasix']::text[], 'Diurético de alça', 'Potássio',
   'aumenta muito a perda urinária de potássio', 'alta',
   'Reforçar banana, laranja, batata, feijão e folhas todos os dias; acompanhar o potássio sérico.'),
  ('sistema:furosemida-magnesio', 'Furosemida', array['Lasix']::text[], 'Diurético de alça', 'Magnésio',
   'perda urinária de magnésio', 'moderada',
   'Incluir castanhas, sementes e leguminosas; monitorar o magnésio no uso prolongado.'),
  ('sistema:furosemida-tiamina', 'Furosemida', array['Lasix']::text[], 'Diurético de alça', 'Tiamina (vitamina B1)',
   'perda urinária de tiamina no uso prolongado', 'moderada',
   'Garantir cereais integrais, leguminosas e carne suína; avaliar suplemento em insuficiência cardíaca.'),
  ('sistema:hidroclorotiazida-potassio', 'Hidroclorotiazida', array['Clorana', 'HCTZ']::text[], 'Diurético tiazídico', 'Potássio',
   'perda urinária de potássio', 'moderada',
   'Alimentos ricos em potássio diariamente; acompanhar o potássio sérico.'),
  ('sistema:hidroclorotiazida-calcio', 'Hidroclorotiazida', array['Clorana', 'HCTZ']::text[], 'Diurético tiazídico', 'Cálcio',
   'reduz a excreção de cálcio (retenção)', 'baixa',
   'Evitar suplemento de cálcio em dose alta sem orientação; manter a ingestão alimentar normal.'),
  ('sistema:espironolactona-potassio', 'Espironolactona', array['Aldactone']::text[], 'Diurético poupador de potássio', 'Potássio',
   'retém potássio e pode causar hipercalemia', 'alta',
   'Evitar suplemento de potássio e sal light (cloreto de potássio); moderar os alimentos muito ricos em potássio.'),
  ('sistema:ieca-bra-potassio', 'Enalapril', array['Losartana', 'Captopril', 'Ramipril', 'Valsartana', 'IECA', 'BRA']::text[], 'IECA / BRA', 'Potássio',
   'reduzem a excreção de potássio', 'alta',
   'Sem suplemento de potássio nem sal light; acompanhar o potássio sérico, sobretudo com doença renal.'),
  ('sistema:corticoide-calcio-vitamina-d', 'Prednisona', array['Prednisolona', 'Dexametasona', 'corticoide']::text[], 'Corticoide', 'Cálcio e vitamina D',
   'reduz a absorção de cálcio e acelera a perda óssea', 'moderada',
   'Garantir cálcio (laticínios, vegetais verde-escuros) e vitamina D; avaliar suplemento no uso prolongado.'),
  ('sistema:corticoide-sodio', 'Prednisona', array['Prednisolona', 'Dexametasona', 'corticoide']::text[], 'Corticoide', 'Sódio',
   'retenção de sódio e água (inchaço, pressão)', 'moderada',
   'Reduzir sal e ultraprocessados durante o tratamento.'),
  ('sistema:corticoide-potassio', 'Prednisona', array['Prednisolona', 'Dexametasona', 'corticoide']::text[], 'Corticoide', 'Potássio',
   'aumenta a perda de potássio', 'baixa',
   'Incluir frutas e vegetais ricos em potássio.'),
  ('sistema:corticoide-glicose', 'Prednisona', array['Prednisolona', 'Dexametasona', 'corticoide']::text[], 'Corticoide', 'Glicose e carboidratos',
   'eleva a glicemia', 'moderada',
   'Priorizar carboidratos integrais, fracionar as refeições e monitorar a glicemia.'),
  ('sistema:anticoncepcional-folato-b6-b12', 'Anticoncepcional oral', array['pílula', 'contraceptivo oral', 'etinilestradiol']::text[], 'Contraceptivo hormonal', 'Ácido fólico, B6 e B12',
   'pode reduzir folato, B6 e B12', 'baixa',
   'Alimentação variada com folhas, leguminosas, carnes e ovos; pedir exames se houver sintomas.'),
  ('sistema:anticoncepcional-magnesio', 'Anticoncepcional oral', array['pílula', 'contraceptivo oral', 'etinilestradiol']::text[], 'Contraceptivo hormonal', 'Magnésio',
   'leve redução do magnésio', 'baixa',
   'Sementes, castanhas e folhas verdes no dia a dia.'),
  ('sistema:metotrexato-acido-folico', 'Metotrexato', array[]::text[], 'Antimetabólito', 'Ácido fólico',
   'antagoniza o ácido fólico (deficiência, feridas na boca)', 'alta',
   'Suplementar folato SÓ sob prescrição médica (dose e dia certos); manter as fontes alimentares.'),
  ('sistema:isoniazida-b6', 'Isoniazida', array[]::text[], 'Tuberculostático', 'Vitamina B6',
   'depleta a vitamina B6 (neuropatia periférica)', 'alta',
   'Suplementar piridoxina conforme a prescrição; reforçar carnes, banana, batata e grãos integrais.'),
  ('sistema:anticonvulsivante-acido-folico', 'Fenitoína', array['Carbamazepina', 'Fenobarbital', 'Hidantal', 'Tegretol', 'Gardenal']::text[], 'Anticonvulsivante', 'Ácido fólico',
   'reduz os níveis de folato', 'moderada',
   'Fontes de folato diárias; suplementar com acompanhamento (o excesso pode reduzir o efeito do remédio).'),
  ('sistema:anticonvulsivante-vitamina-d-calcio', 'Fenitoína', array['Carbamazepina', 'Fenobarbital', 'Hidantal', 'Tegretol', 'Gardenal']::text[], 'Anticonvulsivante', 'Vitamina D e cálcio',
   'acelera o metabolismo da vitamina D e reduz o cálcio', 'moderada',
   'Acompanhar a vitamina D; garantir cálcio e exposição ao sol; suplementar se estiver baixa.'),
  ('sistema:fenitoina-nutricao-enteral', 'Fenitoína', array['Hidantal']::text[], 'Anticonvulsivante', 'Nutrição enteral',
   'a dieta enteral reduz muito a absorção da fenitoína', 'alta',
   'Pausar a dieta 2 h antes e 2 h depois da dose e lavar a sonda.'),
  ('sistema:tetraciclina-minerais', 'Tetraciclina', array['Doxiciclina', 'Minociclina']::text[], 'Antibiótico', 'Cálcio, ferro, zinco e laticínios',
   'a quelação com minerais anula a absorção do antibiótico', 'alta',
   'Intervalo de 2 h entre o antibiótico e laticínios, antiácidos ou suplementos minerais.'),
  ('sistema:quinolona-minerais', 'Ciprofloxacino', array['Levofloxacino', 'Norfloxacino', 'quinolona']::text[], 'Antibiótico', 'Cálcio, ferro, zinco e magnésio',
   'a quelação reduz a absorção do antibiótico', 'alta',
   'Tomar 2 h antes ou 6 h depois de laticínios, antiácidos e suplementos minerais.'),
  ('sistema:orlistate-lipossoluveis', 'Orlistate', array['Xenical']::text[], 'Inibidor de lipase', 'Vitaminas A, D, E e K',
   'reduz a absorção das vitaminas lipossolúveis', 'moderada',
   'Multivitamínico com A, D, E e K pelo menos 2 h longe da dose (por exemplo, ao deitar).'),
  ('sistema:colestiramina-lipossoluveis', 'Colestiramina', array['Questran']::text[], 'Sequestrante de ácidos biliares', 'Vitaminas lipossolúveis e ácido fólico',
   'sequestra os sais biliares e reduz a absorção de A, D, E, K e folato', 'moderada',
   'Suplementos e outros remédios 1 h antes ou 4 h depois da colestiramina.'),
  ('sistema:imao-tiramina', 'Tranilcipromina', array['Selegilina', 'IMAO']::text[], 'Antidepressivo IMAO', 'Tiramina',
   'a tiramina não é degradada e pode causar crise hipertensiva', 'alta',
   'Evitar queijos curados, embutidos, defumados, fermentados, chucrute, molho de soja e cerveja artesanal.'),
  ('sistema:litio-sodio', 'Lítio', array['Carbolitium', 'carbonato de lítio']::text[], 'Estabilizador de humor', 'Sódio',
   'pouco sódio eleva o lítio no sangue (toxicidade); muito sódio reduz o efeito', 'alta',
   'Ingestão de sal e água CONSTANTE, sem dieta hipossódica brusca; hidratação regular.'),
  ('sistema:litio-cafeina', 'Lítio', array['Carbolitium', 'carbonato de lítio']::text[], 'Estabilizador de humor', 'Cafeína',
   'a cafeína aumenta a eliminação do lítio', 'baixa',
   'Manter o consumo de café constante e avisar o médico ao cortar ou aumentar.'),
  ('sistema:aas-vitamina-c', 'AAS', array['Aspirina', 'ácido acetilsalicílico']::text[], 'Antiagregante / AINE', 'Vitamina C',
   'aumenta a excreção de vitamina C', 'baixa',
   'Frutas cítricas, acerola e pimentão no dia a dia.'),
  ('sistema:aas-ferro', 'AAS', array['Aspirina', 'ácido acetilsalicílico']::text[], 'Antiagregante / AINE', 'Ferro',
   'perda gastrointestinal oculta de sangue reduz o ferro', 'baixa',
   'Monitorar hemograma e ferritina no uso contínuo; tomar com alimento.'),
  ('sistema:alendronato-calcio-alimentos', 'Alendronato', array['Fosamax', 'Risedronato', 'bifosfonato']::text[], 'Bifosfonato', 'Cálcio e alimentos',
   'qualquer alimento ou mineral anula a absorção', 'alta',
   'Em jejum, só com água, 30 min antes de comer ou de qualquer suplemento, e ficar em pé.'),
  ('sistema:ciclosporina-toranja', 'Ciclosporina', array['Tacrolimo']::text[], 'Imunossupressor', 'Toranja (grapefruit)',
   'a toranja eleva o nível do imunossupressor (toxicidade)', 'alta',
   'Evitar toranja e o suco; manter o horário e a forma de tomar sempre iguais.'),
  ('sistema:antiacido-aluminio-fosfato-ferro', 'Antiácido com alumínio', array['hidróxido de alumínio', 'Pepsamar']::text[], 'Antiácido', 'Fosfato e ferro',
   'liga fosfato e ferro no intestino e reduz a absorção', 'moderada',
   'Intervalo de 2 h entre o antiácido e as refeições ou suplementos; evitar o uso diário prolongado.'),
  ('sistema:sulfassalazina-acido-folico', 'Sulfassalazina', array['Azulfin']::text[], 'Anti-inflamatório intestinal', 'Ácido fólico',
   'inibe a absorção de folato', 'moderada',
   'Suplementar ácido fólico conforme a prescrição; folhas e leguminosas diariamente.'),
  ('sistema:aine-sodio-agua', 'Ibuprofeno', array['Diclofenaco', 'Naproxeno', 'AINE']::text[], 'Anti-inflamatório (AINE)', 'Sódio e água',
   'retenção de sódio e água', 'baixa',
   'Moderar o sal e tomar com alimento para proteger o estômago.'),
  ('sistema:insulina-carboidratos', 'Insulina', array['NPH', 'Regular', 'Glargina', 'Lantus']::text[], 'Insulina', 'Carboidratos',
   'dose sem carboidrato leva a hipoglicemia', 'alta',
   'Refeições em horários regulares com carboidrato contado; nunca pular refeição depois da dose.'),
  ('sistema:sulfonilureia-alcool', 'Glibenclamida', array['Gliclazida', 'Glimepirida', 'sulfonilureia']::text[], 'Sulfonilureia', 'Álcool',
   'o álcool potencializa a hipoglicemia', 'moderada',
   'Evitar álcool; se beber, nunca em jejum.'),
  ('sistema:amiodarona-toranja', 'Amiodarona', array['Ancoron']::text[], 'Antiarrítmico', 'Toranja (grapefruit)',
   'a toranja eleva o nível da amiodarona', 'moderada',
   'Evitar toranja e o suco dela.'),
  ('sistema:amiodarona-iodo', 'Amiodarona', array['Ancoron']::text[], 'Antiarrítmico', 'Iodo',
   'o remédio carrega iodo e altera a tireoide', 'moderada',
   'Não usar suplemento de iodo nem algas (kelp); acompanhar o TSH.'),
  ('sistema:propranolol-alimento', 'Propranolol', array['Inderal']::text[], 'Betabloqueador', 'Alimento',
   'a comida aumenta a absorção do propranolol', 'baixa',
   'Tomar sempre do mesmo jeito: sempre com ou sempre sem alimento.')
) as v(codigo, medicamento, sinonimos, classe, nutriente, efeito, gravidade, conduta)
on conflict (codigo) where codigo is not null do update set
  medicamento = excluded.medicamento, sinonimos = excluded.sinonimos, classe = excluded.classe, nutriente = excluded.nutriente,
  efeito = excluded.efeito, gravidade = excluded.gravidade, conduta = excluded.conduta, fonte = excluded.fonte, deleted_at = null;
