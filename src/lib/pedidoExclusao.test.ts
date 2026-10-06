import { beforeEach, describe, expect, it } from "vitest";
import { situacao } from "@/test/fixturesNucleo";
import { destinoDepoisDoLogin } from "@/nucleo/situacao";
import { destinoDaEntrada, guardarDestino } from "./linksDoApp";
import {
  ROTA_EXCLUIR_CONTA, VALIDADE_PEDIDO_MS, ehRotaDeExclusao, esquecerPedidoExclusao, guardarPedidoExclusao, pedidoExclusaoPendente,
} from "./pedidoExclusao";

// W2 da loja — "Entrar para excluir" na página /excluir-conta: depois do login (inclusive a volta do Google, que perde o `state`, e
// quem entra sem nada, que iria para as Boas-vindas) a pessoa volta para a página, que leva à tela de exclusão certa.
beforeEach(() => localStorage.clear());

describe("o pedido de exclusão guardado no navegador", () => {
  it("vale por 30 min e depois some", () => {
    const t0 = 1_000_000_000_000;
    expect(pedidoExclusaoPendente(t0)).toBe(false);
    guardarPedidoExclusao(t0);
    expect(pedidoExclusaoPendente(t0 + 60_000)).toBe(true);
    expect(pedidoExclusaoPendente(t0 + VALIDADE_PEDIDO_MS + 1)).toBe(false);
    expect(pedidoExclusaoPendente(t0 + 60_000)).toBe(false); // vencido = apagado
    guardarPedidoExclusao();
    esquecerPedidoExclusao();
    expect(pedidoExclusaoPendente()).toBe(false);
  });
  it("a rota da página (com ou sem busca)", () => {
    expect(ehRotaDeExclusao(ROTA_EXCLUIR_CONTA)).toBe(true);
    expect(ehRotaDeExclusao("/excluir-conta?x=1")).toBe(true);
    expect(ehRotaDeExclusao("/excluir-contas")).toBe(false);
    expect(ehRotaDeExclusao(null)).toBe(false);
  });
});

describe("a entrada leva de volta à página de exclusão", () => {
  it("sem a página que pediu o login (volta do Google), o pedido de exclusão vale antes do destino do link", () => {
    guardarDestino("/perfil/agenda");
    expect(destinoDaEntrada(null)).toBe("/perfil/agenda");
    guardarPedidoExclusao();
    expect(destinoDaEntrada(null)).toBe(ROTA_EXCLUIR_CONTA);
    expect(destinoDaEntrada("/")).toBe(ROTA_EXCLUIR_CONTA);
    // a página que pediu o login continua mandando
    expect(destinoDaEntrada("/perfil/pagamentos")).toBe("/perfil/pagamentos");
  });
  it("depois do login: até quem não tem nada (iria para as Boas-vindas) volta para /excluir-conta", () => {
    expect(destinoDepoisDoLogin(situacao({ sem_nada: true }), ROTA_EXCLUIR_CONTA)).toBe(ROTA_EXCLUIR_CONTA);
    expect(destinoDepoisDoLogin(situacao({ sem_nada: true }), "/perfil")).toBe("/boas-vindas");
    expect(destinoDepoisDoLogin(situacao({ sem_nada: false }), ROTA_EXCLUIR_CONTA)).toBe(ROTA_EXCLUIR_CONTA);
    expect(destinoDepoisDoLogin(situacao({ sem_nada: false }), null)).toBe("/");
  });
});
