import { describe, expect, it } from "vitest";
import {
  ROTULO_RECEBIMENTO, acoesDaConta, chaveMascarada, dataCurta, faixaCabe, linhaAlunos, linhaVencimento, moeda, perguntaDasAutomaticas, perguntaDeSairDoMpConta,
  receitaDoMes, situacaoDoMpDaConta, somarDias, textoDasAutomaticas, textoErro, textoUltimoAcesso,
} from "./regras";
import type { ContaLinha, MpDaContaMaster, VisaoGeral } from "./tipos";

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
    // hml-22 (H-22): a função do master pediu o código do app autenticador
    expect(textoErro("precisa_2fa")).toBe("Digite o código do app autenticador para continuar.");
  });
  it("W1: o rótulo da InfinitePay", () => {
    expect(ROTULO_RECEBIMENTO.infinitepay).toBe("InfinitePay");
  });
});

describe("painel master — W2: o Mercado Pago do personal em Integrações (vê e desliga com o OK)", () => {
  const mp = (x: Partial<MpDaContaMaster> = {}): MpDaContaMaster => ({
    status: "ativa", apelido: "RAFAEL.TREINOS", mp_user_id: 123, expira_em: "2027-04-10T12:00:00Z", erro: null, chave_publica: true,
    conectado_em: "2026-10-11T12:00:00Z", teste: false, ...x,
  });

  it("os 2 Mercados Pagos têm nome (e os rótulos de antes ficam — o E2E da W1 confere o texto no código)", () => {
    expect(ROTULO_RECEBIMENTO.mercadopago).toBe("Mercado Pago do Physiq");
    expect(ROTULO_RECEBIMENTO.mercadopago_conta).toBe("Mercado Pago do personal");
    expect(ROTULO_RECEBIMENTO.pix_manual).toBe("Pix manual");
    expect(ROTULO_RECEBIMENTO.nenhum).toBe("Não cobra pelo app");
    expect(Object.keys(ROTULO_RECEBIMENTO)).toEqual(["pix_manual", "nenhum", "mercadopago", "mercadopago_conta", "infinitepay"]);
  });

  it("a situação na linha da conta: o apelido + conectado, renovar (com a data de São Paulo), conexão caída ou desconectado", () => {
    expect(situacaoDoMpDaConta(mp())).toEqual({ marca: "conectado", tom: "n", texto: "RAFAEL.TREINOS · Conectado" });
    expect(situacaoDoMpDaConta(mp({ erro: "renovacao_recusada" }))).toEqual({ marca: "renove", tom: "a", texto: "RAFAEL.TREINOS · Conectado · renovar até 10/04/2027" });
    // 01:00 UTC do dia 11 ainda é dia 10 em São Paulo
    expect(situacaoDoMpDaConta(mp({ erro: "sem_renovacao", expira_em: "2027-04-11T01:00:00Z" })).texto).toBe("RAFAEL.TREINOS · Conectado · renovar até 10/04/2027");
    expect(situacaoDoMpDaConta(mp({ erro: "sem_renovacao", expira_em: null })).texto).toBe("RAFAEL.TREINOS · Conectado · renovar");
    expect(situacaoDoMpDaConta(mp({ status: "erro", erro: "renovacao_recusada" }))).toEqual({ marca: "caiu", tom: "r", texto: "RAFAEL.TREINOS · Conexão caída" });
    expect(situacaoDoMpDaConta(mp({ status: "desconectada" }))).toEqual({ marca: "desconectado", tom: "g", texto: "RAFAEL.TREINOS · Desconectado" });
    expect(situacaoDoMpDaConta(null)).toEqual({ marca: "desconectado", tom: "g", texto: "Desconectado" });
    expect(situacaoDoMpDaConta(undefined).marca).toBe("desconectado");
    // sem apelido (o servidor pergunta por melhor esforço): só a situação
    expect(situacaoDoMpDaConta(mp({ apelido: null })).texto).toBe("Conectado");
    expect(situacaoDoMpDaConta(mp({ apelido: "  " })).texto).toBe("Conectado");
    // um erro qualquer com a conexão ativa não é o "renovar"
    expect(situacaoDoMpDaConta(mp({ erro: "outro" })).marca).toBe("conectado");
  });

  it("o 1º OK (sair do MP do personal): a conta, o destino e que só o dono conecta de novo — sempre com perigo", () => {
    const sem = perguntaDeSairDoMpConta("Rafael Lima", "nenhum", false);
    expect(sem).toMatchObject({ titulo: "Desligar o Mercado Pago do personal de Rafael Lima?", rotuloConfirmar: "Desligar", rotuloCancelar: "Voltar", perigo: true });
    expect(sem.descricao).toContain("Sem chave Pix ligada: a conta passa a não cobrar pelo app.");
    expect(sem.descricao).toContain("o dono conecta de novo em Configurações › Recebimento");
    expect(perguntaDeSairDoMpConta("X", "pix_manual", true).descricao).toContain("Os alunos voltam a pagar por Pix na chave ligada.");
    expect(perguntaDeSairDoMpConta("X", "pix_manual", false).descricao).toContain("a conta não tem chave Pix ligada");
    expect(perguntaDeSairDoMpConta("X", "nenhum", true).descricao).toContain("A conta passa a não cobrar pelo app.");
    expect(perguntaDeSairDoMpConta("X", "mercadopago", true).descricao).toContain("Mercado Pago do Physiq");
  });

  it("automaticas_ativas → a 2ª confirmação (cancelar no MP e avisar os alunos) com a contagem → o pedido com cancelar_automaticas: true", () => {
    const p = perguntaDasAutomaticas("automaticas_ativas", { alunos: 2 }, { modo: "nenhum" });
    expect(p).toMatchObject({ passo: "automaticas", perigo: true, rotuloCancelar: "Voltar", pedido: { modo: "nenhum", cancelar_automaticas: true } });
    expect(p?.titulo).toBe("Desligar as cobranças automáticas de 2 alunos?");
    expect(p?.descricao).toContain("2 alunos com cobrança automática no cartão: desligar cancela essas cobranças no Mercado Pago e avisa os alunos");
    expect(perguntaDasAutomaticas("automaticas_ativas", { alunos: 1 }, { modo: "nenhum" })?.descricao).toMatch(/^1 aluno com cobrança automática/);
    // sem a contagem (ou lixo): a pergunta continua, sem número
    const semN = perguntaDasAutomaticas("automaticas_ativas", { alunos: "x" }, { modo: "pix_manual" });
    expect(semN?.titulo).toBe("Desligar as cobranças automáticas?");
    expect(semN?.descricao).not.toMatch(/\d/);
    // a corrida (uma nasceu entre a conferência e a troca) depois do forçar: a 2ª de novo, SEM o forçar (forçar pede o OK de novo)
    expect(perguntaDasAutomaticas("automaticas_ativas", { alunos: 1 }, { modo: "nenhum", cancelar_automaticas: true, forcar_sem_acesso: true })?.pedido)
      .toEqual({ modo: "nenhum", cancelar_automaticas: true });
  });

  it("automaticas_sem_acesso (depois do OK) → a 3ª, com perigo: Forçar → o pedido com forcar_sem_acesso: true; as já desligadas entram no texto", () => {
    const p = perguntaDasAutomaticas("automaticas_sem_acesso", { alunos: 3, canceladas: 2 }, { modo: "pix_manual", cancelar_automaticas: true });
    expect(p).toMatchObject({ passo: "forcar", perigo: true, rotuloConfirmar: "Forçar", rotuloCancelar: "Voltar",
      pedido: { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: true } });
    expect(p?.descricao).toContain("O Physiq não alcança o Mercado Pago do personal para desligar as cobranças automáticas de 3 alunos");
    expect(p?.descricao).toContain("avisa o personal (para desligar no app do Mercado Pago) e os alunos");
    expect(p?.descricao).toContain("a cobrança pode continuar no cartão até ele desligar");
    expect(p?.descricao).toContain("Já desligadas no Mercado Pago: 2.");
    expect(perguntaDasAutomaticas("automaticas_sem_acesso", { alunos: 1, canceladas: 0 }, { modo: "nenhum", cancelar_automaticas: true })?.descricao)
      .not.toContain("Já desligadas");
    // só depois do OK das automáticas; e o forçado que volta "sem acesso" não pergunta de novo (a frase do erro)
    expect(perguntaDasAutomaticas("automaticas_sem_acesso", { alunos: 1 }, { modo: "nenhum" })).toBeNull();
    expect(perguntaDasAutomaticas("automaticas_sem_acesso", { alunos: 1 }, { modo: "nenhum", cancelar_automaticas: true, forcar_sem_acesso: true })).toBeNull();
  });

  it("os outros códigos não perguntam (a tela mostra a frase)", () => {
    expect(perguntaDasAutomaticas("automaticas_nao_canceladas", { falhas: 1 }, { modo: "nenhum", cancelar_automaticas: true })).toBeNull();
    expect(perguntaDasAutomaticas("modo_invalido", {}, { modo: "nenhum" })).toBeNull();
    expect(perguntaDasAutomaticas(null, {}, { modo: "nenhum" })).toBeNull();
  });

  it("as frases dos códigos novos (a do 502 com a contagem das recusas) e o modo_invalido de agora", () => {
    expect(textoErro("modo_invalido")).toBe("O Mercado Pago do personal e a InfinitePay só o dono liga.");
    expect(textoErro("automaticas_ativas")).toContain("alunos com cobrança automática no cartão");
    expect(textoErro("automaticas_sem_acesso")).toContain("Você pode forçar");
    expect(textoErro("automaticas_nao_canceladas")).toBe("Algumas cobranças automáticas não desligaram no Mercado Pago. A forma de receber não mudou. Tente de novo.");
    expect(textoErro("automaticas_nao_canceladas", { falhas: 2 })).toBe("2 cobranças automáticas não desligaram no Mercado Pago. A forma de receber não mudou. Tente de novo.");
    expect(textoErro("automaticas_nao_canceladas", { falhas: 1 })).toBe("1 cobrança automática não desligou no Mercado Pago. A forma de receber não mudou. Tente de novo.");
    expect(textoErro("automaticas_nao_canceladas", { falhas: 1.5 })).toBe(textoErro("automaticas_nao_canceladas"));
    expect(textoErro("automaticas_nao_canceladas", { falhas: 0 })).toBe(textoErro("automaticas_nao_canceladas"));
    // a contagem só vale para o 502
    expect(textoErro("so_master", { falhas: 2 })).toBe("Só o master pode fazer isto.");
  });

  it("o que a troca com o OK fez nas automáticas (a 2ª linha do aviso); nada → null", () => {
    expect(textoDasAutomaticas({ ok: true, automaticas: { canceladas: 2, forcadas: 0 } }))
      .toBe("2 cobranças automáticas desligadas no Mercado Pago — cada aluno recebeu um aviso.");
    expect(textoDasAutomaticas({ automaticas: { canceladas: 1, forcadas: 1 } }))
      .toBe("1 cobrança automática desligada no Mercado Pago — cada aluno recebeu um aviso. 1 aluno marcado sem a cobrança automática à força: o personal e os alunos foram avisados.");
    expect(textoDasAutomaticas({ automaticas: { canceladas: 0, forcadas: 3 } })).toBe("3 alunos marcados sem a cobrança automática à força: o personal e os alunos foram avisados.");
    expect(textoDasAutomaticas({ automaticas: { canceladas: 0, forcadas: 0 } })).toBeNull();
    expect(textoDasAutomaticas({ ok: true, conta: {} })).toBeNull();
    expect(textoDasAutomaticas({ automaticas: { canceladas: "lixo", forcadas: -1 } })).toBeNull();
    expect(textoDasAutomaticas(null)).toBeNull();
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
