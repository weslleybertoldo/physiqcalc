import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14b (D18): a agenda lê uma JANELA de datas — o teto de 1000 do banco agora está escrito (antes, um .limit(2000) que virava 1000
// calado), guarda os MAIS RECENTES e a tela avisa quando chega lá.
// hml-21b: a leitura vai pela função conta (os módulos DE VERDADE do servidor sobre o MESMO banco falso — src/test/contaFalsa.ts): as
// idas ao banco são as mesmas (agora o servidor faz, como a pessoa); o erro do banco chega com o código e a frase fixa (decisão 20).
const h = vi.hoisted(() => ({ chamadas: [] as unknown[][], resposta: undefined as unknown }));
vi.mock("@/integrations/principal/client", async () => {
  const { invocarComConta } = await import("@/test/contaFalsa");
  const banco = {
    from: (tabela: string) => {
      h.chamadas.push(["from", tabela]);
      const cadeia: unknown = new Proxy({}, {
        get: (_alvo, nome) =>
          nome === "then"
            ? (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(h.resposta).then(ok, falha)
            : (...args: unknown[]) => {
                h.chamadas.push([String(nome), ...args]);
                return cadeia;
              },
      });
      return cadeia;
    },
  };
  return { PRINCIPAL_SCHEMA: "staging", principal: { functions: { invoke: invocarComConta(banco, { userId: "u1" }) } } };
});

import { ErroLeitura } from "@/conta/ler";
import { AVISO_LIMITE_AGENDA, LIMITE_JANELA_AGENDA, janelaNoLimite, listarAgendamentos } from "./dados";

beforeEach(() => {
  h.chamadas.length = 0;
  h.resposta = undefined;
});

describe("Agenda › janela com teto honesto (hml-14b, D18)", () => {
  it("lê no máximo 1000 da janela, os mais recentes (do fim para o começo), e devolve em ordem de início", async () => {
    h.resposta = { data: [{ id: "c", inicio: "2026-10-09T15:00:00Z" }, { id: "b", inicio: "2026-10-09T14:00:00Z" }, { id: "a", inicio: "2026-10-01T09:00:00Z" }], error: null };
    const lista = await listarAgendamentos(new Date("2026-10-01T03:00:00Z"), new Date("2026-11-01T03:00:00Z"), "u1", "c1");
    expect(lista.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(h.chamadas).toContainEqual(["limit", 1000]);
    expect(h.chamadas.filter((c) => c[0] === "order")).toEqual([["order", "inicio", { ascending: false }], ["order", "id", { ascending: false }]]);
    expect(h.chamadas.some((c) => c[0] === "limit" && Number(c[1]) > 1000)).toBe(false);
  });

  it("erro do banco lança (a tela mostra o erro, nunca a agenda vazia) — com o código e a frase fixa, nunca a mensagem do banco", async () => {
    h.resposta = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
    const e = await listarAgendamentos(new Date(), new Date(), "u1", null).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroLeitura);
    expect((e as ErroLeitura).codigo).toBe("erro_interno");
    expect((e as Error).message).not.toMatch(/statement timeout/);
  });

  it("o aviso quando a janela chega ao teto", () => {
    expect(LIMITE_JANELA_AGENDA).toBe(1000);
    expect(janelaNoLimite(new Array(1000).fill(0))).toBe(true);
    expect(janelaNoLimite(new Array(999).fill(0))).toBe(false);
    expect(janelaNoLimite(undefined)).toBe(false);
    expect(AVISO_LIMITE_AGENDA).toBe("Mostrando os 1000 mais recentes — encurte o período.");
  });
});
