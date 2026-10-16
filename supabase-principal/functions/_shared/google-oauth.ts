// Physiq play-W6 (16/10/2026) — o token de acesso do Google de uma conta de serviço, com o ESCOPO por parâmetro: o JWT RS256 assinado
// com a chave da conta → oauth2.googleapis.com/token (o grant jwt-bearer) → o access_token (1 hora), guardado por conta + escopo enquanto
// a instância vive. É a receita do tokenDoGoogle da push-enviar (que não muda: o escopo dela é fixo) para a Google Play Developer API
// (_shared/play-api.ts, escopo androidpublisher).
// Sem Deno e sem import de URL: o Vitest importa (crypto.subtle e o fetch do ambiente; o tempo pelo buscarComTempo). O corpo da resposta
// do Google nunca vai para o log nem para a mensagem do erro — só o status e o código curto (invalid_grant).
import { base64url, pemParaDer, type ContaDeServico } from "./push-regras.ts";
import { TEMPO_MS, buscarComTempo } from "./tempo.ts";

/** O Google não deu o token (o OAuth recusou, a rede ou o prazo): `status` 0 = sem resposta; `codigo` = o "error" curto do OAuth. */
export class GoogleSemToken extends Error {
  constructor(public readonly status: number, public readonly codigo: string | null) {
    super(`google_oauth_${status}`);
    this.name = "GoogleSemToken";
  }
}

export interface OpcoesToken {
  /** troca a URL do token (o simulador local: http://127.0.0.1:<porta>/token) — o `aud` do JWT segue o token_uri da conta */
  url?: string | null;
  /** o fetch (o Vitest passa um falso) */
  buscar?: typeof fetch;
  /** o relógio (ms) */
  agora?: () => number;
  /** o tempo da ida ao Google (ms) — o padrão é o TEMPO_MS.google */
  ms?: number;
}

const guardados = new Map<string, { token: string; expira: number }>();

/** As claims do JWT que troca a conta de serviço por um token de acesso (vale 1 hora). */
export function claimsDoToken(conta: Pick<ContaDeServico, "client_email" | "token_uri">, escopo: string, agoraSeg: number): Record<string, string | number> {
  return { iss: conta.client_email, scope: escopo, aud: conta.token_uri, iat: agoraSeg, exp: agoraSeg + 3600 };
}

/** Esquece o token guardado (o Google recusou com 401: o próximo pede outro). */
export function esquecerToken(conta: Pick<ContaDeServico, "client_email">, escopo: string): void {
  guardados.delete(`${conta.client_email}|${escopo}`);
}

/** O token de acesso do Google para `escopo` (do guardado, se ainda vale por mais de 1 minuto). Falhou → GoogleSemToken. */
export async function tokenDoGoogle(conta: ContaDeServico, escopo: string, opcoes: OpcoesToken = {}): Promise<string> {
  const agora = opcoes.agora ?? Date.now;
  const chave = `${conta.client_email}|${escopo}`;
  const guardado = guardados.get(chave);
  if (guardado && guardado.expira > agora() + 60_000) return guardado.token;
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify(claimsDoToken(conta, escopo, Math.floor(agora() / 1000))));
  let assinatura: Uint8Array;
  try {
    const k = await crypto.subtle.importKey("pkcs8", pemParaDer(conta.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    assinatura = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(`${cabecalho}.${claims}`)));
  } catch {
    throw new GoogleSemToken(0, "chave_invalida");
  }
  let r: Response;
  try {
    r = await buscarComTempo(opcoes.url ?? conta.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cabecalho}.${claims}.${base64url(assinatura)}` }),
    }, opcoes.ms ?? TEMPO_MS.google, opcoes.buscar ?? fetch);
  } catch {
    throw new GoogleSemToken(0, "rede");
  }
  const corpo = (await r.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
  if (!r.ok || typeof corpo.access_token !== "string") {
    const codigo = typeof corpo.error === "string" && /^[a-z_]{1,40}$/.test(corpo.error) ? corpo.error : null;
    throw new GoogleSemToken(r.status, codigo);
  }
  guardados.set(chave, { token: corpo.access_token, expira: agora() + (Number(corpo.expires_in) || 3600) * 1000 });
  return corpo.access_token;
}
