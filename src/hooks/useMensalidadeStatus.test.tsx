import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumoMatricula } from "@/financeiro/tipos";

const { getSessionMock, h } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  h: { resumo: null as ResumoMatricula[] | null, chamadasResumo: [] as Array<{ atrasoMs?: number; ativo?: boolean }> },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock } },
  DB_SCHEMA: "public",
}));
// W6: a mensalidade vem do banco principal (financeiro_do_aluno() — o resumo guardado por 10 min)
vi.mock("@/financeiro/useResumoFinanceiro", () => ({
  useResumoFinanceiro: (o: { atrasoMs?: number; ativo?: boolean }) => {
    h.chamadasResumo.push(o);
    return { resumo: o.ativo ? h.resumo : null, carregando: false, erro: false };
  },
}));

import { gravarStatusCache, type MpStatusLeve } from "@/lib/mpClient";
import { ATRASO_STATUS_MS, useMensalidadeStatus } from "./useMensalidadeStatus";

const leve: MpStatusLeve = { mensalidade: null, emDia: true, pagoAte: null, mesRef: "2026-09-01", mesLabel: "Setembro/2026", bloqueadoPeloMaster: false };

function matricula(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "c1", conta_nome: "Lucas", recebimento_modo: "pix_manual", bloquear_inadimplente: false, tem_chave: true,
    profissional: "Lucas Ferreira", mensalidade_valor: 150, plano_nome: null, pausada: false, pago_ate: null, desde: null, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, ...p,
  };
}
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  h.resumo = null;
  h.chamadasResumo.length = 0;
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useMensalidadeStatus (W6: mensalidade do banco principal; o Treino só diz o bloqueio do master)", () => {
  it("sem usuário: nada, sem rede e o resumo desligado", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMensalidadeStatus(undefined));
    expect(result.current).toEqual({ status: null, pendente: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.chamadasResumo.at(-1)?.ativo).toBe(false);
  });

  it("mensalidade vencida no principal → pendente, com o valor", () => {
    gravarStatusCache("u1", leve);
    h.resumo = [matricula({ pago_ate: dias(-3) })];
    const { result } = renderHook(() => useMensalidadeStatus("u1"));
    expect(result.current.pendente).toBe(true);
    expect(result.current.status).toMatchObject({ mensalidade: 150, emDia: false });
  });

  it("em dia ou cobrança parada → não pendente", () => {
    gravarStatusCache("u1", leve);
    h.resumo = [matricula({ pago_ate: dias(20) })];
    const a = renderHook(() => useMensalidadeStatus("u1"));
    expect(a.result.current.pendente).toBe(false);
    expect(a.result.current.status?.emDia).toBe(true);
    h.resumo = [matricula({ pausada: true })];
    const b = renderHook(() => useMensalidadeStatus("u1"));
    expect(b.result.current.pendente).toBe(false);
    expect(b.result.current.status?.mensalidade).toBeNull();
  });

  it("cache do Treino válido → o bloqueio do master na hora e 0 chamadas, mesmo depois do atraso", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    gravarStatusCache("u1", { ...leve, bloqueadoPeloMaster: true });
    const { result } = renderHook(() => useMensalidadeStatus("u1"));
    expect(result.current.status?.bloqueadoPeloMaster).toBe(true);
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

  it("sem cache → depois do atraso 1 chamada `status-lite` (dividida entre 2 consumidores) e o bloqueio do master chega", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk({ ...leve, bloqueadoPeloMaster: true }));
    vi.stubGlobal("fetch", fetchMock);
    const a = renderHook(() => useMensalidadeStatus("u1", 0));
    const b = renderHook(() => useMensalidadeStatus("u1", 0));
    await waitFor(() => {
      expect(a.result.current.status?.bloqueadoPeloMaster).toBe(true);
      expect(b.result.current.status?.bloqueadoPeloMaster).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ action: "status-lite" });
    expect(a.result.current.pendente).toBe(false);
  });
});
