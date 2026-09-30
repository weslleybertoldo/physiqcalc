import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/ui/casca/dadosCasca", () => ({ useDadosCasca: () => h.dados }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isStaff: true, signOut: async () => {} }) }));
vi.mock("@/lib/mpClient", () => ({ invokeMp: vi.fn(async () => null) }));
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
    paginasPainel: { Dashboard: item("paginas", "Dashboard"), Alunos: item("paginas", "Alunos"), Dietas: item("paginas", "Dietas"), Mensagens: item("paginas", "Mensagens") },
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
      <MemoryRouter initialEntries={[caminho]}>
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
    // Dashboard, Alunos (W13), Dietas e Mensagens (novas), + as antigas (Alunos, Treinos, Financeiro, Configurações, Calculadora)
    expect(itens).toEqual(["/painel", "/painel/alunos", "/painel/treinos", "/painel/dietas", "/painel/mensagens", "/painel/financeiro", "/painel/configuracoes", "/painel/calculadora"]);
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

  it("perfil do aluno: Resumo com os cards, KPI no cabeçalho e a aba Treino nova", async () => {
    abrir("/painel/alunos/u1");
    expect(await screen.findByTestId("resumo-CardTreino")).toHaveTextContent("u1");
    expect(screen.getByTestId("resumo-CardDieta")).toBeInTheDocument();
    expect(await screen.findByTestId("kpis-KpiPeso")).toBeInTheDocument();
    const abas = [...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"));
    expect(abas).toEqual(["resumo", "treino", "avaliacao", "financeiro"]);
    fireEvent.click(document.querySelector('[data-aba-aluno="treino"]')!);
    expect(await screen.findByTestId("abasAluno-Treino")).toHaveTextContent("abasAluno:Treino:u1");
  });

  it("Configurações: a aba nova vence a antiga", async () => {
    abrir("/painel/configuracoes");
    expect(await screen.findByTestId("config-Perfil")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-aba-config="perfil"]')?.getAttribute("aria-current")).toBe("page"));
  });
});
