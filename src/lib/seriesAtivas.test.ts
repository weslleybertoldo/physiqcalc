import { describe, it, expect } from "vitest";
import { chavesExerciciosAtivos, serieDeExercicioAtivo, seriesDoTreino } from "./seriesAtivas";

describe("chavesExerciciosAtivos", () => {
  it("indexa exercício do catálogo por id|slot", () => {
    const ativos = chavesExerciciosAtivos([{ exercicio_id: "supino", slot_idx: 0 }]);
    expect(ativos.has("supino|0")).toBe(true);
    expect(ativos.has("supino|1")).toBe(false);
  });

  it("exercício pessoal entra pelos dois ids", () => {
    const ativos = chavesExerciciosAtivos([{ exercicio_id: "meu", exercicio_usuario_id: "meu", slot_idx: 2 }]);
    expect(ativos.has("meu|2")).toBe(true);
  });
});

describe("serieDeExercicioAtivo", () => {
  const ativos = chavesExerciciosAtivos([
    { exercicio_id: "supino", slot_idx: 0 },
    { exercicio_id: "meu", exercicio_usuario_id: "meu", slot_idx: 0 },
  ]);

  it("mantém série de exercício que continua no treino", () => {
    expect(serieDeExercicioAtivo({ exercicio_id: "supino", slot_idx: 0 }, ativos)).toBe(true);
  });

  it("descarta série de exercício removido/trocado (o bug das séries fantasma)", () => {
    expect(serieDeExercicioAtivo({ exercicio_id: "remada-aberta", slot_idx: 0 }, ativos)).toBe(false);
    expect(serieDeExercicioAtivo({ exercicio_id: "corrida", slot_idx: 0 }, ativos)).toBe(false);
  });

  it("slot ausente conta como 0", () => {
    expect(serieDeExercicioAtivo({ exercicio_id: "supino" }, ativos)).toBe(true);
    expect(serieDeExercicioAtivo({ exercicio_id: "supino", slot_idx: 1 }, ativos)).toBe(false);
  });

  it("série pessoal casa pelo exercicio_usuario_id", () => {
    expect(serieDeExercicioAtivo({ exercicio_id: "x", exercicio_usuario_id: "meu", slot_idx: 0 }, ativos)).toBe(true);
  });
});

describe("seriesDoTreino", () => {
  const mapa = { supino: { nome: "Supino" }, remada: { nome: "Remada" } };

  it("filtra séries órfãs — 'todas concluídas' volta a ficar verdadeiro", () => {
    const series = [
      { exercicio_id: "supino", concluida: true },
      { exercicio_id: "remada", concluida: true },
      { exercicio_id: "corrida", concluida: false }, // removida do treino, ficou órfã no estado
    ];
    const doTreino = seriesDoTreino(series, mapa);
    expect(doTreino).toHaveLength(2);
    expect(doTreino.every((s) => s.concluida)).toBe(true);
  });

  it("sem órfãs devolve tudo", () => {
    const series = [{ exercicio_id: "supino" }, { exercicio_id: "remada" }];
    expect(seriesDoTreino(series, mapa)).toEqual(series);
  });

  it("não cai em chave herdada do prototype", () => {
    expect(seriesDoTreino([{ exercicio_id: "toString" }], mapa)).toHaveLength(0);
  });
});
