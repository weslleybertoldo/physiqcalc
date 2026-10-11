// supabase-principal/functions/_shared/infinitepay-regras.ts
// Physiq W1 — regras PURAS da InfinitePay (checkout HOSPEDADO: o aluno paga o personal na página da InfinitePay, Pix ou cartão até
// 12×). Desenho aprovado 10/10/2026 (a seção 8 por cima das 4 e 5) + spec-review (W1-B1, W1-B2). Sem Deno, sem rede e sem banco: usadas
// pela pagamentos-aluno e pela infinitepay-webhook-aluno (por _shared/infinitepay.ts e _shared/infinitepay-baixa.ts), reexportadas para
// a tela (src/financeiro/infinitepay.ts) e testadas no Vitest (src/financeiro/infinitepay.test.ts).
// A API (www.infinitepay.io/checkout-documentacao, conferida em 10/10): POST /links {handle sem o $, items[{quantity, price em centavos,
// description}], order_nsu, redirect_url, webhook_url} → a url do checkout; POST /payment_check {handle, order_nsu, transaction_nsu,
// slug} → {success, paid, amount, paid_amount, installments, capture_method}. O webhook NÃO tem assinatura: nada vira "pago" sem o
// payment_check (decidirBaixa). Sem sandbox: o 1º pagamento de verdade (R$ 1, do Weslley — Task 22 do plano da W1) confere o que a doc
// não mostra (o corpo da resposta do /links, a busca da volta, o host do recibo e se o payment_check aceita só o order_nsu).
import type { Schema } from "./financeiro-regras.ts";

export const IP_API = "https://api.checkout.infinitepay.io";
/** W1-B1: a tentativa vale 72 h (o desenho §8; igual ao Pix do Mercado Pago) — depois sai e a trava do inadimplente volta. */
export const IP_PRAZO_HORAS = 72;
/** O mesmo link é reaproveitado se ainda faltam pelo menos 30 min (o aluno toca em "Pagar" de novo). */
export const IP_REAPROVEITAR_MS = 30 * 60_000;
/** Conferência só pelo pedido (sem o NSU — W1-B2): no máximo 1 a cada 30 s por tentativa. */
export const IP_CONFERIR_PEDIDO_MS = 30_000;
/** O "Testar" do personal: um link de R$ 1,00 que ninguém precisa pagar. */
export const IP_TESTE_CENTAVOS = 100;
/** A caixa de avisos desiste depois de 24 conferências sem resposta da InfinitePay e avisa o personal. */
export const IP_MAX_TENTATIVAS = 24;
/** NSU de quem foi pago só pelo pedido (o payment_check sem o NSU de verdade): o 1º NSU que chegar troca este. */
export const NSU_DO_PEDIDO = "pedido:";

export type MeioIp = "pix" | "credit_card";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Za-z0-9_.:-]{1,80}$/;
const HANDLE = /^[a-z0-9][a-z0-9._-]{1,39}$/;
/** Só https num domínio da InfinitePay (o checkout e o recibo): o resto vira null — nada abre fora daqui. */
const HOST_IP = /^https:\/\/([a-z0-9-]+\.)*(infinitepay\.io|infinitepay\.com\.br)(\/|$)/i;
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const SITE_DO_AMBIENTE: Record<Schema, RegExp> = {
  public: /^https:\/\/(www\.)?physiqcalc\.com\.br$/,
  staging: /^https:\/\/physiqcalc-staging\.vercel\.app$/,
};
const LOCAL = /^http:\/\/localhost:(5173|8080)$/;
/** 400, 404, 422: a InfinitePay respondeu e disse "não" (não pago). O resto de 4xx (401, 403, 408, 409, 429) é tentar de novo. */
const RECUSA_DECIDIDA = new Set([400, 404, 422]);

export function normalizarHandle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const h = v.trim().replace(/^\$+/, "").toLowerCase();
  return HANDLE.test(h) ? h : null;
}

/** Reais (número ou o numeric do banco em texto) → centavos inteiros; ≤ 0 ou lixo → null. */
export function centavos(valor: number | string | null | undefined): number | null {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function descricaoDoLink(descricao: string | null | undefined): string {
  const d = String(descricao ?? "").replace(/\s+/g, " ").trim();
  return (d || "Pagamento").slice(0, 100);
}

/** Para onde a página da InfinitePay devolve: o site do mesmo ambiente (ou o local); APK e o resto → o site do ambiente (na produção o
 *  App Link /perfil reabre o app — AndroidManifest.xml). Nunca uma origem de fora (sem redirecionamento aberto). */
export function urlDeVolta(schema: Schema, origin: string | null | undefined, caminho = "/perfil/pagamentos"): string {
  const base = origin && (SITE_DO_AMBIENTE[schema].test(origin) || LOCAL.test(origin)) ? origin : SITE[schema];
  return `${base}${caminho}`;
}

export function urlDoWebhook(supabaseUrl: string, schema: Schema): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/infinitepay-webhook-aluno?schema=${schema}`;
}

export interface PedidoDoLink {
  handle: string;
  centavos: number;
  descricao: string;
  /** order_nsu: o id da cobrança (a tentativa) — ou "teste-<uuid>" no Testar */
  pedido: string;
  volta: string;
  /** null no Testar (ninguém precisa pagar; se pagar, nada a fazer aqui) */
  webhook: string | null;
}

/** O corpo do POST /links ("items": a doc mistura "itens"; o exemplo e a Central de Ajuda usam "items"). Sem `customer`: o mínimo de
 *  dado pessoal (LGPD — a página da InfinitePay pede o que precisar). */
export function corpoDoLink(p: PedidoDoLink): Record<string, unknown> {
  return {
    handle: p.handle,
    items: [{ quantity: 1, price: p.centavos, description: descricaoDoLink(p.descricao) }],
    order_nsu: p.pedido,
    redirect_url: p.volta,
    ...(p.webhook ? { webhook_url: p.webhook } : {}),
  };
}

export function urlDaInfinitePay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim();
  return u.length <= 500 && HOST_IP.test(u) ? u : null;
}

/** A url do checkout na resposta do /links: `url` (Central de Ajuda, 22/07/2026) ou `payment_url` (plugin não oficial). */
export function lerLink(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const dentro = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : {};
  return urlDaInfinitePay(b.url) ?? urlDaInfinitePay(b.payment_url) ?? urlDaInfinitePay(dentro.url);
}

export interface AvisoIp {
  /** order_nsu = cobrancas.id */
  pedido: string;
  /** transaction_nsu */
  nsu: string;
  /** invoice_slug (webhook) | slug (volta) */
  slug: string | null;
  /** receipt_url (só domínio da InfinitePay) */
  recibo: string | null;
  meio: MeioIp | null;
}

function meio(v: unknown): MeioIp | null {
  return v === "pix" || v === "credit_card" ? v : null;
}

function codigo(v: unknown): string | null {
  const s = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : typeof v === "string" ? v.trim() : "";
  return CODIGO.test(s) ? s : null;
}

/** O corpo do webhook (SEM assinatura: aqui só a forma — quem decide é o payment_check). Fora do formato → null (200, ignorado). */
export function lerAvisoDoWebhook(body: unknown): AvisoIp | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const pedido = typeof b.order_nsu === "string" && UUID.test(b.order_nsu.trim()) ? b.order_nsu.trim().toLowerCase() : null;
  const nsu = codigo(b.transaction_nsu);
  if (!pedido || !nsu) return null;
  return { pedido, nsu, slug: codigo(b.invoice_slug ?? b.slug), recibo: urlDaInfinitePay(b.receipt_url), meio: meio(b.capture_method) };
}

/** A volta da página (o redirect_url com receipt_url, order_nsu, slug, capture_method e transaction_nsu na busca). */
export function lerVolta(q: Record<string, unknown>): AvisoIp | null {
  return lerAvisoDoWebhook(q);
}

export const nsuDoPedido = (pedido: string) => `${NSU_DO_PEDIDO}${pedido}`;
export const ehNsuDoPedido = (nsu: string | null | undefined) => !!nsu && nsu.startsWith(NSU_DO_PEDIDO);

export function corpoDoPaymentCheck(handle: string, pedido: string, nsu?: string | null, slug?: string | null): Record<string, unknown> {
  return { handle, order_nsu: pedido, ...(nsu && !ehNsuDoPedido(nsu) ? { transaction_nsu: nsu } : {}), ...(slug ? { slug } : {}) };
}

export interface ConferenciaIp {
  pago: boolean;
  /** amount — o PREÇO do link: é ele que se compara (o paid_amount vem com as taxas que o personal repassa ao aluno) */
  centavos: number | null;
  /** paid_amount */
  centavosPagos: number | null;
  parcelas: number | null;
  meio: MeioIp | null;
  /** se a resposta trouxer (a doc não mostra) */
  nsu: string | null;
}

/** A resposta do payment_check → a conferência, ou null quando não deu para decidir (tenta de novo depois). */
export function lerPaymentCheck(status: number, body: unknown): ConferenciaIp | null {
  const naoPago: ConferenciaIp = { pago: false, centavos: null, centavosPagos: null, parcelas: null, meio: null, nsu: null };
  if (status >= 400 && RECUSA_DECIDIDA.has(status)) return naoPago;
  if (status >= 300) return null;
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (b.success === false) return naoPago;
  if (b.success !== true || typeof b.paid !== "boolean") return null;
  const inteiro = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const parcelas = inteiro(b.installments);
  return {
    pago: b.paid, centavos: inteiro(b.amount), centavosPagos: inteiro(b.paid_amount),
    parcelas: parcelas !== null && parcelas >= 1 && parcelas <= 12 ? parcelas : null, meio: meio(b.capture_method), nsu: codigo(b.transaction_nsu),
  };
}

export type Decisao = "baixar" | "trocar_nsu" | "ja_feito" | "ja_pago_por_fora" | "segundo_pagamento" | "nao_pago" | "valor_diferente";

/** A tentativa como o banco tem: status, forma, o valor em centavos e o NSU já gravado (se já foi paga). */
export interface TentativaParaDecidir {
  status: string;
  forma: string | null;
  centavos: number;
  nsu: string | null;
}

/** O que fazer com um aviso conferido. O spec-review: "link pago 2× não se resolve com idempotência por NSU" — na mensalidade o 2º é
 *  mais um pagamento; na avulsa já paga, registra e avisa o personal para devolver. */
export function decidirBaixa(t: TentativaParaDecidir, c: ConferenciaIp, nsu: string): Decisao {
  if (!c.pago) return "nao_pago";
  if (c.centavos === null || c.centavos !== t.centavos) return "valor_diferente";
  if (t.status !== "paga") return "baixar";
  if (t.forma !== "infinitepay") return "ja_pago_por_fora";
  if (t.nsu === nsu || ehNsuDoPedido(nsu)) return "ja_feito";
  if (ehNsuDoPedido(t.nsu)) return "trocar_nsu";
  return "segundo_pagamento";
}

export function expiraEm(agora: Date = new Date()): string {
  return new Date(agora.getTime() + IP_PRAZO_HORAS * 3_600_000).toISOString();
}

/** A tentativa como a cobrança chega (as colunas ip_* são opcionais no tipo Cobranca: o schema sem a migration não as tem). */
export interface TentativaIp {
  status: string;
  forma: string | null;
  tipo?: string;
  ip_expira_em?: string | null;
  ip_link_url?: string | null;
  ip_handle?: string | null;
  valor?: number | string | null;
}

export function tentativaViva(t: Pick<TentativaIp, "status" | "forma" | "ip_expira_em">, agora: Date = new Date()): boolean {
  return t.status === "aguardando_confirmacao" && t.forma === "infinitepay" && !!t.ip_expira_em && new Date(t.ip_expira_em).getTime() > agora.getTime();
}

export function podeReaproveitar(t: TentativaIp, alvo: { centavos: number; handle: string }, agora: Date = new Date()): boolean {
  return tentativaViva(t, new Date(agora.getTime() + IP_REAPROVEITAR_MS)) && !!urlDaInfinitePay(t.ip_link_url)
    && t.ip_handle === alvo.handle && centavos(t.valor ?? null) === alvo.centavos;
}

export function metodoDoMeio(m: MeioIp | null): "pix" | "cartao" | null {
  return m === "pix" ? "pix" : m === "credit_card" ? "cartao" : null;
}

/** Próxima conferência de um aviso que não deu para decidir: 5 min, 15 min, 30 min e depois de hora em hora. */
export function proximaConferenciaEm(agora: Date, tentativas: number): string {
  const min = tentativas <= 1 ? 5 : tentativas === 2 ? 15 : tentativas === 3 ? 30 : 60;
  return new Date(agora.getTime() + min * 60_000).toISOString();
}

// ───────────────────────── textos do sino (o título não vai para o log — _shared/log.ts) ─────────────────────────

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const comoPagou = (m: MeioIp | null, parcelas: number | null) =>
  m === "pix" ? "Pix" : m === "credit_card" ? (parcelas && parcelas > 1 ? `cartão em ${parcelas}×` : "cartão") : "pagamento";

export function textoPagoAoAluno(c: number): string {
  return `Pagamento confirmado · ${reais(c)}`;
}
export function textoPagoAoPersonal(nome: string, c: number, m: MeioIp | null, parcelas: number | null): string {
  return `Pagamento confirmado · ${nome} · ${reais(c)} (${comoPagou(m, parcelas)} na InfinitePay)`.slice(0, 160);
}
export function textoSegundoPagamento(nome: string, c: number): string {
  return `${nome} pagou ${reais(c)} 2 vezes pela InfinitePay. Devolva um pelo app da InfinitePay.`.slice(0, 160);
}
export function textoJaPagoPorFora(nome: string, c: number): string {
  return `A InfinitePay confirmou ${reais(c)} de ${nome}, que você já tinha registrado. Se foram 2 pagamentos, devolva um pelo app da InfinitePay.`.slice(0, 160);
}
export function textoValorDiferente(nome: string): string {
  return `Um pagamento de ${nome} pela InfinitePay veio com valor diferente. Confira no app da InfinitePay.`.slice(0, 160);
}
export function textoSemConfirmacao(nome: string): string {
  return `Não conseguimos confirmar um pagamento de ${nome} pela InfinitePay. Confira no app da InfinitePay e registre à mão se recebeu.`.slice(0, 160);
}
