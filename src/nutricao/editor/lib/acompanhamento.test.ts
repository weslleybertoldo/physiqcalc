// Physiq hml-14d (B21 · D34): listarRegistrosDoPaciente lê SÓ o período (gte/lte na data, as 2 pontas valem), dia mais recente primeiro,
// com o desempate pelo id; erro do banco lança.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ metodos: [] as Array<[string, unknown[]]>, resposta: { data: [] as unknown[], error: null as null | { message: string } } }));
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

import { listarRegistrosDoPaciente } from "./acompanhamento";

describe("listarRegistrosDoPaciente (hml-14d, D34)", () => {
  it("o período no banco + a ordem estável", async () => {
    h.resposta = { data: [{ id: "r1", data: "2026-09-02" }], error: null };
    await expect(listarRegistrosDoPaciente("p1", "2026-09-01", "2026-09-07")).resolves.toEqual([{ id: "r1", data: "2026-09-02" }]);
    expect(h.metodos).toEqual([
      ["from", ["registros_diarios"]], ["select", ["*"]], ["eq", ["paciente_id", "p1"]], ["is", ["deleted_at", null]], ["gte", ["data", "2026-09-01"]],
      ["lte", ["data", "2026-09-07"]], ["order", ["data", { ascending: false }]], ["order", ["created_at", { ascending: false }]], ["order", ["id", { ascending: false }]],
    ]);
  });
  it("erro do banco lança (a tela mostra o erro)", async () => {
    h.resposta = { data: [], error: { message: "statement timeout" } };
    await expect(listarRegistrosDoPaciente("p1", "2026-09-01", "2026-09-07")).rejects.toThrow("statement timeout");
  });
});
