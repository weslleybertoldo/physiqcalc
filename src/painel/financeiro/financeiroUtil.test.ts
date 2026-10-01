// Physiq W19 — porta do teste do PhysiqNutri (main ca9f66f, src/lib/financeiroUtil.test.ts) + a forma de pagamento.
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_PADRAO, filtrarTransacoes, filtrosAtivos, filtrosDaURL, filtrosParaURL, fmtBRL, fmtValorComSinal, formParaRegistro, formVazio, formatarData,
  inserirOrdenado, limparValorDigitado, noPeriodo, ordenarCategorias, ordenarTransacoes, parseValor, periodoDoPreset, periodoValido, presetDoPeriodo,
  registroParaForm, rotuloMetodo, rotuloPeriodo, rotuloTipo, textoContagem, textoValor, totais, validarNomeCategoria, valorValido, type Metodo, type Tipo,
} from "./financeiroUtil";

const hoje = new Date(2026, 8, 19, 10, 30); // sábado 19/09/2026

describe("período", () => {
  it("presets a partir de hoje", () => {
    expect(periodoDoPreset("30d", hoje)).toEqual({ de: "2026-08-21", ate: "2026-09-19" });
    expect(periodoDoPreset("mes", hoje)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(periodoDoPreset("mes_passado", hoje)).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(periodoDoPreset("90d", hoje)).toEqual({ de: "2026-06-22", ate: "2026-09-19" });
    expect(periodoDoPreset("ano", hoje)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
    expect(periodoDoPreset("personalizado", hoje)).toEqual(periodoDoPreset("30d", hoje));
  });
  it("presetDoPeriodo reconhece o preset e cai em personalizado", () => {
    expect(presetDoPeriodo({ de: "2026-09-01", ate: "2026-09-30" }, hoje)).toBe("mes");
    expect(presetDoPeriodo({ de: "2026-08-21", ate: "2026-09-19" }, hoje)).toBe("30d");
    expect(presetDoPeriodo({ de: "2026-01-01", ate: "2026-12-31" }, hoje)).toBe("ano");
    expect(presetDoPeriodo({ de: "2026-09-10", ate: "2026-09-12" }, hoje)).toBe("personalizado");
  });
  it("periodoValido / noPeriodo / rótulos", () => {
    expect(periodoValido("2026-09-01", "2026-09-30")).toBe(true);
    expect(periodoValido("2026-09-01", "2026-09-01")).toBe(true);
    expect(periodoValido("2026-09-30", "2026-09-01")).toBe(false);
    expect(periodoValido("2026-13-01", "2026-09-30")).toBe(false);
    expect(periodoValido("", "2026-09-30")).toBe(false);
    expect(noPeriodo("2026-09-19", { de: "2026-09-01", ate: "2026-09-30" })).toBe(true);
    expect(noPeriodo("2026-10-01", { de: "2026-09-01", ate: "2026-09-30" })).toBe(false);
    expect(rotuloPeriodo({ de: "2026-09-01", ate: "2026-09-30" })).toBe("01/09/2026 – 30/09/2026");
    expect(formatarData("2026-09-05")).toBe("05/09/2026"); // parseISO: não desloca o dia pelo fuso
    expect(formatarData("lixo")).toBe("lixo");
  });
});

describe("estado na URL", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);
  it("filtrosDaURL: período inválido ou ausente vira o padrão (últimos 30 dias); tipo desconhecido vira todas", () => {
    expect(filtrosDaURL(params({}), hoje)).toEqual({ de: "2026-08-21", ate: "2026-09-19", tipo: "", categoria: "", metodo: "", q: "" });
    expect(filtrosDaURL(params({ de: "2026-09-30", ate: "2026-09-01" }), hoje).de).toBe("2026-08-21");
    expect(filtrosDaURL(params({ de: "2026-09-01", ate: "2026-09-30", tipo: "saida", categoria: "abc", q: " luz " }), hoje)).toEqual({
      de: "2026-09-01", ate: "2026-09-30", tipo: "saida", categoria: "abc", metodo: "", q: "luz",
    });
    expect(filtrosDaURL(params({ tipo: "xyz" }), hoje).tipo).toBe("");
  });
  it("filtrosParaURL: só o que difere do padrão", () => {
    expect(filtrosParaURL({ de: "2026-08-21", ate: "2026-09-19", tipo: "", categoria: "", metodo: "", q: "" }, hoje)).toEqual({});
    expect(filtrosParaURL({ de: "2026-09-01", ate: "2026-09-30", tipo: "entrada", categoria: "c1", metodo: "", q: " aluguel " }, hoje)).toEqual({
      de: "2026-09-01", ate: "2026-09-30", tipo: "entrada", categoria: "c1", q: "aluguel",
    });
    expect(filtrosAtivos({ tipo: "", categoria: "", q: "  " })).toBe(false);
    expect(filtrosAtivos({ tipo: "saida", categoria: "", q: "" })).toBe(true);
  });
});

describe("valor em BRL", () => {
  it("parseValor aceita os jeitos de digitar", () => {
    expect(parseValor("150")).toBe(150);
    expect(parseValor("150,00")).toBe(150);
    expect(parseValor("40,5")).toBe(40.5);
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("R$ 2.000")).toBe(2000);
    expect(parseValor("1234.56")).toBe(1234.56);
    expect(parseValor("12.345.678")).toBe(12345678);
    expect(parseValor("-5")).toBe(-5);
    expect(parseValor(" ")).toBeNull();
    expect(parseValor("abc")).toBeNull();
    expect(parseValor("1,2,3")).toBeNull();
    expect(parseValor("1.2.3")).toBeNull();
    expect(parseValor(null)).toBeNull();
    expect(parseValor(12.345)).toBe(12.35);
  });
  it("valorValido exige > 0 e até o limite do numeric(12,2)", () => {
    expect(valorValido("0")).toBe(false);
    expect(valorValido("0,00")).toBe(false);
    expect(valorValido("-5")).toBe(false);
    expect(valorValido("")).toBe(false);
    expect(valorValido("150,00")).toBe(true);
    expect(valorValido("9.999.999.999,99")).toBe(true);
    expect(valorValido("99.999.999.999,99")).toBe(false);
  });
  it("fmtBRL / textoValor / fmtValorComSinal / limparValorDigitado", () => {
    expect(fmtBRL(150)).toBe("R$ 150,00");
    expect(fmtBRL(1234.5)).toBe("R$ 1.234,50");
    expect(fmtBRL(0)).toBe("R$ 0,00");
    expect(fmtBRL(-109.5)).toBe("-R$ 109,50");
    expect(fmtBRL(null)).toBe("—");
    expect(textoValor(40.5)).toBe("40,50");
    expect(textoValor(1234.5)).toBe("1234,50");
    expect(textoValor(null)).toBe("");
    expect(fmtValorComSinal("entrada", 150)).toBe("+R$ 150,00");
    expect(fmtValorComSinal("saida", 40.5)).toBe("−R$ 40,50");
    expect(limparValorDigitado("R$ 1a.2b3,4c5")).toBe("1.23,45");
  });
});

describe("totais", () => {
  it("estornadas ficam fora das somas e das contagens por tipo", () => {
    expect(totais([
      { tipo: "entrada", valor: 150, estornada: false },
      { tipo: "saida", valor: 40.5, estornada: false },
      { tipo: "saida", valor: 999, estornada: true },
      { tipo: "entrada", valor: 0.1, estornada: false },
      { tipo: "entrada", valor: 0.2, estornada: false },
    ])).toEqual({ entradas: 150.3, saidas: 40.5, saldo: 109.8, nEntradas: 3, nSaidas: 1, nEstornadas: 1, total: 5 });
    expect(totais([])).toEqual({ entradas: 0, saidas: 0, saldo: 0, nEntradas: 0, nSaidas: 0, nEstornadas: 0, total: 0 });
    expect(totais([{ tipo: "saida", valor: 40.5, estornada: false }]).saldo).toBe(-40.5);
  });
});

describe("formulário ⇄ registro", () => {
  it("formVazio: entrada, hoje, Pix", () => {
    expect(formVazio(hoje)).toEqual({ tipo: "entrada", descricao: "", valor: "", data: "2026-09-19", categoriaId: "", metodo: "pix", pacienteId: null, observacao: "" });
  });
  it("formParaRegistro normaliza; registroParaForm volta", () => {
    const r = formParaRegistro({
      tipo: "saida", descricao: "  Material   de escritório ", valor: "40,50", data: "2026-09-10", categoriaId: "c1", metodo: "dinheiro", pacienteId: null, observacao: "  ",
    });
    expect(r).toEqual({ tipo: "saida", descricao: "Material de escritório", valor: 40.5, data: "2026-09-10", categoria_id: "c1", metodo: "dinheiro", paciente_id: null, observacao: null });
    expect(registroParaForm(r)).toEqual({
      tipo: "saida", descricao: "Material de escritório", valor: "40,50", data: "2026-09-10", categoriaId: "c1", metodo: "dinheiro", pacienteId: null, observacao: "",
    });
    expect(formParaRegistro({ ...formVazio(hoje), pacienteId: "p1", observacao: " obs ", valor: "1.000" })).toMatchObject({ paciente_id: "p1", observacao: "obs", valor: 1000 });
    expect(formParaRegistro({ ...formVazio(hoje), tipo: "x" as Tipo, metodo: "y" as Metodo, data: "lixo" })).toMatchObject({ tipo: "entrada", metodo: "outro", categoria_id: null });
  });
});

describe("lista", () => {
  type L = { id: string; data: string; created_at: string; tipo: string; categoria_id: string | null; descricao: string; categoria: { nome: string } | null; paciente: { nome: string } | null; observacao: string | null };
  const t = (id: string, data: string, created: string, extra: Partial<L> = {}): L => ({
    id, data, created_at: created, tipo: "entrada", categoria_id: null, descricao: id, categoria: null, paciente: null, observacao: null, ...extra,
  });
  it("ordenarTransacoes: data desc, empate → gravada por último primeiro; inserirOrdenado troca pelo id", () => {
    const a = t("a", "2026-09-10", "2026-09-10T10:00:00Z");
    const b = t("b", "2026-09-12", "2026-09-12T10:00:00Z");
    const c = t("c", "2026-09-12", "2026-09-12T11:00:00Z");
    expect(ordenarTransacoes([a, b, c]).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(inserirOrdenado([a, b], { ...a, data: "2026-09-13" }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(inserirOrdenado([a], c).map((x) => x.id)).toEqual(["c", "a"]);
  });
  it("filtrarTransacoes por tipo, categoria e texto sem acento (todas as palavras)", () => {
    const lista = [
      t("1", "2026-09-10", "2026-09-10T10:00:00Z", { tipo: "entrada", categoria_id: "c1", descricao: "Consulta inicial", categoria: { nome: "Consulta" }, paciente: { nome: "João Silva" } }),
      t("2", "2026-09-11", "2026-09-11T10:00:00Z", { tipo: "saida", categoria_id: "c2", descricao: "Papel A4", categoria: { nome: "Material" }, observacao: "papelaria da esquina" }),
    ];
    expect(filtrarTransacoes(lista, { tipo: "saida", categoria: "", q: "" }).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "c1", q: "" }).map((x) => x.id)).toEqual(["1"]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", q: "joao" }).map((x) => x.id)).toEqual(["1"]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", q: "material papel" }).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", q: "esquina" }).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarTransacoes(lista, { tipo: "entrada", categoria: "c2", q: "" })).toEqual([]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", q: "xyz" })).toEqual([]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", q: "" })).toHaveLength(2);
  });
  it("contagem, rótulos, categorias", () => {
    expect(textoContagem(0)).toBe("Nenhuma movimentação");
    expect(textoContagem(1)).toBe("1 movimentação");
    expect(textoContagem(3)).toBe("3 movimentações");
    expect(rotuloMetodo("cartao_credito")).toBe("Cartão de crédito");
    expect(rotuloMetodo("zzz")).toBe("zzz");
    expect(rotuloTipo("saida")).toBe("Saída");
    expect(CATEGORIAS_PADRAO).toHaveLength(6);
    expect(ordenarCategorias([{ nome: "Retorno" }, { nome: "Aluguel" }, { nome: "consulta" }]).map((c) => c.nome)).toEqual(["Aluguel", "consulta", "Retorno"]);
  });
  it("validarNomeCategoria: tamanho e repetição sem caixa/acento", () => {
    const existentes = [{ id: "1", nome: "Consulta" }, { id: "2", nome: "Plano alimentar" }];
    expect(validarNomeCategoria("Aluguel", existentes)).toBeNull();
    expect(validarNomeCategoria("a", existentes)).toBe("Informe o nome da categoria");
    expect(validarNomeCategoria("x".repeat(61), existentes)).toBe("Nome muito longo");
    expect(validarNomeCategoria("  consulta ", existentes)).toBe("Já existe uma categoria com esse nome");
    expect(validarNomeCategoria("Consulta", existentes, "1")).toBeNull(); // renomear a própria
  });
});

describe("W19 — forma de pagamento (spec 4.4: entradas e saídas por categoria e forma)", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);
  it("?forma= na URL: método conhecido entra no filtro; desconhecido vira todas; volta para a URL só quando escolhido", () => {
    expect(filtrosDaURL(params({ forma: "dinheiro" }), hoje).metodo).toBe("dinheiro");
    expect(filtrosDaURL(params({ forma: "cheque" }), hoje).metodo).toBe("");
    expect(filtrosParaURL({ ...filtrosDaURL(params({}), hoje), metodo: "pix" }, hoje)).toEqual({ forma: "pix" });
    expect(filtrosAtivos({ tipo: "", categoria: "", metodo: "boleto", q: "" })).toBe(true);
  });
  it("filtrarTransacoes pela forma (junto com tipo e texto)", () => {
    const lista = [
      { id: "1", tipo: "entrada", categoria_id: null, metodo: "pix", descricao: "Consulta" },
      { id: "2", tipo: "entrada", categoria_id: null, metodo: "dinheiro", descricao: "Consulta" },
      { id: "3", tipo: "saida", categoria_id: null, metodo: "pix", descricao: "Aluguel" },
    ];
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", metodo: "pix", q: "" }).map((x) => x.id)).toEqual(["1", "3"]);
    expect(filtrarTransacoes(lista, { tipo: "entrada", categoria: "", metodo: "pix", q: "" }).map((x) => x.id)).toEqual(["1"]);
    expect(filtrarTransacoes(lista, { tipo: "", categoria: "", metodo: "dinheiro", q: "consulta" }).map((x) => x.id)).toEqual(["2"]);
  });
});
