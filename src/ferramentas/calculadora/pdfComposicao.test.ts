import { describe, expect, it, vi } from "vitest";
import type { jsPDF as JsPDF } from "jspdf";
import { medidasVazias } from "@/types/medidas";
import { dobrasDoPdf, resultadoDobras } from "./calculos";

// Physiq W26 — o PDF da composição corporal é o generateReport de hoje (src/lib/generateReport.ts, sem mudança): marca PHYSIQ, mesmo
// desenho; a calculadora nova passa as dobras do protocolo ATIVO (as 7 também — a de hoje só levava as 3). O jsPDF chama `save` na
// instância: aqui ele vira um espião que guarda o documento em vez de baixar.
const h = vi.hoisted(() => ({ docs: [] as Array<{ doc: unknown; nome: string }> }));
vi.mock("jspdf", async (importOriginal) => {
  const mod = (await importOriginal()) as { default: new (...a: unknown[]) => object } & Record<string, unknown>;
  const Original = mod.default;
  class Espiao extends (Original as new (...a: unknown[]) => { save: (n: string) => unknown }) {
    constructor(...a: unknown[]) {
      super(...a);
      this.save = (nome: string) => {
        h.docs.push({ doc: this, nome });
        return this;
      };
    }
  }
  Object.assign(Espiao, Original);
  return { ...mod, default: Espiao, jsPDF: Espiao };
});

const textos = (doc: JsPDF): string =>
  ((doc as unknown as { internal: { pages: string[][] } }).internal.pages
    .slice(1)
    .map((p) => p.join("\n"))
    .join("\n")
    .match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [])
    .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"))
    .join("\n");

describe("Calculadora — PDF da composição (marca PHYSIQ)", () => {
  it("3 dobras: PHYSIQ · COMPOSICAO CORPORAL, os dados, as dobras e o arquivo de hoje", async () => {
    const { generateReport } = await import("@/lib/generateReport");
    h.docs.length = 0;
    generateReport({
      name: "Lucas", gender: "male", age: 30, height: 180, weight: 80, tmbMifflin: 1780,
      bodyFatResult: resultadoDobras("3", "male", [15, 20, 10], 30, 80), medidas: { ...medidasVazias, cintura: 84 },
      dobras: dobrasDoPdf("3", "male", [15, 20, 10]),
    });
    expect(h.docs).toHaveLength(1);
    expect(h.docs[0].nome).toBe("Relatorio Physiq do Lucas.pdf");
    const t = textos(h.docs[0].doc as JsPDF);
    expect(t).toMatch(/^PHYSIQ\nCOMPOSICAO CORPORAL/);
    expect(t).toContain("TMB MIFFLIN-ST JEOR");
    expect(t).toContain("1780 kcal/dia");
    expect(t).toContain("PEITORAL");
    expect(t).toContain("84.0 cm");
    expect(t).toContain("Physiq - Bertoldo Performance");
  });

  it("7 dobras: as 7 entram no PDF", async () => {
    const { generateReport } = await import("@/lib/generateReport");
    h.docs.length = 0;
    const dobras = [5, 6, 7, 8, 9, 10, 11];
    generateReport({
      name: "Lucas", gender: "male", age: 30, height: 180, weight: 80, tmbMifflin: 1780,
      bodyFatResult: resultadoDobras("7", "male", dobras, 30, 80), medidas: { ...medidasVazias }, dobras: dobrasDoPdf("7", "male", dobras),
    });
    const t = textos(h.docs[0].doc as JsPDF);
    expect(t).toContain("AXILAR MEDIA");
    expect(t).toContain("SUBESCAPULAR");
    expect(t).toContain("11 mm");
  });
});
