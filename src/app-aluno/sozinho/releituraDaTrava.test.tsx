import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// play-W6 · T2 (b) (o achado do GATE 2, 26/10/2026): a trava da conta do app NA LOJA relê a assinatura ao montar e ao voltar ao primeiro
// plano — o `estado` da play-compras de novo (forçado) e DEPOIS o resumo guardado (sem apagar o último: a trava não pisca). 1 por vez e no
// mínimo 10 s entre 2 (sem laço nem rajada). Fora da loja nativa, nada.
const h = vi.hoisted(() => ({
  plugin: true,
  usuario: "u1" as string | null,
  ordem: [] as string[],
  carregar: vi.fn(),
  invalidar: vi.fn(),
  resume: [] as Array<() => void>,
  removidos: 0,
}));
vi.mock("@/lib/playBilling", () => ({ pluginDaPlayPresente: () => h.plugin }));
vi.mock("./usePlayDaLoja", () => ({ carregarPlayDaLoja: h.carregar }));
vi.mock("@/financeiro/api", () => ({ invalidarResumo: h.invalidar }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario ? { id: h.usuario } : null }) }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (evento: string, cb: () => void) => {
      if (evento === "resume") h.resume.push(cb);
      return Promise.resolve({ remove: async () => { h.removidos++; h.resume = h.resume.filter((f) => f !== cb); } });
    },
  },
}));

import { INTERVALO_RELEITURA_MS, _esquecerReleituraParaTestes, relerAssinaturaDaLoja, useReleituraDaTrava } from "./releituraDaTrava";

let visivel: DocumentVisibilityState = "visible";
const voltar = (estado: DocumentVisibilityState) => {
  visivel = estado;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  h.plugin = true;
  h.usuario = "u1";
  h.ordem = [];
  h.resume = [];
  h.removidos = 0;
  h.carregar.mockReset().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 5));
    h.ordem.push("estado");
  });
  h.invalidar.mockReset().mockImplementation(() => h.ordem.push("resumo"));
  _esquecerReleituraParaTestes();
  visivel = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visivel });
});
afterEach(() => vi.useRealTimers());

describe("relerAssinaturaDaLoja", () => {
  it("o estado de novo (forçado, da pessoa) e DEPOIS o resumo, sem apagar o último", async () => {
    await relerAssinaturaDaLoja("u1");
    expect(h.carregar).toHaveBeenCalledWith(true, "u1");
    expect(h.invalidar).toHaveBeenCalledWith({ manterUltimo: true });
    expect(h.ordem).toEqual(["estado", "resumo"]);
  });

  it("1 por vez: quem pede junto divide a releitura", async () => {
    await Promise.all([relerAssinaturaDaLoja("u1"), relerAssinaturaDaLoja("u1"), relerAssinaturaDaLoja("u1")]);
    expect(h.carregar).toHaveBeenCalledTimes(1);
    expect(h.invalidar).toHaveBeenCalledTimes(1);
  });

  it(`sem rajada: no mínimo ${INTERVALO_RELEITURA_MS / 1000} s entre 2 releituras`, async () => {
    expect(INTERVALO_RELEITURA_MS).toBe(10_000);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T03:00:00Z"));
    await relerAssinaturaDaLoja("u1");
    vi.setSystemTime(new Date("2026-10-27T03:00:09Z"));
    await relerAssinaturaDaLoja("u1");
    expect(h.carregar).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-27T03:00:10Z"));
    await relerAssinaturaDaLoja("u1");
    expect(h.carregar).toHaveBeenCalledTimes(2);
  });

  it("o estado que falha não trava: o resumo relê do mesmo jeito e nada lança", async () => {
    h.carregar.mockRejectedValueOnce(new Error("sem rede"));
    await expect(relerAssinaturaDaLoja("u1")).resolves.toBeUndefined();
    expect(h.invalidar).toHaveBeenCalledTimes(1);
  });

  it("fora da loja nativa (sem o plugin) ou sem login: nada", async () => {
    h.plugin = false;
    await relerAssinaturaDaLoja("u1");
    h.plugin = true;
    await relerAssinaturaDaLoja(null);
    expect(h.carregar).not.toHaveBeenCalled();
    expect(h.invalidar).not.toHaveBeenCalled();
  });
});

describe("useReleituraDaTrava (a trava montada)", () => {
  it("ao montar relê; voltar ao primeiro plano (visibilitychange visível ou o resume do Capacitor) relê de novo; o oculto não; desmontar tira os 2 ouvintes", async () => {
    const r = renderHook(() => useReleituraDaTrava(true));
    await waitFor(() => expect(h.invalidar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.resume.length).toBe(1));
    _esquecerReleituraParaTestes();   // o intervalo passou
    voltar("hidden");
    expect(h.carregar).toHaveBeenCalledTimes(1);
    voltar("visible");
    await waitFor(() => expect(h.invalidar).toHaveBeenCalledTimes(2));
    _esquecerReleituraParaTestes();
    h.resume[0]();
    await waitFor(() => expect(h.invalidar).toHaveBeenCalledTimes(3));
    // o resume e o visibilitychange juntos (a volta de verdade) = 1 releitura só
    _esquecerReleituraParaTestes();
    h.resume[0]();
    voltar("visible");
    await waitFor(() => expect(h.invalidar).toHaveBeenCalledTimes(4));
    await new Promise((x) => setTimeout(x, 30));
    expect(h.carregar).toHaveBeenCalledTimes(4);
    r.unmount();
    await waitFor(() => expect(h.removidos).toBe(1));
    _esquecerReleituraParaTestes();
    voltar("visible");
    await new Promise((x) => setTimeout(x, 30));
    expect(h.carregar).toHaveBeenCalledTimes(4);
  });

  it("a trava que remonta logo depois NÃO relê de novo (sem laço: o intervalo vale entre montagens)", async () => {
    const a = renderHook(() => useReleituraDaTrava(true));
    await waitFor(() => expect(h.invalidar).toHaveBeenCalledTimes(1));
    a.unmount();
    const b = renderHook(() => useReleituraDaTrava(true));
    await new Promise((x) => setTimeout(x, 30));
    expect(h.carregar).toHaveBeenCalledTimes(1);
    b.unmount();
  });

  it("sem trava (inativa), fora da loja nativa ou sem login: nada, nem ouvinte", async () => {
    renderHook(() => useReleituraDaTrava(false));
    h.plugin = false;
    renderHook(() => useReleituraDaTrava(true));
    h.plugin = true;
    h.usuario = null;
    renderHook(() => useReleituraDaTrava(true));
    voltar("visible");
    await new Promise((x) => setTimeout(x, 30));
    expect(h.carregar).not.toHaveBeenCalled();
    expect(h.resume.length).toBe(0);
  });
});
