// Physiq W-P — regras puras dos planos do aluno (desenho 2026-10-10 §3 + §7). Os mesmos números do banco: e2e/wp/sql_planos.py.
import { describe, expect, it } from "vitest";
import {
  aceitaAutomatica, descricaoDoPagamento, maxParcelasDoCartao, mesesCobertos, modalidadesDaConta, modalidadesOferecidas, nomeDoPeriodo,
  parcelaMensal, parcelasTotal, parcelasValidas, planoCompleto, precisaRenovar, proximaParcela, retratoDoPlano, sufixoDoValor, validarPlano,
  valorDoPagamento, type Modalidade, type PlanoDoAluno,
} from "./planos";

const anual: PlanoDoAluno = { id: "p1", nome: "Anual", valor: 1000, meses: 12, modalidades: ["avista", "cartao_parcelado", "mensal"],
  max_parcelas_cartao: 10, valor_parcela_mensal: null, ativo: true };
const soNome: PlanoDoAluno = { id: "p2", nome: "Amigos", valor: null, meses: 1, modalidades: ["avista"], max_parcelas_cartao: null,
  valor_parcela_mensal: null, ativo: true };
const TODAS: Modalidade[] = ["avista", "cartao_parcelado", "mensal"];

describe("plano completo e valores (B1, §7)", () => {
  it("plano só com nome (virada do Calc) não é completo e não oferece modalidade", () => {
    expect(planoCompleto(soNome)).toBe(false);
    expect(modalidadesOferecidas(soNome, "mercadopago")).toEqual([]);
  });
  it("parcela = valor ÷ meses com 2 casas; a digitada manda", () => {
    expect(parcelaMensal(anual)).toBe(83.33);
    expect(parcelaMensal({ ...anual, valor_parcela_mensal: 90 })).toBe(90);
  });
  it("valor de cada pagamento: o período todo no à vista/cartão, a parcela no mês a mês, o negociado manda", () => {
    expect(valorDoPagamento(anual, "avista", null)).toBe(1000);
    expect(valorDoPagamento(anual, "cartao_parcelado", null)).toBe(1000);
    expect(valorDoPagamento(anual, "mensal", null)).toBe(83.33);
    expect(valorDoPagamento(anual, "avista", 900)).toBe(900);
    expect(valorDoPagamento(anual, "mensal", 75.5)).toBe(75.5);
    expect(valorDoPagamento(soNome, "avista", null)).toBeNull();
  });
});

describe("cobertura e parcelas (§4.1, §7)", () => {
  it("o período todo cobre os meses do plano; o mês a mês e o modo de hoje cobrem 1", () => {
    expect(mesesCobertos("avista", 12)).toBe(12);
    expect(mesesCobertos("cartao_parcelado", 6)).toBe(6);
    expect(mesesCobertos("mensal", 12)).toBe(1);
    expect(mesesCobertos(null, 12)).toBe(1);
  });
  it("o 'de N' só no mês a mês de 2 meses ou mais", () => {
    expect(parcelasTotal("mensal", 12)).toBe(12);
    expect(parcelasTotal("mensal", 1)).toBeNull();
    expect(parcelasTotal("avista", 12)).toBeNull();
  });
  it("retrato: o modo de hoje não grava as colunas novas (o schema sem a migration não quebra)", () => {
    expect(retratoDoPlano({ plano_modalidade: null, plano: { meses: 12 } })).toEqual({});
    expect(retratoDoPlano({ plano_modalidade: "avista", plano: { meses: 12 } })).toEqual({ meses_cobertos: 12, parcelas_total: null });
    expect(retratoDoPlano({ plano_modalidade: "mensal", plano: { meses: 12 } })).toEqual({ meses_cobertos: 1, parcelas_total: 12 });
  });
  it("próxima parcela: 4 depois da 3; volta a 1 depois da 12 (P-A: renova) e quando troca de plano", () => {
    expect(proximaParcela({ num: 3, total: 12, plano: "p1" }, "p1", 12)).toEqual({ num: 4, total: 12 });
    expect(proximaParcela({ num: 12, total: 12, plano: "p1" }, "p1", 12)).toEqual({ num: 1, total: 12 });
    expect(proximaParcela({ num: 5, total: 12, plano: "outro" }, "p1", 12)).toEqual({ num: 1, total: 12 });
    expect(proximaParcela(null, "p1", 12)).toEqual({ num: 1, total: 12 });
    expect(proximaParcela(null, "p1", null)).toBeNull();
  });
});

describe("formas da conta (§3.6) e cartão (B2, I6)", () => {
  it("Pix manual e 'não cobrar' sem cartão parcelado; Mercado Pago com as 3; modo desconhecido sem nenhuma", () => {
    expect(modalidadesDaConta("pix_manual")).toEqual(["avista", "mensal"]);
    expect(modalidadesDaConta("nenhum")).toEqual(["avista", "mensal"]);
    expect(modalidadesDaConta("mercadopago")).toEqual(TODAS);
    expect(modalidadesDaConta("infinitepay")).toEqual([]);
    expect(modalidadesOferecidas(anual, "pix_manual")).toEqual(["avista", "mensal"]);
    expect(modalidadesOferecidas({ ...anual, ativo: false }, "mercadopago")).toEqual([]);
  });
  it("automática: mês a mês, plano de 1 mês e o modo de hoje (os 2 planos do app ficam iguais — B2)", () => {
    expect(aceitaAutomatica(null, null)).toBe(true);
    expect(aceitaAutomatica("mensal", 12)).toBe(true);
    expect(aceitaAutomatica("avista", 1)).toBe(true);
    expect(aceitaAutomatica("avista", 12)).toBe(false);
    expect(aceitaAutomatica("cartao_parcelado", 6)).toBe(false);
  });
  it("parcelas do cartão: 1 fora do cartão parcelado; até o máximo do plano nele", () => {
    expect(maxParcelasDoCartao("avista", 10)).toBe(1);
    expect(maxParcelasDoCartao("cartao_parcelado", 10)).toBe(10);
    expect(parcelasValidas(10, "cartao_parcelado", 10)).toBe(true);
    expect(parcelasValidas(11, "cartao_parcelado", 10)).toBe(false);
    expect(parcelasValidas(2, "avista", 10)).toBe(false);
    expect(parcelasValidas(1, null, null)).toBe(true);
    expect(parcelasValidas("3", "cartao_parcelado", 10)).toBe(false);
  });
});

describe("textos (§7: '/mês' muda conforme a modalidade) e renovar", () => {
  it("sufixo e nome do período", () => {
    expect(sufixoDoValor(null, null)).toBe("/mês");
    expect(sufixoDoValor("mensal", 12)).toBe("/mês");
    expect(sufixoDoValor("avista", 1)).toBe("/mês");
    expect(sufixoDoValor("avista", 12)).toBe("/ano");
    expect(sufixoDoValor("cartao_parcelado", 6)).toBe(" por 6 meses");
    expect(nomeDoPeriodo(3)).toBe("Trimestral");
    expect(nomeDoPeriodo(9)).toBe("9 meses");
  });
  it("descrição da linha: o modo de hoje igual; o período todo e a parcela", () => {
    expect(descricaoDoPagamento("Amigos", null, 1, "2026-10-01", null)).toBe("Mensalidade · Amigos · Outubro/2026");
    expect(descricaoDoPagamento("Anual", "avista", 12, "2026-10-01", null)).toBe("Plano · Anual · 12 meses · Outubro/2026");
    expect(descricaoDoPagamento("Anual", "mensal", 12, "2026-10-01", { num: 4, total: 12 })).toBe("Plano · Anual · parcela 4 de 12 · Outubro/2026");
  });
  it("renovar = período todo já pago, vencendo ou vencido (o 1º pagamento é 'Pagar')", () => {
    expect(precisaRenovar("avista", "vence_em_breve", "2026-10-20T00:00:00Z")).toBe(true);
    expect(precisaRenovar("cartao_parcelado", "vencida", "2026-10-01T00:00:00Z")).toBe(true);
    expect(precisaRenovar("avista", "vencida", null)).toBe(false);
    expect(precisaRenovar("mensal", "vencida", "2026-10-01T00:00:00Z")).toBe(false);
    expect(precisaRenovar(null, "vencida", "2026-10-01T00:00:00Z")).toBe(false);
  });
});

describe("validarPlano (tela de Planos → servidor)", () => {
  it("aceita e normaliza (nome sem espaços sobrando, modalidades sem repetição e na ordem fixa)", () => {
    expect(validarPlano({ nome: "  Anual  ", meses: 12, valor: 1000, modalidades: ["mensal", "avista", "mensal"] }, TODAS)).toEqual({
      ok: true, plano: { nome: "Anual", meses: 12, valor: 1000, modalidades: ["avista", "mensal"], max_parcelas_cartao: null, valor_parcela_mensal: null },
    });
  });
  it("recusa o que não fecha", () => {
    expect(validarPlano({ nome: "", meses: 12, valor: 10, modalidades: ["avista"] }, TODAS)).toEqual({ ok: false, erro: "nome_invalido" });
    expect(validarPlano({ nome: "X", meses: 25, valor: 10, modalidades: ["avista"] }, TODAS)).toEqual({ ok: false, erro: "meses_invalido" });
    expect(validarPlano({ nome: "X", meses: 1, valor: 0, modalidades: ["avista"] }, TODAS)).toEqual({ ok: false, erro: "valor_invalido" });
    expect(validarPlano({ nome: "X", meses: 1, valor: 10, modalidades: [] }, TODAS)).toEqual({ ok: false, erro: "modalidades_invalidas" });
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["cartao_parcelado"] }, ["avista", "mensal"])).toEqual({ ok: false, erro: "modalidade_da_conta" });
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["cartao_parcelado"], max_parcelas_cartao: 13 }, TODAS)).toEqual({ ok: false, erro: "parcelas_invalidas" });
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["avista"], valor_parcela_mensal: 5 }, TODAS)).toEqual({ ok: false, erro: "parcela_sem_mensal" });
  });
});

describe("P-A (decisão dele, 10/10/2026: '1')", () => {
  it("depois da última parcela o plano renova: a contagem volta a 1 e a automática segue sem data de fim", () => {
    expect(proximaParcela({ num: 12, total: 12, plano: "p1" }, "p1", 12)).toEqual({ num: 1, total: 12 });
  });
});
