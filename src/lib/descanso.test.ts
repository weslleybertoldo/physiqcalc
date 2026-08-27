import { describe, it, expect } from "vitest";
import { restanteDescanso, startedAtPara } from "./descanso";

const T0 = 1_700_000_000_000;
const estado = (over = {}) => ({ startedAt: T0, duracao: 120, isPaused: false, pausedRemaining: 120, ...over });

describe("restanteDescanso", () => {
  it("no início vale a duração inteira", () => {
    expect(restanteDescanso(estado(), T0)).toBe(120);
  });

  it("segue o relógio real, não a quantidade de ticks (app em background)", () => {
    // 90s se passaram sem nenhum tick de JS → ao voltar mostra 30s, não 120s
    expect(restanteDescanso(estado(), T0 + 90_000)).toBe(30);
  });

  it("acabou → 0 (nunca negativo)", () => {
    expect(restanteDescanso(estado(), T0 + 121_000)).toBe(0);
    expect(restanteDescanso(estado(), T0 + 999_000)).toBe(0);
  });

  it("pausado devolve o valor congelado, independente do relógio", () => {
    const e = estado({ isPaused: true, pausedRemaining: 47 });
    expect(restanteDescanso(e, T0 + 500_000)).toBe(47);
  });

  it("arredonda pra baixo (segundo cheio)", () => {
    expect(restanteDescanso(estado(), T0 + 1_999)).toBe(119);
  });
});

describe("startedAtPara", () => {
  it("re-ancora o início pra sobrar exatamente N segundos", () => {
    const novo = startedAtPara(120, 45, T0);
    expect(restanteDescanso(estado({ startedAt: novo }), T0)).toBe(45);
  });

  it("-15s: depois de re-ancorar, o relógio continua descontando de onde ficou", () => {
    const novo = startedAtPara(120, 100 - 15, T0);
    expect(restanteDescanso(estado({ startedAt: novo }), T0 + 10_000)).toBe(75);
  });
});
