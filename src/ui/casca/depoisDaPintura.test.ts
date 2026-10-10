import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { depoisDaPintura } from "./depoisDaPintura";

// hml-18a (H-40, E) — a troca de página da folha "Mais" sai só depois da pintura (o rAF roda antes dela; o setTimeout de dentro, depois);
// com a aba escondida (sem rAF), a reserva de 100 ms; e uma vez só.

let quadros: FrameRequestCallback[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  quadros = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => quadros.push(cb));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pintar = () => quadros.splice(0).forEach((cb) => cb(performance.now()));

describe("depoisDaPintura (hml-18a)", () => {
  it("nada no toque nem antes da pintura; logo depois da pintura, uma vez", () => {
    const fn = vi.fn();
    depoisDaPintura(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).not.toHaveBeenCalled(); // o quadro ainda não pintou
    pintar(); // o rAF (antes da pintura) só agenda
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0); // a tarefa depois da pintura
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500); // a reserva foi cancelada
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("aba escondida (o rAF não roda): a reserva troca em 100 ms, uma vez — e o rAF atrasado não troca de novo", () => {
    const fn = vi.fn();
    depoisDaPintura(fn);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    pintar();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
