// Physiq hml-14d (B21 · D34): listarRegistrosDoPaciente lê SÓ o período (gte/lte na data, as 2 pontas valem), dia mais recente primeiro,
// com o desempate pelo id; erro do banco lança.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  metodos: [] as Array<[string, unknown[]]>,
  resposta: { data: [] as unknown[] | null, error: null as null | { message: string }, count: undefined as number | null | undefined },
}));
vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: {
    from: (t: string) => {
      h.metodos = [["from", [t]]];
      const p: unknown = new Proxy(() => undefined, {
        get: (_x, k) => (k === "then" ? (ok: (v: unknown) => void) => ok(h.resposta) : (...a: unknown[]) => (h.metodos.push([String(k), a]), p)),
      });
      return p;
    },
  },
}));

import { contarRegistrosDoDia, listarRegistrosDoPaciente } from "./acompanhamento";

describe("listarRegistrosDoPaciente (hml-14d, D34)", () => {
  it("o período no banco + a ordem estável", async () => {
    h.resposta = { data: [{ id: "r1", data: "2026-09-02" }], error: null, count: undefined };
    await expect(listarRegistrosDoPaciente("p1", "2026-09-01", "2026-09-07")).resolves.toEqual([{ id: "r1", data: "2026-09-02" }]);
    expect(h.metodos).toEqual([
      ["from", ["registros_diarios"]], ["select", ["*"]], ["eq", ["paciente_id", "p1"]], ["is", ["deleted_at", null]], ["gte", ["data", "2026-09-01"]],
      ["lte", ["data", "2026-09-07"]], ["order", ["data", { ascending: false }]], ["order", ["created_at", { ascending: false }]], ["order", ["id", { ascending: false }]],
    ]);
  });
  it("erro do banco lança (a tela mostra o erro)", async () => {
    h.resposta = { data: [], error: { message: "statement timeout" }, count: undefined };
    await expect(listarRegistrosDoPaciente("p1", "2026-09-01", "2026-09-07")).rejects.toThrow("statement timeout");
  });
});

describe("contarRegistrosDoDia (hml-14d, D34 — o aviso \"dia já registrado\" fora do período)", () => {
  it("1 HEAD (só a contagem) com o dia e o aluno, só os vivos", async () => {
    h.resposta = { data: null, error: null, count: 1 };
    await expect(contarRegistrosDoDia("p1", "2026-08-31")).resolves.toBe(1);
    expect(h.metodos).toEqual([
      ["from", ["registros_diarios"]], ["select", ["id", { count: "exact", head: true }]], ["eq", ["paciente_id", "p1"]],
      ["eq", ["data", "2026-08-31"]], ["is", ["deleted_at", null]],
    ]);
  });
  it("erro do banco lança; sem a contagem também (nada de \"0\" calado)", async () => {
    h.resposta = { data: null, error: { message: "statement timeout" }, count: null };
    await expect(contarRegistrosDoDia("p1", "2026-08-31")).rejects.toThrow("statement timeout");
    h.resposta = { data: null, error: null, count: null };
    await expect(contarRegistrosDoDia("p1", "2026-08-31")).rejects.toThrow("O banco não devolveu a contagem do dia.");
  });
});
