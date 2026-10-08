import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ComponentType } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRECOS_PADRAO } from "@/nucleo/cobranca/regras";
import { conta, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => {
  // hml-11 (D5): os testes de sempre rodam como a produção — sem o resumo antes de pagar e com a frase de hoje. O Vitest roda como o
  // staging (vitest.config.ts) e a condição do Vite é lida quando a tela carrega: o schema troca ANTES dos imports.
  vi.stubEnv("VITE_DB_SCHEMA", "public");
  return {
    conta: null as unknown,
    master: false,
    situacao: null as unknown,
    buscar: vi.fn(),
    acao: vi.fn(),
    recarregar: vi.fn(async () => null),
    loja: false,
    importouResumo: 0,
  };
});
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
// hml-11: conta quando a tela pede o resumo (o import() que a produção corta)
vi.mock("@/publico/legal/ResumoAntesDePagar", async (orig) => {
  h.importouResumo += 1;
  return orig<typeof import("@/publico/legal/ResumoAntesDePagar")>();
});
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehMaster: h.master, ehDono: true }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: h.situacao, recarregarSituacao: h.recarregar, usuario: { id: "u1", email: "dono@teste.com" } }) }));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => <div data-brick-falso>brick</div>, initMercadoPago: () => {} }));
vi.mock("./plano/api", async (original) => ({ ...(await original<typeof import("./plano/api")>()), buscarStatusCobranca: h.buscar, acaoCobranca: h.acao }));

import Plano from "./Plano";
import { ErroCobranca } from "./plano/api";

// H4: a validade do Pix dos mocks era uma data fixa (02/10/2026 12:00Z) e o teste do Pix passou a falhar depois dela: 2 h a partir de agora
const PIX_VALE_ATE = new Date(Date.now() + 2 * 3_600_000).toISOString();

function montar(Tela: ComponentType = Plano) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/painel/configuracoes/plano"]}>
        <Tela />
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
  vi.stubEnv("VITE_DB_SCHEMA", "public");
  h.loja = false;
  h.importouResumo = 0;
  h.master = false;
  h.situacao = situacao();
  h.buscar.mockReset();
  h.acao.mockReset();
  h.recarregar.mockClear();
});

describe("Configurações › Plano — isenta e a cobrança antiga (W28: as telas antigas saíram)", () => {
  it("conta que ainda estivesse com a cobrança antiga (cobranca_legada): o plano do núcleo, com o erro 'conta_legada' do servidor", async () => {
    h.conta = conta({ origem: "legado_calc", cobranca_legada: true, plano: "treino", modulos: ["treino"], situacao: "ativa" });
    h.buscar.mockRejectedValue(new ErroCobranca("conta_legada"));
    montar();
    expect(await screen.findByText("Não deu para carregar o plano", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("A cobrança desta conta ainda não passou para o Physiq. Fale com o suporte.")).toBeInTheDocument();
    expect(h.buscar).toHaveBeenCalledWith("c1");
    expect(screen.queryByRole("link", { name: /PhysiqNutri/ })).toBeNull();
  });
  it("conta isenta do master: sem cobrança", () => {
    h.master = true;
    h.conta = conta({ origem: "legado_nutri", plano: "nutricao", modulos: ["nutricao"], situacao: "isenta", isenta_motivo: "master" });
    montar();
    expect(screen.getByText("Conta master")).toBeInTheDocument();
    expect(screen.getByText("SEM COBRANÇA")).toBeInTheDocument();
  });
});

// W28: legado Calc no núcleo — Só Treino 11–30 com o preço de hoje (R$ 29,90 travado; a tabela é R$ 79,90) e 7 dias de tolerância.
// O servidor manda o travado só no plano/faixa atual (os outros = a tabela).
const precosLegado = PRECOS_PADRAO.map((p) => (p.plano === "treino" && p.faixa === "f30" ? { ...p, valor_mensal: 29.9, valor_anual: 299 } : p));
const contaLegado = { origem: "legado_calc", plano: "treino", faixa: "f30", situacao: "ativa", teste_ate: null, vence_em: "2026-10-20",
  tolerancia_dias: 7, valor_travado: 29.9, regra_pix: "mes", cobranca_legada: false, regras_legadas: true, efetiva: "ativa" };

describe("Configurações › Plano — W28: legada com cobranca_legada = false vai para o núcleo", () => {
  it("legado Calc: o plano do núcleo com 'Preço de hoje mantido' e a tolerância de 7 dias", async () => {
    h.conta = conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, plano: "treino", modulos: ["treino"], faixa: "f30",
      situacao: "ativa", teste_ate: null, vence_em: "2026-10-20", tolerancia_dias: 7 });
    h.buscar.mockResolvedValue(status({ precos: precosLegado, valor_mensal: 29.9, valor_anual: 299, limite_alunos: 30 }, contaLegado));
    montar();
    expect(await screen.findByText("Seu plano")).toBeInTheDocument();
    expect(h.buscar).toHaveBeenCalledWith("c1");
    expect(document.querySelector("[data-preco-de-hoje]")?.textContent).toMatch(/^Preço de hoje mantido: R\$\s?29,90\/mês$/);
    expect(screen.getByText("Tolerância de 7 dias depois do vencimento")).toBeInTheDocument();
    expect(screen.getByText("preço de hoje")).toBeInTheDocument();
    // os preços vêm do servidor: o travado no plano/faixa atual e a tabela nos outros (o travado não vale para tudo)
    expect(within(screen.getByRole("radio", { name: /11–30 alunos/ })).getByText(/R\$\s?29,90/)).toBeInTheDocument();
    expect(within(screen.getByRole("radio", { name: /31–100 alunos/ })).getByText(/R\$\s?149,90/)).toBeInTheDocument();
    expect(within(screen.getByRole("radio", { name: /Treino \+ Nutrição/ })).getByText(/R\$\s?119,90/)).toBeInTheDocument();
  });
  it("legado Nutri: o plano do núcleo (sem a tela do site antigo); sem tolerância, sem a linha dela", async () => {
    h.conta = conta({ origem: "legado_nutri", cobranca_legada: false, regras_legadas: true, plano: "nutricao", modulos: ["nutricao"], situacao: "ativa",
      teste_ate: null, vence_em: "2026-10-20" });
    h.buscar.mockResolvedValue(status({ valor_mensal: 80, limite_alunos: null }, { origem: "legado_nutri", plano: "nutricao", situacao: "ativa", teste_ate: null,
      vence_em: "2026-10-20", valor_travado: 80, regra_pix: "30dias", cobranca_legada: false, regras_legadas: true, efetiva: "ativa" }));
    montar();
    expect(await screen.findByText("Seu plano")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Abrir a Assinatura no PhysiqNutri/ })).toBeNull();
    expect(document.querySelector("[data-preco-de-hoje]")?.textContent).toMatch(/R\$\s?80,00\/mês$/);
    expect(document.querySelector("[data-tolerancia-de-hoje]")).toBeNull();
    expect(screen.getByText("sem limite")).toBeInTheDocument();
  });
  it("legado Nutri isento no núcleo: sem cobrança", () => {
    h.conta = conta({ origem: "legado_nutri", cobranca_legada: false, plano: "nutricao", modulos: ["nutricao"], situacao: "isenta", isenta_motivo: "parceria" });
    montar();
    expect(screen.getByText("Conta isenta")).toBeInTheDocument();
    expect(h.buscar).not.toHaveBeenCalled();
  });
  it("Mudar plano com o preço de hoje pede confirmação: o preço e as regras de hoje deixam de valer", async () => {
    h.conta = conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, plano: "treino", modulos: ["treino"], faixa: "f30",
      situacao: "ativa", teste_ate: null, vence_em: "2026-10-20", tolerancia_dias: 7 });
    h.buscar.mockResolvedValue(status({ precos: precosLegado, valor_mensal: 29.9, valor_anual: 299 }, contaLegado));
    h.acao.mockResolvedValue({ ...status({}, { situacao: "ativa", efetiva: "ativa", plano: "treino_nutricao", faixa: "f30" }), assinatura_atualizada: null });
    montar();
    fireEvent.click(await screen.findByRole("radio", { name: /Treino \+ Nutrição/ }));
    expect(document.querySelector("[data-aviso-sai-do-legado]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Mudar para este plano/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent(/Ao trocar de plano, o preço de hoje \(R\$\s?29,90\/mês\) e as regras de hoje deixam de valer: passam a ser os da tabela nova \(R\$\s?119,90\/mês, a partir do próximo pagamento\)\./);
    expect(h.acao).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Trocar de plano" }));
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("mudar_plano", { conta_id: "c1", plano: "treino_nutricao", faixa: "f30" }));
  });
  it("vencida com o preço de hoje: outro plano na hora de pagar confirma antes do Pix; o mesmo plano, não", async () => {
    h.conta = conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, plano: "treino", modulos: ["treino"], faixa: "f30",
      situacao: "vencida", teste_ate: null, vence_em: "2026-09-10", tolerancia_dias: 7 });
    h.buscar.mockResolvedValue(status({ precos: precosLegado, valor_mensal: 29.9, valor_anual: 299 },
      { ...contaLegado, situacao: "vencida", vence_em: "2026-09-10", efetiva: "vencida" }));
    h.acao.mockResolvedValue({ fatura: { id: "f1", conta_id: "c1", valor: 29.9, status: "pending", forma: "pix", pix_qr: null,
      pix_copia_cola: "00020126PIX", pix_expira_em: PIX_VALE_ATE, pago_em: null, tipo: "pix_avulso", criado_em: "2026-09-29T12:00:00Z" } });
    montar();
    // "venceu em" é o vencimento (10/09), não o fim dos 7 dias de tolerância (17/09)
    expect(await screen.findByText(/Vencida em 10\/09\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /31–100 alunos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Pagar com Pix/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent(/\(R\$\s?149,90\/mês, já neste pagamento\)/);
    expect(h.acao).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: /11–30 alunos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Pagar com Pix/ }));
    await waitFor(() => expect(h.acao).toHaveBeenCalledWith("pix_criar", { conta_id: "c1", plano: "treino", faixa: "f30", meses: 1 }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("nos dias de tolerância a situação diz até quando pagar", async () => {
    h.conta = conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, plano: "treino", modulos: ["treino"], faixa: "f30",
      situacao: "ativa", teste_ate: null, vence_em: "2026-09-25", tolerancia_dias: 7 });
    h.buscar.mockResolvedValue(status({ precos: precosLegado, valor_mensal: 29.9 }, { ...contaLegado, vence_em: "2026-09-25" }));
    montar();
    expect(await screen.findByText("Venceu em 25/09/2026 · pague até 02/10/2026 para não perder o acesso")).toBeInTheDocument();
  });
});

describe("Configurações › Plano — conta nova (6.5)", () => {
  it("no teste: escolhe o plano e gera o Pix do plano escolhido", async () => {
    h.conta = conta();
    h.buscar.mockResolvedValue(status());
    h.acao.mockResolvedValue({ fatura: { id: "f1", conta_id: "c1", valor: 79.9, status: "pending", forma: "pix", pix_qr: null,
      pix_copia_cola: "00020126PIX", pix_expira_em: PIX_VALE_ATE, pago_em: null, tipo: "pix_avulso", criado_em: "2026-09-29T12:00:00Z" } });
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
    // hml-11: estes testes rodam como a produção (o stub do topo) — sem o resumo antes de pagar
    expect(h.importouResumo).toBe(0);
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
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

// hml-11 (H-28, D5): o resumo dos Termos de assinatura antes de pagar (Decreto 7.962/2013, art. 4º, I) e a frase da renovação nova,
// SÓ no build de staging até a virada, e nunca na versão da Google Play. Cada teste importa a tela de novo com o schema do build
// (fica no FIM do arquivo: depois do resetModules, nenhum teste usa a tela do import de cima).
describe("Configurações › Plano — hml-11: o resumo antes de pagar só no staging", () => {
  async function planoDoBuild(schema: "staging" | "public") {
    vi.stubEnv("VITE_DB_SCHEMA", schema);
    vi.resetModules();
    return (await import("./Plano")).default;
  }
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("staging: o resumo acima dos botões de pagar, com os links, e 'renova todo mês até você cancelar'", async () => {
    const PlanoDoStaging = await planoDoBuild("staging");
    h.conta = conta();
    h.buscar.mockResolvedValue(status());
    montar(PlanoDoStaging);
    const resumo = await waitFor(
      () => {
        const el = document.querySelector('[data-resumo-antes-de-pagar="plano-profissional"]');
        if (!el) throw new Error("o resumo ainda não apareceu");
        return el;
      },
      { timeout: 5000 },
    );
    expect(h.importouResumo).toBe(1);
    expect(resumo.compareDocumentPosition(screen.getByRole("button", { name: /Pagar com Pix/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resumo.querySelector('[data-link-legal="assinatura"]')?.getAttribute("href")).toBe("/assinatura");
    expect(resumo.querySelector('[data-link-legal="politica"]')?.getAttribute("href")).toBe("/privacidade");
    expect(resumo.textContent).toContain("Profissional:");
    expect(resumo.textContent).not.toContain("Aluno sem profissional:");
    const frase = document.querySelector("[data-frase-renovacao]");
    expect(frase?.textContent).toMatch(/^Pix vale 72 h e confirma na hora\. Na cobrança automática a 1ª cobrança é em 13\/10 \(fim do teste\) e renova todo mês até você cancelar\.$/);
    expect(document.body.textContent).not.toContain("sem aviso");
  });

  it("versão da Google Play (staging): nunca o resumo", async () => {
    h.loja = true;
    const PlanoDoStaging = await planoDoBuild("staging");
    h.conta = conta();
    h.buscar.mockResolvedValue(status());
    montar(PlanoDoStaging);
    expect(await screen.findByText(/Teste grátis até 13\/10\/2026/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });

  it("produção: sem o resumo (o import nem acontece) e com a frase de hoje", async () => {
    const PlanoDaProducao = await planoDoBuild("public");
    h.conta = conta();
    h.buscar.mockResolvedValue(status());
    montar(PlanoDaProducao);
    expect(await screen.findByText("Escolha o plano", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/e renova todo mês, sem aviso\.$/)).toBeInTheDocument();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(document.querySelector("[data-frase-renovacao]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });
});
