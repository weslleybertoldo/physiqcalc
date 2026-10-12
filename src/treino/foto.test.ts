import { describe, expect, it } from "vitest";
import { FOTOS_TREINO } from "@/ui/premium/fotos";
import { fotoDoSlot } from "./foto";
import type { DiaSlot } from "./tipos";

/** Um slot só com o que a foto usa: o grupo_muscular de cada exercício e o nome do treino. */
const slot = (nome: string, grupos: string[]) =>
  ({
    grupo: { nome },
    exercicios: grupos.map((grupo_muscular) => ({ tb_exercicios: { grupo_muscular } })),
  }) as unknown as Pick<DiaSlot, "exercicios" | "grupo">;

describe("foto do treino (P29) com Alongamento e mobilidade (12/10/2026)", () => {
  it("o bloco que mais aparece decide a foto", () => {
    expect(fotoDoSlot(slot("Treino A", ["Peitoral", "Peitoral", "Tríceps"]))).toBe(FOTOS_TREINO.peito);
  });

  it("alongamento não tem foto própria: como em 'Outros', vale o nome do treino (e, sem nome conhecido, a geral)", () => {
    expect(fotoDoSlot(slot("Pernas e alongamento", ["Alongamento", "Mobilidade", "Alongamento", "Quadríceps"]))).toBe(FOTOS_TREINO.pernas);
    expect(fotoDoSlot(slot("Treino de mobilidade", ["Mobilidade", "Mobilidade"]))).toBe(FOTOS_TREINO.geral);
    expect(fotoDoSlot(slot("Peito", ["Xablau", "Xablau"]))).toBe(FOTOS_TREINO.peito);
  });
});
