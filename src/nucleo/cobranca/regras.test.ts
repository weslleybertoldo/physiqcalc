import { describe, expect, it } from "vitest";
import type { ContaSituacao } from "../situacao";
import { planoCartaoConta, planoCartaoContaNova } from "./cartao";
import {
  PRECOS_PADRAO,
  avaliarMudanca,
  avisoDoPlano,
  chaveDoAviso,
  contarAlunosAtivos,
  emTolerancia,
  faixaMinimaPara,
  fimDoAcesso,
  limiteDaConta,
  marcoDoAviso,
  maxAlunosDaFaixa,
  mensagemLimite,
  podeAdicionarAluno,
  precoDoPlano,
  primeiraCobrancaDaAssinatura,
  situacaoEfetiva,
  somarMeses,
  textoDoAviso,
  textoSaiDoLegado,
  travaDoPainel,
  vencimentoDepoisDoPagamento,
  vencimentoDoPlano,
  type DatasConta,
} from "./regras";

const HOJE = "2026-09-29";
const nova = (o: Partial<DatasConta> = {}): DatasConta => ({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-13", tolerancia_dias: 0, ...o });

describe("tabela de preços (6.1, 3A)", () => {
  it("os 12 valores da spec e o anual = 10 mensalidades", () => {
    const m = (p: "treino" | "nutricao" | "treino_nutricao", f: "f10" | "f30" | "f100" | "livre") => precoDoPlano(PRECOS_PADRAO, p, f, 1);
    expect([m("treino", "f10"), m("treino", "f30"), m("treino", "f100"), m("treino", "livre")]).toEqual([39.9, 79.9, 149.9, 300]);
    expect([m("nutricao", "f10"), m("nutricao", "f30"), m("nutricao", "f100"), m("nutricao", "livre")]).toEqual([39.9, 79.9, 149.9, 300]);
    expect([m("treino_nutricao", "f10"), m("treino_nutricao", "f30"), m("treino_nutricao", "f100"), m("treino_nutricao", "livre")]).toEqual([59.9, 119.9, 224.9, 450]);
    expect(precoDoPlano(PRECOS_PADRAO, "treino_nutricao", "f10", 12)).toBe(599);
    expect(precoDoPlano(PRECOS_PADRAO, "treino", "livre", 12)).toBe(3000);
    expect(precoDoPlano(PRECOS_PADRAO, "treino_nutricao", "f100", 12)).toBe(2249);
  });
  it("valor travado (preço especial do master / preço de hoje do legado) vale em qualquer plano; anual = 10×", () => {
    expect(precoDoPlano(PRECOS_PADRAO, "treino", "f30", 1, 1)).toBe(1);
    expect(precoDoPlano(PRECOS_PADRAO, "treino_nutricao", "livre", 12, 80)).toBe(800);
  });
  it("faixas: limite de alunos e a menor faixa que cabe", () => {
    expect([maxAlunosDaFaixa(PRECOS_PADRAO, "treino", "f10"), maxAlunosDaFaixa(PRECOS_PADRAO, "treino", "f30"),
      maxAlunosDaFaixa(PRECOS_PADRAO, "treino", "f100"), maxAlunosDaFaixa(PRECOS_PADRAO, "treino", "livre")]).toEqual([10, 30, 100, null]);
    expect([faixaMinimaPara(0), faixaMinimaPara(10), faixaMinimaPara(11), faixaMinimaPara(100), faixaMinimaPara(101)]).toEqual(["f10", "f10", "f30", "f100", "livre"]);
  });
});

describe("situação da conta (6.2 — spec 10.1)", () => {
  it("teste: vale até o fim do teste (inclusive) e vence no dia seguinte", () => {
    const t = nova({ situacao: "teste", teste_ate: "2026-10-13", vence_em: null });
    expect(situacaoEfetiva(t, "2026-10-13")).toBe("teste");
    expect(situacaoEfetiva(t, "2026-10-14")).toBe("vencida");
  });
  it("ativa até o vencimento; vencida NO DIA SEGUINTE (tolerância 0 nas contas novas)", () => {
    expect(situacaoEfetiva(nova(), "2026-10-13")).toBe("ativa");
    expect(situacaoEfetiva(nova(), "2026-10-14")).toBe("vencida");
    expect(travaDoPainel(nova(), "2026-10-13")).toMatchObject({ travado: false });
    expect(travaDoPainel(nova(), "2026-10-14")).toEqual({ travado: true, motivo: "vencida", desde: "2026-10-14" });
  });
  it("legado Calc: 7 dias de tolerância depois do vencimento", () => {
    const calc = nova({ tolerancia_dias: 7 });
    expect(situacaoEfetiva(calc, "2026-10-20")).toBe("ativa");
    expect(situacaoEfetiva(calc, "2026-10-21")).toBe("vencida");
    expect(fimDoAcesso(calc)).toBe("2026-10-20");
  });
  it("isenta nunca vence; suspensa e cancelada travam sempre; o master nunca fica travado", () => {
    expect(situacaoEfetiva(nova({ situacao: "isenta", vence_em: "2020-01-01" }), HOJE)).toBe("isenta");
    expect(travaDoPainel(nova({ situacao: "isenta", vence_em: "2020-01-01" }), HOJE).travado).toBe(false);
    expect(travaDoPainel(nova({ situacao: "suspensa" }), HOJE)).toMatchObject({ travado: true, motivo: "suspensa" });
    expect(travaDoPainel(nova({ situacao: "cancelada" }), HOJE)).toMatchObject({ travado: true, motivo: "cancelada" });
    expect(travaDoPainel(nova({ vence_em: "2026-01-01" }), HOJE, true).travado).toBe(false);
  });
  it("a situação guardada 'ativa' com o vencimento passado já trava (a tarefa das 03:40 só confirma)", () => {
    expect(situacaoEfetiva(nova({ situacao: "ativa", vence_em: "2026-09-28" }), HOJE)).toBe("vencida");
    expect(situacaoEfetiva(nova({ situacao: "vencida", vence_em: "2026-10-30" }), HOJE)).toBe("ativa"); // pagou
  });
});

describe("pagamento aprovado (6.2, P27 — spec 10.1)", () => {
  it("Pix/cartão: +1 mês a partir do maior entre o vencimento, o fim do teste e hoje (ninguém perde dia)", () => {
    expect(vencimentoDepoisDoPagamento(nova({ vence_em: "2026-10-13" }), 1, HOJE)).toEqual({ base: "2026-10-13", vence: "2026-11-13" });
    expect(vencimentoDepoisDoPagamento(nova({ vence_em: "2026-09-01" }), 1, HOJE)).toEqual({ base: HOJE, vence: "2026-10-29" });
    expect(vencimentoDepoisDoPagamento(nova({ situacao: "teste", teste_ate: "2026-10-13", vence_em: null }), 1, HOJE).vence).toBe("2026-11-13");
  });
  it("anual = +12 meses; fim de mês trava no último dia (31/01 + 1 mês = 28/02)", () => {
    expect(vencimentoDepoisDoPagamento(nova({ vence_em: "2026-10-13" }), 12, HOJE).vence).toBe("2027-10-13");
    expect(somarMeses("2027-01-31", 1)).toBe("2027-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("legado Nutri: Pix +30 dias", () => {
    expect(vencimentoDepoisDoPagamento(nova({ vence_em: "2026-10-13", regra_pix: "30dias" }), 1, HOJE).vence).toBe("2026-11-12");
  });
  it("cobrança automática: 1ª cobrança no fim do teste/mês pago; sem cobertura, na hora", () => {
    expect(primeiraCobrancaDaAssinatura({ teste_ate: "2026-10-13", vence_em: null }, HOJE)).toBe("2026-10-13");
    expect(primeiraCobrancaDaAssinatura({ teste_ate: "2026-09-01", vence_em: "2026-09-20" }, HOJE)).toBeNull();
    expect(primeiraCobrancaDaAssinatura({ teste_ate: null, vence_em: HOJE }, HOJE)).toBeNull();
  });
});

describe("faixa de aviso −7/−2/−1/0 (6.2 — spec 10.1)", () => {
  it("marcos: 7 (de 7 a 3 dias), 2, 1 e 0; fora disso, nada", () => {
    expect([8, 7, 5, 3, 2, 1, 0, -1].map(marcoDoAviso)).toEqual([null, 7, 7, 7, 2, 1, 0, null]);
  });
  it("Pix avisa; recorrente não avisa; vencida e isenta não avisam (a trava fala por elas)", () => {
    expect(avisoDoPlano(nova({ vence_em: "2026-10-06" }), HOJE, false)).toMatchObject({ marco: 7, dias: 7, teste: false });
    expect(avisoDoPlano(nova({ vence_em: "2026-10-01" }), HOJE, false)).toMatchObject({ marco: 2 });
    expect(avisoDoPlano(nova({ vence_em: HOJE }), HOJE, false)).toMatchObject({ marco: 0, dias: 0 });
    expect(avisoDoPlano(nova({ vence_em: "2026-10-01" }), HOJE, true)).toBeNull();
    expect(avisoDoPlano(nova({ vence_em: "2026-09-28" }), HOJE, false)).toBeNull();
    expect(avisoDoPlano(nova({ situacao: "isenta" }), HOJE, false)).toBeNull();
    expect(avisoDoPlano(nova({ vence_em: "2026-10-20" }), HOJE, false)).toBeNull();
  });
  it("o fim do teste também avisa, com o texto do teste", () => {
    const a = avisoDoPlano(nova({ situacao: "teste", teste_ate: "2026-09-30", vence_em: null }), HOJE, false)!;
    expect(a).toMatchObject({ marco: 1, teste: true });
    expect(textoDoAviso(a)).toBe("Seu teste grátis termina amanhã (30/09). Escolha um plano para continuar.");
  });
  it("chave do X e textos", () => {
    expect(chaveDoAviso("c1", "2026-10-06", 7)).toBe("aviso-plano:c1:2026-10-06:7");
    expect(textoDoAviso({ marco: 7, dias: 5, vence: "2026-10-04", teste: false }, 59.9)).toMatch(/^Seu plano de R\$\s?59,90 vence em 5 dias \(04\/10\)\.$/);
    expect(textoDoAviso({ marco: 0, dias: 0, vence: HOJE, teste: false })).toBe("Seu plano vence hoje. Pague para não ficar sem acesso ao painel amanhã.");
  });
});

describe("W28 — legado Calc no núcleo: 7 dias de tolerância depois do vencimento", () => {
  // vence 13/10; o painel abre até 20/10 (inclusive) e trava em 21/10
  const calc = (o: Partial<DatasConta> = {}) => nova({ vence_em: "2026-10-13", tolerancia_dias: 7, ...o });
  it("vencimento sem a tolerância × último dia com acesso; nas contas novas os 2 são o mesmo dia", () => {
    expect(vencimentoDoPlano(calc())).toBe("2026-10-13");
    expect(fimDoAcesso(calc())).toBe("2026-10-20");
    expect(vencimentoDoPlano(nova())).toBe(fimDoAcesso(nova()));
    expect(vencimentoDoPlano(nova({ situacao: "teste", teste_ate: "2026-10-13", vence_em: null }))).toBe("2026-10-13");
    expect(vencimentoDoPlano(nova({ situacao: "isenta" }))).toBeNull();
  });
  it("em tolerância: depois do vencimento até vence + 7 (não no teste, nem isenta/suspensa)", () => {
    expect([calc(), calc(), calc(), calc()].map((c, i) => emTolerancia(c, ["2026-10-13", "2026-10-14", "2026-10-20", "2026-10-21"][i])))
      .toEqual([false, true, true, false]);
    expect(emTolerancia(nova({ vence_em: "2026-10-13" }), "2026-10-14")).toBe(false);
    expect(emTolerancia(calc({ situacao: "suspensa" }), "2026-10-15")).toBe(false);
    expect(emTolerancia(calc({ teste_ate: "2026-10-16" }), "2026-10-15")).toBe(false);
  });
  it("antes do vencimento os marcos −7/−2/−1/0 contam do vence_em (o dia 0 é o vencimento)", () => {
    expect(avisoDoPlano(calc(), "2026-10-06", false)).toMatchObject({ marco: 7, dias: 7, vence: "2026-10-13", ate: "2026-10-20" });
    expect(avisoDoPlano(calc(), "2026-10-11", false)).toMatchObject({ marco: 2, vence: "2026-10-13" });
    expect(avisoDoPlano(calc(), "2026-10-12", false)).toMatchObject({ marco: 1, vence: "2026-10-13" });
    expect(avisoDoPlano(calc(), "2026-10-13", false)).toMatchObject({ marco: 0, dias: 0, vence: "2026-10-13" });
    expect(avisoDoPlano(calc(), "2026-10-05", false)).toBeNull();
  });
  it("nos dias de tolerância: a faixa 'pague até' (urgente); depois dela o painel trava e a faixa some", () => {
    const a = avisoDoPlano(calc(), "2026-10-15", false)!;
    expect(a).toEqual({ marco: "tolerancia", dias: 5, vence: "2026-10-13", teste: false, ate: "2026-10-20" });
    expect(textoDoAviso(a, 39.9)).toMatch(/^Mensalidade de R\$\s?39,90 venceu em 13\/10\. Pague até 20\/10 para não perder o acesso\.$/);
    expect(textoDoAviso(a)).toBe("Sua mensalidade venceu em 13/10. Pague até 20/10 para não perder o acesso.");
    expect(avisoDoPlano(calc(), "2026-10-20", false)).toMatchObject({ marco: "tolerancia", dias: 0 });
    expect(avisoDoPlano(calc(), "2026-10-21", false)).toBeNull();
    expect(travaDoPainel(calc(), "2026-10-21")).toEqual({ travado: true, motivo: "vencida", desde: "2026-10-21" });
    expect(avisoDoPlano(calc(), "2026-10-15", true)).toBeNull(); // cobrança automática não avisa
  });
  it("o X da tolerância vale só no dia (a chave leva o dia de hoje); os outros marcos, como antes", () => {
    expect(chaveDoAviso("c1", "2026-10-13", "tolerancia", "2026-10-15")).toBe("aviso-plano:c1:2026-10-13:tolerancia:2026-10-15");
    expect(chaveDoAviso("c1", "2026-10-13", "tolerancia", "2026-10-16")).not.toBe(chaveDoAviso("c1", "2026-10-13", "tolerancia", "2026-10-15"));
    expect(chaveDoAviso("c1", "2026-10-13", 2, "2026-10-11")).toBe("aviso-plano:c1:2026-10-13:2");
  });
  it("no dia do vencimento, com tolerância, o texto manda pagar até o fim dela (o painel não trava amanhã)", () => {
    expect(textoDoAviso(avisoDoPlano(calc(), "2026-10-13", false)!)).toBe("Seu plano vence hoje. Pague até 20/10 para não perder o acesso.");
  });
  it("conta nova (tolerância 0) segue igual: o aviso não ganha o 'ate'", () => {
    expect(avisoDoPlano(nova({ vence_em: HOJE }), HOJE, false)).toEqual({ marco: 0, dias: 0, vence: HOJE, teste: false });
  });
});

describe("W28 — trocar de plano tira a conta do preço e das regras de hoje", () => {
  it("o aviso antes de trocar (Mudar plano × outro plano escolhido na hora de pagar)", () => {
    expect(textoSaiDoLegado(39.9, 59.9)).toMatch(
      /^Ao trocar de plano, o preço de hoje \(R\$\s?39,90\/mês\) e as regras de hoje deixam de valer: passam a ser os da tabela nova \(R\$\s?59,90\/mês, a partir do próximo pagamento\)\.$/);
    expect(textoSaiDoLegado(80, 39.9, "pagar")).toMatch(/\(R\$\s?39,90\/mês, já neste pagamento\)\.$/);
    expect(textoSaiDoLegado(null, null)).toBe("Ao trocar de plano, o preço de hoje e as regras de hoje deixam de valer: passam a ser os da tabela nova (a partir do próximo pagamento).");
  });
});

describe("faixa e limite de alunos (6.4 — spec 10.1)", () => {
  it("conta só o aluno ativo: bloqueado e desativado liberam a vaga", () => {
    expect(contarAlunosAtivos([
      { ativo: true }, { ativo: true, acesso_bloqueado_em: "2026-09-01" }, { ativo: false }, { ativo: true, deleted_at: "2026-09-02" }, { ativo: true },
    ])).toBe(2);
  });
  it("limite: teste 10; faixa do plano; legado Nutri sem limite; legado Calc a faixa dele", () => {
    expect(limiteDaConta({ origem: "nova", situacao: "teste", plano: "treino_nutricao", faixa: "f10" })).toBe(10);
    expect(limiteDaConta({ origem: "nova", situacao: "ativa", plano: "treino", faixa: "f30" })).toBe(30);
    expect(limiteDaConta({ origem: "nova", situacao: "ativa", plano: "treino", faixa: "livre" })).toBeNull();
    expect(limiteDaConta({ origem: "legado_nutri", situacao: "ativa", plano: "nutricao", faixa: "livre" })).toBeNull();
    expect(limiteDaConta({ origem: "legado_calc", situacao: "ativa", plano: "treino", faixa: "f100" })).toBe(100);
    expect([podeAdicionarAluno(9, 10), podeAdicionarAluno(10, 10), podeAdicionarAluno(500, null)]).toEqual([true, false, true]);
  });
  it("W28: com o preço e as regras de hoje o legado segue com o limite de hoje; trocar de plano = a regra das contas novas", () => {
    const nutri = { origem: "legado_nutri", situacao: "ativa" as const, plano: "nutricao" as const, faixa: "f10" as const };
    expect(limiteDaConta({ ...nutri, cobranca_legada: false, regras_legadas: true })).toBeNull();
    expect(limiteDaConta({ ...nutri, cobranca_legada: true, regras_legadas: false })).toBeNull();
    expect(limiteDaConta({ ...nutri, cobranca_legada: false, regras_legadas: false })).toBe(10);
    const calcTeste = { origem: "legado_calc", situacao: "teste" as const, plano: "treino" as const, faixa: "f30" as const };
    expect(limiteDaConta({ ...calcTeste, cobranca_legada: false, regras_legadas: true })).toBe(30);
    expect(limiteDaConta({ ...calcTeste, cobranca_legada: false, regras_legadas: false })).toBe(10);
  });
  it("mensagem do limite (dono × outro membro)", () => {
    expect(mensagemLimite(10, true)).toBe("Seu plano permite 10 alunos ativos. Mude de faixa em Configurações › Plano.");
    expect(mensagemLimite(10, false, "Lucas")).toBe("O plano da conta permite 10 alunos ativos. Fale com Lucas.");
  });
});

describe("mudar de plano (regra do Calc — 6.2)", () => {
  it("subir vale na hora; descer só se os alunos couberem; tirar módulo avisa", () => {
    expect(avaliarMudanca({ plano: "treino", faixa: "f10" }, { plano: "treino", faixa: "f30" }, 8)).toEqual({ ok: true, sobe: true, perdeModulo: false });
    expect(avaliarMudanca({ plano: "treino", faixa: "f30" }, { plano: "treino", faixa: "f10" }, 12)).toEqual({ ok: false, erro: "alunos_acima_do_limite", limite: 10 });
    expect(avaliarMudanca({ plano: "treino", faixa: "f30" }, { plano: "treino", faixa: "f10" }, 10)).toMatchObject({ ok: true, sobe: false });
    expect(avaliarMudanca({ plano: "treino_nutricao", faixa: "f10" }, { plano: "treino", faixa: "f10" }, 3)).toMatchObject({ ok: true, perdeModulo: true });
    expect(avaliarMudanca({ plano: "treino", faixa: "f10" }, { plano: "treino", faixa: "f10" }, 3)).toEqual({ ok: false, erro: "mesmo_plano" });
  });
});

describe("card do plano no menu (tela 6) — conta nova", () => {
  const conta = (o: Partial<ContaSituacao> = {}): ContaSituacao => ({
    id: "c1", nome: "Consultoria", origem: "nova", plano: "treino_nutricao", modulos: ["treino", "nutricao"], faixa: "f10",
    periodicidade: "mensal", situacao: "ativa", teste_ate: null, vence_em: "2026-10-20", tolerancia_dias: 0, cobranca_legada: false,
    isenta_motivo: null, alunos_bloqueados_em: null, alunos_bloqueados_msg: null, dono_id: "u1", dono_nome: "Lucas", membro_id: "m1",
    papeis: ["dono", "personal"], codigo_convite: "PROF-LUCAS", profissionais: 1, alunos_ativos: 3, limite_alunos: 10, ...o,
  });
  it("teste, Pix, cartão recorrente, vencida, suspensa, isenta", () => {
    expect(planoCartaoContaNova(conta({ situacao: "teste", teste_ate: "2026-10-13", vence_em: null }), HOJE))
      .toEqual({ nome: "Plano Treino + Nutrição", modulos: ["treino", "nutricao"], linha: "Teste até 13/10", tom: "neutro" });
    expect(planoCartaoContaNova(conta(), HOJE)).toMatchObject({ linha: "Vence em 20/10 · Pix", tom: "ok" });
    expect(planoCartaoContaNova(conta({ vence_em: "2026-10-01" }), HOJE)).toMatchObject({ linha: "Vence em 01/10 · Pix", tom: "aviso" });
    expect(planoCartaoContaNova(conta({ assinatura: { status: "authorized", proximo_vencimento: "2026-10-20T12:00:00-03:00", valor: 59.9 } }), HOJE))
      .toMatchObject({ linha: "Renova em 20/10 · cartão", tom: "ok" });
    // renova no fim do que está pago (vence_em), mesmo que o MP ainda mostre a data anterior
    expect(planoCartaoContaNova(conta({ vence_em: "2026-11-20", assinatura: { status: "authorized", proximo_vencimento: "2026-10-20T12:00:00-03:00", valor: 59.9 } }), HOJE))
      .toMatchObject({ linha: "Renova em 20/11 · cartão" });
    expect(planoCartaoContaNova(conta({ vence_em: "2026-09-20" }), HOJE)).toMatchObject({ linha: "Venceu em 20/09", tom: "erro" });
    expect(planoCartaoContaNova(conta({ situacao: "suspensa" }), HOJE)).toMatchObject({ linha: "Conta suspensa", tom: "erro" });
    expect(planoCartaoContaNova(conta({ situacao: "isenta", plano: "treino", modulos: ["treino"] }), HOJE)).toMatchObject({ nome: "Plano Treino", linha: "Sem cobrança" });
  });
  it("W28 — legado Calc no núcleo (tolerância de 7 dias): vence no vence_em, 'pague até' na tolerância e 'Venceu em' sem os 7 dias", () => {
    const calc = (o: Partial<ContaSituacao> = {}) => conta({ origem: "legado_calc", plano: "treino", modulos: ["treino"], vence_em: "2026-10-01", tolerancia_dias: 7, regras_legadas: true, ...o });
    expect(planoCartaoContaNova(calc(), HOJE)).toMatchObject({ linha: "Vence em 01/10 · Pix", tom: "aviso" });
    expect(planoCartaoContaNova(calc(), "2026-10-01")).toMatchObject({ linha: "Vence hoje · Pix" });
    expect(planoCartaoContaNova(calc(), "2026-10-04")).toMatchObject({ linha: "Venceu em 01/10 · pague até 08/10", tom: "erro" });
    expect(planoCartaoContaNova(calc(), "2026-10-09")).toMatchObject({ linha: "Venceu em 01/10", tom: "erro" });
  });
  it("conta isenta e a do master (planoCartaoConta — veio do planoLegado.ts, que saiu na W28)", () => {
    expect(planoCartaoConta(conta({ situacao: "teste", teste_ate: "2026-10-13" }))).toMatchObject({ nome: "Plano Treino + Nutrição", linha: "Teste até 13/10" });
    expect(planoCartaoConta(conta({ situacao: "vencida", vence_em: "2026-09-20" }))).toMatchObject({ linha: "Venceu em 20/09", tom: "erro" });
    expect(planoCartaoConta(conta({ situacao: "isenta", plano: "treino", modulos: ["treino"] }), true)).toMatchObject({ nome: "Conta master", linha: "Sem cobrança" });
    expect(planoCartaoConta(conta({ situacao: "isenta", plano: "treino", modulos: ["treino"] }))).toMatchObject({ nome: "Plano Treino", linha: "Sem cobrança", tom: "ok" });
  });
});
