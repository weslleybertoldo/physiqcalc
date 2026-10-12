import { describe, expect, it } from "vitest";
import { calcCobertura } from "../../supabase/functions/mp-payments/cobertura";
import {
  CHIP_COBRANCA,
  MENSAGEM_ERRO_FINANCEIRO,
  RESULTADOS_DA_VOLTA,
  chipDaConexaoMp,
  chipDaMensalidade,
  coberturaMensalidade,
  dataBR,
  diasEntre,
  estadoDaMensalidade,
  faixaDoAluno,
  formasDePagar,
  inadimplente,
  lerValor,
  lerVoltaDoMp,
  linhaDaCobranca,
  mensalidadeAguardando,
  mensagemDoMpConta,
  mensagemDoProfissional,
  mensagemDoRecebimento,
  mensagemErroFinanceiro,
  nomeDoMes,
  ordenarCobrancas,
  perguntaDaConexaoMp,
  podePagarPeloApp,
  reais,
  reaisCurto,
  recusaVigente,
  rotuloDaForma,
  situacaoDaCobranca,
  textoDoVencimento,
  travaDoInadimplente,
} from "./regras";
import { TEXTO_DO_RETORNO, situacaoDoMp } from "./mpConta";
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
  it("W-P: no plano do período todo a faixa fala do plano; no mês a mês, da mensalidade", () => {
    const base = { paciente_id: "p", conta_id: "c", conta_nome: "C", recebimento_modo: "pix_manual" as const, bloquear_inadimplente: false,
      tem_chave: true, profissional: "Lucas", mensalidade_valor: 1000, plano_nome: "Anual", pausada: false, aguardando: false,
      assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, desde: null };
    const agora = new Date("2026-10-10T15:00:00Z");
    expect(faixaDoAluno([{ ...base, pago_ate: "2026-10-12T12:00:00Z", modalidade: "avista", plano_meses: 12 }], agora)!.titulo).toBe("Seu plano vence em 2 dias");
    expect(faixaDoAluno([{ ...base, pago_ate: "2026-10-12T12:00:00Z", modalidade: "mensal", plano_meses: 12 }], agora)!.titulo).toBe("Sua mensalidade vence em 2 dias");
  });
  it("W-P: o plano de 1 mês fala da mensalidade (igual ao '/mês' da tela); 'Seu plano' só no período todo com mais de 1 mês", () => {
    const titulo = (p: Partial<ResumoMatricula>) => faixaDoAluno([resumo({ pago_ate: "2026-10-02T15:00:00Z", ...p })], AGORA)!.titulo;
    expect(titulo({ modalidade: "avista", plano_meses: 1 })).toBe("Sua mensalidade vence em 3 dias");
    expect(titulo({ modalidade: "cartao_parcelado", plano_meses: 1 })).toBe("Sua mensalidade vence em 3 dias");
    expect(titulo({ modalidade: "cartao_parcelado", plano_meses: 6 })).toBe("Seu plano vence em 3 dias");
    expect(titulo({ modalidade: "mensal", plano_meses: 1 })).toBe("Sua mensalidade vence em 3 dias");
    expect(titulo({ modalidade: null, plano_meses: null })).toBe("Sua mensalidade vence em 3 dias");
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
  it("W1b (revisão M2): o 409 cobranca_de_outro_pagamento é permanente — frase própria, nunca o 'Tente de novo'", () => {
    expect(mensagemErroFinanceiro("cobranca_de_outro_pagamento")).toBe("Esse pagamento do Mercado Pago não é desta cobrança. Fale com o suporte.");
    expect(mensagemErroFinanceiro("cobranca_de_outro_pagamento", "padrão")).not.toMatch(/tente de novo|padrão/i);
  });
});

describe("W1 — a InfinitePay nas regras da tela", () => {
  const cob = (x: Partial<CobrancaVista> = {}): CobrancaVista => ({
    id: "c1", paciente_id: "p1", tipo: "mensalidade", descricao: "Mensalidade · Outubro/2026", valor: 100, vencimento: "2026-10-10", status: "aberta",
    forma: null, metodo: null, mes_ref: "2026-10-01", pago_em: null, enviado_em: null, cobre_de: null, cobre_ate: null, comprovante: false,
    comprovante_pdf: false, recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false, mp_simulado: false,
    transacao_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null, created_at: "2026-10-10T12:00:00Z", ...x,
  });
  it("o aluno paga pelo app (Pix ou cartão), sem chave Pix", () => {
    expect(podePagarPeloApp("infinitepay", false)).toBe(true);
    expect(formasDePagar("infinitepay", false)).toBe("Pix ou cartão");
  });
  it("o rótulo da forma: Pix, cartão em N× ou só InfinitePay", () => {
    expect(rotuloDaForma({ forma: "infinitepay", metodo: "pix", ip_meio: "pix" })).toBe("Pix (InfinitePay)");
    expect(rotuloDaForma({ forma: "infinitepay", metodo: "cartao", ip_meio: "credit_card", ip_parcelas: 3 })).toBe("Cartão em 3× (InfinitePay)");
    expect(rotuloDaForma({ forma: "infinitepay", metodo: "cartao", ip_meio: "credit_card", ip_parcelas: 1 })).toBe("Cartão (InfinitePay)");
    expect(rotuloDaForma({ forma: "infinitepay", metodo: null })).toBe("InfinitePay");
  });
  it("aguardando na InfinitePay: PROCESSANDO e o detalhe sem 'comprovante'", () => {
    const c = cob({ status: "aguardando_confirmacao", forma: "infinitepay" });
    expect(situacaoDaCobranca(c)).toBe("aguardando_ip");
    expect(CHIP_COBRANCA.aguardando_ip.texto).toBe("PROCESSANDO");
    expect(linhaDaCobranca(c).detalhe).toBe("InfinitePay · aguardando a confirmação");
  });
  it("W1-B1: a mensalidade só fica 'aguardando' com a tentativa da InfinitePay VIVA (ip_expira_em no futuro) — a regra da financeiro_do_aluno", () => {
    const agora = new Date("2026-10-11T12:00:00Z");
    const viva = cob({ status: "aguardando_confirmacao", forma: "infinitepay", ip_expira_em: "2026-10-11T13:00:00Z" });
    const vencida = { ...viva, ip_expira_em: "2026-10-11T11:00:00Z" };
    expect(mensalidadeAguardando([viva], agora)).toBe(true);
    // vencida (a rodada de 15 min ainda não fechou), no instante exato do prazo ou sem prazo: não segura a mensalidade
    expect(mensalidadeAguardando([vencida], agora)).toBe(false);
    expect(mensalidadeAguardando([{ ...viva, ip_expira_em: agora.toISOString() }], agora)).toBe(false);
    expect(mensalidadeAguardando([{ ...viva, ip_expira_em: null }], agora)).toBe(false);
    // o comprovante do Pix e o Mercado Pago aguardando seguram como antes; a avulsa e a já paga, não
    expect(mensalidadeAguardando([vencida, cob({ status: "aguardando_confirmacao", forma: "pix_manual" })], agora)).toBe(true);
    expect(mensalidadeAguardando([cob({ status: "aguardando_confirmacao", forma: "mp" })], agora)).toBe(true);
    expect(mensalidadeAguardando([{ ...viva, tipo: "avulsa" }], agora)).toBe(false);
    expect(mensalidadeAguardando([{ ...viva, status: "paga" }], agora)).toBe(false);
    expect(mensalidadeAguardando([], agora)).toBe(false);
  });
  it("as frases dos códigos novos", () => {
    for (const k of ["modo_nao_infinitepay", "infinitepay_nao_ligada", "infinitepay_indisponivel", "infinitepay_recusou",
                     "infinitepay_checkout_desligado", "infinitetag_invalida", "sem_infinitetag", "infinitepay_em_teste", "automaticas_ativas",
                     "mp_so_master", "w1_indisponivel", "chave_inexistente", "volta_invalida", "em_uso", "conta_invalida"]) {
      expect(MENSAGEM_ERRO_FINANCEIRO[k], k).toBeTruthy();
    }
  });
  it("Configurações › Recebimento: as frases da tela onde a global fala de outra coisa (do aluno, da mensalidade, dos planos); o resto igual", () => {
    expect(mensagemDoRecebimento("sem_permissao")).toBe("Você não tem permissão para mudar o recebimento desta conta.");
    expect(mensagemDoRecebimento("so_o_dono")).toBe("Só o dono da conta muda o recebimento.");
    expect(mensagemDoRecebimento("conta_do_app")).toBe("O recebimento da conta do app é do Physiq.");
    expect(mensagemDoRecebimento("nada_para_salvar")).toBe("Nada mudou para salvar.");
    expect(mensagemDoRecebimento("em_uso")).toBe(MENSAGEM_ERRO_FINANCEIRO.em_uso);
    expect(mensagemDoRecebimento("rate_limited")).toBe(MENSAGEM_ERRO_FINANCEIRO.rate_limited);
    expect(mensagemDoRecebimento("xyz", "padrão")).toBe("padrão");
    expect(mensagemDoRecebimento(null)).toBe("Não deu certo agora. Tente de novo.");
  });
});

describe("W2 — o Mercado Pago da conta do personal nas regras da tela (Task 15)", () => {
  const TECNICO = /oauth|token|webhook|redirect|state|pkce|collector|integra[cç][aã]o/i;
  const UUID = "0f8c2a7e-1b2c-4d3e-8f90-a1b2c3d4e5f6";

  it("o aluno paga pelo app (Pix ou cartão), sem chave Pix — como no MP do Physiq", () => {
    expect(podePagarPeloApp("mercadopago_conta", false)).toBe(true);
    expect(podePagarPeloApp("mercadopago_conta", true)).toBe(true);
    expect(formasDePagar("mercadopago_conta", false)).toBe("Pix ou cartão");
    // o resto não mudou
    expect(podePagarPeloApp("nenhum", true)).toBe(false);
    expect(formasDePagar("pix_manual", false)).toBe("combine com seu profissional");
  });

  it("as frases dos códigos novos (Tasks 7 e 9), com as do plano palavra por palavra e sem termo técnico", () => {
    const novos = ["w2_indisponivel", "mp_nao_conectado", "mp_conta_sem_integracao", "mp_conta_em_teste", "mp_oauth_nao_configurado", "mp_sem_acesso",
      "automaticas_nao_canceladas", "mp_conta_indisponivel", "mp_conta_sem_chave_pix", "mp_outra_conta", "mp_reembolso_pelo_app_do_mp",
      "assinatura_antiga_viva", "mp_conexao_invalida", "mp_invalido", "mp_conta_invalida", "mp_outra_pessoa", "mp_vencido", "mp_em_outra_conta",
      "mp_sem_login"];
    for (const k of novos) {
      expect(MENSAGEM_ERRO_FINANCEIRO[k], k).toBeTruthy();
      expect(MENSAGEM_ERRO_FINANCEIRO[k], k).not.toMatch(TECNICO);
      expect(mensagemDoRecebimento(k), k).toBe(MENSAGEM_ERRO_FINANCEIRO[k]);
    }
    expect(mensagemErroFinanceiro("mp_oauth_nao_configurado")).toBe("A conexão com o Mercado Pago ainda está sendo preparada. Tente mais tarde.");
    expect(mensagemErroFinanceiro("mp_conta_indisponivel")).toBe("O pagamento pelo app está indisponível agora. Avise o seu profissional.");
    expect(mensagemErroFinanceiro("mp_conta_sem_chave_pix")).toBe("O Pix do seu profissional ainda não está pronto. Use o cartão ou avise ele.");
    expect(mensagemErroFinanceiro("assinatura_antiga_viva"))
      .toBe("Cancele a cobrança automática antiga no app do Mercado Pago ou fale com o seu profissional.");
    // mp_conta_sem_integracao (a guarda do banco) = o mesmo de mp_nao_conectado
    expect(mensagemErroFinanceiro("mp_conta_sem_integracao")).toBe(mensagemErroFinanceiro("mp_nao_conectado"));
    // o mp_outra_conta GLOBAL é o da Task 9 (cancelar a automática de outra conta do MP — aluno e painel); o da confirmação (I5) é o da tela
    expect(mensagemErroFinanceiro("mp_outra_conta")).toMatch(/app do Mercado Pago/);
    expect(mensagemErroFinanceiro("mp_reembolso_pelo_app_do_mp")).toMatch(/estorno pelo app do Mercado Pago/);
  });

  it("os da confirmação: o TEXTO_DO_RETORNO de mesmo nome, sem o mp_ (mp_em_outra_conta já é o nome dele); a conexão que não vale = invalido", () => {
    expect(mensagemErroFinanceiro("mp_outra_pessoa")).toBe(TEXTO_DO_RETORNO.outra_pessoa);
    expect(mensagemErroFinanceiro("mp_vencido")).toBe(TEXTO_DO_RETORNO.vencido);
    expect(mensagemErroFinanceiro("mp_invalido")).toBe(TEXTO_DO_RETORNO.invalido);
    expect(mensagemErroFinanceiro("mp_em_outra_conta")).toBe(TEXTO_DO_RETORNO.mp_em_outra_conta);
    expect(mensagemErroFinanceiro("mp_conexao_invalida")).toBe(TEXTO_DO_RETORNO.invalido);
    expect(mensagemErroFinanceiro("mp_conta_invalida")).toBe(TEXTO_DO_RETORNO.invalido);
  });

  it("mensagemDoMpConta (conectar, confirmar e desconectar na tela): o so_o_dono do MENOR 19, o outra_conta do I5 com a contagem e o resto do Recebimento", () => {
    expect(mensagemDoMpConta("so_o_dono")).toBe("Só o dono da conta conecta o Mercado Pago.");
    // o so_o_dono do resto do Recebimento e da mensalidade não mudam
    expect(mensagemDoRecebimento("so_o_dono")).toBe("Só o dono da conta muda o recebimento.");
    expect(mensagemErroFinanceiro("so_o_dono")).toBe("Só o dono da conta mexe na mensalidade.");
    expect(mensagemDoMpConta("mp_outra_conta")).toBe(TEXTO_DO_RETORNO.outra_conta);
    expect(mensagemDoMpConta("mp_outra_pessoa")).toBe(TEXTO_DO_RETORNO.outra_pessoa);
    expect(mensagemDoMpConta("mp_conta_indisponivel")).toBe("A conexão com o seu Mercado Pago caiu. Conecte de novo em Configurações › Recebimento.");
    // as recusas do cancelamento com a contagem (MENOR 11: nada mudou)
    expect(mensagemDoMpConta("mp_sem_acesso", { alunos: 1, falhas: 0 })).toBe(
      "1 cobrança automática ficou ligada: o Physiq não tem mais acesso à conta do Mercado Pago onde ela está. Conecte de novo ou cancele pelo app do Mercado Pago. Nada mudou.");
    expect(mensagemDoMpConta("mp_sem_acesso", { alunos: 3 })).toBe(
      "3 cobranças automáticas ficaram ligadas: o Physiq não tem mais acesso à conta do Mercado Pago onde elas estão. Conecte de novo ou cancele pelo app do Mercado Pago. Nada mudou.");
    expect(mensagemDoMpConta("mp_sem_acesso")).toBe(MENSAGEM_ERRO_FINANCEIRO.mp_sem_acesso);
    expect(mensagemDoMpConta("automaticas_nao_canceladas", { falhas: 1 }))
      .toBe("O Mercado Pago não desligou 1 cobrança automática agora. Nada mudou — tente de novo em instantes.");
    expect(mensagemDoMpConta("automaticas_nao_canceladas", { falhas: 2 }))
      .toBe("O Mercado Pago não desligou 2 cobranças automáticas agora. Nada mudou — tente de novo em instantes.");
    expect(mensagemDoMpConta("automaticas_nao_canceladas", { falhas: "x" })).toBe(MENSAGEM_ERRO_FINANCEIRO.automaticas_nao_canceladas);
    // o resto: a do Recebimento e a global; desconhecido → a padrão
    expect(mensagemDoMpConta("sem_permissao")).toBe(mensagemDoRecebimento("sem_permissao"));
    expect(mensagemDoMpConta("rate_limited")).toBe(MENSAGEM_ERRO_FINANCEIRO.rate_limited);
    expect(mensagemDoMpConta("xyz", {}, "padrão")).toBe("padrão");
    expect(mensagemDoMpConta(null)).toBe("Não deu certo agora. Tente de novo.");
    for (const k of ["so_o_dono", "mp_outra_conta", "mp_conta_indisponivel", "mp_sem_acesso", "automaticas_nao_canceladas"]) {
      expect(mensagemDoMpConta(k, { alunos: 2, falhas: 2 }), k).not.toMatch(TECNICO);
    }
  });

  it("Salvar a forma (MENOR 11): a recusa do cancelamento com a contagem também no mensagemDoRecebimento; o so_o_dono de lá não muda", () => {
    expect(mensagemDoRecebimento("automaticas_nao_canceladas", "padrão", { falhas: 2 }))
      .toBe("O Mercado Pago não desligou 2 cobranças automáticas agora. Nada mudou — tente de novo em instantes.");
    expect(mensagemDoRecebimento("mp_sem_acesso", undefined, { alunos: 2, falhas: 1 })).toBe(mensagemDoMpConta("mp_sem_acesso", { alunos: 2 }));
    expect(mensagemDoRecebimento("mp_sem_acesso", undefined, { alunos: 0 })).toBe(MENSAGEM_ERRO_FINANCEIRO.mp_sem_acesso);
    expect(mensagemDoRecebimento("automaticas_nao_canceladas")).toBe(MENSAGEM_ERRO_FINANCEIRO.automaticas_nao_canceladas);
    // a contagem só vale para os 2 códigos do cancelamento
    expect(mensagemDoRecebimento("automaticas_ativas", undefined, { alunos: 2 })).toBe(MENSAGEM_ERRO_FINANCEIRO.automaticas_ativas);
    expect(mensagemDoRecebimento("so_o_dono", undefined, { alunos: 2 })).toBe("Só o dono da conta muda o recebimento.");
  });

  it("a volta na busca (?mp=): só o que a mp-conectar-retorno manda (T8) e o ?mp=conectar do APK; o id da conexão só uuid; o resto, nada", () => {
    expect(lerVoltaDoMp("conectar")).toEqual({ tipo: "conectar" });
    expect(lerVoltaDoMp("conectar", UUID)).toEqual({ tipo: "conectar" });
    expect(lerVoltaDoMp("confirmar", UUID)).toEqual({ tipo: "confirmar", conexao: UUID });
    // o id fora do formato (lixo, maiúsculas, vazio, ausente) → invalido, sem pedir nada à função
    for (const c of ["lixo", UUID.toUpperCase(), "", null, undefined, `${UUID} `]) expect(lerVoltaDoMp("confirmar", c), String(c)).toEqual({ tipo: "erro", resultado: "invalido" });
    expect([...RESULTADOS_DA_VOLTA].sort()).toEqual(["conta_de_teste", "falhou", "invalido", "negado", "vencido"]);
    for (const r of RESULTADOS_DA_VOLTA) {
      expect(lerVoltaDoMp(r)).toEqual({ tipo: "erro", resultado: r });
      expect(TEXTO_DO_RETORNO[r]).toBeTruthy();
    }
    // o que vem da CONFIRMAÇÃO (não da volta) e o que não existe: ignorados — um link com ?mp=ok não diz "conectado"
    for (const m of ["ok", "outra_conta", "conectado_sem_trocar", "outra_pessoa", "mp_em_outra_conta", "toString", "__proto__", "constructor", "NEGADO", "", null, undefined]) {
      expect(lerVoltaDoMp(m as string | null | undefined, UUID), String(m)).toBeNull();
    }
  });

  it("a pergunta da confirmação: com o apelido da conta do Mercado Pago, e sem ele (o apelido é melhor esforço — T8)", () => {
    expect(perguntaDaConexaoMp("FULANO.PERSONAL")).toEqual({
      titulo: "Conectar a conta FULANO.PERSONAL do Mercado Pago?",
      descricao: "Os alunos passam a pagar direto nela. Confira se é a sua conta antes de conectar.",
    });
    expect(perguntaDaConexaoMp(null).titulo).toBe("Conectar esta conta do Mercado Pago?");
    expect(perguntaDaConexaoMp("   ").titulo).toBe("Conectar esta conta do Mercado Pago?");
    expect(perguntaDaConexaoMp("  ana  ").titulo).toBe("Conectar a conta ana do Mercado Pago?");
  });

  it("o chip da situação da conexão: o tom da tela e a marca do E2E (conectado · renove · caiu · desconectado)", () => {
    const base = { mp_erro: null, mp_expira_em: null, mp_apelido: "FULANO" };
    expect(chipDaConexaoMp(situacaoDoMp({ ...base, status: "ativa" }))).toEqual({ tom: "n", marca: "conectado" });
    expect(chipDaConexaoMp(situacaoDoMp({ ...base, status: "ativa", mp_erro: "renovacao_recusada", mp_expira_em: "2027-04-01T12:00:00Z" })))
      .toEqual({ tom: "a", marca: "renove" });
    expect(chipDaConexaoMp(situacaoDoMp({ ...base, status: "erro" }))).toEqual({ tom: "r", marca: "caiu" });
    expect(chipDaConexaoMp(situacaoDoMp({ ...base, status: "desconectada" }))).toEqual({ tom: "g", marca: "desconectado" });
    expect(chipDaConexaoMp(situacaoDoMp(null))).toEqual({ tom: "g", marca: "desconectado" });
  });

  it("o mp_outra_conta da confirmação (I5) com a contagem { abertos } da recebimento_mp_confirmar; sem ela (ou fora do formato), a frase da volta", () => {
    const um = mensagemDoMpConta("mp_outra_conta", { abertos: 1 });
    expect(um).toBe("Essa é outra conta do Mercado Pago, e a de antes ainda tem 1 pagamento em andamento (cobrança automática ou Pix aberto). "
      + "Desligue as cobranças automáticas (Desconectar) e espere o Pix aberto vencer — até 3 dias — ou peça ao aluno para pagar de outro jeito; "
      + "depois conecte a nova.");
    expect(mensagemDoMpConta("mp_outra_conta", { abertos: 3 })).toContain("a de antes ainda tem 3 pagamentos em andamento (cobrança automática ou Pix aberto)");
    // a contagem entra no lugar certo: o resto é o da volta, palavra por palavra
    expect(um.replace("ainda tem 1 pagamento em andamento", "ainda tem pagamento em andamento")).toBe(TEXTO_DO_RETORNO.outra_conta);
    for (const abertos of [0, -1, 1.5, "x", null, undefined, Number.NaN]) {
      expect(mensagemDoMpConta("mp_outra_conta", { abertos }), String(abertos)).toBe(TEXTO_DO_RETORNO.outra_conta);
    }
    // só o mp_outra_conta usa o abertos; o global (Task 9 — a automática de outra conta, no aluno e no painel) não muda
    expect(mensagemErroFinanceiro("mp_outra_conta")).not.toBe(um);
    expect(mensagemDoMpConta("mp_outra_pessoa", { abertos: 2 })).toBe(TEXTO_DO_RETORNO.outra_pessoa);
    expect(mensagemDoMpConta("mp_outra_conta", { abertos: 2 })).not.toMatch(TECNICO);
  });

  it("mensagemDoProfissional (as ações do financeiro do aluno no painel): a conexão do MP dele caída fala com ELE; o resto é a frase global", () => {
    expect(mensagemDoProfissional("mp_conta_indisponivel"))
      .toBe("A conexão com o seu Mercado Pago caiu. Conecte de novo em Configurações › Recebimento.");
    // a do aluno (a global) continua a do plano
    expect(mensagemErroFinanceiro("mp_conta_indisponivel")).toBe("O pagamento pelo app está indisponível agora. Avise o seu profissional.");
    expect(mensagemDoProfissional("mp_conta_indisponivel")).not.toMatch(/avise o seu profissional/i);
    // a mesma frase da tela de Recebimento (conectar/desconectar com a conexão caída)
    expect(mensagemDoProfissional("mp_conta_indisponivel")).toBe(mensagemDoMpConta("mp_conta_indisponivel"));
    for (const k of ["mp_reembolso_pelo_app_do_mp", "mp_outra_conta", "so_o_dono", "mp_error", "sem_permissao"]) {
      expect(mensagemDoProfissional(k), k).toBe(mensagemErroFinanceiro(k));
    }
    expect(mensagemDoProfissional("xyz", "padrão")).toBe("padrão");
    expect(mensagemDoProfissional(null)).toBe("Não deu certo agora. Tente de novo.");
  });

  it("o MP do Physiq com o nome novo também no erro de quem não é master (agora são 2 Mercados Pagos)", () => {
    expect(mensagemErroFinanceiro("mp_so_master")).toBe("O Mercado Pago do Physiq só é ligado pelo master.");
    expect(mensagemDoRecebimento("mp_so_master")).toBe("O Mercado Pago do Physiq só é ligado pelo master.");
  });
});
