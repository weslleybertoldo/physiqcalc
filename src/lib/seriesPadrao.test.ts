import { describe, it, expect } from "vitest";
import {
  chaveExercicio,
  chaveTreino,
  clampSeries,
  estruturaSeriesPadrao,
  mapaSeriesPadrao,
  numSeriesPadrao,
  numerosParaCompletar,
  temSeriesProprias,
  SERIES_PADRAO_DEFAULT,
} from "./seriesPadrao";

describe("numerosParaCompletar (admin subiu o número num dia com séries salvas)", () => {
  it("completa até o alvo", () => {
    expect(numerosParaCompletar([1, 2], 4)).toEqual([3, 4]);
    expect(numerosParaCompletar([1], 3)).toEqual([2, 3]);
  });
  it("não remove nem repete: alvo menor ou igual → nada a acrescentar", () => {
    expect(numerosParaCompletar([1, 2, 3, 4], 3)).toEqual([]);
    expect(numerosParaCompletar([1, 2, 3], 3)).toEqual([]);
  });
  it("preenche lacunas a partir do 1: só a S6 salva (S1..S5 vazias) e alvo 8 → S1..S5, S7, S8", () => {
    expect(numerosParaCompletar([6], 8)).toEqual([1, 2, 3, 4, 5, 7, 8]);
    expect(numerosParaCompletar([1, 3], 3)).toEqual([2]);
  });
  it("sem séries salvas monta do 1; alvo fora do limite é ajustado", () => {
    expect(numerosParaCompletar([], 2)).toEqual([1, 2]);
    expect(numerosParaCompletar([], 50)).toHaveLength(10);
  });
});

describe("chaves", () => {
  it("treino: distingue treinador e pessoal", () => {
    expect(chaveTreino("g1", null)).toBe("catalogo:g1");
    expect(chaveTreino(null, "p1")).toBe("pessoal:p1");
    expect(chaveTreino("g1", "p1")).toBe("pessoal:p1");
    expect(chaveTreino(null, null)).toBeNull();
  });
  it("exercício: catálogo, pessoal ou nenhum (= geral)", () => {
    expect(chaveExercicio("e1", null)).toBe("ex:e1");
    expect(chaveExercicio(null, "u1")).toBe("exu:u1");
    expect(chaveExercicio(null, null)).toBeNull();
    expect(chaveExercicio(undefined, undefined)).toBeNull();
  });
});

describe("clampSeries", () => {
  it("mantém entre 1 e 10 e arredonda", () => {
    expect(clampSeries(0)).toBe(1);
    expect(clampSeries(-4)).toBe(1);
    expect(clampSeries(15)).toBe(10);
    expect(clampSeries(3.6)).toBe(4);
    expect(clampSeries(NaN)).toBe(SERIES_PADRAO_DEFAULT);
  });
});

describe("mapaSeriesPadrao + numSeriesPadrao", () => {
  const mapa = mapaSeriesPadrao([
    { grupo_id: "g1", grupo_usuario_id: null, num_series: 4 }, // geral do treino g1
    { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: "e1", exercicio_usuario_id: null, num_series: 5 }, // só o e1
    { grupo_id: null, grupo_usuario_id: "p1", exercicio_id: null, exercicio_usuario_id: "u1", num_series: 2 }, // pessoal, ex. pessoal
    { grupo_id: "g2", grupo_usuario_id: null, num_series: 99 }, // fora do limite → 10
    { grupo_id: "g3", grupo_usuario_id: null, num_series: null }, // ignorada
  ]);

  it("exercício com número próprio vence o geral do treino", () => {
    expect(numSeriesPadrao(mapa, "catalogo:g1", "e1", null)).toBe(5);
    expect(numSeriesPadrao(mapa, "catalogo:g1", "e2", null)).toBe(4);
    expect(numSeriesPadrao(mapa, "catalogo:g1")).toBe(4);
  });

  it("treino pessoal com exercício pessoal", () => {
    expect(numSeriesPadrao(mapa, "pessoal:p1", null, "u1")).toBe(2);
    expect(numSeriesPadrao(mapa, "pessoal:p1", "e9", null)).toBe(3);
  });

  it("sem configuração (ou sem chave) vale o padrão 3; fora do limite é ajustado", () => {
    expect(numSeriesPadrao(mapa, "catalogo:g2")).toBe(10);
    expect(numSeriesPadrao(mapa, "catalogo:g3")).toBe(3);
    expect(numSeriesPadrao(mapa, "catalogo:inexistente", "e1", null)).toBe(3);
    expect(numSeriesPadrao(mapa, null)).toBe(3);
    expect(numSeriesPadrao(mapaSeriesPadrao(null), "catalogo:g1")).toBe(3);
  });

  it("temSeriesProprias só quando há linha do exercício", () => {
    expect(temSeriesProprias(mapa, "catalogo:g1", "e1", null)).toBe(true);
    expect(temSeriesProprias(mapa, "catalogo:g1", "e2", null)).toBe(false);
    expect(temSeriesProprias(mapa, "catalogo:g1", null, null)).toBe(false);
  });
});

describe("estruturaSeriesPadrao", () => {
  it("1 série feita ontem NÃO vira 1 série hoje: monta o alvo, com peso/reps do histórico onde houver", () => {
    const s = estruturaSeriesPadrao(3, [{ numero_serie: 1, peso: 40, reps: 12 }]);
    expect(s.map((x) => x.numero_serie)).toEqual([1, 2, 3]);
    expect(s[0]).toEqual({ numero_serie: 1, pesoUltimo: 40, reps: 12 });
    expect(s[1]).toEqual({ numero_serie: 2, pesoUltimo: 0, reps: 10 });
    expect(s[2]).toEqual({ numero_serie: 3, pesoUltimo: 0, reps: 10 });
  });

  it("histórico maior que o alvo é cortado no alvo", () => {
    const ultimo = [1, 2, 3, 4, 5].map((n) => ({ numero_serie: n, peso: n * 10, reps: 8 }));
    const s = estruturaSeriesPadrao(3, ultimo);
    expect(s).toHaveLength(3);
    expect(s[2]).toEqual({ numero_serie: 3, pesoUltimo: 30, reps: 8 });
  });

  it("alvo maior que o histórico completa com 0 kg × 10", () => {
    const s = estruturaSeriesPadrao(4, [{ numero_serie: 1, peso: 20, reps: 10 }, { numero_serie: 2, peso: 22, reps: 10 }]);
    expect(s).toHaveLength(4);
    expect(s[3]).toEqual({ numero_serie: 4, pesoUltimo: 0, reps: 10 });
  });

  it("sem histórico monta o alvo zerado; alvo fora do limite é ajustado", () => {
    expect(estruturaSeriesPadrao(3, null)).toHaveLength(3);
    expect(estruturaSeriesPadrao(3, [])[0]).toEqual({ numero_serie: 1, pesoUltimo: 0, reps: 10 });
    expect(estruturaSeriesPadrao(0, [])).toHaveLength(1);
    expect(estruturaSeriesPadrao(50, [])).toHaveLength(10);
  });

  it("peso/reps nulos no histórico caem no padrão", () => {
    const s = estruturaSeriesPadrao(1, [{ numero_serie: 1, peso: null, reps: null }]);
    expect(s[0]).toEqual({ numero_serie: 1, pesoUltimo: 0, reps: 10 });
  });
});
