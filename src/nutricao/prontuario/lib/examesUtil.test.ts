// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/examesUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  CATALOGO_PADRAO, EXAMES_POR_PEDIDO_MAX, OUTRO_EXAME, acrescentarExame, adicionarLinha, agruparResultadosPorData, alternarExame, atualizarLinha, contarForaDaReferencia,
  dataValida, exameCatalogoParaForm, filtrarPorExame, formInicialPedido, formParaRegistroExameCatalogo, formParaRegistroPedido, formParaRegistroResultado, formatarDataExame,
  formatarValor, hojeISO, inserirPedido, inserirResultados, lerExames, linhaDoCatalogo, linhaVazia, nomeArquivoPDFPedido, nomesComResultado, normalizarExames, normalizarNumero,
  opcaoDoSelect, ordenarCatalogo, ordenarPedidos, pedidoParaForm, removerLinha, resultadoParaForm, situacaoDaLinha, situacaoDoResultado, situacaoResultado, temExame,
  textoContagemExames, textoContagemPedidos, textoContagemResultados, textoReferencia, textoResumoData, textoSituacao, textoSituacaoCurto, textoValor, tirarExame, validarExameCatalogo,
  validarLinhaResultado, validarPedido,
} from "./examesUtil";

const hoje = new Date(2026, 8, 19, 10, 0, 0); // 19/09/2026

describe("números pt-BR", () => {
  it("normalizarNumero aceita vírgula ou ponto; lixo vira null", () => {
    expect(normalizarNumero("5,6")).toBe(5.6);
    expect(normalizarNumero("110")).toBe(110);
    expect(normalizarNumero(" 0.4 ")).toBe(0.4);
    expect(normalizarNumero(",5")).toBe(0.5);
    expect(normalizarNumero(12.5)).toBe(12.5);
    expect(normalizarNumero("abc")).toBeNull();
    expect(normalizarNumero("1,2,3")).toBeNull();
    expect(normalizarNumero("")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
    expect(normalizarNumero(Number.NaN)).toBeNull();
    expect(normalizarNumero("negativo")).toBeNull();
  });
  it("formatarValor usa vírgula e até 2 casas", () => {
    expect(formatarValor(110)).toBe("110");
    expect(formatarValor(5.6)).toBe("5,6");
    expect(formatarValor(12.345)).toBe("12,35");
    expect(formatarValor(0.4)).toBe("0,4");
    expect(formatarValor(null)).toBe("—");
    expect(formatarValor(undefined)).toBe("—");
  });
});

describe("situação e referência", () => {
  it("situacaoResultado: abaixo / normal / acima / sem referência", () => {
    expect(situacaoResultado(110, 70, 99)).toBe("acima");
    expect(situacaoResultado(60, 70, 99)).toBe("abaixo");
    expect(situacaoResultado(85, 70, 99)).toBe("normal");
    expect(situacaoResultado(70, 70, 99)).toBe("normal");
    expect(situacaoResultado(99, 70, 99)).toBe("normal");
    expect(situacaoResultado(5.7, null, 5.6)).toBe("acima");
    expect(situacaoResultado(5.6, null, 5.6)).toBe("normal");
    expect(situacaoResultado(38, 40, null)).toBe("abaixo");
    expect(situacaoResultado(55, 40, null)).toBe("normal");
    expect(situacaoResultado(12, null, null)).toBe("sem_referencia");
    expect(situacaoResultado(null, 70, 99)).toBe("sem_referencia");
    expect(situacaoDoResultado({ valor: 18, ref_min: 30, ref_max: 100 })).toBe("abaixo");
  });
  it("textos da situação", () => {
    expect(textoSituacao("abaixo")).toBe("Abaixo da referência");
    expect(textoSituacao("normal")).toBe("Dentro da referência");
    expect(textoSituacao("acima")).toBe("Acima da referência");
    expect(textoSituacao("sem_referencia")).toBe("Sem referência");
    expect(textoSituacaoCurto("acima")).toBe("Acima");
    expect(textoSituacaoCurto("sem_referencia")).toBe("Sem ref.");
  });
  it("textoReferencia: faixa, só máximo, só mínimo, texto, nada", () => {
    expect(textoReferencia(70, 99, "")).toBe("70–99");
    expect(textoReferencia(null, 5.6, "")).toBe("≤ 5,6");
    expect(textoReferencia(40, null, "")).toBe("≥ 40");
    expect(textoReferencia(null, null, "negativo")).toBe("negativo");
    expect(textoReferencia(null, null, "")).toBe("—");
    expect(textoReferencia(0.4, 4, null)).toBe("0,4–4");
  });
  it("textoValor: número pt-BR ou texto", () => {
    expect(textoValor(110, "")).toBe("110");
    expect(textoValor(5.6, "x")).toBe("5,6");
    expect(textoValor(null, "negativo")).toBe("negativo");
    expect(textoValor(null, "")).toBe("—");
  });
  it("contarForaDaReferencia", () => {
    expect(contarForaDaReferencia([
      { valor: 110, ref_min: 70, ref_max: 99 }, { valor: 55, ref_min: 40, ref_max: null }, { valor: 18, ref_min: 30, ref_max: 100 }, { valor: 12, ref_min: null, ref_max: null },
    ])).toBe(2);
  });
});

describe("catálogo", () => {
  it("12 exames padrão válidos, de texto próprio, com unidade e referência coerente", () => {
    expect(CATALOGO_PADRAO).toHaveLength(12);
    expect(CATALOGO_PADRAO.map((e) => e.nome)).toEqual([
      "Glicemia de jejum", "Hemoglobina glicada", "Colesterol total", "HDL", "LDL", "Triglicerídeos", "TSH", "Vitamina D (25-OH)", "Vitamina B12", "Ferritina", "Hemoglobina", "Creatinina",
    ]);
    for (const e of CATALOGO_PADRAO) {
      expect(validarExameCatalogo(e.nome, e.unidade, e.ref_min === null ? "" : String(e.ref_min), e.ref_max === null ? "" : String(e.ref_max), e.referencia_texto)).toBeNull();
      expect(e.unidade.length).toBeGreaterThan(0);
      expect(e.ref_min !== null || e.ref_max !== null).toBe(true);
    }
    expect(textoReferencia(CATALOGO_PADRAO[0].ref_min, CATALOGO_PADRAO[0].ref_max, "")).toBe("70–99");
    expect(textoReferencia(CATALOGO_PADRAO[1].ref_min, CATALOGO_PADRAO[1].ref_max, "")).toBe("≤ 5,6");
    expect(textoReferencia(CATALOGO_PADRAO[3].ref_min, CATALOGO_PADRAO[3].ref_max, "")).toBe("≥ 40");
    expect(new Set(CATALOGO_PADRAO.map((e) => e.nome)).size).toBe(12);
  });
  it("ordenarCatalogo: favoritos primeiro, depois alfabético", () => {
    const lista = [
      { id: "1", favorito: false, nome: "Zinco" },
      { id: "2", favorito: true, nome: "TSH" },
      { id: "3", favorito: true, nome: "Ferritina" },
      { id: "4", favorito: false, nome: "Ácido úrico" },
    ];
    expect(ordenarCatalogo(lista).map((m) => m.id)).toEqual(["3", "2", "4", "1"]);
  });
  it("validarExameCatalogo", () => {
    expect(validarExameCatalogo("Zinco sérico", "µg/dL", "70", "120", "")).toBeNull();
    expect(validarExameCatalogo("", "mg/dL", "", "", "")).toMatch(/nome/i);
    expect(validarExameCatalogo("x".repeat(121), "", "", "", "")).toBe("Nome muito longo");
    expect(validarExameCatalogo("Zinco", "u".repeat(21), "", "", "")).toBe("Unidade muito longa");
    expect(validarExameCatalogo("Zinco", "", "abc", "", "")).toMatch(/mínima inválida/);
    expect(validarExameCatalogo("Zinco", "", "", "x", "")).toMatch(/máxima inválida/);
    expect(validarExameCatalogo("Zinco", "", "120", "70", "")).toMatch(/mínima não pode passar/);
    expect(validarExameCatalogo("Zinco", "", "", "", "t".repeat(81))).toBe("Texto da referência muito longo");
    expect(validarExameCatalogo("Sorologia", "", "", "", "negativo")).toBeNull();
  });
  it("exameCatalogoParaForm / formParaRegistroExameCatalogo", () => {
    const f = exameCatalogoParaForm({ nome: "TSH", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "", favorito: true });
    expect(f).toEqual({ nome: "TSH", unidade: "mUI/L", refMin: "0,4", refMax: "4", referenciaTexto: "", favorito: true });
    expect(formParaRegistroExameCatalogo({ nome: "  Zinco   sérico ", unidade: " µg/dL ", refMin: "70", refMax: "120,5", referenciaTexto: " ", favorito: true })).toEqual({
      nome: "Zinco sérico", unidade: "µg/dL", ref_min: 70, ref_max: 120.5, referencia_texto: "", favorito: true,
    });
    expect(formParaRegistroExameCatalogo({ nome: "Sorologia", unidade: "", refMin: "", refMax: "", referenciaTexto: "negativo", favorito: false })).toEqual({
      nome: "Sorologia", unidade: "", ref_min: null, ref_max: null, referencia_texto: "negativo", favorito: false,
    });
    expect(exameCatalogoParaForm({ nome: "X", unidade: null, ref_min: null, ref_max: null, referencia_texto: null, favorito: false })).toEqual({ nome: "X", unidade: "", refMin: "", refMax: "", referenciaTexto: "", favorito: false });
  });
});

describe("exames do pedido", () => {
  it("lerExames tolera lixo; normalizarExames tira repetição (sem caixa/acento) e limita a 60", () => {
    expect(lerExames(null)).toEqual([]);
    expect(lerExames(["  Glicemia   de jejum ", "", 3, null, "TSH"])).toEqual(["Glicemia de jejum", "TSH"]);
    expect(normalizarExames(["TSH", "tsh", " TSH ", "Ferritina", "ferritina"])).toEqual(["TSH", "Ferritina"]);
    expect(normalizarExames(["Triglicerídeos", "triglicerideos", "TSH"])).toEqual(["Triglicerídeos", "TSH"]);
    expect(normalizarExames(Array.from({ length: 70 }, (_, i) => `E${i}`))).toHaveLength(EXAMES_POR_PEDIDO_MAX);
  });
  it("alternar / acrescentar / tirar / temExame", () => {
    expect(alternarExame([], "TSH")).toEqual(["TSH"]);
    expect(alternarExame(["TSH", "HDL"], "tsh")).toEqual(["HDL"]);
    expect(acrescentarExame(["TSH"], "Cortisol")).toEqual(["TSH", "Cortisol"]);
    expect(acrescentarExame(["TSH"], "TSH")).toEqual(["TSH"]);
    expect(acrescentarExame(["TSH"], "   ")).toEqual(["TSH"]);
    expect(tirarExame(["TSH", "HDL"], "HDL")).toEqual(["TSH"]);
    expect(temExame(["Glicemia de jejum"], "glicemia de jejum")).toBe(true);
    expect(temExame(["Glicemia de jejum"], "HDL")).toBe(false);
  });
  it("contagens", () => {
    expect(textoContagemExames(0)).toBe("Nenhum exame");
    expect(textoContagemExames(1)).toBe("1 exame");
    expect(textoContagemExames(3)).toBe("3 exames");
    expect(textoContagemPedidos(0)).toBe("Nenhum pedido");
    expect(textoContagemPedidos(1)).toBe("1 pedido");
    expect(textoContagemPedidos(2)).toBe("2 pedidos");
    expect(textoContagemResultados(0)).toBe("Nenhum resultado");
    expect(textoContagemResultados(1)).toBe("1 resultado");
    expect(textoContagemResultados(5)).toBe("5 resultados");
  });
  it("validarPedido", () => {
    expect(validarPedido("2026-09-19", ["TSH"], "")).toBeNull();
    expect(validarPedido("", ["TSH"], "")).toMatch(/data/i);
    expect(validarPedido("2026-13-01", ["TSH"], "")).toMatch(/data/i);
    expect(validarPedido("2026-09-19", [], "")).toMatch(/pelo menos 1 exame/);
    expect(validarPedido("2026-09-19", ["", "  "], "")).toMatch(/pelo menos 1 exame/);
    expect(validarPedido("2026-09-19", Array.from({ length: 61 }, (_, i) => `E${i}`), "")).toMatch(/No máximo 60/);
    expect(validarPedido("2026-09-19", ["x".repeat(121)], "")).toBe("Nome de exame muito longo");
    expect(validarPedido("2026-09-19", ["TSH"], "o".repeat(1001))).toBe("Observação muito longa");
  });
});

describe("pedidos", () => {
  const pedidos = [
    { id: "a", data: "2026-09-18", created_at: "2026-09-18T10:00:00Z" },
    { id: "b", data: "2026-09-19", created_at: "2026-09-19T08:00:00Z" },
    { id: "c", data: "2026-09-19", created_at: "2026-09-19T09:00:00Z" },
  ];
  it("ordenarPedidos: data desc, depois created_at desc; inserirPedido substitui ou acrescenta", () => {
    expect(ordenarPedidos(pedidos).map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(inserirPedido(pedidos, { id: "a", data: "2026-09-20", created_at: "2026-09-20T10:00:00Z" }).map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(inserirPedido(pedidos, { id: "d", data: "2026-09-17", created_at: "2026-09-17T10:00:00Z" }).map((p) => p.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("formInicialPedido / pedidoParaForm / formParaRegistroPedido", () => {
    expect(formInicialPedido(hoje)).toEqual({ data: "2026-09-19", exames: [], observacao: "" });
    expect(pedidoParaForm({ data: "2026-09-10", exames: ["TSH", "HDL"], observacao: null })).toEqual({ data: "2026-09-10", exames: ["TSH", "HDL"], observacao: "" });
    expect(formParaRegistroPedido({ data: "2026-09-19", exames: [" TSH ", "tsh", "Cortisol"], observacao: " jejum 12 h \r\n\r\n" })).toEqual({ data: "2026-09-19", exames: ["TSH", "Cortisol"], observacao: "jejum 12 h" });
  });
});

describe("resultados", () => {
  const lista = [
    { id: "1", data: "2026-09-19", exame: "Glicemia de jejum", created_at: "2026-09-19T10:00:00Z" },
    { id: "2", data: "2026-09-18", exame: "Glicemia de jejum", created_at: "2026-09-18T10:00:00Z" },
    { id: "3", data: "2026-09-19", exame: "Cortisol", created_at: "2026-09-19T10:00:01Z" },
    { id: "4", data: "2026-09-19", exame: "HDL", created_at: "2026-09-19T10:00:02Z" },
  ];
  it("agruparResultadosPorData: data desc; dentro, alfabético", () => {
    const grupos = agruparResultadosPorData(lista);
    expect(grupos.map((g) => g.data)).toEqual(["2026-09-19", "2026-09-18"]);
    expect(grupos[0].itens.map((r) => r.exame)).toEqual(["Cortisol", "Glicemia de jejum", "HDL"]);
    expect(grupos[1].itens.map((r) => r.id)).toEqual(["2"]);
    expect(agruparResultadosPorData([])).toEqual([]);
  });
  it("filtrarPorExame / nomesComResultado / inserirResultados", () => {
    expect(filtrarPorExame(lista, "glicemia de jejum").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filtrarPorExame(lista, "")).toHaveLength(4);
    expect(nomesComResultado(lista)).toEqual(["Cortisol", "Glicemia de jejum", "HDL"]);
    const nova = inserirResultados(lista, [{ id: "1", data: "2026-09-19", exame: "Glicemia de jejum", created_at: "x" }, { id: "5", data: "2026-09-19", exame: "TSH", created_at: "y" }]);
    expect(nova.map((r) => r.id)).toEqual(["2", "3", "4", "1", "5"]);
  });
  it("editor de linhas: catálogo preenche unidade/referência; adicionar/atualizar/remover; nunca fica sem linha", () => {
    const l = linhaDoCatalogo({ nome: "Glicemia de jejum", unidade: "mg/dL", ref_min: 70, ref_max: 99, referencia_texto: "" });
    expect(l).toEqual({ exame: "Glicemia de jejum", valor: "", unidade: "mg/dL", refMin: 70, refMax: 99, referenciaTexto: "" });
    expect(linhaDoCatalogo({ nome: "Sorologia", unidade: null, ref_min: null, ref_max: null, referencia_texto: "negativo" }, "negativo").referenciaTexto).toBe("negativo");
    const l2 = adicionarLinha([l]);
    expect(l2).toHaveLength(2);
    expect(l2[1]).toEqual(linhaVazia());
    const l3 = atualizarLinha(l2, 0, { valor: "110" });
    expect(l3[0].valor).toBe("110");
    expect(l3[1]).toEqual(linhaVazia());
    expect(removerLinha(l3, 1)).toHaveLength(1);
    expect(removerLinha([linhaVazia()], 0)).toEqual([linhaVazia()]);
    expect(adicionarLinha(Array.from({ length: 60 }, () => linhaVazia()))).toHaveLength(60);
    expect(situacaoDaLinha(l3[0])).toBe("acima");
    expect(situacaoDaLinha({ ...l3[0], valor: "85" })).toBe("normal");
    expect(situacaoDaLinha({ ...l3[0], valor: "negativo" })).toBe("sem_referencia");
    expect(opcaoDoSelect("Glicemia de jejum", CATALOGO_PADRAO)).toBe("Glicemia de jejum");
    expect(opcaoDoSelect("Cortisol", CATALOGO_PADRAO)).toBe(OUTRO_EXAME);
    expect(opcaoDoSelect("", CATALOGO_PADRAO)).toBe(OUTRO_EXAME);
  });
  it("validarLinhaResultado", () => {
    expect(validarLinhaResultado("Glicemia de jejum", "110", "mg/dL")).toBeNull();
    expect(validarLinhaResultado("Sorologia", "negativo", "")).toBeNull();
    expect(validarLinhaResultado("", "110", "")).toMatch(/exame/i);
    expect(validarLinhaResultado("x".repeat(121), "1", "")).toBe("Nome do exame muito longo");
    expect(validarLinhaResultado("TSH", "  ", "")).toMatch(/valor/i);
    expect(validarLinhaResultado("TSH", "t".repeat(81), "")).toBe("Valor muito longo");
    expect(validarLinhaResultado("TSH", "1", "u".repeat(21))).toBe("Unidade muito longa");
  });
  it("formParaRegistroResultado: número → valor; texto → valor_texto; referência copiada", () => {
    expect(formParaRegistroResultado({ exame: " Glicemia de jejum ", valor: "110", unidade: "mg/dL", refMin: 70, refMax: 99, referenciaTexto: "" })).toEqual({
      exame: "Glicemia de jejum", valor: 110, valor_texto: "", unidade: "mg/dL", ref_min: 70, ref_max: 99, referencia_texto: "",
    });
    expect(formParaRegistroResultado({ exame: "Hemoglobina glicada", valor: "5,6", unidade: "%", refMin: null, refMax: 5.6, referenciaTexto: "" }).valor).toBe(5.6);
    expect(formParaRegistroResultado({ exame: "Sorologia", valor: " negativo ", unidade: "", refMin: null, refMax: null, referenciaTexto: "negativo" })).toEqual({
      exame: "Sorologia", valor: null, valor_texto: "negativo", unidade: "", ref_min: null, ref_max: null, referencia_texto: "negativo",
    });
  });
  it("resultadoParaForm lê o gravado (número em pt-BR ou texto)", () => {
    expect(resultadoParaForm({ exame: "TSH", valor: 2.5, valor_texto: "", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "" })).toEqual({
      exame: "TSH", valor: "2,5", unidade: "mUI/L", refMin: 0.4, refMax: 4, referenciaTexto: "",
    });
    expect(resultadoParaForm({ exame: "Sorologia", valor: null, valor_texto: "negativo", unidade: null, ref_min: null, ref_max: null, referencia_texto: null })).toEqual({
      exame: "Sorologia", valor: "negativo", unidade: "", refMin: null, refMax: null, referenciaTexto: "",
    });
  });
});

describe("datas e PDF", () => {
  it("dataValida / formatarDataExame / hojeISO / textoResumoData", () => {
    expect(dataValida("2026-09-19")).toBe(true);
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("19/09/2026")).toBe(false);
    expect(dataValida(null)).toBe(false);
    expect(formatarDataExame("2026-09-19")).toBe("19/09/2026");
    expect(formatarDataExame("")).toBe("—");
    expect(hojeISO(hoje)).toBe("2026-09-19");
    expect(textoResumoData("2026-09-19", 3)).toBe("19/09/2026 · 3 exames");
    expect(textoResumoData("2026-09-19", 1)).toBe("19/09/2026 · 1 exame");
  });
  it("nomeArquivoPDFPedido", () => {
    expect(nomeArquivoPDFPedido("Maria José da Silva", "2026-09-19")).toBe("pedido-exames-maria-jose-da-silva-20260919.pdf");
    expect(nomeArquivoPDFPedido("", hoje)).toBe("pedido-exames-paciente-20260919.pdf");
  });
});
