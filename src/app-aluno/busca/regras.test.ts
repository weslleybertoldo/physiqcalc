import { describe, expect, it } from "vitest";
import { alimentosDaBusca, combina, destinoDoAlimento, exerciciosDaBusca, palavrasSemAcento } from "./regras";

describe("busca do app (NF10) — só o plano do aluno", () => {
  it("exercícios: um por exercício, com os treinos em que aparece (do profissional e os próprios), em ordem", () => {
    const lista = exerciciosDaBusca([
      { id: "e2", nome: "Tríceps pulley", grupo_muscular: "Tríceps", treino: "Peito e Tríceps" },
      { id: "e1", nome: "Supino reto com barra", grupo_muscular: "Peitoral", treino: "Peito e Tríceps", imagem_url: "/gifs/supino.gif" },
      { id: "e1", nome: "Supino reto com barra", grupo_muscular: "Peitoral", treino: "Meu treino de sábado" },
      { id: "e1", nome: "Supino reto com barra", grupo_muscular: "Peitoral", treino: "Peito e Tríceps" },
      { id: null, nome: null, grupo_muscular: null, treino: "linha sem exercício (LEFT JOIN)" },
    ]);
    expect(lista.map((e) => e.nome)).toEqual(["Supino reto com barra", "Tríceps pulley"]);
    expect(lista[0].treinos).toEqual(["Meu treino de sábado", "Peito e Tríceps"]);
    expect(lista[0].imagem_url).toBe("/gifs/supino.gif");
  });

  it("alimentos: do plano inteiro, um por nome; a refeição de hoje primeiro; destino = a refeição de hoje (ou o calendário)", () => {
    const item = (nome: string) => ({ alimento: { nome } }) as never;
    const plano = {
      refeicoes: [
        { id: "r-sab", nome: "Ceia de sábado", dias_semana: [6], itens: [item("Iogurte natural"), item("Aveia")] },
        { id: "r-cafe", nome: "Café da manhã", dias_semana: [], itens: [item("Aveia"), item("Banana")] },
      ],
    } as never;
    const lista = alimentosDaBusca(plano, "2026-09-30"); // quarta
    expect(lista.map((a) => a.nome)).toEqual(["Aveia", "Banana", "Iogurte natural"]);
    const aveia = lista[0];
    expect(aveia.refeicoes.map((r) => r.id)).toEqual(["r-cafe", "r-sab"]);
    expect(destinoDoAlimento(aveia)).toBe("/dieta?ver=refeicao&r=r-cafe");
    expect(destinoDoAlimento(lista[2])).toBe("/dieta?ver=dia");
    expect(alimentosDaBusca(null, "2026-09-30")).toEqual([]);
  });

  it("acha sem acento", () => {
    expect(palavrasSemAcento("Tríceps pulley", null, "Peito e Tríceps")).toEqual(["triceps pulley", "peito e triceps"]);
  });

  it("cada palavra digitada tem que aparecer (sem acento) — nada de letras soltas", () => {
    expect(combina("triceps", ["Tríceps Pulley", "Tríceps"])).toBe(true);
    expect(combina("peito", ["Supino Reto com Barra", "Peitoral"])).toBe(true);
    expect(combina("peito", ["Frango, peito, sem pele, grelhado", "Almoço"])).toBe(true);
    expect(combina("peito", ["Leg Press", "Quadríceps / Glúteo", "Pernas"])).toBe(false);
    expect(combina("supino reto", ["Supino Reto com Barra"])).toBe(true);
    expect(combina("supino declinado", ["Supino Reto com Barra"])).toBe(false);
    expect(combina("  ", ["qualquer"])).toBe(false);
  });
});
