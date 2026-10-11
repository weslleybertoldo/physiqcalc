// src/financeiro/infinitepayCliente.test.ts
// Physiq W1 — o cliente da API da InfinitePay com o fetch FALSO: o caminho, o corpo, o tempo (signal), a leitura e o que vira 599.
import { describe, expect, it, vi } from "vitest";
import {
  IP_ATIVAR_CHECKOUT, baseDaApi, conferirPagamento, criarLink, lerCheckoutDesligado, pedidoDeTeste,
} from "../../supabase-principal/functions/_shared/infinitepay";
import { prazo } from "../../supabase-principal/functions/_shared/tempo";

const resposta = (status: number, corpo: unknown) =>
  new Response(corpo === undefined ? "" : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const pedido = { handle: "fulano", centavos: 100, descricao: "x", pedido: "p1", volta: "https://v", webhook: null };
// a resposta de verdade do POST /links (sondada em 11/10/2026): a mesma para o checkout externo desligado e para a InfiniteTag que não existe
const ATIVAR = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true";
const DESLIGADO = {
  success: false, error: "external_checkout_not_enabled",
  message: "External checkout is not enabled for this merchant. Enable it in your checkout settings to start creating payment links.",
  redirect_url: ATIVAR,
};
const responde = (status: number, corpo: unknown) => (async () => resposta(status, corpo)) as unknown as typeof fetch;

describe("cliente da InfinitePay (fetch simulado)", () => {
  it("criarLink: POST /links com o corpo da doc e um signal (tempo); 200 com url → a url", async () => {
    const f = vi.fn(async () => resposta(200, { url: "https://checkout.infinitepay.com.br/fulano?lenc=x" }));
    expect(await criarLink(pedido, { fetch: f as unknown as typeof fetch })).toEqual({ status: 200, url: "https://checkout.infinitepay.com.br/fulano?lenc=x" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ handle: "fulano", items: [{ quantity: 1, price: 100 }], order_nsu: "p1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("checkout ligado (sondado em 11/10): 200 só com {url} em checkout.infinitepay.io → a url; o pedido vai SEM chave (sem Authorization)", async () => {
    // o formato real: lenc = base64url cifrado (cresce com o pedido) + ".v1." + 16 hex; as 2 sondas deram urls de 272 e 289 caracteres
    const real = `https://checkout.infinitepay.io/fulano?lenc=${"Ab9_-".repeat(43)}.v1.0123456789abcdef`;
    const f = vi.fn(async () => resposta(200, { url: real }));
    expect(await criarLink(pedido, { fetch: f as unknown as typeof fetch })).toEqual({ status: 200, url: real });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.keys(init.headers as Record<string, string>).map((h) => h.toLowerCase()).sort()).toEqual(["accept", "content-type"]);
  });
  it("4xx → sem url (a tela diz 'não aceitou'); 5xx → sem url; rede ou tempo → 599", async () => {
    expect(await criarLink(pedido, { fetch: (async () => resposta(422, { message: "x" })) as unknown as typeof fetch })).toEqual({ status: 422, url: null });
    expect(await criarLink(pedido, { fetch: (async () => resposta(503, null)) as unknown as typeof fetch })).toEqual({ status: 503, url: null });
    expect(await criarLink(pedido, { fetch: (async () => { throw new TypeError("rede"); }) as unknown as typeof fetch })).toEqual({ status: 599, url: null });
    expect(await criarLink(pedido, { fetch: (async () => resposta(200, { url: "https://golpe.com/x" })) as unknown as typeof fetch })).toEqual({ status: 200, url: null });
  });
  it("checkout externo desligado OU InfiniteTag que não existe (a API responde igual) → erro próprio com o link de ativar", async () => {
    expect(await criarLink(pedido, { fetch: responde(404, DESLIGADO) }))
      .toEqual({ status: 404, url: null, erro: "checkout_desligado", ativar: ATIVAR });
    // o link de ativar só num domínio da InfinitePay; fora dele (ou sem ele), o de 11/10
    expect(await criarLink(pedido, { fetch: responde(404, { ...DESLIGADO, redirect_url: "https://golpe.com/x" }) }))
      .toEqual({ status: 404, url: null, erro: "checkout_desligado", ativar: IP_ATIVAR_CHECKOUT });
    expect(IP_ATIVAR_CHECKOUT).toBe(ATIVAR);
    // pelo código do erro, não pelo status: o 404 sem ele continua o "não aceitou" de sempre
    expect(await criarLink(pedido, { fetch: responde(404, { success: false, error: "outro" }) })).toEqual({ status: 404, url: null });
    expect(lerCheckoutDesligado(null)).toBeNull();
    expect(lerCheckoutDesligado("external_checkout_not_enabled")).toBeNull();
  });
  it("conferirPagamento: POST /payment_check com a InfiniteTag gravada, o pedido, o NSU e o slug; lê a conferência", async () => {
    const f = vi.fn(async () => resposta(200, { success: true, paid: true, amount: 100, paid_amount: 100, installments: 1, capture_method: "pix" }));
    const r = await conferirPagamento("fulano", "p1", "n1", "s1", { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({ status: 200, conferencia: { pago: true, centavos: 100, centavosPagos: 100, parcelas: 1, meio: "pix", nsu: null } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.checkout.infinitepay.io/payment_check");
    expect(JSON.parse(String(init.body))).toEqual({ handle: "fulano", order_nsu: "p1", transaction_nsu: "n1", slug: "s1" });
  });
  it("payment_check de um pedido que não existe: 200 {success: false} (sondado em 11/10) = não confirmado, decidido — não é rede", async () => {
    expect(await conferirPagamento("fulano", "p1", null, null, { fetch: responde(200, { success: false }) })).toEqual({
      status: 200, conferencia: { pago: false, centavos: null, centavosPagos: null, parcelas: null, meio: null, nsu: null },
    });
  });
  it("payment_check com o checkout desligado: SEM decisão (nunca o 'não pago' que fecharia o aviso de um pagamento de verdade)", async () => {
    expect(await conferirPagamento("fulano", "p1", "n1", null, { fetch: responde(404, DESLIGADO) }))
      .toEqual({ status: 404, conferencia: null, erro: "checkout_desligado" });
  });
  it("o prazo do pedido esgotado: nem chama (599)", async () => {
    const f = vi.fn();
    expect(await conferirPagamento("fulano", "p1", null, null, { fetch: f as unknown as typeof fetch, prazo: prazo(0) })).toEqual({ status: 599, conferencia: null });
    expect(f).not.toHaveBeenCalled();
  });
  it("o simulador só com http://127.0.0.1 ou localhost: outro valor fica na API de verdade", () => {
    expect(baseDaApi("http://127.0.0.1:8799")).toBe("http://127.0.0.1:8799");
    expect(baseDaApi("http://localhost:8799")).toBe("http://localhost:8799");
    expect(baseDaApi("https://golpe.com")).toBe("https://api.checkout.infinitepay.io");
    expect(baseDaApi(undefined)).toBe("https://api.checkout.infinitepay.io");
  });
  it("o Testar do personal: R$ 1,00, sem webhook, pedido teste-<uuid>", () => {
    const p = pedidoDeTeste("fulano", "https://physiqcalc.com.br/painel/configuracoes/recebimento");
    expect(p).toMatchObject({ handle: "fulano", centavos: 100, webhook: null, volta: "https://physiqcalc.com.br/painel/configuracoes/recebimento" });
    expect(p.pedido).toMatch(/^teste-[0-9a-f-]{36}$/);
  });
});
