import { beforeEach, describe, expect, it, vi } from "vitest";

// Physiq hml-10 (H-26, D5) — a escrita do aparelho que o PowerSync DESCARTA (erro que não se resolve tentando de novo) vira aviso
// ao Weslley: só a tabela, a op e o código do Postgres — nunca o dado da linha nem a mensagem do banco (que ecoa o valor).
const h = vi.hoisted(() => ({
  avisar: vi.fn((_aviso: unknown) => "a1b2c3d4"),
  resposta: { error: null as null | { code: string; message: string } },
  upserts: [] as unknown[],
}));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: h.avisar }));
vi.mock("@powersync/web", () => ({ UpdateType: { PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE" } }));
vi.mock("./instancia", () => ({ instanciaPowerSync: () => "https://powersync.teste.invalid" }));
vi.mock("@/integrations/supabase/client", () => {
  const tabela = {
    upsert: async (dados: unknown) => {
      h.upserts.push(dados);
      return h.resposta;
    },
    update: () => ({ eq: async () => h.resposta }),
    delete: () => ({ eq: async () => h.resposta }),
  };
  return { DB_SCHEMA: "staging", supabase: { from: () => tabela, auth: { getSession: async () => ({ data: { session: null }, error: null }) } } };
});

import { connector } from "./connector";

const LINHA = { aluno_id: "123e4567-e89b-12d3-a456-426614174000", observacao: "dor no joelho da Maria" };

/** Um banco do PowerSync falso com 1 transação de 1 op. */
function banco(op = "PUT", table = "tb_treino_series", opData: Record<string, unknown> = LINHA) {
  const transacao = { crud: [{ op, table, id: "serie-1", opData }], complete: vi.fn(async () => undefined) };
  return { db: { getNextCrudTransaction: async () => transacao } as never, transacao };
}

beforeEach(() => {
  h.avisar.mockClear();
  h.resposta.error = null;
  h.upserts.length = 0;
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

// Prancha por tempo (22/10/2026): o PowerSync não manda as colunas nulas de um PUT e, no banco, peso e reps têm padrão 0 e 10 —
// a série da Prancha chegava lá como "0 kg × 10" junto do tempo (o E2E de verdade pegou; o teste da aba usa o SQLite local)
describe("connector.uploadData → a série da Prancha grava só o tempo", () => {
  const serie = { user_id: "u-1", data_treino: "2026-10-25", slot_idx: 0, numero_serie: 1, tempo_segundos: 45, concluida: 1 };

  it("PUT da Prancha e da Prancha Lateral: o upsert leva peso e reps nulos explícitos", async () => {
    for (const exercicio_id of ["217d3ff2-62d0-5df4-90f8-600677209cf2", "88f946d5-46f3-5c84-8fdc-f114d9ed805a"]) {
      await connector.uploadData(banco("PUT", "tb_treino_series", { ...serie, exercicio_id }).db);
    }
    expect(h.upserts).toEqual([
      { ...serie, exercicio_id: "217d3ff2-62d0-5df4-90f8-600677209cf2", peso: null, reps: null, id: "serie-1" },
      { ...serie, exercicio_id: "88f946d5-46f3-5c84-8fdc-f114d9ed805a", peso: null, reps: null, id: "serie-1" },
    ]);
  });

  it("as outras séries (o Escalador, exercício próprio do aluno) e as outras tabelas seguem como vieram", async () => {
    const escalador = { ...serie, exercicio_id: "32b7d001-7a57-5443-b6da-87ec6ac7c1ee", peso: 0, reps: 12 };
    const proprio = { ...serie, exercicio_id: null, exercicio_usuario_id: "217d3ff2-62d0-5df4-90f8-600677209cf2" };
    const outraTabela = { exercicio_id: "217d3ff2-62d0-5df4-90f8-600677209cf2", academia_id: "a-1", numero_serie: 1, peso: 20 };
    await connector.uploadData(banco("PUT", "tb_treino_series", escalador).db);
    await connector.uploadData(banco("PUT", "tb_treino_series", proprio).db);
    await connector.uploadData(banco("PUT", "tb_academia_pesos", outraTabela).db);
    expect(h.upserts).toEqual([{ ...escalador, id: "serie-1" }, { ...proprio, id: "serie-1" }, { ...outraTabela, id: "serie-1" }]);
  });
});
