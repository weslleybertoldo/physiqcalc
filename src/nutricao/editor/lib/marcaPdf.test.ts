import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import { montarPDFDieta } from "./dietaPdf";
import { montarPDFEnergetico } from "./energeticoPdf";
import { montarPDFFormula, montarPDFFormulas } from "./manipuladosPdf";
import { montarPDFMetas } from "./metasPdf";
import { montarPDFOrientacao } from "./orientacaoPdf";
import { montarPDFSuplementos } from "./suplementosPdf";
import { montarPDFAntropometria } from "@/nutricao/avaliacao/antropometriaPdf";

// Physiq W26 (herdado da W16/W18 — N-60): os PDFs da aba Dieta do perfil do aluno (e o da antropometria, da mesma família) saem com a
// marca PHYSIQ no cabeçalho, como os da W18/W19/W24 — o mesmo conteúdo de antes, só a marca mudou.

/** O texto que o jsPDF escreveu nas páginas (operadores "(...) Tj"), sem os escapes. */
const textos = (doc: jsPDF): string =>
  ((doc as unknown as { internal: { pages: string[][] } }).internal.pages
    .slice(1)
    .map((p) => p.join("\n"))
    .join("\n")
    .match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [])
    .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"))
    .join("\n");

const QUANDO = new Date(2026, 9, 1, 22, 30);
const ALIMENTO = { id: "a1", nome: "Arroz, integral, cozido", fonte: "taco", grupo: null, energia_kcal: 124, proteina_g: 2.6, carboidrato_g: 25.8, lipidio_g: 1, fibra_g: 2.7, sodio_mg: 1, medidas_caseiras: [] };

function conferir(doc: jsPDF, cabecalho: RegExp, conteudo: string[]) {
  const t = textos(doc);
  expect(t).toMatch(cabecalho);
  expect(t).not.toMatch(/PHYSIQNUTRI|PhysiqNutri/);
  for (const c of conteudo) expect(t).toContain(c);
}

describe("W26 — marca PHYSIQ nos PDFs da aba Dieta (N-60)", () => {
  it("plano alimentar: PHYSIQ · PLANO ALIMENTAR + o plano", () => {
    const doc = montarPDFDieta({
      paciente: "Rafael Moura", nutricionista: "Camila Rocha", data: QUANDO, titulo: "Plano de outubro", metodo: "alimentos", kcal_alvo: 2200, observacao: null,
      refeicoes: [{ nome: "Almoço", horario: "12:00", observacao: null, itens: [{ quantidade_g: 150, medida_caseira_id: null, quantidade_medida: null, alimento: ALIMENTO, observacao: null, substitutos: [] }] }],
    });
    conferir(doc, /PHYSIQ . PLANO ALIMENTAR/, ["Plano de outubro", "Rafael Moura", "12:00 · ALMOÇO", "Arroz, integral, cozido"]);
  });

  it("prescrição de metas: PHYSIQ · PRESCRIÇÃO DE METAS + as metas", () => {
    const doc = montarPDFMetas({ paciente: "Rafael Moura", nutricionista: "Camila Rocha", emitidoEm: QUANDO, metas: [{ titulo: "Beber 2 L de água", descricao: null, dias_semana: [1, 2, 3, 4, 5] }] });
    conferir(doc, /PHYSIQ . PRESCRI..O DE METAS/, ["Beber 2 L de", "Rafael Moura"]);
  });

  it("orientações: PHYSIQ · ORIENTAÇÕES NUTRICIONAIS + o texto", () => {
    const doc = montarPDFOrientacao({ titulo: "Hidratação", data: QUANDO, paciente: "Rafael Moura", nutricionista: "Camila Rocha", conteudo: "## Água\n- Beba ao longo do dia" });
    conferir(doc, /PHYSIQ . ORIENTA..ES NUTRICIONAIS/, ["Hidrata", "Rafael Moura"]);
  });

  it("cálculo energético: PHYSIQ · CÁLCULO ENERGÉTICO + os números", () => {
    const doc = montarPDFEnergetico({
      paciente: "Rafael Moura", nutricionista: "Camila Rocha", data: QUANDO, formula: "mifflin", peso: 80, altura: 180, idade: 30, sexo: "M", massa_magra: null,
      fator_atividade: 1.55, atividades: [], tmb: 1780, get: 2759, ajuste_kcal: -300, vet: 2459, objetivo: "perder", observacao: null,
    });
    conferir(doc, /PHYSIQ . C.LCULO ENERG.TICO/, ["Rafael Moura"]);
  });

  it("manipulados (uma e todas): PHYSIQ · … + a fórmula", () => {
    const formula = { titulo: "Fórmula para o sono", ativos: [{ nome: "Magnésio", dose: "300 mg" }], posologia: "1 cápsula à noite", quantidade: "30 cápsulas", observacao: null, prescrita_em: "2026-10-01" };
    const base = { paciente: "Rafael Moura", nutricionista: "Camila Rocha", profissional: null, emitidoEm: QUANDO };
    conferir(montarPDFFormula({ ...base, formula }), /PHYSIQ . PRESCRI..O DE MANIPULADO/, ["Rafael Moura"]);
    conferir(montarPDFFormulas({ ...base, formulas: [formula] }), /PHYSIQ . PRESCRI..ES DE MANIPULADOS/, ["Rafael Moura"]);
  });

  it("suplementação: PHYSIQ · SUPLEMENTAÇÃO", () => {
    const doc = montarPDFSuplementos({ paciente: "Rafael Moura", nascimento: null, nutricionista: "Camila Rocha", profissional: null, emitidoEm: QUANDO, ativas: [] });
    conferir(doc, /PHYSIQ . SUPLEMENTA..O/, ["Rafael Moura"]);
  });

  it("antropometria (aba Avaliação, a mesma família): PHYSIQ · ANTROPOMETRIA", () => {
    const doc = montarPDFAntropometria({
      paciente: "Rafael Moura", nutricionista: "Camila Rocha", data: QUANDO, peso: 80, altura: 180, sexo: "M", idade: 30, protocolo: "pollock3",
      circunferencias: {}, dobras: {}, resultados: {}, observacao: null,
    });
    conferir(doc, /PHYSIQ . ANTROPOMETRIA/, ["Rafael Moura"]);
  });
});
