// Physiq hml-19a (H-81 · jeito 2, 11/10/2026) — os PADRÕES que a nutrição semeia no 1º acesso de cada pessoa a uma seção (o
// "garantir" das libs portadas do site antigo). Saíram das libs da tela para o servidor: a função nutricao manda estes itens à RPC
// nutricao_garantir_padroes (migration 20261011100000_hml19a_nutricao_padroes.sql), que grava 1 vez só, com trava, e só se a pessoa
// não tem nenhum próprio vivo naquela seção. Os textos são os de hoje, sem mudança: src/nutricao/prontuario/lib/anamneseUtil.ts,
// documentosUtil.ts e examesUtil.ts passam a reexportar daqui (uma fonte só).
// PURO: sem Deno, sem rede e sem import — roda na função nutricao, no app (Vite) e no Vitest (src/nutricao/nutricaoServidor.test.ts).
// hml-19b: as 3 seções da Dieta (fórmulas, metas e orientações) — os textos de manipuladosUtil.ts, metasUtil.ts e orientacoesUtil.ts,
// idênticos, que passam a reexportar daqui; a RPC já aceitava as 6 seções.

// ───────────────────────── Anamnese (modelos_anamnese) — era anamneseUtil.ts ─────────────────────────
export const TITULO_ANAMNESE_PADRAO = "Anamnese geral (padrão)";
export const PERGUNTAS_ANAMNESE_PADRAO: string[] = [
  "Queixa principal / motivo da consulta",
  "Objetivo com o acompanhamento nutricional",
  "Histórico de saúde (doenças atuais e anteriores, cirurgias)",
  "Histórico familiar (diabetes, hipertensão, obesidade, dislipidemia)",
  "Medicamentos e suplementos em uso",
  "Alergias e intolerâncias alimentares",
  "Funcionamento intestinal",
  "Sono (horas por noite e qualidade)",
  "Atividade física (tipo, frequência e duração)",
  "Consumo de água por dia",
  "Bebida alcoólica e tabagismo",
  "Rotina alimentar (horários, refeições e onde costuma comer)",
  "Preferências e aversões alimentares",
];

// ───────────────────────── Documentos (modelos_documento) — era documentosUtil.ts ─────────────────────────
// texto próprio do PhysiqNutri, não copiado de nenhuma referência
export type TipoDocumentoPadrao = "atestado" | "receituario" | "declaracao";
export type ModeloDocumentoPadrao = { tipo: TipoDocumentoPadrao; titulo: string; conteudo: string };
export const MODELOS_DOCUMENTO_PADRAO: ModeloDocumentoPadrao[] = [
  {
    tipo: "atestado",
    titulo: "Atestado padrão",
    conteudo: [
      "Atesto, para os devidos fins, que *|NOME_PACIENTE|*, CPF *|CPF_PACIENTE|*, esteve sob atendimento nutricional nesta data, necessitando de *|DIAS_AFASTAMENTO|* de afastamento de suas atividades.",
      "",
      "CID: *|CID|*",
      "",
      "*|DATA_HOJE|*",
      "",
      "*|NOME_NUTRICIONISTA|*",
      "*|CARIMBO|*",
    ].join("\n"),
  },
  {
    tipo: "receituario",
    titulo: "Receituário padrão",
    conteudo: [
      "Paciente: *|NOME_PACIENTE|*",
      "CPF: *|CPF_PACIENTE|*",
      "Data: *|DATA_HOJE|*",
      "",
      "Prescrição:",
      "",
      "*|NOME_NUTRICIONISTA|*",
      "*|CARIMBO|*",
    ].join("\n"),
  },
  {
    tipo: "declaracao",
    titulo: "Declaração de comparecimento",
    conteudo: [
      "Declaro, para os devidos fins, que *|NOME_PACIENTE|*, CPF *|CPF_PACIENTE|*, compareceu a atendimento nutricional nesta data.",
      "",
      "*|DATA_HOJE|*",
      "",
      "*|NOME_NUTRICIONISTA|*",
      "*|CARIMBO|*",
    ].join("\n"),
  },
];

// ───────────────────────── Exames (exames_catalogo) — era examesUtil.ts ─────────────────────────
// texto próprio do PhysiqNutri; faixas usuais de laboratório, editáveis por ela
export type ExamePadrao = { nome: string; unidade: string; ref_min: number | null; ref_max: number | null; referencia_texto: string };
export const CATALOGO_EXAMES_PADRAO: ExamePadrao[] = [
  { nome: "Glicemia de jejum", unidade: "mg/dL", ref_min: 70, ref_max: 99, referencia_texto: "" },
  { nome: "Hemoglobina glicada", unidade: "%", ref_min: null, ref_max: 5.6, referencia_texto: "" },
  { nome: "Colesterol total", unidade: "mg/dL", ref_min: null, ref_max: 190, referencia_texto: "" },
  { nome: "HDL", unidade: "mg/dL", ref_min: 40, ref_max: null, referencia_texto: "" },
  { nome: "LDL", unidade: "mg/dL", ref_min: null, ref_max: 130, referencia_texto: "" },
  { nome: "Triglicerídeos", unidade: "mg/dL", ref_min: null, ref_max: 150, referencia_texto: "" },
  { nome: "TSH", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "" },
  { nome: "Vitamina D (25-OH)", unidade: "ng/mL", ref_min: 30, ref_max: 100, referencia_texto: "" },
  { nome: "Vitamina B12", unidade: "pg/mL", ref_min: 200, ref_max: 900, referencia_texto: "" },
  { nome: "Ferritina", unidade: "ng/mL", ref_min: 30, ref_max: 300, referencia_texto: "" },
  { nome: "Hemoglobina", unidade: "g/dL", ref_min: 12, ref_max: 16, referencia_texto: "" },
  { nome: "Creatinina", unidade: "mg/dL", ref_min: 0.6, ref_max: 1.2, referencia_texto: "" },
];

// ───────────────────────── o que vai à RPC (p_itens) ─────────────────────────
/** As seções que a função nutricao semeia nesta W (a RPC aceita também formula, meta e orientacao — hml-19b). */
export const SECOES_PADRAO = ["anamnese", "documento", "exame"] as const;
export type SecaoPadrao = (typeof SECOES_PADRAO)[number];

/**
 * Os itens de cada seção no formato da RPC (as colunas da tabela, sem o dono: a RPC põe auth.uid()). Todos nascem favoritos, como
 * nas libs de hoje.
 */
export function itensPadrao(secao: SecaoPadrao): Array<Record<string, unknown>> {
  switch (secao) {
    case "anamnese":
      return [{ titulo: TITULO_ANAMNESE_PADRAO, perguntas: [...PERGUNTAS_ANAMNESE_PADRAO], favorito: true }];
    case "documento":
      return MODELOS_DOCUMENTO_PADRAO.map((m) => ({ tipo: m.tipo, titulo: m.titulo, conteudo: m.conteudo, favorito: true }));
    case "exame":
      return CATALOGO_EXAMES_PADRAO.map((e) => ({
        nome: e.nome, unidade: e.unidade, ref_min: e.ref_min, ref_max: e.ref_max, referencia_texto: e.referencia_texto, favorito: true,
      }));
  }
}

// ═════════════════════════ hml-19b — as 3 seções da Dieta (a mesma RPC, pelo módulo dieta.ts da função) ═════════════════════════
// ───────────────────────── Manipulados (modelos_formula) — era manipuladosUtil.ts ─────────────────────────
// texto próprio do PhysiqNutri, não copiado de nenhuma referência
export type AtivoPadrao = { ativo: string; dose: string; unidade: string };
export type ModeloFormulaPadrao = { titulo: string; ativos: AtivoPadrao[]; posologia: string; quantidade: string; observacao: string };
export const MODELOS_FORMULA_PADRAO: ModeloFormulaPadrao[] = [
  {
    titulo: "Magnésio + vitamina B6",
    ativos: [
      { ativo: "Magnésio dimalato", dose: "300", unidade: "mg" },
      { ativo: "Piridoxina (B6)", dose: "50", unidade: "mg" },
    ],
    posologia: "Tomar 1 cápsula à noite",
    quantidade: "30 cápsulas",
    observacao: "",
  },
  {
    titulo: "Vitamina D3 2000 UI",
    ativos: [{ ativo: "Colecalciferol", dose: "2000", unidade: "UI" }],
    posologia: "Tomar 1 cápsula ao dia, junto com uma refeição com gordura",
    quantidade: "60 cápsulas",
    observacao: "",
  },
  {
    titulo: "Ômega 3 concentrado",
    ativos: [
      { ativo: "EPA", dose: "600", unidade: "mg" },
      { ativo: "DHA", dose: "400", unidade: "mg" },
    ],
    posologia: "Tomar 1 cápsula 2x ao dia, após o almoço e o jantar",
    quantidade: "60 cápsulas",
    observacao: "",
  },
];

// ───────────────────────── Metas (modelos_meta) — era metasUtil.ts (os dias: 1 = segunda … 7 = domingo) ─────────────────────────
// texto próprio do PhysiqNutri, não copiado de nenhuma referência
export type ModeloMetaPadrao = { titulo: string; descricao: string; dias_semana: number[] };
export const MODELOS_META_PADRAO: ModeloMetaPadrao[] = [
  {
    titulo: "Beber 2 litros de água",
    descricao: "Distribua ao longo do dia: um copo grande ao acordar, um em cada refeição e uma garrafa de 500 ml nos intervalos.",
    dias_semana: [1, 2, 3, 4, 5, 6, 7],
  },
  {
    titulo: "Caminhar 30 minutos",
    descricao: "Em ritmo confortável, de preferência ao ar livre. Pode dividir em duas caminhadas de 15 minutos.",
    dias_semana: [1, 3, 5],
  },
  {
    titulo: "Dormir de 7 a 8 horas",
    descricao: "Deite e levante em horários parecidos todos os dias e evite telas na última hora antes de dormir.",
    dias_semana: [1, 2, 3, 4, 5, 6, 7],
  },
  {
    titulo: "Comer 3 porções de frutas",
    descricao: "Uma porção é uma fruta média ou uma fatia grande. Varie as cores ao longo da semana.",
    dias_semana: [1, 2, 3, 4, 5, 6, 7],
  },
  {
    titulo: "Sem refrigerante e doces",
    descricao: "Troque por água com gás, chá sem açúcar e frutas. No fim de semana, com moderação.",
    dias_semana: [1, 2, 3, 4, 5],
  },
];

// ───────────────────────── Orientações (modelos_orientacao) — era orientacoesUtil.ts ─────────────────────────
/** Texto próprio do PhysiqNutri (não copiado de nenhuma referência): 8 tópicos do dia a dia. */
export const TITULO_ORIENTACAO_PADRAO = "Orientações gerais (padrão)";
export const CONTEUDO_ORIENTACAO_PADRAO = [
  "## Hidratação",
  "Beba água ao longo de todo o dia, sem esperar a sede: deixe uma garrafa por perto e dê preferência à água pura. Sucos, refrigerantes e bebidas adoçadas não substituem a água.",
  "",
  "## Mastigação e ritmo das refeições",
  "Sente-se para comer, sem pressa e longe de telas. Mastigue bem cada porção e faça pausas entre as garfadas — a sensação de saciedade leva alguns minutos para chegar.",
  "",
  "## Horários",
  "Procure fazer as refeições em horários parecidos todos os dias e evite ficar mais de 4 horas sem comer. Pular refeições costuma aumentar a fome e a vontade de beliscar depois.",
  "",
  "## Vegetais e frutas",
  "- Inclua verduras e legumes no almoço e no jantar, ocupando pelo menos metade do prato.",
  "- Varie as cores ao longo da semana: cada cor traz nutrientes diferentes.",
  "- Prefira a fruta inteira ao suco.",
  "",
  "## Ultraprocessados",
  "Reduza embutidos, salgadinhos, biscoitos recheados, refrigerantes e refeições prontas. Quando for consumir, leia o rótulo e prefira listas de ingredientes curtas.",
  "",
  "## Sono",
  "Dormir bem faz parte do tratamento: tente manter de 7 a 9 horas por noite, com horários regulares. Evite refeições muito pesadas e cafeína perto da hora de dormir.",
  "",
  "## Atividade física",
  "Movimente-se todos os dias, mesmo que em caminhadas curtas. Combine com a nutricionista a alimentação em torno dos treinos.",
  "",
  "## Registro do diário alimentar",
  "Anote (ou fotografe) o que comer e beber, com horário, e leve o registro para a próxima consulta. **Não existe registro errado**: ele serve para ajustarmos o plano juntos.",
].join("\n");

/** As seções da Dieta que a função nutricao semeia (o módulo dieta.ts; as do Prontuário ficam em SECOES_PADRAO). */
export const SECOES_PADRAO_DIETA = ["formula", "meta", "orientacao"] as const;
export type SecaoPadraoDieta = (typeof SECOES_PADRAO_DIETA)[number];

/**
 * Os itens de cada seção da Dieta no formato da RPC — exatamente o que as libs gravavam no 1º acesso (garantirModelosFormula,
 * garantirModelosMeta, garantirModelos): o título aparado, os ativos e os dias já normalizados (os padrões já estão na forma), favoritos.
 */
export function itensPadraoDaDieta(secao: SecaoPadraoDieta): Array<Record<string, unknown>> {
  switch (secao) {
    case "formula":
      return MODELOS_FORMULA_PADRAO.map((m) => ({
        titulo: m.titulo.trim(), ativos: m.ativos.map((a) => ({ ...a })), posologia: m.posologia, quantidade: m.quantidade, observacao: m.observacao, favorito: true,
      }));
    case "meta":
      return MODELOS_META_PADRAO.map((m) => ({ titulo: m.titulo.trim(), descricao: m.descricao, dias_semana: [...m.dias_semana], favorito: true }));
    case "orientacao":
      return [{ titulo: TITULO_ORIENTACAO_PADRAO.trim(), conteudo: CONTEUDO_ORIENTACAO_PADRAO, favorito: true }];
  }
}
