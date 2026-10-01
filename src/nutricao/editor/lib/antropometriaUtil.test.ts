// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/antropometriaUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  calcular, calcularIMC, classificarIMC, densidadeCorporal, dobrasFaltando, dobrasNecessarias, formNovo, formParaRegistro, idadeEm, inserirOrdenada,
  lerMedidas, lerResultados, nomeArquivoPDF, numero, ordenarAntropometrias, percentualGordura, previaDoForm, registroParaForm, resumoAvaliacao,
  serieEvolucao, sexoDoGenero, siri, somaDobras, textoContagem, type FormAntropometria,
} from "./antropometriaUtil";

// Valores de referência conferidos à mão (calculadora) com as fórmulas publicadas.

const form = (extra: Partial<FormAntropometria> = {}): FormAntropometria => ({
  data: "2026-09-19",
  hora: "10:30",
  peso: "80",
  altura: "180",
  sexo: "masculino",
  idade: "30",
  protocolo: "pollock3",
  circunferencias: { cintura: "80", quadril: "100" },
  dobras: { peitoral: "10", abdominal: "20", coxa: "15" },
  observacao: "",
  ...extra,
});

describe("números", () => {
  it("aceita vírgula e ponto; vazio/inválido vira null", () => {
    expect(numero("70,5")).toBe(70.5);
    expect(numero("70.5")).toBe(70.5);
    expect(numero(" 80 ")).toBe(80);
    expect(numero(80)).toBe(80);
    expect(numero("")).toBeNull();
    expect(numero("abc")).toBeNull();
    expect(numero(null)).toBeNull();
  });

  it("lê um jsonb de medidas só com números positivos", () => {
    expect(lerMedidas({ cintura: 80, quadril: "100", ombro: -1, torax: "x", coxa_d: 0 })).toEqual({ cintura: 80, quadril: 100 });
    expect(lerMedidas(null)).toEqual({});
    expect(lerMedidas([1, 2])).toEqual({});
  });

  it("lê resultados tolerando chaves faltando", () => {
    expect(lerResultados({ imc: 24.69, classificacao_imc: "Peso normal", rcq: "x" })).toEqual({
      imc: 24.69, classificacao_imc: "Peso normal", densidade: null, percentual_gordura: null, massa_gorda: null, massa_magra: null, rcq: null, rce: null,
    });
  });
});

describe("IMC", () => {
  it("calcula com 2 casas e classifica pela OMS", () => {
    expect(calcularIMC(80, 180)).toBe(24.69);
    expect(calcularIMC(95, 170)).toBe(32.87);
    expect(calcularIMC(null, 180)).toBeNull();
    expect(calcularIMC(80, 0)).toBeNull();
    expect(classificarIMC(17)).toBe("Abaixo do peso");
    expect(classificarIMC(18.5)).toBe("Peso normal");
    expect(classificarIMC(24.99)).toBe("Peso normal");
    expect(classificarIMC(25)).toBe("Sobrepeso");
    expect(classificarIMC(30)).toBe("Obesidade grau I");
    expect(classificarIMC(37)).toBe("Obesidade grau II");
    expect(classificarIMC(42)).toBe("Obesidade grau III");
  });
});

describe("dobras por protocolo", () => {
  it("cada protocolo pede as dobras certas (Pollock 3 e Guedes mudam com o sexo)", () => {
    expect(dobrasNecessarias("pollock3", "masculino")).toEqual(["peitoral", "abdominal", "coxa"]);
    expect(dobrasNecessarias("pollock3", "feminino")).toEqual(["triceps", "suprailiaca", "coxa"]);
    expect(dobrasNecessarias("pollock7", "feminino")).toHaveLength(7);
    expect(dobrasNecessarias("faulkner", "")).toEqual(["triceps", "subescapular", "suprailiaca", "abdominal"]);
    expect(dobrasNecessarias("guedes", "masculino")).toEqual(["triceps", "suprailiaca", "abdominal"]);
    expect(dobrasNecessarias("guedes", "feminino")).toEqual(["coxa", "suprailiaca", "subescapular"]);
    expect(dobrasNecessarias("nenhum", "masculino")).toEqual([]);
  });

  it("soma só quando todas as dobras pedidas existem", () => {
    expect(somaDobras({ peitoral: 10, abdominal: 20, coxa: 15 }, ["peitoral", "abdominal", "coxa"])).toBe(45);
    expect(somaDobras({ peitoral: 10, abdominal: 20 }, ["peitoral", "abdominal", "coxa"])).toBeNull();
    expect(somaDobras({ peitoral: 10 }, [])).toBeNull();
  });

  it("avisa quais dobras do protocolo faltam", () => {
    expect(dobrasFaltando(form())).toEqual([]);
    expect(dobrasFaltando(form({ dobras: { peitoral: "10" } }))).toEqual(["Abdominal", "Coxa"]);
    expect(dobrasFaltando(form({ protocolo: "nenhum", dobras: {} }))).toEqual([]);
  });
});

describe("fórmulas de gordura", () => {
  it("Siri", () => {
    expect(siri(1.05)).toBe(21.43);
  });

  it("Jackson & Pollock 3 dobras — homem (S=45, 30 anos)", () => {
    const d = densidadeCorporal("pollock3", "masculino", 30, { peitoral: 10, abdominal: 20, coxa: 15 });
    expect(d).toBeCloseTo(1.0677, 3);
    const r = percentualGordura("pollock3", "masculino", 30, { peitoral: 10, abdominal: 20, coxa: 15 });
    expect(r.densidade).toBeCloseTo(1.0677, 3);
    expect(r.percentual).toBeCloseTo(13.61, 1);
  });

  it("Jackson & Pollock 3 dobras — mulher (S=47, 25 anos)", () => {
    const r = percentualGordura("pollock3", "feminino", 25, { triceps: 15, suprailiaca: 12, coxa: 20 });
    expect(r.percentual).toBeCloseTo(19.45, 1);
  });

  it("Jackson & Pollock 7 dobras (S=100, 30 anos)", () => {
    const sete = { peitoral: 10, axilar_media: 12, triceps: 14, subescapular: 16, abdominal: 20, suprailiaca: 13, coxa: 15 };
    expect(percentualGordura("pollock7", "masculino", 30, sete).percentual).toBeCloseTo(14.63, 1);
    expect(percentualGordura("pollock7", "feminino", 30, sete).percentual).toBeCloseTo(20.63, 1);
  });

  it("Faulkner (S=52) dá o % direto, sem densidade", () => {
    const r = percentualGordura("faulkner", "", null, { triceps: 10, subescapular: 12, suprailiaca: 14, abdominal: 16 });
    expect(r.densidade).toBeNull();
    expect(r.percentual).toBeCloseTo(13.74, 1);
  });

  it("Guedes — homem (S=45) e mulher (S=47)", () => {
    expect(percentualGordura("guedes", "masculino", null, { triceps: 10, suprailiaca: 15, abdominal: 20 }).percentual).toBeCloseTo(16.76, 1);
    expect(percentualGordura("guedes", "feminino", null, { coxa: 20, suprailiaca: 15, subescapular: 12 }).percentual).toBeCloseTo(22.15, 1);
  });

  it("sem sexo ou idade (quando o protocolo precisa) não calcula", () => {
    expect(percentualGordura("pollock3", "", 30, { peitoral: 10, abdominal: 20, coxa: 15 }).percentual).toBeNull();
    expect(percentualGordura("pollock3", "masculino", null, { peitoral: 10, abdominal: 20, coxa: 15 }).percentual).toBeNull();
    expect(percentualGordura("guedes", "", null, { triceps: 10, suprailiaca: 15, abdominal: 20 }).percentual).toBeNull();
    expect(percentualGordura("nenhum", "masculino", 30, { peitoral: 10 }).percentual).toBeNull();
  });
});

describe("calcular (tudo junto)", () => {
  it("IMC, gordura, massas, RCQ e RCE", () => {
    const r = calcular({ peso: 80, altura: 180, sexo: "masculino", idade: 30, protocolo: "pollock3", circunferencias: { cintura: 80, quadril: 100 }, dobras: { peitoral: 10, abdominal: 20, coxa: 15 } });
    expect(r.imc).toBe(24.69);
    expect(r.classificacao_imc).toBe("Peso normal");
    expect(r.percentual_gordura).toBeCloseTo(13.61, 1);
    expect(r.massa_gorda).toBeCloseTo(10.89, 1);
    expect(r.massa_magra).toBeCloseTo(69.11, 1);
    expect(r.rcq).toBe(0.8);
    expect(r.rce).toBe(0.44);
  });

  it("sem protocolo só mede; sem altura não tem IMC nem RCE", () => {
    const r = calcular({ peso: 80, altura: null, sexo: "", idade: null, protocolo: "nenhum", circunferencias: { cintura: 80 }, dobras: {} });
    expect(r).toEqual({ imc: null, classificacao_imc: null, densidade: null, percentual_gordura: null, massa_gorda: null, massa_magra: null, rcq: null, rce: null });
  });
});

describe("idade e sexo do cadastro", () => {
  it("idade completa na data da avaliação", () => {
    expect(idadeEm("1990-05-10", new Date(2026, 8, 19))).toBe(36);
    expect(idadeEm("1990-09-20", new Date(2026, 8, 19))).toBe(35);
    expect(idadeEm("1990-09-19", new Date(2026, 8, 19))).toBe(36);
    expect(idadeEm(null, new Date(2026, 8, 19))).toBeNull();
    expect(idadeEm("abc", new Date(2026, 8, 19))).toBeNull();
    expect(idadeEm("2030-01-01", new Date(2026, 8, 19))).toBeNull();
  });

  it("gênero → sexo da avaliação", () => {
    expect(sexoDoGenero("masculino")).toBe("masculino");
    expect(sexoDoGenero("feminino")).toBe("feminino");
    expect(sexoDoGenero("outro")).toBe("");
    expect(sexoDoGenero(null)).toBe("");
  });
});

describe("formulário ⇄ registro", () => {
  it("formulário vira registro com números, só as medidas preenchidas e os resultados calculados", () => {
    const r = formParaRegistro(form({ peso: "80,5", altura: "180", circunferencias: { cintura: "80", quadril: "100", ombro: "", torax: "abc" }, dobras: { peitoral: "10", abdominal: "20", coxa: "15", triceps: "99" }, observacao: "  ok  " }));
    expect(r.peso).toBe(80.5);
    expect(r.altura).toBe(180);
    expect(r.sexo).toBe("masculino");
    expect(r.idade).toBe(30);
    expect(r.protocolo).toBe("pollock3");
    expect(r.circunferencias).toEqual({ cintura: 80, quadril: 100 });
    expect(r.dobras).toEqual({ peitoral: 10, abdominal: 20, coxa: 15 }); // a dobra fora do protocolo não vai
    expect(r.resultados.imc).toBe(24.85);
    expect(r.resultados.percentual_gordura).toBeCloseTo(13.61, 1);
    expect(r.observacao).toBe("ok");
    expect(new Date(r.data).getHours()).toBe(10);
  });

  it("sem protocolo guarda todas as dobras preenchidas", () => {
    const r = formParaRegistro(form({ protocolo: "nenhum", dobras: { triceps: "12", biceps: "8" } }));
    expect(r.dobras).toEqual({ triceps: 12, biceps: 8 });
    expect(r.resultados.percentual_gordura).toBeNull();
  });

  it("prévia calcula sem depender da data", () => {
    expect(previaDoForm(form({ data: "", hora: "" })).imc).toBe(24.69);
  });

  it("registro volta pro formulário (ida e volta)", () => {
    const f = registroParaForm({
      data: "2026-09-19T13:30:00.000Z", peso: 80.5, altura: 180, sexo: "feminino", idade: 28, protocolo: "guedes",
      circunferencias: { cintura: 80 }, dobras: { coxa: 20, suprailiaca: 15, subescapular: 12 }, observacao: null,
    });
    expect(f.peso).toBe("80.5");
    expect(f.altura).toBe("180");
    expect(f.sexo).toBe("feminino");
    expect(f.idade).toBe("28");
    expect(f.protocolo).toBe("guedes");
    expect(f.circunferencias).toEqual({ cintura: "80" });
    expect(f.dobras).toEqual({ coxa: "20", suprailiaca: "15", subescapular: "12" });
    expect(f.observacao).toBe("");
    expect(f.data).toBe("2026-09-19");
  });

  it("formulário novo puxa sexo e idade do cadastro e o protocolo da última avaliação", () => {
    const f = formNovo({ genero: "feminino", nascimento: "1990-05-10" }, "pollock7", new Date(2026, 8, 19, 9, 5));
    expect(f.sexo).toBe("feminino");
    expect(f.idade).toBe("36");
    expect(f.protocolo).toBe("pollock7");
    expect(f.data).toBe("2026-09-19");
    expect(f.hora).toBe("09:05");
    expect(formNovo({ genero: "outro", nascimento: null }).sexo).toBe("");
    expect(formNovo({ genero: null, nascimento: null }).idade).toBe("");
  });
});

describe("lista, gráfico e textos", () => {
  const a = { id: "a", data: "2026-09-18T10:00:00.000Z", created_at: "2026-09-18T10:00:00.000Z", peso: 82, protocolo: "nenhum", resultados: {} };
  const b = { id: "b", data: "2026-09-19T10:00:00.000Z", created_at: "2026-09-19T10:00:00.000Z", peso: 80, protocolo: "pollock3", resultados: { imc: 24.69, percentual_gordura: 13.61 } };

  it("mais recente primeiro e inserção ordenada", () => {
    expect(ordenarAntropometrias([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirOrdenada([a], b).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirOrdenada([a, b], { ...b, peso: 79 }).find((x) => x.id === "b")?.peso).toBe(79);
  });

  it("série do gráfico vai da mais antiga pra mais recente com peso e % gordura", () => {
    const s = serieEvolucao([b, a]);
    expect(s.map((p) => p.peso)).toEqual([82, 80]);
    expect(s.map((p) => p.gordura)).toEqual([null, 13.61]);
    expect(s[0].rotulo).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
  });

  it("resumo da linha e contagem", () => {
    expect(resumoAvaliacao(b)).toBe("80,0 kg · IMC 24,7 · 13,6% gordura (Pollock 3)");
    expect(resumoAvaliacao(a)).toBe("82,0 kg");
    expect(resumoAvaliacao({ peso: null, protocolo: "nenhum", resultados: null })).toBe("sem peso");
    expect(textoContagem(0)).toBe("Nenhuma avaliação");
    expect(textoContagem(1)).toBe("1 avaliação");
    expect(textoContagem(3)).toBe("3 avaliações");
  });

  it("nome do PDF sem acento", () => {
    expect(nomeArquivoPDF("João da Silva", new Date(2026, 8, 19))).toBe("antropometria-joao-da-silva-2026-09-19.pdf");
    expect(nomeArquivoPDF("", new Date(2026, 8, 19))).toBe("antropometria-paciente-2026-09-19.pdf");
  });
});
