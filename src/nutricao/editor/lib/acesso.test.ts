import { describe, expect, it } from "vitest";
import { acessoDaDieta, secaoDaUrl } from "./acesso";

const eu = (x: Partial<{ id: string; dono: boolean; personal: boolean; nutricionista: boolean; master: boolean }>) => ({
  id: "eu", dono: false, personal: false, nutricionista: false, master: false, ...x,
});

describe("quem vê e quem muda a dieta (spec 4.1)", () => {
  it("nutricionista responsável muda; outra nutri da conta (sem ser dona) só vê o plano", () => {
    expect(acessoDaDieta({ eu: eu({ nutricionista: true }), nutricionista: { id: "eu", nome: "Camila" }, conta_id: "c" })).toBe("editar");
    expect(acessoDaDieta({ eu: eu({ nutricionista: true }), nutricionista: { id: "outra", nome: "X" }, conta_id: "c" })).toBe("so-plano");
  });
  it("dono com papel de nutricionista muda; dono sem o papel só vê (tudo)", () => {
    expect(acessoDaDieta({ eu: eu({ dono: true, nutricionista: true }), nutricionista: { id: "outra", nome: "X" }, conta_id: "c" })).toBe("editar");
    expect(acessoDaDieta({ eu: eu({ dono: true, personal: true }), nutricionista: { id: "outra", nome: "X" }, conta_id: "c" })).toBe("ver");
  });
  it("personal responsável vê só o plano e a adesão; master muda", () => {
    expect(acessoDaDieta({ eu: eu({ personal: true }), nutricionista: { id: "n", nome: "N" }, conta_id: "c" })).toBe("so-plano");
    expect(acessoDaDieta({ eu: eu({ master: true }), nutricionista: null, conta_id: "c" })).toBe("editar");
  });
  it("paciente sem conta (site antigo): a nutri dona muda", () => {
    expect(acessoDaDieta({ eu: eu({}), nutricionista: { id: "eu", nome: "N" }, conta_id: null })).toBe("editar");
  });
});

describe("seção da aba Dieta pela URL (atalhos do Fluxo de consulta — W14)", () => {
  const s = (q: string) => secaoDaUrl(new URLSearchParams(q));
  it("?secao= escolhe; os atalhos abrem a seção do formulário; o resto cai no plano", () => {
    expect(s("secao=metas")).toBe("metas");
    expect(s("nova=orientacao")).toBe("orientacoes");
    expect(s("novo=manipulado")).toBe("manipulados");
    expect(s("novo=plano")).toBe("planejamento");
    expect(s("secao=qualquer")).toBe("planejamento");
    expect(s("")).toBe("planejamento");
  });
});
