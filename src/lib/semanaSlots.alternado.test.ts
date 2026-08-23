import { describe, it, expect } from "vitest";
import {
  resolverTreinosDoDia,
  indiceRotacao,
  segundaDaSemana,
  type SemanaConfigLike,
  type DiaAlternadoConfig,
} from "./semanaSlots";

const row = (over: Partial<SemanaConfigLike> = {}): SemanaConfigLike => ({
  dia_semana: "SEX",
  slot_idx: 0,
  grupo_id: null,
  grupo_usuario_id: null,
  extra: 0,
  extra_atrelado_grupo_id: null,
  extra_atrelado_grupo_usuario_id: null,
  ...over,
});

const A = row({ grupo_id: "A", slot_idx: 0 });
const B = row({ grupo_id: "B", slot_idx: 1 });
const C = row({ grupo_id: "C", slot_idx: 2 });

const cfg = (inicio: string): DiaAlternadoConfig => ({
  dia_semana: "SEX",
  alternado: 1,
  alternado_inicio: inicio,
});

// 2026-08-17 é segunda; âncora usada nos testes
const INICIO = "2026-08-17";

describe("segundaDaSemana / indiceRotacao", () => {
  it("acha a segunda da semana", () => {
    expect(segundaDaSemana("2026-08-23")).toBe("2026-08-17"); // domingo
    expect(segundaDaSemana("2026-08-17")).toBe("2026-08-17"); // segunda
    expect(segundaDaSemana("2026-08-28")).toBe("2026-08-24");
  });
  it("rotação avança 1 por semana e cicla", () => {
    expect(indiceRotacao("2026-08-21", INICIO, 3)).toBe(0);
    expect(indiceRotacao("2026-08-28", INICIO, 3)).toBe(1);
    expect(indiceRotacao("2026-09-04", INICIO, 3)).toBe(2);
    expect(indiceRotacao("2026-09-11", INICIO, 3)).toBe(0);
  });
  it("data antes da âncora não quebra (mod negativo)", () => {
    expect(indiceRotacao("2026-08-14", INICIO, 2)).toBe(1);
  });
});

describe("resolverTreinosDoDia — alternado OFF", () => {
  it("retorna todos os treinos do dia (comportamento atual)", () => {
    const res = resolverTreinosDoDia([A, B], "SEX", "2026-08-21", null);
    expect(res.map((r) => r.grupo_id)).toEqual(["A", "B"]);
  });
  it("extras ficam de fora com alternado off", () => {
    const extra = row({ grupo_id: "X", slot_idx: 100, extra: 1 });
    const res = resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-21", { dia_semana: "SEX", alternado: 0, alternado_inicio: null });
    expect(res.map((r) => r.grupo_id)).toEqual(["A", "B"]);
  });
});

describe("resolverTreinosDoDia — alternado ON", () => {
  it("1 treino: não muda nada (sempre o mesmo)", () => {
    expect(resolverTreinosDoDia([A], "SEX", "2026-08-21", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["A"]);
    expect(resolverTreinosDoDia([A], "SEX", "2026-08-28", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["A"]);
  });

  it("2 treinos: alterna semana a semana", () => {
    expect(resolverTreinosDoDia([A, B], "SEX", "2026-08-21", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["A"]);
    expect(resolverTreinosDoDia([A, B], "SEX", "2026-08-28", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["B"]);
    expect(resolverTreinosDoDia([A, B], "SEX", "2026-09-04", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["A"]);
  });

  it("3 treinos: A, B, C e volta pro A", () => {
    const lista = [A, B, C];
    const seq = ["2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11"].map(
      (d) => resolverTreinosDoDia(lista, "SEX", d, cfg(INICIO))[0].grupo_id,
    );
    expect(seq).toEqual(["A", "B", "C", "A"]);
  });

  it("extra atrelado ao A aparece só nas semanas do A", () => {
    const extra = row({ grupo_id: "X", slot_idx: 100, extra: 1, extra_atrelado_grupo_id: "A" });
    const s1 = resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-21", cfg(INICIO));
    const s2 = resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-28", cfg(INICIO));
    expect(s1.map((r) => r.grupo_id)).toEqual(["A", "X"]);
    expect(s2.map((r) => r.grupo_id)).toEqual(["B"]);
  });

  it("extra sem atrelamento aparece toda semana", () => {
    const extra = row({ grupo_id: "X", slot_idx: 100, extra: 1 });
    expect(resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-21", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["A", "X"]);
    expect(resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-28", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["B", "X"]);
  });

  it("extra atrelado a treino que saiu da rotação vale pra todas as semanas", () => {
    const extra = row({ grupo_id: "X", slot_idx: 100, extra: 1, extra_atrelado_grupo_id: "C" });
    expect(resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-21", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["A", "X"]);
    expect(resolverTreinosDoDia([A, B, extra], "SEX", "2026-08-28", cfg(INICIO)).map((r) => r.grupo_id)).toEqual(["B", "X"]);
  });

  it("extra atrelado a grupo PESSOAL segue o treino pessoal", () => {
    const P = row({ grupo_usuario_id: "P", slot_idx: 1 });
    const extra = row({ grupo_id: "X", slot_idx: 100, extra: 1, extra_atrelado_grupo_usuario_id: "P" });
    expect(resolverTreinosDoDia([A, P, extra], "SEX", "2026-08-21", cfg(INICIO)).map((r) => r.grupo_id ?? r.grupo_usuario_id)).toEqual(["A"]);
    expect(resolverTreinosDoDia([A, P, extra], "SEX", "2026-08-28", cfg(INICIO)).map((r) => r.grupo_id ?? r.grupo_usuario_id)).toEqual(["P", "X"]);
  });

  it("dia sem treinos: lista vazia", () => {
    expect(resolverTreinosDoDia([], "SEX", "2026-08-21", cfg(INICIO))).toEqual([]);
  });
});
