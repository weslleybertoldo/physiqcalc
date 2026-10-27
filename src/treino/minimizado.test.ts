import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useListaMinimizada } from "./minimizado";

// A aba Treino abre SEMPRE com o treino minimizado e finalizar o treino minimiza (pedido do Weslley, 26/10/2026); tocar no nome
// mostra/esconde (22/10/2026). Nada fica guardado no aparelho.
beforeEach(() => {
  localStorage.clear();
});

describe("a lista dos exercícios do treino", () => {
  it("nasce minimizada; tocar alterna; montar de novo (trocar de aba, reabrir o app) volta minimizada; nada vai pro aparelho", () => {
    const um = renderHook(() => useListaMinimizada("2026-10-26", 0));
    expect(um.result.current[0]).toBe(true);
    act(() => um.result.current[1](false));
    expect(um.result.current[0]).toBe(false);
    act(() => um.result.current[1](true));
    act(() => um.result.current[1](false));
    um.unmount();
    const dois = renderHook(() => useListaMinimizada("2026-10-26", 0));
    expect(dois.result.current[0]).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it("o treino em andamento (o cronômetro rodando nele) nasce com a lista à mostra", () => {
    const { result } = renderHook(() => useListaMinimizada("2026-10-26", 0, { emAndamento: true }));
    expect(result.current[0]).toBe(false);
  });

  it("finalizar o treino minimiza (concluído vira sim); mostrar de novo o treino concluído vale", () => {
    const { result, rerender } = renderHook(({ concluido }) => useListaMinimizada("2026-10-26", 0, { emAndamento: true, concluido }), {
      initialProps: { concluido: false },
    });
    expect(result.current[0]).toBe(false);
    rerender({ concluido: true });
    expect(result.current[0]).toBe(true);
    // só a virada para concluído minimiza: o mesmo "concluído" de novo não fecha o que o aluno abriu
    act(() => result.current[1](false));
    rerender({ concluido: true });
    expect(result.current[0]).toBe(false);
  });

  it("trocar de dia ou de treino do dia volta ao padrão", () => {
    const { result, rerender } = renderHook(({ dia, slot }) => useListaMinimizada(dia, slot), { initialProps: { dia: "2026-10-26", slot: 0 } });
    act(() => result.current[1](false));
    rerender({ dia: "2026-10-27", slot: 0 });
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    rerender({ dia: "2026-10-27", slot: 1 });
    expect(result.current[0]).toBe(true);
  });
});
