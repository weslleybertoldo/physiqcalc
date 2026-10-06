import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRECOS_PADRAO } from "@/nucleo/cobranca/regras";
import { conta, situacao } from "@/test/fixturesNucleo";

// W1 da loja — o painel do profissional na versão da Google Play: o plano só com a situação (sem preço, sem escolher plano, sem
// Pix/cartão/cobrança automática, sem histórico de faturas), a tela e a faixa do plano vencido sem "Pagar", o "Mudar o plano"
// e a aba Aplicativo (baixar/atualizar o APK) fora. O profissional paga pelo site. Sem a flag, tudo como hoje.
const h = vi.hoisted(() => ({
  loja: false,
  conta: null as unknown,
  ehDono: true,
  buscar: vi.fn(),
  acao: vi.fn(),
}));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehMaster: false, ehDono: h.ehDono }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: situacao(), recarregarSituacao: async () => null, usuario: { id: "u1", email: "dono@teste.com" } }) }));
vi.mock("@/ui/casca/dadosCasca", async (orig) => ({ ...(await orig<typeof import("@/ui/casca/dadosCasca")>()), useDadosCasca: () => ({ ehDono: h.ehDono }) }));
// as abas das Configurações registradas viram uma tela simples (a casca e a regra da aba são o que se testa aqui)
vi.mock("@/rotas/registro", async (orig) => ({
  ...(await orig<typeof import("@/rotas/registro")>()),
  existe: () => true,
  tela: (_grupo: string, arquivo: string) =>
    function TelaFalsa() {
      return <div data-config-aba={arquivo.toLowerCase()}>aba {arquivo}</div>;
    },
}));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: () => <div data-brick-falso>brick</div>, initMercadoPago: () => {} }));
vi.mock("./configuracoes/plano/api", async (original) => ({
  ...(await original<typeof import("./configuracoes/plano/api")>()),
  buscarStatusCobranca: h.buscar,
  acaoCobranca: h.acao,
}));

import Plano from "./configuracoes/Plano";
import ConfiguracoesLayout, { AbaConfiguracoes } from "./configuracoes/ConfiguracoesLayout";
import GatePlano from "./gates/GatePlano";
import FaixaAvisoPlano from "./gates/FaixaAvisoPlano";
import { ModuloForaDoPlano } from "@/ui/casca/ModuloForaDoPlano";

const NA_LOJA_NAO = /R\$|Pague|Pagar|Pix|cartão|Cobrança automática|Escolha o plano|Escolher plano|Mudar o plano|preço/i;

function montar(el: React.ReactNode, caminho = "/painel/configuracoes/plano") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[caminho]}>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const pagina = <div>página do painel</div>;

const fatura = (o: Record<string, unknown> = {}) => ({
  id: "f", conta_id: "c1", tipo: "mensal", valor: 59.9, status: "approved", forma: "pix", mp_payment_id: null, pix_qr: null, pix_copia_cola: null,
  pix_expira_em: null, pago_em: null, plano: "treino_nutricao", faixa: "f10", meses: 1, cobre_de: null, cobre_ate: null, descricao: null,
  criado_em: "2026-09-01T10:00:00Z", ...o,
});

/** a resposta da cobranca-conta (status) — no teste grátis, com um Pix aberto, a cobrança automática e uma fatura paga */
const status = (o: Record<string, unknown> = {}, c: Record<string, unknown> = {}) => ({
  ok: true, ambiente: "staging", simulacao: true, hoje: "2026-10-06",
  conta: { id: "c1", nome: "Consultoria Ferreira", origem: "nova", plano: "treino_nutricao", faixa: "f10", periodicidade: "mensal", situacao: "teste",
    teste_ate: "2026-10-13", vence_em: null, tolerancia_dias: 0, valor_travado: null, regra_pix: "mes", isenta_motivo: null, efetiva: "teste", ...c },
  alunos_ativos: 3, limite_alunos: 10, precos: PRECOS_PADRAO, valor_mensal: 59.9, valor_anual: 599,
  faturas: [fatura({ id: "f1", status: "approved", pago_em: "2026-09-01T10:05:00Z", cobre_de: "2026-09-01", cobre_ate: "2026-10-01" })],
  pix_aberto: fatura({ id: "px1", status: "pending", pix_copia_cola: "000201…", pix_expira_em: new Date(Date.now() + 3_600_000).toISOString() }),
  assinatura: { id: "a1", status: "authorized", valor: 59.9, plano: "treino_nutricao", faixa: "f10", proximo_vencimento: "2026-10-13T12:00:00Z",
    ultimo_pagamento_em: null, sandbox: true, simulada: true, init_point: null },
  ...o,
});

beforeEach(() => {
  h.loja = false;
  h.ehDono = true;
  h.buscar.mockReset();
  h.acao.mockReset();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("Configurações › Plano — W1 da loja", () => {
  it("na loja: só o card com o plano e a situação — sem preço, sem escolher plano, sem Pix/cartão/automática, sem Pix aberto e sem faturas", async () => {
    h.loja = true;
    h.conta = conta();
    h.buscar.mockResolvedValue(status());
    montar(<Plano />);
    expect(await screen.findByText("Teste grátis até 13/10/2026")).toBeInTheDocument();
    expect(screen.getByText("TESTE")).toBeInTheDocument();
    expect(document.querySelector("[data-plano-nome]")).not.toBeNull();
    expect(screen.getByText("Alunos ativos")).toBeInTheDocument();
    for (const sel of ["[data-cartao-escolha]", "[data-botao-pix]", "[data-botao-cartao]", "[data-botao-assinar]", "[data-assinatura]", "[data-preco-de-hoje]",
      "[data-historico-faturas]", "[data-pix-copia-cola]"]) {
      expect(document.querySelector(sel)).toBeNull();
    }
    expect(screen.queryByText("Mensalidade")).toBeNull();
    expect(screen.queryByText(/Histórico|Faturas/i)).toBeNull();
    expect(document.querySelector("[data-plano-conta]")!.textContent).not.toMatch(NA_LOJA_NAO);
    expect(h.acao).not.toHaveBeenCalled();
  });

  it("na loja, vencida (legado Calc com preço de hoje e tolerância): sem 'Preço de hoje mantido' e sem 'pague para liberar'", async () => {
    h.loja = true;
    h.conta = conta({ origem: "legado_calc", regras_legadas: true, plano: "treino", modulos: ["treino"], faixa: "f30", situacao: "vencida", teste_ate: null, vence_em: "2026-09-20", tolerancia_dias: 7 });
    h.buscar.mockResolvedValue(status({ pix_aberto: null, assinatura: null }, { origem: "legado_calc", plano: "treino", faixa: "f30", situacao: "vencida", teste_ate: null,
      vence_em: "2026-09-20", tolerancia_dias: 7, valor_travado: 29.9, regras_legadas: true, efetiva: "vencida" }));
    montar(<Plano />);
    expect(await screen.findByText(/Vencida em 20\/09\/2026 — o painel está travado/)).toBeInTheDocument();
    expect(screen.getByText("painel travado")).toBeInTheDocument();
    expect(screen.getByText(/Tolerância de 7 dias/)).toBeInTheDocument();
    expect(document.querySelector("[data-plano-conta]")!.textContent).not.toMatch(NA_LOJA_NAO);
  });

  it("no site: o valor, a escolha do plano, Pix/cartão e a cobrança automática (igual a hoje)", async () => {
    h.conta = conta();
    h.buscar.mockResolvedValue(status({ assinatura: null, pix_aberto: null }));
    montar(<Plano />);
    expect(await screen.findByText("Mensalidade")).toBeInTheDocument();
    expect(document.querySelector("[data-cartao-escolha]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Pagar com Pix/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cartão à vista/ })).toBeInTheDocument();
    expect(document.querySelector("[data-historico-faturas]")).not.toBeNull();
  });
});

describe("plano vencido (GatePlano › TelaPlanoVencido) — W1 da loja", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T15:00:00Z"));
  });

  it("na loja: 'Seu plano não está ativo', sem 'Pagar agora', sem o valor e sem as formas de pagar", () => {
    h.loja = true;
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-01", valor_mensal: 59.9 });
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/alunos");
    expect(screen.queryByText("página do painel")).toBeNull();
    expect(screen.getByText("Seu plano venceu em 01/10/2026")).toBeInTheDocument();
    expect(screen.getByText(/Seu plano não está ativo\. O painel volta quando o plano estiver ativo de novo\. Nada foi apagado\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar agora/ })).toBeNull();
    expect(screen.queryByText("Mensalidade")).toBeNull();
    expect(document.querySelector("[data-plano-vencido]")!.textContent).not.toMatch(NA_LOJA_NAO);
    expect(screen.getByText(/Seus alunos continuam usando o app/)).toBeInTheDocument();
  });

  it("na loja, o membro (não dono) continua com o 'Fale com <dono>'", () => {
    h.loja = true;
    h.ehDono = false;
    h.conta = conta({ situacao: "vencida", teste_ate: "2026-09-20", vence_em: null, papeis: ["personal"], dono_nome: "Lucas Ferreira" });
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/alunos");
    expect(screen.getByText("Fale com Lucas Ferreira.")).toBeInTheDocument();
    expect(document.querySelector("[data-plano-vencido]")!.textContent).not.toMatch(NA_LOJA_NAO);
  });

  it("no site: 'Pagar agora', o valor e 'Pix, cartão ou automático' (igual a hoje)", () => {
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-01", valor_mensal: 59.9 });
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/alunos");
    expect(screen.getByRole("button", { name: /Pagar agora/ })).toBeInTheDocument();
    expect(screen.getByText("Pix, cartão ou automático")).toBeInTheDocument();
  });
});

describe("faixa de aviso do plano (FaixaAvisoPlano) — W1 da loja", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T15:00:00Z"));
  });

  it("na loja: o aviso neutro, sem o valor e sem 'Pagar'/'Escolher plano' (o X continua)", () => {
    h.loja = true;
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-09", valor_mensal: 59.9 });
    const r = montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>, "/painel/alunos");
    expect(screen.getByText("Seu plano vence em 3 dias (09/10).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar|Escolher plano/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar o aviso" })).toBeInTheDocument();
    r.unmount();
    h.conta = conta({ situacao: "teste", teste_ate: "2026-10-07" });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>, "/painel/alunos");
    expect(screen.getByText("Seu teste grátis termina amanhã (07/10).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar|Escolher plano/ })).toBeNull();
  });

  it("no site: o valor e o 'Pagar' (igual a hoje)", () => {
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-09", valor_mensal: 59.9 });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>, "/painel/alunos");
    expect(screen.getByText(/Seu plano de R\$\s?59,90 vence em 3 dias \(09\/10\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
  });
});

describe("módulo fora do plano e a aba Aplicativo — W1 da loja", () => {
  it("ModuloForaDoPlano: na loja sem 'Mudar o plano'; no site com", () => {
    h.loja = true;
    const r = montar(<ModuloForaDoPlano modulo="nutricao" ehDono />, "/painel/dietas");
    expect(screen.queryByRole("link", { name: "Mudar o plano" })).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar ao painel" })).toBeInTheDocument();
    r.unmount();
    h.loja = false;
    montar(<ModuloForaDoPlano modulo="nutricao" ehDono />, "/painel/dietas");
    expect(screen.getByRole("link", { name: "Mudar o plano" })).toBeInTheDocument();
  });

  it("Configurações: na loja sem a aba Aplicativo — e o link direto cai na 1ª aba; no site a aba está lá", async () => {
    h.loja = true;
    const rotas = (
      <Routes>
        <Route path="/painel/configuracoes" element={<ConfiguracoesLayout />}>
          <Route path=":aba" element={<AbaConfiguracoes />} />
        </Route>
        <Route path="*" element={<div>outra</div>} />
      </Routes>
    );
    const r = montar(rotas, "/painel/configuracoes/aplicativo");
    expect(document.querySelector('[data-aba-config="aplicativo"]')).toBeNull();
    expect(document.querySelector('[data-aba-config="perfil"]')).not.toBeNull();
    expect(await screen.findByText(/Perfil/, { selector: "[aria-current=page]" })).toBeInTheDocument();
    expect(document.querySelector('[data-config-aba="aplicativo"]')).toBeNull();
    r.unmount();
    h.loja = false;
    montar(rotas, "/painel/configuracoes/perfil");
    expect(document.querySelector('[data-aba-config="aplicativo"]')).not.toBeNull();
  });
});
