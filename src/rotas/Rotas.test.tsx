import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Teste de rotas da W1: toda rota antiga do Calc abre a MESMA função dentro da casca nova, as rotas
// novas mostram a tela antiga enquanto a nova não existe (spec 11.1) e os redirecionamentos da 4.8
// valem. As telas antigas viram marcadores (o que importa aqui é QUAL tela abre e em QUAL casca).
const h = vi.hoisted(() => {
  const estado = {
    auth: { user: null as null | { id: string; email: string; user_metadata: Record<string, string> }, loading: false, papel: "aluno", isStaff: false, isMaster: false, signOut: async () => {} },
  };
  const marcador = (id: string) => ({
    default: (props: { userId?: string }) => <div data-testid={id}>{props.userId ? `${id}:${props.userId}` : id}</div>,
  });
  return { estado, marcador };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.estado.auth }));
vi.mock("@/lib/mpClient", () => ({
  invokeMp: vi.fn(async () => ({
    isento: true,
    professor: { id: "p1", nome: "Lucas Ferreira", alunos: 7, status: "ativo" },
    plano: null,
    planos: [],
    travado: false,
    diasAtraso: null,
    hoje: "2026-09-29",
    avisos: [],
  })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: { profile: { nome: "Rafael Moura", idade: 28, altura: 178, created_at: "2026-03-01T12:00:00Z", status: "ativo" } }, error: null })) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(),
  },
}));
// banco principal (W2): sem sessão nele antes da W3 — o sino fica vazio e nada vai à rede
vi.mock("@/integrations/principal/client", () => ({
  principalConfigurado: true,
  principal: { auth: { getSession: async () => ({ data: { session: null } }) }, from: vi.fn() },
}));
vi.mock("@/pages/TreinosPage", () => h.marcador("antiga-treinos"));
vi.mock("@/pages/UserDashboard", () => h.marcador("antiga-avaliacao"));
vi.mock("@/pages/PagamentosPage", () => h.marcador("antiga-pagamentos"));
vi.mock("@/pages/AuthPage", () => h.marcador("antiga-entrada"));
vi.mock("@/pages/Index", () => h.marcador("antiga-calculadora-publica"));
vi.mock("@/pages/PrivacidadePage", () => h.marcador("antiga-privacidade"));
vi.mock("@/pages/admin/AlunosPage", () => h.marcador("antiga-admin-alunos"));
vi.mock("@/pages/admin/TreinosAdminPage", () => h.marcador("antiga-admin-treinos"));
vi.mock("@/pages/admin/CobrancaPage", () => h.marcador("antiga-admin-cobranca"));
vi.mock("@/pages/admin/CalculadoraPage", () => h.marcador("antiga-admin-calculadora"));
vi.mock("@/pages/admin/ConfiguracoesPage", () => h.marcador("antiga-admin-configuracoes"));
vi.mock("@/pages/admin/PlanosPage", () => h.marcador("antiga-admin-planos"));
vi.mock("@/components/AdminUserConfig", () => h.marcador("antiga-configurar-aluno"));
vi.mock("@/pages/master/VisaoGeralPage", () => h.marcador("antiga-master-visao-geral"));
vi.mock("@/pages/master/ProfessoresPage", () => h.marcador("antiga-master-professores"));
vi.mock("@/pages/master/AlunosMasterPage", () => h.marcador("antiga-master-alunos"));
vi.mock("@/pages/master/FinanceiroPage", () => h.marcador("antiga-master-financeiro"));
vi.mock("@/pages/master/PlanosMasterPage", () => h.marcador("antiga-master-planos"));
vi.mock("@/pages/master/IntegracoesPage", () => h.marcador("antiga-master-integracoes"));
vi.mock("@/pages/master/BibliotecaPage", () => h.marcador("antiga-master-biblioteca"));
vi.mock("@/pages/master/ConfiguracoesMasterPage", () => h.marcador("antiga-master-configuracoes"));
vi.mock("@/components/PlanoBloqueado", () => h.marcador("plano-bloqueado"));

import { Rotas } from "./Rotas";

function Onde() {
  const { pathname, search } = useLocation();
  return <output data-testid="onde">{pathname + search}</output>;
}

function abrir(caminho: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}>
        <Rotas />
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const onde = () => screen.getByTestId("onde").textContent;

function logar(papel: "aluno" | "professor" | "master") {
  h.estado.auth = {
    user: { id: `u-${papel}`, email: `${papel}@teste.com`, user_metadata: { full_name: `Pessoa ${papel}` } },
    loading: false,
    papel,
    isStaff: papel !== "aluno",
    isMaster: papel === "master",
    signOut: async () => {},
  };
}

beforeEach(() => {
  localStorage.clear();
  h.estado.auth = { user: null, loading: false, papel: "aluno", isStaff: false, isMaster: false, signOut: async () => {} };
});
afterEach(() => {
  document.documentElement.removeAttribute("data-casca");
});

describe("app do aluno: telas antigas dentro da casca de 5 abas", () => {
  it.each([
    ["/", "/treino", "antiga-treinos"],
    ["/treinos", "/treino", "antiga-treinos"],
    ["/treino", "/treino", "antiga-treinos"],
    ["/avaliacao", "/evolucao", "antiga-avaliacao"],
    ["/evolucao", "/evolucao", "antiga-avaliacao"],
    ["/pagamentos", "/perfil/pagamentos", "antiga-pagamentos"],
  ])("%s → %s (%s)", async (de, para, tela) => {
    logar("aluno");
    abrir(de);
    expect(await screen.findByTestId(tela)).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe(para));
    // a barra de abas da tela 1, com as abas que já têm tela (Treino e Evolução até a W7/W11/W12)
    const barra = document.querySelector("[data-tabbar]")!;
    expect(barra).not.toBeNull();
    expect([...barra.querySelectorAll("[data-aba]")].map((a) => a.textContent)).toEqual(["Treino", "Evolução"]);
  });

  it("aba sem tela nem módulo (Dieta, Perfil) volta para a abertura", async () => {
    logar("aluno");
    abrir("/dieta");
    expect(await screen.findByTestId("antiga-treinos")).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe("/treino"));
  });

  it("aluno não entra no painel nem no master", async () => {
    logar("aluno");
    abrir("/painel/alunos");
    expect(await screen.findByTestId("antiga-treinos", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/treino");
  });
});

describe("entrada: sem login cai no Entrar (a tela de hoje até a W3)", () => {
  it.each([["/"], ["/treino"], ["/login"], ["/entrar"], ["/app/entrar"]])("%s", async (de) => {
    abrir(de);
    expect(await screen.findByTestId("antiga-entrada")).toBeInTheDocument();
    expect(onde()).toMatch(/^\/entrar/);
  });

  it("logado, /entrar volta para o app", async () => {
    logar("aluno");
    abrir("/entrar");
    expect(await screen.findByTestId("antiga-treinos")).toBeInTheDocument();
  });
});

describe("site do profissional: rotas antigas do Calc abrem a mesma função na casca nova", () => {
  it.each([
    ["/admin", "/painel/alunos", "antiga-admin-alunos"],
    ["/admin/alunos", "/painel/alunos", "antiga-admin-alunos"],
    ["/admin/treinos", "/painel/treinos", "antiga-admin-treinos"],
    ["/admin/cobranca", "/painel/financeiro", "antiga-admin-cobranca"],
    ["/admin/calculadora", "/painel/calculadora", "antiga-admin-calculadora"],
    ["/admin/planos", "/painel/configuracoes/plano", "antiga-admin-planos"],
    ["/admin/configuracoes", "/painel/configuracoes/perfil?s=perfil", "antiga-admin-configuracoes"],
    ["/admin/configuracoes?s=convite", "/painel/configuracoes/convite?s=convite", "antiga-admin-configuracoes"],
    ["/admin/configuracoes?s=recebimento", "/painel/configuracoes/recebimento?s=recebimento", "antiga-admin-configuracoes"],
    ["/admin?v=calculator", "/painel/calculadora", "antiga-admin-calculadora"],
    ["/admin?v=treinos&t=biblioteca", "/painel/treinos?t=biblioteca", "antiga-admin-treinos"],
  ])("%s → %s", async (de, para, tela) => {
    logar("professor");
    abrir(de);
    expect(await screen.findByTestId(tela, {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe(para));
    const menu = document.querySelector("[data-menu-lateral]")!;
    expect(menu).not.toBeNull();
    expect([...menu.querySelectorAll("[data-nav]")].map((a) => a.textContent?.replace(/\d+$/, ""))).toEqual([
      "Alunos", "Treinos", "Financeiro", "Configurações", "Calculadora",
    ]);
  });

  it.each([
    ["/admin/alunos/u1", "/painel/alunos/u1?ct=dados", "resumo"],
    ["/admin/alunos/u1/ver", "/painel/alunos/u1?ct=dados", "resumo"],
    ["/admin/alunos/u1?ct=treino&wt=volume", "/painel/alunos/u1/treino?ct=treino&wt=volume", "treino"],
    ["/admin/alunos/u1?ct=historico", "/painel/alunos/u1/treino?ct=historico", "treino"],
    ["/admin/alunos/u1?ct=config", "/painel/alunos/u1/treino?ct=config", "treino"],
    ["/admin/alunos/u1?ct=dobras", "/painel/alunos/u1/avaliacao?ct=dobras", "avaliacao"],
    ["/admin/alunos/u1?ct=registros", "/painel/alunos/u1/avaliacao?ct=registros", "avaliacao"],
    ["/admin/alunos/u1?ct=plano", "/painel/alunos/u1/financeiro?ct=plano", "financeiro"],
    ["/admin/alunos/u1?ct=geral", "/painel/alunos/u1?ct=geral", "resumo"],
    ["/admin?v=config&u=u1&ct=evolucao", "/painel/alunos/u1/avaliacao?ct=evolucao", "avaliacao"],
  ])("Configurar aluno %s → %s (aba %s)", async (de, para, aba) => {
    logar("professor");
    abrir(de);
    expect(await screen.findByTestId("antiga-configurar-aluno", {}, { timeout: 4000 })).toHaveTextContent("u1");
    await waitFor(() => expect(onde()).toBe(para));
    expect(document.querySelector(`[data-aba-aluno="${aba}"]`)?.getAttribute("aria-current")).toBe("page");
    expect([...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"))).toEqual(["resumo", "treino", "avaliacao", "financeiro"]);
  });

  it("profissional abre direto no painel; se escolheu o app de aluno, volta para o app", async () => {
    logar("professor");
    const r = abrir("/");
    expect(await screen.findByTestId("antiga-admin-alunos", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/painel/alunos");
    r.unmount();
    localStorage.setItem("physiq_area", "aluno");
    abrir("/");
    expect(await screen.findByTestId("antiga-treinos")).toBeInTheDocument();
  });

  it("card da conta, card do plano e menu do usuário na casca", async () => {
    logar("professor");
    abrir("/painel/alunos");
    await screen.findByTestId("antiga-admin-alunos", {}, { timeout: 4000 });
    await waitFor(() => expect(document.querySelector("[data-card-plano]")).not.toBeNull());
    expect(document.querySelector("[data-card-conta]")?.textContent).toContain("Lucas Ferreira");
    expect(document.querySelector("[data-card-plano]")?.textContent).toContain("TREINO");
    expect(document.querySelector("[data-menu-lateral] [data-menu-usuario]")?.textContent).toContain("Personal trainer");
  });
});

describe("master: páginas antigas na casca nova", () => {
  it.each([
    ["/master", "/master", "antiga-master-visao-geral"],
    ["/master/professores", "/master/contas", "antiga-master-professores"],
    ["/master/professores?status=ativo", "/master/contas?status=ativo", "antiga-master-professores"],
    ["/master/alunos", "/master/alunos", "antiga-master-alunos"],
    ["/master/financeiro", "/master/financeiro", "antiga-master-financeiro"],
    ["/master/planos", "/master/planos", "antiga-master-planos"],
    ["/master/integracoes", "/master/integracoes", "antiga-master-integracoes"],
    ["/master/biblioteca", "/master/biblioteca", "antiga-master-biblioteca"],
    ["/master/configuracoes", "/master/configuracoes", "antiga-master-configuracoes"],
  ])("%s → %s", async (de, para, tela) => {
    logar("master");
    abrir(de);
    expect(await screen.findByTestId(tela, {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe(para));
    expect(document.querySelector('[data-casca="master"] [data-menu-lateral]')).not.toBeNull();
  });

  it("professor não entra no master", async () => {
    logar("professor");
    abrir("/master/contas");
    expect(await screen.findByTestId("antiga-admin-alunos", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/painel/alunos");
  });
});

describe("páginas públicas (sem login)", () => {
  it.each([
    ["/calculator", "antiga-calculadora-publica"],
    ["/privacidade", "antiga-privacidade"],
    ["/termos", "antiga-privacidade"],
  ])("%s", async (de, tela) => {
    abrir(de);
    expect(await screen.findByTestId(tela)).toBeInTheDocument();
    expect(document.querySelector('[data-casca="publico"]')).not.toBeNull();
  });

  it("endereço que não existe mostra o 404 premium", async () => {
    abrir("/nao-existe");
    expect(await screen.findByText("Página não encontrada")).toBeInTheDocument();
  });
});
