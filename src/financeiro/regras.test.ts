import { describe, expect, it } from "vitest";
import { calcCobertura } from "../../supabase/functions/mp-payments/cobertura";
import {
  chipDaMensalidade,
  coberturaMensalidade,
  dataBR,
  diasEntre,
  estadoDaMensalidade,
  faixaDoAluno,
  formasDePagar,
  inadimplente,
  lerValor,
  linhaDaCobranca,
  mensagemErroFinanceiro,
  nomeDoMes,
  ordenarCobrancas,
  podePagarPeloApp,
  reais,
  reaisCurto,
  recusaVigente,
  rotuloDaForma,
  situacaoDaCobranca,
  textoDoVencimento,
  travaDoInadimplente,
} from "./regras";
import type { CobrancaVista, ResumoMatricula } from "./tipos";

// "agora" fixo: 29/09/2026 12:00 em São Paulo (15:00 UTC)
const AGORA = new Date("2026-09-29T15:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);

function cobranca(p: Partial<CobrancaVista> = {}): CobrancaVista {
  return {
    id: "c1", paciente_id: "p1", tipo: "mensalidade", descricao: "Mensalidade · Setembro/2026", valor: 249, vencimento: "2026-09-19",
    status: "aberta", forma: null, metodo: null, mes_ref: "2026-09-01", pago_em: null, enviado_em: null, cobre_de: null, cobre_ate: null,
    comprovante: false, comprovante_pdf: false, recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false,
    mp_simulado: false, transacao_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null,
    created_at: "2026-09-01T12:00:00Z", ...p,
  };
}

function resumo(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "c1", conta_nome: "Lucas Ferreira", recebimento_modo: "pix_manual", bloquear_inadimplente: false, tem_chave: true,
    profissional: "Lucas Ferreira", mensalidade_valor: 249, plano_nome: "Mensal", pausada: false, pago_ate: null, desde: null, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, ...p,
  };
}

describe("valores e datas", () => {
  it("reais e reaisCurto (chip R$ 249/MÊS da tela 7)", () => {
    expect(reais(249)).toBe("R$ 249,00");
    expect(reais("1234.5")).toBe("R$ 1.234,50");
    expect(reais(null)).toBe("—");
    expect(reaisCurto(249)).toBe("R$ 249");
    expect(reaisCurto(249.9)).toBe("R$ 249,90");
  });
  it("lerValor aceita o jeito brasileiro e recusa lixo", () => {
    expect(lerValor("249")).toBe(249);
    expect(lerValor("249,90")).toBe(249.9);
    expect(lerValor("R$ 1.234,56")).toBe(1234.56);
    expect(lerValor("1.234")).toBe(1234);
    expect(lerValor("0")).toBeNull();
    expect(lerValor("-5")).toBeNull();
    expect(lerValor("abc")).toBeNull();
    expect(lerValor("")).toBeNull();
  });
  it("datas no relógio de São Paulo", () => {
    expect(dataBR("2026-07-19")).toBe("19/07");
    expect(dataBR("2026-07-19", false)).toBe("19/07/2026");
    // 02:00 UTC do dia 20 ainda é dia 19 em São Paulo
    expect(dataBR("2026-07-20T02:00:00Z")).toBe("19/07");
    expect(diasEntre("2026-09-29", "2026-10-02")).toBe(3);
    expect(nomeDoMes("2026-07-01", "2026-09-29")).toBe("Julho");
    expect(nomeDoMes("2025-12-01", "2026-09-29")).toBe("Dezembro/2025");
  });
});

describe("mensalidade: a régua do Calc (cada pagamento cobre 1 mês)", () => {
  it("sem valor → sem mensalidade; pausada → cobrança parada", () => {
    expect(estadoDaMensalidade(null, AGORA).situacao).toBe("sem");
    expect(estadoDaMensalidade({ valor: 0, pausada: false, pago_ate: null, desde: null }, AGORA).situacao).toBe("sem");
    const e = estadoDaMensalidade({ valor: 249, pausada: true, pago_ate: null, desde: null }, AGORA);
    expect(e.situacao).toBe("pausada");
    expect(textoDoVencimento(e)).toBe("cobrança parada");
  });
  it("em dia (cobertura longe) e vence em breve (7 dias antes — a faixa âmbar)", () => {
    const longe = estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-10-20T15:00:00Z", desde: null }, AGORA);
    expect(longe.situacao).toBe("em_dia");
    expect(chipDaMensalidade(longe)).toEqual({ texto: "Em dia até 20/10", tom: "n" });
    const perto = estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-10-02T15:00:00Z", desde: null }, AGORA);
    expect(perto.situacao).toBe("vence_em_breve");
    expect(perto.dias).toBe(3);
    expect(textoDoVencimento(perto)).toBe("vence em 3 dias");
    expect(chipDaMensalidade(perto)).toEqual({ texto: "Vence em 3 dias", tom: "a" });
    expect(textoDoVencimento(estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-09-30T15:00:00Z", desde: null }, AGORA))).toBe("vence amanhã");
    expect(textoDoVencimento(estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-09-29T20:00:00Z", desde: null }, AGORA))).toBe("vence hoje");
  });
  it("vencida (a cobertura passou) e pendente (nunca pagou, sem data)", () => {
    const vencida = estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-09-19T15:00:00Z", desde: null }, AGORA);
    expect(vencida.situacao).toBe("vencida");
    expect(textoDoVencimento(vencida)).toBe("venceu em 19/09");
    expect(chipDaMensalidade(vencida)).toEqual({ texto: "Venceu em 19/09", tom: "r" });
    const pendente = estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: null, desde: null }, AGORA);
    expect(pendente.situacao).toBe("pendente");
    expect(textoDoVencimento(pendente)).toBe("está pendente");
  });
  it("nunca pagou com 1º vencimento no futuro → vence em breve; passado → vencida", () => {
    expect(estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: null, desde: "2026-10-01T12:00:00Z" }, AGORA).situacao).toBe("vence_em_breve");
    expect(estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: null, desde: "2026-09-01T12:00:00Z" }, AGORA).situacao).toBe("vencida");
  });
  it("comprovante aguardando a confirmação: nem vencida, nem faixa", () => {
    const e = estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-09-19T15:00:00Z", desde: null, aguardando: true }, AGORA);
    expect(e.situacao).toBe("aguardando");
    expect(chipDaMensalidade(e).tom).toBe("c");
    expect(faixaDoAluno([resumo({ pago_ate: "2026-09-19T15:00:00Z", aguardando: true })], AGORA)).toBeNull();
  });
});

describe("cobertura: o porte da tela casa com o Calc (supabase/functions/mp-payments/cobertura.ts)", () => {
  const casos: Array<[string, string[], number | null]> = [
    ["nunca pagou", [], null],
    ["um pagamento", ["2026-07-15"], null],
    ["atraso move o vencimento", ["2026-07-15", "2026-08-20"], null],
    ["adiantado preserva o dia", ["2026-07-15", "2026-08-10"], null],
    ["mês curto", ["2026-01-31"], null],
    ["assinatura no ciclo", ["2026-07-15", "2026-08-15"], 15],
    ["reposição do reembolsado", ["2026-07-20"], 15],
    ["histórico antes da assinatura", ["2026-06-15", "2026-07-15", "2026-08-15"], 15],
    ["fora de ordem", ["2026-08-10", "2026-07-15"], null],
    ["âncora 31 em fevereiro", ["2026-01-31"], 31],
    ["dois no mesmo dia", ["2026-09-01", "2026-09-01"], null],
  ];
  it.each(casos)("%s", (_nome, datas, ancora) => {
    const pags = datas.map(d);
    expect(coberturaMensalidade(pags, ancora)?.toISOString() ?? null).toBe(calcCobertura(pags, ancora)?.toISOString() ?? null);
  });
});

describe("inadimplência e a trava do app (R15, P13)", () => {
  it("mensalidade vencida ou avulsa vencida em aberto = inadimplente; aguardando não conta", () => {
    expect(inadimplente(resumo({ pago_ate: "2026-09-19T15:00:00Z" }), AGORA)).toBe(true);
    expect(inadimplente(resumo({ pago_ate: "2026-10-20T15:00:00Z" }), AGORA)).toBe(false);
    expect(inadimplente(resumo({ pago_ate: "2026-09-19T15:00:00Z", aguardando: true }), AGORA)).toBe(false);
    expect(inadimplente(resumo({ mensalidade_valor: null, abertas: [{ id: "a", descricao: "Consulta", valor: 180, vencimento: "2026-09-28" }] }), AGORA)).toBe(true);
    expect(inadimplente(resumo({ mensalidade_valor: null, abertas: [{ id: "a", descricao: "Consulta", valor: 180, vencimento: "2026-09-29" }] }), AGORA)).toBe(false);
    expect(inadimplente(resumo({ pausada: true }), AGORA)).toBe(false);
  });
  it("a trava só vale com a opção da conta ligada", () => {
    const r = resumo({ pago_ate: "2026-09-19T15:00:00Z" });
    expect(travaDoInadimplente(r, AGORA)).toBe(false);
    expect(travaDoInadimplente({ ...r, bloquear_inadimplente: true }, AGORA)).toBe(true);
  });
  it("pagar pelo app: Mercado Pago, ou Pix na chave (R16); sem chave ou 'não cobrar' = combinar", () => {
    expect(podePagarPeloApp("mercadopago", false)).toBe(true);
    expect(podePagarPeloApp("pix_manual", true)).toBe(true);
    expect(podePagarPeloApp("pix_manual", false)).toBe(false);
    expect(podePagarPeloApp("nenhum", true)).toBe(false);
    expect(formasDePagar("mercadopago", false)).toBe("Pix ou cartão");
    expect(formasDePagar("pix_manual", true)).toBe("Pix");
    expect(formasDePagar("nenhum", false)).toBe("combine com seu profissional");
  });
});

describe("faixa do topo (tela 1; A13)", () => {
  it("'Sua mensalidade vence em 3 dias · R$ 249,00 · Pix' âmbar com Pagar", () => {
    const f = faixaDoAluno([resumo({ pago_ate: "2026-10-02T15:00:00Z" })], AGORA)!;
    expect(f).toMatchObject({ tom: "a", titulo: "Sua mensalidade vence em 3 dias", subtitulo: "R$ 249,00 · Pix", podePagar: true, alvo: { tipo: "mensalidade" } });
  });
  it("vencida fica vermelha; em dia e sem mensalidade não mostram", () => {
    expect(faixaDoAluno([resumo({ pago_ate: "2026-09-19T15:00:00Z" })], AGORA)?.tom).toBe("r");
    expect(faixaDoAluno([resumo({ pago_ate: "2026-10-20T15:00:00Z" })], AGORA)).toBeNull();
    expect(faixaDoAluno([resumo({ mensalidade_valor: null })], AGORA)).toBeNull();
    expect(faixaDoAluno(null, AGORA)).toBeNull();
  });
  it("cobrança avulsa do Nutri entra (7 dias antes); a mais urgente primeiro", () => {
    const f = faixaDoAluno([
      resumo({ pago_ate: "2026-10-04T15:00:00Z" }),
      resumo({ paciente_id: "p2", mensalidade_valor: null, abertas: [{ id: "cob-1", descricao: "Consulta", valor: 180, vencimento: "2026-09-27" }] }),
    ], AGORA)!;
    expect(f).toMatchObject({ tom: "r", titulo: "Consulta venceu em 27/09", alvo: { tipo: "avulsa", id: "cob-1" }, pacienteId: "p2" });
    expect(faixaDoAluno([resumo({ mensalidade_valor: null, abertas: [{ id: "x", descricao: "Consulta", valor: 180, vencimento: "2026-10-20" }] })], AGORA)).toBeNull();
  });
  it("sem como pagar pelo app: 'combine com <nome>' e o botão vira Ver", () => {
    const f = faixaDoAluno([resumo({ recebimento_modo: "nenhum", pago_ate: "2026-09-19T15:00:00Z" })], AGORA)!;
    expect(f.podePagar).toBe(false);
    expect(f.subtitulo).toBe("R$ 249,00 · combine com Lucas");
  });
});

describe("linhas das cobranças (telas 5 e 7)", () => {
  const hoje = "2026-09-29";
  it("paga por Pix na chave: 'Julho · Pix · pago em 18/07'", () => {
    const l = linhaDaCobranca(cobranca({ status: "paga", forma: "pix_manual", mes_ref: "2026-07-01", pago_em: "2026-07-18T15:00:00Z" }), hoje);
    expect(l).toEqual({ titulo: "Julho", valor: "R$ 249,00", detalhe: "Pix · pago em 18/07", situacao: "paga" });
  });
  it("aguardando, processando no MP, recusada, estornada e por fora", () => {
    expect(situacaoDaCobranca(cobranca({ status: "aguardando_confirmacao", forma: "pix_manual" }), hoje)).toBe("aguardando");
    expect(situacaoDaCobranca(cobranca({ status: "aguardando_confirmacao", forma: "mp" }), hoje)).toBe("aguardando_mp");
    expect(situacaoDaCobranca(cobranca({ status: "cancelada", recusado_em: "2026-09-20T12:00:00Z" }), hoje)).toBe("recusada");
    expect(situacaoDaCobranca(cobranca({ status: "cancelada", reembolsado_em: "2026-09-20T12:00:00Z" }), hoje)).toBe("reembolsada");
    expect(linhaDaCobranca(cobranca({ status: "cancelada", recusado_em: "2026-09-20T12:00:00Z", recusado_motivo: "valor errado" }), hoje).detalhe).toBe("Recusado: valor errado");
    expect(rotuloDaForma({ forma: "manual", metodo: "dinheiro" })).toBe("Por fora · Dinheiro");
    expect(rotuloDaForma({ forma: "mp", metodo: "pix" })).toBe("Pix (Mercado Pago)");
    expect(rotuloDaForma({ forma: "mp", metodo: "credit_card" })).toBe("Cartão");
  });
  it("avulsa em aberto: a vencer x vencida", () => {
    const a = cobranca({ tipo: "avulsa", descricao: "Consulta", valor: 180, vencimento: "2026-10-05", mes_ref: null });
    expect(linhaDaCobranca(a, hoje)).toMatchObject({ titulo: "Consulta", detalhe: "Vence em 05/10", situacao: "a_vencer" });
    expect(linhaDaCobranca({ ...a, vencimento: "2026-09-20" }, hoje)).toMatchObject({ detalhe: "Venceu em 20/09", situacao: "vencida" });
  });
  it("ordem do histórico: aguardando, em aberto e depois o mais novo", () => {
    const lista = [
      cobranca({ id: "velha", status: "paga", pago_em: "2026-07-18T15:00:00Z" }),
      cobranca({ id: "aberta", status: "aberta", tipo: "avulsa" }),
      cobranca({ id: "nova", status: "paga", pago_em: "2026-08-18T15:00:00Z" }),
      cobranca({ id: "aguardando", status: "aguardando_confirmacao", forma: "pix_manual" }),
    ];
    expect(ordenarCobrancas(lista).map((c) => c.id)).toEqual(["aguardando", "aberta", "nova", "velha"]);
  });
  it("recusa vigente: só enquanto o último envio da mensalidade é o recusado", () => {
    const recusada = cobranca({ id: "r", status: "cancelada", forma: "pix_manual", recusado_em: "2026-09-20T12:00:00Z", created_at: "2026-09-20T10:00:00Z" });
    expect(recusaVigente([recusada])?.id).toBe("r");
    const reenviada = cobranca({ id: "n", status: "aguardando_confirmacao", forma: "pix_manual", created_at: "2026-09-21T10:00:00Z" });
    expect(recusaVigente([recusada, reenviada])).toBeNull();
  });
  it("mensagens de erro para a pessoa (código desconhecido → a padrão)", () => {
    expect(mensagemErroFinanceiro("sem_chave_pix")).toBe("Seu profissional ainda não cadastrou a chave Pix.");
    expect(mensagemErroFinanceiro("xyz", "padrão")).toBe("padrão");
    expect(mensagemErroFinanceiro(null)).toBe("Não deu certo agora. Tente de novo.");
  });
});
