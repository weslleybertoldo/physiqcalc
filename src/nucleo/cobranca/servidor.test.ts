import { describe, expect, it } from "vitest";
import {
  avaliarMudanca as avaliarServidor,
  descricaoCobranca,
  erroDeCartao,
  inicioDaAssinatura,
  lerReferencia,
  precoDoPlano as precoServidor,
  preapprovalDoPagamento,
  proximaCobrancaDe,
  recusaDoSandbox,
  referenciaConta,
  situacaoEm,
  somarMeses as somarMesesServidor,
  statusAberto,
  statusDaAssinatura,
  statusDaFatura,
  vencimentoDepoisDoPagamento as vencimentoServidor,
} from "../../../supabase-principal/functions/_shared/cobranca-regras";
import {
  PRECOS_PADRAO,
  avaliarMudanca,
  precoDoPlano,
  primeiraCobrancaDaAssinatura,
  situacaoEfetiva,
  somarMeses,
  vencimentoDepoisDoPagamento,
  type DatasConta,
} from "./regras";

const CONTA = "5b0f0d7e-3a2b-4c1d-9e8f-1a2b3c4d5e6f";
const FATURA = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("referência externa das cobranças (spec 6.6)", () => {
  it("physiq:<schema>:conta:<conta>:<tipo>[:<fatura>] vai e volta", () => {
    const ref = referenciaConta("staging", CONTA, "mensal", FATURA);
    expect(ref).toBe(`physiq:staging:conta:${CONTA}:mensal:${FATURA}`);
    expect(lerReferencia(ref)).toEqual({ schema: "staging", contaId: CONTA, tipo: "mensal", faturaId: FATURA });
    expect(lerReferencia(referenciaConta("public", CONTA, "recorrente"))).toEqual({ schema: "public", contaId: CONTA, tipo: "recorrente", faturaId: null });
  });
  it("as referências do Calc e do Nutri (e lixo) não são das contas", () => {
    expect(lerReferencia(`public:${CONTA}:2026-09-01:plano_professor:mensal`)).toBeNull();
    expect(lerReferencia(`physiqnutri:public:${CONTA}`)).toBeNull();
    expect(lerReferencia(`physiqnutri-pix:staging:${CONTA}`)).toBeNull();
    expect(lerReferencia(`physiq:dev:conta:${CONTA}:mensal`)).toBeNull();
    expect(lerReferencia(`physiq:public:conta:nao-e-uuid:mensal`)).toBeNull();
    expect(lerReferencia(`physiq:public:conta:${CONTA}:adesao`)).toBeNull();
    expect(lerReferencia(null)).toBeNull();
  });
});

describe("Mercado Pago → fatura e assinatura", () => {
  it("status do pagamento (Pix vencido chega como cancelled/expired)", () => {
    expect(statusDaFatura({ status: "approved" })).toBe("approved");
    expect(statusDaFatura({ status: "pending" })).toBe("pending");
    expect(statusDaFatura({ status: "in_process" })).toBe("in_process");
    expect(statusDaFatura({ status: "rejected" })).toBe("rejected");
    expect(statusDaFatura({ status: "cancelled", status_detail: "expired" })).toBe("expired");
    expect(statusDaFatura({ status: "cancelled", status_detail: "by_collector" })).toBe("cancelled");
    expect(statusDaFatura({ status: "refunded" })).toBe("refunded");
    expect(statusDaFatura({ status: "charged_back" })).toBe("charged_back");
    expect([statusAberto("pending"), statusAberto("in_process"), statusAberto("approved")]).toEqual([true, true, false]);
  });
  it("cobrança da assinatura: o id da assinatura vem em 2 lugares; próxima cobrança em 3", () => {
    expect(preapprovalDoPagamento({ metadata: { preapproval_id: "abc" } })).toBe("abc");
    expect(preapprovalDoPagamento({ point_of_interaction: { transaction_data: { subscription_id: "def" } } })).toBe("def");
    expect(preapprovalDoPagamento({})).toBeNull();
    expect(proximaCobrancaDe({ summarized: { next_payment_date: "2026-11-13T12:00:00.000-03:00" } })).toBe("2026-11-13T12:00:00.000-03:00");
    expect([statusDaAssinatura({ status: "authorized" }), statusDaAssinatura({ status: "estranho" })]).toEqual(["authorized", "pending"]);
  });
  it("o sandbox do MP recusa a assinatura com cartão (400 Resource not found / 404 Card token service not found)", () => {
    expect(recusaDoSandbox(400, { message: "Resource not found" })).toBe(true);
    expect(recusaDoSandbox(404, { message: "Card token service not found" })).toBe(true);
    expect(recusaDoSandbox(400, { message: "Invalid card_token_id" })).toBe(false);
    expect(recusaDoSandbox(500, { message: "Resource not found" })).toBe(false);
    expect(erroDeCartao(500, { message: "Preapproval creation failed" })).toBe(true);
    expect(erroDeCartao(502, { message: "timeout" })).toBe(false);
  });
  it("descrição da cobrança", () => {
    expect(descricaoCobranca("treino_nutricao", "f10", 1)).toBe("Physiq — Treino + Nutrição (até 10 alunos) — 1 mês");
    expect(descricaoCobranca("treino", "livre", 12)).toBe("Physiq — Só Treino (alunos sem limite) — 12 meses (anual)");
  });
});

describe("as regras do servidor e as da tela são as mesmas (contrato)", () => {
  const casos: DatasConta[] = [
    { situacao: "teste", teste_ate: "2026-10-13", vence_em: null, tolerancia_dias: 0 },
    { situacao: "ativa", teste_ate: "2026-09-10", vence_em: "2026-10-13", tolerancia_dias: 0 },
    { situacao: "ativa", teste_ate: null, vence_em: "2026-09-20", tolerancia_dias: 7 },
    { situacao: "vencida", teste_ate: "2026-09-01", vence_em: null, tolerancia_dias: 0 },
    { situacao: "isenta", teste_ate: null, vence_em: "2020-01-01", tolerancia_dias: 0 },
    { situacao: "suspensa", teste_ate: null, vence_em: "2027-01-01", tolerancia_dias: 0 },
    { situacao: "ativa", teste_ate: null, vence_em: "2026-01-31", tolerancia_dias: 0, regra_pix: "30dias" },
  ];
  const dias = ["2026-09-01", "2026-09-29", "2026-10-13", "2026-10-14", "2026-10-21", "2027-02-01"];
  it("situação num dia", () => {
    for (const c of casos) for (const d of dias) expect(situacaoEm(c, d)).toBe(situacaoEfetiva(c, d));
  });
  it("vencimento depois do pagamento (1 e 12 meses) e 1ª cobrança da assinatura", () => {
    for (const c of casos) {
      for (const d of dias) {
        expect(vencimentoServidor(c, 1, d)).toEqual(vencimentoDepoisDoPagamento(c, 1, d));
        expect(vencimentoServidor(c, 12, d)).toEqual(vencimentoDepoisDoPagamento(c, 12, d));
        const inicio = inicioDaAssinatura(c, d);
        const primeira = primeiraCobrancaDaAssinatura(c, d);
        expect(inicio ? inicio.slice(0, 10) : null).toBe(primeira);
        if (inicio) expect(inicio).toBe(`${primeira}T12:00:00.000-03:00`);
      }
    }
    for (const d of ["2026-01-31", "2026-03-31", "2028-02-29", "2026-12-15"]) expect(somarMesesServidor(d, 1)).toBe(somarMeses(d, 1));
  });
  it("preço e mudança de plano", () => {
    for (const linha of PRECOS_PADRAO) {
      for (const meses of [1, 12] as const) {
        expect(precoServidor({ valorTravado: null, tabela: { valor_mensal: linha.valor_mensal, valor_anual: linha.valor_anual }, meses }))
          .toBe(precoDoPlano(PRECOS_PADRAO, linha.plano, linha.faixa, meses));
      }
    }
    expect(precoServidor({ valorTravado: 1, tabela: null, meses: 12 })).toBe(10);
    const r = avaliarMudanca({ plano: "treino", faixa: "f30" }, { plano: "treino", faixa: "f10" }, 12);
    const rs = avaliarServidor({ atual: { plano: "treino", faixa: "f30" }, novo: { plano: "treino", faixa: "f10" }, alunosAtivos: 12, maxNovo: 10, temPreco: true });
    expect(rs).toEqual({ ok: false, erro: "alunos_acima_do_limite" });
    expect(r.ok).toBe(false);
    expect(avaliarServidor({ atual: { plano: "treino", faixa: "f10" }, novo: { plano: "treino", faixa: "f10" }, alunosAtivos: 1, maxNovo: 10, temPreco: true }))
      .toEqual({ ok: false, erro: "mesmo_plano" });
    expect(avaliarServidor({ atual: { plano: "treino", faixa: "f10" }, novo: { plano: "xpto", faixa: "f10" }, alunosAtivos: 1, maxNovo: 10, temPreco: true }))
      .toEqual({ ok: false, erro: "plano_invalido" });
  });
});
