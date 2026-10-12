// Physiq W2 — Perfil › Pagamentos na versão da loja (Google Play): o aluno paga o PROFISSIONAL pelo Mercado Pago DELE igual ao site (é o
// serviço do profissional — não libera recurso do app): o cartão com a chave pública do personal, só o aviso com a conexão caída (e a
// linha da mensalidade sem Pix nem cartão) e só o Pix sem a chave (decisão 14). O topo é o do Pagamentos.test.tsx, com a distribuição
// da loja; a função e o SDK do Mercado Pago são falsos (o ensureMpInit é o de verdade, por chave).
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatriculaPagamentos, StatusAluno } from "@/financeiro/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ status: vi.fn(), historico: vi.fn(), acao: vi.fn(), init: vi.fn() }));
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
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => null, initMercadoPago: (...a: unknown[]) => h.init(...a) }));
vi.mock("@/components/pagamentos/mpInit", async (orig) => ({ ...(await orig<typeof import("@/components/pagamentos/mpInit")>()), MP_PUBLIC_KEY: "TEST-chave" }));

import Pagamentos from "./Pagamentos";

const DIA = 86_400_000;
const dia = (n: number) => new Date(Date.now() + n * DIA).toISOString();
const CHAVE_DO_LUCAS = "APP_USR-chave-publica-do-lucas";

function matricula(mp: MatriculaPagamentos["mp"]): MatriculaPagamentos {
  return {
    paciente_id: "p1", nome: "Rafael Moura",
    conta: { id: "c1", nome: "Consultoria", modo: "mercadopago_conta", bloquear: false, profissional: "Lucas Ferreira" },
    chave: null, assinatura: null, cobrancas: [], recibos: [], total_cobrancas: 0, total_recibos: 0, mp,
    mensalidade: { valor: 100, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: dia(-1), coberta: false },
  };
}
const status = (m: MatriculaPagamentos[]): StatusAluno => ({ ok: true, ambiente: "staging", simulacao: true, hoje: dia(0).slice(0, 10), agora: dia(0), matriculas: m });

async function abrirPagar() {
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
  await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
  // na loja, o personal mostra o preço e o Pagar (só a conta do app fica sem — W1 da loja)
  expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 100,00");
  fireEvent.click(document.querySelector("[data-pagar-mensalidade]")!);
  await waitFor(() => expect(document.body.querySelector("[data-pagar-mp]")).not.toBeNull());
  expect(document.body.querySelector("[data-pagar-pix-manual]")).toBeNull();
}

beforeEach(() => {
  for (const f of [h.status, h.historico, h.acao, h.init]) f.mockReset();
  h.acao.mockResolvedValue({});
  h.historico.mockResolvedValue({ itens: [], total: 0 });
});

describe("Perfil › Pagamentos — o Mercado Pago do personal na versão da loja (W2)", () => {
  it("o aluno paga o PROFISSIONAL pelo Mercado Pago dele igual ao site — o Brick com a chave pública do personal", async () => {
    h.status.mockResolvedValue(status([matricula({ disponivel: true, chave_publica: CHAVE_DO_LUCAS })]));
    await abrirPagar();
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).toMatch(/ · Pix ou cartão$/);
    expect(document.body.querySelector("[data-mp-gerar-pix]")).not.toBeNull();
    fireEvent.click(document.body.querySelector("[data-mp-cartao]")!);
    await waitFor(() => expect(document.body.querySelector("[data-brick-mp]")?.getAttribute("data-brick-chave")).toBe("conta"));
    await waitFor(() => expect(h.init).toHaveBeenCalledWith(CHAVE_DO_LUCAS, expect.objectContaining({ locale: "pt-BR" })));
    expect(h.init).not.toHaveBeenCalledWith("TEST-chave", expect.anything());
  });

  it("a conexão do personal caída: só o aviso, igual ao site — e a linha da mensalidade não promete Pix nem cartão", async () => {
    h.status.mockResolvedValue(status([matricula({ disponivel: false, chave_publica: null })]));
    await abrirPagar();
    const linha = document.querySelector("[data-linha-mensalidade]")!.textContent!;
    expect(linha).toMatch(/ · pagamento pelo app indisponível$/);
    expect(linha).not.toMatch(/Pix|cartão/);
    expect(document.body.querySelector("[data-mp-indisponivel]")?.textContent).toBe("O pagamento pelo app está indisponível agora. Avise o seu profissional.");
    for (const sel of ["[data-mp-gerar-pix]", "[data-mp-cartao]", "[data-mp-assinar]", "[data-brick-mp]"]) {
      expect(document.body.querySelector(sel), sel).toBeNull();
    }
  });

  it("sem a chave pública do personal: só o Pix, igual ao site (nunca o Brick com a chave do Physiq)", async () => {
    h.status.mockResolvedValue(status([matricula({ disponivel: true, chave_publica: null })]));
    await abrirPagar();
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).toMatch(/ · Pix$/);
    expect(document.body.querySelector("[data-mp-gerar-pix]")).not.toBeNull();
    for (const sel of ["[data-mp-cartao]", "[data-mp-assinar]", "[data-brick-mp]", "[data-mp-indisponivel]"]) {
      expect(document.body.querySelector(sel), sel).toBeNull();
    }
    expect(h.init).not.toHaveBeenCalled();
  });
});
