// Physiq play-W6 (16/10/2026) — as idas à Google Play Developer API (a conta de serviço play-api@physiq-br, segredo PLAY_SERVICE_ACCOUNT):
//   obter      GET  purchases.subscriptionsv2/tokens/{token}            — a fonte da verdade (a cada compra e a cada aviso)
//   reconhecer POST purchases.subscriptions/{produto}/tokens/{t}:acknowledge  — o v1 (o v2 não reconhece); sem isso em 3 dias o Google
//                                                                       devolve sozinho (3 min no testador de licença)
//   cancelar   POST purchases.subscriptionsv2/tokens/{token}:cancel     — o vínculo e a exclusão (DEVELOPER_REQUESTED_STOP_PAYMENTS)
//   adiar      POST purchases.subscriptionsv2/tokens/{token}:defer      — o etag + a duração (1 dia a 1 ano)
//   revogar    POST purchases.subscriptionsv2/tokens/{token}:revoke     — fullRefund/proratedRefund (o acesso acaba na hora)
// Cada ida com o tempo do Google (TEMPO_MS.google, 8 s) e, quando vem, o prazo do pedido. A base só troca para o simulador local
// (PLAY_API_BASE = http://127.0.0.1:<porta>) e o token do OAuth idem (PLAY_OAUTH_URL); a produção não tem essas variáveis.
// O token de compra vai na URL (a API pede assim): a URL e o corpo da resposta NUNCA vão para o log — só o status e o código curto
// (codigoDoErroGoogle). Sem Deno global obrigatório (o Vitest importa com o fetch falso).
import { GoogleSemToken, esquecerToken, tokenDoGoogle } from "./google-oauth.ts";
import { ESCOPO_PLAY, PACOTE, baseDaApi, codigoDoErroGoogle, urlLocal } from "./play-regras.ts";
import { lerContaDeServico, type ContaDeServico } from "./push-regras.ts";
import { TEMPO_MS, buscarComTempo, type Prazo } from "./tempo.ts";

type ComDeno = { Deno?: { env: { get: (n: string) => string | undefined } } };
const ambiente = (n: string): string | undefined => (globalThis as ComDeno).Deno?.env.get(n);

/** A Play não respondeu de um jeito que decida (rede, prazo, OAuth, limite ou fora do ar): quem chama tenta de novo depois. */
export class PlayIndisponivel extends Error {
  constructor(public readonly status: number, public readonly codigo: string | null = null) {
    super(`play_indisponivel_${status}`);
    this.name = "PlayIndisponivel";
  }
}

export interface RespostaPlay<T> {
  status: number;
  corpo: T | null;
  /** o código curto do erro do Google (NOT_FOUND, purchaseTokenNotFound…) — o que pode ir ao log */
  erro: string | null;
}

export interface OpcoesPlay {
  /** o prazo do pedido (cada ida leva no máximo o que sobra) */
  prazo?: Prazo;
  /** a conta de serviço (o padrão: o segredo PLAY_SERVICE_ACCOUNT) */
  conta?: ContaDeServico | null;
  /** o fetch (o Vitest passa um falso) */
  buscar?: typeof fetch;
}

/** A conta de serviço da Play (o segredo PLAY_SERVICE_ACCOUNT); null = sem a Play (nada quebra: quem chama pula com o log). */
export function contaDaPlay(): ContaDeServico | null {
  return lerContaDeServico(ambiente("PLAY_SERVICE_ACCOUNT"));
}

const caminhoV2 = (token: string) => `/androidpublisher/v3/applications/${PACOTE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo: unknown, opcoes: OpcoesPlay): Promise<RespostaPlay<T>> {
  const conta = opcoes.conta === undefined ? contaDaPlay() : opcoes.conta;
  if (!conta) throw new PlayIndisponivel(0, "sem_credencial");
  const ms = Math.max(1, Math.min(TEMPO_MS.google, opcoes.prazo ? opcoes.prazo.restante() : TEMPO_MS.google));
  if (opcoes.prazo?.esgotado()) throw new PlayIndisponivel(599, "prazo");
  const url = `${baseDaApi(ambiente("PLAY_API_BASE"))}${caminho}`;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let acesso: string;
    try {
      acesso = await tokenDoGoogle(conta, ESCOPO_PLAY, { url: urlLocal(ambiente("PLAY_OAUTH_URL")), buscar: opcoes.buscar, ms });
    } catch (e) {
      const s = e instanceof GoogleSemToken ? e.status : 0;
      throw new PlayIndisponivel(s === 0 ? 599 : s, e instanceof GoogleSemToken ? e.codigo : null);
    }
    let r: Response;
    try {
      r = await buscarComTempo(url, {
        method: metodo,
        headers: { Authorization: `Bearer ${acesso}`, ...(metodo === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}) },
        ...(metodo === "POST" ? { body: JSON.stringify(corpo ?? {}) } : {}),
      }, ms, opcoes.buscar ?? fetch);
    } catch {
      throw new PlayIndisponivel(599, "rede");
    }
    if (r.status === 401 && tentativa === 0) {
      // o token de acesso venceu ou foi recusado: pede outro e tenta 1 vez
      esquecerToken(conta, ESCOPO_PLAY);
      await r.body?.cancel().catch(() => {});
      continue;
    }
    const texto = await r.text().catch(() => "");
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    return { status: r.status, corpo: r.ok ? (json as T) : null, erro: r.ok ? null : codigoDoErroGoogle(json) };
  }
  throw new PlayIndisponivel(401, "token_recusado");
}

/** O GET da assinatura (v2). 200 = a assinatura; 404/410/400 = a compra não existe para este app. */
export function obter(token: string, opcoes: OpcoesPlay = {}): Promise<RespostaPlay<Record<string, unknown>>> {
  return chamar("GET", caminhoV2(token), null, opcoes);
}

/** Reconhece a compra (v1, pelo produto). 200/204 = reconhecida. */
export function reconhecer(produto: string, token: string, opcoes: OpcoesPlay = {}): Promise<RespostaPlay<unknown>> {
  const caminho = `/androidpublisher/v3/applications/${PACOTE}/purchases/subscriptions/${encodeURIComponent(produto)}/tokens/${encodeURIComponent(token)}:acknowledge`;
  return chamar("POST", caminho, {}, opcoes);
}

/** Cancela (v2): USER_REQUESTED_STOP_RENEWALS (pode voltar) ou DEVELOPER_REQUESTED_STOP_PAYMENTS (vale até o fim, não volta). */
export function cancelar(token: string, tipo: "USER_REQUESTED_STOP_RENEWALS" | "DEVELOPER_REQUESTED_STOP_PAYMENTS", opcoes: OpcoesPlay = {}): Promise<RespostaPlay<unknown>> {
  return chamar("POST", `${caminhoV2(token)}:cancel`, { cancellationContext: { cancellationType: tipo } }, opcoes);
}

/** Adia a próxima cobrança (v2): o etag do GET mais novo + a duração ("432000s"). */
export function adiar(token: string, etag: string, duracao: string, opcoes: OpcoesPlay = {}): Promise<RespostaPlay<Record<string, unknown>>> {
  return chamar("POST", `${caminhoV2(token)}:defer`, { deferralContext: { etag, deferDuration: duracao } }, opcoes);
}

/** Revoga (v2): devolve tudo (integral) ou o que falta (proporcional) e corta o acesso na hora. */
export function revogar(token: string, devolucao: "integral" | "proporcional", opcoes: OpcoesPlay = {}): Promise<RespostaPlay<unknown>> {
  const contexto = devolucao === "integral" ? { fullRefund: {} } : { proratedRefund: {} };
  return chamar("POST", `${caminhoV2(token)}:revoke`, { revocationContext: contexto }, opcoes);
}
