// src/financeiro/recebimento.test.ts
// Physiq W1 (jeito 2): o servidor valida o que a tela de Recebimento manda — a chave Pix (a MESMA validação da tela) e o pedido do
// prof_recebimento_salvar (modo, bloquear, InfiniteTag).
import { describe, expect, it } from "vitest";
import { COLUNAS_CHAVE, chaveDoPedido } from "../../supabase-principal/functions/_shared/pix-chave-regras";
import { MODOS, ROTULO_MODO, lerPedidoDoRecebimento } from "./recebimento";

describe("o pedido do Recebimento (prof_recebimento_salvar)", () => {
  it("modo, bloquear e a InfiniteTag normalizada; vazio = tirar; nada = erro", () => {
    expect(lerPedidoDoRecebimento({ modo: "infinitepay", handle: "$Fulano" })).toEqual({ ok: true, pedido: { modo: "infinitepay", handle: "fulano", cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ bloquear: true })).toEqual({ ok: true, pedido: { bloquear: true, cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ handle: "" })).toEqual({ ok: true, pedido: { handle: null, cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ modo: "pix_manual", cancelar_automaticas: true })).toEqual({ ok: true, pedido: { modo: "pix_manual", cancelarAutomaticas: true } });
    expect(lerPedidoDoRecebimento({ modo: "pix" })).toEqual({ ok: false, erro: "modo_invalido" });
    expect(lerPedidoDoRecebimento({ bloquear: "sim" })).toEqual({ ok: false, erro: "bloquear_invalido" });
    expect(lerPedidoDoRecebimento({ handle: "ana personal" })).toEqual({ ok: false, erro: "infinitetag_invalida" });
    expect(lerPedidoDoRecebimento({})).toEqual({ ok: false, erro: "nada_para_salvar" });
  });
  it("os modos da tela são os do banco (contas_recebimento_modo_check da 20261011200000) e todos têm rótulo", () => {
    expect([...MODOS].sort()).toEqual(["infinitepay", "mercadopago", "nenhum", "pix_manual"]);
    for (const m of MODOS) expect(ROTULO_MODO[m]).toBeTruthy();
  });
});

describe("a chave Pix no servidor (a mesma validação da tela)", () => {
  it("normaliza e recusa com a frase da tela", () => {
    expect(chaveDoPedido({ tipo: "cpf", chave: "529.982.247-25", favorecido: "  Ana   Souza ", banco: "" }))
      .toEqual({ ok: true, dados: { tipo: "cpf", chave: "52998224725", favorecido: "Ana Souza", banco: null } });
    expect(chaveDoPedido({ tipo: "telefone", chave: "(82) 99999-9999" })).toMatchObject({ ok: true, dados: { chave: "+5582999999999" } });
    expect(chaveDoPedido({ tipo: "cpf", chave: "123" })).toEqual({ ok: false, mensagem: "CPF precisa ter 11 dígitos." });
    expect(chaveDoPedido({ tipo: "xyz", chave: "a" })).toEqual({ ok: false, mensagem: "Escolha o tipo da chave." });
  });
  it("as colunas que a função devolve são as que a tela lia", () => {
    expect(COLUNAS_CHAVE).toBe("id, conta_id, membro_id, tipo, chave, favorecido, banco, ativa, criado_em");
  });
});
