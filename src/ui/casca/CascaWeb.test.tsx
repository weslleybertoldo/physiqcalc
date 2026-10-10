import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animarPeloEstado } from "@/test/animacao";

// hml-18a (H-40, E) — o toque num item da folha "Mais" (celular): a folha começa a fechar NO TOQUE (a 1ª mudança na tela) e a página
// nova só vem depois da pintura. Antes, o render da página nova (ex.: a Agenda, ~100 ms) ia no mesmo toque e segurava a folha aberta
// na tela até terminar (shell.py: 1ª mudança 114–116 ms). O "depois da pintura" (rAF + setTimeout) tem o teste dele.

const h = vi.hoisted(() => ({ pendentes: [] as (() => void)[] }));
vi.mock("@/ui/premium/depoisDaPintura", () => ({ depoisDaPintura: (fn: () => void) => h.pendentes.push(fn) }));
vi.mock("@/ui/premium/useAvisos", () => ({ useAvisos: () => ({ avisos: [], naoLidos: 0, marcarLidos: () => {}, carregando: false }) }));

// o Popper do Radix (menu do usuário) mede com ResizeObserver, que o jsdom não tem
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import { CascaWeb, type SecaoNav } from "./CascaWeb";

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>;
}

const secoes: SecaoNav[] = [
  {
    itens: [
      { id: "dash", rotulo: "Dashboard", icone: LayoutGrid, para: "/painel", ativo: true, noCelular: true },
      { id: "agenda", rotulo: "Agenda", icone: CalendarDays, para: "/painel/agenda", ativo: false }, // fora da barra: só no "Mais"
    ],
  },
];

function montar() {
  render(
    <MemoryRouter useTransitions={false} initialEntries={["/painel"]}>
      <Routes>
        <Route
          path="*"
          element={
            <CascaWeb area="painel" secoes={secoes} usuario={{ nome: "Teste", fotoUrl: null, papelRotulo: "Dono" }} acoesUsuario={[]} tituloPadrao="Painel">
              <Onde />
            </CascaWeb>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(document.querySelector('[data-tabbar] [data-aba="mais"]')!);
  const folha = document.querySelector('[data-painel="baixo"]')!;
  return { folha, link: folha.querySelector('a[href="/painel/agenda"]')! };
}

beforeEach(() => {
  h.pendentes.length = 0;
  animarPeloEstado();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CascaWeb: a folha \"Mais\" no toque (hml-18a)", () => {
  it("a folha fecha no toque e a página só troca depois da pintura", () => {
    const { folha, link } = montar();
    expect(folha.getAttribute("data-state")).toBe("open");
    fireEvent.click(link);
    expect(folha.getAttribute("data-state")).toBe("closed"); // a 1ª mudança: já no toque
    expect(screen.getByTestId("onde").textContent).toBe("/painel"); // a página nova ainda não
    expect(h.pendentes).toHaveLength(1);
    act(() => h.pendentes.shift()!());
    expect(screen.getByTestId("onde").textContent).toBe("/painel/agenda");
  });

  it("com Ctrl/⌘ (nova aba) a folha fecha e o Link segue sozinho: nada fica para depois da pintura", () => {
    const { folha, link } = montar();
    // depois do React (bolha no document): o clique chega sem preventDefault — o navegador abriria a nova aba; aqui o teste o
    // impede (o jsdom não navega)
    let impedido: boolean | null = null;
    const depois = (e: Event) => {
      impedido = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener("click", depois);
    fireEvent.click(link, { ctrlKey: true });
    document.removeEventListener("click", depois);
    expect(impedido).toBe(false);
    expect(folha.getAttribute("data-state")).toBe("closed");
    expect(h.pendentes).toHaveLength(0);
    expect(screen.getByTestId("onde").textContent).toBe("/painel");
  });
});
