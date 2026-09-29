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
