import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock } },
  DB_SCHEMA: "public",
}));

import { gravarStatusCache, type MpStatusLeve } from "@/lib/mpClient";
import { ATRASO_STATUS_MS, useMensalidadeStatus } from "./useMensalidadeStatus";

const leve: MpStatusLeve = { mensalidade: 150, emDia: false, pagoAte: null, mesRef: "2026-09-01", mesLabel: "Setembro/2026" };

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useMensalidadeStatus", () => {
  it("sem usuário: nada e sem rede", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMensalidadeStatus(undefined));
    expect(result.current.status).toBeNull();
    expect(result.current.pendente).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache válido → pendente na hora e 0 chamadas, mesmo depois do atraso", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    gravarStatusCache("u1", leve);
    const { result } = renderHook(() => useMensalidadeStatus("u1"));
    expect(result.current.status).toEqual(leve);
    expect(result.current.pendente).toBe(true);
    act(() => {
      vi.advanceTimersByTime(ATRASO_STATUS_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem cache → nada antes do atraso; desmontar cancela a chamada", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(leve));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useMensalidadeStatus("u1"));
    expect(result.current.status).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ATRASO_STATUS_MS - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem cache → depois do atraso faz 1 chamada `status-lite` e sinaliza pendência", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(leve));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMensalidadeStatus("u1", 0));
    await waitFor(() => expect(result.current.pendente).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ action: "status-lite" });
  });

  it("dois consumidores (header + aviso) dividem a mesma requisição", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(leve));
    vi.stubGlobal("fetch", fetchMock);
    const a = renderHook(() => useMensalidadeStatus("u1", 0));
    const b = renderHook(() => useMensalidadeStatus("u1", 0));
    await waitFor(() => {
      expect(a.result.current.pendente).toBe(true);
      expect(b.result.current.pendente).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("em dia → pendente false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk({ ...leve, emDia: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMensalidadeStatus("u1", 0));
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.pendente).toBe(false);
  });
});
