// src/app-aluno/perfil/pagamentos/PagarInfinitePay.test.tsx
// Physiq W1 — pagar pela InfinitePay: o toque reserva a aba, pede o link e abre a página; "Aguardando a confirmação"; "Conferir pagamento" e
// a volta à tela conferem; pago → avisa e fecha; a recusa da InfinitePay vira uma frase para o aluno (não é culpa dele). Tudo falso.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, MatriculaPagamentos } from "@/financeiro/tipos";

const h = vi.hoisted(() => ({ link: vi.fn(), conferir: vi.fn(), abrir: vi.fn(), aba: { ir: vi.fn(), fechar: vi.fn() }, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }));
vi.mock("@capacitor/browser", () => ({ Browser: { addListener: vi.fn(async () => ({ remove: vi.fn() })), open: vi.fn(), close: vi.fn() } }));
vi.mock("@/financeiro/abrirPagamento", () => ({ reservarAba: () => h.aba, abrirPagina: (...a: unknown[]) => h.abrir(...a) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  abrirLinkDaInfinitePay: (...a: unknown[]) => h.link(...a), conferirInfinitePay: (...a: unknown[]) => h.conferir(...a), invalidarResumo: () => {},
}));

import { ErroFinanceiro } from "@/financeiro/api";
import { PagarInfinitePay } from "./PagarInfinitePay";

const TENTATIVA = { id: "t1", status: "aguardando_confirmacao", forma: "infinitepay", tipo: "mensalidade", valor: 100, ip_link: "https://checkout.infinitepay.com.br/f?lenc=1",
  ip_expira_em: "2026-10-14T12:00:00Z" } as unknown as CobrancaVista;
const MAT = (cobrancas: CobrancaVista[] = []) => ({
  paciente_id: "p1", nome: "Aluno", conta: { id: "c1", nome: "Consultoria", modo: "infinitepay", bloquear: false, profissional: "Lucas" }, chave: null,
  mensalidade: { valor: 100, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: null, coberta: false }, assinatura: null, cobrancas, recibos: [],
}) as unknown as MatriculaPagamentos;
const aoPago = vi.fn();
const montar = (m = MAT()) => render(<PagarInfinitePay matricula={m} alvo={{ tipo: "mensalidade" }} aoFechar={() => {}} aoPago={aoPago} />);
/** A frase das ações da folha sai DENTRO dela, acima do botão (11/10: o toast cobria o "Conferir pagamento" que ele mandava apertar). */
const aviso = () => document.querySelector("[data-ip-aviso]");
const acima = (botao: string) => !!aviso() && !!(aviso()!.compareDocumentPosition(document.querySelector(botao)!) & Node.DOCUMENT_POSITION_FOLLOWING);
const semToastDaFolha = () => {
  expect(h.toast.info).not.toHaveBeenCalled();
  expect(h.toast.error).not.toHaveBeenCalled();
};

beforeEach(() => {
  for (const f of [h.link, h.conferir, h.abrir, h.aba.ir, h.aba.fechar, aoPago, h.toast.success, h.toast.error, h.toast.info]) f.mockReset();
  h.link.mockResolvedValue({ ok: true, url: TENTATIVA.ip_link, cobranca: TENTATIVA, reutilizado: false });
  h.conferir.mockResolvedValue({ ok: true, paga: false, resultado: "nao_pago_pedido", cobranca: TENTATIVA });
});

describe("Pagar pela InfinitePay (W1)", () => {
  it("o toque reserva a aba, pede o link e abre a página; fica aguardando a confirmação", async () => {
    montar();
    fireEvent.click(document.querySelector("[data-ip-pagar]")!);
    await waitFor(() => expect(h.abrir).toHaveBeenCalledWith(TENTATIVA.ip_link, h.aba));
    expect(h.link).toHaveBeenCalledWith("p1", undefined);
    expect(document.querySelector('[data-ip-aguardando="t1"]')?.textContent).toContain("Aguardando a confirmação da InfinitePay");
  });
  it("a InfinitePay fora do ar ou recusando: fecha a aba e diz ao aluno na folha, acima do Pagar, sem culpar a InfiniteTag", async () => {
    h.link.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_recusou"));
    montar();
    fireEvent.click(document.querySelector("[data-ip-pagar]")!);
    await waitFor(() => expect(aviso()?.textContent).toBe("Não deu para abrir o pagamento agora. Avise o seu profissional."));
    expect(acima("[data-ip-pagar]")).toBe(true);
    expect(aviso()?.getAttribute("role")).toBe("alert");
    expect(h.aba.fechar).toHaveBeenCalled();
    semToastDaFolha();
  });
  it("Conferir pagamento: ainda não → a frase de esperar na folha, acima do botão (nenhum toast por cima); pago → 'Pagamento confirmado!' e fecha", async () => {
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-conferir]")).not.toBeNull());
    expect(aviso()).toBeNull();
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(aviso()?.textContent).toBe("Ainda não chegou a confirmação da InfinitePay. Se você já pagou, espere um pouco e confira de novo."));
    expect(acima("[data-ip-conferir]")).toBe(true);
    semToastDaFolha();
    h.conferir.mockResolvedValueOnce({ ok: true, paga: true, resultado: "baixar", cobranca: { ...TENTATIVA, status: "paga" } });
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(aoPago).toHaveBeenCalled());
    expect(h.toast.success).toHaveBeenCalledWith("Pagamento confirmado!");
  });
  it("Conferir pagamento sem internet: 'Não deu para conferir agora.' na folha; o toque seguinte limpa a frase antes de conferir", async () => {
    h.conferir.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-conferir]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(aviso()?.textContent).toBe("Não deu para conferir agora."));
    let soltar: (v: unknown) => void = () => {};
    h.conferir.mockImplementationOnce(() => new Promise((ok) => { soltar = ok; }));
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(aviso()).toBeNull());
    soltar({ ok: true, paga: false, resultado: "nao_pago_pedido", cobranca: TENTATIVA });
    await waitFor(() => expect(aviso()?.textContent).toContain("Ainda não chegou a confirmação da InfinitePay"));
    semToastDaFolha();
  });
  it("a tentativa venceu (o servidor devolve 'cancelada'): volta ao 'Pagar' com a frase na folha, acima dele (MENOR 14 da revisão)", async () => {
    h.conferir.mockResolvedValueOnce({ ok: true, paga: false, resultado: "em_andamento", cobranca: { ...TENTATIVA, status: "cancelada" } });
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-conferir]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-ip-conferir]")!);
    await waitFor(() => expect(document.querySelector("[data-ip-pagar]")).not.toBeNull());
    expect(aviso()?.textContent).toBe("Essa página de pagamento venceu. Toque em Pagar para abrir outra.");
    expect(acima("[data-ip-pagar]")).toBe(true);
    semToastDaFolha();
  });
  it("a tentativa que já existe abre direto em 'aguardando', com 'Abrir a página de novo'; a aba visível de novo confere", async () => {
    montar(MAT([TENTATIVA]));
    await waitFor(() => expect(document.querySelector("[data-ip-abrir-de-novo]")).not.toBeNull());
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(h.conferir).toHaveBeenCalledWith("t1"));
  });
});
