import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import { montarPDFReceita } from "./receitasPdf";

/** O texto que o jsPDF escreveu nas páginas (operadores "(...) Tj"), sem os escapes. */
const textos = (doc: jsPDF): string =>
  ((doc as unknown as { internal: { pages: string[][] } }).internal.pages
    .slice(1)
    .map((p) => p.join("\n"))
    .join("\n")
    .match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [])
    .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"))
    .join("\n");

const ALIMENTO = { id: "a1", nome: "Atum, conserva em óleo", fonte: "taco", grupo: null, energia_kcal: 166, proteina_g: 26.2, carboidrato_g: 0, lipidio_g: 6, fibra_g: 0, sodio_mg: 362, medidas_caseiras: [] };

describe("W24 — PDF da receita com a marca PHYSIQ (como a W18/W19)", () => {
  it("cabeçalho PHYSIQ · RECEITA, ingredientes, valor nutricional por porção e modo de preparo — nada de PHYSIQNUTRI", () => {
    const doc = montarPDFReceita({
      nutricionista: "Camila Rocha",
      profissional: { crn: "CRN-3 12345", telefone: null, endereco: null },
      emitidoEm: new Date(2026, 9, 1, 19, 0),
      receita: {
        nome: "Bolinho de atum assado",
        grupo: "Lanches",
        porcoes: 4,
        rendimento_g: null,
        tempo_preparo_min: 30,
        modo_preparo: "## Preparo\n- Misture tudo\n- Asse por **25 min**",
        observacao: "Rende bem congelado",
        ingredientes: [{ alimento: ALIMENTO, quantidade_g: 200, medida_caseira_id: null, quantidade_medida: null, observacao: "escorrido" }],
      },
    });
    const t = textos(doc);
    expect(t).toMatch(/PHYSIQ . RECEITA/);
    expect(t).not.toMatch(/PHYSIQNUTRI/);
    expect(t).toContain("Bolinho de atum assado");
    expect(t).toContain("Nutricionista: Camila Rocha");
    expect(t).toContain("CRN-3 12345");
    expect(t).toMatch(/Atum, conserva em .leo/);
    expect(t).toMatch(/Rende bem congelado/);
  });
});
