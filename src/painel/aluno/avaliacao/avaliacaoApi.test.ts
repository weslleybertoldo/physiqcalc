import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
  treino: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok-treino" } } }) },
    functions: { invoke: h.invoke },
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ upsert: vi.fn(), delete: () => ({ eq: vi.fn() }) }),
  },
}));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn(async () => ({ data: { ok: true, avisado: true }, error: null })) } }));
vi.mock("./fontes", () => ({ carregarTreinoDoPainel: (...a: unknown[]) => h.treino(...a) }));

import { ErroAvaliacao, excluirAvaliacaoFisica, registrarAvaliacaoFisica, salvarProximaAvaliacao } from "./avaliacaoApi";

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  h.invoke.mockClear();
  h.treino.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("avaliação física no Banco do Treino (W17) — gravar sem duplicar", () => {
  it("cria numa tentativa só (o cliente do Treino repetiria o pedido lento e duplicaria a avaliação) e atualiza o perfil", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { avaliacao: { id: "av1" } }));
    const r = await registrarAvaliacaoFisica("t1", { data: "2026-10-01", colunas: { peso: 83.6, observacao: "x" }, atualizarPerfil: true });
    expect(r).toEqual({ id: "av1", perfilAtualizado: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/admin-avaliacoes$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-treino");
    expect((init.headers as Record<string, string>)["x-schema"]).toBe("staging");
    expect(JSON.parse(String(init.body))).toEqual({ action: "create", userId: "t1", avaliacao: { peso: 83.6, observacao: "x", data_avaliacao: "2026-10-01" } });
    // o perfil recebe a composição sem a observação (que é da avaliação)
    expect(h.invoke).toHaveBeenCalledWith("admin-update-user", { body: { userId: "t1", data: { peso: 83.6 } } });
  });

  it("não sendo a mais recente, não mexe no perfil; erro da função vira o código", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { avaliacao: { id: "av2" } }));
    await registrarAvaliacaoFisica("t1", { data: "2026-01-01", colunas: { peso: 80 }, atualizarPerfil: false });
    expect(h.invoke).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "plano_vencido" }));
    await expect(salvarProximaAvaliacao("t1", "2026-10-22")).rejects.toMatchObject({ codigo: "plano_vencido" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("excluir: 'forbidden' de uma linha que já saiu (o 1º pedido lento excluiu) = excluída; ainda lá = erro", async () => {
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    h.treino.mockResolvedValueOnce({ parte: { avaliacoes: [{ id: "outra" }] } });
    await expect(excluirAvaliacaoFisica("av1", { treinoUserId: "t1", colunas: { peso: 84.2 } }, "rota1")).resolves.toBeUndefined();
    expect(h.invoke).toHaveBeenCalledWith("admin-update-user", { body: { userId: "t1", data: { peso: 84.2 } } });

    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    h.treino.mockResolvedValueOnce({ parte: { avaliacoes: [{ id: "av1" }] } });
    await expect(excluirAvaliacaoFisica("av1", null, "rota1")).rejects.toBeInstanceOf(ErroAvaliacao);

    // sem como conferir (o Treino não respondeu), não finge que excluiu
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    h.treino.mockRejectedValueOnce(new Error("rede"));
    await expect(excluirAvaliacaoFisica("av1", null, "rota1")).rejects.toMatchObject({ codigo: "forbidden" });
  });
});
