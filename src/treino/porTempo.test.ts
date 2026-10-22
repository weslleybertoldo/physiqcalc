import { describe, expect, it } from "vitest";
import {
  EXERCICIOS_POR_TEMPO,
  PRANCHA_ID,
  PRANCHA_LATERAL_ID,
  ehPorTempo,
  estadoDoCronometro,
  formatarSegundos,
  lerSegundos,
  metaSegundos,
  relogio,
  textoDaSerie,
} from "./porTempo";

// Decisão do Weslley (21/10/2026): a Prancha e a Prancha Lateral registram a série por TEMPO — conta pra baixo a partir da meta do
// profissional e apita; sem meta, conta pra cima; grava só o tempo; o aluno corrige na mão; a meta é em segundos.
const ESCALADOR_ID = "32b7d001-7a57-5443-b6da-87ec6ac7c1ee";

describe("série por tempo — quais exercícios", () => {
  it("só as 2 pranchas, pelos ids (o Escalador tem o mesmo movimento e continua por repetições)", () => {
    expect([...EXERCICIOS_POR_TEMPO].sort()).toEqual([PRANCHA_ID, PRANCHA_LATERAL_ID].sort());
    expect(ehPorTempo(PRANCHA_ID)).toBe(true);
    expect(ehPorTempo(PRANCHA_LATERAL_ID)).toBe(true);
    expect(ehPorTempo(ESCALADOR_ID)).toBe(false);
    expect(ehPorTempo(null)).toBe(false);
    expect(ehPorTempo(undefined)).toBe(false);
    expect(ehPorTempo("")).toBe(false);
  });
});

describe("série por tempo — ler o tempo (meta do profissional e o que o aluno digita)", () => {
  it.each([
    ["30", 30],
    ["30 s", 30],
    ["30s", 30],
    ["45 seg", 45],
    ["45 segundos", 45],
    ["1:30", 90],
    ["01:30", 90],
    ["0:45", 45],
    ["2 min", 120],
    ["1 min 30", 90],
    ["1 min 30 s", 90],
    ["30-45", 30],
    ["30 a 45 s", 30],
    [" 60 ", 60],
    ["600", 600],
  ])("%s → %i s", (texto, seg) => {
    expect(lerSegundos(texto)).toBe(seg);
  });

  it.each(["", "   ", "0", "0:00", "601", "11 min", "abc", "1:75", "-5", "8 reps"])("%s → nada", (texto) => {
    expect(lerSegundos(texto)).toBeNull();
  });

  it("meta vazia = sem meta (o cronômetro conta pra cima)", () => {
    expect(metaSegundos(null)).toBeNull();
    expect(metaSegundos(undefined)).toBeNull();
    expect(metaSegundos("")).toBeNull();
    expect(metaSegundos("45")).toBe(45);
  });
});

describe("série por tempo — textos", () => {
  it("formatarSegundos: o mesmo texto do descanso", () => {
    expect(formatarSegundos(30)).toBe("30 s");
    expect(formatarSegundos(90)).toBe("90 s");
    expect(formatarSegundos(120)).toBe("2 min");
    expect(formatarSegundos(150)).toBe("2 min 30 s");
    expect(formatarSegundos(0)).toBe("—");
    expect(formatarSegundos(null)).toBe("—");
  });

  it("relogio: minutos:segundos com 2 dígitos", () => {
    expect(relogio(0)).toBe("00:00");
    expect(relogio(5)).toBe("00:05");
    expect(relogio(90)).toBe("01:30");
    expect(relogio(600)).toBe("10:00");
    expect(relogio(-3)).toBe("00:00");
  });

  it("textoDaSerie: '45 s' na série por tempo (nunca '0 kg × 0'); peso × reps nas outras", () => {
    expect(textoDaSerie({ peso: 0, reps: 0, tempo_segundos: 45 })).toBe("45 s");
    expect(textoDaSerie({ peso: null, reps: null, tempo_segundos: 90 })).toBe("90 s");
    expect(textoDaSerie({ peso: 22.5, reps: 10 })).toBe("22,5 kg × 10");
    expect(textoDaSerie({ peso: 60, reps: 8, tempo_segundos: null })).toBe("60 kg × 8");
  });
});

describe("série por tempo — o cronômetro (relógio real desde o início)", () => {
  const inicio = 1_000_000;
  it("com meta: conta pra baixo, grava o que segurou e acaba na meta", () => {
    expect(estadoDoCronometro({ inicio, meta: 30, agora: inicio })).toEqual({ mostrado: 30, segurado: 0, acabou: false });
    expect(estadoDoCronometro({ inicio, meta: 30, agora: inicio + 12_400 })).toEqual({ mostrado: 18, segurado: 12, acabou: false });
    expect(estadoDoCronometro({ inicio, meta: 30, agora: inicio + 30_000 })).toEqual({ mostrado: 0, segurado: 30, acabou: true });
    // voltou do segundo plano bem depois: grava a meta, não o tempo fora da tela
    expect(estadoDoCronometro({ inicio, meta: 30, agora: inicio + 95_000 })).toEqual({ mostrado: 0, segurado: 30, acabou: true });
  });

  it("sem meta: conta pra cima até parar (no máximo 10 min)", () => {
    expect(estadoDoCronometro({ inicio, meta: null, agora: inicio })).toEqual({ mostrado: 0, segurado: 0, acabou: false });
    expect(estadoDoCronometro({ inicio, meta: null, agora: inicio + 47_900 })).toEqual({ mostrado: 47, segurado: 47, acabou: false });
    expect(estadoDoCronometro({ inicio, meta: null, agora: inicio + 3_600_000 }).segurado).toBe(600);
  });
});
