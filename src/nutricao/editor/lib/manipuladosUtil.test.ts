// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/manipuladosUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  MODELOS_PADRAO, UNIDADES, adicionarAtivo, ativoVazio, atualizarAtivo, contarAtivos, ehUnidade, formInicialFormula, formParaRegistroFormula, formatarDataFormula,
  formulaParaForm, inserirFormula, lerAtivos, modeloInicial, nomeArquivoPDFFormula, nomeArquivoPDFFormulas, normalizarAtivos, normalizarQuantidade, normalizarTexto,
  ordenarFormulas, ordenarModelosFormula, removerAtivo, textoAtivo, textoAtivos, textoContagemAtivos, textoContagemFormulas, textoDose, textoPrescritaEm, validarFormula,
  validarModeloFormula,
  type FormFormula,
} from "./manipuladosUtil";

const hoje = new Date(2026, 8, 19, 10, 0, 0); // 19/09/2026

describe("ativos", () => {
  it("unidades fixas; ativo vazio nasce em mg", () => {
    expect(UNIDADES).toEqual(["mg", "g", "mcg", "UI", "mL", "%"]);
    expect(ativoVazio()).toEqual({ ativo: "", dose: "", unidade: "mg" });
    expect(ehUnidade("UI")).toBe(true);
    expect(ehUnidade("kg")).toBe(false);
    expect(ehUnidade(null)).toBe(false);
  });
  it("lerAtivos tolera lixo: só objetos contam, textos aparados, unidade estranha vira mg", () => {
    expect(lerAtivos(null)).toEqual([]);
    expect(lerAtivos("x")).toEqual([]);
    expect(lerAtivos({ ativo: "solto" })).toEqual([]);
    expect(lerAtivos([{ ativo: "  Magnésio   dimalato ", dose: 300, unidade: "mg" }, "lixo", null, [1], { ativo: "Zinco", dose: "30", unidade: "kg" }])).toEqual([
      { ativo: "Magnésio dimalato", dose: "300", unidade: "mg" },
      { ativo: "Zinco", dose: "30", unidade: "mg" },
    ]);
    expect(lerAtivos([{ dose: "1" }])).toEqual([{ ativo: "", dose: "1", unidade: "mg" }]);
  });
  it("normalizarAtivos tira a linha sem nome e limita a 30", () => {
    expect(normalizarAtivos([{ ativo: "", dose: "1", unidade: "g" }, { ativo: "EPA", dose: " 600 ", unidade: "mg" }])).toEqual([{ ativo: "EPA", dose: "600", unidade: "mg" }]);
    const muitos = Array.from({ length: 35 }, (_, i) => ({ ativo: `A${i}`, dose: "1", unidade: "mg" }));
    expect(normalizarAtivos(muitos)).toHaveLength(30);
    expect(contarAtivos(muitos)).toBe(30);
    expect(contarAtivos(null)).toBe(0);
  });
  it("textoAtivo / textoAtivos / contagem", () => {
    expect(textoAtivo({ ativo: "Magnésio dimalato", dose: "300", unidade: "mg" })).toBe("Magnésio dimalato 300 mg");
    expect(textoAtivo({ ativo: "Vitamina C", dose: "5", unidade: "%" })).toBe("Vitamina C 5%");
    expect(textoAtivo({ ativo: "Probiótico", dose: "", unidade: "mg" })).toBe("Probiótico");
    expect(textoAtivo({ ativo: "Zinco", dose: "30", unidade: "kg" })).toBe("Zinco 30 mg");
    expect(textoDose({ ativo: "x", dose: "300", unidade: "mg" })).toBe("300 mg");
    expect(textoDose({ ativo: "x", dose: "5", unidade: "%" })).toBe("5%");
    expect(textoDose({ ativo: "x", dose: "", unidade: "mg" })).toBe("");
    expect(normalizarQuantidade("  30   cápsulas ")).toBe("30 cápsulas");
    expect(textoAtivos([{ ativo: "EPA", dose: "600", unidade: "mg" }, { ativo: "DHA", dose: "400", unidade: "mg" }, { ativo: "", dose: "", unidade: "mg" }])).toBe("EPA 600 mg · DHA 400 mg");
    expect(textoAtivos([])).toBe("");
    expect(textoContagemAtivos(0)).toBe("Nenhum ativo");
    expect(textoContagemAtivos(1)).toBe("1 ativo");
    expect(textoContagemAtivos(3)).toBe("3 ativos");
  });
  it("editor: adicionar, atualizar e remover linhas (nunca fica sem linha; no máximo 30)", () => {
    const l = [ativoVazio()];
    const l2 = adicionarAtivo(l);
    expect(l2).toHaveLength(2);
    const l3 = atualizarAtivo(l2, 1, { ativo: "Zinco", dose: "30" });
    expect(l3[1]).toEqual({ ativo: "Zinco", dose: "30", unidade: "mg" });
    expect(l3[0]).toEqual(ativoVazio());
    expect(removerAtivo(l3, 0)).toEqual([{ ativo: "Zinco", dose: "30", unidade: "mg" }]);
    expect(removerAtivo([ativoVazio()], 0)).toEqual([ativoVazio()]);
    const cheio = Array.from({ length: 30 }, () => ativoVazio());
    expect(adicionarAtivo(cheio)).toHaveLength(30);
  });
});

describe("validação", () => {
  const ok = [{ ativo: "Zinco quelato", dose: "30", unidade: "mg" }];
  it("validarFormula: título 2–120, ≥ 1 ativo com nome, dose ≤ 40, posologia ≤ 500, quantidade ≤ 80, observação ≤ 1000", () => {
    expect(validarFormula("Zinco", ok, "1 cápsula ao dia", "30 cápsulas", "")).toBeNull();
    expect(validarFormula("Z", ok, "", "", "")).toMatch(/título/i);
    expect(validarFormula("  ", ok, "", "", "")).toMatch(/título/i);
    expect(validarFormula("x".repeat(121), ok, "", "", "")).toBe("Título muito longo");
    expect(validarFormula("Zinco", [], "", "", "")).toMatch(/1 ativo/);
    expect(validarFormula("Zinco", [{ ativo: "  ", dose: "30", unidade: "mg" }], "", "", "")).toMatch(/1 ativo/);
    expect(validarFormula("Zinco", [{ ativo: "Zinco", dose: "9".repeat(41), unidade: "mg" }], "", "", "")).toBe("Dose muito longa");
    expect(validarFormula("Zinco", [{ ativo: "a".repeat(121), dose: "1", unidade: "mg" }], "", "", "")).toBe("Nome do ativo muito longo");
    expect(validarFormula("Zinco", ok, "p".repeat(501), "", "")).toBe("Posologia muito longa");
    expect(validarFormula("Zinco", ok, "", "q".repeat(81), "")).toBe("Quantidade muito longa");
    expect(validarFormula("Zinco", ok, "", "", "o".repeat(1001))).toBe("Observação muito longa");
    expect(validarFormula("Zinco", ok, null as unknown as string, undefined as unknown as string, "")).toBeNull();
  });
  it("validarModeloFormula fala do modelo", () => {
    expect(validarModeloFormula("", ok, "", "", "")).toMatch(/modelo/);
    expect(validarModeloFormula("Zinco", ok, "", "", "")).toBeNull();
  });
});

describe("ordenação e contagem", () => {
  const formulas = [
    { id: "a", prescrita_em: "2026-09-18", created_at: "2026-09-18T10:00:00Z" },
    { id: "b", prescrita_em: "2026-09-19", created_at: "2026-09-19T08:00:00Z" },
    { id: "c", prescrita_em: "2026-09-19", created_at: "2026-09-19T09:00:00Z" },
  ];
  it("ordenarFormulas: prescrita_em desc, depois created_at desc", () => {
    expect(ordenarFormulas(formulas).map((f) => f.id)).toEqual(["c", "b", "a"]);
  });
  it("inserirFormula substitui pelo id ou acrescenta, já ordenado", () => {
    expect(inserirFormula(formulas, { id: "a", prescrita_em: "2026-09-20", created_at: "2026-09-20T10:00:00Z" }).map((f) => f.id)).toEqual(["a", "c", "b"]);
    expect(inserirFormula(formulas, { id: "d", prescrita_em: "2026-09-17", created_at: "2026-09-17T10:00:00Z" }).map((f) => f.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("textoContagemFormulas", () => {
    expect(textoContagemFormulas(0)).toBe("Nenhuma fórmula");
    expect(textoContagemFormulas(1)).toBe("1 fórmula");
    expect(textoContagemFormulas(2)).toBe("2 fórmulas");
  });
});

describe("modelos", () => {
  it("3 modelos padrão válidos, de texto próprio", () => {
    expect(MODELOS_PADRAO.map((m) => m.titulo)).toEqual(["Magnésio + vitamina B6", "Vitamina D3 2000 UI", "Ômega 3 concentrado"]);
    for (const m of MODELOS_PADRAO) {
      expect(validarFormula(m.titulo, m.ativos, m.posologia, m.quantidade, m.observacao)).toBeNull();
      expect(normalizarAtivos(m.ativos)).toEqual(m.ativos);
      expect(m.posologia.length).toBeGreaterThan(10);
      expect(m.quantidade).toMatch(/cápsulas/);
    }
    expect(textoAtivos(MODELOS_PADRAO[0].ativos)).toBe("Magnésio dimalato 300 mg · Piridoxina (B6) 50 mg");
    expect(textoAtivos(MODELOS_PADRAO[1].ativos)).toBe("Colecalciferol 2000 UI");
    expect(contarAtivos(MODELOS_PADRAO[2].ativos)).toBe(2);
  });
  it("ordenarModelosFormula: favoritos primeiro, depois alfabético; modeloInicial = o 1º", () => {
    const lista = [
      { id: "1", favorito: false, titulo: "Zinco" },
      { id: "2", favorito: true, titulo: "Ômega 3" },
      { id: "3", favorito: true, titulo: "Magnésio" },
      { id: "4", favorito: false, titulo: "Ferro" },
    ];
    expect(ordenarModelosFormula(lista).map((m) => m.id)).toEqual(["3", "2", "4", "1"]);
    expect(modeloInicial(lista)?.id).toBe("3");
    expect(modeloInicial([])).toBeNull();
  });
});

describe("formulário ⇄ registro", () => {
  it("formInicialFormula copia o modelo; em branco = 1 linha de ativo vazia", () => {
    const f = formInicialFormula({ id: "m1", titulo: "Zinco", ativos: [{ ativo: "Zinco quelato", dose: "30", unidade: "mg" }], posologia: "1 ao dia", quantidade: "30 cápsulas", observacao: null });
    expect(f).toEqual({ modeloId: "m1", titulo: "Zinco", ativos: [{ ativo: "Zinco quelato", dose: "30", unidade: "mg" }], posologia: "1 ao dia", quantidade: "30 cápsulas", observacao: "", salvarComoModelo: false });
    const b = formInicialFormula(null);
    expect(b.modeloId).toBe("");
    expect(b.titulo).toBe("");
    expect(b.ativos).toEqual([ativoVazio()]);
    expect(formInicialFormula({ id: "m2", titulo: "Vazio", ativos: [], posologia: "", quantidade: "", observacao: "" }).ativos).toEqual([ativoVazio()]);
  });
  it("formulaParaForm lê a fórmula gravada", () => {
    expect(formulaParaForm({ titulo: "Ômega", ativos: [{ ativo: "EPA", dose: "600", unidade: "mg" }], posologia: null, quantidade: "60 cápsulas", observacao: "sem lactose" })).toEqual({
      modeloId: "", titulo: "Ômega", ativos: [{ ativo: "EPA", dose: "600", unidade: "mg" }], posologia: "", quantidade: "60 cápsulas", observacao: "sem lactose", salvarComoModelo: false,
    });
    expect(formulaParaForm({ titulo: "Sem ativo", ativos: null, posologia: "", quantidade: "", observacao: "" }).ativos).toEqual([ativoVazio()]);
  });
  it("formParaRegistroFormula normaliza título, ativos e textos", () => {
    const f: FormFormula = {
      modeloId: "", titulo: "  Magnésio   +  B6 ", ativos: [{ ativo: " Magnésio ", dose: " 300 ", unidade: "mg" }, ativoVazio()],
      posologia: "linha 1  \r\n\r\nlinha 2 \n", quantidade: "  30   cápsulas ", observacao: " obs ", salvarComoModelo: true,
    };
    expect(formParaRegistroFormula(f)).toEqual({
      modelo_id: null, titulo: "Magnésio + B6", ativos: [{ ativo: "Magnésio", dose: "300", unidade: "mg" }], posologia: "linha 1\n\nlinha 2", quantidade: "30 cápsulas", observacao: "obs",
    });
    expect(formParaRegistroFormula({ ...f, modeloId: "m1" }).modelo_id).toBe("m1");
    expect(normalizarTexto(null)).toBe("");
  });
});

describe("datas e PDF", () => {
  it("formatarDataFormula / textoPrescritaEm usam parseISO", () => {
    expect(formatarDataFormula("2026-09-19")).toBe("19/09/2026");
    expect(formatarDataFormula("")).toBe("—");
    expect(formatarDataFormula(null)).toBe("—");
    expect(textoPrescritaEm("2026-09-01")).toBe("Prescrito em 01/09/2026");
  });
  it("nomes dos PDFs (individual leva o título sem acento; global só a data)", () => {
    expect(nomeArquivoPDFFormula("Maria José da Silva", "Magnésio + vitamina B6", "2026-09-19")).toBe("formula-maria-jose-da-silva-magnesio-vitamina-b6-20260919.pdf");
    expect(nomeArquivoPDFFormula("", "", hoje)).toBe("formula-paciente-formula-20260919.pdf");
    expect(nomeArquivoPDFFormulas("Maria José da Silva", hoje)).toBe("formulas-maria-jose-da-silva-20260919.pdf");
    expect(nomeArquivoPDFFormulas("", hoje)).toBe("formulas-paciente-20260919.pdf");
  });
});
