import { describe, expect, it } from "vitest";
import { gerarImpresso } from "./impressosPdf";
import { IMPRESSOS, cabecalhoPadrao } from "./impressosUtil";

// Gera os 7 PDFs de verdade (jsPDF roda no Node): o 'N páginas' do card tem que ser o número real de páginas.
describe("impressosPdf", () => {
  const ctx = cabecalhoPadrao("Ana Paula", new Date(2026, 8, 20, 10, 0));

  it("gera os 7 impressos com o número de páginas do catálogo", () => {
    for (const i of IMPRESSOS) {
      const doc = gerarImpresso(i.id, ctx);
      expect(doc.getNumberOfPages(), `${i.id}: páginas`).toBe(i.paginas);
    }
  });

  it("o PDF começa com %PDF, traz o nome da nutricionista e rejeita id desconhecido", () => {
    const saida = gerarImpresso("ficha-antropometrica", ctx).output();
    expect(saida.startsWith("%PDF")).toBe(true);
    expect(saida).toContain("Ana Paula");
    expect(saida).toContain("20/09/2026");
    expect(() => gerarImpresso("nao-existe", ctx)).toThrow(/desconhecido/);
  });
});

// W26: os mesmos 7 PDFs do site antigo, com a marca do Physiq no cabeçalho, no rodapé e na nota — nada de PhysiqNutri
describe("impressosPdf — marca Physiq (W26)", () => {
  const ctx = cabecalhoPadrao("Camila Rocha", new Date(2026, 9, 1, 22, 0));
  const textos = (doc: ReturnType<typeof gerarImpresso>): string =>
    ((doc as unknown as { internal: { pages: string[][] } }).internal.pages
      .slice(1)
      .map((p) => p.join("\n"))
      .join("\n")
      .match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [])
      .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"))
      .join("\n");

  it("cabeçalho PHYSIQ · IMPRESSO e rodapé 'Physiq · nome · data' nos 7, sem PhysiqNutri", () => {
    for (const i of IMPRESSOS) {
      const t = textos(gerarImpresso(i.id, ctx));
      expect(t, i.id).toMatch(/PHYSIQ . IMPRESSO/);
      expect(t, i.id).toMatch(/Physiq . Camila Rocha . 01\/10\/2026/);
      expect(t, i.id).not.toMatch(/physiqnutri/i);
    }
  });

  it("a nota do Código de ética fala da equipe do Physiq", () => {
    const t = textos(gerarImpresso("codigo-de-etica", ctx));
    expect(t).toMatch(/equipe do Physiq /);
  });
});
