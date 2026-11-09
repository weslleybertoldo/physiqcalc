import { describe, expect, it } from "vitest";
import { ALTURA_ITEM, itemNaPosicao, partesDoTempo, segundosDasPartes } from "./roletaTempo";

describe("roleta do tempo — as contas", () => {
  it("corrida (com horas): 1 h 05 min 30 s ⇄ 3930 s", () => {
    expect(partesDoTempo(3930, true)).toEqual({ h: 1, m: 5, s: 30 });
    expect(segundosDasPartes({ h: 1, m: 5, s: 30 })).toBe(3930);
    expect(partesDoTempo(19 * 60, true)).toEqual({ h: 0, m: 19, s: 0 });
  });

  it("prancha (sem horas): os minutos passam de 59 só no teto de 10 min", () => {
    expect(partesDoTempo(600, false)).toEqual({ h: 0, m: 10, s: 0 });
    expect(partesDoTempo(75, false)).toEqual({ h: 0, m: 1, s: 15 });
  });

  it("vazio, negativo ou quebrado vira número inteiro e nunca negativo", () => {
    expect(partesDoTempo(null, true)).toEqual({ h: 0, m: 0, s: 0 });
    expect(partesDoTempo(undefined, false)).toEqual({ h: 0, m: 0, s: 0 });
    expect(partesDoTempo(-5, true)).toEqual({ h: 0, m: 0, s: 0 });
    expect(partesDoTempo(59.6, false)).toEqual({ h: 0, m: 1, s: 0 });
  });

  it("a posição da rolagem encaixa no número mais perto, dentro de 0…max", () => {
    expect(itemNaPosicao(0, 59)).toBe(0);
    expect(itemNaPosicao(ALTURA_ITEM * 19, 59)).toBe(19);
    expect(itemNaPosicao(ALTURA_ITEM * 19 + ALTURA_ITEM * 0.4, 59)).toBe(19);
    expect(itemNaPosicao(ALTURA_ITEM * 19 + ALTURA_ITEM * 0.6, 59)).toBe(20);
    expect(itemNaPosicao(ALTURA_ITEM * 80, 59)).toBe(59);
    expect(itemNaPosicao(-30, 59)).toBe(0);
  });
});
