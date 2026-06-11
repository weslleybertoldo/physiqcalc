import { describe, it, expect } from "vitest";
import { selectSemanaConfigsForDia, type SemanaConfigLike } from "./semanaSlots";

const rows: SemanaConfigLike[] = [
  { dia_semana: "SEG", slot_idx: 1, grupo_id: "b", grupo_usuario_id: null },
  { dia_semana: "SEG", slot_idx: 0, grupo_id: "a", grupo_usuario_id: null },
  { dia_semana: "TER", slot_idx: 0, grupo_id: "c", grupo_usuario_id: null },
];

describe("selectSemanaConfigsForDia", () => {
  it("retorna todos os treinos do dia ordenados por slot_idx", () => {
    const seg = selectSemanaConfigsForDia(rows, "SEG");
    expect(seg.map((r) => r.grupo_id)).toEqual(["a", "b"]);
  });
  it("retorna 1 treino quando só há um", () => {
    expect(selectSemanaConfigsForDia(rows, "TER")).toHaveLength(1);
  });
  it("retorna vazio em dia de descanso", () => {
    expect(selectSemanaConfigsForDia(rows, "DOM")).toEqual([]);
  });
  it("trata slot_idx ausente como 0", () => {
    const r = selectSemanaConfigsForDia(
      [{ dia_semana: "QUA", slot_idx: null, grupo_id: "x", grupo_usuario_id: null }],
      "QUA",
    );
    expect(r).toHaveLength(1);
  });
  it("ordena com slot_idx null antes de número", () => {
    const r = selectSemanaConfigsForDia(
      [
        { dia_semana: "QUI", slot_idx: 1, grupo_id: "b", grupo_usuario_id: null },
        { dia_semana: "QUI", slot_idx: null, grupo_id: "a", grupo_usuario_id: null },
      ],
      "QUI",
    );
    expect(r.map((x) => x.grupo_id)).toEqual(["a", "b"]);
  });
});
