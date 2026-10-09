import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ setSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { auth: { setSession: h.setSession } } }));

import {
  aplicarSessaoTreino,
  depoisDaFalha,
  erroDaResposta,
  esperaDaTentativa,
  esquecerTrocas,
  lembrarTreinoDe,
  limparPausaTroca,
  PAUSA_LIMITE_MS,
  PAUSA_SERVIDOR_MS,
  pausaDaTroca,
  pausarTroca,
  pedirTroca,
  retentavel,
  sessaoTreinoServe,
  TEMPO_TROCA_MS,
  tentativasAutomaticas,
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

describe("hml-14 (H-32, D5): o login desiste da trocar-token em 40 s", () => {
  afterEach(() => vi.useRealTimers());

  it("a função que não responde vira \"rede\" (o caminho de sem internet de hoje) aos 40 s, com 1 pedido só", async () => {
    vi.useFakeTimers();
    const pendurado = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError")))),
    );
    let r: unknown = "esperando";
    void pedirTroca("t", pendurado as unknown as typeof fetch).then((x) => (r = x));
    await vi.advanceTimersByTimeAsync(TEMPO_TROCA_MS - 1);
    expect(r).toBe("esperando");
    await vi.advanceTimersByTimeAsync(1);
    expect(r).toEqual({ ok: false, erro: "rede", status: 0 });
    expect(pendurado).toHaveBeenCalledTimes(1);
    expect(TEMPO_TROCA_MS).toBe(40_000);
  });

  it("o pedido leva o sinal do relógio; a resposta que chega antes segue igual (502 → \"indisponivel\")", async () => {
    const f = vi.fn(async () => resposta(502, { error: "x" }));
    expect(await pedirTroca("t", f as unknown as typeof fetch)).toEqual({ ok: false, erro: "indisponivel", status: 502 });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
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

describe("W5 — sem loop de tentativas que piore o limite de 20/h da trocar-token", () => {
  it("tentativas sozinhas: rede segue a espera crescente; servidor só 2; limite, conflito e o resto nenhuma", () => {
    expect(tentativasAutomaticas("rede")).toBe(8);
    expect(tentativasAutomaticas("indisponivel")).toBe(2);
    expect(tentativasAutomaticas("interno")).toBe(2);
    for (const e of ["limite", "conflito", "staging", "email", "invalido"] as const) expect(tentativasAutomaticas(e)).toBe(0);
  });
  it("depois da falha: 429 pausa 15 min sem tentar; servidor tenta 2x e pausa 5 min; rede tenta e para sem pausar", () => {
    expect(depoisDaFalha("limite", 0)).toEqual({ tentarEm: null, pausarPor: PAUSA_LIMITE_MS });
    expect(depoisDaFalha("indisponivel", 0)).toEqual({ tentarEm: 2_000, pausarPor: null });
    expect(depoisDaFalha("interno", 1)).toEqual({ tentarEm: 4_000, pausarPor: null });
    expect(depoisDaFalha("interno", 2)).toEqual({ tentarEm: null, pausarPor: PAUSA_SERVIDOR_MS });
    expect(depoisDaFalha("rede", 3)).toEqual({ tentarEm: 16_000, pausarPor: null });
    expect(depoisDaFalha("rede", 8)).toEqual({ tentarEm: null, pausarPor: null });
    expect(depoisDaFalha("conflito", 0)).toEqual({ tentarEm: null, pausarPor: null });
  });
  it("a pausa fica guardada no aparelho (vale entre aberturas), por pessoa, e vence sozinha", () => {
    const agora = 1_000_000;
    pausarTroca("u1", "limite", PAUSA_LIMITE_MS, agora);
    expect(pausaDaTroca("u1", agora + 60_000)).toEqual({ ate: agora + PAUSA_LIMITE_MS, erro: "limite" });
    expect(pausaDaTroca("u2", agora)).toBeNull();
    expect(pausaDaTroca("u1", agora + PAUSA_LIMITE_MS + 1)).toBeNull();
    expect(localStorage.getItem("physiq_troca_pausa:u1")).toBeNull(); // vencida sai do aparelho
    pausarTroca("u1", "interno", PAUSA_SERVIDOR_MS, agora);
    limparPausaTroca("u1");
    expect(pausaDaTroca("u1", agora)).toBeNull();
  });
  it("sair (esquecerTrocas) apaga as pausas junto com os vínculos", () => {
    pausarTroca("u1", "limite", PAUSA_LIMITE_MS);
    lembrarTreinoDe("u1", "t1");
    esquecerTrocas();
    expect(pausaDaTroca("u1")).toBeNull();
    expect(treinoDe("u1")).toBeNull();
  });
});
