import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// play-W6, a revisão ⚪19: a compra que ficou no meio volta ao servidor ao abrir o app, no evento "compras" da Play E quando o app volta
// para a frente (a folha da Play aberta por cima e o app que ficou em segundo plano sem o evento: o resume do @capacitor/app).
const h = vi.hoisted(() => ({
  recuperar: vi.fn(async () => 0),
  estadoDoApp: [] as Array<(e: { isActive: boolean }) => void>,
  removidos: 0,
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (evento: string, cb: (e: { isActive: boolean }) => void) => {
      if (evento === "appStateChange") h.estadoDoApp.push(cb);
      return Promise.resolve({ remove: async () => { h.removidos++; } });
    },
  },
}));
vi.mock("@/lib/playBilling", async (orig) => ({
  ...(await orig<typeof import("@/lib/playBilling")>()),
  pluginDaPlayPresente: () => true,
  ouvirComprasDaPlay: async () => () => {},
}));
vi.mock("./usePlayDaLoja", () => ({
  usePlayDaLoja: () => ({ ativa: true, carregando: false, estado: { disponivel: true, matricula: { id: "m1", ativo: true }, assinatura: null, automatica_mp: false },
    ofertas: {}, menorPreco: null, recarregar: async () => {} }),
}));
vi.mock("./play", () => ({ recuperarComprasDaPlay: h.recuperar, assinarPelaPlay: vi.fn(), gerenciarAssinatura: vi.fn() }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ recarregarSituacao: async () => null }) }));

import { PlayEmSegundoPlano } from "./pecas/AssinaturaPlay";

beforeEach(() => {
  h.recuperar.mockClear();
  h.estadoDoApp = [];
  h.removidos = 0;
});

describe("a compra que ficou no meio: a recuperação também quando o app volta para a frente", () => {
  it("ao montar, 1 vez; o app que volta (isActive) recupera de novo; o que vai para o fundo, não; desmontar tira o ouvinte", async () => {
    const r = render(<PlayEmSegundoPlano />);
    await waitFor(() => expect(h.recuperar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.estadoDoApp.length).toBe(1));
    h.estadoDoApp[0]({ isActive: false });
    expect(h.recuperar).toHaveBeenCalledTimes(1);
    h.estadoDoApp[0]({ isActive: true });
    await waitFor(() => expect(h.recuperar).toHaveBeenCalledTimes(2));
    expect(h.recuperar).toHaveBeenLastCalledWith("m1");
    r.unmount();
    await waitFor(() => expect(h.removidos).toBe(1));
  });
});
