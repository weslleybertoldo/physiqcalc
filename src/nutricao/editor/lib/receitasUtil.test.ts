// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/receitasUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import type { AlimentoDoItem } from "./dietaUtil";
import {
  calcularReceita, escalarIngredientes, formIngredienteNovo, formReceitaNova, gramasDoFormIngrediente, gramasPorPorcao, ingredientesParaBanco,
  ingredientesParaForm, medidaInteira, nomeArquivoPDFReceita, nomeCopia, ordenarReceitas, pesoReceita, porPorcao, previaReceita, receitaParaBanco, receitaParaForm,
  resumoReceita, textoContagemReceitas, textoDadosReceita, textoPorPorcao, textoReceitaInteira, totaisReceita, validarGrupo, validarReceita, type FormIngrediente,
  type IngredienteCalc,
} from "./receitasUtil";

// massa do smoke: A = 200 kcal · P 10 · C 30 · L 5 por 100 g; B = 900 kcal · P 0 · C 0 · L 100 por 100 g, com 'colher de sopa' = 15 g
const A: AlimentoDoItem = { id: "a", nome: "Smoke W28 Alimento A", fonte: "proprio", energia_kcal: 200, proteina_g: 10, carboidrato_g: 30, lipidio_g: 5, fibra_g: 2, sodio_mg: 50, medidas_caseiras: [] };
const B: AlimentoDoItem = {
  id: "b", nome: "Smoke W28 Óleo B", fonte: "proprio", energia_kcal: 900, proteina_g: 0, carboidrato_g: 0, lipidio_g: 100, fibra_g: 0, sodio_mg: 0,
  medidas_caseiras: [{ id: "m1", descricao: "colher de sopa", gramas: 15, ordem: 0 }],
};
const ingA: IngredienteCalc = { alimento: A, quantidade_g: 200, medida_caseira_id: null, quantidade_medida: null };
const ingB: IngredienteCalc = { alimento: B, quantidade_g: 30, medida_caseira_id: "m1", quantidade_medida: 2 };

describe("cálculo da receita", () => {
  it("totais = soma da regra de 3 (200 g de A + 2 colheres de B)", () => {
    const t = totaisReceita([ingA, ingB]);
    expect(t.energia_kcal).toBe(670); // 400 + 270
    expect(t.proteina_g).toBe(20);
    expect(t.carboidrato_g).toBe(60);
    expect(t.lipidio_g).toBe(40); // 10 + 30
    expect(t.itens).toBe(2);
  });
  it("por porção divide com 1 casa nas kcal e 2 nas gramas; peso = rendimento ou soma das gramas", () => {
    const t = totaisReceita([ingA, ingB]);
    expect(porPorcao(t, 4).energia_kcal).toBe(167.5);
    expect(porPorcao(t, 4).proteina_g).toBe(5);
    expect(porPorcao(t, 3).lipidio_g).toBe(13.33);
    expect(pesoReceita(null, [ingA, ingB])).toBe(230);
    expect(pesoReceita(300, [ingA, ingB])).toBe(300);
    expect(gramasPorPorcao(300, 2)).toBe(150);
    expect(gramasPorPorcao(230, 4)).toBe(57.5);
  });
  it("calcularReceita junta tudo (porções inválidas contam como 1)", () => {
    const c = calcularReceita({ porcoes: 4, rendimento_g: null }, [ingA, ingB]);
    expect(c.porPorcao.energia_kcal).toBe(167.5);
    expect(c.peso).toBe(230);
    expect(c.gramasPorcao).toBe(57.5);
    expect(c.ingredientes).toBe(2);
    expect(calcularReceita({ porcoes: 0, rendimento_g: null }, [ingA]).porPorcao.energia_kcal).toBe(400);
  });
  it("escalar multiplica gramas e medida pelo fator; medida só é inteira quando dá número inteiro", () => {
    const meio = escalarIngredientes([ingA, ingB], 2, 4);
    expect(meio.map((i) => i.quantidade_g)).toEqual([100, 15]);
    expect(meio[1].quantidade_medida).toBe(1);
    const tres = escalarIngredientes([ingB], 3, 4);
    expect(tres[0].quantidade_g).toBe(22.5);
    expect(tres[0].quantidade_medida).toBe(1.5);
    expect(medidaInteira(tres[0].quantidade_medida)).toBe(false);
    expect(medidaInteira(meio[1].quantidade_medida)).toBe(true);
    expect(medidaInteira(null)).toBe(false);
    expect(escalarIngredientes([ingA], 0, 4)[0].quantidade_g).toBe(200); // fator inválido = 1
  });
});

describe("formulário ⇄ registro", () => {
  const linha = (extra: Partial<FormIngrediente>): FormIngrediente => ({ ...formIngredienteNovo(null), ...extra });
  it("gramas do ingrediente: modo gramas lê o campo (vírgula ok); modo medida calcula da medida", () => {
    expect(gramasDoFormIngrediente(linha({ alimento: A, modo: "gramas", quantidade_g: "200" }))).toBe(200);
    expect(gramasDoFormIngrediente(linha({ alimento: A, modo: "gramas", quantidade_g: "12,5" }))).toBe(12.5);
    expect(gramasDoFormIngrediente(linha({ alimento: B, modo: "medida", medida_caseira_id: "m1", quantidade_medida: "2" }))).toBe(30);
    expect(gramasDoFormIngrediente(linha({ alimento: B, modo: "medida", medida_caseira_id: "m1", quantidade_medida: "0" }))).toBeNull();
    expect(gramasDoFormIngrediente(linha({ alimento: A, modo: "gramas", quantidade_g: "" }))).toBeNull();
  });
  it("linha nova entra por medida quando o alimento tem medidas; senão 100 g", () => {
    expect(formIngredienteNovo(B).modo).toBe("medida");
    expect(formIngredienteNovo(B).quantidade_medida).toBe("1");
    expect(formIngredienteNovo(A).modo).toBe("gramas");
    expect(formIngredienteNovo(A).quantidade_g).toBe("100");
  });
  it("prévia ao vivo só conta as linhas completas; ingredientes pro banco ignoram a linha vazia e gravam gramas calculadas", () => {
    const f = { ...formReceitaNova(), nome: "Bolinho", porcoes: "4" };
    const ings = [linha({ alimento: A, modo: "gramas", quantidade_g: "200" }), linha({ alimento: B, modo: "medida", medida_caseira_id: "m1", quantidade_medida: "2" }), linha({})];
    const p = previaReceita(f, ings);
    expect(p.totais.energia_kcal).toBe(670);
    expect(p.porPorcao.energia_kcal).toBe(167.5);
    expect(p.ingredientes).toBe(2);
    const banco = ingredientesParaBanco(ings);
    expect(banco).toHaveLength(2);
    expect(banco[0]).toMatchObject({ alimento_id: "a", quantidade_g: 200, medida_caseira_id: null, quantidade_medida: null, ordem: 0 });
    expect(banco[1]).toMatchObject({ alimento_id: "b", quantidade_g: 30, medida_caseira_id: "m1", quantidade_medida: 2, ordem: 1 });
  });
  it("receita ida-e-volta (vírgula, vazios → null)", () => {
    const f = { ...formReceitaNova(), nome: "  Bolinho ", grupo_id: "g1", porcoes: "4", rendimento_g: "300,5", tempo_preparo_min: "25", favorita: true };
    const r = receitaParaBanco(f);
    expect(r).toMatchObject({ nome: "Bolinho", grupo_id: "g1", porcoes: 4, rendimento_g: 300.5, tempo_preparo_min: 25, favorita: true, modo_preparo: "", observacao: "" });
    expect(receitaParaBanco({ ...f, grupo_id: "", rendimento_g: "", tempo_preparo_min: "" })).toMatchObject({ grupo_id: null, rendimento_g: null, tempo_preparo_min: null });
    const volta = receitaParaForm({ ...r, modo_preparo: "## x", observacao: null });
    expect(volta).toMatchObject({ nome: "Bolinho", grupo_id: "g1", porcoes: "4", rendimento_g: "300,5", tempo_preparo_min: "25", modo_preparo: "## x", observacao: "", favorita: true });
    const formIngs = ingredientesParaForm([{ ...ingA, observacao: "sem sal" }, ingB]);
    expect(formIngs[0]).toMatchObject({ modo: "gramas", quantidade_g: "200", observacao: "sem sal" });
    expect(formIngs[1]).toMatchObject({ modo: "medida", medida_caseira_id: "m1", quantidade_medida: "2", quantidade_g: "30" });
  });
  it("validações da receita", () => {
    const ok = [linha({ alimento: A, modo: "gramas", quantidade_g: "200" })];
    const f = { ...formReceitaNova(), nome: "Bolinho", porcoes: "4" };
    expect(validarReceita(f, ok)).toBeNull();
    expect(validarReceita({ ...f, nome: " " }, ok)).toBe("Informe o nome da receita");
    expect(validarReceita({ ...f, porcoes: "0" }, ok)).toMatch(/porções/);
    expect(validarReceita({ ...f, rendimento_g: "-1" }, ok)).toMatch(/Rendimento/);
    expect(validarReceita({ ...f, tempo_preparo_min: "1,5" }, ok)).toMatch(/Tempo/);
    expect(validarReceita(f, [])).toMatch(/pelo menos 1 ingrediente/);
    expect(validarReceita(f, [linha({})])).toMatch(/pelo menos 1 ingrediente/); // linha vazia não conta
    expect(validarReceita(f, [linha({ quantidade_g: "10" })])).toMatch(/Escolha o alimento/);
    expect(validarReceita(f, [linha({ alimento: A, modo: "gramas", quantidade_g: "" })])).toMatch(/quantidade em gramas de Smoke W28 Alimento A/);
    expect(validarReceita(f, [linha({ alimento: B, modo: "medida", medida_caseira_id: "m1", quantidade_medida: "" })])).toMatch(/medida caseira/);
  });
  it("validação do grupo (nome único sem caixa, entre os outros)", () => {
    expect(validarGrupo("Lanches", ["Sobremesas"])).toBeNull();
    expect(validarGrupo("lanches ", ["Lanches"])).toBe("Já existe um grupo com esse nome");
    expect(validarGrupo("", [])).toBe("Informe o nome do grupo");
    expect(validarGrupo("x".repeat(61), [])).toMatch(/muito longo/);
  });
});

describe("lista", () => {
  const rec = (nome: string, favorita = false, grupo_id: string | null = null) => ({ nome, favorita, grupo_id });
  it("favoritas primeiro (mesmo quando NÃO é a 1ª alfabética), depois nome sem acento", () => {
    const l = ordenarReceitas([rec("Bolinho", true), rec("Arroz"), rec("Água"), rec("Zebra", true)]);
    expect(l.map((r) => r.nome)).toEqual(["Bolinho", "Zebra", "Água", "Arroz"]);
  });
  it("nome da cópia não empilha sufixo e numera quando repete", () => {
    expect(nomeCopia("Bolinho de atum", ["Bolinho de atum"])).toBe("Bolinho de atum (cópia)");
    expect(nomeCopia("Bolinho de atum", ["Bolinho de atum", "Bolinho de atum (cópia)"])).toBe("Bolinho de atum (cópia 2)");
    expect(nomeCopia("Bolinho de atum (cópia)", ["Bolinho de atum", "Bolinho de atum (cópia)"])).toBe("Bolinho de atum (cópia 2)");
    expect(nomeCopia("Bolinho (cópia 2)", ["Bolinho", "Bolinho (cópia)", "Bolinho (cópia 2)"])).toBe("Bolinho (cópia 3)");
  });
  it("textos e nome do PDF", () => {
    const c = calcularReceita({ porcoes: 4, rendimento_g: null }, [ingA, ingB]);
    expect(resumoReceita(c)).toBe("4 porções · 167,5 kcal/porção · P 5 g · C 15 g · L 10 g · 2 ingredientes");
    expect(textoReceitaInteira(c)).toBe("Receita inteira: 670 kcal · P 20 g · C 60 g · L 40 g · 230 g");
    expect(textoPorPorcao(c)).toBe("Por porção (4): 167,5 kcal · P 5 g · C 15 g · L 10 g · 57,5 g");
    expect(textoContagemReceitas(0, 0)).toBe("Nenhuma receita");
    expect(textoContagemReceitas(1, 1)).toBe("1 receita · 1 favorita");
    expect(textoContagemReceitas(2, 0)).toBe("2 receitas · nenhuma favorita");
    expect(textoDadosReceita({ porcoes: 4, rendimento_g: 300, tempo_preparo_min: 25 })).toBe("4 porções · rendimento 300 g · 25 min");
    expect(textoDadosReceita({ porcoes: 1, rendimento_g: null, tempo_preparo_min: null })).toBe("1 porção");
    expect(nomeArquivoPDFReceita("Smoke W28 Bolinho")).toBe("smoke-w28-bolinho-receita.pdf");
    expect(nomeArquivoPDFReceita("Bolo de açúcar!")).toBe("bolo-de-acucar-receita.pdf");
  });
});
