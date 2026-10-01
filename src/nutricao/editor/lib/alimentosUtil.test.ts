// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/alimentosUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  FORM_VAZIO, MARCA_MAX, casaComBusca, casaComBuscaAlimento, divergenciaKcal, etiquetaAlimento, filtrosAtivos, fmtComUnidade, fmtQtd, formParaRegistro,
  inserirOrdenado, kcalAtwater, lerNutrientes, limparMarca, macrosDoForm, macrosPorGramas, medidasDoForm, medidasInvalidas, normalizarBusca, nutrientesDoForm,
  nutrientesListados, nutrientesParaForm, ordenarAlimentos, ordenarMedidas, palavrasBusca, porGramas, registroParaForm, resumoMacros, rotuloFonte, rotuloMedida,
  textoNumero, textoTotal, totalNutrientesPreenchidos, type FormAlimento,
} from "./alimentosUtil";

// Arroz, integral, cozido (TACO nº 1): 124 kcal · P 2,6 · C 25,8 · L 1,0 · fibra 2,7 · sódio 1 (por 100 g).
const ARROZ = { energia_kcal: 124, proteina_g: 2.6, carboidrato_g: 25.8, lipidio_g: 1, fibra_g: 2.7, sodio_mg: 1 };

describe("busca", () => {
  it("normaliza sem acento, sem caixa e sem os caracteres do filtro", () => {
    expect(normalizarBusca("Açúcar, Cristal")).toBe("acucar cristal");
    expect(normalizarBusca("  Pão   (de  forma) %_'\"  ")).toBe("pao de forma");
    expect(normalizarBusca(null)).toBe("");
  });
  it("quebra em palavras (máx. 6) e casa quando todas aparecem", () => {
    expect(palavrasBusca("arroz, integral")).toEqual(["arroz", "integral"]);
    expect(palavrasBusca("a b c d e f g h")).toHaveLength(6);
    expect(casaComBusca("Arroz, integral, cozido", "ARROZ integral")).toBe(true);
    expect(casaComBusca("Arroz, integral, cozido", "arroz branco")).toBe(false);
    expect(casaComBusca("Feijão, carioca, cozido", "feijao")).toBe(true);
  });
  it("filtrosAtivos considera busca, grupo e fonte", () => {
    expect(filtrosAtivos({ q: "", grupo: "", fonte: "" })).toBe(false);
    expect(filtrosAtivos({ q: " arroz ", grupo: "", fonte: "" })).toBe(true);
    expect(filtrosAtivos({ q: "", grupo: "Cereais e derivados", fonte: "" })).toBe(true);
    expect(filtrosAtivos({ q: "", grupo: "", fonte: "taco" })).toBe(true);
  });
});

describe("macros por porção (regra de 3)", () => {
  it("porGramas escala a partir dos 100 g com 2 casas", () => {
    expect(porGramas(25.8, 50)).toBe(12.9);
    expect(porGramas(124, 150)).toBe(186);
    expect(porGramas(2.6, 33)).toBe(0.86);
    expect(porGramas(null, 50)).toBeNull();
    expect(porGramas(10, -1)).toBeNull();
  });
  it("macrosPorGramas escala todos os campos e mantém null", () => {
    const m = macrosPorGramas({ ...ARROZ, sodio_mg: null }, 200);
    expect(m).toEqual({ energia_kcal: 248, proteina_g: 5.2, carboidrato_g: 51.6, lipidio_g: 2, fibra_g: 5.4, sodio_mg: null });
  });
  it("kcalAtwater usa 4/4/9 e divergência compara com a informada", () => {
    expect(kcalAtwater(2.6, 25.8, 1)).toBe(122.6);
    expect(kcalAtwater(null, 25.8, 1)).toBeNull();
    expect(divergenciaKcal(124, 122.6)).toBe(1.1);
    expect(divergenciaKcal(200, 100)).toBe(100);
    expect(divergenciaKcal(124, null)).toBeNull();
    expect(divergenciaKcal(124, 0)).toBeNull();
  });
});

describe("nutrientes (jsonb)", () => {
  it("lerNutrientes só aceita números finitos não negativos", () => {
    expect(lerNutrientes({ calcio_mg: 5, ferro_mg: "0,3", ruim: "x", neg: -1, nulo: null })).toEqual({ calcio_mg: 5, ferro_mg: 0.3 });
    expect(lerNutrientes([1, 2])).toEqual({});
    expect(lerNutrientes(null)).toEqual({});
  });
  it("nutrientesListados segue a ordem da tabela e põe desconhecidos no fim", () => {
    const lista = nutrientesListados({ zinco_mg: 0.7, colesterol_mg: 0, xpto_g: 1, calcio_mg: 5 });
    expect(lista.map((n) => n.chave)).toEqual(["colesterol_mg", "calcio_mg", "zinco_mg", "xpto_g"]);
    expect(lista[1]).toMatchObject({ rotulo: "Cálcio", unidade: "mg", valor: 5 });
    expect(lista[3]).toMatchObject({ rotulo: "xpto_g", unidade: "", valor: 1 });
  });
});

describe("textos", () => {
  it("fmtQtd tira zeros à direita e usa vírgula", () => {
    expect(fmtQtd(25.8)).toBe("25,8");
    expect(fmtQtd(100)).toBe("100");
    expect(fmtQtd(0.031)).toBe("0,03");
    expect(fmtQtd(0)).toBe("0");
    expect(fmtQtd(null)).toBe("—");
    expect(fmtComUnidade(5, "mg")).toBe("5 mg");
    expect(fmtComUnidade(70.1, "%")).toBe("70,1%");
    expect(fmtComUnidade(null, "g")).toBe("—");
  });
  it("resumoMacros e textoTotal", () => {
    expect(resumoMacros(ARROZ)).toBe("124 kcal · P 2,6 g · C 25,8 g · L 1 g");
    expect(resumoMacros({ energia_kcal: null, proteina_g: null, carboidrato_g: null, lipidio_g: null, fibra_g: null, sodio_mg: null })).toBe("sem valores nutricionais");
    expect(textoTotal(597, false)).toBe("Total de alimentos: 597");
    expect(textoTotal(1, true)).toBe("1 alimento encontrado");
    expect(textoTotal(12, true)).toBe("12 alimentos encontrados");
    expect(rotuloFonte("taco")).toBe("TACO");
    expect(rotuloFonte("proprio")).toBe("Meu alimento");
  });
});

describe("medidas caseiras", () => {
  it("medidasInvalidas aponta a posição das linhas incompletas e ignora as em branco", () => {
    expect(medidasInvalidas([{ descricao: "colher de sopa", gramas: "25" }, { descricao: "", gramas: "" }, { descricao: "xícara", gramas: "" }, { descricao: "", gramas: "10" }, { descricao: "copo", gramas: "0" }]))
      .toEqual([3, 4, 5]);
  });
  it("medidasDoForm aceita vírgula, limpa espaços e numera a ordem", () => {
    expect(medidasDoForm([{ descricao: " colher  de sopa ", gramas: "12,5" }, { descricao: "", gramas: "" }, { descricao: "xícara", gramas: "160" }]))
      .toEqual([{ descricao: "colher de sopa", gramas: 12.5, ordem: 0 }, { descricao: "xícara", gramas: 160, ordem: 1 }]);
  });
  it("ordenarMedidas e rotuloMedida", () => {
    expect(ordenarMedidas([{ ordem: 1, descricao: "b" }, { ordem: 0, descricao: "z" }, { ordem: 1, descricao: "a" }]).map((m) => m.descricao)).toEqual(["z", "a", "b"]);
    expect(rotuloMedida({ descricao: "1 colher de sopa cheia", gramas: 25 })).toBe("1 colher de sopa cheia (25 g)");
  });
});

describe("formulário ⇄ registro", () => {
  const form: FormAlimento = {
    ...FORM_VAZIO,
    nome: "  Pão  caseiro ",
    grupo: " Cereais e derivados ",
    porcao_g: "50",
    energia_kcal: "270",
    proteina_g: "8,5",
    carboidrato_g: "52",
    lipidio_g: "3,2",
    fibra_g: "",
    sodio_mg: "480",
    medidas: [{ descricao: "fatia", gramas: "25" }],
  };
  it("formParaRegistro aceita vírgula, vazio vira null e porção vazia vira 100", () => {
    expect(formParaRegistro(form)).toEqual({
      nome: "Pão caseiro", grupo: "Cereais e derivados", porcao_g: 50, energia_kcal: 270, proteina_g: 8.5, carboidrato_g: 52, lipidio_g: 3.2, fibra_g: null, sodio_mg: 480,
      marca: null, nutrientes: {},
    });
    expect(formParaRegistro({ ...form, marca: "  Wickbold ", nutrientes: { saturados_g: "0,8", acucares_g: "" } })).toMatchObject({ marca: "Wickbold", nutrientes: { saturados_g: 0.8 } });
    expect(formParaRegistro({ ...form, porcao_g: "", grupo: "  " })).toMatchObject({ porcao_g: 100, grupo: null });
    expect(formParaRegistro({ ...form, energia_kcal: "-5" })).toMatchObject({ energia_kcal: null });
  });
  it("registroParaForm faz a volta (com as medidas ordenadas) e textoNumero usa vírgula", () => {
    const f = registroParaForm({
      nome: "Pão caseiro", grupo: null, porcao_g: 50, energia_kcal: 270, proteina_g: 8.5, carboidrato_g: 52, lipidio_g: 3.2, fibra_g: null, sodio_mg: 480,
      medidas_caseiras: [{ descricao: "fatia grossa", gramas: 40, ordem: 1 }, { descricao: "fatia", gramas: 25, ordem: 0 }],
    });
    expect(f).toEqual({
      nome: "Pão caseiro", marca: "", grupo: "", porcao_g: "50", energia_kcal: "270", proteina_g: "8,5", carboidrato_g: "52", lipidio_g: "3,2", fibra_g: "", sodio_mg: "480",
      nutrientes: {},
      medidas: [{ descricao: "fatia", gramas: "25" }, { descricao: "fatia grossa", gramas: "40" }],
    });
    expect(registroParaForm({ nome: "Whey", grupo: null, porcao_g: 30, ...ARROZ, marca: "Pretorian", nutrientes: { saturados_g: 1.5, xpto: 9 } }))
      .toMatchObject({ marca: "Pretorian", nutrientes: { saturados_g: "1,5" } });
    expect(textoNumero(null)).toBe("");
    expect(macrosDoForm(form)).toEqual({ energia_kcal: 270, proteina_g: 8.5, carboidrato_g: 52, lipidio_g: 3.2, fibra_g: null, sodio_mg: 480 });
  });
});

describe("ordenação", () => {
  it("alfabética sem acento/caixa, próprio antes da TACO no empate", () => {
    const lista = [
      { id: "1", nome: "Água mineral", fonte: "taco" },
      { id: "2", nome: "abacaxi, cru", fonte: "taco" },
      { id: "3", nome: "Água mineral", fonte: "proprio" },
      { id: "4", nome: "Arroz, integral, cozido", fonte: "taco" },
    ];
    expect(ordenarAlimentos(lista).map((a) => a.id)).toEqual(["2", "3", "1", "4"]);
    expect(inserirOrdenado(lista, { id: "1", nome: "Zebra", fonte: "taco" }).map((a) => a.id)).toEqual(["2", "3", "4", "1"]);
  });
});

describe("marca e demais nutrientes (W38)", () => {
  it("limparMarca limpa espaços, corta em MARCA_MAX e vazia vira null", () => {
    expect(limparMarca("  Pretorian   Nutrition ")).toBe("Pretorian Nutrition");
    expect(limparMarca("   ")).toBeNull();
    expect(limparMarca(null)).toBeNull();
    expect(limparMarca("M".repeat(100))).toHaveLength(MARCA_MAX);
  });
  it("etiquetaAlimento mostra a marca do próprio; TACO é a referência e nunca mostra marca", () => {
    expect(etiquetaAlimento({ fonte: "proprio", marca: "Italac" })).toBe("Italac");
    expect(etiquetaAlimento({ fonte: "proprio", marca: "  " })).toBe("Meu alimento");
    expect(etiquetaAlimento({ fonte: "proprio" })).toBe("Meu alimento");
    expect(etiquetaAlimento({ fonte: "taco", marca: "Tio João" })).toBe("TACO");
  });
  it("casaComBuscaAlimento acha pela marca (mesma regra da coluna busca)", () => {
    expect(casaComBuscaAlimento({ nome: "Whey", marca: "Pretorian" }, "pretorian")).toBe(true);
    expect(casaComBuscaAlimento({ nome: "Whey", marca: null }, "pretorian")).toBe(false);
    expect(casaComBuscaAlimento({ nome: "Arroz, integral, cozido" }, "arroz integral")).toBe(true);
  });
  it("nutrientesDoForm grava só as chaves da tabela com valor válido; nutrientesParaForm faz a volta com vírgula", () => {
    expect(nutrientesDoForm({ saturados_g: "1,5", acucares_g: "12", potassio_mg: "", xpto_g: "3", ferro_mg: "-1", tiamina_mg: "0,083" }))
      .toEqual({ acucares_g: 12, saturados_g: 1.5, tiamina_mg: 0.083 });
    expect(nutrientesDoForm({})).toEqual({});
    expect(nutrientesDoForm(null)).toEqual({});
    expect(totalNutrientesPreenchidos({ saturados_g: "1,5", acucares_g: "abc", colesterol_mg: "0" })).toBe(2);
    expect(nutrientesParaForm({ saturados_g: 1.5, xpto_g: 1, colesterol_mg: 0 })).toEqual({ colesterol_mg: "0", saturados_g: "1,5" });
    expect(nutrientesParaForm(null)).toEqual({});
  });
  it("Açúcares entrou na tabela de nutrientes (logo depois da energia em kJ)", () => {
    const lista = nutrientesListados({ colesterol_mg: 0, acucares_g: 12, energia_kj: 500 });
    expect(lista.map((n) => n.chave)).toEqual(["energia_kj", "acucares_g", "colesterol_mg"]);
    expect(lista[1]).toMatchObject({ rotulo: "Açúcares", unidade: "g", valor: 12 });
  });
});
