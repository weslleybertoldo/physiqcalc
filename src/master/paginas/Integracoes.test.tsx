// Physiq W1 — master › Integrações: a conta na InfinitePay mostra a InfiniteTag; o master NÃO liga a InfinitePay (a opção só fica ativa
// na conta que já está nela — quem liga é o dono, com a InfiniteTag) e "Desligar" volta ao Pix manual (com chave ativa) ou a "não cobrar",
// com a confirmação do app (o desenho §4.1).
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ lista: vi.fn(), acao: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../api", async (orig) => ({ ...(await orig<typeof import("../api")>()), integracoes: (n: number) => h.lista(n), acaoConta: (...a: unknown[]) => h.acao(...a) }));

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
