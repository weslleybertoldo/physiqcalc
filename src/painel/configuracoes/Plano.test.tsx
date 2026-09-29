import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRECOS_PADRAO } from "@/nucleo/cobranca/regras";
import { conta, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  conta: null as unknown,
  master: false,
  situacao: null as unknown,
  buscar: vi.fn(),
  acao: vi.fn(),
  recarregar: vi.fn(async () => null),
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehMaster: h.master, ehDono: true }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: h.situacao, recarregarSituacao: h.recarregar, usuario: { id: "u1", email: "dono@teste.com" } }) }));
vi.mock("@/layouts/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-admin-layout>{children}</div> }));
vi.mock("@/pages/admin/PlanosPage", () => ({ default: () => <div>tela Planos do Calc</div> }));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => <div data-brick-falso>brick</div>, initMercadoPago: () => {} }));
vi.mock("./plano/api", async (original) => ({ ...(await original<typeof import("./plano/api")>()), buscarStatusCobranca: h.buscar, acaoCobranca: h.acao }));

import Plano from "./Plano";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/painel/configuracoes/plano"]}>
        <Plano />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const status = (o: Record<string, unknown> = {}, c: Record<string, unknown> = {}) => ({
  ok: true, ambiente: "staging", simulacao: true, hoje: "2026-09-29",
  conta: { id: "c1", nome: "Consultoria Ferreira", origem: "nova", plano: "treino_nutricao", faixa: "f10", periodicidade: "mensal", situacao: "teste",
    teste_ate: "2026-10-13", vence_em: null, tolerancia_dias: 0, valor_travado: null, regra_pix: "mes", isenta_motivo: null, efetiva: "teste", ...c },
  alunos_ativos: 3, limite_alunos: 10, precos: PRECOS_PADRAO, valor_mensal: 59.9, valor_anual: 599, faturas: [], pix_aberto: null, assinatura: null, ...o,
});

beforeEach(() => {
  h.master = false;
  h.situacao = situacao();
  h.buscar.mockReset();
  h.acao.mockReset();
  h.recarregar.mockClear();
});

describe("Configurações › Plano — legados e isenta (P9)", () => {
  it("legado Calc: a tela Planos de hoje dentro da casca", async () => {
    h.conta = conta({ origem: "legado_calc", plano: "treino", modulos: ["treino"], situacao: "ativa" });
    montar();
    expect(await screen.findByText("tela Planos do Calc")).toBeInTheDocument();
    expect(h.buscar).not.toHaveBeenCalled();
  });
  it("legado Nutri: o aviso com o link para a Assinatura do site do PhysiqNutri", () => {
    h.conta = conta({ origem: "legado_nutri", plano: "nutricao", modulos: ["nutricao"], situacao: "teste" });
    h.situacao = situacao({ legado_nutri: { role: "nutricionista", teste_ate: "2026-10-05T12:00:00Z", pago_ate: null, isento_assinatura: false, assinatura: null } });
    montar();
    expect(screen.getByRole("link", { name: /Abrir a Assinatura no PhysiqNutri/ })).toHaveAttribute("href", "https://nutri.physiqcalc.com.br/configuracoes");
    expect(h.buscar).not.toHaveBeenCalled();
  });
  it("conta isenta do master: sem cobrança", () => {
    h.master = true;
    h.conta = conta({ origem: "legado_nutri", plano: "nutricao", modulos: ["nutricao"], situacao: "isenta", isenta_motivo: "master" });
    montar();
    expect(screen.getByText("Conta master")).toBeInTheDocument();
    expect(screen.getByText("SEM COBRANÇA")).toBeInTheDocument();
  });
});

describe("Configurações › Plano — conta nova (6.5)", () => {
  it("no teste: escolhe o plano e gera o Pix do plano escolhido", async () => {
    h.conta = conta();
    h.buscar.mockResolvedValue(status());
    h.acao.mockResolvedValue({ fatura: { id: "f1", conta_id: "c1", valor: 79.9, status: "pending", forma: "pix", pix_qr: null,
      pix_copia_cola: "00020126PIX", pix_expira_em: "2026-10-02T12:00:00Z", pago_em: null, tipo: "pix_avulso", criado_em: "2026-09-29T12:00:00Z" } });
    montar();
    expect(await screen.findByText("Escolha o plano")).toBeInTheDocument();
    expect(screen.getByText(/Teste grátis até 13\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText("PARA DEPOIS DO TESTE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Só Treino/ }));
    fireEvent.click(screen.getByRole("radio", { name: /11–30 alunos/ }));
    expect(screen.getByText(/depois de pagar, ativa até/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pagar com Pix/ }));
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("pix_criar", { conta_id: "c1", plano: "treino", faixa: "f30", meses: 1 }));
    expect(await screen.findByDisplayValue("00020126PIX")).toBeInTheDocument();
    expect(screen.getByText(/Aguardando confirmação do Mercado Pago/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Simular aprovação/ })).toBeInTheDocument();
  });
  it("faixa em que os alunos não cabem fica desabilitada", async () => {
    h.conta = conta();
    h.buscar.mockResolvedValue(status({ alunos_ativos: 12 }));
    montar();
    expect(await screen.findByRole("radio", { name: /1–10 alunos/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /11–30 alunos/ })).not.toBeDisabled();
  });
  it("ativa: mudar de plano usa 'Mudar para este plano' (o Pagar some até decidir)", async () => {
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-20" });
    h.buscar.mockResolvedValue(status({}, { situacao: "ativa", teste_ate: null, vence_em: "2026-10-20", efetiva: "ativa" }));
    h.acao.mockResolvedValue({ ...status({}, { situacao: "ativa", efetiva: "ativa", plano: "treino_nutricao", faixa: "f30" }), assinatura_atualizada: null });
    montar();
    expect(await screen.findByText("Seu plano")).toBeInTheDocument();
    expect(screen.getByText("Plano atual")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /11–30 alunos/ }));
    expect(screen.queryByRole("button", { name: /Pagar com Pix/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Mudar para este plano/ }));
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("mudar_plano", { conta_id: "c1", plano: "treino_nutricao", faixa: "f30" }));
    await waitFor(() => expect(h.recarregar).toHaveBeenCalled());
  });
  it("vencida: 'Escolha o plano' para voltar ao painel; com cartão recorrente o Pix fica bloqueado", async () => {
    h.conta = conta({ situacao: "vencida", teste_ate: "2026-09-01", vence_em: null });
    h.buscar.mockResolvedValue(status({}, { situacao: "vencida", teste_ate: "2026-09-01", efetiva: "vencida" }));
    const r = montar();
    expect(await screen.findByText("PARA VOLTAR AO PAINEL")).toBeInTheDocument();
    expect(screen.getByText(/Vencida em 01\/09\/2026/)).toBeInTheDocument();
    r.unmount();
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-20" });
    h.buscar.mockResolvedValue(status({ assinatura: { id: "a1", status: "authorized", valor: 59.9, plano: "treino_nutricao", faixa: "f10",
      proximo_vencimento: "2026-10-20T12:00:00-03:00", ultimo_pagamento_em: null, sandbox: false, simulada: false, init_point: null } },
      { situacao: "ativa", teste_ate: null, vence_em: "2026-10-20", efetiva: "ativa" }));
    montar();
    expect(await screen.findByText("Cobrança automática")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pagar com Pix/ })).toBeDisabled();
    expect(screen.getByText(/renova sozinha em 20\/10/)).toBeInTheDocument();
  });
  it("erro ao carregar: 'Tentar de novo'", async () => {
    h.conta = conta();
    h.buscar.mockRejectedValue(new Error("rede"));
    montar();
    // a tela tenta 1 vez de novo antes de mostrar o erro (rede instável)
    expect(await screen.findByText("Não deu para carregar o plano", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeInTheDocument();
  });
});
