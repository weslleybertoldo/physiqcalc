import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Dumbbell, House, Salad } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// hml-18a (H-40, E) — o toque numa aba da barra: a aba fica marcada NO TOQUE (a 1ª mudança na tela) e a página nova vem depois da
// pintura. Antes, com useTransitions={false}, o render da página nova ia no mesmo toque e nada mudava na tela até ele acabar
// (shell.py: 97–109 ms nas abas mais pesadas do app no notebook). O "depois da pintura" (rAF + setTimeout) tem o teste dele.

const h = vi.hoisted(() => ({ pendentes: [] as (() => void)[] }));
vi.mock("./depoisDaPintura", () => ({ depoisDaPintura: (fn: () => void) => h.pendentes.push(fn) }));

import { TabBar } from "./TabBar";

const ABAS = [
  { id: "inicio", rotulo: "Início", icone: House, para: "/" },
  { id: "treino", rotulo: "Treino", icone: Dumbbell, para: "/treino" },
  { id: "dieta", rotulo: "Dieta", icone: Salad, para: "/dieta" },
];

function Barra() {
  const { pathname } = useLocation();
  return (
    <>
      <span data-testid="onde">{pathname}</span>
      <TabBar itens={ABAS.map((a) => ({ ...a, ativo: a.para === pathname }))} />
    </>
  );
}

function montar() {
  render(
    <MemoryRouter useTransitions={false} initialEntries={["/"]}>
      <Routes>
        <Route path="*" element={<Barra />} />
      </Routes>
    </MemoryRouter>,
  );
}

const aba = (id: string) => document.querySelector(`[data-tabbar] [data-aba="${id}"]`) as HTMLAnchorElement;
const marcada = (id: string) => aba(id).className.split(/\s+/).includes("text-texto");

beforeEach(() => {
  h.pendentes.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TabBar: a aba responde no toque (hml-18a)", () => {
  it("a aba tocada fica marcada já no toque; a página só troca depois da pintura; o aria-current segue a página de verdade", () => {
    montar();
    expect(marcada("inicio")).toBe(true);
    fireEvent.click(aba("dieta"));
    expect(marcada("dieta")).toBe(true); // a 1ª mudança: no toque
    expect(marcada("inicio")).toBe(false);
    expect(aba("dieta").hasAttribute("data-pendente")).toBe(true);
    expect(aba("inicio").getAttribute("aria-current")).toBe("page"); // a página ainda é o Início
    expect(screen.getByTestId("onde").textContent).toBe("/");
    expect(h.pendentes).toHaveLength(1);
    act(() => h.pendentes.shift()!());
    expect(screen.getByTestId("onde").textContent).toBe("/dieta");
    expect(aba("dieta").getAttribute("aria-current")).toBe("page");
    expect(aba("dieta").hasAttribute("data-pendente")).toBe(false); // a página mudou: a marca volta a ser a real
    expect(marcada("dieta")).toBe(true);
  });

  it("a aba aberta e o Ctrl/⌘ (nova aba): o Link segue sozinho, nada fica para depois da pintura", () => {
    montar();
    let impedido: boolean | null = null;
    const depois = (e: Event) => {
      impedido = e.defaultPrevented;
      e.preventDefault(); // o jsdom não navega (o navegador abriria a nova aba)
    };
    document.addEventListener("click", depois);
    fireEvent.click(aba("treino"), { ctrlKey: true });
    document.removeEventListener("click", depois);
    expect(impedido).toBe(false);
    expect(h.pendentes).toHaveLength(0);
    expect(marcada("treino")).toBe(false);
    fireEvent.click(aba("inicio")); // a própria aba aberta
    expect(h.pendentes).toHaveLength(0);
    expect(screen.getByTestId("onde").textContent).toBe("/");
  });

  it("a troca não veio (ex.: a mesma página): a marca pendente sai sozinha em 1,5 s", () => {
    vi.useFakeTimers();
    montar();
    fireEvent.click(aba("treino"));
    expect(marcada("treino")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(marcada("treino")).toBe(false);
    expect(marcada("inicio")).toBe(true);
  });
});
