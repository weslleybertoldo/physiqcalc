import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animarPeloEstado, terminarSaida } from "@/test/animacao";

// hml-18a (H-40, D) — o Sino entra e SAI animado: antes a lista sumia no mesmo quadro (7–17 ms, sem passar por data-state=closed).

const h = vi.hoisted(() => ({
  avisos: [] as { id: string; tipo: string; titulo: string; link: string | null; lido_em: string | null; criado_em: string }[],
  marcarLidos: vi.fn(),
}));
vi.mock("./useAvisos", () => ({
  useAvisos: () => ({ avisos: h.avisos, naoLidos: h.avisos.filter((a) => !a.lido_em).length, marcarLidos: h.marcarLidos, carregando: false }),
}));

// o Popper do Radix mede com ResizeObserver, que o jsdom não tem
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import { Sino } from "./Sino";

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>;
}

function montar() {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={["/painel"]}>
      <Routes>
        <Route path="*" element={<><Sino /><Onde /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const lista = () => document.querySelector("[data-sino-lista]");
const abrir = () => fireEvent.click(document.querySelector("[data-sino]")!);

beforeEach(() => {
  h.avisos = [];
  h.marcarLidos.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Sino (hml-18a): a lista de avisos sai animada", () => {
  it("ao fechar (Esc), a lista fica no DOM com data-state=closed até a animação de saída acabar; só então sai", () => {
    animarPeloEstado();
    montar();
    abrir();
    const no = lista();
    expect(no?.getAttribute("data-state")).toBe("open");
    expect(h.marcarLidos).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(no?.isConnected).toBe(true);
    expect(no?.getAttribute("data-state")).toBe("closed");
    terminarSaida(no);
    expect(lista()).toBeNull();
  });

  it("as classes da saída espelham as da entrada (fade + zoom-95, a partir do sino)", () => {
    montar();
    abrir();
    const classe = lista()!.className;
    for (const c of ["data-[state=open]:animate-in", "data-[state=open]:fade-in-0", "data-[state=open]:zoom-in-95", "data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0", "data-[state=closed]:zoom-out-95", "origin-(--radix-popover-content-transform-origin)"]) {
      expect(classe).toContain(c);
    }
  });

  it("abrir de novo logo depois funciona: no meio da saída volta a open; depois de sair, abre de novo", () => {
    animarPeloEstado();
    montar();
    abrir();
    const no = lista();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(no?.getAttribute("data-state")).toBe("closed");
    abrir(); // ainda saindo
    expect(lista()?.getAttribute("data-state")).toBe("open");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    terminarSaida(lista());
    expect(lista()).toBeNull();
    abrir();
    expect(lista()?.getAttribute("data-state")).toBe("open");
  });

  it("tocar num aviso com link: fecha (saindo, closed) e vai para a tela do aviso", () => {
    animarPeloEstado();
    h.avisos = [{ id: "a1", tipo: "consulta_marcada", titulo: "Consulta marcada", link: "/painel/agenda", lido_em: null, criado_em: new Date().toISOString() }];
    montar();
    abrir();
    const no = lista();
    fireEvent.click(document.querySelector('[data-aviso="a1"]')!);
    expect(no?.getAttribute("data-state")).toBe("closed");
    expect(screen.getByTestId("onde").textContent).toBe("/painel/agenda");
    terminarSaida(no);
    expect(lista()).toBeNull();
  });
});
