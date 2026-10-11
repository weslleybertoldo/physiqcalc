// src/financeiro/infinitepay.test.ts
// Physiq W1 — regras puras da InfinitePay (desenho 10/10 §4–§5 com o §8; spec-review W1-B1/W1-B2). O mesmo módulo do servidor.
import { describe, expect, it } from "vitest";
import {
  IP_PRAZO_HORAS, centavos, corpoDoLink, corpoDoPaymentCheck, decidirBaixa, descricaoDoLink, ehNsuDoPedido, expiraEm, lerAvisoDoWebhook,
  lerLink, lerPaymentCheck, lerVolta, metodoDoMeio, normalizarHandle, nsuDoPedido, podeReaproveitar, proximaConferenciaEm, tentativaViva,
  textoPagoAoPersonal, urlDaInfinitePay, urlDeVolta, urlDoWebhook, type ConferenciaIp,
} from "./infinitepay";

const PEDIDO = "11111111-2222-4333-8444-555555555555";
const agora = new Date("2026-10-11T12:00:00Z");

describe("InfiniteTag e valores", () => {
  it("InfiniteTag: sem o $, minúscula, letras/números/._- (2 a 40); o resto é null", () => {
    expect(normalizarHandle(" $Fulano.Treinos ")).toBe("fulano.treinos");
    expect(normalizarHandle("$$ana_personal")).toBe("ana_personal");
    expect(normalizarHandle("a")).toBeNull();
    expect(normalizarHandle("ana personal")).toBeNull();
    expect(normalizarHandle("ana@x")).toBeNull();
    expect(normalizarHandle("x".repeat(41))).toBeNull();
    expect(normalizarHandle(42)).toBeNull();
  });
  it("centavos: 83,33 → 8333; o numeric do banco; vírgula; zero, negativo e lixo → null", () => {
    expect(centavos(83.33)).toBe(8333);
    expect(centavos("1000.00")).toBe(100000);
    expect(centavos("99,90")).toBe(9990);
    expect(centavos(0)).toBeNull();
    expect(centavos(-1)).toBeNull();
    expect(centavos("abc")).toBeNull();
    expect(centavos(null)).toBeNull();
  });
  it("descrição do link: uma linha, até 100", () => {
    expect(descricaoDoLink("Plano ·\n Anual  · 12 meses")).toBe("Plano · Anual · 12 meses");
    expect(descricaoDoLink("")).toBe("Pagamento");
    expect(descricaoDoLink("x".repeat(150))).toHaveLength(100);
  });
});

describe("o link (POST /links) e a volta", () => {
  it("corpo: items (não 'itens'), preço em centavos, order_nsu, volta e webhook; sem customer (LGPD)", () => {
    const webhook = "https://ref.supabase.co/functions/v1/infinitepay-webhook-aluno?schema=public";
    expect(corpoDoLink({ handle: "fulano", centavos: 100000, descricao: "Plano · Anual", pedido: PEDIDO,
      volta: "https://physiqcalc.com.br/perfil/pagamentos", webhook })).toEqual({
      handle: "fulano", items: [{ quantity: 1, price: 100000, description: "Plano · Anual" }], order_nsu: PEDIDO,
      redirect_url: "https://physiqcalc.com.br/perfil/pagamentos", webhook_url: webhook,
    });
    expect(corpoDoLink({ handle: "f1", centavos: 100, descricao: "Teste", pedido: "teste-1", volta: "https://x", webhook: null })).not.toHaveProperty("webhook_url");
  });
  it("volta: o site do mesmo ambiente (ou o local); o APK, outro ambiente e o resto → o site do ambiente (App Link na produção)", () => {
    expect(urlDeVolta("public", "https://physiqcalc.com.br")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("public", "https://www.physiqcalc.com.br")).toBe("https://www.physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("staging", "https://physiqcalc-staging.vercel.app")).toBe("https://physiqcalc-staging.vercel.app/perfil/pagamentos");
    expect(urlDeVolta("staging", "http://localhost:8080")).toBe("http://localhost:8080/perfil/pagamentos");
    expect(urlDeVolta("public", "https://localhost")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("public", "capacitor://localhost")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("staging", "https://physiqcalc.com.br")).toBe("https://physiqcalc-staging.vercel.app/perfil/pagamentos");
    expect(urlDeVolta("public", "https://golpe.com")).toBe("https://physiqcalc.com.br/perfil/pagamentos");
    expect(urlDeVolta("public", null, "/painel/configuracoes/recebimento")).toBe("https://physiqcalc.com.br/painel/configuracoes/recebimento");
  });
  it("webhook: a função do ambiente", () => {
    expect(urlDoWebhook("https://ref.supabase.co/", "staging")).toBe("https://ref.supabase.co/functions/v1/infinitepay-webhook-aluno?schema=staging");
  });
  it("resposta do /links: url (Central de Ajuda) ou payment_url; só https num domínio da InfinitePay", () => {
    expect(lerLink({ url: "https://checkout.infinitepay.com.br/fulano?lenc=abc" })).toBe("https://checkout.infinitepay.com.br/fulano?lenc=abc");
    expect(lerLink({ payment_url: "https://checkout.infinitepay.io/x" })).toBe("https://checkout.infinitepay.io/x");
    expect(lerLink({ url: "http://checkout.infinitepay.com.br/x" })).toBeNull();
    expect(lerLink({ url: "https://infinitepay.com.br.golpe.com/x" })).toBeNull();
    expect(lerLink({ url: "https://golpe.com/?infinitepay.io" })).toBeNull();
    expect(lerLink(null)).toBeNull();
    expect(urlDaInfinitePay("https://recibo.infinitepay.io/abc")).toBe("https://recibo.infinitepay.io/abc");
  });
});

describe("o webhook e a volta (sem assinatura: só a forma)", () => {
  const corpo = { invoice_slug: "abc-123", amount: 100000, paid_amount: 101000, installments: 3, capture_method: "credit_card",
    transaction_nsu: "e6f3c1d2-nsu", order_nsu: PEDIDO, receipt_url: "https://recibo.infinitepay.io/r/1", items: [] };
  it("lê o que importa — amount, paid_amount e items do corpo não valem nada aqui: quem decide é o payment_check", () => {
    expect(lerAvisoDoWebhook(corpo)).toEqual({ pedido: PEDIDO, nsu: "e6f3c1d2-nsu", slug: "abc-123", recibo: "https://recibo.infinitepay.io/r/1", meio: "credit_card" });
  });
  it("recusa o que não é nosso; o recibo fora da InfinitePay vira null", () => {
    expect(lerAvisoDoWebhook({ ...corpo, order_nsu: "teste-1" })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, transaction_nsu: undefined })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, transaction_nsu: "a b" })).toBeNull();
    expect(lerAvisoDoWebhook({ ...corpo, receipt_url: "https://golpe.com/r" })!.recibo).toBeNull();
    expect(lerAvisoDoWebhook("x")).toBeNull();
  });
  it("a volta da página: slug (não invoice_slug) e o NSU numérico vira texto", () => {
    expect(lerVolta({ order_nsu: PEDIDO, transaction_nsu: 12345, slug: "s1", capture_method: "pix" }))
      .toEqual({ pedido: PEDIDO, nsu: "12345", slug: "s1", recibo: null, meio: "pix" });
  });
});

describe("a conferência (payment_check)", () => {
  it("corpo: InfiniteTag + pedido + NSU + slug; o NSU do pedido (W1-B2: sem o NSU de verdade) não vai", () => {
    expect(corpoDoPaymentCheck("fulano", PEDIDO, "n1", "s1")).toEqual({ handle: "fulano", order_nsu: PEDIDO, transaction_nsu: "n1", slug: "s1" });
    expect(corpoDoPaymentCheck("fulano", PEDIDO, nsuDoPedido(PEDIDO), null)).toEqual({ handle: "fulano", order_nsu: PEDIDO });
  });
  it("resposta: success + paid; 400/404/422 ou success false = não pago (decidido); 5xx, 429, 401/403, rede e lixo = sem decisão", () => {
    expect(lerPaymentCheck(200, { success: true, paid: true, amount: 100000, paid_amount: 101000, installments: 3, capture_method: "credit_card" }))
      .toEqual({ pago: true, centavos: 100000, centavosPagos: 101000, parcelas: 3, meio: "credit_card", nsu: null });
    expect(lerPaymentCheck(200, { success: false, paid: false })).toMatchObject({ pago: false });
    expect(lerPaymentCheck(404, { message: "not found" })).toMatchObject({ pago: false });
    expect(lerPaymentCheck(503, null)).toBeNull();
    expect(lerPaymentCheck(429, null)).toBeNull();
    expect(lerPaymentCheck(403, null)).toBeNull();
    expect(lerPaymentCheck(599, null)).toBeNull();
    expect(lerPaymentCheck(200, { success: true })).toBeNull();
  });
});

describe("decidirBaixa — só o payment_check dá baixa", () => {
  const pago = (x: Partial<ConferenciaIp> = {}): ConferenciaIp => ({ pago: true, centavos: 100000, centavosPagos: 100000, parcelas: 1, meio: "pix", nsu: null, ...x });
  const t = (x: Partial<{ status: string; forma: string | null; centavos: number; nsu: string | null }> = {}) =>
    ({ status: "aguardando_confirmacao", forma: "infinitepay", centavos: 100000, nsu: null, ...x });
  it("pago com o preço do link → baixar; não pago → nada; valor diferente (ou sem amount) → nada + aviso", () => {
    expect(decidirBaixa(t(), pago(), "n1")).toBe("baixar");
    expect(decidirBaixa(t(), pago({ pago: false }), "n1")).toBe("nao_pago");
    expect(decidirBaixa(t(), pago({ centavos: 99999 }), "n1")).toBe("valor_diferente");
    expect(decidirBaixa(t(), pago({ centavos: null }), "n1")).toBe("valor_diferente");
    expect(decidirBaixa(t({ status: "cancelada" }), pago(), "n1")).toBe("baixar"); // a vencida paga depois: o dinheiro entrou
  });
  it("o paid_amount maior (as taxas que o personal repassa ao aluno) não atrapalha: compara o amount", () => {
    expect(decidirBaixa(t(), pago({ centavosPagos: 104500 }), "n1")).toBe("baixar");
  });
  it("já paga: o mesmo NSU é repetição; outro NSU é 2º pagamento; paga à mão antes → só avisa", () => {
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), "n1")).toBe("ja_feito");
    expect(decidirBaixa(t({ status: "paga", nsu: "n1" }), pago(), "n2")).toBe("segundo_pagamento");
    expect(decidirBaixa(t({ status: "paga", forma: "manual" }), pago(), "n1")).toBe("ja_pago_por_fora");
  });
  it("W1-B2: paga só pelo pedido → o 1º NSU de verdade troca o do pedido; o pedido de novo é repetição", () => {
    expect(decidirBaixa(t({ status: "paga", nsu: nsuDoPedido(PEDIDO) }), pago(), "n9")).toBe("trocar_nsu");
    expect(decidirBaixa(t({ status: "paga", nsu: "n9" }), pago(), nsuDoPedido(PEDIDO))).toBe("ja_feito");
    expect(ehNsuDoPedido(nsuDoPedido(PEDIDO))).toBe(true);
    expect(ehNsuDoPedido("n9")).toBe(false);
  });
});

describe("a tentativa (W1-B1: 72 h e o mesmo link enquanto vale)", () => {
  it("vale 72 h", () => {
    expect(IP_PRAZO_HORAS).toBe(72);
    expect(expiraEm(agora)).toBe("2026-10-14T12:00:00.000Z");
  });
  it("viva: aguardando, na InfinitePay e dentro do prazo", () => {
    const viva = { status: "aguardando_confirmacao", forma: "infinitepay", ip_expira_em: "2026-10-11T13:00:00Z" };
    expect(tentativaViva(viva, agora)).toBe(true);
    expect(tentativaViva({ ...viva, ip_expira_em: "2026-10-11T11:59:00Z" }, agora)).toBe(false);
    expect(tentativaViva({ ...viva, forma: "mp" }, agora)).toBe(false);
    expect(tentativaViva({ ...viva, status: "paga" }, agora)).toBe(false);
  });
  it("reaproveita o link com 30 min de folga, o mesmo valor e a mesma InfiniteTag", () => {
    const viva = { status: "aguardando_confirmacao", forma: "infinitepay", tipo: "mensalidade", ip_expira_em: "2026-10-12T12:00:00Z",
      ip_link_url: "https://checkout.infinitepay.com.br/fulano?lenc=1", ip_handle: "fulano", valor: "1000.00" };
    expect(podeReaproveitar(viva, { centavos: 100000, handle: "fulano" }, agora)).toBe(true);
    expect(podeReaproveitar(viva, { centavos: 120000, handle: "fulano" }, agora)).toBe(false);
    expect(podeReaproveitar(viva, { centavos: 100000, handle: "outra" }, agora)).toBe(false);
    expect(podeReaproveitar({ ...viva, ip_expira_em: "2026-10-11T12:20:00Z" }, { centavos: 100000, handle: "fulano" }, agora)).toBe(false);
    expect(podeReaproveitar({ ...viva, ip_link_url: null }, { centavos: 100000, handle: "fulano" }, agora)).toBe(false);
  });
  it("meio → método; a próxima conferência: 5, 15, 30 min e de hora em hora", () => {
    expect(metodoDoMeio("pix")).toBe("pix");
    expect(metodoDoMeio("credit_card")).toBe("cartao");
    expect(metodoDoMeio(null)).toBeNull();
    expect(proximaConferenciaEm(agora, 1)).toBe("2026-10-11T12:05:00.000Z");
    expect(proximaConferenciaEm(agora, 3)).toBe("2026-10-11T12:30:00.000Z");
    expect(proximaConferenciaEm(agora, 9)).toBe("2026-10-11T13:00:00.000Z");
  });
  it("o aviso ao personal diz quem, quanto e como", () => {
    expect(textoPagoAoPersonal("Ana Souza", 100000, "credit_card", 3)).toBe("Pagamento confirmado · Ana Souza · R$ 1000,00 (cartão em 3× na InfinitePay)");
    expect(textoPagoAoPersonal("Ana Souza", 4990, "pix", 1)).toBe("Pagamento confirmado · Ana Souza · R$ 49,90 (Pix na InfinitePay)");
  });
});
