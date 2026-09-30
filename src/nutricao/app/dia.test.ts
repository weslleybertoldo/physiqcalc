import { describe, expect, it } from "vitest";
import { fracao, hojeSP, msAteAmanhaSP, planoAtivo, planoVariaPorDia, proximaPendente, refeicoesDoDia, resumoDoDia, rotuloDoDia, semanaDoDia, somarDias } from "./dia";
import type { AlimentoDoItem, ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "./tipos";

const OVO: AlimentoDoItem = { id: "ovo", nome: "Ovo, de galinha, inteiro, cozido", fonte: "taco", energia_kcal: 145.7, proteina_g: 13.29, carboidrato_g: 0.61, lipidio_g: 9.48, fibra_g: null, sodio_mg: 146, medidas_caseiras: [] };
const ARROZ: AlimentoDoItem = { id: "arroz", nome: "Arroz, integral, cozido", fonte: "taco", energia_kcal: 123.53, proteina_g: 2.59, carboidrato_g: 25.81, lipidio_g: 1, fibra_g: 2.75, sodio_mg: 1.24, medidas_caseiras: [] };
const item = (id: string, alimento: AlimentoDoItem, g: number, ordem = 0): ItemDaRefeicao => ({
  id, alimento_id: alimento.id, quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, ordem, substitutos: [], observacao: null,
  created_at: "2026-09-01T10:00:00Z", alimento,
});
const refeicao = (id: string, nome: string, horario: string, ordem: number, itens: ItemDaRefeicao[], dias: number[] = []): RefeicaoDoPlano => ({
  id, nome, horario, ordem, observacao: null, dias_semana: dias, itens,
});
const CAFE = refeicao("cafe", "Café da manhã", "07:00:00", 0, [item("i1", OVO, 150)]); // 218,55 kcal
const ALMOCO = refeicao("almoco", "Almoço", "13:00:00", 2, [item("i2", ARROZ, 200)]); // 247,06 kcal
const LANCHE = refeicao("lanche", "Lanche da tarde", "16:00:00", 3, []);
const CEIA_FIM = refeicao("ceia", "Ceia", "22:00:00", 4, [item("i3", ARROZ, 100)], [6, 7]);
const plano = (o: Partial<PlanoAlimentar> = {}): PlanoAlimentar => ({
  id: "p1", paciente_id: "m1", nutricionista_id: "n1", titulo: "Plano", metodo: "alimentos", kcal_alvo: 2000, observacao: null, favorito: false,
  created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-28T10:00:00Z", refeicoes: [ALMOCO, CEIA_FIM, CAFE, LANCHE], ...o,
});

describe("hoje em São Paulo (o ✓ zera na virada do dia daqui) — relógio simulado", () => {
  it("23:59 de SP ainda é o dia; 00:00 de SP já é o seguinte (qualquer fuso do aparelho)", () => {
    expect(hojeSP(new Date("2026-10-01T02:59:59Z"))).toBe("2026-09-30"); // 23:59:59 em SP
    expect(hojeSP(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01"); // 00:00 em SP
    expect(hojeSP(new Date("2026-09-30T12:00:00Z"))).toBe("2026-09-30");
  });
  it("quanto falta para a meia-noite de SP", () => {
    expect(msAteAmanhaSP(new Date("2026-10-01T02:59:00Z"))).toBe(60_000 + 1000);
    expect(msAteAmanhaSP(new Date("2026-09-30T15:00:00Z"))).toBe(12 * 3600_000 + 1000); // 12:00 em SP
  });
  it("somar dias e a semana (segunda → domingo)", () => {
    expect(somarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(somarDias("2026-10-01", -1)).toBe("2026-09-30");
    const s = semanaDoDia("2026-09-30");
    expect(s.map((d) => d.dia)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(s.map((d) => d.rotulo)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(s[3].numero).toBe(1);
    expect(semanaDoDia("2026-10-04")[0].dia).toBe("2026-09-28"); // domingo fecha a semana
  });
  it("rótulo do dia", () => {
    expect(rotuloDoDia("2026-09-30", "2026-09-30")).toBe("hoje");
    expect(rotuloDoDia("2026-10-01", "2026-09-30")).toBe("amanhã");
    expect(rotuloDoDia("2026-09-29", "2026-09-30")).toBe("ontem");
    expect(rotuloDoDia("2026-10-02", "2026-09-30")).toBe("sexta · 02/10");
    expect(rotuloDoDia("2026-10-03", "2026-09-30")).toBe("sábado · 03/10");
  });
});

describe("o plano atual (regra do site antigo)", () => {
  it("favorito mais recente; sem favorito, o mais recente", () => {
    const a = { id: "a", favorito: false, created_at: "2026-09-01T10:00:00Z" };
    const b = { id: "b", favorito: true, created_at: "2026-08-01T10:00:00Z" };
    const c = { id: "c", favorito: false, created_at: "2026-09-10T10:00:00Z" };
    expect(planoAtivo([a, b, c])?.id).toBe("b");
    expect(planoAtivo([a, c])?.id).toBe("c");
    expect(planoAtivo([])).toBeNull();
  });
});

describe("NF3 — as refeições do dia da semana", () => {
  it("sem dias marcados vale todo dia; com dias, só nesses", () => {
    expect(refeicoesDoDia(plano(), "2026-09-30").map((r) => r.id)).toEqual(["cafe", "almoco", "lanche"]); // quarta
    expect(refeicoesDoDia(plano(), "2026-10-03").map((r) => r.id)).toEqual(["cafe", "almoco", "lanche", "ceia"]); // sábado
    expect(refeicoesDoDia(null, "2026-09-30")).toEqual([]);
    expect(planoVariaPorDia(plano())).toBe(true);
    expect(planoVariaPorDia(plano({ refeicoes: [CAFE, ALMOCO] }))).toBe(false);
  });
  it("dia sem refeição (plano só de fim de semana)", () => {
    expect(refeicoesDoDia(plano({ refeicoes: [CEIA_FIM] }), "2026-09-30")).toEqual([]);
  });
});

describe("NF5 — macros marcados no dia e a próxima refeição", () => {
  const doDia = refeicoesDoDia(plano(), "2026-09-30");
  it("nada marcado: 0 de tudo; o total é o das refeições com alimento", () => {
    const r = resumoDoDia(doDia, new Set());
    expect(r.marcaveis).toBe(2);
    expect(r.concluidas).toBe(0);
    expect(r.marcado.energia_kcal).toBe(0);
    expect(r.total.energia_kcal).toBeCloseTo(465.61, 2);
    expect(r.total.proteina_g).toBeCloseTo(25.12, 1);
  });
  it("café marcado: kcal e proteína do café; a próxima é o almoço (o lanche vazio não entra)", () => {
    const feitas = new Set(["cafe"]);
    const r = resumoDoDia(doDia, feitas);
    expect(r.concluidas).toBe(1);
    expect(r.marcado.energia_kcal).toBeCloseTo(218.55, 2);
    expect(r.marcado.proteina_g).toBeCloseTo(19.94, 1);
    expect(proximaPendente(doDia, feitas)?.id).toBe("almoco");
    expect(proximaPendente(doDia, new Set(["cafe", "almoco"]))).toBeNull();
    expect(proximaPendente(doDia, new Set())?.id).toBe("cafe");
  });
  it("fração das barras", () => {
    expect(fracao(112, 184)).toBeCloseTo(0.6087, 3);
    expect(fracao(5, 0)).toBe(0);
    expect(fracao(300, 100)).toBe(1);
  });
});
