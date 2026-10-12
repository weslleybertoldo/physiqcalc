// Physiq W1 — master › Integrações: a conta na InfinitePay mostra a InfiniteTag; o master NÃO liga a InfinitePay (a opção só fica ativa
// na conta que já está nela — quem liga é o dono, com a InfiniteTag) e "Desligar" volta ao Pix manual (com chave ativa) ou a "não cobrar",
// com a confirmação do app (o desenho §4.1).
// W2 (Task 16) — o Mercado Pago do personal: o master vê (o apelido + a situação, o KPI) e desliga com o OK — o 1º (sair do MP dele), a 2ª
// (as cobranças automáticas: cancelar no MP e avisar os alunos) e a 3ª, com perigo (sem acesso ao MP dele: forçar); o 502 com "Tentar de novo".
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ lista: vi.fn(), acao: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../api", async (orig) => ({ ...(await orig<typeof import("../api")>()), integracoes: (n: number) => h.lista(n), acaoConta: (...a: unknown[]) => h.acao(...a) }));

import { toast } from "sonner";
import { ErroMaster } from "../api";
import Integracoes from "./Integracoes";

const conta = (x: Record<string, unknown>) => ({ id: "c1", nome: "Rafael Lima", origem: "nova", alunos_ativos: 3, chave_pix: null, bloquear_app_inadimplente: false,
  recebimento_modo: "pix_manual", infinitepay: null, ...x });
const montar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ProvedorConfirmar><MemoryRouter useTransitions={false}><Integracoes /></MemoryRouter></ProvedorConfirmar>
  </QueryClientProvider>,
);

beforeEach(() => {
  h.lista.mockReset();
  h.acao.mockReset().mockResolvedValue({ ok: true });
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("master › Integrações — W1", () => {
  it("a conta na InfinitePay mostra a InfiniteTag; nas outras a opção InfinitePay fica desligada", async () => {
    h.lista.mockResolvedValue({ ok: true, total: 2, resumo: { infinitepay: 1 }, contas: [
      conta({ id: "c1", recebimento_modo: "infinitepay", infinitepay: { handle: "rafael.treinos", status: "ativa", testado_em: null } }),
      conta({ id: "c2", nome: "Outra", recebimento_modo: "pix_manual" })] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-infinitetag-da-conta="c1"]')?.textContent).toContain("$rafael.treinos"));
    expect((document.querySelector('[data-recebimento="Outra"] option[value="infinitepay"]') as HTMLOptionElement).disabled).toBe(true);
    expect((document.querySelector('[data-recebimento="Rafael Lima"] option[value="infinitepay"]') as HTMLOptionElement).disabled).toBe(false);
  });
  it("Desligar: confirmação do app → Pix manual (tem chave) ou 'não cobrar' (sem chave)", async () => {
    h.lista.mockResolvedValue({ ok: true, total: 1, resumo: {}, contas: [conta({ recebimento_modo: "infinitepay", infinitepay: { handle: "rafael", status: "ativa", testado_em: null } })] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-desligar-infinitepay="c1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-desligar-infinitepay="c1"]')!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.acao).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c1", "recebimento", { modo: "nenhum" }));
  });
  it("Desligar com chave Pix ativa: a confirmação diz que volta ao Pix e a conta vai para o Pix manual", async () => {
    h.lista.mockResolvedValue({ ok: true, total: 1, resumo: {}, contas: [conta({ recebimento_modo: "infinitepay",
      chave_pix: { tipo: "email", chave: "rafael@exemplo.com", favorecido: null, banco: null }, infinitepay: { handle: "rafael", status: "ativa", testado_em: null } })] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-desligar-infinitepay="c1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-desligar-infinitepay="c1"]')!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(document.body.textContent).toContain("voltam a pagar por Pix");
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c1", "recebimento", { modo: "pix_manual" }));
  });
});

describe("master › Integrações — W2: o Mercado Pago do personal (vê e desliga com o OK)", () => {
  const MP = (x: Record<string, unknown> = {}) => ({ status: "ativa", apelido: "RAFAEL.TREINOS", mp_user_id: 123, expira_em: "2027-04-10T12:00:00Z", erro: null,
    chave_publica: true, conectado_em: "2026-10-11T12:00:00Z", teste: false, ...x });
  const naMpConta = (x: Record<string, unknown> = {}) => conta({ recebimento_modo: "mercadopago_conta", mercadopago_conta: MP(), ...x });
  const recusa = (erro: string, x: Record<string, unknown> = {}) => new ErroMaster(erro, { ok: false, erro, ...x });
  const ok = (x: Record<string, unknown> = {}) => ({ ok: true, acao: "recebimento", conta: {}, ...x });
  const sel = (s: string) => document.querySelector(s);
  /** a confirmação aberta é a do passo (o data-master-confirmar na descrição) */
  const passo = (p: string) => sel(`[data-master-confirmar="${p}"]`);
  async function responder(p: string, sim = true) {
    await waitFor(() => expect(passo(p)).not.toBeNull());
    fireEvent.click(sel(sim ? "[data-confirmar-ok]" : "[data-confirmar-cancelar]")!);
    await waitFor(() => expect(passo(p)).toBeNull());
  }
  async function desligar(id = "c1") {
    await waitFor(() => expect(sel(`[data-desligar-mp-conta="${id}"]`)).not.toBeNull());
    fireEvent.click(sel(`[data-desligar-mp-conta="${id}"]`)!);
  }
  const lista = (...contas: unknown[]) => h.lista.mockResolvedValue({ ok: true, total: contas.length, resumo: {}, contas });

  it("a conta no MP do personal: o apelido + a situação; o KPI com as caídas; a opção só ativa nela (o dono conecta) e o MP do Physiq com nome", async () => {
    h.lista.mockResolvedValue({ ok: true, total: 2, resumo: { mercadopago: 0, mercadopago_conta: 1, mp_conta_erro: 1 }, contas: [
      naMpConta({ id: "c1" }), conta({ id: "c2", nome: "Outra", recebimento_modo: "pix_manual" })] });
    montar();
    await waitFor(() => expect(sel('[data-mp-conta-da-conta="c1"]')?.textContent).toBe("RAFAEL.TREINOS · Conectado"));
    expect(sel('[data-mp-conta-da-conta="c1"]')?.getAttribute("data-mp-conta-situacao")).toBe("conectado");
    expect(sel('[data-mp-conta-da-conta="c2"]')).toBeNull();
    expect(sel('[data-desligar-mp-conta="c2"]')).toBeNull();
    const opcao = (conta: string, v: string) => sel(`[data-recebimento="${conta}"] option[value="${v}"]`) as HTMLOptionElement;
    expect(opcao("Outra", "mercadopago_conta").disabled).toBe(true);
    expect(opcao("Rafael Lima", "mercadopago_conta").disabled).toBe(false);
    expect(opcao("Outra", "mercadopago_conta").textContent).toBe("Mercado Pago do personal");
    expect(opcao("Outra", "mercadopago").textContent).toBe("Mercado Pago do Physiq");
    expect(opcao("Outra", "mercadopago").disabled).toBe(false); // o MP do Physiq quem liga é o master
    expect((sel('[data-recebimento="Rafael Lima"]') as HTMLSelectElement).value).toBe("mercadopago_conta");
    expect(sel('[data-kpi="MP do personal"] [data-kpi-valor]')?.textContent).toBe("1");
    expect(sel('[data-kpi="MP do personal"]')?.textContent).toContain("1 com a conexão caída");
    expect(sel('[data-kpi="MP do Physiq"] [data-kpi-valor]')?.textContent).toBe("0");
  });

  it("a conexão caída e o renovar aparecem na linha; servidor sem a W2 (sem as contagens) → o KPI em 0, não em '…'", async () => {
    lista(naMpConta({ id: "c1", mercadopago_conta: MP({ status: "erro" }) }),
      naMpConta({ id: "c2", nome: "Beta", mercadopago_conta: MP({ apelido: null, erro: "sem_renovacao" }) }));
    montar();
    await waitFor(() => expect(sel('[data-mp-conta-da-conta="c1"]')?.textContent).toBe("RAFAEL.TREINOS · Conexão caída"));
    expect(sel('[data-mp-conta-da-conta="c1"]')?.getAttribute("data-mp-conta-situacao")).toBe("caiu");
    expect(sel('[data-mp-conta-da-conta="c2"]')?.textContent).toBe("Conectado · renovar até 10/04/2027");
    expect(sel('[data-mp-conta-da-conta="c2"]')?.getAttribute("data-mp-conta-situacao")).toBe("renove");
    expect(sel('[data-desligar-mp-conta="c1"]')).not.toBeNull(); // com a conexão caída também desliga
    expect(sel('[data-kpi="MP do personal"] [data-kpi-valor]')?.textContent).toBe("0");
    expect(sel('[data-kpi="MP do personal"]')?.textContent).toContain("0 com a conexão caída");
  });

  it("Desligar sem chave: o 1º OK (perigo) → 'não cobrar'; 'Voltar' não chama nada", async () => {
    lista(naMpConta());
    montar();
    await desligar();
    await waitFor(() => expect(passo("desligar-mp-conta")).not.toBeNull());
    expect(sel("[data-confirmar]")?.getAttribute("data-confirmar")).toBe("perigo");
    expect(document.body.textContent).toContain("Desligar o Mercado Pago do personal de Rafael Lima?");
    expect(document.body.textContent).toContain("Sem chave Pix ligada");
    await responder("desligar-mp-conta", false);
    expect(h.acao).not.toHaveBeenCalled();
    await desligar();
    await responder("desligar-mp-conta");
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c1", "recebimento", { modo: "nenhum" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Recebimento: Não cobra pelo app."));
    expect(h.acao).toHaveBeenCalledTimes(1);
  });

  it("Desligar com chave Pix ativa → Pix manual", async () => {
    lista(naMpConta({ chave_pix: { tipo: "email", chave: "rafael@exemplo.com", favorecido: null, banco: null } }));
    montar();
    await desligar();
    await waitFor(() => expect(passo("desligar-mp-conta")).not.toBeNull());
    expect(document.body.textContent).toContain("voltam a pagar por Pix");
    await responder("desligar-mp-conta");
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c1", "recebimento", { modo: "pix_manual" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Recebimento: Pix manual."));
  });

  it("com cobrança automática viva: a 2ª confirmação (perigo) com N alunos → cancelar_automaticas: true → o aviso com as desligadas e a lista relida", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 2 })).mockResolvedValueOnce(ok({ automaticas: { canceladas: 2, forcadas: 0 } }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await waitFor(() => expect(passo("automaticas")).not.toBeNull());
    expect(sel("[data-confirmar]")?.getAttribute("data-confirmar")).toBe("perigo");
    expect(document.body.textContent).toContain("2 alunos com cobrança automática no cartão");
    expect(h.acao).toHaveBeenCalledTimes(1);
    const leituras = h.lista.mock.calls.length;
    await responder("automaticas");
    await waitFor(() => expect(h.acao).toHaveBeenLastCalledWith("c1", "recebimento", { modo: "nenhum", cancelar_automaticas: true }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Recebimento: Não cobra pelo app.",
      { description: "2 cobranças automáticas desligadas no Mercado Pago — cada aluno recebeu um aviso." }));
    expect(h.acao).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(h.lista.mock.calls.length).toBeGreaterThan(leituras));
  });

  it("a 2ª recusada ('Voltar'): nada mais é pedido, nenhum aviso, e o Desligar volta a funcionar", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 1 }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await waitFor(() => expect(document.body.textContent).toContain("1 aluno com cobrança automática no cartão"));
    await responder("automaticas", false);
    await waitFor(() => expect((sel('[data-desligar-mp-conta="c1"]') as HTMLButtonElement).disabled).toBe(false));
    expect(h.acao).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("enquanto as confirmações da troca estão abertas, o Desligar e o select da conta ficam travados (nada de 2 trocas na mesma conta)", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 1 }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await waitFor(() => expect(passo("automaticas")).not.toBeNull());
    expect((sel('[data-desligar-mp-conta="c1"]') as HTMLButtonElement).disabled).toBe(true);
    expect((sel('[data-recebimento="Rafael Lima"]') as HTMLSelectElement).disabled).toBe(true);
    await responder("automaticas", false);
    await waitFor(() => expect((sel('[data-desligar-mp-conta="c1"]') as HTMLButtonElement).disabled).toBe(false));
    expect((sel('[data-recebimento="Rafael Lima"]') as HTMLSelectElement).disabled).toBe(false);
  });

  it("sem acesso ao MP do personal: a 3ª (perigo, 'Forçar') com as já desligadas → forcar_sem_acesso: true → o aviso conta os forçados", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 3 }))
      .mockRejectedValueOnce(recusa("automaticas_sem_acesso", { alunos: 3, canceladas: 1 }))
      .mockResolvedValueOnce(ok({ automaticas: { canceladas: 1, forcadas: 3 } }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await responder("automaticas");
    await waitFor(() => expect(passo("forcar")).not.toBeNull());
    expect(sel("[data-confirmar]")?.getAttribute("data-confirmar")).toBe("perigo");
    expect(sel("[data-confirmar-ok]")?.textContent).toBe("Forçar");
    expect(passo("forcar")?.textContent).toContain("as cobranças automáticas de 3 alunos");
    expect(passo("forcar")?.textContent).toContain("Já desligadas no Mercado Pago: 1.");
    expect(h.acao).toHaveBeenCalledTimes(2);
    await responder("forcar");
    await waitFor(() => expect(h.acao).toHaveBeenCalledTimes(3));
    expect(h.acao.mock.calls.map((c) => c[2])).toEqual([
      { modo: "nenhum" }, { modo: "nenhum", cancelar_automaticas: true }, { modo: "nenhum", cancelar_automaticas: true, forcar_sem_acesso: true }]);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0][1]).toEqual({ description:
      "1 cobrança automática desligada no Mercado Pago — cada aluno recebeu um aviso. 3 alunos marcados sem a cobrança automática à força: o personal e os alunos foram avisados." });
  });

  it("a 3ª recusada: nada é forçado (2 pedidos), nenhum aviso — e a lista é relida (as que o Physiq alcança já saíram)", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 2 }))
      .mockRejectedValueOnce(recusa("automaticas_sem_acesso", { alunos: 2, canceladas: 0 }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await responder("automaticas");
    await waitFor(() => expect(passo("forcar")).not.toBeNull());
    const leituras = h.lista.mock.calls.length;
    await responder("forcar", false);
    await waitFor(() => expect(h.lista.mock.calls.length).toBeGreaterThan(leituras));
    expect(h.acao).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("o MP recusou (502): a frase com a contagem e 'Tentar de novo', que recomeça — a 2ª volta com a contagem de agora", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 2 }))
      .mockRejectedValueOnce(recusa("automaticas_nao_canceladas", { falhas: 1, canceladas: 1, sem_acesso: 0 }))
      .mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 1 }))
      .mockResolvedValueOnce(ok({ automaticas: { canceladas: 1, forcadas: 0 } }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await responder("automaticas");
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [texto, opcoes] = vi.mocked(toast.error).mock.calls[0] as unknown as [string, { action: { label: string; onClick: (e: unknown) => void } }];
    expect(texto).toBe("1 cobrança automática não desligou no Mercado Pago. A forma de receber não mudou. Tente de novo.");
    expect(opcoes.action.label).toBe("Tentar de novo");
    expect(h.acao).toHaveBeenCalledTimes(2);
    await act(async () => { opcoes.action.onClick({}); });
    await waitFor(() => expect(h.acao).toHaveBeenCalledTimes(3));
    expect(h.acao.mock.calls[2]).toEqual(["c1", "recebimento", { modo: "nenhum" }]); // do começo: o servidor diz quantas faltam
    await waitFor(() => expect(passo("automaticas")?.textContent).toContain("1 aluno com cobrança automática"));
    await responder("automaticas");
    await waitFor(() => expect(h.acao).toHaveBeenCalledTimes(4));
    expect(h.acao.mock.calls[3][2]).toEqual({ modo: "nenhum", cancelar_automaticas: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("a corrida (uma automática nasceu entre a conferência e a troca): automaticas_ativas de novo → a 2ª de novo, com a contagem nova", async () => {
    lista(naMpConta());
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 1 }))
      .mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 2 }))
      .mockResolvedValueOnce(ok({ automaticas: { canceladas: 2, forcadas: 0 } }));
    montar();
    await desligar();
    await responder("desligar-mp-conta");
    await waitFor(() => expect(passo("automaticas")?.textContent).toContain("1 aluno com"));
    fireEvent.click(sel("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.acao).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(passo("automaticas")?.textContent).toContain("2 alunos com"));
    fireEvent.click(sel("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.acao).toHaveBeenCalledTimes(3));
    expect(h.acao.mock.calls[2][2]).toEqual({ modo: "nenhum", cancelar_automaticas: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("o select também pede o 1º OK para sair do MP do personal; nas outras contas troca direto, como antes", async () => {
    lista(naMpConta({ id: "c1" }), conta({ id: "c2", nome: "Outra", recebimento_modo: "pix_manual" }));
    montar();
    await waitFor(() => expect(sel('[data-recebimento="Rafael Lima"]')).not.toBeNull());
    fireEvent.change(sel('[data-recebimento="Rafael Lima"]')!, { target: { value: "mercadopago" } });
    await waitFor(() => expect(passo("desligar-mp-conta")).not.toBeNull());
    expect(passo("desligar-mp-conta")?.textContent).toContain("Mercado Pago do Physiq");
    expect(h.acao).not.toHaveBeenCalled();
    await responder("desligar-mp-conta");
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c1", "recebimento", { modo: "mercadopago" }));
    fireEvent.change(sel('[data-recebimento="Outra"]')!, { target: { value: "nenhum" } });
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("c2", "recebimento", { modo: "nenhum" }));
    expect(passo("desligar-mp-conta")).toBeNull();
  });

  it("MENOR 7 também no MP do Physiq: trocar no select com automática viva pede a 2ª e cancela antes", async () => {
    lista(conta({ recebimento_modo: "mercadopago" }));
    h.acao.mockRejectedValueOnce(recusa("automaticas_ativas", { alunos: 4 })).mockResolvedValueOnce(ok({ automaticas: { canceladas: 4, forcadas: 0 } }));
    montar();
    await waitFor(() => expect(sel('[data-recebimento="Rafael Lima"]')).not.toBeNull());
    fireEvent.change(sel('[data-recebimento="Rafael Lima"]')!, { target: { value: "pix_manual" } });
    await waitFor(() => expect(passo("automaticas")?.textContent).toContain("4 alunos com"));
    expect(passo("desligar-mp-conta")).toBeNull();
    await responder("automaticas");
    await waitFor(() => expect(h.acao).toHaveBeenCalledTimes(2));
    expect(h.acao.mock.calls.map((c) => c[2])).toEqual([{ modo: "pix_manual" }, { modo: "pix_manual", cancelar_automaticas: true }]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Recebimento: Pix manual.",
      { description: "4 cobranças automáticas desligadas no Mercado Pago — cada aluno recebeu um aviso." }));
  });

  it("outro erro: a frase do código, sem 'Tentar de novo' (o modo_invalido diz que só o dono liga)", async () => {
    lista(conta({ recebimento_modo: "pix_manual" }));
    h.acao.mockRejectedValueOnce(recusa("modo_invalido"));
    montar();
    await waitFor(() => expect(sel('[data-recebimento="Rafael Lima"]')).not.toBeNull());
    fireEvent.change(sel('[data-recebimento="Rafael Lima"]')!, { target: { value: "nenhum" } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O Mercado Pago do personal e a InfinitePay só o dono liga."));
  });
});
