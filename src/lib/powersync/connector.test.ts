import { beforeEach, describe, expect, it, vi } from "vitest";

// Physiq hml-10 (H-26, D5) — a escrita do aparelho que o PowerSync DESCARTA (erro que não se resolve tentando de novo) vira aviso
// ao Weslley: só a tabela, a op e o código do Postgres — nunca o dado da linha nem a mensagem do banco (que ecoa o valor).
const h = vi.hoisted(() => ({
  avisar: vi.fn((_aviso: unknown) => "a1b2c3d4"),
  resposta: { error: null as null | { code: string; message: string } },
}));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: h.avisar }));
vi.mock("@powersync/web", () => ({ UpdateType: { PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE" } }));
vi.mock("./instancia", () => ({ instanciaPowerSync: () => "https://powersync.teste.invalid" }));
vi.mock("@/integrations/supabase/client", () => {
  const tabela = {
    upsert: async () => h.resposta,
    update: () => ({ eq: async () => h.resposta }),
    delete: () => ({ eq: async () => h.resposta }),
  };
  return { DB_SCHEMA: "staging", supabase: { from: () => tabela, auth: { getSession: async () => ({ data: { session: null }, error: null }) } } };
});

import { connector } from "./connector";

const LINHA = { aluno_id: "123e4567-e89b-12d3-a456-426614174000", observacao: "dor no joelho da Maria" };

/** Um banco do PowerSync falso com 1 transação de 1 op. */
function banco(op = "PUT", table = "tb_treino_series") {
  const transacao = { crud: [{ op, table, id: "serie-1", opData: LINHA }], complete: vi.fn(async () => undefined) };
  return { db: { getNextCrudTransaction: async () => transacao } as never, transacao };
}

beforeEach(() => {
  h.avisar.mockClear();
  h.resposta.error = null;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("connector.uploadData → aviso da op descartada", () => {
  it("erro fatal (23503): descarta a op e avisa 1× com só a tabela, a op e o código", async () => {
    h.resposta.error = { code: "23503", message: 'insert or update on table "tb_treino_series" violates foreign key constraint · Key (aluno_id)=(123e4567-e89b-12d3-a456-426614174000)' };
    const { db, transacao } = banco("PUT");
    await connector.uploadData(db);
    expect(transacao.complete).toHaveBeenCalledTimes(1);
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar).toHaveBeenCalledWith({ origem: "sync", mensagem: "op PUT descartada · código 23503", lugar: "tabela tb_treino_series" });
    const aviso = JSON.stringify(h.avisar.mock.calls[0][0]);
    for (const proibido of ["123e4567", "Maria", "joelho", "Key (", "violates"]) expect(aviso, proibido).not.toContain(proibido);
  });

  it("os outros fatais (22xxx, 23514, 42501) também avisam", async () => {
    for (const code of ["22P02", "23514", "42501"]) {
      h.resposta.error = { code, message: "x" };
      await connector.uploadData(banco("PATCH", "treino_historico").db);
    }
    expect(h.avisar.mock.calls.map((c) => (c[0] as { mensagem: string }).mensagem)).toEqual([
      "op PATCH descartada · código 22P02",
      "op PATCH descartada · código 23514",
      "op PATCH descartada · código 42501",
    ]);
  });

  it("23505 (a linha já existe no servidor) descarta sem aviso", async () => {
    h.resposta.error = { code: "23505", message: "duplicate key" };
    const { db, transacao } = banco("PUT");
    await connector.uploadData(db);
    expect(transacao.complete).toHaveBeenCalledTimes(1);
    expect(h.avisar).not.toHaveBeenCalled();
  });

  it("erro que se resolve tentando de novo: a op fica na fila (lança) e não avisa", async () => {
    h.resposta.error = { code: "PGRST301", message: "JWT expired" };
    const { db, transacao } = banco("DELETE");
    await expect(connector.uploadData(db)).rejects.toMatchObject({ code: "PGRST301" });
    expect(transacao.complete).not.toHaveBeenCalled();
    expect(h.avisar).not.toHaveBeenCalled();
  });

  it("sem erro: completa e não avisa", async () => {
    const { db, transacao } = banco("PUT");
    await connector.uploadData(db);
    expect(transacao.complete).toHaveBeenCalledTimes(1);
    expect(h.avisar).not.toHaveBeenCalled();
  });
});
