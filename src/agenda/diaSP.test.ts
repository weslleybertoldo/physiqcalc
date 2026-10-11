// hml-18b (H-86): o diaSP cria o formatador do fuso de São Paulo UMA vez — um Intl.DateTimeFormat por chamada era a maior parte das
// tarefas longas ao abrir a Agenda (~218 ms de CPU, medido no perfil). Os dias continuam os mesmos (a virada à meia-noite de SP).
import { afterEach, describe, expect, it, vi } from "vitest";
import { diaSP, hojeSP } from "./regras";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("diaSP (São Paulo)", () => {
  it("o dia de SP de cada instante: a virada é à meia-noite de SP (03:00 UTC), não à meia-noite UTC", () => {
    expect(diaSP(new Date("2026-10-01T02:59:59Z"))).toBe("2026-09-30");
    expect(diaSP(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01");
    expect(diaSP("2026-12-31T23:30:00-03:00")).toBe("2026-12-31");
    expect(hojeSP(new Date("2026-10-10T12:00:00Z"))).toBe("2026-10-10");
  });

  it("data inválida → vazio (sem quebrar)", () => {
    expect(diaSP("não é data")).toBe("");
    expect(diaSP(new Date(Number.NaN))).toBe("");
  });

  it("2.000 chamadas não criam 2.000 formatadores (no máximo 1)", () => {
    const criar = vi.spyOn(Intl, "DateTimeFormat");
    const base = Date.UTC(2026, 9, 1, 12);
    const dias = new Set<string>();
    for (let i = 0; i < 2000; i++) dias.add(diaSP(new Date(base + i * 3_600_000)));
    expect(dias.size).toBeGreaterThan(80);
    expect(criar.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
