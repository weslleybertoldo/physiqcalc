// hml-18b (H-54, F): o módulo pesado só na ação — o carregador (uma vez, de novo depois do erro, aquecer sem erro na tela) e o "ocupado"
// do botão (a chave fica ligada enquanto a ação roda; um toque por vez).
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sobDemanda, useAcaoSobDemanda } from "./sobDemanda";

describe("sobDemanda", () => {
  it("baixa uma vez: quem pede junto recebe o mesmo módulo", async () => {
    const carregar = vi.fn(async () => ({ gerar: () => "ok" }));
    const pdf = sobDemanda(carregar);
    const [a, b] = await Promise.all([pdf.obter(), pdf.obter()]);
    expect(a).toBe(b);
    await pdf.obter();
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("deu erro de rede: o erro chega a quem pediu e a próxima chamada tenta de novo", async () => {
    const carregar = vi.fn().mockRejectedValueOnce(new Error("sem rede")).mockResolvedValueOnce({ gerar: () => "ok" });
    const pdf = sobDemanda(carregar);
    await expect(pdf.obter()).rejects.toThrow("sem rede");
    await expect(pdf.obter()).resolves.toHaveProperty("gerar");
    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it("aquecer começa o download sem esperar e sem erro solto; o clique depois usa o mesmo", async () => {
    const carregar = vi.fn(async () => ({ gerar: () => "ok" }));
    const pdf = sobDemanda(carregar);
    pdf.aquecer();
    expect(carregar).toHaveBeenCalledTimes(1);
    await pdf.obter();
    expect(carregar).toHaveBeenCalledTimes(1);

    const falha = sobDemanda(vi.fn().mockRejectedValue(new Error("sem rede")));
    expect(() => falha.aquecer()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // a rejeição foi tratada (o Vitest falharia com uma rejeição solta)
  });
});

describe("useAcaoSobDemanda", () => {
  it("a chave fica ocupada enquanto a ação roda e volta a null no fim", async () => {
    const { result } = renderHook(() => useAcaoSobDemanda());
    let soltar: () => void = () => {};
    const acao = vi.fn(() => new Promise<void>((r) => { soltar = r; }));
    let rodou: Promise<boolean> = Promise.resolve(false);
    act(() => {
      rodou = result.current.rodar("a1", acao);
    });
    expect(result.current.ocupado).toBe("a1");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(acao).toHaveBeenCalledTimes(1);
    await act(async () => {
      soltar();
      await rodou;
    });
    expect(result.current.ocupado).toBeNull();
    await expect(rodou).resolves.toBe(true);
  });

  it("um toque por vez: o 2º enquanto o 1º roda não faz nada; erro na ação libera o botão", async () => {
    const { result } = renderHook(() => useAcaoSobDemanda());
    let soltar: () => void = () => {};
    const primeira = vi.fn(() => new Promise<void>((r) => { soltar = r; }));
    const segunda = vi.fn(async () => undefined);
    let r1: Promise<boolean> = Promise.resolve(false);
    let r2: Promise<boolean> = Promise.resolve(false);
    act(() => {
      r1 = result.current.rodar("a1", primeira);
      r2 = result.current.rodar("a2", segunda);
    });
    await expect(r2).resolves.toBe(false);
    expect(segunda).not.toHaveBeenCalled();
    expect(result.current.ocupado).toBe("a1");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
      soltar();
      await r1;
    });
    expect(result.current.ocupado).toBeNull();

    let r3: Promise<boolean> = Promise.resolve(false);
    act(() => {
      r3 = result.current.rodar("a3", async () => {
        throw new Error("falhou");
      });
    });
    await act(async () => {
      await expect(r3).rejects.toThrow("falhou");
    });
    expect(result.current.ocupado).toBeNull();
  });
});
