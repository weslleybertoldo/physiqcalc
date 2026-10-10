import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESPERA_NOVA_TENTATIVA_MS, OPCOES_CONSULTAS, criarClienteDeConsultas } from "./consultas";

// hml-17 (H-53): com a API caindo, o painel fazia 129 pedidos em 40 s e os cards do Dashboard só avisavam em ~21 s (retry 3 com
// 1 + 2 + 4 s, × 3 tentativas do fetch). Agora: retry 1 com 1 s fixo nas consultas; mutações não repetem.
describe("OPCOES_CONSULTAS (o React Query do app)", () => {
  it("consultas: 1 nova tentativa com 1 s fixo; o resto como antes (5 min, 24 h, reconectar sempre, offlineFirst)", () => {
    expect(OPCOES_CONSULTAS.queries.retry).toBe(1);
    expect(OPCOES_CONSULTAS.queries.retryDelay).toBe(1000);
    expect(ESPERA_NOVA_TENTATIVA_MS).toBe(1000);
    expect(OPCOES_CONSULTAS.queries.staleTime).toBe(5 * 60_000);
    expect(OPCOES_CONSULTAS.queries.gcTime).toBe(24 * 60 * 60_000);
    expect(OPCOES_CONSULTAS.queries.refetchOnReconnect).toBe("always");
    expect(OPCOES_CONSULTAS.queries.refetchOnWindowFocus).toBe(false);
    expect(OPCOES_CONSULTAS.queries.networkMode).toBe("offlineFirst");
  });

  it("mutações não repetem (hml-06, H-20)", () => {
    expect(OPCOES_CONSULTAS.mutations.retry).toBe(0);
  });

  it("o App.tsx usa o cliente daqui (nenhum retry escrito lá)", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
    expect(app).toMatch(/criarClienteDeConsultas\(\)/);
    expect(app).not.toMatch(/retry\s*:/);
  });
});

describe("criarClienteDeConsultas com o relógio falso", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uma consulta que falha sempre chama o queryFn 2× e vira erro em ~1 s", async () => {
    const qc = criarClienteDeConsultas();
    const fn = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    const obs = new QueryObserver(qc, { queryKey: ["falha-sempre"], queryFn: fn });
    const estados: string[] = [];
    const sair = obs.subscribe((r) => estados.push(r.status));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(obs.getCurrentResult().isError).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(obs.getCurrentResult().isError).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(2); // nenhuma 3ª
    sair();
    qc.clear();
  });

  it("controle: falha 1× e depois responde → mostra o dado, sem erro", async () => {
    const qc = criarClienteDeConsultas();
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("Failed to fetch");
      return { ok: true };
    });
    const obs = new QueryObserver(qc, { queryKey: ["falha-uma-vez"], queryFn: fn });
    const sair = obs.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    const r = obs.getCurrentResult();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r.isError).toBe(false);
    expect(r.data).toEqual({ ok: true });
    sair();
    qc.clear();
  });
});
