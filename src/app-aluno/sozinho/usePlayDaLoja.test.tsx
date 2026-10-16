import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// play-W6 — "a loja com a Play valendo": a loja nativa (o plugin) + o servidor (a trava/conta de teste e a credencial) + a Play no
// aparelho + ao menos 1 oferta. Faltou qualquer um = a loja de hoje. Fora da loja nativa, nada é perguntado.
const h = vi.hoisted(() => ({
  plugin: true,
  usuario: "u1" as string | null,
  estado: vi.fn(),
  aparelho: vi.fn(),
  produtos: vi.fn(),
}));
vi.mock("@/lib/playBilling", () => ({
  pluginDaPlayPresente: () => h.plugin,
  playDisponivel: h.aparelho,
  produtosDaPlay: h.produtos,
}));
vi.mock("./play", () => ({ buscarEstadoPlay: h.estado }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario ? { id: h.usuario } : null }) }));

import { _esquecerPlayDaLojaParaTestes, carregarPlayDaLoja, usePlayDaLoja } from "./usePlayDaLoja";

const produto = (id: string, preco: string) => ({
  id, nome: id, titulo: id,
  ofertas: [{ planoBase: "mensal", oferta: null, token: `tok-${id}`, tags: [], fases: [{ precoFormatado: preco, precoMicros: 1, moeda: "BRL", periodo: "P1M", ciclos: 0, recorrencia: 1 }] }],
});
const estado = (p: Record<string, unknown> = {}) => ({ disponivel: true, matricula: { id: "m1", ativo: true }, assinatura: null, automatica_mp: false, ...p });

beforeEach(() => {
  h.plugin = true;
  h.usuario = "u1";
  h.estado.mockReset().mockResolvedValue(estado());
  h.aparelho.mockReset().mockResolvedValue(true);
  h.produtos.mockReset().mockResolvedValue({ produtos: [produto("app_treino", "R$ 31,90")], naoAchados: ["app_treino_alimentacao"] });
  _esquecerPlayDaLojaParaTestes();
});

describe("usePlayDaLoja", () => {
  it("tudo certo → ativa, com as ofertas da Play e o menor preço", async () => {
    const { result } = renderHook(() => usePlayDaLoja());
    await waitFor(() => expect(result.current.ativa).toBe(true));
    expect(Object.keys(result.current.ofertas)).toEqual(["app_treino"]);
    expect(result.current.menorPreco).toBe("R$ 31,90");
    expect(result.current.estado?.matricula?.id).toBe("m1");
  });

  it("fora da loja nativa (sem o plugin): inativa e nada é perguntado", async () => {
    h.plugin = false;
    const { result } = renderHook(() => usePlayDaLoja());
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toMatchObject({ ativa: false, carregando: false, estado: null, ofertas: {} });
    expect(h.estado).not.toHaveBeenCalled();
  });

  it.each([
    ["o servidor diz que não vale (a trava desligada, conta real)", () => h.estado.mockResolvedValue(estado({ disponivel: false }))],
    ["a Play não cobra neste aparelho", () => h.aparelho.mockResolvedValue(false)],
    ["a Play não achou nenhum produto", () => h.produtos.mockResolvedValue({ produtos: [], naoAchados: ["app_treino", "app_treino_alimentacao"] })],
    ["o servidor falhou", () => h.estado.mockRejectedValue(new Error("x"))],
  ])("%s → inativa (a loja de hoje)", async (_nome, preparar) => {
    preparar();
    const { result } = renderHook(() => usePlayDaLoja());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.ativa).toBe(false);
  });

  it("sem a trava, nem a Play do aparelho nem os produtos são perguntados", async () => {
    h.estado.mockResolvedValue(estado({ disponivel: false }));
    const { result } = renderHook(() => usePlayDaLoja());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(h.aparelho).not.toHaveBeenCalled();
    expect(h.produtos).not.toHaveBeenCalled();
  });

  it("quem pede junto divide o pedido; dentro de 1 minuto não pergunta de novo; recarregar pergunta", async () => {
    const a = renderHook(() => usePlayDaLoja());
    const b = renderHook(() => usePlayDaLoja());
    await waitFor(() => expect(a.result.current.ativa).toBe(true));
    expect(b.result.current.ativa).toBe(true);
    expect(h.estado).toHaveBeenCalledTimes(1);
    await act(() => carregarPlayDaLoja());
    expect(h.estado).toHaveBeenCalledTimes(1);
    await act(() => a.result.current.recarregar());
    expect(h.estado).toHaveBeenCalledTimes(2);
  });

  it("a revisão ⚪16: trocou a pessoa no aparelho → o guardado da outra some e o servidor é perguntado de novo (mesmo dentro de 1 minuto)", async () => {
    const r = renderHook(() => usePlayDaLoja());
    await waitFor(() => expect(r.result.current.ativa).toBe(true));
    expect(h.estado).toHaveBeenCalledTimes(1);
    h.usuario = "u2";
    h.estado.mockResolvedValue(estado({ disponivel: false, matricula: { id: "m2", ativo: true } }));
    r.rerender();
    expect(r.result.current.ativa).toBe(false);   // nem um quadro com o "disponível" da outra pessoa
    await waitFor(() => expect(h.estado).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(r.result.current.estado?.matricula?.id).toBe("m2"));
    expect(r.result.current.ativa).toBe(false);
  });
});
