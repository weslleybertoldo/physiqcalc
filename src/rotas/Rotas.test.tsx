import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Teste de rotas da W1: toda rota antiga do Calc abre a MESMA função dentro da casca nova e os redirecionamentos da 4.8
// valem. As telas viram marcadores (o que importa aqui é QUAL tela abre e em QUAL casca). W28: as telas antigas que ainda
// respondiam por alguma rota (Planos do Calc, Configurar aluno, Pagamentos) saíram — só a Biblioteca global do master ficou.
const h = vi.hoisted(() => {
  const estado = {
    auth: { user: null as null | { id: string; email: string; user_metadata: Record<string, string> }, loading: false, papel: "aluno", isStaff: false, isMaster: false, signOut: async () => {} },
    // W3: login único — o login é o do banco principal (useSessao) e a situação vem da minha_situacao()
    sessao: { usuario: null as null | { id: string; email: string; user_metadata: Record<string, string> }, situacao: null as null | Record<string, unknown> },
    // hml-22 (H-22): o 2FA do master — "pede_codigo" põe a tela do código na frente das áreas logadas
    doisFatores: "livre" as "livre" | "pede_codigo",
  };
  const marcador = (id: string) => ({
    default: (props: { userId?: string }) => <div data-testid={id}>{props.userId ? `${id}:${props.userId}` : id}</div>,
  });
  // hml-08: os testes rodam como o site (o master abre); o bloco "app" troca para o app (APK/AAB), sem o master
  const plataforma = { site: true };
  return { estado, marcador, plataforma };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.estado.auth }));
vi.mock("@/lib/plataforma", () => ({ BUILD_DO_APP: false, masterNesteAparelho: () => h.plataforma.site }));
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
    doisFatores: h.estado.doisFatores,
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
// hml-18b (H-54): o app do aluno carrega o banco local (PowerSync) por import() — aqui, um provedor que só repassa (o de verdade abre o
// SQLite num Worker, que o jsdom não tem)
vi.mock("@/lib/powersync/PowerSyncProvider", () => ({ PowerSyncProvider: ({ children }: { children: unknown }) => children }));
vi.mock("@/app-aluno/abas/Treino", () => h.marcador("aba-treino"));
// W10: a aba Evolução é a nova (src/app-aluno/abas/Evolucao.tsx, pelo registro) — o UserDashboard saiu
vi.mock("@/app-aluno/abas/Evolucao", () => h.marcador("aba-evolucao"));
// W12: o Início (src/app-aluno/abas/Inicio.tsx) é a tela de abertura do app
vi.mock("@/app-aluno/abas/Inicio", () => h.marcador("aba-inicio"));
// W26: /calculator é a página nova (src/publico/Calculadora.tsx) — a antiga saiu. /privacidade e /termos: a página legal (a virada,
// 29/10/2026: a src/publico/Privacidade.tsx de antes saiu)
vi.mock("@/publico/Calculadora", () => h.marcador("publica-calculadora"));
// W13: a página Alunos é a nova (src/painel/paginas/Alunos.tsx, pelo registro) — a AlunosPage do Calc saiu
vi.mock("@/painel/paginas/Alunos", () => h.marcador("pagina-alunos"));
// W23: a página Treinos é a nova (src/painel/paginas/Treinos.tsx, pelo registro) — a TreinosAdminPage do Calc saiu
vi.mock("@/painel/paginas/Treinos", () => h.marcador("pagina-treinos"));
// W19: a página Financeiro é a nova (src/painel/paginas/Financeiro.tsx, pelo registro) — a CobrancaPage do Calc saiu
vi.mock("@/painel/paginas/Financeiro", () => h.marcador("pagina-financeiro"));
// W25: o /painel é o Dashboard novo (src/painel/paginas/Dashboard.tsx, pelo registro) — antes ele caía em Alunos
vi.mock("@/painel/paginas/Dashboard", () => h.marcador("pagina-dashboard"));
// W26: as Ferramentas são as páginas novas (src/painel/paginas/{Modelos,Calculadora,Lixeira,Impressos}.tsx) — a CalculadoraPage saiu
vi.mock("@/painel/paginas/Calculadora", () => h.marcador("pagina-calculadora"));
vi.mock("@/painel/paginas/Modelos", () => h.marcador("pagina-modelos"));
vi.mock("@/painel/paginas/Lixeira", () => h.marcador("pagina-lixeira"));
vi.mock("@/painel/paginas/Impressos", () => h.marcador("pagina-impressos"));
// W27: as páginas do master são as novas (src/master/paginas/*.tsx, pelo registro) — as antigas do Calc saíram, menos a Biblioteca
vi.mock("@/master/paginas/VisaoGeral", () => h.marcador("master-visao-geral"));
vi.mock("@/master/paginas/Contas", () => h.marcador("master-contas"));
vi.mock("@/master/paginas/Alunos", () => h.marcador("master-alunos"));
vi.mock("@/master/paginas/Financeiro", () => h.marcador("master-financeiro"));
vi.mock("@/master/paginas/Planos", () => h.marcador("master-planos"));
vi.mock("@/master/paginas/Integracoes", () => h.marcador("master-integracoes"));
vi.mock("@/master/paginas/AppAluno", () => h.marcador("master-app-aluno"));
vi.mock("@/master/paginas/Configuracoes", () => h.marcador("master-configuracoes"));
vi.mock("@/pages/master/BibliotecaPage", () => h.marcador("antiga-master-biblioteca"));
// hml-22 (H-22): a tela do código do app autenticador (só no site)
vi.mock("@/master/doisFatores/TelaCodigo", () => h.marcador("tela-codigo-2fa"));

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Rotas } from "./Rotas";

function Onde() {
  const { pathname, search } = useLocation();
  return <output data-testid="onde">{pathname + search}</output>;
}

function abrir(caminho: string, RotasDoTeste: typeof Rotas = Rotas) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
        <RotasDoTeste />
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const onde = () => screen.getByTestId("onde").textContent;

function conta(nome: string) {
  return {
    id: "c-1", nome, origem: "legado_calc", plano: "treino", modulos: ["treino"], faixa: "f10", periodicidade: "mensal",
    situacao: "isenta", teste_ate: null, vence_em: null, tolerancia_dias: 7, cobranca_legada: false, isenta_motivo: "master",
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
  h.plataforma.site = true;
  h.estado.auth = { user: null, loading: false, papel: "aluno", isStaff: false, isMaster: false, signOut: async () => {} };
  h.estado.sessao = { usuario: null, situacao: null };
  h.estado.doisFatores = "livre";
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
    // W25: o /admin do Calc é o /painel (spec 4.8), que agora é o Dashboard
    ["/admin", "/painel", "pagina-dashboard"],
    ["/admin/alunos", "/painel/alunos", "pagina-alunos"],
    ["/admin/treinos", "/painel/treinos", "pagina-treinos"],
    ["/admin/cobranca", "/painel/financeiro", "pagina-financeiro"],
    ["/admin/calculadora", "/painel/calculadora", "pagina-calculadora"],
    ["/admin?v=calculator", "/painel/calculadora", "pagina-calculadora"],
    ["/admin?v=treinos&t=biblioteca", "/painel/treinos?t=biblioteca", "pagina-treinos"],
  ])("%s → %s", async (de, para, tela) => {
    logar("professor");
    abrir(de);
    expect(await screen.findByTestId(tela, {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(onde()).toBe(para));
    const menu = document.querySelector("[data-menu-lateral]")!;
    expect(menu).not.toBeNull();
    // W21: a Pré-consulta (src/painel/paginas/PreConsulta.tsx) vale para os 2 módulos — o professor do Calc ganha o item (R7)
    // W22: e as Mensagens (src/painel/paginas/Mensagens.tsx — o WhatsApp do Nutri, R7)
    // W25: o Dashboard aparece no menu (a página nova existe)
    // W26: as Ferramentas Modelos, Calculadora e Lixeira (Impressos só com Nutrição — a conta do professor é só de Treino)
    expect([...menu.querySelectorAll("[data-nav]")].map((a) => a.textContent?.replace(/\d+$/, ""))).toEqual([
      "Dashboard", "Alunos", "Treinos", "Pré-consulta", "Agenda", "Mensagens", "Financeiro", "Configurações", "Modelos", "Calculadora", "Lixeira",
    ]);
  });

  // W28: a Planos do Calc saiu — o /admin/planos cai na aba Plano nova (a conta do professor de teste é isenta)
  it("/admin/planos → /painel/configuracoes/plano (aba Plano nova)", async () => {
    logar("professor");
    abrir("/admin/planos");
    await waitFor(() => expect(document.querySelector("[data-plano-isento]")).not.toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(onde()).toBe("/painel/configuracoes/plano"));
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
    // W18: o Resumo carrega mais um card (Prontuário) — sem .env (como o CI do APK) a 1ª carga passa dos 5 s padrão
  }, 15_000);

  // W15: os grupos Treino e Configuração do Configurar aluno antigo viraram a aba Treino NOVA (src/painel/aluno/abas/Treino.tsx) —
  // o link antigo cai nela (o Configurar antigo não abre mais ali)
  it.each([
    ["/admin/alunos/u1?ct=treino&wt=volume", "/painel/alunos/u1/treino?ct=treino&wt=volume"],
    ["/admin/alunos/u1?ct=historico", "/painel/alunos/u1/treino?ct=historico"],
    ["/admin/alunos/u1?ct=config", "/painel/alunos/u1/treino?ct=config"],
  ])("Configurar aluno %s → %s (aba Treino nova, W15)", async (de, para) => {
    logar("professor");
    abrir(de);
    await waitFor(() => expect(onde()).toBe(para), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector('[data-aba-aluno="treino"]')?.getAttribute("aria-current")).toBe("page"));
    await waitFor(() => expect(document.querySelector("[data-aba-aluno-conteudo='treino']")).not.toBeNull(), { timeout: 4000 });
  });

  // W17: o grupo Avaliação do Configurar aluno antigo (Dobras & Medidas, Evolução, Registros) virou a aba Avaliação NOVA
  // (src/painel/aluno/abas/Avaliacao.tsx) — o link antigo cai nela (o Configurar antigo não abre mais ali)
  it.each([
    ["/admin/alunos/u1?ct=dobras", "/painel/alunos/u1/avaliacao?ct=dobras", "avaliacao"],
    ["/admin/alunos/u1?ct=registros", "/painel/alunos/u1/avaliacao?ct=registros", "avaliacao"],
    ["/admin?v=config&u=u1&ct=evolucao", "/painel/alunos/u1/avaliacao?ct=evolucao", "avaliacao"],
  ])("Configurar aluno %s → %s (aba %s nova, W17)", async (de, para, aba) => {
    logar("professor");
    abrir(de);
    await waitFor(() => expect(onde()).toBe(para), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector(`[data-aba-aluno="${aba}"]`)?.getAttribute("aria-current")).toBe("page"), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector("[data-aba-aluno-conteudo='avaliacao']")).not.toBeNull(), { timeout: 4000 });
    // W18: o Prontuário (as anotações da equipe) vale também na conta só de Treino — o personal lê e escreve as "Equipe"; W-A P4: a aba
    // Acessos depois de Financeiro, para todo aluno
    expect([...document.querySelectorAll("[data-aba-aluno]")].map((a) => a.getAttribute("data-aba-aluno"))).toEqual(["resumo", "treino", "avaliacao", "prontuario", "financeiro", "acessos"]);
  }, 15_000);

  // W6: a aba Financeiro do aluno é a nova (src/painel/aluno/abas/Financeiro.tsx) — o "Plano & Cobrança" antigo não abre mais
  it("Configurar aluno /admin/alunos/u1?ct=plano → /painel/alunos/u1/financeiro?ct=plano (aba Financeiro nova da W6)", async () => {
    logar("professor");
    abrir("/admin/alunos/u1?ct=plano");
    await waitFor(() => expect(onde()).toBe("/painel/alunos/u1/financeiro?ct=plano"), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector('[data-aba-aluno="financeiro"]')?.getAttribute("aria-current")).toBe("page"));
    // W15: 8 s (a suíte inteira sem .env — o CI — deixa este caso perto dos 4 s; sozinho passa em ~2 s)
    await waitFor(() => expect(document.querySelector("[data-aba-aluno-conteudo='financeiro']")?.textContent).toContain("Não deu para abrir o financeiro"), { timeout: 8000 });
  }, 15_000);

  it("profissional abre direto no painel; se escolheu o app de aluno, volta para o app", async () => {
    logar("professor");
    const r = abrir("/");
    // W25: o painel abre no Dashboard
    expect(await screen.findByTestId("pagina-dashboard", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/painel");
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

describe("master: páginas novas na casca (W27) e a Biblioteca antiga", () => {
  it.each([
    ["/master", "/master", "master-visao-geral"],
    ["/master/professores", "/master/contas", "master-contas"],
    ["/master/professores?status=ativo", "/master/contas?status=ativo", "master-contas"],
    ["/master/alunos", "/master/alunos", "master-alunos"],
    ["/master/financeiro", "/master/financeiro", "master-financeiro"],
    ["/master/planos", "/master/planos", "master-planos"],
    ["/master/integracoes", "/master/integracoes", "master-integracoes"],
    ["/master/app-do-aluno", "/master/app-do-aluno", "master-app-aluno"],
    ["/master/biblioteca", "/master/biblioteca", "antiga-master-biblioteca"],
    ["/master/configuracoes", "/master/configuracoes", "master-configuracoes"],
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
    expect(await screen.findByTestId("pagina-dashboard", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).toBe("/painel");
  });
});

// hml-08 (H-22): o painel master fica só no site — no app, /master… (inclusive as rotas antigas) não existe
describe("app (APK/AAB): sem o master", () => {
  beforeEach(() => {
    h.plataforma.site = false;
  });

  it.each([
    ["/master", "master"],
    ["/master/professores", "master"],
    ["/master", "sem login"],
  ])("%s (%s) → Página não encontrada", async (de, quem) => {
    if (quem === "master") logar("master");
    abrir(de);
    expect(await screen.findByText("Página não encontrada", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(document.querySelector('[data-casca="master"]')).toBeNull();
    expect(screen.queryByTestId("master-visao-geral")).toBeNull();
    expect(screen.queryByTestId("master-contas")).toBeNull();
    expect(onde()).toMatch(/^\/master/);
  });
});

// hml-22 (H-22): a verificação em 2 etapas do master — com o fator ligado e o login só com a senha ou o Google (aal1), a tela do código
// vem antes de QUALQUER área logada (o app do aluno, o painel e o master); a entrada leva para a área, e as páginas públicas abrem normal
describe("hml-22: a tela do código antes da área logada (só no site)", () => {
  it.each([
    ["/master", "master"],
    ["/master/contas", "master"],
    ["/painel", "master"],
    ["/", "master"],
    ["/perfil", "master"],
    ["/painel/alunos", "professor"],
  ])("%s (%s com pede_codigo) → a tela do código, sem a área", async (de, papel) => {
    logar(papel as "master" | "professor");
    h.estado.doisFatores = "pede_codigo";
    abrir(de);
    expect(await screen.findByTestId("tela-codigo-2fa", {}, { timeout: 4000 })).toBeInTheDocument();
    for (const area of ["master-visao-geral", "master-contas", "pagina-dashboard", "pagina-alunos", "aba-inicio"]) {
      expect(screen.queryByTestId(area)).toBeNull();
    }
    expect(document.querySelector("[data-casca]")).toBeNull();
  });

  it("/entrar logado com pede_codigo: vai para a área e a tela do código aparece lá", async () => {
    logar("master");
    h.estado.doisFatores = "pede_codigo";
    abrir("/entrar");
    expect(await screen.findByTestId("tela-codigo-2fa", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(onde()).not.toBe("/entrar");
  });

  it("página pública com pede_codigo: abre normal (sem a tela do código)", async () => {
    logar("master");
    h.estado.doisFatores = "pede_codigo";
    abrir("/calculator");
    expect(await screen.findByTestId("publica-calculadora", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByTestId("tela-codigo-2fa")).toBeNull();
  });

  it("livre (sem fator ou depois do código): o master abre como antes", async () => {
    logar("master");
    abrir("/master");
    expect(await screen.findByTestId("master-visao-geral", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByTestId("tela-codigo-2fa")).toBeNull();
  });
});

describe("páginas públicas (sem login)", () => {
  it.each([["/calculator", "publica-calculadora"]])("%s", async (de, tela) => {
    abrir(de);
    expect(await screen.findByTestId(tela)).toBeInTheDocument();
    expect(document.querySelector('[data-casca="publico"]')).not.toBeNull();
  });

  // hml-11 (H-28, D4) → a virada (29/10/2026): /privacidade, /termos e /assinatura são as páginas dos textos legais, sem a faixa "em
  // revisão", na casca pública com o link "Assinatura" no rodapé. O Vitest roda como o build de staging; a produção fica no fim do
  // arquivo (a mesma coisa).
  it.each([
    ["/privacidade", "politica"],
    ["/termos", "termos"],
    ["/assinatura", "assinatura"],
  ])("staging: %s abre a página legal (%s)", async (de, doc) => {
    abrir(de);
    await waitFor(() => expect(document.querySelector(`[data-pagina-legal="${doc}"]`)).not.toBeNull(), { timeout: 4000 });
    expect(document.querySelector('[data-casca="publico"]')).not.toBeNull();
    expect(document.querySelector("[data-texto-em-revisao]")).toBeNull();
    expect(document.querySelector("[data-rodape-assinatura]")?.getAttribute("href")).toBe("/assinatura");
    expect(onde()).toBe(de);
  });

  it("endereço que não existe mostra o 404 premium", async () => {
    abrir("/nao-existe");
    expect(await screen.findByText("Página não encontrada")).toBeInTheDocument();
  });

  // hml-10 (D5): a página de teste das telas de erro só existe no build de staging (o Vitest roda como staging; na produção o Rollup
  // corta o import e o vite build com VITE_DB_SCHEMA=public não tem os textos dela no dist/assets). Ela não entra pelo registro.
  it("/erro-teste (staging) abre a página de teste das telas de erro, na casca pública; /erro-de-teste não existe", async () => {
    abrir("/erro-teste");
    expect(await screen.findByRole("button", { name: "quebrar a tela" }, { timeout: 4000 })).toBeInTheDocument();
    expect(document.querySelector('[data-casca="publico"]')).not.toBeNull();
    cleanup();
    abrir("/erro-de-teste");
    expect(await screen.findByText("Página não encontrada")).toBeInTheDocument();
  });

  it("/erro-teste fica fora do Carregavel: \"quebrar a tela\" chega ao ErrorBoundary de dentro (a S1)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ErrorBoundary>
        <QueryClientProvider client={qc}>
          <MemoryRouter useTransitions={false} initialEntries={["/erro-teste"]}>
            <Rotas />
          </MemoryRouter>
        </QueryClientProvider>
      </ErrorBoundary>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "quebrar a tela" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "Algo deu errado" })).toBeInTheDocument();
    expect(screen.queryByText("Não deu para abrir esta parte")).toBeNull();
    vi.mocked(console.error).mockRestore();
  });
});

// A virada (hml-11 D12, 29/10/2026): na produção (VITE_DB_SCHEMA=public) os textos legais valem como no staging — /privacidade,
// /termos e /assinatura são a página legal, sem a faixa "em revisão" e com o link da assinatura no rodapé; a /erro-teste continua só no
// staging. O módulo é importado de novo com o schema trocado. Fica no FIM do arquivo: depois do resetModules, nenhum teste usa o Rotas
// do import de cima.
describe("produção: os textos legais publicados (a virada)", () => {
  async function rotasDaProducao() {
    vi.stubEnv("VITE_DB_SCHEMA", "public");
    vi.resetModules();
    return (await import("./Rotas")).Rotas;
  }
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["/privacidade", "politica"],
    ["/termos", "termos"],
    ["/assinatura", "assinatura"],
  ])("%s → a página legal (%s), sem a faixa, com o link da assinatura no rodapé", async (de, doc) => {
    abrir(de, await rotasDaProducao());
    await waitFor(() => expect(document.querySelector(`[data-pagina-legal="${doc}"]`)).not.toBeNull(), { timeout: 4000 });
    expect(document.querySelector('[data-casca="publico"]')).not.toBeNull();
    expect(document.querySelector("[data-texto-em-revisao]")).toBeNull();
    expect(document.querySelector("[data-rodape-assinatura]")?.getAttribute("href")).toBe("/assinatura");
    expect(screen.queryByText("Página não encontrada")).toBeNull();
  });

  it("/erro-teste continua só no staging → Página não encontrada na produção", async () => {
    abrir("/erro-teste", await rotasDaProducao());
    expect(await screen.findByText("Página não encontrada", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quebrar a tela" })).toBeNull();
  });
});
