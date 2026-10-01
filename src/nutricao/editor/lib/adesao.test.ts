import { describe, expect, it } from "vitest";
import { adesaoDoPeriodo, textoFeitas, ultimosDias } from "./adesao";

const item = [{ id: "i" }];
const refeicoes = [
  { id: "cafe", nome: "Café da manhã", horario: "07:00", ordem: 0, dias_semana: [], itens: item },
  { id: "almoco", nome: "Almoço", horario: "12:00", ordem: 1, dias_semana: [], itens: item },
  { id: "fds", nome: "Brunch", horario: "10:00", ordem: 2, dias_semana: [6, 7], itens: item },
  { id: "vazia", nome: "Ceia", horario: "22:00", ordem: 3, dias_semana: [], itens: [] },
];

describe("✓ das refeições por dia e adesão (F3, R14)", () => {
  it("os 7 dias terminam hoje em São Paulo", () => {
    expect(ultimosDias(7, new Date("2026-09-30T20:00:00-03:00"))).toEqual(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]);
  });
  it("conta só as refeições com alimento que valem no dia; feitas = as marcadas naquele dia", () => {
    // 2026-09-26 = sábado (vale o brunch); 2026-09-28 = segunda
    const a = adesaoDoPeriodo(refeicoes, [
      { refeicao_id: "cafe", data: "2026-09-26" },
      { refeicao_id: "fds", data: "2026-09-26" },
      { refeicao_id: "cafe", data: "2026-09-28" },
      { refeicao_id: "almoco", data: "2026-09-28" },
      { refeicao_id: "vazia", data: "2026-09-28" },
    ], ["2026-09-26", "2026-09-28"]);
    expect(a.dias.map((d) => [d.rotulo, d.feitas, d.total])).toEqual([["Sáb", 2, 3], ["Seg", 2, 2]]);
    expect(a.dias[0].marcaveis.map((m) => `${m.nome}:${m.feita ? "✓" : "-"}`)).toEqual(["Café da manhã:✓", "Almoço:-", "Brunch:✓"]);
    expect(a.feitas).toBe(4);
    expect(a.total).toBe(5);
    expect(a.pct).toBe(80);
    expect(a.dias[1].fracao).toBe(1);
  });
  it("sem refeição marcável, 0 %", () => {
    const a = adesaoDoPeriodo([], [], ["2026-09-30"]);
    expect(a.pct).toBe(0);
    expect(a.dias[0].fracao).toBe(0);
    expect(textoFeitas(3, 5)).toBe("3 de 5");
  });
});
