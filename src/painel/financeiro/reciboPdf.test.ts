import { describe, expect, it, vi } from "vitest";
import type { jsPDF } from "jspdf";

vi.mock("@/lib/salvarPdf", () => ({ salvarPdf: vi.fn(async () => {}) }));

import { salvarPdf } from "@/lib/salvarPdf";
import { CONTEUDO_MODELO_PADRAO_NUTRI, padraoDoRecibo, rotuloAutor } from "./recibosUtil";
import { baixarPDFRecibo, montarPDFRecibo } from "./reciboPdf";
import { aplicarTags } from "@/financeiro/recibos";

/** O texto que o jsPDF escreveu nas páginas (operadores "(...) Tj"), sem os escapes. */
const textos = (doc: jsPDF): string[] =>
  (doc as unknown as { internal: { pages: string[][] } }).internal.pages
    .slice(1)
    .map((p) => p.join("\n"))
    .join("\n")
    .match(/\((?:\\.|[^\\)])*\)\s*Tj/g)!
    .map((t) => t.replace(/\)\s*Tj$/, "").slice(1).replace(/\\(.)/g, "$1"));

const texto = aplicarTags(CONTEUDO_MODELO_PADRAO_NUTRI, {
  nomePaciente: "Maria da Silva", cpf: "12345678909", valor: 180, data: "2026-09-19", numero: 7, nomeProfissional: "Camila Rocha",
});
const base = {
  numero: 7, valor: 180, data: "2026-09-19", descricao: "Consulta nutricional", texto, paciente: "Maria da Silva", profissional: "Camila Rocha",
  emitidoEm: new Date(2026, 8, 20, 9, 30),
};

describe("W19 — PDF do recibo (o de hoje do Nutri, com a marca Physiq)", () => {
  it("cabeçalho PHYSIQ · RECIBO, número, valor, extenso, referente/data/paciente, o texto gravado, assinatura com o título e o rodapé", () => {
    const t = textos(montarPDFRecibo(base));
    expect(t[0]).toBe("PHYSIQ · RECIBO");
    expect(t.join("\n")).not.toMatch(/PHYSIQNUTRI/);
    expect(t).toContain("Emitido em 20/09/2026 09:30");
    expect(t).toContain("RECIBO Nº 0007");
    expect(t).toContain("R$ 180,00");
    expect(t).toContain("(cento e oitenta reais)");
    expect(t.join(" ")).toContain("Referente a: Consulta nutricional   ·   Data: 19/09/2026   ·   Paciente: Maria da Silva");
    expect(t.join(" ")).toContain("Recebi de Maria da Silva, CPF 123.456.789-09, a quantia de R$ 180,00 (cento e oitenta reais), referente a atendimento");
    expect(t).toContain("[carimbo]");
    expect(t).toContain("Camila Rocha");
    expect(t).toContain("Nutricionista");
    expect(t).toContain("Maria da Silva · Recibo nº 0007 · 19/09/2026");
    expect(t).toContain("1/1");
  });

  it("recibo de outro membro: o autor sai ao lado da data e a assinatura é a de quem emitiu (com o título dele)", () => {
    const papeis = ["personal"];
    const p = padraoDoRecibo(papeis);
    const t = textos(montarPDFRecibo({ ...base, profissional: "Lucas Ferreira", rotuloProfissional: p.rotuloProfissional, rotuloPaciente: p.rotuloPaciente,
      autor: rotuloAutor("Lucas Ferreira", papeis) })).join(" ");
    expect(t).toContain("Data: 19/09/2026 · Lucas Ferreira (personal trainer)   ·   Aluno: Maria da Silva");
    expect(t).toContain("Personal trainer");
    expect(t).not.toContain("Nutricionista");
  });

  it("sem texto e sem nome: 'Sem texto.' e a linha da assinatura vazia (como hoje)", () => {
    const t = textos(montarPDFRecibo({ ...base, texto: "  \n ", profissional: null }));
    expect(t).toContain("Sem texto.");
    expect(t).toContain("Assinatura");
    expect(t).not.toContain("Nutricionista");
  });

  it("baixa pelo salvarPdf (no APK abre o compartilhar) com o nome de hoje", async () => {
    const nome = await baixarPDFRecibo(base);
    expect(nome).toBe("recibo-0007-maria-da-silva.pdf");
    expect(salvarPdf).toHaveBeenCalledWith(expect.anything(), "recibo-0007-maria-da-silva.pdf");
  });
});

describe("W19 — o padrão do recibo pelo papel", () => {
  it("só nutricionista = tudo do site antigo; personal e quem tem os 2 papéis = Physiq", () => {
    expect(padraoDoRecibo(["dono", "nutricionista"])).toMatchObject({ nutri: true, descricao: "Consulta nutricional", rotuloPaciente: "Paciente", rotuloProfissional: "Nutricionista" });
    expect(padraoDoRecibo(["dono", "nutricionista"]).conteudoModelo).toContain("referente a atendimento nutricional.");
    expect(padraoDoRecibo(["dono", "personal"])).toMatchObject({ nutri: false, descricao: "Atendimento", rotuloPaciente: "Aluno", rotuloProfissional: "Personal trainer" });
    expect(padraoDoRecibo(["dono", "personal", "nutricionista"])).toMatchObject({ nutri: false, rotuloProfissional: "Profissional" });
    expect(padraoDoRecibo(["dono", "personal"]).conteudoModelo).not.toContain("nutricional");
    expect(rotuloAutor("  ", ["nutricionista"])).toBe("Profissional (nutricionista)");
  });
});
