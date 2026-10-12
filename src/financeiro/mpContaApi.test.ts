// src/financeiro/mpContaApi.test.ts
// Physiq W2 (Task 15) — as chamadas da tela de Recebimento ao Mercado Pago da conta (pagamentos-aluno, jeito 2): o corpo de cada ação
// (prof_mp_conectar com a origem; prof_mp_confirmar SEM o confirmar = só a pergunta, COM = grava; prof_mp_desconectar com o OK só quando
// dado) e o erro da função virando ErroFinanceiro com o código e o extra (automaticas_ativas { alunos }, mp_outra_conta { abertos }…).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ principal: { functions: { invoke: (...a: unknown[]) => h.invoke(...a) } } }));

import { ErroFinanceiro, conectarMercadoPago, conexaoMercadoPago, confirmarMercadoPago, desconectarMercadoPago, detalheDoPagamentoMp } from "./api";

const CONEXAO = "0f8c2a7e-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const corpo = () => (h.invoke.mock.calls.at(-1) as [string, { body: Record<string, unknown> }]);
/** o erro do supabase-js para um status ≠ 2xx: o corpo da função no `context` (a Response) */
const erroDaFuncao = (status: number, c: Record<string, unknown>) =>
  ({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } }) } });

beforeEach(() => {
  h.invoke.mockReset();
});

describe("W2 — as chamadas do Mercado Pago da conta (pagamentos-aluno)", () => {
  it("conectar: prof_mp_conectar com a conta e a origem (site → a autorização; apk → o site, no_site)", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url: "https://auth.mercadopago.com/authorization?x=1", expira_em: "2026-10-11T23:00:00Z" }, error: null });
    expect(await conectarMercadoPago("c1", "site")).toMatchObject({ url: "https://auth.mercadopago.com/authorization?x=1" });
    expect(corpo()).toEqual(["pagamentos-aluno", { body: { acao: "prof_mp_conectar", conta_id: "c1", origem: "site" } }]);
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url: "https://physiqcalc.com.br/painel/configuracoes/recebimento?mp=conectar", no_site: true }, error: null });
    expect(await conectarMercadoPago("c1", "apk")).toMatchObject({ no_site: true });
    expect(corpo()[1].body).toEqual({ acao: "prof_mp_conectar", conta_id: "c1", origem: "apk" });
  });

  it("a pergunta (conexaoMercadoPago) vai SEM o confirmar; a gravação (confirmarMercadoPago) com confirmar: true", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, apelido: "FULANO", teste: true }, error: null });
    expect(await conexaoMercadoPago(CONEXAO)).toEqual({ ok: true, apelido: "FULANO", teste: true });
    expect(corpo()[1].body).toEqual({ acao: "prof_mp_confirmar", conexao_id: CONEXAO });
    expect(corpo()[1].body).not.toHaveProperty("confirmar");
    h.invoke.mockResolvedValueOnce({ data: { ok: true, resultado: "conectado_sem_trocar", apelido: "FULANO", recebimento: { ok: true } }, error: null });
    expect(await confirmarMercadoPago(CONEXAO)).toMatchObject({ resultado: "conectado_sem_trocar", apelido: "FULANO" });
    expect(corpo()[1].body).toEqual({ acao: "prof_mp_confirmar", conexao_id: CONEXAO, confirmar: true });
  });

  it("desconectar: o OK de desligar as automáticas só quando dado", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, automaticas_canceladas: 0 }, error: null });
    await desconectarMercadoPago("c1");
    expect(corpo()[1].body).toEqual({ acao: "prof_mp_desconectar", conta_id: "c1" });
    await desconectarMercadoPago("c1", false);
    expect(corpo()[1].body).toEqual({ acao: "prof_mp_desconectar", conta_id: "c1" });
    await desconectarMercadoPago("c1", true);
    expect(corpo()[1].body).toEqual({ acao: "prof_mp_desconectar", conta_id: "c1", cancelar_automaticas: true });
  });

  it("o erro da função vira ErroFinanceiro com o código e o extra (a tela traduz e pede a 2ª confirmação)", async () => {
    h.invoke.mockResolvedValueOnce(erroDaFuncao(409, { ok: false, erro: "automaticas_ativas", alunos: 2 }));
    const e1 = await desconectarMercadoPago("c1").catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ErroFinanceiro);
    expect((e1 as ErroFinanceiro).codigo).toBe("automaticas_ativas");
    expect((e1 as ErroFinanceiro).extra.alunos).toBe(2);
    h.invoke.mockResolvedValueOnce(erroDaFuncao(409, { ok: false, erro: "mp_outra_conta", abertos: 3 }));
    const e2 = (await confirmarMercadoPago(CONEXAO).catch((e: unknown) => e)) as ErroFinanceiro;
    expect([e2.codigo, e2.extra.abertos]).toEqual(["mp_outra_conta", 3]);
    h.invoke.mockResolvedValueOnce(erroDaFuncao(403, { ok: false, erro: "so_o_dono" }));
    expect(((await conectarMercadoPago("c1", "site").catch((e: unknown) => e)) as ErroFinanceiro).codigo).toBe("so_o_dono");
  });

  it("detalhe_mp (o comprovante do aluno): a cobrança de OUTRA conta do MP volta 200 com mp null e o motivo (Task 9) — não é erro", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, mp: null, motivo: "outra_conta_mp" }, error: null });
    expect(await detalheDoPagamentoMp("cob-1")).toEqual({ ok: true, mp: null, motivo: "outra_conta_mp" });
    expect(corpo()).toEqual(["pagamentos-aluno", { body: { acao: "detalhe_mp", cobranca_id: "cob-1" } }]);
    h.invoke.mockResolvedValueOnce({ data: { ok: true, mp: { mp_payment_id: "123", card_last4: "4242" } }, error: null });
    expect(await detalheDoPagamentoMp("cob-2")).toEqual({ ok: true, mp: { mp_payment_id: "123", card_last4: "4242" } });
    // o pagamento de outra coisa segue o 409 da W1b
    h.invoke.mockResolvedValueOnce(erroDaFuncao(409, { ok: false, erro: "cobranca_de_outro_pagamento" }));
    expect(((await detalheDoPagamentoMp("cob-3").catch((e: unknown) => e)) as ErroFinanceiro).codigo).toBe("cobranca_de_outro_pagamento");
  });
});
