import { beforeEach, describe, expect, it } from "vitest";
import { capturarProfDaUrl, codigoDoDeepLink, lerProfPendente } from "@/lib/profPendente";
import { oQueGanha, rotuloDoTipo } from "./vinculo";

describe("W7 — popup 'confirmar o profissional': o tipo e o que o aluno ganha", () => {
  it("o tipo de perfil da W4/W5; sem ele (professor antigo do Calc), pelo papel na conta", () => {
    const p = (tipo: string | null, papeis: string[] = []) => ({ nome: "X", foto_url: null, tipo_perfil: tipo as never, papeis: papeis as never });
    expect(rotuloDoTipo(p("nutricionista"))).toBe("Nutricionista");
    expect(rotuloDoTipo(p("personal"))).toBe("Personal trainer (Ed. Física)");
    expect(rotuloDoTipo(p("academico"))).toBe("Acadêmico de Nutrição");
    expect(rotuloDoTipo(p("outra_area"))).toBe("Outra área");
    expect(rotuloDoTipo(p(null, ["personal"]))).toBe("Personal trainer (Ed. Física)");
    expect(rotuloDoTipo(p(null, ["nutricionista"]))).toBe("Nutricionista");
    expect(rotuloDoTipo(p(null, ["personal", "nutricionista"]))).toBe("Personal e nutricionista");
    expect(rotuloDoTipo(null)).toBe("");
  });
  it("o que vem com o vínculo", () => {
    expect(oQueGanha(["treino"])).toBe("o treino");
    expect(oQueGanha(["nutricao"])).toBe("a dieta");
    expect(oQueGanha(["treino", "nutricao"])).toBe("o treino e a dieta");
    expect(oQueGanha([])).toBe("o acompanhamento");
  });
});

describe("W7 — link do profissional (?prof=) no site e no APK", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });
  it("site: guarda o código e tira o ?prof= da barra (recarregar não traz de volta o que foi cancelado)", () => {
    window.history.replaceState(null, "", "/entrar?prof=prof-lucas-ferreira&x=1#topo");
    expect(capturarProfDaUrl()).toBe("PROF-LUCAS-FERREIRA");
    expect(lerProfPendente()).toBe("PROF-LUCAS-FERREIRA");
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe("#topo");
    expect(capturarProfDaUrl()).toBeNull();
  });
  it("APK: só o esquema do app com ?prof= vale (a volta do login não)", () => {
    expect(codigoDoDeepLink("com.bertoldo.physiqcalc://vincular?prof=prof-lucas")).toBe("PROF-LUCAS");
    expect(codigoDoDeepLink("com.bertoldo.physiqcalc://?prof=PROF-X#y")).toBe("PROF-X");
    expect(codigoDoDeepLink("com.bertoldo.physiqcalc://login-callback?code=abc")).toBeNull();
    expect(codigoDoDeepLink("https://physiqcalc.com.br/?prof=PROF-X")).toBeNull();
    expect(codigoDoDeepLink(null)).toBeNull();
  });
});
