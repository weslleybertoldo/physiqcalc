// supabase-principal/functions/_shared/infinitepay.ts
// Physiq W1 — o cliente da API da InfinitePay (checkout hospedado). Sem chave (a InfiniteTag é o único identificador) e com tempo: cada
// chamada espera no máximo TEMPO_IP_MS (e o que falta do prazo do pedido — _shared/tempo.ts, que NÃO muda: tem cópia no Treino com
// teste byte a byte); rede ou tempo → status 599. O fetch entra por parâmetro (o Vitest passa um falso — src/financeiro/
// infinitepayCliente.test.ts). A base é a da doc; INFINITEPAY_API só troca para o SIMULADOR LOCAL (http://127.0.0.1:<porta> —
// e2e/w1/simulador_ip.py): qualquer outro valor é ignorado. Quem chama loga só o status (nunca o corpo, a InfiniteTag ou a url).
// Sondado na API de verdade em 11/10/2026: o POST /links responde 404 {success: false, error: "external_checkout_not_enabled", message,
// redirect_url} tanto para a conta com o checkout externo desligado quanto para a InfiniteTag que NÃO existe — a API não separa os 2,
// então quem mostra diz as 2 coisas juntas ("confira a InfiniteTag e ative o checkout externo na InfinitePay", com o link de ativar);
// o POST /payment_check de um pedido que não existe responde 200 {success: false} (não confirmado — o lerPaymentCheck já decide).
import {
  IP_API, IP_TESTE_CENTAVOS, corpoDoLink, corpoDoPaymentCheck, lerLink, lerPaymentCheck, urlDaInfinitePay, type ConferenciaIp,
  type PedidoDoLink,
} from "./infinitepay-regras.ts";
import { buscarComTempo, tempoEsgotado, type Prazo } from "./tempo.ts";

export const TEMPO_IP_MS = 8_000;
const MINIMO_MS = 1_000;

/** O motivo que a InfinitePay deu (hoje só um): o checkout externo desligado na conta — ou a InfiniteTag que não existe (a mesma
 *  resposta). Não é "fora do ar" nem o "não aceitou" genérico. */
export type ErroIp = "checkout_desligado";

/** Onde o personal ativa o checkout externo (o redirect_url da resposta de 11/10/2026): vale quando a resposta não trouxer um link da
 *  InfinitePay. */
export const IP_ATIVAR_CHECKOUT = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true";

export interface OpcoesIp {
  prazo?: Prazo;
  fetch?: typeof fetch;
  /** INFINITEPAY_API (só o simulador local vale) */
  base?: string | null;
}

export interface LinkIp {
  status: number;
  url: string | null;
  /** só quando a InfinitePay disse o motivo */
  erro?: ErroIp;
  /** com o "checkout_desligado": o link de ativar (só um domínio da InfinitePay) */
  ativar?: string;
}

export function baseDaApi(env: string | null | undefined): string {
  return env && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(env) ? env : IP_API;
}

/** A resposta diz "checkout externo desligado (ou InfiniteTag que não existe)"? → o link de ativar; senão null. Pelo código do erro, não
 *  pelo status: um 404 sem ele segue o caminho de sempre. */
export function lerCheckoutDesligado(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.error !== "external_checkout_not_enabled") return null;
  return urlDaInfinitePay(b.redirect_url) ?? IP_ATIVAR_CHECKOUT;
}

async function postar(caminho: string, corpo: Record<string, unknown>, o: OpcoesIp): Promise<{ status: number; body: unknown }> {
  const ms = Math.min(TEMPO_IP_MS, o.prazo ? o.prazo.restante() : TEMPO_IP_MS);
  if (ms < MINIMO_MS) return { status: 599, body: null };
  try {
    const res = await buscarComTempo(`${baseDaApi(o.base)}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
    }, ms, o.fetch ?? fetch);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch (e) {
      if (tempoEsgotado(e)) return { status: 599, body: null }; // o tempo vale até ler o corpo
    }
    return { status: res.status, body };
  } catch {
    return { status: 599, body: null };
  }
}

export async function criarLink(p: PedidoDoLink, o: OpcoesIp = {}): Promise<LinkIp> {
  const r = await postar("/links", corpoDoLink(p), o);
  const url = r.status < 300 ? lerLink(r.body) : null;
  if (url) return { status: r.status, url };
  const ativar = lerCheckoutDesligado(r.body);
  return ativar ? { status: r.status, url: null, erro: "checkout_desligado", ativar } : { status: r.status, url: null };
}

export async function conferirPagamento(handle: string, pedido: string, nsu: string | null, slug: string | null, o: OpcoesIp = {}):
  Promise<{ status: number; conferencia: ConferenciaIp | null; erro?: ErroIp }> {
  const r = await postar("/payment_check", corpoDoPaymentCheck(handle, pedido, nsu, slug), o);
  // o checkout desligado não diz nada do pagamento: SEM decisão (a caixa tenta de novo e, no fim, avisa o personal) — nunca o "não pago"
  // do 404 no lerPaymentCheck, que fecharia o aviso de um pagamento de verdade (o personal desligou o checkout depois que o aluno pagou)
  if (lerCheckoutDesligado(r.body)) return { status: r.status, conferencia: null, erro: "checkout_desligado" };
  return { status: r.status, conferencia: lerPaymentCheck(r.status, r.body) };
}

/** O link do "Testar" (e da conferência da InfiniteTag ao salvar): R$ 1,00, sem webhook — ninguém precisa pagar. */
export function pedidoDeTeste(handle: string, volta: string): PedidoDoLink {
  return { handle, centavos: IP_TESTE_CENTAVOS, descricao: "Teste do Physiq — não precisa pagar", pedido: `teste-${crypto.randomUUID()}`, volta, webhook: null };
}
