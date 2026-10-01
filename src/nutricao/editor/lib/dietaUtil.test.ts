// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/dietaUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  REFEICOES_PADRAO, compararComAlvo, descricaoQuantidade, descricaoSubstituto, fmtDiferenca, fmtHorario, formItemNovo, formItemParaRegistro,
  formPlanoNovo, formPlanoParaRegistro, formRefeicaoParaRegistro, gramasDoForm, gramasDoItem, gramasEquivalentes, horarioParaBanco, itemParaForm,
  lerSubstitutos, macrosDoItem, moverNaOrdem, nomeArquivoPDFDieta, ordenarRefeicoes, percentuaisMacros, planoParaForm, resumoPlano, situacaoAlvo,
  somarMacros, textoAlvo, tituloPadrao, totaisDoPlano, type AlimentoDoItem, type ItemCalc,
} from "./dietaUtil";

// Arroz, integral, cozido (TACO 4ª ed., por 100 g) — o mesmo alimento que o smoke usa.
const ARROZ: AlimentoDoItem = {
  id: "a1", nome: "Arroz, integral, cozido", fonte: "taco",
  energia_kcal: 123.53, proteina_g: 2.59, carboidrato_g: 25.81, lipidio_g: 1, fibra_g: 2.75, sodio_mg: 1.24, medidas_caseiras: [],
};
const PAO_CASEIRO: AlimentoDoItem = {
  id: "a2", nome: "Pão caseiro de aveia", fonte: "proprio",
  energia_kcal: 270, proteina_g: 8.5, carboidrato_g: 52, lipidio_g: 3.2, fibra_g: 6, sodio_mg: 480,
  medidas_caseiras: [{ id: "m1", descricao: "1 fatia", gramas: 25, ordem: 0 }, { id: "m2", descricao: "1 fatia grossa", gramas: 40, ordem: 1 }],
};
const item = (parcial: Partial<ItemCalc>): ItemCalc => ({ quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, alimento: ARROZ, ...parcial });

describe("refeições padrão e horário", () => {
  it("um plano novo nasce com 6 refeições com horário", () => {
    expect(REFEICOES_PADRAO).toHaveLength(6);
    expect(REFEICOES_PADRAO[0]).toEqual({ nome: "Café da manhã", horario: "07:00" });
    expect(REFEICOES_PADRAO[5]).toEqual({ nome: "Ceia", horario: "22:00" });
  });
  it("fmtHorario aceita o time do banco e devolve HH:mm", () => {
    expect(fmtHorario("07:00:00")).toBe("07:00");
    expect(fmtHorario("12:30")).toBe("12:30");
    expect(fmtHorario(null)).toBe("");
    expect(fmtHorario("x")).toBe("");
  });
  it("horarioParaBanco recusa vazio e inválido", () => {
    expect(horarioParaBanco("")).toBeNull();
    expect(horarioParaBanco("25:00")).toBeNull();
    expect(horarioParaBanco("19:30")).toBe("19:30");
  });
});

describe("gramas e macros do item", () => {
  it("por gramas: usa a quantidade gravada", () => {
    expect(gramasDoItem(item({ quantidade_g: 150 }))).toBe(150);
    expect(descricaoQuantidade(item({ quantidade_g: 150 }))).toBe("150 g");
  });
  it("por medida caseira: quantidade × gramas da medida", () => {
    const i = item({ alimento: PAO_CASEIRO, quantidade_g: 50, medida_caseira_id: "m1", quantidade_medida: 2 });
    expect(gramasDoItem(i)).toBe(50);
    expect(descricaoQuantidade(i)).toBe("2 × 1 fatia (25 g) = 50 g");
  });
  it("medida que sumiu do alimento → cai nos gramas gravados", () => {
    const i = item({ alimento: PAO_CASEIRO, quantidade_g: 50, medida_caseira_id: "sumiu", quantidade_medida: 2 });
    expect(gramasDoItem(i)).toBe(50);
    expect(descricaoQuantidade(i)).toBe("50 g");
  });
  it("macros pela regra de 3 (arroz 100 g e 150 g)", () => {
    expect(macrosDoItem(item({ quantidade_g: 100 }))).toEqual({ energia_kcal: 123.53, proteina_g: 2.59, carboidrato_g: 25.81, lipidio_g: 1, fibra_g: 2.75, sodio_mg: 1.24 });
    expect(macrosDoItem(item({ quantidade_g: 150 })).energia_kcal).toBe(185.3);
    expect(macrosDoItem(item({ alimento: null })).energia_kcal).toBeNull();
  });
});

describe("totais, percentuais e meta", () => {
  it("soma os macros tratando ausente como 0 e conta os itens", () => {
    const t = somarMacros([{ energia_kcal: 100, proteina_g: 10, carboidrato_g: null, lipidio_g: 2, fibra_g: null, sodio_mg: 5 }, { energia_kcal: 50.5, proteina_g: null, carboidrato_g: 3, lipidio_g: 1, fibra_g: 1, sodio_mg: null }]);
    expect(t).toEqual({ energia_kcal: 150.5, proteina_g: 10, carboidrato_g: 3, lipidio_g: 3, fibra_g: 1, sodio_mg: 5, itens: 2 });
  });
  it("totais do plano somam todas as refeições", () => {
    const t = totaisDoPlano([
      { itens: [item({ quantidade_g: 100 })] },
      { itens: [item({ alimento: PAO_CASEIRO, quantidade_g: 50, medida_caseira_id: "m1", quantidade_medida: 2 })] },
      { itens: [] },
    ]);
    expect(t.energia_kcal).toBe(258.53); // 123,53 + 135
    expect(t.proteina_g).toBe(6.84); // 2,59 + 4,25
    expect(t.itens).toBe(2);
  });
  it("% das kcal por macro (4/4/9)", () => {
    expect(percentuaisMacros({ proteina_g: 100, carboidrato_g: 200, lipidio_g: 50 })).toEqual({ proteina: 24.2, carboidrato: 48.5, lipidio: 27.3 });
    expect(percentuaisMacros({ proteina_g: 0, carboidrato_g: 0, lipidio_g: 0 })).toBeNull();
  });
  it("comparação com a meta e situação", () => {
    const c = compararComAlvo(1850, 2353);
    expect(c).toEqual({ diferenca: -503, pct: 78.6 });
    expect(situacaoAlvo(c)).toBe("abaixo");
    expect(situacaoAlvo(compararComAlvo(2300, 2353))).toBe("no_alvo");
    expect(situacaoAlvo(compararComAlvo(2600, 2353))).toBe("acima");
    expect(compararComAlvo(1850, null)).toBeNull();
    expect(situacaoAlvo(null)).toBe("sem_alvo");
  });
  it("textos da meta", () => {
    expect(textoAlvo(1850, 2353)).toBe("1.850 de 2.353 kcal (79 %)");
    expect(textoAlvo(1850, null)).toBe("1.850 kcal");
    expect(fmtDiferenca(120)).toBe("+120");
    expect(fmtDiferenca(-503)).toBe("-503");
  });
});

describe("substitutos", () => {
  it("lê o jsonb ignorando linhas ruins", () => {
    const s = lerSubstitutos([{ alimento_id: "b", nome: "Pão", quantidade_g: "41.2" }, { alimento_id: "", quantidade_g: 10 }, { alimento_id: "c", quantidade_g: 0 }, "x", null]);
    expect(s).toEqual([{ alimento_id: "b", nome: "Pão", quantidade_g: 41.2 }]);
    expect(lerSubstitutos(null)).toEqual([]);
  });
  it("gramas equivalentes em kcal (arroz 100 g → pão francês)", () => {
    expect(gramasEquivalentes(123.53, 299.81)).toBe(41.2);
    expect(gramasEquivalentes(null, 299.81)).toBeNull();
    expect(gramasEquivalentes(123.53, 0)).toBeNull();
    expect(descricaoSubstituto({ alimento_id: "b", nome: "Pão, trigo, francês", quantidade_g: 41.2 })).toBe("41,2 g de Pão, trigo, francês");
  });
});

describe("ordenação", () => {
  const refs = [
    { id: "r3", ordem: 2, horario: "12:30:00", nome: "Almoço" },
    { id: "r1", ordem: 0, horario: "07:00:00", nome: "Café da manhã" },
    { id: "r2", ordem: 1, horario: "10:00:00", nome: "Lanche da manhã" },
  ];
  it("refeições pela ordem gravada", () => {
    expect(ordenarRefeicoes(refs).map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });
  it("mover sobe/desce renumerando e respeita as bordas", () => {
    const ordenadas = ordenarRefeicoes(refs);
    expect(moverNaOrdem(ordenadas, "r3", -1)).toEqual([{ id: "r1", ordem: 0 }, { id: "r3", ordem: 1 }, { id: "r2", ordem: 2 }]);
    expect(moverNaOrdem(ordenadas, "r1", -1)).toBeNull();
    expect(moverNaOrdem(ordenadas, "r3", 1)).toBeNull();
    expect(moverNaOrdem(ordenadas, "nao-existe", 1)).toBeNull();
  });
});

describe("textos", () => {
  it("resumo da linha da lista", () => {
    expect(resumoPlano("alimentos", { energia_kcal: 1850, proteina_g: 120, carboidrato_g: 200, lipidio_g: 60, fibra_g: 30, sodio_mg: 1500, itens: 12 }, 6))
      .toBe("Alimentos · 1.850 kcal · P 120 g · C 200 g · L 60 g · 6 refeições");
    expect(resumoPlano("alimentos", { energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0, sodio_mg: 0, itens: 0 }, 1)).toBe("Alimentos · sem alimentos · 1 refeição");
  });
  it("título padrão e nome do PDF", () => {
    const d = new Date(2026, 8, 19, 10, 0);
    expect(tituloPadrao(d)).toBe("Plano alimentar 19/09/2026");
    expect(nomeArquivoPDFDieta("João da Silva", d)).toBe("plano-alimentar-joao-da-silva-2026-09-19.pdf");
  });
});

describe("formulário ⇄ registro", () => {
  it("plano novo pré-preenche a meta pelo VET (inteiro) e o título com a data", () => {
    const f = formPlanoNovo(2353.4, new Date(2026, 8, 19));
    expect(f).toEqual({ titulo: "Plano alimentar 19/09/2026", kcal_alvo: "2353", observacao: "" });
    expect(formPlanoNovo(null).kcal_alvo).toBe("");
  });
  it("plano: formulário → registro limpa espaços e aceita vírgula; registro → formulário", () => {
    expect(formPlanoParaRegistro({ titulo: "  Plano   verão ", kcal_alvo: "2000,5", observacao: " " })).toEqual({ titulo: "Plano verão", kcal_alvo: 2000.5, observacao: null });
    expect(formPlanoParaRegistro({ titulo: "x", kcal_alvo: "abc", observacao: "obs" }).kcal_alvo).toBeNull();
    expect(planoParaForm({ titulo: "x", kcal_alvo: 2353, observacao: null })).toEqual({ titulo: "x", kcal_alvo: "2353", observacao: "" });
  });
  it("refeição: nome obrigatório, horário opcional", () => {
    expect(formRefeicaoParaRegistro({ nome: " Pré-treino ", horario: "17:15", observacao: "" })).toEqual({ nome: "Pré-treino", horario: "17:15", observacao: null });
    expect(formRefeicaoParaRegistro({ nome: "x", horario: "99:99", observacao: "y" }).horario).toBeNull();
  });
  it("item novo: por medida quando o alimento tem medidas, senão 100 g", () => {
    expect(formItemNovo(PAO_CASEIRO)).toEqual({ modo: "medida", quantidade_g: "", medida_caseira_id: "m1", quantidade_medida: "1", observacao: "" });
    expect(formItemNovo(ARROZ)).toEqual({ modo: "gramas", quantidade_g: "100", medida_caseira_id: "", quantidade_medida: "", observacao: "" });
  });
  it("item: gramas do formulário e registro (gramas, medida, inválido)", () => {
    expect(gramasDoForm({ modo: "gramas", quantidade_g: "150,5", medida_caseira_id: "", quantidade_medida: "", observacao: "" }, ARROZ)).toBe(150.5);
    const porMedida = formItemParaRegistro({ modo: "medida", quantidade_g: "", medida_caseira_id: "m1", quantidade_medida: "2", observacao: " sem manteiga " }, PAO_CASEIRO);
    expect(porMedida).toEqual({ quantidade_g: 50, medida_caseira_id: "m1", quantidade_medida: 2, observacao: "sem manteiga" });
    expect(formItemParaRegistro({ modo: "gramas", quantidade_g: "0", medida_caseira_id: "", quantidade_medida: "", observacao: "" }, ARROZ)).toBeNull();
    expect(formItemParaRegistro({ modo: "medida", quantidade_g: "", medida_caseira_id: "sumiu", quantidade_medida: "2", observacao: "" }, PAO_CASEIRO)).toBeNull();
  });
  it("item gravado → formulário mantém o modo", () => {
    expect(itemParaForm({ ...item({ alimento: PAO_CASEIRO, quantidade_g: 50, medida_caseira_id: "m1", quantidade_medida: 2 }), observacao: null }))
      .toEqual({ modo: "medida", quantidade_g: "50", medida_caseira_id: "m1", quantidade_medida: "2", observacao: "" });
    expect(itemParaForm({ ...item({ quantidade_g: 120.5 }), observacao: "x" })).toEqual({ modo: "gramas", quantidade_g: "120,5", medida_caseira_id: "", quantidade_medida: "", observacao: "x" });
  });
});
