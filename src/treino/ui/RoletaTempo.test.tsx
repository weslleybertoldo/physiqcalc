import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALTURA_ITEM } from "../roletaTempo";
import { FolhaRoletaTempo } from "./RoletaTempo";

// A roleta do tempo (09/11/2026): "não tem como colocar tipo o relógio? E eu seleciono quanto tempo foi?" — o teclado numérico do
// celular não tem o ":" e o tempo da corrida não entrava. Gira (ou toca no número) e confirma; zero = sem tempo.

function abrir(o: { segundos?: number | null; comHoras?: boolean; maxSegundos?: number } = {}) {
  const aoConfirmar = vi.fn();
  const aoMudar = vi.fn();
  const props = { aberto: true, aoMudar, titulo: "Tempo da corrida", segundos: o.segundos ?? null, comHoras: o.comHoras ?? true, maxSegundos: o.maxSegundos ?? 35999, aoConfirmar };
  const r = render(<FolhaRoletaTempo {...props} />);
  return { aoConfirmar, aoMudar, props, ...r };
}

const coluna = (nome: "Horas" | "Min" | "Seg") => screen.getByRole("spinbutton", { name: nome });
const item = (nome: "Horas" | "Min" | "Seg", n: number) => coluna(nome).querySelector(`[data-roleta-item="${n}"]`) as HTMLElement;
const confirmar = () => fireEvent.click(document.querySelector("[data-roleta-confirmar]")!);

afterEach(() => vi.useRealTimers());

describe("roleta do tempo", () => {
  it("corrida: abre marcando o tempo de agora (horas · min · seg), cada coluna centrada no número", () => {
    abrir({ segundos: 3930 });
    expect(coluna("Horas")).toHaveAttribute("aria-valuenow", "1");
    expect(coluna("Min")).toHaveAttribute("aria-valuenow", "5");
    expect(coluna("Seg")).toHaveAttribute("aria-valuenow", "30");
    expect(coluna("Min").scrollTop).toBe(5 * ALTURA_ITEM);
    expect(coluna("Seg").scrollTop).toBe(30 * ALTURA_ITEM);
    expect(coluna("Min")).toHaveAttribute("aria-valuetext", "5 minutos");
  });

  it("tocar nos números escolhe e o Confirmar devolve os segundos e fecha", () => {
    const a = abrir({ segundos: null });
    fireEvent.click(item("Min", 19));
    fireEvent.click(item("Seg", 30));
    expect(coluna("Min")).toHaveAttribute("aria-valuenow", "19");
    confirmar();
    expect(a.aoConfirmar).toHaveBeenCalledWith(19 * 60 + 30);
    expect(a.aoMudar).toHaveBeenCalledWith(false);
  });

  it("rolar com o dedo: quando a coluna para, o número do meio vira o escolhido", () => {
    vi.useFakeTimers();
    const a = abrir({ segundos: 0 });
    const min = coluna("Min");
    min.scrollTop = 19 * ALTURA_ITEM + 10; // parou um pouco depois do 19: encaixa no 19
    fireEvent.scroll(min);
    expect(min).toHaveAttribute("aria-valuenow", "0"); // ainda rolando
    act(() => vi.advanceTimersByTime(200));
    expect(min).toHaveAttribute("aria-valuenow", "19");
    confirmar();
    expect(a.aoConfirmar).toHaveBeenCalledWith(19 * 60);
  });

  it("teclado: ↑ e ↓ andam de 1 em 1, sem passar dos limites", () => {
    const a = abrir({ segundos: 0 });
    fireEvent.keyDown(coluna("Seg"), { key: "ArrowUp" });
    expect(coluna("Seg")).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(coluna("Seg"), { key: "ArrowDown" });
    fireEvent.keyDown(coluna("Seg"), { key: "ArrowDown" });
    expect(coluna("Seg")).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(coluna("Seg"), { key: "End" });
    expect(coluna("Seg")).toHaveAttribute("aria-valuenow", "59");
    confirmar();
    expect(a.aoConfirmar).toHaveBeenCalledWith(59);
  });

  it("Cancelar fecha sem escolher nada", () => {
    const a = abrir({ segundos: 600 });
    fireEvent.click(item("Min", 3));
    fireEvent.click(document.querySelector("[data-roleta-cancelar]")!);
    expect(a.aoConfirmar).not.toHaveBeenCalled();
    expect(a.aoMudar).toHaveBeenCalledWith(false);
  });

  it("prancha: sem a coluna de horas, minutos até 10 e o teto de 10 min (10:30 vira 10:00)", () => {
    const a = abrir({ segundos: 60, comHoras: false, maxSegundos: 600 });
    expect(screen.queryByRole("spinbutton", { name: "Horas" })).toBeNull();
    expect(coluna("Min")).toHaveAttribute("aria-valuemax", "10");
    expect(coluna("Min")).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(item("Min", 10));
    fireEvent.click(item("Seg", 30));
    confirmar();
    expect(a.aoConfirmar).toHaveBeenCalledWith(600);
  });

  it("zero confirmado = sem tempo", () => {
    const a = abrir({ segundos: 45, comHoras: false, maxSegundos: 600 });
    fireEvent.click(item("Seg", 0));
    confirmar();
    expect(a.aoConfirmar).toHaveBeenCalledWith(0);
  });

  it("reabrir começa no tempo novo (não no que ficou da vez anterior)", () => {
    const a = abrir({ segundos: 120 });
    fireEvent.click(item("Min", 7));
    a.rerender(<FolhaRoletaTempo {...a.props} aberto={false} />);
    a.rerender(<FolhaRoletaTempo {...a.props} aberto segundos={45} />);
    expect(coluna("Min")).toHaveAttribute("aria-valuenow", "0");
    expect(coluna("Seg")).toHaveAttribute("aria-valuenow", "45");
  });
});
