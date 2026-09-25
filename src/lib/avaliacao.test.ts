import { describe, expect, it } from "vitest";
import {
  calcularComposicao, colunasDoMetodo, dadosBalanca, gordura3Dobras, gordura7Dobras, metodoDe, rotuloMetodo,
  rotulosDobras, tmbEscolhida, tmbMifflin, tmbValida, valoresDoRegistro, valoresVazios,
} from "./avaliacao";

const homem = { sexo: "male" as const, idade: 29, peso: 83, altura: 178 };

describe("método da avaliação", () => {
  it("registro antigo (sem método) é de 3 dobras", () => {
    expect(metodoDe(null)).toBe("dobras_3");
    expect(metodoDe("qualquer")).toBe("dobras_3");
    expect(rotuloMetodo("bioimpedancia")).toBe("Bioimpedância");
  });

  it("rótulos das dobras por método e sexo", () => {
    expect(rotulosDobras("dobras_3", "male")).toEqual(["Peitoral", "Abdômen", "Coxa"]);
    expect(rotulosDobras("dobras_3", "female")).toEqual(["Tríceps", "Supra-ilíaca", "Coxa"]);
    expect(rotulosDobras("dobras_7", "female")).toEqual(
      ["Peitoral", "Axilar média", "Tríceps", "Subescapular", "Abdômen", "Supra-ilíaca", "Coxa"]);
    expect(rotulosDobras("bioimpedancia", "male")).toEqual([]);
  });
});

describe("fórmulas", () => {
  it("Jackson & Pollock 3 e 7 dobras (Siri)", () => {
    expect(gordura3Dobras("male", 30, 29)).toBeCloseTo(8.9476, 3);
    expect(gordura3Dobras("female", 45, 35)).toBeCloseTo(19.3736, 3);
    expect(gordura7Dobras("male", 70, 29)).toBeCloseTo(10.0859, 3);
    expect(gordura7Dobras("female", 100, 35)).toBeCloseTo(20.9176, 3);
  });

  it("Mifflin-St Jeor", () => {
    expect(tmbMifflin("male", 83, 178, 29)).toBe(1802.5);
    expect(tmbMifflin("female", 60, 165, 35)).toBe(1295.25);
  });
});

describe("calcularComposicao", () => {
  it("3 dobras: % gordura, massas e as TMBs", () => {
    const v = { ...valoresVazios("dobras_3"), dobras3: ["10", "12", "8"] };
    const c = calcularComposicao(v, homem);
    expect(c.bf).toBeCloseTo(8.9476, 3);
    expect(c.massaGorda).toBeCloseTo(7.4265, 3);
    expect(c.massaMagra).toBeCloseTo(75.5735, 3);
    expect(c.tmbMifflin).toBe(1802.5);
    expect(c.tmbKatch).toBeCloseTo(2002.3867, 3);
    expect(c.tmbBalanca).toBeNull();
  });

  it("7 dobras só calcula com as 7 preenchidas", () => {
    const v = { ...valoresVazios("dobras_7"), dobras7: ["10", "10", "10", "10", "10", "10", ""] };
    expect(calcularComposicao(v, homem).bf).toBeNull();
    v.dobras7[6] = "10";
    expect(calcularComposicao(v, homem).bf).toBeCloseTo(10.0859, 3);
  });

  it("dobras sem idade não calculam o % de gordura", () => {
    const v = { ...valoresVazios("dobras_3"), dobras3: ["10", "12", "8"] };
    expect(calcularComposicao(v, { ...homem, idade: null }).bf).toBeNull();
  });

  it("bioimpedância usa o % e a TMB da balança", () => {
    const v = valoresVazios("bioimpedancia");
    v.bio = { percentual_gordura: "15", massa_muscular: "38.4", agua_corporal: "56", gordura_visceral: "7", tmb_balanca: "1850" };
    const c = calcularComposicao(v, homem);
    expect(c.bf).toBe(15);
    expect(c.massaGorda).toBeCloseTo(12.45, 5);
    expect(c.massaMagra).toBeCloseTo(70.55, 5);
    expect(c.tmbKatch).toBeCloseTo(370 + 21.6 * 70.55, 5);
    expect(c.tmbBalanca).toBe(1850);
  });

  it("dobras (3 ou 7) nunca trazem TMB da balança", () => {
    const v = { ...valoresVazios("dobras_3"), dobras3: ["10", "12", "8"] };
    v.bio.tmb_balanca = "1900";
    expect(calcularComposicao(v, homem).tmbBalanca).toBeNull();
  });
});

describe("gravar e reabrir", () => {
  it("grava só as colunas do método ativo; o resto vai null", () => {
    const v = { ...valoresVazios("dobras_3"), dobras3: ["10", "12", "8"] };
    v.dobras7 = ["1", "2", "3", "4", "5", "6", "7"];
    v.bio.massa_muscular = "40";
    expect(colunasDoMetodo(v)).toEqual({
      metodo_avaliacao: "dobras_3", dobra_1: 10, dobra_2: 12, dobra_3: 8,
      dobra_4: null, dobra_5: null, dobra_6: null, dobra_7: null,
      massa_muscular: null, agua_corporal: null, gordura_visceral: null, tmb_balanca: null,
    });
    const bio = valoresVazios("bioimpedancia");
    bio.bio = { percentual_gordura: "15", massa_muscular: "38.4", agua_corporal: "56", gordura_visceral: "7", tmb_balanca: "1850" };
    expect(colunasDoMetodo(bio)).toMatchObject({
      metodo_avaliacao: "bioimpedancia", dobra_1: null, dobra_7: null,
      massa_muscular: 38.4, agua_corporal: 56, gordura_visceral: 7, tmb_balanca: 1850,
    });
  });

  it("reabre o formulário no método salvo", () => {
    const sete = valoresDoRegistro({ metodo_avaliacao: "dobras_7", dobra_1: 5, dobra_2: 6, dobra_3: 7, dobra_4: 8, dobra_5: 9, dobra_6: 10, dobra_7: 11 });
    expect(sete.metodo).toBe("dobras_7");
    expect(sete.dobras7).toEqual(["5", "6", "7", "8", "9", "10", "11"]);
    expect(sete.dobras3).toEqual(["", "", ""]);
    const antigo = valoresDoRegistro({ metodo_avaliacao: null, dobra_1: 10, dobra_2: 12, dobra_3: 8 });
    expect(antigo.metodo).toBe("dobras_3");
    expect(antigo.dobras3).toEqual(["10", "12", "8"]);
    const bio = valoresDoRegistro({ metodo_avaliacao: "bioimpedancia", percentual_gordura: 15, massa_muscular: 38.4, tmb_balanca: 1850 });
    expect(bio.bio).toMatchObject({ percentual_gordura: "15", massa_muscular: "38.4", agua_corporal: "", tmb_balanca: "1850" });
  });
});

describe("TMB escolhida", () => {
  const comTodas = { bf: 15, massaGorda: 12, massaMagra: 70, tmbMifflin: 1800, tmbKatch: 1880, tmbBalanca: 1850 };

  it("só vale a escolha que tem valor; senão Mifflin", () => {
    expect(tmbValida("katch", comTodas)).toBe("katch");
    expect(tmbValida("balanca", comTodas)).toBe("balanca");
    expect(tmbValida("katch", { ...comTodas, tmbKatch: null })).toBe("mifflin");
    expect(tmbValida("balanca", { ...comTodas, tmbBalanca: null })).toBe("mifflin");
  });

  it("registro salvo mostra só a escolhida, com Mifflin de reserva", () => {
    expect(tmbEscolhida({ tmb_metodo: "katch", tmb_mifflin: 1803, tmb_katch: 1969 })).toEqual({ metodo: "katch", label: "Katch-McArdle", valor: 1969 });
    expect(tmbEscolhida({ tmb_metodo: "balanca", tmb_mifflin: 1803, tmb_balanca: 1850 })).toMatchObject({ label: "Balança", valor: 1850 });
    expect(tmbEscolhida({ tmb_metodo: null, tmb_mifflin: 1803, tmb_katch: 1969 })).toMatchObject({ metodo: "mifflin", valor: 1803 });
    expect(tmbEscolhida({ tmb_metodo: "katch", tmb_mifflin: 1803, tmb_katch: null })).toMatchObject({ metodo: "mifflin", valor: 1803 });
  });
});

describe("dadosBalanca", () => {
  it("só na bioimpedância e só os preenchidos", () => {
    expect(dadosBalanca({ metodo_avaliacao: "dobras_3", massa_muscular: 40 })).toEqual([]);
    expect(dadosBalanca({ metodo_avaliacao: "bioimpedancia", massa_muscular: 38.4, agua_corporal: 56, gordura_visceral: 7 }))
      .toEqual([
        { key: "massa_muscular", label: "Massa muscular", valor: "38.4 kg" },
        { key: "agua_corporal", label: "Água corporal", valor: "56.0%" },
        { key: "gordura_visceral", label: "Gordura visceral", valor: "nível 7" },
      ]);
  });
});
