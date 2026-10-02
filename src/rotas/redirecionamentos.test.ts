import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ABA_DA_SECAO_NUTRI, ABA_DO_CT, ROTAS_ANTIGAS, destinoDaRotaAntiga, montarUrl } from "./redirecionamentos";

const ir = (caminho: string) => {
  const u = new URL(caminho, "https://physiqcalc.com.br");
  return destinoDaRotaAntiga(u.pathname, u.search, u.hash);
};

// Tabela 4.8 da spec, linha a linha
describe("redirecionamentos da tabela 4.8 — PhysiqCalc", () => {
  it.each([
    ["/treinos", "/treino"],
    ["/avaliacao", "/evolucao"],
    ["/pagamentos", "/perfil/pagamentos"],
    ["/login", "/entrar"],
    ["/admin", "/painel"],
    ["/admin/alunos", "/painel/alunos"],
    ["/admin/alunos/u1", "/painel/alunos/u1"],
    ["/admin/alunos/u1/ver", "/painel/alunos/u1?ct=dados"],
    ["/admin/treinos", "/painel/treinos"],
    ["/admin/cobranca", "/painel/financeiro"],
    ["/admin/planos", "/painel/configuracoes/plano"],
    ["/admin/configuracoes", "/painel/configuracoes"],
    ["/admin/calculadora", "/painel/calculadora"],
    ["/master/professores", "/master/contas"],
  ])("%s → %s", (antiga, nova) => {
    expect(ir(antiga)).toBe(nova);
  });
});

describe("redirecionamentos da tabela 4.8 — PhysiqNutri", () => {
  it.each([
    ["/dashboard", "/painel"],
    ["/pacientes", "/painel/alunos"],
    ["/pacientes/p1", "/painel/alunos/p1"],
    ["/pacientes/p1/perfil", "/painel/alunos/p1"],
    ["/pacientes/p1/planejamento", "/painel/alunos/p1/dieta?secao=planejamento"],
    ["/pacientes/p1/antropometria", "/painel/alunos/p1/avaliacao?secao=antropometria"],
    ["/pacientes/p1/anamnese", "/painel/alunos/p1/prontuario?secao=anamnese"],
    ["/pacientes/p1/prontuario", "/painel/alunos/p1/prontuario"],
    ["/pacientes/p1/financeiro", "/painel/alunos/p1/financeiro"],
    ["/agenda", "/painel/agenda"],
    ["/pre-consulta", "/painel/pre-consulta"],
    ["/respostas-pre-consulta", "/painel/pre-consulta?aba=respostas"],
    ["/whatsapp", "/painel/mensagens"],
    ["/favoritos", "/painel/modelos"],
    ["/alimentos", "/painel/dietas?aba=alimentos"],
    ["/receitas", "/painel/dietas?aba=receitas"],
    ["/diario", "/painel/dietas?aba=diario"],
    ["/financeiro", "/painel/financeiro"],
    ["/impressos", "/painel/impressos"],
    ["/lixeira", "/painel/lixeira"],
    ["/configuracoes", "/painel/configuracoes"],
    ["/master/profissionais", "/master/contas"],
    ["/app", "/"],
    ["/app/plano", "/dieta"],
    ["/app/orientacoes", "/dieta?ver=orientacoes"],
    ["/app/metas", "/dieta?ver=metas"],
    ["/app/diario", "/dieta?ver=diario"],
    ["/app/agenda", "/perfil/agenda"],
    ["/app/recibos", "/perfil/pagamentos"],
    ["/app/entrar", "/entrar/email"],
    ["/entrar/nutricionista", "/entrar"],
  ])("%s → %s", (antiga, nova) => {
    expect(ir(antiga)).toBe(nova);
  });

  it("toda seção do prontuário do Nutri tem aba (tabela do fim da 5.2)", () => {
    expect(Object.keys(ABA_DA_SECAO_NUTRI)).toHaveLength(21);
    expect(new Set(Object.values(ABA_DA_SECAO_NUTRI))).toEqual(new Set(["resumo", "dieta", "avaliacao", "prontuario", "financeiro"]));
  });
});

describe("links antigos continuam valendo (query e #)", () => {
  it("Configurar aluno com ?ct= abre a aba certa e mantém ct/wt", () => {
    expect(ir("/admin/alunos/u1?ct=treino&wt=volume")).toBe("/painel/alunos/u1/treino?ct=treino&wt=volume");
    expect(ir("/admin/alunos/u1?ct=dobras")).toBe("/painel/alunos/u1/avaliacao?ct=dobras");
    expect(ir("/admin/alunos/u1?ct=plano")).toBe("/painel/alunos/u1/financeiro?ct=plano");
    expect(ir("/admin/alunos/u1?ct=geral")).toBe("/painel/alunos/u1?ct=geral");
  });

  it("todo grupo do Configurar aluno tem aba (tabela do fim da 5.2)", () => {
    expect(Object.keys(ABA_DO_CT).sort()).toEqual(["config", "dados", "dobras", "evolucao", "geral", "historico", "plano", "registros", "treino"]);
  });

  it("/admin?v=… (antes da sidebar) cai na rota nova", () => {
    expect(ir("/admin?v=config&u=u9&ct=historico&wt=semana")).toBe("/painel/alunos/u9/treino?ct=historico&wt=semana");
    expect(ir("/admin?v=config&u=u9")).toBe("/painel/alunos/u9");
    expect(ir("/admin?v=view&u=u9")).toBe("/painel/alunos/u9?ct=dados");
    expect(ir("/admin?v=treinos&t=biblioteca&pasta=p2")).toBe("/painel/treinos?t=biblioteca&pasta=p2");
    expect(ir("/admin?v=calculator")).toBe("/painel/calculadora");
    expect(ir("/admin?v=qualquer")).toBe("/painel");
  });

  it("Configurações antigas ?s= vão para a aba equivalente", () => {
    expect(ir("/admin/configuracoes?s=convite")).toBe("/painel/configuracoes/convite?s=convite");
    expect(ir("/admin/configuracoes?s=recebimento")).toBe("/painel/configuracoes/recebimento?s=recebimento");
    expect(ir("/admin/configuracoes?s=perfil")).toBe("/painel/configuracoes/perfil?s=perfil");
  });

  it("master mantém os filtros; # e query vão junto", () => {
    expect(ir("/master/professores?status=ativo")).toBe("/master/contas?status=ativo");
    expect(ir("/treinos#access_token=abc&refresh_token=def")).toBe("/treino#access_token=abc&refresh_token=def");
    expect(ir("/pagamentos?x=1")).toBe("/perfil/pagamentos?x=1");
    expect(ir("/respostas-pre-consulta?id=7")).toBe("/painel/pre-consulta?id=7&aba=respostas");
  });

  it("barra no fim e id com caracteres especiais", () => {
    expect(ir("/treinos/")).toBe("/treino");
    expect(ir("/admin/alunos/a%20b")).toBe("/painel/alunos/a%20b");
  });

  it("caminho que não é antigo → null", () => {
    expect(destinoDaRotaAntiga("/treino")).toBeNull();
    expect(destinoDaRotaAntiga("/painel/alunos")).toBeNull();
    expect(destinoDaRotaAntiga("/qualquer")).toBeNull();
  });

  it("toda rota antiga registrada tem destino", () => {
    for (const rota of ROTAS_ANTIGAS) {
      const exemplo = rota.replace(":id", "x1").replace(":secao", "perfil");
      expect(destinoDaRotaAntiga(exemplo), rota).not.toBeNull();
    }
  });

  it("montarUrl: a query do destino vence e # sem conteúdo some", () => {
    expect(montarUrl("/a?x=2", "?x=1&y=3", "#")).toBe("/a?x=2&y=3");
    expect(montarUrl("/a", "", "")).toBe("/a");
  });
});

// ───────────────────────── W28: o site antigo do Nutri inteiro (nutri.physiqcalc.com.br responde 308 para cá) ─────────────────────────

describe("W28 — sub-rotas do site antigo do Nutri (o consultório registrava `${url}/*`)", () => {
  it.each([
    ["/dashboard/qualquer", "/painel"],
    ["/pacientes/p1/anamnese/123", "/painel/alunos/p1/prontuario?secao=anamnese"],
    ["/pacientes/p1/planejamento/novo/2", "/painel/alunos/p1/dieta?secao=planejamento"],
    ["/pacientes/p1/perfil/editar", "/painel/alunos/p1"],
    ["/agenda/semana", "/painel/agenda"],
    ["/pre-consulta/novo", "/painel/pre-consulta"],
    ["/respostas-pre-consulta/r9?id=7", "/painel/pre-consulta?id=7&aba=respostas"],
    ["/whatsapp/conversa/1", "/painel/mensagens"],
    ["/favoritos/x", "/painel/modelos"],
    ["/alimentos/novo", "/painel/dietas?aba=alimentos"],
    ["/receitas/r1", "/painel/dietas?aba=receitas"],
    ["/diario/hoje", "/painel/dietas?aba=diario"],
    ["/financeiro/recibos", "/painel/financeiro"],
    ["/impressos/modelo/3", "/painel/impressos"],
    ["/lixeira/pacientes", "/painel/lixeira"],
    ["/master/profissionais/u1", "/master/contas"],
    ["/app/perfil", "/"],
    ["/app/qualquer/coisa?x=1", "/?x=1"],
    ["/configuracoes/assinatura", "/painel/configuracoes"],
  ])("%s → %s", (antiga, nova) => {
    expect(ir(antiga)).toBe(nova);
  });
  it("as rotas do Physiq com o mesmo começo continuam do Physiq (não são rota antiga)", () => {
    expect(destinoDaRotaAntiga("/master/contas")).toBeNull();
    expect(destinoDaRotaAntiga("/master")).toBeNull();
    expect(destinoDaRotaAntiga("/painel/agenda/x")).toBeNull();
    expect(destinoDaRotaAntiga("/application")).toBeNull();
    expect(destinoDaRotaAntiga("/agendamentos")).toBeNull();
  });
});

describe("W28 — Configurações do site antigo do Nutri (?aba=)", () => {
  it.each([
    ["/configuracoes?aba=assinatura", "/painel/configuracoes/plano"],
    ["/configuracoes?assinatura=ok", "/painel/configuracoes/plano?assinatura=ok"],
    ["/configuracoes?assinatura=ok&preapproval_id=2c93808", "/painel/configuracoes/plano?assinatura=ok&preapproval_id=2c93808"],
    ["/configuracoes?aba=assinatura&assinatura=ok&preapproval_id=2c93808", "/painel/configuracoes/plano?assinatura=ok&preapproval_id=2c93808"],
    ["/configuracoes?aba=recebimento", "/painel/configuracoes/recebimento"],
    ["/configuracoes?aba=meus-dados", "/painel/configuracoes/perfil"],
    ["/configuracoes?aba=meus-dados#topo", "/painel/configuracoes/perfil#topo"],
    ["/configuracoes", "/painel/configuracoes"],
  ])("%s → %s", (antiga, nova) => {
    expect(ir(antiga)).toBe(nova);
  });
});

// As rotas que o roteador monta no topo (src/rotas/Rotas.tsx) e as telas do Physiq (o painel de src/painel/menu.ts + RotasPainel.tsx,
// o master de src/master/menu.ts e as públicas de ROTAS_PUBLICAS em src/rotas/registro.ts) — se o roteador mudar, mude aqui.
const PUBLICAS = ["/f/:slug", "/d/:codigo", "/c/:codigo", "/p/:codigo", "/calculator", "/privacidade", "/termos"];
const TOPO = ["/", "/treino", "/dieta", "/evolucao", "/perfil", "/perfil/:item", "/entrar", "/entrar/email", "/boas-vindas", "/painel/*", "/master/*", ...PUBLICAS];
const TELAS_DO_PHYSIQ = [
  "/", "/treino", "/dieta", "/evolucao", "/perfil", "/perfil/:item", "/entrar", "/entrar/email", "/boas-vindas",
  "/painel", "/painel/alunos", "/painel/alunos/:id", "/painel/alunos/:id/:aba", "/painel/treinos", "/painel/dietas", "/painel/pre-consulta",
  "/painel/agenda", "/painel/mensagens", "/painel/financeiro", "/painel/configuracoes", "/painel/configuracoes/:aba", "/painel/modelos",
  "/painel/impressos", "/painel/calculadora", "/painel/lixeira",
  "/master", "/master/contas", "/master/alunos", "/master/financeiro", "/master/planos", "/master/integracoes", "/master/app-do-aluno",
  "/master/biblioteca", "/master/configuracoes",
  ...PUBLICAS,
];
const rotaDoTopo = (caminho: string) => matchRoutes([...TOPO, ...ROTAS_ANTIGAS, "*"].map((path) => ({ path })), caminho)?.[0]?.route.path ?? "*";
const telaDoPhysiq = (caminho: string) => matchRoutes(TELAS_DO_PHYSIQ.map((path) => ({ path })), caminho)?.[0]?.route.path ?? null;

/** As rotas do site antigo do Nutri (o App.tsx dele), com exemplos de sub-rota e de ?aba=. */
const SITE_ANTIGO_NUTRI = [
  "/", "/entrar/nutricionista", "/login", "/f/abc", "/d/abc123", "/c/abc", "/p/abc123",
  "/app/entrar", "/app", "/app/plano", "/app/orientacoes", "/app/metas", "/app/diario", "/app/agenda", "/app/recibos",
  "/dashboard", "/pacientes", "/pacientes/p1", ...Object.keys(ABA_DA_SECAO_NUTRI).map((secao) => `/pacientes/p1/${secao}`),
  "/agenda", "/pre-consulta", "/respostas-pre-consulta", "/whatsapp", "/favoritos", "/alimentos", "/receitas", "/diario", "/financeiro",
  "/impressos", "/lixeira", "/master/profissionais", "/configuracoes",
  "/configuracoes?aba=assinatura", "/configuracoes?aba=recebimento", "/configuracoes?aba=meus-dados", "/configuracoes?assinatura=ok&preapproval_id=2c9",
  // sub-rotas
  "/dashboard/x", "/pacientes/p1/anamnese/1", "/agenda/x", "/pre-consulta/x", "/respostas-pre-consulta/x", "/whatsapp/x", "/favoritos/x",
  "/alimentos/x", "/receitas/x", "/diario/x", "/financeiro/x", "/impressos/x", "/lixeira/x", "/master/profissionais/x", "/app/x/y",
  "/configuracoes/x",
];

describe("W28 — TODA rota do site antigo do Nutri cai numa tela do Physiq (nenhuma em 'Página não encontrada')", () => {
  it.each(SITE_ANTIGO_NUTRI)("%s", (url) => {
    const u = new URL(url, "https://physiqcalc.com.br");
    const topo = rotaDoTopo(u.pathname);
    expect(topo, `${url} cairia no 404`).not.toBe("*");
    if (ROTAS_ANTIGAS.includes(topo)) {
      const destino = destinoDaRotaAntiga(u.pathname, u.search, u.hash);
      expect(destino, `${url} sem destino`).not.toBeNull();
      expect(telaDoPhysiq(new URL(destino as string, "https://physiqcalc.com.br").pathname), `${url} → ${destino}`).not.toBeNull();
    } else {
      // o mesmo caminho já é uma tela do Physiq (o "/", as páginas públicas)
      expect(telaDoPhysiq(u.pathname), url).not.toBeNull();
    }
  });
  it("o roteador prefere a rota antiga mais específica (/master/profissionais/* vence o /master/* do master novo)", () => {
    expect(rotaDoTopo("/master/profissionais/u1")).toBe("/master/profissionais/*");
    expect(rotaDoTopo("/master/contas")).toBe("/master/*");
    expect(rotaDoTopo("/app/plano")).toBe("/app/plano");
    expect(rotaDoTopo("/app/x")).toBe("/app/*");
    expect(rotaDoTopo("/pacientes/p1/anamnese")).toBe("/pacientes/:id/:secao");
  });
});
