import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import { montarPDFProntuario } from "./prontuarioPdf";

/** O texto que o jsPDF escreveu nas páginas (operadores "(...) Tj"), sem os escapes. */
const pedacos = (doc: jsPDF): string[] =>
  (doc as unknown as { internal: { pages: string[][] } }).internal.pages
    .slice(1)
    .map((p) => p.join("\n"))
    .join("\n")
    .match(/\((?:\\.|[^\\)])*\)\s*Tj/g)!
    .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"));
/** uma linha por "Tj" (o texto corrido com **negrito** sai palavra a palavra: `corrido` junta tudo) */
const textos = (doc: jsPDF): string => pedacos(doc).join("\n");
const corrido = (doc: jsPDF): string => pedacos(doc).join("");

const base = {
  paciente: "Rafael Moura",
  nascimento: "1998-03-10",
  nutricionista: "Camila Rocha",
  emitidoEm: new Date(2026, 6, 20, 9, 30),
};

describe("W18 — PDF do prontuário inteiro (o de hoje, com a marca Physiq)", () => {
  it("cabeçalho, nascimento, nutricionista, emitido em e os registros por mês — sem autor, a linha da data é a de hoje", () => {
    const doc = montarPDFProntuario({
      ...base,
      registros: [
        { data: new Date(2026, 6, 16, 10, 0).toISOString(), texto: "Subiu a carga do supino.", created_at: new Date(2026, 6, 16, 10, 1).toISOString() },
        { data: new Date(2026, 5, 14, 8, 0).toISOString(), texto: "## Avaliação\n- gordura **17,8%**", created_at: new Date(2026, 5, 14, 8, 1).toISOString() },
      ],
    });
    const t = textos(doc);
    expect(t).toMatch(/PHYSIQ . PRONTU.RIO DO PACIENTE/);
    expect(t).not.toMatch(/PHYSIQNUTRI/);
    expect(t).toContain("Rafael Moura");
    expect(t).toContain("Nutricionista: Camila Rocha");
    expect(t).toMatch(/Emitido em 20\/07\/2026 09:30 .* 2 registros/);
    expect(t).toContain("16/07/2026 10:00");
    expect(t).not.toContain("16/07/2026 10:00 ·");
    expect(corrido(doc)).toContain("Subiu a carga do supino.");
    expect(t).toContain("17,8%");
    expect(t).toMatch(/Rafael Moura . Prontu.rio . 20\/07\/2026/);
  });

  it("anotação de outra pessoa da equipe: o autor ao lado da data; quem emite pode ser \"Profissional\"", () => {
    const doc = montarPDFProntuario({
      ...base,
      nutricionista: "Lucas Ferreira",
      rotuloProfissional: "Profissional",
      registros: [
        { data: new Date(2026, 6, 2, 11, 15).toISOString(), texto: "Plano ajustado.", created_at: new Date(2026, 6, 2, 11, 16).toISOString(), autor: "Camila Rocha (nutricionista)" },
      ],
    });
    const t = textos(doc);
    expect(t).toContain("Profissional: Lucas Ferreira");
    expect(t).toMatch(/02\/07\/2026 11:15 . Camila Rocha \(nutricionista\)/);
  });
});
