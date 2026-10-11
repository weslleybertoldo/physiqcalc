import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { RecebimentoDaConta } from "@/financeiro/tipos";

// hml-17 (H-39) + W1: Configurações › Recebimento — os comprovantes aguardando (a leitura que falha mostra o aviso e "—"); o jeito 2 (a
// tela lê e grava pela função — o cliente do banco falso explode se for usado); a InfinitePay (a opção só com a flag, a InfiniteTag sem o
// $, o Testar abrindo a aba reservada no toque); sair do MP com automática pede o OK (useConfirmar); o bloqueio do inadimplente.
const h = vi.hoisted(() => ({ resumo: vi.fn(), ler: vi.fn(), salvar: vi.fn(), testar: vi.fn(), abrir: vi.fn(), externo: vi.fn(), aba: { ir: vi.fn(), fechar: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: { id: "c1", nome: "Consultoria Teste", membro_id: "m1" }, situacao: { master: false } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarResumoDaConta: (c: string) => h.resumo(c),
  buscarRecebimento: (c: string) => h.ler(c),
  salvarRecebimento: (...a: unknown[]) => h.salvar(...a),
  testarInfinitePay: (...a: unknown[]) => h.testar(...a),
}));
vi.mock("@/financeiro/abrirPagamento", () => ({
  reservarAba: () => h.aba, abrirPagina: (...a: unknown[]) => h.abrir(...a), abrirLinkExterno: (...a: unknown[]) => h.externo(...a),
}));
vi.mock("@/components/admin/RecebimentosLista", () => ({ default: () => <div data-testid="chaves-pix" /> }));
vi.mock("@/components/admin/ComprovantePixCard", () => ({ default: ({ item }: { item: { id: string } }) => <div data-comprovante={item.id}>comprovante {item.id}</div> }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principal: { from: () => { throw new Error("a tela de Recebimento não fala mais com o banco (jeito 2)"); } },
}));

import { toast } from "sonner";
import { ErroFinanceiro } from "@/financeiro/api";
import Recebimento from "./Recebimento";

const REC = (x: Partial<RecebimentoDaConta> = {}, ip: Partial<RecebimentoDaConta["infinitepay"]> = {}): RecebimentoDaConta => ({
  ok: true, master: false, pode_editar: true, conta: { id: "c1", nome: "Consultoria Teste", origem: "nova", modo: "pix_manual", bloquear: false },
  chaves: [], mp_liberado: false, infinitepay: { disponivel: true, handle: null, status: null, testado_em: null, ...ip }, ...x,
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false}>
          <Recebimento />
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const contador = () => document.querySelector("[data-recebimento-pendentes-contador]")?.textContent;
const PENDENTE = { id: "p1", aluno: { nome: "Aluno Teste", paciente_id: "a1", treino_user_id: null } };

beforeEach(() => {
  for (const f of [h.resumo, h.ler, h.salvar, h.testar, h.abrir, h.externo, h.aba.ir, h.aba.fechar]) f.mockReset();
  h.resumo.mockResolvedValue({ pendentes: [] });
  h.ler.mockResolvedValue(REC());
  h.salvar.mockImplementation(async (_c: string, p: { modo?: string }) => REC({ conta: { ...REC().conta, modo: (p.modo as never) ?? "pix_manual" } }));
});

describe("Configurações › Recebimento — os comprovantes aguardando (hml-17)", () => {
  it("a leitura falha → o aviso com Tentar de novo e o contador \"—\"; tocar refaz", async () => {
    h.resumo.mockReset().mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-recebimento-pendentes-erro]")).not.toBeNull());
    expect(screen.queryByText("Nenhum comprovante aguardando.")).toBeNull();
    expect(contador()).toBe("—");
    h.resumo.mockResolvedValueOnce({ pendentes: [PENDENTE] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("comprovante p1")).toBeInTheDocument();
    expect(contador()).toBe("1");
  });
  it("controle: nenhum comprovante → \"Nenhum comprovante aguardando.\" e 0", async () => {
    montar();
    expect(await screen.findByText("Nenhum comprovante aguardando.")).toBeInTheDocument();
    expect(contador()).toBe("0");
  });
});

describe("Configurações › Recebimento — W1 (jeito 2 e InfinitePay)", () => {
  it("lê pela função (o banco falso explode se for usado) e só mostra a InfinitePay com a flag ou já ligada", async () => {
    h.ler.mockResolvedValue(REC({}, { disponivel: false }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="pix_manual"]')).not.toBeNull());
    expect(h.ler).toHaveBeenCalledWith("c1");
    expect(document.querySelector('[data-opcao="infinitepay"]')).toBeNull();
  });
  it("InfinitePay: a InfiniteTag com $ vai sem ele; Testar reserva a aba no toque e abre o link", async () => {
    h.testar.mockResolvedValue({ ok: true, url: "https://checkout.infinitepay.com.br/fulano?lenc=t" });
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: " $Fulano " } });
    fireEvent.click(document.querySelector("[data-infinitepay-testar]")!);
    await waitFor(() => expect(h.abrir).toHaveBeenCalledWith("https://checkout.infinitepay.com.br/fulano?lenc=t", h.aba));
    expect(h.testar).toHaveBeenCalledWith("c1", "fulano");
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { modo: "infinitepay", handle: "fulano" }));
  });
  it("InfiniteTag ruim não sai da tela; a InfinitePay recusou → a frase embaixo do campo", async () => {
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_recusou"));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "ana personal" } });
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("sem o $");
    expect(h.salvar).not.toHaveBeenCalled();
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "ana.personal" } });
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("não aceitou"));
  });
  it("checkout externo desligado (ou a InfiniteTag que não existe — a API responde igual): a frase das 2 coisas e o botão de ativar", async () => {
    const ATIVAR = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true";
    h.testar.mockRejectedValueOnce(new ErroFinanceiro("infinitepay_checkout_desligado", { ativar: ATIVAR }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="infinitepay"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="infinitepay"]')!);
    fireEvent.change(document.querySelector("[data-infinitetag]")!, { target: { value: "$fulano" } });
    fireEvent.click(document.querySelector("[data-infinitepay-testar]")!);
    await waitFor(() => expect(document.querySelector("[data-infinitetag-erro]")?.textContent).toContain("ative o checkout externo"));
    expect(h.aba.fechar).toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-infinitepay-ativar]")!);
    expect(h.externo).toHaveBeenCalledWith(ATIVAR);
    // a 390 o rótulo longo quebra a linha dentro do cartão, com os 44 px do toque (o pq-botao sozinho é nowrap com 44 px fixos — passava
    // da borda em 11/10; a medida de verdade é a do e2e/w1/telas.py, a 390)
    for (const b of ["[data-infinitepay-testar]", "[data-infinitepay-ativar]"]) {
      const classes = document.querySelector(b)?.className.split(/\s+/) ?? [];
      expect(classes).toEqual(expect.arrayContaining(["whitespace-normal", "h-auto", "min-h-[44px]"]));
    }
  });
  it("sair do Mercado Pago com automática: pede o OK do app e manda cancelar_automaticas", async () => {
    h.ler.mockResolvedValue(REC({ mp_liberado: true, conta: { ...REC().conta, modo: "mercadopago" } }));
    h.salvar.mockRejectedValueOnce(new ErroFinanceiro("automaticas_ativas", { alunos: 2 }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="pix_manual"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="pix_manual"]')!);
    fireEvent.click(document.querySelector("[data-recebimento-salvar-modo]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(document.body.textContent).toContain("2 alunos pagam");
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenLastCalledWith("c1", { modo: "pix_manual", cancelar_automaticas: true }));
  });
  it("o bloqueio do inadimplente grava pela função", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-opcao="sim"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-opcao="sim"]')!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { bloquear: true }));
  });
  it("o bloqueio muda na hora do toque (como antes da W1) e volta ao salvo quando o servidor recusa, com a frase da tela", async () => {
    vi.mocked(toast.error).mockClear();
    let recusar: (e: unknown) => void = () => {};
    h.salvar.mockImplementationOnce(() => new Promise((_ok, falha) => { recusar = falha; }));
    montar();
    const sim = () => document.querySelector('[data-opcoes="recebimento-bloqueio"] [data-opcao="sim"]');
    await waitFor(() => expect(sim()).not.toBeNull());
    fireEvent.click(sim()!);
    expect(sim()?.getAttribute("aria-checked")).toBe("true");
    recusar(new ErroFinanceiro("sem_permissao"));
    await waitFor(() => expect(sim()?.getAttribute("aria-checked")).toBe("false"));
    expect(toast.error).toHaveBeenCalledWith("Você não tem permissão para mudar o recebimento desta conta.");
  });
});
