import { describe, expect, it } from "vitest";
import jsPDF from "jspdf";
import { medidasVazias } from "@/types/medidas";
import {
  DOBRAS_3, DOBRAS_7, NIVEIS_ATIVIDADE, classificacao, dobrasDoPdf, gordura3Dobras, gordura7Dobras, numero, resultadoDobras, textoVariacao, tmbMifflin, tomVariacao,
} from "./calculos";
import { DADOS_VAZIOS, NOVO_VAZIO, REF_VAZIO, montarRelatorio, previa } from "./comparativo";
import { montarPdfComparativo } from "./pdfComparativo";

// Physiq W26 — as contas da Calculadora são as MESMAS da de hoje (src/pages/Index.tsx + SectionBodyFat.tsx + TdeeTable.tsx, que saem):
// os números abaixo saem das fórmulas originais, escritas aqui de novo de forma independente.
const original = {
  mifflin: (g: "male" | "female", a: number, h: number, w: number) => (g === "male" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161),
  bf3: (g: "male" | "female", s: number, a: number) => {
    const d = g === "male" ? 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * a : 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * a;
    return (4.95 / d - 4.5) * 100;
  },
  bf7: (g: "male" | "female", s: number, a: number) => {
    const d = g === "male" ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * a : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * a;
    return (4.95 / d - 4.5) * 100;
  },
};

describe("Calculadora — as fórmulas de hoje", () => {
  it("TMB de Mifflin-St Jeor (sem arredondar), null sem dado", () => {
    expect(tmbMifflin("male", 30, 180, 80)).toBe(original.mifflin("male", 30, 180, 80));
    expect(tmbMifflin("female", 25, 165, 60)).toBe(original.mifflin("female", 25, 165, 60));
    expect(Math.round(tmbMifflin("male", 30, 180, 80)!)).toBe(1780);
    expect(tmbMifflin("male", 0, 180, 80)).toBeNull();
  });
  it("% gordura por 3 e por 7 dobras (Jackson & Pollock + Siri)", () => {
    expect(gordura3Dobras("male", 45, 30)).toBeCloseTo(original.bf3("male", 45, 30), 10);
    expect(gordura3Dobras("female", 60, 28)).toBeCloseTo(original.bf3("female", 60, 28), 10);
    expect(gordura7Dobras("male", 70, 30)).toBeCloseTo(original.bf7("male", 70, 30), 10);
    expect(gordura7Dobras("female", 90, 28)).toBeCloseTo(original.bf7("female", 90, 28), 10);
    expect(gordura3Dobras("male", 0.0001, 0)).toBeNull(); // fora de 0–100
  });
  it("resultado das dobras: massas e TMB específico (Katch-McArdle) — só com tudo preenchido", () => {
    const r = resultadoDobras("3", "male", [15, 20, 10], 30, 80)!;
    const bf = original.bf3("male", 45, 30);
    expect(r.bf).toBeCloseTo(bf, 10);
    expect(r.massaGorda).toBeCloseTo(80 * (bf / 100), 10);
    expect(r.massaMagra).toBeCloseTo(80 - 80 * (bf / 100), 10);
    expect(r.tmbKatch).toBeCloseTo(370 + 21.6 * (80 - 80 * (bf / 100)), 10);
    expect(resultadoDobras("3", "male", [15, 0, 10], 30, 80)).toBeNull();
    expect(resultadoDobras("7", "male", [5, 5, 5, 5, 5, 5], 30, 80)).toBeNull();
    expect(resultadoDobras("7", "male", [5, 5, 5, 5, 5, 5, 5], 30, 80)?.bf).toBeCloseTo(original.bf7("male", 35, 30), 10);
    expect(resultadoDobras("3", "male", [15, 20, 10], 0, 80)).toBeNull();
  });
  it("níveis de atividade e rótulos das dobras iguais aos de hoje", () => {
    expect(NIVEIS_ATIVIDADE.map((n) => n.fator)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
    expect(DOBRAS_3.male).toEqual(["Peitoral", "Abdômen", "Coxa"]);
    expect(DOBRAS_3.female).toEqual(["Tríceps", "Supra-ilíaca", "Coxa"]);
    expect(DOBRAS_7).toHaveLength(7);
  });
  it("o PDF leva as dobras do protocolo ATIVO (as 7 também), sem acento", () => {
    expect(dobrasDoPdf("3", "male", [15, 20, 10])).toEqual({ labels: ["Peitoral", "Abdomen", "Coxa"], values: [15, 20, 10] });
    expect(dobrasDoPdf("7", "female", [1, 2, 3, 4, 5, 6, 7])?.labels).toEqual(["Peitoral", "Axilar Media", "Triceps", "Subescapular", "Abdomen", "Supra-iliaca", "Coxa"]);
    expect(dobrasDoPdf("3", "male", [15, 0, 10])).toBeUndefined();
  });
  it("números digitados com vírgula, classificação e variação", () => {
    expect(numero("72,5")).toBe(72.5);
    expect(numero("")).toBe(0);
    expect(classificacao(12, "male", 30).label).toBe("Atleta");
    expect(classificacao(30, "female", 45).ajuste).toBe(2);
    expect(textoVariacao(1.25, 1)).toBe("+1,3");
    expect(textoVariacao(-0.8, 1)).toBe("-0,8");
    expect(textoVariacao(0, 1)).toBe("= 0");
    expect(tomVariacao(-1, true)).toBe("bom");
    expect(tomVariacao(-1, false)).toBe("ruim");
    expect(tomVariacao(0, false)).toBe("igual");
  });
});

/** O texto que o jsPDF escreveu nas páginas (operadores "(...) Tj"), sem os escapes. */
const textos = (doc: jsPDF): string =>
  ((doc as unknown as { internal: { pages: string[][] } }).internal.pages
    .slice(1)
    .map((p) => p.join("\n"))
    .join("\n")
    .match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [])
    .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"))
    .join("\n");

describe("Calculadora — comparativo e os PDFs (marca PHYSIQ)", () => {
  const ref = { ...REF_VAZIO, nome: "Lucas", peso: 82 as const, pctGordura: 18 as const, medidas: { ...medidasVazias, cintura: 88 } };
  const novo = { ...NOVO_VAZIO, peso: 80 as const, pctGordura: 15 as const, medidas: { ...medidasVazias, cintura: 84 } };
  const comuns = { ...DADOS_VAZIOS, idade: 30 as const, altura: 180 as const };

  it("relatório: as linhas e as medidas de hoje", () => {
    const r = montarRelatorio(ref, novo, comuns);
    expect(r.composicao.map((l) => l.lbl)).toEqual(["Peso", "% Gordura", "Massa Gorda", "Massa Magra", "TMB Mifflin", "TMB Katch"]);
    expect(r.composicao[0]).toMatchObject({ r: "82.0 kg", n: "80.0 kg", d: -2 });
    expect(r.medidas.map((m) => m.key)).toEqual(["cintura"]);
    expect(r.medidas[0].delta).toBe(-4);
    expect(montarRelatorio(REF_VAZIO, NOVO_VAZIO, DADOS_VAZIOS).idade).toBe(25);
    expect(previa(80, 15, "M", 30)?.mm).toBeCloseTo(68, 10);
    expect(previa("", 15, "M", 30)).toBeNull();
  });

  it("PDF do comparativo: cabeçalho PHYSIQ · COMPARATIVO, as linhas e o nome do arquivo de hoje", () => {
    const { doc, nomeArquivo } = montarPdfComparativo(ref, novo, comuns);
    const t = textos(doc);
    expect(t).toMatch(/^PHYSIQ\nCOMPARATIVO/);
    expect(t).toContain("Lucas - Masculino, 30 anos, 180 cm");
    expect(t).toContain("82.0 kg -> 80.0 kg");
    expect(t).toContain("MEDIDAS CORPORAIS (CM)");
    expect(t).toContain("88.0 -> 84.0");
    expect(t).toContain("Physiq - Bertoldo Performance");
    expect(t).not.toMatch(/physiqnutri/i);
    expect(nomeArquivo).toBe("Comparativo Lucas.pdf");
  });
});
