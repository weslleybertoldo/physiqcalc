import { act } from "@testing-library/react";
import { vi } from "vitest";

// Ajuda dos testes da saída animada (hml-18a, H-40 D). O jsdom não anima nem lê o CSS: aqui a animationName passa a vir do
// data-state do nó — "enter" aberto, "exit" fechado, como as classes do tw-animate-css (data-[state=open]:animate-in /
// data-[state=closed]:animate-out) fazem no navegador. Assim o Presence do Radix (e o useSaidaAnimada) seguram o nó fechado até o
// animationend, que o teste dispara com terminarSaida(). Limpe com vi.restoreAllMocks() + vi.unstubAllGlobals() no afterEach.

export function animarPeloEstado(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const estilo = real(el, pseudo);
    return new Proxy(estilo, {
      get(alvo, prop) {
        if (prop === "animationName") {
          const estado = (el as HTMLElement).getAttribute?.("data-state");
          return estado === "open" ? "enter" : estado === "closed" ? "exit" : "none";
        }
        const v = Reflect.get(alvo, prop, alvo);
        return typeof v === "function" ? v.bind(alvo) : v;
      },
    });
  });
  const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (!css?.escape) vi.stubGlobal("CSS", { ...(css ?? {}), escape: (s: string) => s });
}

/** O fim da animação de saída ("exit") nesses nós — o animationend que o navegador dispararia. */
export function terminarSaida(...nos: (Element | null | undefined)[]): void {
  act(() => {
    for (const no of nos) {
      if (!no) continue;
      const fim = new Event("animationend", { bubbles: true });
      Object.defineProperty(fim, "animationName", { value: "exit" });
      no.dispatchEvent(fim);
    }
  });
}
