import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animarPeloEstado, terminarSaida } from "@/test/animacao";
import { useSaidaAnimada } from "./useSaidaAnimada";
import { useUltimoValor } from "./useUltimoValor";

// hml-18a (H-40, D) — os 2 ganchos da saída: a sobreposição própria fica montada com data-state=closed até o fim da animação de
// saída (useSaidaAnimada) e o painel que fecha continua com o conteúdo de antes (useUltimoValor).

function Faixa({ aberta }: { aberta: boolean }) {
  const saida = useSaidaAnimada<HTMLDivElement>(aberta);
  if (!saida.montado) return null;
  return (
    <div ref={saida.ref} data-state={saida.estado} data-testid="faixa">
      <span data-testid="filho" />
    </div>
  );
}

function evento(tipo: "animationend" | "animationcancel", animacao: string, no: Element) {
  act(() => {
    const e = new Event(tipo, { bubbles: true });
    Object.defineProperty(e, "animationName", { value: animacao });
    no.dispatchEvent(e);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSaidaAnimada (hml-18a): a sobreposição própria sai animada", () => {
  it("fechar: o nó continua no DOM com data-state=closed até o animationend da saída; só então sai", () => {
    animarPeloEstado();
    const r = render(<Faixa aberta />);
    const no = screen.getByTestId("faixa");
    expect(no.getAttribute("data-state")).toBe("open");
    r.rerender(<Faixa aberta={false} />);
    expect(no.isConnected).toBe(true);
    expect(no.getAttribute("data-state")).toBe("closed");
    terminarSaida(no);
    expect(screen.queryByTestId("faixa")).toBeNull();
  });

  it("a animação de um filho e o cancelamento da entrada não cortam a saída; abrir de novo no meio volta a open no MESMO nó", () => {
    animarPeloEstado();
    const r = render(<Faixa aberta />);
    const no = screen.getByTestId("faixa");
    r.rerender(<Faixa aberta={false} />);
    evento("animationend", "exit", screen.getByTestId("filho"));
    evento("animationcancel", "enter", no);
    expect(no.isConnected).toBe(true);
    r.rerender(<Faixa aberta />);
    expect(screen.getByTestId("faixa")).toBe(no);
    expect(no.getAttribute("data-state")).toBe("open");
  });

  it("sem animação de saída (animationName none, o jsdom puro) sai na hora; nunca aberta, nada monta", () => {
    const r = render(<Faixa aberta={false} />);
    expect(screen.queryByTestId("faixa")).toBeNull();
    r.rerender(<Faixa aberta />);
    expect(screen.getByTestId("faixa").getAttribute("data-state")).toBe("open");
    r.rerender(<Faixa aberta={false} />);
    expect(screen.queryByTestId("faixa")).toBeNull();
  });

  it("se o animationend não vier (aba em segundo plano), sai pelo tempo de segurança", () => {
    vi.useFakeTimers();
    animarPeloEstado();
    const r = render(<Faixa aberta />);
    r.rerender(<Faixa aberta={false} />);
    expect(screen.getByTestId("faixa").getAttribute("data-state")).toBe("closed");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId("faixa")).toBeNull();
  });
});

function Painel({ membro }: { membro: { nome: string } | null }) {
  const visto = useUltimoValor(membro);
  return <span data-testid="nome">{visto?.nome ?? "—"}</span>;
}

describe("useUltimoValor (hml-18a): o painel que fecha não sai vazio", () => {
  it("o valor volta a null (fechou): continua o último; outro valor: o novo já no 1º render", () => {
    const r = render(<Painel membro={null} />);
    expect(screen.getByTestId("nome").textContent).toBe("—");
    r.rerender(<Painel membro={{ nome: "Ana" }} />);
    expect(screen.getByTestId("nome").textContent).toBe("Ana");
    r.rerender(<Painel membro={null} />);
    expect(screen.getByTestId("nome").textContent).toBe("Ana");
    r.rerender(<Painel membro={{ nome: "Bia" }} />);
    expect(screen.getByTestId("nome").textContent).toBe("Bia");
  });
});
