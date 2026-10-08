import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // hml-11 (D5): os testes de sempre rodam como a produção — sem o resumo antes de começar. O Vitest roda como o staging
  // (vitest.config.ts) e a condição do Vite é lida quando a tela carrega: o schema troca ANTES dos imports.
  vi.stubEnv("VITE_DB_SCHEMA", "public");
  return {
    entrar: vi.fn(),
    plano: vi.fn(),
    recarregar: vi.fn(async () => null),
    navegar: vi.fn(),
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
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn() } }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ situacao: { sem_nada: true, nome: "Ana Souza" }, usuario: { id: "u1", email: "ana@gmail.com" }, sair: async () => {}, recarregarSituacao: h.recarregar }),
}));
vi.mock("@/app-aluno/sozinho/api", async (orig) => ({
  ...(await orig<typeof import("@/app-aluno/sozinho/api")>()),
  buscarMeuPlano: () => h.plano(),
  entrarSemProfissional: (o: string, p: string, extra?: unknown) => h.entrar(o, p, extra),
}));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => h.navegar }));

import TreinarSemProfissional from "./TreinarSemProfissional";
import BoasVindas from "../BoasVindas";

const PLANOS = {
  teste_dias: 7,
  planos: [
    { codigo: "app_treino", nome: "Treino", valor: 29.9, modulos: ["treino"], descricao: "Monte o seu treino ou use um treino pronto." },
    { codigo: "app_treino_alimentacao", nome: "Treino + Alimentação", valor: 49.9, modulos: ["treino", "nutricao"], descricao: "Mais os pratos prontos." },
  ],
  matricula: null,
  com_profissional: false,
};

const abrir = (el: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.stubEnv("VITE_DB_SCHEMA", "public");
  h.loja = false;
  h.importouResumo = 0;
  h.entrar.mockReset();
  h.plano.mockReset();
  h.recarregar.mockClear();
  h.navegar.mockReset();
  h.plano.mockResolvedValue(PLANOS);
});

describe("Boas-vindas › Treinar sem profissional (W7b)", () => {
  it("aparece entre o código e o 'Sou profissional', com os dias grátis e o menor preço", async () => {
    abrir(<BoasVindas />);
    expect(await screen.findByText("Treinar sem profissional")).toBeInTheDocument();
    const cartoes = [...document.querySelectorAll("[data-onboarding]")].map((e) => e.getAttribute("data-onboarding"));
    expect(cartoes).toEqual(["TenhoCodigo", "TreinarSemProfissional", "CriarConta"]);
    expect(await screen.findByText(/a partir de R\$ 29,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText("7 DIAS GRÁTIS")).toBeInTheDocument();
  });

  it("objetivo + plano → entra no app com os dias grátis e abre os treinos prontos", async () => {
    h.entrar.mockResolvedValue({ paciente_id: "p1", teste_ate: "2026-10-07T02:59:59Z", ja_era: false });
    abrir(<TreinarSemProfissional />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    expect(await screen.findByText("R$ 49,90/mês")).toBeInTheDocument();
    // sem objetivo: pede
    fireEvent.click(screen.getByRole("button", { name: /Começar os 7 dias grátis/ }));
    expect(await screen.findByText("Escolha o seu objetivo.")).toBeInTheDocument();
    expect(h.entrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /Ganhar massa/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Treino \+ Alimentação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Começar os 7 dias grátis/ }));
    // hml-12: a produção manda a RPC de 2 argumentos (sem a data e sem o consentimento)
    await waitFor(() => expect(h.entrar).toHaveBeenCalledWith("ganhar_massa", "app_treino_alimentacao", undefined));
    expect(await screen.findByText(/Pronto! Grátis até 06\/10/)).toBeInTheDocument();
    expect(h.recarregar).toHaveBeenCalled();
    await waitFor(() => expect(h.navegar).toHaveBeenCalledWith("/perfil/treinos-prontos?inicio=1", { replace: true }), { timeout: 3000 });
    // hml-11: estes testes rodam como a produção (o stub do topo) — sem o resumo antes de começar
    expect(h.importouResumo).toBe(0);
  });

  it("recusa do banco vira a frase (ex.: já está com um profissional)", async () => {
    const { ErroApp } = await import("@/app-aluno/sozinho/api");
    h.entrar.mockRejectedValue(new ErroApp("com_profissional"));
    abrir(<TreinarSemProfissional />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Emagrecer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Começar os 7 dias grátis/ }));
    expect(await screen.findByText("Você já está com um profissional — o seu plano é o dele.")).toBeInTheDocument();
    expect(h.navegar).not.toHaveBeenCalled();
  });
});

// hml-11 (H-28, D5): o resumo dos Termos de assinatura antes de "Começar os 7 dias grátis" (Decreto 7.962/2013, art. 4º, I), SÓ no
// build de staging até a virada, e nunca na versão da Google Play. Cada teste importa a tela de novo com o schema do build (fica no FIM
// do arquivo: depois do resetModules, nenhum teste usa a tela do import de cima).
describe("Treinar sem profissional — hml-11: o resumo antes de começar só no staging", () => {
  async function telaDoBuild(schema: "staging" | "public") {
    vi.stubEnv("VITE_DB_SCHEMA", schema);
    vi.resetModules();
    return (await import("./TreinarSemProfissional")).default;
  }
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("staging: o resumo do plano do app logo antes de 'Começar os 7 dias grátis', com os links", async () => {
    const Tela = await telaDoBuild("staging");
    abrir(<Tela />);
    // fechado (antes de "Quero treinar sozinho"), não há o que pagar: sem o resumo
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    const resumo = await waitFor(
      () => {
        const el = document.querySelector('[data-resumo-antes-de-pagar="sem-profissional"]');
        if (!el) throw new Error("o resumo ainda não apareceu");
        return el;
      },
      { timeout: 5000 },
    );
    expect(h.importouResumo).toBe(1);
    const comecar = screen.getByRole("button", { name: /Começar os 7 dias grátis/ });
    expect(resumo.compareDocumentPosition(comecar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resumo.textContent?.replace(/\u00a0/g, " ")).toContain("Treino, R$ 29,90 por mês, ou Treino + Alimentação, R$ 49,90 por mês");
    expect(resumo.textContent).not.toContain("Profissional:");
    expect(resumo.querySelector('[data-link-legal="assinatura"]')?.getAttribute("target")).toBe("_blank");
  });

  it("versão da Google Play (staging): nunca o resumo", async () => {
    h.loja = true;
    const Tela = await telaDoBuild("staging");
    abrir(<Tela />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    expect(await screen.findByText("R$ 49,90/mês", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });

  it("produção: sem o resumo (o import nem acontece)", async () => {
    const Tela = await telaDoBuild("public");
    abrir(<Tela />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    expect(await screen.findByText("R$ 49,90/mês", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Começar os 7 dias grátis/ })).toBeInTheDocument();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });
});

// hml-12 (H-30, P4): a data de nascimento (18+) e o consentimento dos dados de saúde, em destaque, antes de começar o plano do app — SÓ
// no build de staging até a virada; com eles vai a RPC de 5 argumentos. Na produção, igual a hoje (fica no FIM do arquivo, pelo
// resetModules, como o bloco da hml-11).
describe("Treinar sem profissional — hml-12: a data (18+) e o consentimento de saúde só no staging", () => {
  async function telaDoBuild(schema: "staging" | "public") {
    vi.stubEnv("VITE_DB_SCHEMA", schema);
    vi.resetModules();
    return (await import("./TreinarSemProfissional")).default;
  }
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  const ano = new Date().getFullYear();
  const data = () => document.querySelector("[data-campo-nascimento] input[type='date']") as HTMLInputElement;
  const comecar = () => screen.getByRole("button", { name: /Começar os 7 dias grátis/ }) as HTMLButtonElement;

  async function abrirNoStaging() {
    const { VERSAO_TEXTOS } = await import("@/publico/legal/versao");
    const Tela = await telaDoBuild("staging");
    abrir(<Tela />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    await waitFor(
      () => {
        if (!document.querySelector('[data-consentimento-saude="app"]') || !data()) throw new Error("a data e o consentimento ainda não apareceram");
      },
      { timeout: 5000 },
    );
    return VERSAO_TEXTOS;
  }

  it("staging: a data e o consentimento antes do resumo; 'Começar' travado até as 2; 17 anos → a frase, sem o banco", async () => {
    await abrirNoStaging();
    const consentimento = document.querySelector('[data-consentimento-saude="app"]')!;
    // a ordem: a data, o consentimento em destaque, o resumo antes de pagar (hml-11) e o "Começar"
    const resumo = await waitFor(
      () => {
        const el = document.querySelector('[data-resumo-antes-de-pagar="sem-profissional"]');
        if (!el) throw new Error("o resumo ainda não apareceu");
        return el;
      },
      { timeout: 5000 },
    );
    expect(data().compareDocumentPosition(consentimento) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(consentimento.compareDocumentPosition(resumo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resumo.compareDocumentPosition(comecar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(await screen.findByRole("radio", { name: /Emagrecer/ }));
    expect(comecar().disabled).toBe(true);
    fireEvent.change(data(), { target: { value: `${ano - 17}-01-01` } });
    expect(comecar().disabled).toBe(true); // falta o consentimento
    fireEvent.click(document.querySelector("[data-consentimento-saude-caixa]")!);
    expect(comecar().disabled).toBe(false);
    fireEvent.click(comecar());
    expect(await screen.findByText(
      "O plano sem profissional é para maiores de 18 anos. Se você tem 16 ou 17 anos, treine com um profissional: peça o código a ele.",
    )).toBeInTheDocument();
    expect(h.entrar).not.toHaveBeenCalled();
  });

  it("staging: 18+ e o consentimento → a RPC de 5 argumentos (a data, a versão do texto lido e a origem)", async () => {
    h.entrar.mockResolvedValue({ paciente_id: "p1", teste_ate: "2026-10-15T02:59:59Z", ja_era: false });
    const versao = await abrirNoStaging();
    fireEvent.click(await screen.findByRole("radio", { name: /Ganhar massa/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Treino \+ Alimentação/ }));
    fireEvent.change(data(), { target: { value: `${ano - 30}-05-20` } });
    fireEvent.click(document.querySelector("[data-consentimento-saude-caixa]")!);
    fireEvent.click(comecar());
    await waitFor(() =>
      expect(h.entrar).toHaveBeenCalledWith("ganhar_massa", "app_treino_alimentacao", {
        nascimento: `${ano - 30}-05-20`,
        consentimento: versao,
        origem: "site",
      }),
    );
    expect(await screen.findByText(/Pronto! Grátis até/)).toBeInTheDocument();
  });

  it("staging: o banco recusa (ex.: o consentimento de outra versão) → a frase", async () => {
    await abrirNoStaging();
    // o ErroApp do módulo que a tela importou (depois do resetModules)
    const { ErroApp } = await import("@/app-aluno/sozinho/api");
    h.entrar.mockRejectedValue(new ErroApp("sem_consentimento_saude"));
    fireEvent.click(await screen.findByRole("radio", { name: /Emagrecer/ }));
    fireEvent.change(data(), { target: { value: `${ano - 30}-05-20` } });
    fireEvent.click(document.querySelector("[data-consentimento-saude-caixa]")!);
    fireEvent.click(comecar());
    expect(await screen.findByText("Marque o consentimento dos seus dados de saúde para começar.")).toBeInTheDocument();
  });

  it("produção: igual a hoje — sem a data e sem o consentimento; a RPC de 2 argumentos", async () => {
    h.entrar.mockResolvedValue({ paciente_id: "p1", teste_ate: "2026-10-15T02:59:59Z", ja_era: false });
    const Tela = await telaDoBuild("public");
    abrir(<Tela />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Emagrecer/ }, { timeout: 5000 }));
    expect(document.querySelector("[data-consentimento-saude]")).toBeNull();
    expect(document.querySelector("[data-campo-nascimento]")).toBeNull();
    expect(comecar().disabled).toBe(false);
    fireEvent.click(comecar());
    await waitFor(() => expect(h.entrar).toHaveBeenCalledWith("emagrecer", "app_treino", undefined));
  });
});
