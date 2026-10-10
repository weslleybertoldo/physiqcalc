import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Pontos de extensão do site do profissional (spec 11.1): páginas, contadores do menu, fontes da busca,
// travas, abas/cards/KPIs do perfil do aluno e abas das Configurações. Registro falso: as telas "novas"
// das próximas worktrees viram marcadores.
const h = vi.hoisted(() => ({
  dados: {
    carregando: false,
    usuario: { id: "p1", nome: "Lucas Ferreira", email: "lucas@x.com", fotoUrl: null },
    ehProfissional: true,
    ehMaster: false,
    ehDono: true,
    papelRotulo: "Personal trainer",
    modulosAluno: ["treino"],
    conta: { id: "c1", nome: "Consultoria Ferreira", profissionais: 2, fotoUrl: null, modulos: ["treino", "nutricao"] },
    contas: [],
    plano: { nome: "Plano Treino + Nutrição", modulos: ["treino", "nutricao"], linha: "Renova em 12/08 · cartão", tom: "ok" },
    contadores: { Alunos: 132 },
  },
  // hml-08: o site (o master abre); o app (APK/AAB) não
  site: true,
}));

vi.mock("@/ui/casca/dadosCasca", () => ({ useDadosCasca: () => h.dados }));
vi.mock("@/lib/plataforma", () => ({ BUILD_DO_APP: false, masterNesteAparelho: () => h.site }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isStaff: true, signOut: async () => {} }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn(async () => ({ data: { profile: { nome: "Rafael Moura" } }, error: null })) } } }));
vi.mock("@/integrations/principal/client", () => ({ principalConfigurado: false, principal: {} }));
vi.mock("@/rotas/registro", async () => {
  const { lazy } = await import("react");
  const item = (grupo: string, nome: string) => ({
    nome,
    caminho: `/src/${grupo}/${nome}.tsx`,
    carregar: async () => ({ default: () => null }),
    Componente: lazy(async () => ({ default: (p: { alunoId?: string }) => <div data-testid={`${grupo}-${nome}`}>{`${grupo}:${nome}${p.alunoId ? `:${p.alunoId}` : ""}`}</div> })),
  });
  const registro: Record<string, Record<string, ReturnType<typeof item>>> = {
    paginasPainel: { Dashboard: item("paginas", "Dashboard"), Alunos: item("paginas", "Alunos"), Treinos: item("paginas", "Treinos"), Dietas: item("paginas", "Dietas"), Mensagens: item("paginas", "Mensagens"), Financeiro: item("paginas", "Financeiro"),
      // W26: as 4 Ferramentas são páginas novas
      Modelos: item("paginas", "Modelos"), Impressos: item("paginas", "Impressos"), Calculadora: item("paginas", "Calculadora"), Lixeira: item("paginas", "Lixeira") },
    abasAluno: { Treino: item("abasAluno", "Treino") },
    resumoAluno: { CardTreino: item("resumo", "CardTreino"), CardDieta: item("resumo", "CardDieta") },
    kpisAluno: { KpiPeso: item("kpis", "KpiPeso") },
    abasConfig: { Perfil: item("config", "Perfil") },
    cabecalhoAluno: {},
    editoresAluno: {},
  };
  return {
    registro,
    existe: (g: string, n: string) => Boolean(registro[g]?.[n]),
    tela: (g: string, n: string) => registro[g]?.[n]?.Componente ?? null,
    listar: (g: string) => Object.values(registro[g] ?? {}),
    gatesPainel: [{ nome: "FaixaAvisoPlano", Gate: ({ children }: { children: ReactNode }) => <><div data-testid="faixa-plano">Seu plano vence em 2 dias</div>{children}</> }],
    contadoresPainel: { Mensagens: () => 3 },
    fontesBusca: { Alunos: ({ termo }: { termo: string }) => <div data-testid="fonte-alunos">fonte alunos: {termo || "(vazio)"}</div> },
  };
});

import RotasPainel from "./RotasPainel";

// o cmdk (paleta da busca) usa ResizeObserver e scrollIntoView, que o jsdom não tem
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

function abrir(caminho: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
        <Routes>
          <Route path="/painel/*" element={<RotasPainel />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("site do profissional: páginas e peças registradas entram sozinhas", () => {
  it("Dashboard novo abre em /painel; menu com os módulos da conta, contadores e a trava/faixa", async () => {
    abrir("/painel");
    expect(await screen.findByTestId("paginas-Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("faixa-plano")).toBeInTheDocument();
    const menu = document.querySelector("[data-menu-lateral]")!;
    const itens = [...menu.querySelectorAll("[data-nav]")].map((a) => a.getAttribute("data-nav"));
    // Dashboard, Alunos (W13), Treinos (W23), Dietas, Mensagens e Financeiro (W19) (novas), Configurações e as 4 Ferramentas (W26)
    expect(itens).toEqual(["/painel", "/painel/alunos", "/painel/treinos", "/painel/dietas", "/painel/mensagens", "/painel/financeiro", "/painel/configuracoes",
      "/painel/modelos", "/painel/impressos", "/painel/calculadora", "/painel/lixeira"]);
    expect(menu.querySelector('[data-nav="/painel/alunos"] [data-contador]')?.textContent).toBe("132");
    const msg = menu.querySelector('[data-nav="/painel/mensagens"] [data-contador]')!;
    expect(msg.textContent).toBe("3");
    expect(msg.className).toContain("bg-violeta");
    expect(document.querySelector("[data-card-conta]")?.textContent).toContain("2 profissionais");
    expect(document.querySelector("[data-card-plano]")?.textContent).toContain("NUTRIÇÃO");
  });

  it("busca Ctrl K mostra as páginas e as fontes registradas", async () => {
    abrir("/painel");
    await screen.findByTestId("paginas-Dashboard");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByTestId("fonte-alunos")).toBeInTheDocument();
    expect(document.querySelector("[data-paleta-busca]")?.textContent).toContain("Dietas");
  });

  it("perfil do aluno: Resumo com os cards, KPI no cabeçalho e a aba Treino registrada (W28: sem o Configurar aluno antigo nas outras)", async () => {
    abrir("/painel/alunos/u1");
    expect(await screen.findByTestId("resumo-CardTreino")).toHaveTextContent("u1");
    expect(screen.getByTestId("resumo-CardDieta")).toBeInTheDocument();
    expect(await screen.findByTestId("kpis-KpiPeso")).toBeInTheDocument();
    const abas = [...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"));
    expect(abas).toEqual(["resumo", "treino"]);
    fireEvent.click(document.querySelector('[data-aba-aluno="treino"]')!);
    expect(await screen.findByTestId("abasAluno-Treino")).toHaveTextContent("abasAluno:Treino:u1");
  });

  it("Configurações: abre na aba registrada", async () => {
    abrir("/painel/configuracoes");
    expect(await screen.findByTestId("config-Perfil")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-aba-config="perfil"]')?.getAttribute("aria-current")).toBe("page"));
  });
});

// hml-08 (H-22): o painel master fica só no site — no app, o menu do usuário fica sem o "Master"
describe("menu do usuário: o Master só no site (hml-08)", () => {
  afterEach(() => {
    h.dados.ehMaster = false;
    h.site = true;
  });

  // as ações do menu do usuário também entram na busca Ctrl K (grupo "Conta")
  async function acoesNaBusca(): Promise<string[]> {
    abrir("/painel");
    await screen.findByTestId("paginas-Dashboard");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByTestId("fonte-alunos");
    return [...document.querySelectorAll("[data-paleta-busca] [cmdk-item]")].map((e) => e.textContent ?? "");
  }

  it("site: a conta master tem o item Master", async () => {
    h.dados.ehMaster = true;
    expect(await acoesNaBusca()).toEqual(expect.arrayContaining(["Meu app de aluno", "Master", "Sair"]));
  });

  it("app: o item Master some, mesmo para a conta master", async () => {
    h.dados.ehMaster = true;
    h.site = false;
    const itens = await acoesNaBusca();
    expect(itens).toEqual(expect.arrayContaining(["Meu app de aluno", "Sair"]));
    expect(itens).not.toContain("Master");
  });
});
