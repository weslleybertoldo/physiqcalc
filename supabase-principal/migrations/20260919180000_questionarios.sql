-- PhysiqNutri — W19 Questionários de saúde. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919180000_questionarios.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at), de pacientes (W1)
-- e do trigger genérico tocar_paciente() (W5). Sem bloco único: o seed dos 4 questionários do sistema roda por schema.

-- Questionários. Os DO SISTEMA (nutricionista_id NULL, `codigo` 'sistema:*', texto próprio do PhysiqNutri) nascem aqui, são
-- visíveis a todas as nutricionistas e ninguém edita/apaga (só duplica — a cópia é própria e editável). Os PRÓPRIOS têm
-- nutricionista_id. `perguntas` = lista de {id, texto, tipo escala|sim_nao|multipla|texto, max (escala), pontos_sim (sim_nao),
-- opcoes [{texto, pontos}] (multipla)}; `faixas` = lista de {min, max, rotulo, nivel baixo|moderado|alto}. A aplicação
-- (respostas_questionario) COPIA título, perguntas e faixas na hora — mudar/excluir o questionário depois não mexe no
-- histórico. Exclusão SOFT.
create table if not exists {schema}.questionarios (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid references auth.users(id) on delete cascade,   -- NULL = questionário do sistema
  codigo text,                                                          -- 'sistema:disbiose' … (só nos do sistema)
  titulo text not null,
  descricao text not null default '',
  perguntas jsonb not null default '[]'::jsonb,
  faixas jsonb not null default '[]'::jsonb,
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint questionarios_perguntas_check check (jsonb_typeof(perguntas) = 'array'),
  constraint questionarios_faixas_check check (jsonb_typeof(faixas) = 'array')
);
create unique index if not exists questionarios_codigo_uidx on {schema}.questionarios (codigo) where codigo is not null;
create index if not exists questionarios_nutri_idx on {schema}.questionarios (nutricionista_id);
grant all on {schema}.questionarios to anon, authenticated, service_role;
alter table {schema}.questionarios enable row level security;

drop policy if exists "questionarios: ler do sistema, os proprios ou master" on {schema}.questionarios;
create policy "questionarios: ler do sistema, os proprios ou master" on {schema}.questionarios
  for select to authenticated using (nutricionista_id is null or nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "questionarios: criar os proprios ou master" on {schema}.questionarios;
create policy "questionarios: criar os proprios ou master" on {schema}.questionarios
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "questionarios: editar os proprios ou master" on {schema}.questionarios;
create policy "questionarios: editar os proprios ou master" on {schema}.questionarios
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "questionarios: apagar os proprios ou master" on {schema}.questionarios;
create policy "questionarios: apagar os proprios ou master" on {schema}.questionarios
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_questionarios_updated_at on {schema}.questionarios;
create trigger trg_questionarios_updated_at before update on {schema}.questionarios
  for each row execute function {schema}.set_updated_at();

-- Aplicações de questionário no paciente: título, perguntas e faixas são CÓPIA do questionário na hora da aplicação;
-- `respostas` = {id da pergunta: valor} (escala → número 0..max; sim_nao → true/false; multipla → índice da opção; texto →
-- string); pontuação, faixa (rótulo) e nível são calculados pelo app ao salvar (e recalculados na edição). Paciente
-- OBRIGATÓRIO; a criação exige enxergar o paciente (RLS de `pacientes`, padrão W10–W18). Exclusão SOFT.
create table if not exists {schema}.respostas_questionario (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  questionario_id uuid references {schema}.questionarios(id) on delete set null,
  titulo text not null,
  perguntas jsonb not null default '[]'::jsonb,
  faixas jsonb not null default '[]'::jsonb,
  respostas jsonb not null default '{}'::jsonb,
  pontuacao numeric not null default 0,
  faixa text not null default '',
  nivel text not null default '',
  data date not null default current_date,
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- lixeira (W32)
  constraint respostas_questionario_perguntas_check check (jsonb_typeof(perguntas) = 'array'),
  constraint respostas_questionario_faixas_check check (jsonb_typeof(faixas) = 'array'),
  constraint respostas_questionario_respostas_check check (jsonb_typeof(respostas) = 'object'),
  constraint respostas_questionario_nivel_check check (nivel in ('baixo', 'moderado', 'alto', ''))
);
create index if not exists respostas_questionario_paciente_data_idx on {schema}.respostas_questionario (paciente_id, data desc);
create index if not exists respostas_questionario_nutri_idx on {schema}.respostas_questionario (nutricionista_id);
grant all on {schema}.respostas_questionario to anon, authenticated, service_role;
alter table {schema}.respostas_questionario enable row level security;

drop policy if exists "respostas_questionario: ler os proprios ou master" on {schema}.respostas_questionario;
create policy "respostas_questionario: ler os proprios ou master" on {schema}.respostas_questionario
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "respostas_questionario: criar os proprios ou master" on {schema}.respostas_questionario;
create policy "respostas_questionario: criar os proprios ou master" on {schema}.respostas_questionario
  for insert to authenticated with check (
    {schema}.eh_master()
    or (
      nutricionista_id = auth.uid()
      and exists (select 1 from {schema}.pacientes p where p.id = paciente_id)
    )
  );
drop policy if exists "respostas_questionario: editar os proprios ou master" on {schema}.respostas_questionario;
create policy "respostas_questionario: editar os proprios ou master" on {schema}.respostas_questionario
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "respostas_questionario: apagar os proprios ou master" on {schema}.respostas_questionario;
create policy "respostas_questionario: apagar os proprios ou master" on {schema}.respostas_questionario
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_respostas_questionario_updated_at on {schema}.respostas_questionario;
create trigger trg_respostas_questionario_updated_at before update on {schema}.respostas_questionario
  for each row execute function {schema}.set_updated_at();
drop trigger if exists trg_respostas_questionario_toca_paciente on {schema}.respostas_questionario;
create trigger trg_respostas_questionario_toca_paciente after insert or update on {schema}.respostas_questionario
  for each row execute function {schema}.tocar_paciente();

-- Seed: os 4 questionários do sistema (texto próprio, genérico). Idempotente pelo `codigo` (índice único parcial).
-- Espelho pra testes/prévia em src/lib/questionariosUtil.ts (QUESTIONARIOS_PADRAO) — o banco é a fonte.
insert into {schema}.questionarios (nutricionista_id, codigo, titulo, descricao, perguntas, faixas, favorito) values
(null, 'sistema:disbiose', 'Disbiose intestinal',
 'Sintomas digestivos e gerais ligados ao desequilíbrio da flora intestinal. Escala de 0 (nunca) a 4 (sempre).',
 '[{"id":"p1","texto":"Sente a barriga estufada ou distendida depois das refeições?","tipo":"escala","max":4},
   {"id":"p2","texto":"Tem excesso de gases?","tipo":"escala","max":4},
   {"id":"p3","texto":"Sente dor ou desconforto abdominal?","tipo":"escala","max":4},
   {"id":"p4","texto":"O intestino alterna entre preso e solto?","tipo":"escala","max":4},
   {"id":"p5","texto":"Tem azia ou refluxo?","tipo":"escala","max":4},
   {"id":"p6","texto":"Percebe intolerância a algum alimento (leite, trigo, feijão)?","tipo":"escala","max":4},
   {"id":"p7","texto":"Usou antibiótico nos últimos 6 meses?","tipo":"escala","max":4},
   {"id":"p8","texto":"Sente a digestão lenta ou pesada?","tipo":"escala","max":4},
   {"id":"p9","texto":"Dorme mal ou acorda sem energia?","tipo":"escala","max":4},
   {"id":"p10","texto":"Percebe mudanças de humor ou ansiedade ligadas à digestão?","tipo":"escala","max":4}]'::jsonb,
 '[{"min":0,"max":10,"rotulo":"Baixa suspeita","nivel":"baixo"},{"min":11,"max":20,"rotulo":"Suspeita moderada","nivel":"moderado"},{"min":21,"max":40,"rotulo":"Alta suspeita","nivel":"alto"}]'::jsonb,
 false),
(null, 'sistema:rastreamento', 'Rastreamento metabólico',
 'Frequência dos sintomas por sistema do corpo nas últimas semanas. Escala de 0 (nunca) a 4 (sempre).',
 '[{"id":"p1","texto":"Cabeça: dor de cabeça, enxaqueca ou tontura","tipo":"escala","max":4},
   {"id":"p2","texto":"Olhos: lacrimejamento, coceira ou visão embaçada","tipo":"escala","max":4},
   {"id":"p3","texto":"Nariz e garganta: congestão, coriza, pigarro ou dor de garganta","tipo":"escala","max":4},
   {"id":"p4","texto":"Pele: acne, coceira, ressecamento ou suor excessivo","tipo":"escala","max":4},
   {"id":"p5","texto":"Coração: palpitações ou batimentos irregulares","tipo":"escala","max":4},
   {"id":"p6","texto":"Digestivo: náusea, azia, gases, prisão de ventre ou diarreia","tipo":"escala","max":4},
   {"id":"p7","texto":"Articulações e músculos: dor, rigidez ou fraqueza","tipo":"escala","max":4},
   {"id":"p8","texto":"Energia: cansaço, sonolência ou agitação","tipo":"escala","max":4},
   {"id":"p9","texto":"Mente: dificuldade de concentração ou de memória","tipo":"escala","max":4},
   {"id":"p10","texto":"Emoções: irritabilidade, ansiedade ou desânimo","tipo":"escala","max":4}]'::jsonb,
 '[{"min":0,"max":15,"rotulo":"Poucos sintomas","nivel":"baixo"},{"min":16,"max":30,"rotulo":"Sintomas moderados","nivel":"moderado"},{"min":31,"max":40,"rotulo":"Muitos sintomas","nivel":"alto"}]'::jsonb,
 false),
(null, 'sistema:frequencia', 'Frequência alimentar',
 'Com que frequência você consome cada grupo? Alimentos protetores pontuam quando raros; os de risco, quando frequentes.',
 '[{"id":"p1","texto":"Frutas","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":4},{"texto":"1 a 2 vezes por semana","pontos":3},{"texto":"3 a 5 vezes por semana","pontos":1},{"texto":"Todo dia","pontos":0}]},
   {"id":"p2","texto":"Verduras e legumes","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":4},{"texto":"1 a 2 vezes por semana","pontos":3},{"texto":"3 a 5 vezes por semana","pontos":1},{"texto":"Todo dia","pontos":0}]},
   {"id":"p3","texto":"Leguminosas (feijão, lentilha, grão-de-bico)","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":4},{"texto":"1 a 2 vezes por semana","pontos":3},{"texto":"3 a 5 vezes por semana","pontos":1},{"texto":"Todo dia","pontos":0}]},
   {"id":"p4","texto":"Cereais integrais (arroz integral, aveia, pão integral)","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":4},{"texto":"1 a 2 vezes por semana","pontos":3},{"texto":"3 a 5 vezes por semana","pontos":1},{"texto":"Todo dia","pontos":0}]},
   {"id":"p5","texto":"Ultraprocessados (salgadinhos, biscoitos recheados, macarrão instantâneo)","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"1 a 2 vezes por semana","pontos":1},{"texto":"3 a 5 vezes por semana","pontos":3},{"texto":"Todo dia","pontos":4}]},
   {"id":"p6","texto":"Doces e sobremesas","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"1 a 2 vezes por semana","pontos":1},{"texto":"3 a 5 vezes por semana","pontos":3},{"texto":"Todo dia","pontos":4}]},
   {"id":"p7","texto":"Refrigerantes e sucos adoçados","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"1 a 2 vezes por semana","pontos":1},{"texto":"3 a 5 vezes por semana","pontos":3},{"texto":"Todo dia","pontos":4}]},
   {"id":"p8","texto":"Frituras","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"1 a 2 vezes por semana","pontos":1},{"texto":"3 a 5 vezes por semana","pontos":3},{"texto":"Todo dia","pontos":4}]},
   {"id":"p9","texto":"Embutidos (salsicha, presunto, linguiça)","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"1 a 2 vezes por semana","pontos":1},{"texto":"3 a 5 vezes por semana","pontos":3},{"texto":"Todo dia","pontos":4}]},
   {"id":"p10","texto":"Água (pelo menos 2 litros por dia)","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":4},{"texto":"1 a 2 vezes por semana","pontos":3},{"texto":"3 a 5 vezes por semana","pontos":1},{"texto":"Todo dia","pontos":0}]}]'::jsonb,
 '[{"min":0,"max":8,"rotulo":"Padrão protetor","nivel":"baixo"},{"min":9,"max":18,"rotulo":"Atenção","nivel":"moderado"},{"min":19,"max":40,"rotulo":"Alto risco","nivel":"alto"}]'::jsonb,
 false),
(null, 'sistema:cafeina', 'Consumo de cafeína',
 'Fontes de cafeína no dia a dia, horário do último consumo e qualidade do sono.',
 '[{"id":"p1","texto":"Quantas xícaras de café você toma por dia?","tipo":"multipla","opcoes":[{"texto":"Não tomo","pontos":0},{"texto":"1 a 2","pontos":1},{"texto":"3 a 4","pontos":3},{"texto":"5 ou mais","pontos":5}]},
   {"id":"p2","texto":"Chá preto, chá verde ou mate","tipo":"multipla","opcoes":[{"texto":"Não tomo","pontos":0},{"texto":"Às vezes","pontos":1},{"texto":"Todo dia","pontos":2},{"texto":"Várias vezes ao dia","pontos":3}]},
   {"id":"p3","texto":"Energéticos","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"1 vez por semana","pontos":2},{"texto":"Várias vezes por semana","pontos":4},{"texto":"Todo dia","pontos":6}]},
   {"id":"p4","texto":"Refrigerante à base de cola","tipo":"multipla","opcoes":[{"texto":"Nunca","pontos":0},{"texto":"Às vezes","pontos":1},{"texto":"Todo dia","pontos":2},{"texto":"Mais de 1 lata por dia","pontos":3}]},
   {"id":"p5","texto":"Chocolate ou achocolatado","tipo":"multipla","opcoes":[{"texto":"Raramente","pontos":0},{"texto":"Algumas vezes por semana","pontos":1},{"texto":"Todo dia","pontos":2},{"texto":"Várias vezes ao dia","pontos":3}]},
   {"id":"p6","texto":"Pré-treino ou suplemento com cafeína","tipo":"multipla","opcoes":[{"texto":"Não uso","pontos":0},{"texto":"Às vezes","pontos":2},{"texto":"Sempre que treino","pontos":4},{"texto":"Mais de uma dose por dia","pontos":6}]},
   {"id":"p7","texto":"Horário do último consumo de cafeína no dia","tipo":"multipla","opcoes":[{"texto":"Antes das 12h","pontos":0},{"texto":"Entre 12h e 16h","pontos":1},{"texto":"Entre 16h e 19h","pontos":3},{"texto":"Depois das 19h","pontos":5}]},
   {"id":"p8","texto":"Como tem sido o seu sono?","tipo":"multipla","opcoes":[{"texto":"Durmo bem","pontos":0},{"texto":"Demoro a pegar no sono","pontos":2},{"texto":"Acordo durante a noite","pontos":3},{"texto":"Durmo mal quase sempre","pontos":5}]}]'::jsonb,
 '[{"min":0,"max":5,"rotulo":"Consumo baixo","nivel":"baixo"},{"min":6,"max":12,"rotulo":"Consumo moderado","nivel":"moderado"},{"min":13,"max":40,"rotulo":"Consumo alto","nivel":"alto"}]'::jsonb,
 false)
on conflict (codigo) where codigo is not null do nothing;
