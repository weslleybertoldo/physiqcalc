// src/financeiro/recebimento.test.ts
// Physiq W1 (jeito 2): o servidor valida o que a tela de Recebimento manda — a chave Pix (a MESMA validação da tela) e o pedido do
// prof_recebimento_salvar (modo, bloquear, InfiniteTag).
// W2 (Task 7): o modo 'mercadopago_conta' (o Mercado Pago DO PERSONAL), as modalidades dele (as do MP) e as recusas das ações do
// Recebimento (a guarda do modo, a confirmação da conexão e o cancelamento das automáticas) — sempre um código com 4xx/5xx, nunca 500.
import { describe, expect, it } from "vitest";
import { COLUNAS_CHAVE, chaveDoPedido } from "../../supabase-principal/functions/_shared/pix-chave-regras";
import {
  modalidadesDaConta, modalidadesOferecidas, modalidadesPermitidasNoPlano, rotuloDaModalidade, type Modalidade,
} from "../../supabase-principal/functions/_shared/planos-regras";
import {
  MODOS, ROTULO_MODO, ehModoMp, erroDaConfirmacao, erroDaGuardaDoModo, lerPedidoDoRecebimento, modoDepoisDeDesconectar, recusaDoCancelamento,
} from "./recebimento";

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
  it("os modos da tela são os do banco (contas_recebimento_modo_check — W1 20261011200000 + W2 20261011210000) e todos têm rótulo", () => {
    expect([...MODOS].sort()).toEqual(["infinitepay", "mercadopago", "mercadopago_conta", "nenhum", "pix_manual"]);
    for (const m of MODOS) expect(ROTULO_MODO[m]).toBeTruthy();
  });
});

describe("W2 — o Mercado Pago da conta do personal no Recebimento", () => {
  it("o modo novo é lido e tem rótulo; na ordem da tela, o MP da conta vem antes do MP do Physiq (só o master liga)", () => {
    expect(lerPedidoDoRecebimento({ modo: "mercadopago_conta" })).toEqual({ ok: true, pedido: { modo: "mercadopago_conta", cancelarAutomaticas: false } });
    expect(lerPedidoDoRecebimento({ modo: "mercadopago_conta", cancelar_automaticas: true }))
      .toEqual({ ok: true, pedido: { modo: "mercadopago_conta", cancelarAutomaticas: true } });
    expect(MODOS).toEqual(["pix_manual", "infinitepay", "mercadopago_conta", "mercadopago", "nenhum"]);
    expect(ROTULO_MODO.mercadopago_conta).toBe("MERCADO PAGO (SUA CONTA)");
    expect(ROTULO_MODO.mercadopago).toBe("MERCADO PAGO");
  });
  it("os 2 Mercados Pagos (ehModoMp): o do Physiq e o da conta — sair de qualquer um com automática viva cancela antes", () => {
    expect(ehModoMp("mercadopago")).toBe(true);
    expect(ehModoMp("mercadopago_conta")).toBe(true);
    for (const m of ["pix_manual", "infinitepay", "nenhum", "", "MERCADOPAGO", null, undefined]) expect(ehModoMp(m), String(m)).toBe(false);
  });
  it("as modalidades do MP da conta são as do MP do Physiq (o mesmo ramo): à vista, cartão parcelado e mês a mês", () => {
    const TODAS: Modalidade[] = ["avista", "cartao_parcelado", "mensal"];
    expect(modalidadesDaConta("mercadopago_conta")).toEqual(TODAS);
    expect(modalidadesDaConta("mercadopago_conta")).toEqual(modalidadesDaConta("mercadopago"));
    const plano = { valor: 600, meses: 6, modalidades: TODAS, ativo: true };
    expect(modalidadesOferecidas(plano, "mercadopago_conta")).toEqual(TODAS);
    expect(modalidadesOferecidas({ ...plano, modalidades: ["cartao_parcelado"] }, "mercadopago_conta")).toEqual(["cartao_parcelado"]); // não vira à vista (só na InfinitePay)
    expect(modalidadesPermitidasNoPlano("mercadopago_conta", [])).toEqual(TODAS);
    expect(rotuloDaModalidade("avista", "mercadopago_conta")).toBe("À vista");
    expect(rotuloDaModalidade("cartao_parcelado", "mercadopago_conta")).toBe("Cartão parcelado");
  });
  it("a guarda do modo (contas_guard_mp, P0001 — vale para todo mundo) vira 409 com o código; qualquer outro erro segue (o 500 de sempre)", () => {
    expect(erroDaGuardaDoModo({ code: "P0001", message: "automaticas_ativas:3" })).toEqual({ codigo: "automaticas_ativas", http: 409, extra: { alunos: 3 } });
    expect(erroDaGuardaDoModo({ code: "P0001", message: "mp_conta_sem_integracao" })).toEqual({ codigo: "mp_conta_sem_integracao", http: 409, extra: {} });
    expect(erroDaGuardaDoModo({ code: "P0001", message: "outra_coisa" })).toBeNull();
    expect(erroDaGuardaDoModo({ code: "P0001", message: "automaticas_ativas:" })).toBeNull();
    expect(erroDaGuardaDoModo({ code: "23514", message: "automaticas_ativas:1" })).toBeNull();   // CHECK violado não é a guarda
    expect(erroDaGuardaDoModo({ code: "PGRST116", message: "mp_conta_sem_integracao" })).toBeNull();
    expect(erroDaGuardaDoModo(null)).toBeNull();
  });
  it("a recusa da confirmação (recebimento_mp_confirmar) vira o código da tela com mp_ — 403 para quem não pode, 409 para o resto", () => {
    expect(erroDaConfirmacao({ erro: "outra_pessoa" })).toEqual({ codigo: "mp_outra_pessoa", http: 403, extra: {} });
    expect(erroDaConfirmacao({ erro: "mp_conta_em_teste" })).toEqual({ codigo: "mp_conta_em_teste", http: 403, extra: {} });   // sem mp_mp_
    expect(erroDaConfirmacao({ erro: "outra_conta", abertos: 2 })).toEqual({ codigo: "mp_outra_conta", http: 409, extra: { abertos: 2 } });
    expect(erroDaConfirmacao({ erro: "outra_conta" })).toEqual({ codigo: "mp_outra_conta", http: 409, extra: { abertos: 0 } });
    for (const e of ["vencido", "invalido", "conta_invalida", "sem_login", "mp_em_outra_conta"]) {
      const r = erroDaConfirmacao({ erro: e });
      expect(r.codigo, e).toBe(e.startsWith("mp_") ? e : `mp_${e}`);
      expect(r.http, e).toBe(409);
      expect(r.extra, e).toEqual({});
    }
    // sem erro ou fora do formato: mp_invalido (nada da RPC passa cru para a tela)
    expect(erroDaConfirmacao({})).toEqual({ codigo: "mp_invalido", http: 409, extra: {} });
    expect(erroDaConfirmacao({ erro: "Não <b>pode</b>" })).toEqual({ codigo: "mp_invalido", http: 409, extra: {} });
    expect(erroDaConfirmacao({ erro: 42 })).toEqual({ codigo: "mp_invalido", http: 409, extra: {} });
  });
  it("o cancelamento das automáticas (MENOR 11): sem acesso → 409 mp_sem_acesso; o MP recusou ou caiu → 502 automaticas_nao_canceladas; tudo desligado → segue", () => {
    expect(recusaDoCancelamento({ canceladas: 3, falhas: 0, semAcesso: 0 })).toBeNull();
    expect(recusaDoCancelamento({ canceladas: 0, falhas: 0, semAcesso: 0 })).toBeNull();
    expect(recusaDoCancelamento({ canceladas: 1, falhas: 0, semAcesso: 2 })).toEqual({ codigo: "mp_sem_acesso", http: 409, extra: { alunos: 2, falhas: 0 } });
    expect(recusaDoCancelamento({ canceladas: 1, falhas: 2, semAcesso: 0 })).toEqual({ codigo: "automaticas_nao_canceladas", http: 502, extra: { falhas: 2 } });
    // as 2 juntas: o que o dono pode fazer (conectar de novo / desligar no app do MP) vem primeiro
    expect(recusaDoCancelamento({ canceladas: 0, falhas: 1, semAcesso: 1 })).toEqual({ codigo: "mp_sem_acesso", http: 409, extra: { alunos: 1, falhas: 1 } });
  });
  it("desconectar no modo do MP da conta → Pix na chave (com uma chave ligada) ou 'não cobrar pelo app'", () => {
    expect(modoDepoisDeDesconectar(true)).toBe("pix_manual");
    expect(modoDepoisDeDesconectar(false)).toBe("nenhum");
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
