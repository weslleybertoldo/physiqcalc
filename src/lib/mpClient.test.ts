import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock } },
  DB_SCHEMA: "public",
}));

import {
  STATUS_CACHE_KEY,
  STATUS_CACHE_TTL_MS,
  gravarStatusCache,
  invalidarStatusCache,
  lerStatusCache,
  mensalidadePendente,
  statusLeve,
  type MpStatus,
  type MpStatusLeve,
} from "./mpClient";

const leve: MpStatusLeve = { mensalidade: 150, emDia: false, pagoAte: null, mesRef: "2026-09-01", mesLabel: "Setembro/2026" };

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("cache do status leve da mensalidade", () => {
  it("grava e lê pro mesmo usuário dentro do TTL", () => {
    gravarStatusCache("u1", leve, 1000);
    expect(lerStatusCache("u1", 1000)).toEqual(leve);
    expect(lerStatusCache("u1", 1000 + STATUS_CACHE_TTL_MS)).toEqual(leve);
  });

  it("expira depois de 6 h", () => {
    gravarStatusCache("u1", leve, 1000);
    expect(lerStatusCache("u1", 1000 + STATUS_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("relógio voltou (gravado no futuro) = sem cache", () => {
    gravarStatusCache("u1", leve, 5000);
    expect(lerStatusCache("u1", 4000)).toBeNull();
  });

  it("não vaza pra outro usuário", () => {
    gravarStatusCache("u1", leve);
    expect(lerStatusCache("u2")).toBeNull();
  });

  it("JSON corrompido = sem cache", () => {
    localStorage.setItem(STATUS_CACHE_KEY, "{lixo");
    expect(lerStatusCache("u1")).toBeNull();
  });

  it("invalidar apaga", () => {
    gravarStatusCache("u1", leve);
    invalidarStatusCache();
    expect(lerStatusCache("u1")).toBeNull();
    expect(localStorage.getItem(STATUS_CACHE_KEY)).toBeNull();
  });

  it("aceita o status completo da aba Pagamentos e guarda só os campos leves", () => {
    const completo: MpStatus = {
      ...leve,
      plano: "Mensal",
      mesPago: false,
      assinatura: null,
      pagamentos: [{ id: "p1", tipo: "pix", valor: 150, mes_ref: "2026-09-01", status: "pending", created_at: "2026-09-01T00:00:00Z" }],
    };
    gravarStatusCache("u1", completo, 10);
    expect(lerStatusCache("u1", 10)).toEqual(leve);
    expect(JSON.parse(localStorage.getItem(STATUS_CACHE_KEY)!).status).not.toHaveProperty("pagamentos");
  });

  it("mensalidadePendente = tem mensalidade e não está em dia", () => {
    expect(mensalidadePendente(leve)).toBe(true);
    expect(mensalidadePendente({ mensalidade: 150, emDia: true })).toBe(false);
    expect(mensalidadePendente({ mensalidade: null, emDia: false })).toBe(false);
    expect(mensalidadePendente(null)).toBe(false);
    expect(mensalidadePendente(undefined)).toBe(false);
  });
});

describe("statusLeve", () => {
  it("cache válido → não vai à rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    gravarStatusCache("u1", leve);
    expect(await statusLeve("u1")).toEqual(leve);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem cache → 1 chamada `status-lite` mesmo com 2 pedidos simultâneos, e grava o cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(leve));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([statusLeve("u1"), statusLeve("u1")]);
    expect(a).toEqual(leve);
    expect(b).toEqual(leve);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/mp-payments$/);
    expect(JSON.parse(String(init.body))).toEqual({ action: "status-lite" });
    expect((init.headers as Record<string, string>)["x-schema"]).toBe("public");
    expect(lerStatusCache("u1")).toEqual(leve);
  });

  it("forcar ignora o cache e atualiza", async () => {
    gravarStatusCache("u1", leve);
    const novo = { ...leve, emDia: true };
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(novo));
    vi.stubGlobal("fetch", fetchMock);
    expect(await statusLeve("u1", { forcar: true })).toEqual(novo);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lerStatusCache("u1")).toEqual(novo);
  });

  it("erro HTTP propaga, não grava cache e a próxima chamada tenta de novo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "internal_error" }) } as unknown as Response)
      .mockResolvedValueOnce(respostaOk(leve));
    vi.stubGlobal("fetch", fetchMock);
    await expect(statusLeve("u1")).rejects.toThrow("internal_error");
    expect(lerStatusCache("u1")).toBeNull();
    expect(await statusLeve("u1")).toEqual(leve);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
