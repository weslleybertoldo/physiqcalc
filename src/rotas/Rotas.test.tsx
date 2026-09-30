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
    // W3: login único — o login é o do banco principal (useSessao) e a situação vem da minha_situacao()
    sessao: { usuario: null as null | { id: string; email: string; user_metadata: Record<string, string> }, situacao: null as null | Record<string, unknown> },
  };
  const marcador = (id: string) => ({
    default: (props: { userId?: string }) => <div data-testid={id}>{props.userId ? `${id}:${props.userId}` : id}</div>,
  });
  return { estado, marcador };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.estado.auth }));
vi.mock("@/nucleo/sessao", () => ({
  SessaoProvider: ({ children }: { children: unknown }) => children,
  useSessao: () => ({
    pronto: true,
    usuario: h.estado.sessao.usuario,
    sessao: null,
    situacao: h.estado.sessao.situacao,
    carregandoSituacao: false,
    erroSituacao: false,
    treino: { estado: "pronto", erro: null },
    senhaTrocada: false,
    entrarComGoogle: async () => ({}),
    entrarComEmail: async () => ({}),
    sair: async () => {},
    recarregarSituacao: async () => null,
    tentarTreinoDeNovo: () => {},
    vincularCodigo: async () => ({ ok: false }),
    marcarAvisoMudanca: async () => {},
  }),
}));
vi.mock("@/lib/mpClient", () => ({
  lerStatusCache: () => null,
  statusLeve: vi.fn(async () => ({ mensalidade: null, emDia: true, pagoAte: null, mesRef: "2026-09", mesLabel: "setembro" })),
  mensalidadePendente: () => false,
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
  PRINCIPAL_SCHEMA: "staging",
  principal: { auth: { getSession: async () => ({ data: { session: null } }) }, from: vi.fn() },
}));
// W8: a aba Treino é a nova (src/app-aluno/abas/Treino.tsx, pelo registro) — a TreinosPage saiu
vi.mock("@/app-aluno/abas/Treino", () => h.marcador("aba-treino"));
// W10: a aba Evolução é a nova (src/app-aluno/abas/Evolucao.tsx, pelo registro) — o UserDashboard saiu
vi.mock("@/app-aluno/abas/Evolucao", () => h.marcador("aba-evolucao"));
// W12: o Início (src/app-aluno/abas/Inicio.tsx) é a tela de abertura do app
vi.mock("@/app-aluno/abas/Inicio", () => h.marcador("aba-inicio"));
vi.mock("@/pages/PagamentosPage", () => h.marcador("antiga-pagamentos"));
vi.mock("@/pages/Index", () => h.marcador("antiga-calculadora-publica"));
vi.mock("@/pages/PrivacidadePage", () => h.marcador("antiga-privacidade"));
// W13: a página Alunos é a nova (src/painel/paginas/Alunos.tsx, pelo registro) — a AlunosPage do Calc saiu
vi.mock("@/painel/paginas/Alunos", () => h.marcador("pagina-alunos"));
vi.mock("@/pages/admin/TreinosAdminPage", () => h.marcador("antiga-admin-treinos"));
vi.mock("@/pages/admin/CobrancaPage", () => h.marcador("antiga-admin-cobranca"));
vi.mock("@/pages/admin/CalculadoraPage", () => h.marcador("antiga-admin-calculadora"));
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

function conta(nome: string) {
  return {
    id: "c-1", nome, origem: "legado_calc", plano: "treino", modulos: ["treino"], faixa: "f10", periodicidade: "mensal",
    situacao: "isenta", teste_ate: null, vence_em: null, tolerancia_dias: 7, cobranca_legada: true, isenta_motivo: "master",
    alunos_bloqueados_em: null, alunos_bloqueados_msg: null, dono_id: "u-professor", dono_nome: nome, membro_id: "m-1",
    papeis: ["dono", "personal"], codigo_convite: "PROF-LUCAS-FERREIRA", profissionais: 1, alunos_ativos: 7, limite_alunos: null,
  };
}

function logar(papel: "aluno" | "professor" | "master") {
  const user = { id: `u-${papel}`, email: `${papel}@teste.com`, user_metadata: { full_name: `Pessoa ${papel}` } };
  h.estado.auth = { user, loading: false, papel, isStaff: papel !== "aluno", isMaster: papel === "master", signOut: async () => {} };
  h.estado.sessao = {
    usuario: user,
    situacao: {
      versao: 1, user_id: user.id, email: user.email, nome: `Pessoa ${papel}`, foto_url: null, master: papel === "master",
      papel_legado: null, calc: true, contas: papel === "aluno" ? [] : [conta(papel === "master" ? "Master Teste" : "Lucas Ferreira")],
      matriculas: papel === "aluno"
        ? [{ id: "p-1", conta_id: "c-1", conta_nome: "Lucas Ferreira", conta_origem: "legado_calc", ativo: true, origem: "calc", modulos: ["treino"],
             bloqueada: false, bloqueio_msg: null, bloqueado_por_pagamento: false, conta_alunos_bloqueados_em: null,
             conta_alunos_bloqueados_msg: null, personal: { id: "u-professor", nome: "Lucas Ferreira" }, nutricionista: null }]
        : [],
      modulos_aluno: ["treino"], precisa_treino: true, sem_nada: false, legado_nutri: null, aviso_mudanca: null, gerado_em: "2026-09-29T09:00:00Z",
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  h.estado.auth = { user: null, loading: false, papel: "aluno", isStaff: false, isMaster: false, signOut: async () => {} };
  h.estado.sessao = { usuario: null, situacao: null };
});
afterEach(() => {
  document.documentElement.removeAttribute("data-casca");
});

describe("app do aluno: telas antigas dentro da casca de 5 abas", () => {
  it.each([
    ["/", "/", "aba-inicio"],
    ["/treinos", "/treino", "aba-treino"],
    ["/treino", "/treino", "aba-treino"],
    ["/avaliacao", "/evolucao", "aba-evolucao"],
    ["/evolucao", "/evolucao", "aba-evolucao"],
  ])("%s → %s (%s)", async (de, para, tela) => {
    logar("aluno");
    abrir(de);
    expect(await screen.findByTestId(tela)).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe(para));
    // a barra de abas da tela 1 do aluno só do Treino (W12: Início · Treino · Evolução · Perfil; a Dieta é do módulo Nutrição)
    const barra = document.querySelector("[data-tabbar]")!;
    expect(barra).not.toBeNull();
    expect([...barra.querySelectorAll("[data-aba]")].map((a) => a.textContent)).toEqual(["Início", "Treino", "Evolução", "Perfil"]);
  });

  // W6: Perfil › Pagamentos é a tela nova (src/app-aluno/perfil/Pagamentos.tsx) — o /pagamentos e o /app/recibos caem nela
  it.each([["/pagamentos"], ["/app/recibos"], ["/perfil/pagamentos"]])("%s → /perfil/pagamentos (tela nova da W6)", async (de) => {
    logar("aluno");
    abrir(de);
    await waitFor(() => expect(document.querySelector("[data-pagina-pagamentos]")).not.toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(onde()).toBe("/perfil/pagamentos"));
    expect(screen.queryByTestId("antiga-pagamentos")).toBeNull();
  });

  it("aba sem o módulo do aluno (Dieta para o aluno só do Treino) volta para a abertura (o Início, W12)", async () => {
    logar("aluno");
    abrir("/dieta");
    expect(await screen.findByTestId("aba-inicio")).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe("/"));
  });

  it("aluno não entra no painel nem no master", async () => {
    logar("aluno");
    abrir("/painel/alunos");
    expect(await screen.findByTestId("aba-inicio", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/");
  });
});

describe("entrada: sem login cai no Entrar (a tela nova da W3, login único)", () => {
  it.each([["/"], ["/treino"], ["/login"], ["/entrar"]])("%s", async (de) => {
    abrir(de);
    expect(await screen.findByText("Entrar com Google", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(document.querySelector("[data-entrada]")).not.toBeNull();
    expect(onde()).toMatch(/^\/entrar/);
  });

  it("/entrar/email (e o /app/entrar do Nutri) abre o e-mail e senha; /boas-vindas sem login volta para o Entrar", async () => {
    const r = abrir("/entrar/email");
    expect(await screen.findByText("E-mail e senha", {}, { timeout: 4000 })).toBeInTheDocument();
    r.unmount();
    const r2 = abrir("/app/entrar");
    expect(await screen.findByText("E-mail e senha", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/entrar/email");
    r2.unmount();
    abrir("/boas-vindas");
    expect(await screen.findByText("Entrar com Google", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/entrar");
  });

  it("logado sem conta, sem matrícula e sem convite: Boas-vindas com o código do profissional", async () => {
    logar("aluno");
    h.estado.sessao.situacao = { ...h.estado.sessao.situacao!, calc: false, matriculas: [], modulos_aluno: [], precisa_treino: false, sem_nada: true };
    abrir("/entrar");
    expect(await screen.findByText("Tenho um código do meu profissional", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/boas-vindas");
    // W4: o "Sou profissional" abriu (antes: "EM BREVE")
    expect(await screen.findByText("14 DIAS GRÁTIS")).toBeInTheDocument();
    expect(screen.queryByText("EM BREVE")).toBeNull();
  });

  it("logado, /entrar volta para o app (o Início, W12)", async () => {
    logar("aluno");
    abrir("/entrar");
    expect(await screen.findByTestId("aba-inicio")).toBeInTheDocument();
    expect(onde()).toBe("/");
  });
});

describe("site do profissional: rotas antigas do Calc abrem a mesma função na casca nova", () => {
  it.each([
    ["/admin", "/painel/alunos", "pagina-alunos"],
    ["/admin/alunos", "/painel/alunos", "pagina-alunos"],
    ["/admin/treinos", "/painel/treinos", "antiga-admin-treinos"],
    ["/admin/cobranca", "/painel/financeiro", "antiga-admin-cobranca"],
    ["/admin/calculadora", "/painel/calculadora", "antiga-admin-calculadora"],
    ["/admin/planos", "/painel/configuracoes/plano", "antiga-admin-planos"],
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

  // W5: Perfil e Convite ganharam as abas novas (src/painel/configuracoes/{Perfil,Convite}.tsx) e a W6 o Recebimento — o
  // link antigo cai nelas (a Configurações antiga do Calc saiu)
  it.each([
    ["/admin/configuracoes", "/painel/configuracoes/perfil", "perfil"],
    ["/admin/configuracoes?s=convite", "/painel/configuracoes/convite?s=convite", "convite"],
    ["/admin/configuracoes?s=recebimento", "/painel/configuracoes/recebimento?s=recebimento", "recebimento"],
  ])("%s → %s (aba nova)", async (de, para, aba) => {
    logar("professor");
    abrir(de);
    await waitFor(() => expect(document.querySelector(`[data-config-aba='${aba}']`)).not.toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(onde()).toBe(para));
    expect(screen.queryByTestId("antiga-admin-configuracoes")).toBeNull();
  });

  // W14: o grupo Dados/Perfil do Configurar aluno antigo virou os cards do Resumo (dados, acesso, ajustes, link, resumo privado,
  // fluxo de consulta) — o link antigo cai no Resumo NOVO (o Configurar antigo não abre mais ali)
  it.each([
    ["/admin/alunos/u1", "/painel/alunos/u1"],
    ["/admin/alunos/u1/ver", "/painel/alunos/u1?ct=dados"],
    ["/admin/alunos/u1?ct=geral", "/painel/alunos/u1?ct=geral"],
  ])("Configurar aluno %s → %s (Resumo novo, W14)", async (de, para) => {
    logar("professor");
    abrir(de);
    await waitFor(() => expect(onde()).toBe(para), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector("[data-resumo-aluno]")).not.toBeNull(), { timeout: 4000 });
    expect(document.querySelector('[data-aba-aluno="resumo"]')?.getAttribute("aria-current")).toBe("page");
    expect(screen.queryByTestId("antiga-configurar-aluno")).toBeNull();
  });

  it.each([
    ["/admin/alunos/u1?ct=treino&wt=volume", "/painel/alunos/u1/treino?ct=treino&wt=volume", "treino"],
    ["/admin/alunos/u1?ct=historico", "/painel/alunos/u1/treino?ct=historico", "treino"],
    ["/admin/alunos/u1?ct=config", "/painel/alunos/u1/treino?ct=config", "treino"],
    ["/admin/alunos/u1?ct=dobras", "/painel/alunos/u1/avaliacao?ct=dobras", "avaliacao"],
    ["/admin/alunos/u1?ct=registros", "/painel/alunos/u1/avaliacao?ct=registros", "avaliacao"],
    ["/admin?v=config&u=u1&ct=evolucao", "/painel/alunos/u1/avaliacao?ct=evolucao", "avaliacao"],
  ])("Configurar aluno %s → %s (aba %s)", async (de, para, aba) => {
    logar("professor");
    abrir(de);
    expect(await screen.findByTestId("antiga-configurar-aluno", {}, { timeout: 4000 })).toHaveTextContent("u1");
    await waitFor(() => expect(onde()).toBe(para));
    expect(document.querySelector(`[data-aba-aluno="${aba}"]`)?.getAttribute("aria-current")).toBe("page");
    expect([...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"))).toEqual(["resumo", "treino", "avaliacao", "financeiro"]);
  });

  // W6: a aba Financeiro do aluno é a nova (src/painel/aluno/abas/Financeiro.tsx) — o "Plano & Cobrança" antigo não abre mais
  it("Configurar aluno /admin/alunos/u1?ct=plano → /painel/alunos/u1/financeiro?ct=plano (aba Financeiro nova da W6)", async () => {
    logar("professor");
    abrir("/admin/alunos/u1?ct=plano");
    await waitFor(() => expect(onde()).toBe("/painel/alunos/u1/financeiro?ct=plano"), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector('[data-aba-aluno="financeiro"]')?.getAttribute("aria-current")).toBe("page"));
    await waitFor(() => expect(document.querySelector("[data-aba-aluno-conteudo='financeiro']")?.textContent).toContain("Não deu para abrir o financeiro"), { timeout: 4000 });
    expect(screen.queryByTestId("antiga-configurar-aluno")).toBeNull();
  });

  it("profissional abre direto no painel; se escolheu o app de aluno, volta para o app", async () => {
    logar("professor");
    const r = abrir("/");
    expect(await screen.findByTestId("pagina-alunos", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/painel/alunos");
    r.unmount();
    localStorage.setItem("physiq_area", "aluno");
    abrir("/");
    expect(await screen.findByTestId("aba-inicio")).toBeInTheDocument();
  });

  it("card da conta, card do plano e menu do usuário na casca", async () => {
    logar("professor");
    abrir("/painel/alunos");
    await screen.findByTestId("pagina-alunos", {}, { timeout: 4000 });
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
    expect(await screen.findByTestId("pagina-alunos", {}, { timeout: 4000 })).toBeInTheDocument();
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
