// Physiq hml-14d (B21 · D34): listarRegistrosDoPaciente lê SÓ o período (gte/lte na data, as 2 pontas valem), dia mais recente primeiro,
// com o desempate pelo id; erro do banco lança.
// hml-20c (H-42): as 2 leituras vão pela nutricao (o `ler`) — o módulo de verdade do servidor roda sobre o MESMO banco falso daqui
// (src/test/nutricaoFalsa.ts): o pedido que chega ao banco é o mesmo (o período, a ordem estável, o HEAD do dia), com as colunas do tipo
// no lugar do "*" e o teto de 1000 (o max_rows que já valia); o erro chega com a frase fixa do código (a do banco não sai do servidor).
import { describe, expect, it, vi } from "vitest";
import { COLUNAS_DA_DIETA } from "../../../../supabase-principal/functions/_shared/nutricao-leituras";
import { MENSAGEM_ERRO_LEITURA } from "@/nutricao/leitura";

const h = vi.hoisted(() => ({
  metodos: [] as Array<[string, unknown[]]>,
  resposta: { data: [] as unknown[] | null, error: null as null | { message: string }, count: undefined as number | null | undefined },
}));
vi.mock("@/nutricao/editor/lib/banco", async () => {
  const { ehLer, lerPeloModulo } = await import("@/test/nutricaoFalsa");
  const banco = {
    from: (t: string) => {
      h.metodos = [["from", [t]]];
      const p: unknown = new Proxy(() => undefined, {
        get: (_x, k) => (k === "then" ? (ok: (v: unknown) => void) => ok(h.resposta) : (...a: unknown[]) => (h.metodos.push([String(k), a]), p)),
      });
      return p;
    },
  };
  const invoke = (_f: string, o: { body?: unknown }) => (ehLer(o?.body) ? lerPeloModulo(banco)(o.body) : Promise.reject(new Error("só leitura aqui")));
  return { supabase: { ...banco, functions: { invoke } } };
});

import { contarRegistrosDoDia, listarRegistrosDoPaciente } from "./acompanhamento";

describe("listarRegistrosDoPaciente (hml-14d, D34)", () => {
  it("o período no banco + a ordem estável", async () => {
    h.resposta = { data: [{ id: "r1", data: "2026-09-02" }], error: null, count: undefined };
    await expect(listarRegistrosDoPaciente("p1", "2026-09-01", "2026-09-07")).resolves.toEqual([{ id: "r1", data: "2026-09-02" }]);
    expect(h.metodos).toEqual([
      ["from", ["registros_diarios"]], ["select", [COLUNAS_DA_DIETA.registros_diarios.join(", ")]], ["eq", ["paciente_id", "p1"]], ["gte", ["data", "2026-09-01"]],
      ["lte", ["data", "2026-09-07"]], ["is", ["deleted_at", null]], ["order", ["data", { ascending: false }]], ["order", ["created_at", { ascending: false }]],
      ["order", ["id", { ascending: false }]], ["limit", [1000]],
    ]);
  });
  it("erro do banco lança (a tela mostra o erro)", async () => {
    h.resposta = { data: [], error: { message: "statement timeout" }, count: undefined };
    await expect(listarRegistrosDoPaciente("p1", "2026-09-01", "2026-09-07")).rejects.toThrow(MENSAGEM_ERRO_LEITURA.erro_interno);
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
    await expect(contarRegistrosDoDia("p1", "2026-08-31")).rejects.toThrow(MENSAGEM_ERRO_LEITURA.erro_interno);
    // sem a contagem: o servidor recusa (erro_interno) — nunca um "0" calado
    h.resposta = { data: null, error: null, count: null };
    await expect(contarRegistrosDoDia("p1", "2026-08-31")).rejects.toThrow(MENSAGEM_ERRO_LEITURA.erro_interno);
  });
});
