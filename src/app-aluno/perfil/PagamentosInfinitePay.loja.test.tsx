// Physiq W1 — Perfil › Pagamentos na versão da loja (Google Play): o aluno paga o PROFISSIONAL pela InfinitePay igual ao site (é o
// serviço do profissional — não libera recurso do app; regras de tela do plano da W1). O topo é o do Pagamentos.test.tsx, com a
// distribuição da loja; a função e a abertura da página são falsas.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobrancaVista, MatriculaPagamentos, StatusAluno } from "@/financeiro/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ status: vi.fn(), historico: vi.fn(), acao: vi.fn(), volta: vi.fn(), conferir: vi.fn(), link: vi.fn(), abrir: vi.fn() }));
vi.mock("@/lib/distribuicao", () => ({ ehLoja: true, DISTRIBUICAO: "play" }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1" } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarStatusAluno: () => h.status(),
  buscarHistoricoDoAluno: (...a: unknown[]) => h.historico(...a),
  acaoFinanceiro: (...a: unknown[]) => h.acao(...a),
  voltaDaInfinitePay: (...a: unknown[]) => h.volta(...a),
  conferirInfinitePay: (...a: unknown[]) => h.conferir(...a),
  abrirLinkDaInfinitePay: (...a: unknown[]) => h.link(...a),
  invalidarResumo: () => {},
}));
vi.mock("@/financeiro/abrirPagamento", () => ({
  reservarAba: () => null,
  abrirPagina: (...a: unknown[]) => h.abrir(...a),
  abrirLinkExterno: async () => {},
  fecharPagina: async () => {},
}));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => null, initMercadoPago: () => {} }));

import Pagamentos from "./Pagamentos";

const DIA = 86_400_000;
const dia = (n: number) => new Date(Date.now() + n * DIA).toISOString();

function matricula(p: Partial<MatriculaPagamentos> = {}): MatriculaPagamentos {
  return {
    paciente_id: "p1", nome: "Rafael Moura",
    conta: { id: "c1", nome: "Consultoria Ferreira", modo: "nenhum", bloquear: false, profissional: "Lucas Ferreira" },
    chave: null, mensalidade: null, assinatura: null, cobrancas: [], recibos: [], total_cobrancas: 0, total_recibos: 0, ...p,
  };
}
const status = (m: MatriculaPagamentos[]): StatusAluno => ({ ok: true, ambiente: "staging", simulacao: true, hoje: dia(0).slice(0, 10), agora: dia(0), matriculas: m });

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={["/perfil/pagamentos"]}>
          <Routes>
            <Route path="*" element={<Pagamentos />} />
          </Routes>
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );

const URL_IP = "https://checkout.infinitepay.com.br/lucas?lenc=1";

beforeEach(() => {
  for (const f of [h.status, h.historico, h.acao, h.volta, h.conferir, h.link, h.abrir]) f.mockReset();
  h.acao.mockResolvedValue({});
  h.historico.mockResolvedValue({ itens: [], total: 0 });
  h.status.mockResolvedValue(status([matricula()]));
  h.link.mockResolvedValue({ ok: true, url: URL_IP, reutilizado: false,
    cobranca: { id: "t1", status: "aguardando_confirmacao", forma: "infinitepay", tipo: "mensalidade", valor: 100, ip_link: URL_IP } as unknown as CobrancaVista });
  h.abrir.mockResolvedValue("app");
  h.conferir.mockResolvedValue({ ok: true, paga: false, resultado: "em_andamento", cobranca: { status: "aguardando_confirmacao" } });
});

describe("Perfil › Pagamentos — InfinitePay na versão da loja (W1)", () => {
  it("na versão da loja o aluno paga o PROFISSIONAL pela InfinitePay igual — não libera recurso do app", async () => {
    h.status.mockResolvedValue(status([matricula({
      conta: { id: "c1", nome: "Consultoria", modo: "infinitepay", bloquear: false, profissional: "Lucas Ferreira" },
      mensalidade: { valor: 100, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: dia(-1), coberta: false },
    })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 100,00");
    fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
    await waitFor(() => expect(document.querySelector("[data-pagar-ip]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mp]")).toBeNull();
    expect(document.querySelector("[data-pagar-pix-manual]")).toBeNull();
    // o mesmo caminho do site: o link do profissional e a página da InfinitePay por cima do app
    fireEvent.click(document.querySelector("[data-ip-pagar]")!);
    await waitFor(() => expect(h.abrir).toHaveBeenCalledWith(URL_IP, null));
    expect(h.link).toHaveBeenCalledWith("p1", undefined);
    await waitFor(() => expect(document.querySelector('[data-ip-aguardando="t1"]')).not.toBeNull());
  });
});
