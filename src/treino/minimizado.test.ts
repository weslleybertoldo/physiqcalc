import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estaMinimizado, guardarMinimizado, useListaMinimizada } from "./minimizado";

// Tocar no nome do treino minimiza os exercícios (pedido do Weslley, 22/10/2026): guardado no aparelho por dia e por treino do dia.
const CHAVE = "physiq_treino_minimizado";
const guardado = () => JSON.parse(localStorage.getItem(CHAVE) ?? "null");

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 22, 9, 0, 0)); // quinta 22/10/2026
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a lista dos exercícios minimizada (guardada no aparelho)", () => {
  it("vale só para o dia e o treino do dia minimizados; mostrar de novo apaga a marca", () => {
    guardarMinimizado("2026-10-22", 0, true);
    expect(estaMinimizado("2026-10-22", 0)).toBe(true);
    expect(estaMinimizado("2026-10-22", 1)).toBe(false);
    expect(estaMinimizado("2026-10-23", 0)).toBe(false);
    guardarMinimizado("2026-10-22", 0, false);
    expect(estaMinimizado("2026-10-22", 0)).toBe(false);
    expect(guardado()).toEqual({});
  });

  it("guarda só os últimos 14 dias: a marca mais velha sai na próxima gravação", () => {
    guardarMinimizado("2026-10-07", 0, true, new Date(2026, 9, 7, 9));
    guardarMinimizado("2026-10-08", 0, true, new Date(2026, 9, 8, 9));
    guardarMinimizado("2026-10-22", 1, true);
    expect(Object.keys(guardado())).toEqual(["2026-10-08|0", "2026-10-22|1"]);
  });

  it("lixo na chave do aparelho: nada minimizado e a próxima gravação conserta", () => {
    localStorage.setItem(CHAVE, "{quebrado");
    expect(estaMinimizado("2026-10-22", 0)).toBe(false);
    guardarMinimizado("2026-10-22", 0, true);
    expect(guardado()).toEqual({ "2026-10-22|0": true });
  });

  it("useListaMinimizada: alterna e guarda; trocar de dia relê o que ficou guardado daquele dia", () => {
    guardarMinimizado("2026-10-21", 0, true);
    const { result, rerender } = renderHook(({ dia }) => useListaMinimizada(dia, 0), { initialProps: { dia: "2026-10-22" } });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(estaMinimizado("2026-10-22", 0)).toBe(true);
    act(() => result.current[1](false));
    expect(estaMinimizado("2026-10-22", 0)).toBe(false);
    rerender({ dia: "2026-10-21" });
    expect(result.current[0]).toBe(true);
  });
});
