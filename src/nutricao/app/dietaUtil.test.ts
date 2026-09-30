import { describe, expect, it } from "vitest";
import {
  compararComAlvo, descricaoQuantidade, descricaoSubstituto, diaMesCurto, fmtDiferenca, fmtHorario, gramasDoItem, lerSubstitutos, macrosDoItem,
  nomeArquivoPDFDieta, nomeCurto, ordenarItens, ordenarRefeicoes, percentuaisMacros, quantidadeCurta, resumoDaRefeicao, resumoPlano, situacaoAlvo,
  somarMacros, textoAlvo, totaisDoPlano, type ItemCalc,
} from "./dietaUtil";
import { arred, fmtKcal, fmtNum, fmtQtd, macrosPorGramas, numero, porGramas, slugNome } from "./numeros";
import type { AlimentoDoItem } from "./tipos";

// Porta dos testes do PhysiqNutri (src/lib/dietaUtil.test.ts) — a MESMA conta do site antigo — + o nome curto da tela 3.
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

describe("números (alimentosUtil/antropometriaUtil/energeticoUtil do Nutri)", () => {
  it("formata como o site antigo", () => {
    expect(fmtQtd(12.5)).toBe("12,5");
    expect(fmtQtd(100)).toBe("100");
    expect(fmtQtd(null)).toBe("—");
    expect(fmtKcal(1480.4)).toBe("1.480");
    expect(fmtKcal(12345.6)).toBe("12.346");
    expect(fmtNum(78.6, 0)).toBe("79");
    expect(arred(1.005, 2)).toBe(1);
    expect(numero("12,5")).toBe(12.5);
    expect(numero("")).toBeNull();
  });
  it("regra de 3 a partir dos 100 g (2 casas); sem valor fica sem valor", () => {
    expect(porGramas(123.53, 150)).toBe(185.3);
    expect(porGramas(null, 150)).toBeNull();
    expect(macrosPorGramas(ARROZ, 50).proteina_g).toBe(1.3);
  });
  it("nome de arquivo sem acento", () => {
    expect(slugNome("Ana Lúcia da Conceição")).toBe("ana-lucia-da-conceicao");
    expect(slugNome("")).toBe("paciente");
  });
});

describe("gramas e macros do item", () => {
  it("fmtHorario aceita o time do banco e devolve HH:mm", () => {
    expect(fmtHorario("07:00:00")).toBe("07:00");
    expect(fmtHorario("12:30")).toBe("12:30");
    expect(fmtHorario(null)).toBe("");
    expect(fmtHorario("x")).toBe("");
  });
  it("por gramas: usa a quantidade gravada", () => {
    expect(gramasDoItem(item({ quantidade_g: 150 }))).toBe(150);
    expect(descricaoQuantidade(item({ quantidade_g: 150 }))).toBe("150 g");
    expect(quantidadeCurta(item({ quantidade_g: 150 }))).toBe("150 g");
  });
  it("por medida caseira: quantidade × gramas da medida", () => {
    const i = item({ alimento: PAO_CASEIRO, quantidade_g: 50, medida_caseira_id: "m1", quantidade_medida: 2 });
    expect(gramasDoItem(i)).toBe(50);
    expect(descricaoQuantidade(i)).toBe("2 × 1 fatia (25 g) = 50 g");
    expect(quantidadeCurta(i)).toBe("2 × 1 fatia");
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
  it("textos da meta e do plano", () => {
    expect(textoAlvo(1850, 2353)).toBe("1.850 de 2.353 kcal (79 %)");
    expect(textoAlvo(1850, null)).toBe("1.850 kcal");
    expect(fmtDiferenca(120)).toBe("+120");
    expect(fmtDiferenca(-503)).toBe("-503");
    const t = totaisDoPlano([{ itens: [item({ quantidade_g: 100 })] }]);
    expect(resumoPlano("alimentos", t, 6)).toBe("Alimentos · 124 kcal · P 2,6 g · C 25,8 g · L 1 g · 6 refeições");
    expect(resumoPlano("alimentos", totaisDoPlano([]), 1)).toBe("Alimentos · sem alimentos · 1 refeição");
  });
});

describe("substitutos (até 6 por alimento, como o site antigo)", () => {
  it("lê o jsonb ignorando linhas ruins", () => {
    const s = lerSubstitutos([{ alimento_id: "b", nome: "Pão", quantidade_g: "41.2" }, { alimento_id: "", quantidade_g: 10 }, { alimento_id: "c", quantidade_g: 0 }, "x", null]);
    expect(s).toEqual([{ alimento_id: "b", nome: "Pão", quantidade_g: 41.2 }]);
    expect(lerSubstitutos(null)).toEqual([]);
  });
  it("texto do substituto", () => {
    expect(descricaoSubstituto({ alimento_id: "b", nome: "Pão, trigo, francês", quantidade_g: 41.2 })).toBe("41,2 g de Pão, trigo, francês");
    expect(descricaoSubstituto({ alimento_id: "b", nome: "", quantidade_g: 10 })).toBe("10 g de alimento");
  });
});

describe("ordenação", () => {
  it("refeições pela ordem gravada; empate pelo horário", () => {
    const refs = [
      { id: "r3", ordem: 2, horario: "12:30:00", nome: "Almoço" },
      { id: "r1", ordem: 0, horario: "07:00:00", nome: "Café da manhã" },
      { id: "r2", ordem: 0, horario: "10:00:00", nome: "Lanche da manhã" },
    ];
    expect(ordenarRefeicoes(refs).map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });
  it("itens pela ordem e pela criação", () => {
    const itens = [
      { id: "b", ordem: 1, created_at: "2026-09-01T10:00:00Z" },
      { id: "c", ordem: 0, created_at: "2026-09-01T11:00:00Z" },
      { id: "a", ordem: 0, created_at: "2026-09-01T09:00:00Z" },
    ];
    expect(ordenarItens(itens).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });
});

describe("tela 3: a linha da refeição e os nomes", () => {
  it("nome curto da TACO: a 1ª parte + o qualificador do dia a dia", () => {
    expect(nomeCurto("Ovo, de galinha, inteiro, cozido/10minutos")).toBe("Ovo");
    expect(nomeCurto("Arroz, integral, cozido")).toBe("Arroz integral");
    expect(nomeCurto("Pão, trigo, forma, integral")).toBe("Pão integral");
    expect(nomeCurto("Batata, doce, cozida")).toBe("Batata doce");
    expect(nomeCurto("Frango, peito, sem pele, grelhado")).toBe("Frango");
    expect(nomeCurto("Maçã, Fuji, com casca, crua")).toBe("Maçã"); // a variedade não entra
    expect(nomeCurto("Feijão, carioca, cozido")).toBe("Feijão carioca");
    expect(nomeCurto("Whey protein")).toBe("Whey protein");
    expect(nomeCurto("")).toBe("Alimento");
  });
  it("resumo: até 3 nomes (sem repetir) e o resto em +N", () => {
    const i = (nome: string) => ({ alimento: { ...ARROZ, nome } });
    expect(resumoDaRefeicao([i("Ovo, de galinha, inteiro, cozido"), i("Aveia, flocos, crua"), i("Whey protein")])).toBe("Ovo · Aveia · Whey protein");
    expect(resumoDaRefeicao([i("Ovo, cru"), i("Ovo, frito"), i("Aveia")])).toBe("Ovo · Aveia");
    expect(resumoDaRefeicao([i("A"), i("B"), i("C"), i("D"), i("E")])).toBe("A · B · C · +2");
    expect(resumoDaRefeicao([{ alimento: null }])).toBe("Alimento");
  });
  it("datas e nome do PDF", () => {
    expect(diaMesCurto("2026-07-02T15:00:00Z")).toBe("02/07");
    expect(nomeArquivoPDFDieta("Diego Álmeida", new Date(2026, 8, 30))).toBe("plano-alimentar-diego-almeida-2026-09-30.pdf");
  });
});
