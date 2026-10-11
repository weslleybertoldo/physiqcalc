// Physiq W-P — Perfil › Pagamentos na versão da loja (Google Play): o plano com período que o PERSONAL criou continua pagável no app da
// loja, como no site (desenho 4.3: é serviço do profissional; não libera recurso do app — só a conta do app fica sem preço na loja, W1).
// O topo é o do Pagamentos.test.tsx, com a distribuição da loja.
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatriculaPagamentos, StatusAluno } from "@/financeiro/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ status: vi.fn(), historico: vi.fn(), acao: vi.fn() }));
vi.mock("@/lib/distribuicao", () => ({ ehLoja: true, DISTRIBUICAO: "play" }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1" } }) }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarStatusAluno: () => h.status(),
  buscarHistoricoDoAluno: (...a: unknown[]) => h.historico(...a),
  acaoFinanceiro: (...a: unknown[]) => h.acao(...a),
  invalidarResumo: () => {},
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

beforeEach(() => {
  h.status.mockReset();
  h.historico.mockReset();
  h.acao.mockReset();
  h.acao.mockResolvedValue({});
  h.historico.mockResolvedValue({ itens: [], total: 0 });
  h.status.mockResolvedValue(status([matricula()]));
});

describe("Perfil › Pagamentos — versão da loja (W-P)", () => {
  it("o aluno paga o PLANO DO PERSONAL também na loja (serviço do profissional, não libera recurso do app)", async () => {
    h.status.mockResolvedValue(status([matricula({
      conta: { id: "c1", nome: "Consultoria", modo: "pix_manual", bloquear: false, profissional: "Lucas Ferreira" },
      chave: { tipo: "email", chave: "lucas@teste.com", favorecido: "Lucas", banco: null },
      mensalidade: { valor: 1000, plano_id: "pl1", plano: "Anual", pausada: false, pago_ate: null, desde: dia(-1), coberta: false,
        modalidade: "avista", meses: 12, negociado: null, max_parcelas: 1, automatica: false, parcela: null },
    })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 1.000,00");
    // o cartão é o do plano, igual ao site (a W-P na loja não fica no texto de antes)
    const cartao = document.querySelector("[data-mensalidade-aluno]")!;
    expect(cartao.textContent).toContain("Plano · Anual");
    expect(cartao.textContent).toContain("/ano");
  });
});
