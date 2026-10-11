// Physiq hml-19a (H-81 · jeito 2, 11/10/2026) — os PADRÕES que a nutrição semeia no 1º acesso de cada pessoa a uma seção (o
// "garantir" das libs portadas do site antigo). Saíram das libs da tela para o servidor: a função nutricao manda estes itens à RPC
// nutricao_garantir_padroes (migration 20261011100000_hml19a_nutricao_padroes.sql), que grava 1 vez só, com trava, e só se a pessoa
// não tem nenhum próprio vivo naquela seção. Os textos são os de hoje, sem mudança: src/nutricao/prontuario/lib/anamneseUtil.ts,
// documentosUtil.ts e examesUtil.ts passam a reexportar daqui (uma fonte só).
// PURO: sem Deno, sem rede e sem import — roda na função nutricao, no app (Vite) e no Vitest (src/nutricao/nutricaoServidor.test.ts).
// As 3 seções da Dieta (fórmulas, metas e orientações) entram na hml-19b: a RPC já aceita as 6.

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
