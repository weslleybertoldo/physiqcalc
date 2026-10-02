import { describe, expect, it } from "vitest";
import { acoesDaConta, chaveMascarada, dataCurta, faixaCabe, linhaAlunos, linhaVencimento, moeda, receitaDoMes, somarDias, textoErro, textoUltimoAcesso } from "./regras";
import type { ContaLinha, VisaoGeral } from "./tipos";

function conta(c: Partial<ContaLinha> = {}): ContaLinha {
  return {
    id: "c1", nome: "Conta", origem: "nova", plano: "treino_nutricao", modulos: ["treino", "nutricao"], faixa: "f10", periodicidade: "mensal",
    situacao: "ativa", situacao_efetiva: "ativa", teste_ate: null, vence_em: "2026-11-02", tolerancia_dias: 0, valor_travado: null, valor_mensal: 59.9,
    regra_pix: "mes", cobranca_legada: false, isenta_motivo: null, recebimento_modo: "pix_manual", bloquear_app_inadimplente: false,
    alunos_bloqueados_em: null, alunos_bloqueados_msg: null, criado_em: "2026-10-01T10:00:00Z", eh_app: false, dono: null, membros: 1, convidados: 0,
    alunos_ativos: 3, alunos_total: 3, limite_alunos: 10, assinatura: null, legado_nutri: null, ultima_fatura: null, chave_pix: null, ...c,
  };
}

describe("painel master — o que cada conta deixa fazer (W27)", () => {
  it("conta nova: as ações de cobrança e acesso, sem excluir enquanto tem aluno", () => {
    const a = acoesDaConta(conta());
    expect(a).toEqual(expect.arrayContaining(["plano", "vencimento", "liberar", "registrar_pagamento", "isentar", "suspender", "bloquear_alunos", "reenviar_aviso", "mover_alunos"]));
    expect(a).not.toContain("excluir");
    expect(a).not.toContain("cancelar_assinatura");
  });
  it("isenta → tirar isenção; suspensa → reativar; alunos bloqueados → desbloquear; 0 alunos → excluir; cartão → cancelar", () => {
    const a = acoesDaConta(conta({ situacao: "suspensa", isenta_motivo: "parceria", alunos_bloqueados_em: "2026-10-02T01:00:00Z", alunos_total: 0,
      assinatura: { status: "authorized", valor: 59.9, proximo_vencimento: null } }));
    expect(a).toEqual(expect.arrayContaining(["tirar_isencao", "reativar", "desbloquear_alunos", "excluir", "cancelar_assinatura"]));
    expect(a).not.toContain("isentar");
    expect(a).not.toContain("suspender");
  });
  it("W28: legado já cobrado pelo núcleo (cobranca_legada = false) tem as ações de uma conta nova", () => {
    const a = acoesDaConta(conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, tolerancia_dias: 7, valor_travado: 39.9 }));
    expect(a).toEqual(expect.arrayContaining(["plano", "vencimento", "liberar", "registrar_pagamento", "suspender", "mover_alunos"]));
  });
  it("conta do app: nada (gerida em App do aluno)", () => {
    expect(acoesDaConta(conta({ origem: "app", eh_app: true }))).toEqual([]);
  });
});

describe("painel master — textos", () => {
  it("linha do vencimento por situação", () => {
    expect(linhaVencimento(conta())).toBe("Vence em 02/11/2026");
    expect(linhaVencimento(conta({ situacao_efetiva: "teste", teste_ate: "2026-10-16" }))).toBe("Teste até 16/10/2026");
    expect(linhaVencimento(conta({ situacao_efetiva: "vencida", vence_em: "2026-09-30" }))).toBe("Venceu em 30/09/2026");
    expect(linhaVencimento(conta({ situacao_efetiva: "isenta", isenta_motivo: "Conta do master" }))).toBe("Isenta · Conta do master");
    expect(linhaVencimento(conta({ situacao_efetiva: "suspensa" }))).toBe("Suspensa pelo master");
  });
  it("W28: legado Nutri no núcleo (cobranca_legada = false) mostra as datas do núcleo, não as do site antigo", () => {
    const nutri = { origem: "legado_nutri" as const, cobranca_legada: false, regras_legadas: true, legado_nutri: { teste_ate: null, pago_ate: "2026-10-20", isento: true } };
    expect(linhaVencimento(conta({ ...nutri, situacao_efetiva: "ativa", vence_em: "2026-11-02" }))).toBe("Vence em 02/11/2026");
    expect(linhaVencimento(conta({ ...nutri, situacao_efetiva: "vencida", vence_em: "2026-09-30" }))).toBe("Venceu em 30/09/2026");
  });
  it("alunos, faixa que cabe, dinheiro, datas e chave mascarada", () => {
    expect(linhaAlunos(conta())).toBe("3 de 10");
    expect(linhaAlunos(conta({ limite_alunos: null }))).toBe("3 · sem limite");
    expect(faixaCabe("f10", 10)).toBe(true);
    expect(faixaCabe("f10", 11)).toBe(false);
    expect(faixaCabe("livre", 999)).toBe(true);
    expect(moeda(59.9)).toMatch(/R\$\s?59,90/);
    expect(moeda(null)).toBe("—");
    expect(dataCurta("2026-10-02T03:00:00Z")).toBe("02/10/2026");
    expect(somarDias("2026-10-30", 3)).toBe("2026-11-02");
    expect(chaveMascarada("prof2.teste.claude@physiqcalc.app")).toBe("pro…app");
    expect(chaveMascarada("12345")).toBe("12345");
  });
  it("erros das funções viram frase (desconhecido = genérico)", () => {
    expect(textoErro("so_master")).toBe("Só o master pode fazer isto.");
    expect(textoErro("cobranca_legada")).toContain("ainda é a antiga");
    expect(textoErro("xyz")).toBe("Não deu certo agora. Tente de novo.");
  });
});

describe("painel master — Receita do mês (W28: o mês contra o MESMO período do mês anterior)", () => {
  const receita = (o: Partial<VisaoGeral["receita"]> = {}): VisaoGeral["receita"] => ({ mes: 120, mes_anterior: 860, app_mes: 0, ...o });
  it("com os recebimentos por dia: 1º a 2 de outubro contra 1º a 2 de setembro (não o setembro inteiro)", () => {
    const r = receitaDoMes(receita({ recebimentos: [
      { dia: "2026-09-01", valor: 60, origem: "conta" }, { dia: "2026-09-02", valor: 40, origem: "conta" }, { dia: "2026-09-20", valor: 760, origem: "conta" },
      { dia: "2026-10-01", valor: 80, origem: "conta" }, { dia: "2026-10-02", valor: "40", origem: "conta" },
    ] }), "2026-10-02");
    expect(r).toEqual({ valor: 120, variacao: 20, rotulo: "1–2 set", rotuloLongo: "1º a 2 de setembro" });
  });
  it("nada no mesmo período do mês anterior: sem variação (a tela diz 'nada em …')", () => {
    expect(receitaDoMes(receita({ recebimentos: [{ dia: "2026-10-01", valor: 59.9, origem: "conta" }] }), "2026-10-01"))
      .toEqual({ valor: 59.9, variacao: null, rotulo: "1º set", rotuloLongo: "1º de setembro" });
  });
  it("servidor antigo (sem recebimentos): o mês contra o mês anterior inteiro, como antes", () => {
    expect(receitaDoMes(receita(), "2026-10-02")).toEqual({ valor: 120, variacao: -86, rotulo: null, rotuloLongo: null });
    expect(receitaDoMes(receita({ mes_anterior: 0 }), "2026-10-02").variacao).toBeNull();
  });
});

describe("H4 (N-22) — último acesso de cada profissional (o texto do \"Profissionais\" do Nutri)", () => {
  const agora = new Date("2026-10-02T15:00:00Z"); // 12:00 em São Paulo
  it("hoje, ontem, há N dias / meses / anos e nunca acessou", () => {
    expect(textoUltimoAcesso("2026-10-02T03:30:00Z", agora)).toBe("hoje"); // 00:30 de hoje em SP
    expect(textoUltimoAcesso("2026-10-02T02:30:00Z", agora)).toBe("ontem"); // 23:30 de ontem em SP
    expect(textoUltimoAcesso("2026-09-25T12:00:00Z", agora)).toBe("há 7 dias");
    expect(textoUltimoAcesso("2026-08-20T12:00:00Z", agora)).toBe("há 1 mês");
    expect(textoUltimoAcesso("2026-04-20T12:00:00Z", agora)).toBe("há 5 meses");
    expect(textoUltimoAcesso("2025-09-01T12:00:00Z", agora)).toBe("há 1 ano");
    expect(textoUltimoAcesso("2023-09-01T12:00:00Z", agora)).toBe("há 3 anos");
    expect(textoUltimoAcesso(null, agora)).toBe("nunca acessou");
    expect(textoUltimoAcesso("lixo", agora)).toBe("nunca acessou");
  });
});
