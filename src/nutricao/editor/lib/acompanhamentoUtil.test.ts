// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/acompanhamentoUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  AGUA_MAX, PRESETS_INTERVALO, SINTOMAS, SINTOMAS_MAX, adicionarSintomaLivre, alternarSintoma, calculoMaisRecente, diasDoIntervalo, fmtAgua, fmtVariacao,
  formDoRegistro, formInicialRegistro, inserirRegistro, intervaloDaURL, intervaloPadrao, intervaloParaURL, intervaloPreset, kcalAtividadesDia,
  kcalAtividadesIntervalo, kcalPorMacro, lerSintomas, mediaAgua, nDias, noIntervalo, normalizarSintomaLivre, ordenarRegistros, planoAtivo, presetAtivo,
  registroDoDia, registroParaBanco, rotuloSintoma, serieAgua, serieNutrientes, sintomasFrequentes, sintomasLivres, somarAgua, textoContagemRegistros,
  textoRegistro, ultimosPesos, validarIntervalo, validarRegistro, variacaoPeso,
} from "./acompanhamentoUtil";

const HOJE = "2026-09-19";

describe("sintomas", () => {
  it("catálogo com 12 chaves e rótulos", () => {
    expect(SINTOMAS).toHaveLength(12);
    expect(SINTOMAS.map((s) => s.chave)).toContain("dor_de_cabeca");
    expect(rotuloSintoma("azia")).toBe("Azia");
    expect(rotuloSintoma("dor_de_cabeca")).toBe("Dor de cabeça");
  });
  it("chave livre vira texto legível", () => {
    expect(rotuloSintoma("tontura")).toBe("Tontura");
    expect(rotuloSintoma("dor_nas_costas")).toBe("Dor nas costas");
    expect(rotuloSintoma("")).toBe("");
  });
  it("normalizarSintomaLivre tira acento, caixa e pontuação", () => {
    expect(normalizarSintomaLivre(" Dor de Cabeça ")).toBe("dor_de_cabeca");
    expect(normalizarSintomaLivre("Tontura!")).toBe("tontura");
    expect(normalizarSintomaLivre("   ")).toBe("");
    expect(normalizarSintomaLivre("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });
  it("lerSintomas: só strings únicas, ≤ 40 chars, máx 12", () => {
    expect(lerSintomas(["azia", " azia ", 3, "", "inchaco"])).toEqual(["azia", "inchaco"]);
    expect(lerSintomas(null)).toEqual([]);
    expect(lerSintomas(Array.from({ length: 20 }, (_, i) => `s${i}`))).toHaveLength(SINTOMAS_MAX);
    expect(lerSintomas(["x".repeat(50)])[0]).toHaveLength(40);
  });
  it("sintomasLivres separa o que não é do catálogo", () => {
    expect(sintomasLivres(["azia", "tontura", "gases"])).toEqual(["tontura"]);
  });
});

describe("intervalo", () => {
  it("padrão = últimos 7 dias terminando hoje", () => {
    expect(intervaloPadrao(HOJE)).toEqual({ de: "2026-09-13", ate: HOJE });
    expect(intervaloPreset(HOJE, 15)).toEqual({ de: "2026-09-05", ate: HOJE });
    expect(intervaloPreset(HOJE, 30)).toEqual({ de: "2026-08-21", ate: HOJE });
    expect(PRESETS_INTERVALO).toEqual([7, 15, 30]);
  });
  it("nDias inclusivo e diasDoIntervalo", () => {
    expect(nDias("2026-09-13", HOJE)).toBe(7);
    expect(nDias(HOJE, HOJE)).toBe(1);
    expect(diasDoIntervalo("2026-09-17", HOJE)).toEqual(["2026-09-17", "2026-09-18", "2026-09-19"]);
    expect(diasDoIntervalo(HOJE, "2026-09-17")).toEqual([]);
    expect(noIntervalo("2026-09-15", "2026-09-13", HOJE)).toBe(true);
    expect(noIntervalo("2026-09-12", "2026-09-13", HOJE)).toBe(false);
  });
  it("validarIntervalo", () => {
    expect(validarIntervalo("2026-09-13", HOJE, HOJE)).toBeNull();
    expect(validarIntervalo("2026-09-20", HOJE, HOJE)).toMatch(/depois/);
    expect(validarIntervalo("2026-09-13", "2026-09-20", HOJE)).toMatch(/futura/);
    expect(validarIntervalo("2024-01-01", HOJE, HOJE)).toMatch(/1 ano/);
    expect(validarIntervalo("", HOJE, HOJE)).toMatch(/duas datas/);
    expect(validarIntervalo("2026-02-30", HOJE, HOJE)).toMatch(/duas datas/);
  });
  it("URL: lê ?de=&ate= válidos, senão o padrão; escreve de volta", () => {
    expect(intervaloDaURL(new URLSearchParams("de=2026-09-05&ate=2026-09-19"), HOJE)).toEqual({ de: "2026-09-05", ate: HOJE });
    expect(intervaloDaURL(new URLSearchParams(""), HOJE)).toEqual(intervaloPadrao(HOJE));
    expect(intervaloDaURL(new URLSearchParams("de=2026-09-25&ate=2026-09-19"), HOJE)).toEqual(intervaloPadrao(HOJE));
    expect(intervaloParaURL({ de: "2026-09-05", ate: HOJE })).toBe("?de=2026-09-05&ate=2026-09-19");
  });
  it("presetAtivo acha 7/15/30 ou null", () => {
    expect(presetAtivo(intervaloPadrao(HOJE), HOJE)).toBe(7);
    expect(presetAtivo(intervaloPreset(HOJE, 30), HOJE)).toBe(30);
    expect(presetAtivo({ de: "2026-09-10", ate: HOJE }, HOJE)).toBeNull();
  });
});

describe("plano ativo e nutrientes", () => {
  const p = (id: string, favorito: boolean, created_at: string, deleted_at: string | null = null) => ({ id, favorito, created_at, deleted_at });
  it("favorito mais recente > mais recente vivo > null", () => {
    const lista = [p("a", false, "2026-09-10T10:00:00Z"), p("b", true, "2026-09-05T10:00:00Z"), p("c", true, "2026-09-01T10:00:00Z"), p("d", true, "2026-09-15T10:00:00Z", "2026-09-16T00:00:00Z")];
    expect(planoAtivo(lista)?.id).toBe("b");
    expect(planoAtivo([p("a", false, "2026-09-10T10:00:00Z"), p("x", false, "2026-09-12T10:00:00Z")])?.id).toBe("x");
    expect(planoAtivo([p("d", true, "2026-09-15T10:00:00Z", "2026-09-16T00:00:00Z")])).toBeNull();
    expect(planoAtivo([])).toBeNull();
  });
  it("kcalPorMacro 4·4·9 e série com % pela soma", () => {
    expect(kcalPorMacro({ proteina_g: 10, carboidrato_g: 50, lipidio_g: 10 })).toEqual({ proteina: 40, carboidrato: 200, lipidio: 90 });
    const s = serieNutrientes({ proteina_g: 10, carboidrato_g: 50, lipidio_g: 10 });
    expect(s.map((x) => x.chave)).toEqual(["proteina", "carboidrato", "lipidio"]);
    expect(s.map((x) => x.pct)).toEqual([12, 61, 27]);
    expect(s.reduce((t, x) => t + x.kcal, 0)).toBe(330);
    expect(serieNutrientes({ proteina_g: 0, carboidrato_g: 0, lipidio_g: 0 })).toEqual([]);
  });
});

describe("atividade física", () => {
  it("kcal/dia = Σ MET × peso × min/60; × dias no intervalo", () => {
    const dia = kcalAtividadesDia([{ descricao: "Caminhada", met: 3.5, minutos_por_dia: 30 }], 77);
    expect(dia).toBe(134.75);
    expect(kcalAtividadesIntervalo(dia, 7)).toBe(943);
    expect(kcalAtividadesIntervalo(dia, 15)).toBe(2021);
    expect(kcalAtividadesDia([], 77)).toBe(0);
    expect(kcalAtividadesDia([{ descricao: "x", met: 3, minutos_por_dia: 30 }], null)).toBe(0);
  });
  it("calculoMaisRecente ignora excluídos e ordena por data", () => {
    const c = (id: string, data: string, deleted_at: string | null = null) => ({ id, data, created_at: data, deleted_at });
    expect(calculoMaisRecente([c("a", "2026-09-01T10:00:00Z"), c("b", "2026-09-10T10:00:00Z"), c("c", "2026-09-15T10:00:00Z", "2026-09-16T00:00:00Z")])?.id).toBe("b");
    expect(calculoMaisRecente([])).toBeNull();
  });
});

describe("peso", () => {
  const a = (data: string, peso: number | null, deleted_at: string | null = null) => ({ data, peso, resultados: {}, deleted_at });
  const LISTA = [a("2026-09-19T12:00:00Z", 77), a("2026-08-20T12:00:00Z", 78.5), a("2026-07-21T12:00:00Z", 80), a("2026-06-01T12:00:00Z", null), a("2026-05-01T12:00:00Z", 90, "2026-05-02T00:00:00Z")];
  it("ultimosPesos: vivas com peso, asc, últimas n", () => {
    expect(ultimosPesos(LISTA, 10).map((p) => p.peso)).toEqual([80, 78.5, 77]);
    expect(ultimosPesos(LISTA, 2).map((p) => p.peso)).toEqual([78.5, 77]);
    expect(ultimosPesos([], 10)).toEqual([]);
  });
  it("variacaoPeso e fmtVariacao", () => {
    expect(variacaoPeso(ultimosPesos(LISTA, 10))).toEqual({ primeiro: 80, ultimo: 77, diferenca: -3 });
    expect(variacaoPeso([])).toBeNull();
    expect(fmtVariacao(-3)).toBe("−3,0");
    expect(fmtVariacao(1.25)).toBe("+1,3");
    expect(fmtVariacao(0)).toBe("0,0");
  });
});

describe("água", () => {
  const REGS = [
    { id: "1", data: "2026-09-16", agua_ml: 1500, sintomas: ["azia", "inchaco"], observacao: null, created_at: "2026-09-16T10:00:00Z" },
    { id: "2", data: "2026-09-18", agua_ml: 2000, sintomas: ["azia"], observacao: "ok", created_at: "2026-09-18T10:00:00Z" },
  ];
  it("serieAgua: 1 ponto por dia, 0 sem registro", () => {
    const s = serieAgua(REGS, "2026-09-13", HOJE);
    expect(s).toHaveLength(7);
    expect(s.map((p) => p.ml)).toEqual([0, 0, 0, 1500, 0, 2000, 0]);
    expect(s[3].rotulo).toBe("16/09");
  });
  it("mediaAgua só dos dias com registro; fmtAgua", () => {
    expect(mediaAgua(REGS)).toBe(1750);
    expect(mediaAgua([])).toBe(0);
    expect(fmtAgua(750)).toBe("750 ml");
    expect(fmtAgua(1000)).toBe("1 L");
    expect(fmtAgua(1500)).toBe("1,5 L");
    expect(fmtAgua(1750)).toBe("1,75 L");
    expect(fmtAgua(2500)).toBe("2,5 L");
    expect(fmtAgua(0)).toBe("0 ml");
  });
  it("sintomasFrequentes: desc, empate alfabético, top 5", () => {
    const f = sintomasFrequentes(REGS);
    expect(f.map((x) => [x.chave, x.n])).toEqual([["azia", 2], ["inchaco", 1]]);
    expect(f[1].rotulo).toBe("Inchaço");
    const muitos = [{ sintomas: ["a", "b", "c", "d", "e", "f", "g"] }];
    expect(sintomasFrequentes(muitos)).toHaveLength(5);
    expect(sintomasFrequentes([])).toEqual([]);
  });
  it("registros: ordenar, inserir (substitui o dia), registroDoDia, textos", () => {
    expect(ordenarRegistros(REGS).map((r) => r.id)).toEqual(["2", "1"]);
    const novo = { id: "3", data: "2026-09-18", agua_ml: 1800, sintomas: [], observacao: null, created_at: "2026-09-19T10:00:00Z" };
    const lista = inserirRegistro(REGS, novo);
    expect(lista.map((r) => r.id)).toEqual(["3", "1"]);
    expect(registroDoDia(REGS, "2026-09-16")?.id).toBe("1");
    expect(registroDoDia(REGS, "2026-09-17")).toBeNull();
    expect(textoContagemRegistros(0)).toBe("Nenhum registro no período");
    expect(textoContagemRegistros(1)).toBe("1 dia registrado");
    expect(textoContagemRegistros(3)).toBe("3 dias registrados");
    expect(textoRegistro(REGS[0])).toBe("16/09/2026 · 1,5 L · Azia, Inchaço");
    expect(textoRegistro(novo)).toBe("18/09/2026 · 1,8 L · sem sintomas");
  });
});

describe("formulário do dia", () => {
  it("inicial e a partir do registro", () => {
    expect(formInicialRegistro(HOJE)).toEqual({ data: HOJE, agua_ml: "", sintomas: [], sintomaLivre: "", observacao: "" });
    expect(formDoRegistro({ data: "2026-09-18", agua_ml: 2000, sintomas: ["azia", 5], observacao: null })).toEqual({ data: "2026-09-18", agua_ml: "2000", sintomas: ["azia"], sintomaLivre: "", observacao: "" });
    expect(formDoRegistro({ data: "2026-09-18", agua_ml: 0, sintomas: [], observacao: "x" }).agua_ml).toBe("");
  });
  it("validarRegistro", () => {
    const ok = { ...formInicialRegistro(HOJE), agua_ml: "2500", sintomas: ["azia"] };
    expect(validarRegistro(ok, HOJE)).toBeNull();
    expect(validarRegistro({ ...ok, data: "2026-09-20" }, HOJE)).toMatch(/futura/);
    expect(validarRegistro({ ...ok, data: "" }, HOJE)).toMatch(/data/);
    expect(validarRegistro({ ...ok, agua_ml: "-1" }, HOJE)).toMatch(/Água/);
    expect(validarRegistro({ ...ok, agua_ml: "12.5" }, HOJE)).toMatch(/Água/);
    expect(validarRegistro({ ...ok, agua_ml: String(AGUA_MAX + 1) }, HOJE)).toMatch(/Água/);
    expect(validarRegistro({ ...ok, agua_ml: "" }, HOJE)).toBeNull();
    expect(validarRegistro({ ...ok, sintomas: Array.from({ length: 13 }, (_, i) => `s${i}`) }, HOJE)).toMatch(/12/);
    expect(validarRegistro({ ...ok, observacao: "x".repeat(301) }, HOJE)).toMatch(/300/);
  });
  it("registroParaBanco arredonda água, limpa sintomas e observação", () => {
    expect(registroParaBanco({ data: HOJE, agua_ml: "", sintomas: [" azia ", "azia", ""], sintomaLivre: "", observacao: "  a   b  " })).toEqual({ data: HOJE, agua_ml: 0, sintomas: ["azia"], observacao: "a b" });
    expect(registroParaBanco({ data: HOJE, agua_ml: "2500", sintomas: [], sintomaLivre: "", observacao: "" }).observacao).toBeNull();
  });
  it("somarAgua, alternarSintoma, adicionarSintomaLivre", () => {
    expect(somarAgua("", 250)).toBe("250");
    expect(somarAgua("2400", 500)).toBe("2900");
    expect(somarAgua("29900", 500)).toBe(String(AGUA_MAX));
    expect(alternarSintoma(["azia"], "gases")).toEqual(["azia", "gases"]);
    expect(alternarSintoma(["azia", "gases"], "azia")).toEqual(["gases"]);
    expect(alternarSintoma(Array.from({ length: 12 }, (_, i) => `s${i}`), "novo")).toHaveLength(12);
    expect(adicionarSintomaLivre([], "Tontura")).toEqual({ lista: ["tontura"], chave: "tontura" });
    expect(adicionarSintomaLivre(["tontura"], "tontura!")).toEqual({ lista: ["tontura"], chave: "tontura" });
    expect(adicionarSintomaLivre([], "   ")).toEqual({ lista: [], chave: null });
    expect(adicionarSintomaLivre([], "Dor de cabeça").lista).toEqual(["dor_de_cabeca"]);
  });
});
