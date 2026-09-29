import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAVE_TEMA, aplicarTema, definirTema, lerTema, useTema } from "./useTema";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-tema");
});

describe("tema (P21: escuro padrão, claro só por escolha)", () => {
  it("padrão é o escuro", () => {
    expect(lerTema()).toBe("escuro");
  });

  it("definirTema grava no aparelho e aplica no <html>", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#09090B";
    document.head.appendChild(meta);
    definirTema("claro");
    expect(localStorage.getItem(CHAVE_TEMA)).toBe("claro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
    expect(meta.content).toBe("#FAFAFA");
    aplicarTema("escuro");
    expect(meta.content).toBe("#09090B");
    meta.remove();
  });

  it("o hook acompanha a troca", () => {
    const { result } = renderHook(() => useTema());
    expect(result.current.tema).toBe("escuro");
    act(() => result.current.alternar());
    expect(result.current.tema).toBe("claro");
    act(() => result.current.definirTema("escuro"));
    expect(result.current.tema).toBe("escuro");
  });

  it("valor estranho no armazenamento vira escuro", () => {
    localStorage.setItem(CHAVE_TEMA, "roxo");
    expect(lerTema()).toBe("escuro");
  });
});
