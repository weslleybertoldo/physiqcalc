import { describe, expect, it } from "vitest";
import {
  CHAVES_TIPO, abaInicial, abasVisiveis, chaveDoItem, contarPorTipo, filtrarModelos, fmtInteiro, fmtKcal1, fontesDaPessoa, formatarAtualizado, infoTipo,
  montarModelos, ordenarModelos, resumoPlano, resumoTreino, rotaPlano, rotaReceita, rotaTreino, textoContagem, textoDias, tiposComItens, trechoDoModelo,
  type FontesModelos,
} from "./regras";

// Physiq W26 — as regras do Modelos ★ (porte do favoritosUtil.test.ts do PhysiqNutri, W29) + a aba Treinos e as rotas do Physiq.
const AT = "2026-09-20T15:00:00+00:00";
const fontes: FontesModelos = {
  treinos: [
    { id: "g1", nome: "Treino A · Peito", pasta_id: "pa2", pasta_nome: "Hipertrofia", exercicios: 5, global: false },
    { id: "g1", nome: "Treino A · Peito", pasta_id: "pa1", pasta_nome: "Força", exercicios: 5, global: false },
    { id: "g2", nome: "Iniciante", pasta_id: "pa3", pasta_nome: "Catálogo", exercicios: 0, global: true },
  ],
  anamneses: [{ id: "a1", updated_at: AT, titulo: "Anamnese esportiva", perguntas: ["1", "2", "3"] }],
  planos: [{ id: "p1", updated_at: AT, titulo: "Plano 1800", paciente_id: "pac1", paciente_nome: "Joana", kcal: 1834.4, refeicoes: 5 }],
  orientacoes: [{ id: "o1", updated_at: AT, titulo: "Hidratação", conteudo: "## Água\n- beba\n## Sal\n- pouco" }],
  recibos: [{ id: "rc1", updated_at: AT, titulo: "Recibo padrão", conteudo: "Recebi de *|NOME_PACIENTE|* o valor de *|VALOR|*." }],
  metas: [{ id: "m1", updated_at: AT, titulo: "Água 2 L", dias_semana: [1, 2, 3, 4, 5] }],
  receitas: [{ id: "re1", updated_at: AT, nome: "Bolo de banana", porcoes: 8, kcal_porcao: 167.5, ingredientes: 4 }],
};

describe("Modelos — tipos", () => {
  it("Treinos primeiro e depois a ordem do site antigo", () => {
    expect(CHAVES_TIPO).toEqual(["treino", "anamnese", "plano", "orientacao", "recibo", "documento", "meta", "manipulado", "exame", "questionario", "produto", "receita"]);
    expect(infoTipo("treino").modulo).toBe("treino");
    expect(infoTipo("recibo").modulo).toBe("ambos");
    expect(infoTipo("receita").modulo).toBe("nutricao");
  });
  it("cada aba conforme o módulo e o papel (spec 4.6)", () => {
    const so = (o: Parameters<typeof fontesDaPessoa>[0]) => [...fontesDaPessoa(o)].sort();
    expect(so({ modulos: ["treino"], papeis: ["dono", "personal"], master: false })).toEqual(["recibo", "treino"]);
    expect(so({ modulos: ["nutricao"], papeis: ["dono", "nutricionista"], master: false })).not.toContain("treino");
    expect(so({ modulos: ["treino", "nutricao"], papeis: ["dono"], master: false })).toEqual(["recibo"]);
    expect(so({ modulos: [], papeis: [], master: true }).length).toBe(CHAVES_TIPO.length);
  });
});

describe("Modelos — montar", () => {
  const itens = montarModelos(fontes);
  it("treino em 2 pastas aparece 1 vez (a 1ª pasta por nome) e não tem estrela", () => {
    const t = itens.filter((i) => i.tipo === "treino");
    expect(t.map((i) => i.id)).toEqual(["g2", "g1"]);
    expect(t.find((i) => i.id === "g1")?.rota).toBe(rotaTreino("pa1", "g1"));
    expect(t.every((i) => !i.desfavoritavel)).toBe(true);
    expect(resumoTreino({ id: "g2", nome: "x", pasta_id: "p", pasta_nome: "Catálogo", exercicios: 0, global: true })).toBe("Pasta Catálogo · sem exercícios · do catálogo (só leitura)");
  });
  it("ordem: tipo → título sem acento → id", () => {
    expect(itens.map(chaveDoItem)).toEqual(["treino:g2", "treino:g1", "anamnese:a1", "plano:p1", "orientacao:o1", "recibo:rc1", "meta:m1", "receita:re1"]);
    expect(ordenarModelos([...itens].reverse()).map(chaveDoItem)).toEqual(itens.map(chaveDoItem));
  });
  it("resumos e rotas", () => {
    expect(itens.find((i) => i.id === "a1")?.resumo).toBe("3 perguntas");
    expect(resumoPlano(fontes.planos![0])).toBe("Joana · 1.834 kcal · 5 refeições");
    expect(itens.find((i) => i.id === "p1")?.rota).toBe(rotaPlano("pac1"));
    expect(itens.find((i) => i.id === "re1")?.rota).toBe(rotaReceita("Bolo de banana"));
    expect(itens.find((i) => i.id === "re1")?.resumo).toBe("8 porções · 167,5 kcal/porção · 4 ingredientes");
    expect(itens.find((i) => i.id === "rc1")?.rota).toBe("/painel/financeiro?aba=recibos");
    expect(itens.find((i) => i.id === "m1")?.resumo).toBe(textoDias([1, 2, 3, 4, 5]));
    expect(trechoDoModelo("Recebi de *|NOME_PACIENTE|*")).toBe("Recebi de [nome paciente]");
    expect(trechoDoModelo("x".repeat(100), 10)).toHaveLength(10);
    expect(fmtInteiro(1850)).toBe("1.850");
    expect(fmtKcal1(200)).toBe("200");
  });
});

describe("Modelos — abas, busca e textos", () => {
  const itens = montarModelos(fontes);
  const c = contarPorTipo(itens);
  it("Todos + só os tipos com itens; aba da URL só se tiver itens", () => {
    expect(abasVisiveis(c)).toEqual(["todos", "treino", "anamnese", "plano", "orientacao", "recibo", "meta", "receita"]);
    expect(abaInicial(c, "plano")).toBe("plano");
    expect(abaInicial(c, "exame")).toBe("todos");
    expect(abaInicial(c, null)).toBe("todos");
    expect(tiposComItens(c)).toHaveLength(7);
  });
  it("busca por palavras sem acento no título e no resumo", () => {
    expect(filtrarModelos(itens, "hidratacao", "todos").map((i) => i.id)).toEqual(["o1"]);
    expect(filtrarModelos(itens, "joana", "plano").map((i) => i.id)).toEqual(["p1"]);
    expect(filtrarModelos(itens, "joana", "receita")).toEqual([]);
    expect(filtrarModelos(itens, "", "treino").map((i) => i.id)).toEqual(["g2", "g1"]);
  });
  it("textos", () => {
    expect(textoContagem(0, 0)).toBe("Nenhum modelo");
    expect(textoContagem(1, 1)).toBe("1 modelo em 1 tipo");
    expect(textoContagem(12, 5)).toBe("12 modelos em 5 tipos");
    expect(formatarAtualizado(null)).toBe("");
    expect(formatarAtualizado("2026-09-20T15:00:00+00:00")).toMatch(/^atualizado em 20\/09\/2026$/);
  });
});
