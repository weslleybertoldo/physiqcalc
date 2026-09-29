import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ setSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { auth: { setSession: h.setSession } } }));

import {
  aplicarSessaoTreino,
  erroDaResposta,
  esperaDaTentativa,
  esquecerTrocas,
  lembrarTreinoDe,
  pedirTroca,
  retentavel,
  sessaoTreinoServe,
  treinoDe,
} from "./trocaToken";

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  localStorage.clear();
  h.setSession.mockReset();
});

describe("erros da troca (spec 9)", () => {
  it("status da trocar-token → erro", () => {
    expect(erroDaResposta(0)).toBe("rede");
    expect(erroDaResposta(401)).toBe("invalido");
    expect(erroDaResposta(403, "conta_real_no_staging")).toBe("staging");
    expect(erroDaResposta(403, "email_nao_confirmado")).toBe("email");
    expect(erroDaResposta(409, "conta_em_conflito")).toBe("conflito");
    expect(erroDaResposta(429)).toBe("limite");
    expect(erroDaResposta(502)).toBe("indisponivel");
    expect(erroDaResposta(500)).toBe("interno");
  });
  it("só rede e servidor tentam de novo sozinhos; conflito e limite esperam", () => {
    expect(retentavel("rede")).toBe(true);
    expect(retentavel("indisponivel")).toBe(true);
    expect(retentavel("conflito")).toBe(false);
    expect(retentavel("limite")).toBe(false);
    expect(retentavel("invalido")).toBe(false);
  });
  it("espera crescente de 2 s a 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(esperaDaTentativa)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
});

describe("pedirTroca", () => {
  it("200 → sessão do Treino; manda o token do principal e o schema", async () => {
    const f = vi.fn(async () => resposta(200, { access_token: "a", refresh_token: "r", expires_in: 3600, treino_user_id: "t1", papel: "professor" }));
    const r = await pedirTroca("token-principal", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, sessao: expect.objectContaining({ access_token: "a", refresh_token: "r", treino_user_id: "t1", papel: "professor" }) });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/trocar-token$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-principal");
    expect((init.headers as Record<string, string>)["x-schema"]).toBe("staging");
  });
  it("409 conflito e sem rede", async () => {
    expect(await pedirTroca("t", (async () => resposta(409, { error: "conta_em_conflito" })) as unknown as typeof fetch)).toEqual({ ok: false, erro: "conflito", status: 409 });
    expect(await pedirTroca("t", (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).toEqual({ ok: false, erro: "rede", status: 0 });
  });
  it("200 sem tokens não vira sessão", async () => {
    expect((await pedirTroca("t", (async () => resposta(200, { ok: true })) as unknown as typeof fetch)).ok).toBe(false);
  });
});

describe("de quem é a sessão do Treino do aparelho", () => {
  it("serve só para a pessoa cuja última troca devolveu aquele usuário", () => {
    lembrarTreinoDe("principal-1", "treino-1");
    expect(treinoDe("principal-1")).toBe("treino-1");
    expect(sessaoTreinoServe("principal-1", { user: { id: "treino-1" } } as never)).toBe(true);
    expect(sessaoTreinoServe("principal-1", { user: { id: "outro" } } as never)).toBe(false);
    expect(sessaoTreinoServe("principal-2", { user: { id: "treino-1" } } as never)).toBe(false);
    expect(sessaoTreinoServe("principal-1", null)).toBe(false);
    esquecerTrocas();
    expect(treinoDe("principal-1")).toBeNull();
  });
  it("aplicarSessaoTreino grava no cliente do Treino e lembra o vínculo", async () => {
    h.setSession.mockResolvedValue({ data: { session: { user: { id: "treino-9" } } }, error: null });
    expect(await aplicarSessaoTreino("p9", { access_token: "a", refresh_token: "r", treino_user_id: "treino-9", papel: null })).toBe(true);
    expect(h.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
    expect(treinoDe("p9")).toBe("treino-9");
    h.setSession.mockResolvedValue({ data: { session: null }, error: { message: "x" } });
    expect(await aplicarSessaoTreino("p8", { access_token: "a", refresh_token: "r", treino_user_id: "t", papel: null })).toBe(false);
    expect(treinoDe("p8")).toBeNull();
  });
});
