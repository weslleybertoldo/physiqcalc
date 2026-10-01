// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/energeticoUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  atividadesDoForm, atividadesInvalidas, calcular, calcularTMB, dadosFaltando, fatorParaForm, fmtAjuste, fmtKcal, formNovo, formParaRegistro,
  formulasDisponiveis, gastoAtividade, gastoAtividades, inserirOrdenado, lerAtividades, nomeArquivoPDF, ordenarCalculos, origemDosDados, previaDoForm,
  registroParaForm, resumoCalculo, rotuloFator, textoContagem, tmbCunningham, tmbFaoOms1985, tmbHarrisBenedict1919, tmbHarrisBenedict1984, tmbMifflin,
  tmbTinsley, type Dados, type FormEnergetico,
} from "./energeticoUtil";

// Valores de referência conferidos à mão (calculadora) com as equações publicadas.

const dados = (extra: Partial<Dados> = {}): Dados => ({ peso: 80, altura: 180, idade: 30, sexo: "masculino", massaMagra: null, ...extra });

const form = (extra: Partial<FormEnergetico> = {}): FormEnergetico => ({
  data: "2026-09-19",
  hora: "10:30",
  formula: "mifflin",
  peso: "80",
  altura: "180",
  idade: "36",
  sexo: "masculino",
  massa_magra: "69.11",
  fator_atividade: "1.55",
  atividades: [{ descricao: "Caminhada", met: "3,5", minutos_por_dia: "30" }],
  ajuste_kcal: "-500",
  objetivo: "emagrecer",
  observacao: "",
  ...extra,
});

describe("TMB — equações", () => {
  it("Harris-Benedict 1919 (H 80 kg/180 cm/30 a · M 60 kg/165 cm/25 a)", () => {
    expect(tmbHarrisBenedict1919("masculino", 80, 180, 30)).toBeCloseTo(1864.55, 1);
    expect(tmbHarrisBenedict1919("feminino", 60, 165, 25)).toBeCloseTo(1417.19, 1);
  });

  it("Harris-Benedict revisada 1984 (Roza & Shizgal)", () => {
    expect(tmbHarrisBenedict1984("masculino", 80, 180, 30)).toBeCloseTo(1853.63, 1);
    expect(tmbHarrisBenedict1984("feminino", 60, 165, 25)).toBeCloseTo(1405.33, 1);
  });

  it("Mifflin-St Jeor", () => {
    expect(tmbMifflin("masculino", 80, 180, 30)).toBe(1780);
    expect(tmbMifflin("feminino", 60, 165, 25)).toBe(1345.25);
  });

  it("FAO/OMS 1985 por faixa de idade (limites 3, 10, 18, 30 e 60 entram na faixa de cima)", () => {
    expect(tmbFaoOms1985("feminino", 12, 2)).toBeCloseTo(681, 5);
    expect(tmbFaoOms1985("masculino", 20, 5)).toBeCloseTo(949, 5);
    expect(tmbFaoOms1985("feminino", 50, 15)).toBeCloseTo(1356, 5);
    expect(tmbFaoOms1985("masculino", 70, 17)).toBeCloseTo(1876, 5);
    expect(tmbFaoOms1985("masculino", 70, 18)).toBeCloseTo(1750, 5);
    expect(tmbFaoOms1985("feminino", 60, 25)).toBeCloseTo(1378, 5);
    expect(tmbFaoOms1985("masculino", 80, 30)).toBeCloseTo(1807, 5);
    expect(tmbFaoOms1985("feminino", 70, 45)).toBeCloseTo(1438, 5);
    expect(tmbFaoOms1985("masculino", 70, 60)).toBeCloseTo(1432, 5);
    expect(tmbFaoOms1985("feminino", 60, 70)).toBeCloseTo(1226, 5);
  });

  it("Cunningham e Tinsley pela massa magra", () => {
    expect(tmbCunningham(69.11)).toBeCloseTo(2020.42, 2);
    expect(tmbTinsley(69.11)).toBeCloseTo(2073.95, 1);
  });

  it("calcularTMB arredonda a 2 casas e devolve null quando falta dado", () => {
    expect(calcularTMB("mifflin", dados())).toBe(1780);
    expect(calcularTMB("harris_benedict_1919", dados())).toBeCloseTo(1864.55, 1);
    expect(calcularTMB("harris_benedict_1984", dados())).toBe(1853.63);
    expect(calcularTMB("fao_oms_1985", dados({ altura: null }))).toBe(1807);
    expect(calcularTMB("cunningham", dados({ peso: null, altura: null, idade: null, sexo: "", massaMagra: 69.11 }))).toBe(2020.42);
    expect(calcularTMB("tinsley", dados({ massaMagra: 69.11 }))).toBe(2073.95);
    expect(calcularTMB("mifflin", dados({ altura: null }))).toBeNull();
    expect(calcularTMB("mifflin", dados({ sexo: "" }))).toBeNull();
    expect(calcularTMB("cunningham", dados())).toBeNull();
  });
});

describe("requisitos por fórmula", () => {
  it("diz o que falta, na ordem do formulário", () => {
    expect(dadosFaltando("mifflin", dados())).toEqual([]);
    expect(dadosFaltando("mifflin", dados({ peso: null, altura: 0, idade: null, sexo: "" }))).toEqual(["peso", "altura", "idade", "sexo"]);
    expect(dadosFaltando("fao_oms_1985", dados({ altura: null }))).toEqual([]);
    expect(dadosFaltando("cunningham", dados())).toEqual(["massa magra"]);
    expect(dadosFaltando("tinsley", dados({ peso: null, massaMagra: 60 }))).toEqual([]);
  });

  it("fórmulas disponíveis com o que se tem", () => {
    expect(formulasDisponiveis(dados({ massaMagra: 69.11 }))).toHaveLength(6);
    expect(formulasDisponiveis({ peso: null, altura: null, idade: null, sexo: "", massaMagra: 60 })).toEqual(["cunningham", "tinsley"]);
    expect(formulasDisponiveis(dados({ altura: null }))).toEqual(["fao_oms_1985"]);
    expect(formulasDisponiveis({ peso: null, altura: null, idade: null, sexo: "", massaMagra: null })).toEqual([]);
  });
});

describe("atividades (MET)", () => {
  it("gasto de uma atividade = MET × peso × horas", () => {
    expect(gastoAtividade({ met: 3.5, minutos_por_dia: 30 }, 80)).toBe(140);
    expect(gastoAtividade({ met: 7, minutos_por_dia: 45 }, 70)).toBe(367.5);
  });

  it("soma das atividades: vazio → 0; sem peso → null", () => {
    const lista = [{ descricao: "Caminhada", met: 3.5, minutos_por_dia: 30 }, { descricao: "Corrida", met: 8, minutos_por_dia: 20 }];
    expect(gastoAtividades([], null)).toBe(0);
    expect(gastoAtividades(lista, 80)).toBeCloseTo(353.33, 2);
    expect(gastoAtividades(lista, null)).toBeNull();
  });

  it("lê o jsonb tolerando lixo", () => {
    expect(lerAtividades([{ descricao: "Corrida", met: "8", minutos_por_dia: "30.4" }, { descricao: "x", met: 0, minutos_por_dia: 10 }, "lixo", null, [1]])).toEqual([
      { descricao: "Corrida", met: 8, minutos_por_dia: 30 },
    ]);
    expect(lerAtividades(null)).toEqual([]);
    expect(lerAtividades({ met: 3 })).toEqual([]);
  });

  it("linhas do formulário: em branco é ignorada, incompleta é inválida", () => {
    expect(atividadesInvalidas([{ descricao: "Caminhada", met: "3,5", minutos_por_dia: "30" }])).toEqual([]);
    expect(atividadesInvalidas([{ descricao: "", met: "", minutos_por_dia: "" }])).toEqual([]);
    expect(atividadesInvalidas([{ descricao: "", met: "3.5", minutos_por_dia: "30" }, { descricao: "Natação", met: "6", minutos_por_dia: "" }])).toEqual([1, 2]);
    expect(atividadesInvalidas([{ descricao: "Muito", met: "40", minutos_por_dia: "30" }, { descricao: "Dia todo", met: "2", minutos_por_dia: "1500" }])).toEqual([1, 2]);
    expect(atividadesDoForm([{ descricao: " Caminhada ", met: "3,5", minutos_por_dia: "30" }, { descricao: "", met: "", minutos_por_dia: "" }, { descricao: "Sem MET", met: "", minutos_por_dia: "10" }])).toEqual([
      { descricao: "Caminhada", met: 3.5, minutos_por_dia: 30 },
    ]);
  });
});

describe("calcular (tudo junto)", () => {
  it("Mifflin 80 kg/180 cm/36 a homem · fator 1,55 · caminhada 3,5 MET × 30 min · ajuste −500", () => {
    const r = calcular({ ...dados({ idade: 36 }), formula: "mifflin", fatorAtividade: 1.55, atividades: [{ descricao: "Caminhada", met: 3.5, minutos_por_dia: 30 }], ajusteKcal: -500 });
    expect(r.tmb).toBe(1750);
    expect(r.extra).toBe(140);
    expect(r.get).toBe(2852.5);
    expect(r.vet).toBe(2352.5);
  });

  it("sem atividades o extra é 0 e o ajuste positivo soma", () => {
    const r = calcular({ ...dados(), formula: "harris_benedict_1984", fatorAtividade: 1.2, atividades: [], ajusteKcal: 300 });
    expect(r.tmb).toBe(1853.63);
    expect(r.extra).toBe(0);
    expect(r.get).toBeCloseTo(2224.36, 2);
    expect(r.vet).toBeCloseTo(2524.36, 2);
  });

  it("Cunningham com atividades mas sem peso: TMB sai, GET/VET não", () => {
    const r = calcular({ peso: null, altura: null, idade: null, sexo: "", massaMagra: 69.11, formula: "cunningham", fatorAtividade: 1.55, atividades: [{ descricao: "Corrida", met: 8, minutos_por_dia: 20 }], ajusteKcal: 0 });
    expect(r.tmb).toBe(2020.42);
    expect(r.extra).toBeNull();
    expect(r.get).toBeNull();
    expect(r.vet).toBeNull();
  });

  it("sem fator ou sem dado da fórmula não fecha", () => {
    expect(calcular({ ...dados(), formula: "mifflin", fatorAtividade: null, atividades: [], ajusteKcal: 0 })).toEqual({ tmb: 1780, extra: 0, get: null, vet: null });
    expect(calcular({ ...dados({ altura: null }), formula: "mifflin", fatorAtividade: 1.2, atividades: [], ajusteKcal: 0 })).toEqual({ tmb: null, extra: 0, get: null, vet: null });
  });
});

describe("textos", () => {
  it("kcal com separador de milhar e sinal do ajuste", () => {
    expect(fmtKcal(1750)).toBe("1.750");
    expect(fmtKcal(2852.5)).toBe("2.853");
    expect(fmtKcal(999)).toBe("999");
    expect(fmtKcal(1234567)).toBe("1.234.567");
    expect(fmtKcal(null)).toBe("—");
    expect(fmtAjuste(-500)).toBe("-500");
    expect(fmtAjuste(-1500)).toBe("-1.500");
    expect(fmtAjuste(300)).toBe("+300");
    expect(fmtAjuste(0)).toBe("0");
  });

  it("resumo da linha, contagem e rótulo do fator", () => {
    expect(resumoCalculo({ formula: "mifflin", tmb: 1750, get: 2852.5, vet: 2352.5 })).toBe("Mifflin-St Jeor · TMB 1.750 · GET 2.853 · VET 2.353 kcal");
    expect(resumoCalculo({ formula: "cunningham", tmb: 2020.42, get: null, vet: null })).toBe("Cunningham · TMB 2.020 kcal");
    expect(resumoCalculo({ formula: "tinsley", tmb: null, get: null, vet: null })).toBe("Tinsley");
    expect(textoContagem(0)).toBe("Nenhum cálculo");
    expect(textoContagem(1)).toBe("1 cálculo");
    expect(textoContagem(4)).toBe("4 cálculos");
    expect(rotuloFator(1.55)).toBe("Moderadamente ativo — 1,55");
    expect(rotuloFator("1.375")).toBe("Levemente ativo — 1,375");
    expect(rotuloFator(1.6)).toBe("1,600");
    expect(rotuloFator(null)).toBe("—");
    expect(fatorParaForm(1.725)).toBe("1.725");
    expect(fatorParaForm(1.6)).toBe("1.6");
    expect(fatorParaForm(null)).toBe("1.2");
  });

  it("nome do PDF sem acento", () => {
    expect(nomeArquivoPDF("João da Silva", new Date(2026, 8, 19))).toBe("calculo-energetico-joao-da-silva-2026-09-19.pdf");
    expect(nomeArquivoPDF("", new Date(2026, 8, 19))).toBe("calculo-energetico-paciente-2026-09-19.pdf");
  });
});

describe("formulário ⇄ registro", () => {
  it("formulário vira registro com números, atividades válidas e resultados calculados", () => {
    const r = formParaRegistro(form({ peso: "80,0", atividades: [{ descricao: "Caminhada", met: "3,5", minutos_por_dia: "30" }, { descricao: "", met: "", minutos_por_dia: "" }], observacao: "  ok  " }));
    expect(r.formula).toBe("mifflin");
    expect(r.peso).toBe(80);
    expect(r.altura).toBe(180);
    expect(r.idade).toBe(36);
    expect(r.sexo).toBe("masculino");
    expect(r.massa_magra).toBe(69.11);
    expect(r.fator_atividade).toBe(1.55);
    expect(r.atividades).toEqual([{ descricao: "Caminhada", met: 3.5, minutos_por_dia: 30 }]);
    expect(r.tmb).toBe(1750);
    expect(r.get).toBe(2852.5);
    expect(r.ajuste_kcal).toBe(-500);
    expect(r.vet).toBe(2352.5);
    expect(r.objetivo).toBe("emagrecer");
    expect(r.observacao).toBe("ok");
    expect(new Date(r.data).getHours()).toBe(10);
  });

  it("sem fator válido cai no sedentário; ajuste vazio é 0", () => {
    const r = formParaRegistro(form({ fator_atividade: "abc", ajuste_kcal: "", atividades: [] }));
    expect(r.fator_atividade).toBe(1.2);
    expect(r.ajuste_kcal).toBe(0);
    expect(r.get).toBe(2100);
    expect(r.vet).toBe(2100);
  });

  it("prévia calcula sem depender da data", () => {
    expect(previaDoForm(form({ data: "", hora: "" })).vet).toBe(2352.5);
    expect(previaDoForm(form({ formula: "cunningham" })).tmb).toBe(2020.42);
  });

  it("registro volta pro formulário (ida e volta)", () => {
    const f = registroParaForm({
      data: "2026-09-19T13:30:00.000Z", formula: "harris_benedict_1984", peso: 80, altura: 180, idade: 36, sexo: "feminino", massa_magra: null,
      fator_atividade: 1.375, atividades: [{ descricao: "Corrida", met: 8, minutos_por_dia: 20 }], ajuste_kcal: -500, objetivo: "emagrecer", observacao: null,
    });
    expect(f.formula).toBe("harris_benedict_1984");
    expect(f.peso).toBe("80");
    expect(f.sexo).toBe("feminino");
    expect(f.massa_magra).toBe("");
    expect(f.fator_atividade).toBe("1.375");
    expect(f.atividades).toEqual([{ descricao: "Corrida", met: "8", minutos_por_dia: "20" }]);
    expect(f.ajuste_kcal).toBe("-500");
    expect(f.objetivo).toBe("emagrecer");
    expect(f.observacao).toBe("");
    expect(f.data).toBe("2026-09-19");
    const zero = registroParaForm({ data: "2026-09-19T13:30:00.000Z", formula: "x", peso: null, altura: null, idade: null, sexo: null, massa_magra: null, fator_atividade: 1.2, atividades: null, ajuste_kcal: 0, objetivo: "y", observacao: "obs" });
    expect(zero.formula).toBe("mifflin");
    expect(zero.objetivo).toBe("manter");
    expect(zero.ajuste_kcal).toBe("");
    expect(zero.atividades).toEqual([]);
    expect(zero.observacao).toBe("obs");
  });
});

describe("pré-preenchimento", () => {
  const paciente = { genero: "masculino", nascimento: "1990-05-10" };
  const agora = new Date(2026, 8, 19, 9, 5);
  const ultima = { data: "2026-09-18T10:00:00.000Z", peso: 80, altura: 180, sexo: "masculino", idade: 35, resultados: { imc: 24.69, massa_magra: 69.11 } };

  it("com antropometria: peso, altura, sexo e massa magra dela; idade recalculada do nascimento", () => {
    const o = origemDosDados(paciente, ultima, agora);
    expect(o.tipo).toBe("antropometria");
    expect(o.peso).toBe(80);
    expect(o.altura).toBe(180);
    expect(o.idade).toBe(36);
    expect(o.sexo).toBe("masculino");
    expect(o.massaMagra).toBe(69.11);
    expect(origemDosDados({ genero: null, nascimento: null }, { ...ultima, sexo: null, resultados: {} }, agora)).toMatchObject({ idade: 35, sexo: "", massaMagra: null });
  });

  it("sem antropometria: só idade e sexo do cadastro", () => {
    const o = origemDosDados({ genero: "feminino", nascimento: "1990-05-10" }, null, agora);
    expect(o).toEqual({ tipo: "cadastro", data: null, peso: null, altura: null, idade: 36, sexo: "feminino", massaMagra: null });
    expect(origemDosDados({ genero: "outro", nascimento: null }, undefined, agora).sexo).toBe("");
  });

  it("formulário novo nasce com a origem, sedentário, sem atividades e sem ajuste", () => {
    const f = formNovo(origemDosDados(paciente, ultima, agora), "harris_benedict_1984", agora);
    expect(f.data).toBe("2026-09-19");
    expect(f.hora).toBe("09:05");
    expect(f.formula).toBe("harris_benedict_1984");
    expect(f.peso).toBe("80");
    expect(f.massa_magra).toBe("69.11");
    expect(f.fator_atividade).toBe("1.2");
    expect(f.atividades).toEqual([]);
    expect(f.ajuste_kcal).toBe("");
    expect(f.objetivo).toBe("manter");
    expect(formNovo(origemDosDados({ genero: null, nascimento: null }, null, agora)).peso).toBe("");
  });
});

describe("lista", () => {
  const a = { id: "a", data: "2026-09-18T10:00:00.000Z", created_at: "2026-09-18T10:00:00.000Z" };
  const b = { id: "b", data: "2026-09-19T10:00:00.000Z", created_at: "2026-09-19T10:00:00.000Z" };

  it("mais recente primeiro e inserção ordenada", () => {
    expect(ordenarCalculos([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirOrdenado([a], b).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirOrdenado([a, b], { ...b, data: "2026-09-17T10:00:00.000Z" }).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
