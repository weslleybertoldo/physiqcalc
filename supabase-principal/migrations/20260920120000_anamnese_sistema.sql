-- PhysiqNutri — W40 Anamnese nutricional completa (padrão SICNUT) como modelo DO SISTEMA. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920120000_anamnese_sistema.sql`
-- (roda em public E staging, trocando {schema}). Depende da W5 (modelos_anamnese) e da base (eh_master).
-- Padrão dos questionários (W19): nutricionista_id NULL = do sistema, `codigo` 'sistema:*' com índice único parcial,
-- leitura pra todas as profissionais; criar/editar/apagar continuam só nos próprios (ou master) → a linha do sistema é
-- só leitura pra nutricionista (o app oferece "Duplicar" pra ter a versão editável). Sem bloco compartilhado.

alter table {schema}.modelos_anamnese alter column nutricionista_id drop not null;
alter table {schema}.modelos_anamnese add column if not exists codigo text;   -- 'sistema:sicnut' (só nos do sistema)
create unique index if not exists modelos_anamnese_codigo_uidx on {schema}.modelos_anamnese (codigo) where codigo is not null;

drop policy if exists "modelos_anamnese: ler os proprios ou master" on {schema}.modelos_anamnese;
drop policy if exists "modelos_anamnese: ler do sistema, os proprios ou master" on {schema}.modelos_anamnese;
create policy "modelos_anamnese: ler do sistema, os proprios ou master" on {schema}.modelos_anamnese
  for select to authenticated using (nutricionista_id is null or nutricionista_id = auth.uid() or {schema}.eh_master());
-- insert/update/delete: as policies da W5 exigem nutricionista_id = auth.uid() (ou master) — a linha do sistema (NULL) não passa.

-- Seed: o modelo do sistema — 32 perguntas em 5 blocos, na estrutura da avaliação do Processo de Cuidado em Nutrição
-- (Academy of Nutrition and Dietetics; no Brasil, manual SICNUT da ASBRAN): história do cliente · histórico de peso ·
-- história alimentar (recordatório 24 h + marcadores de consumo alimentar do SISVAN/Ministério da Saúde) · sinais e
-- sintomas · exames e medidas. Idempotente pelo `codigo`. Texto próprio do PhysiqNutri.
insert into {schema}.modelos_anamnese (nutricionista_id, codigo, titulo, perguntas, favorito) values
(null, 'sistema:sicnut', 'Anamnese nutricional completa (padrão SICNUT)', '[
  "História do cliente — Queixa principal e motivo da consulta",
  "História do cliente — Objetivo com o acompanhamento nutricional e prazo esperado",
  "História do cliente — Doenças atuais e anteriores, cirurgias e internações",
  "História do cliente — Histórico familiar (diabetes, hipertensão, obesidade, dislipidemia, doença cardiovascular, câncer)",
  "História do cliente — Medicamentos em uso (nome, dose e horário)",
  "História do cliente — Suplementos, fitoterápicos e chás em uso",
  "História do cliente — Alergias e intolerâncias alimentares (diagnóstico e tipo de reação)",
  "História do cliente — Saúde da mulher: ciclo menstrual, anticoncepcional, gestação ou lactação, menopausa (quando se aplica)",
  "História do cliente — Profissão, rotina de trabalho ou estudo e horários (turnos, viagens)",
  "História do cliente — Com quem mora, quem prepara as refeições e onde costuma comprar os alimentos",
  "Histórico de peso — Peso habitual, peso máximo e mínimo na vida adulta e variação nos últimos 6 meses (quanto e por quê)",
  "Histórico de peso — Dietas ou acompanhamentos anteriores: quais, por quanto tempo e resultados",
  "Histórico de peso — Uso atual ou anterior de medicamentos ou suplementos para emagrecer ou ganhar massa",
  "História alimentar — Refeições que faz ao longo do dia (café da manhã, lanche da manhã, almoço, lanche da tarde, jantar, ceia) e horários",
  "História alimentar — Recordatório de 24 horas: tudo o que comeu e bebeu ontem, com quantidades e horários",
  "História alimentar — Ontem consumiu feijão, frutas frescas, verduras ou legumes? (marcadores SISVAN de alimentação saudável)",
  "História alimentar — Ontem consumiu hambúrguer ou embutidos, bebidas adoçadas, macarrão instantâneo, salgadinhos ou biscoitos salgados, biscoito recheado, doces ou guloseimas? (marcadores SISVAN de ultraprocessados)",
  "História alimentar — Costuma fazer as refeições assistindo TV, no celular ou no computador?",
  "História alimentar — Apetite (aumentado, normal ou diminuído) e horário de maior fome",
  "História alimentar — Preferências, aversões e restrições alimentares (vegetariano, vegano, religiosas, culturais)",
  "História alimentar — Relação com a comida: belisca, come por ansiedade ou estresse, episódios de compulsão, pula refeições",
  "História alimentar — Consumo de água por dia (copos ou litros) e outras bebidas (café, chás, refrigerante, energético)",
  "História alimentar — Bebida alcoólica (tipo, frequência e quantidade) e tabagismo",
  "História alimentar — Refeições fora de casa ou delivery por semana, uso de temperos prontos, açúcar e sal",
  "Sinais e sintomas — Funcionamento intestinal: frequência, consistência (escala de Bristol), constipação, diarreia, gases",
  "Sinais e sintomas — Sintomas gastrointestinais: náusea, vômito, refluxo ou queimação, distensão, dor abdominal",
  "Sinais e sintomas — Mastigação e deglutição (dentição, próteses, dificuldade para engolir)",
  "Sinais e sintomas — Sono (horas por noite, qualidade, acorda para comer) e nível de estresse",
  "Sinais e sintomas — Pele, cabelo e unhas, cansaço, cãibras, queda de cabelo, inchaço (sinais de carência nutricional)",
  "Sinais e sintomas — Atividade física: tipo, frequência, duração, intensidade e horário; tempo sentado por dia",
  "Exames e medidas — Exames laboratoriais recentes (data e alterações: glicemia, colesterol, triglicerídeos, vitamina D, B12, ferritina, TSH)",
  "Exames e medidas — Altura, peso atual e circunferência da cintura referidos (as medidas ficam na seção Antropometria)"
]'::jsonb, false)
on conflict (codigo) where codigo is not null do nothing;
