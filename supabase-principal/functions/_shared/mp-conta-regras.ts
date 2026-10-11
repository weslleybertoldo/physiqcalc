// supabase-principal/functions/_shared/mp-conta-regras.ts
// Physiq W2 — regras PURAS do Mercado Pago DA CONTA do personal (OAuth): a URL de autorização (state + PKCE S256), o redirect por schema e o
// de teste, a leitura do POST /oauth/token (a public_key é OPCIONAL — a prova da Task 1 decide o cartão), quando renovar (o acesso vale 180
// dias; o refresh_token GIRA a cada renovação), a volta para o site (destino fixo por schema), o aviso do MP por conta (?conta=<uuid>), a
// x-signature (manifesto "id:…;request-id:…;ts:…;" + HMAC-SHA256), qual credencial vale para o que já existe e a situação que o dono vê.
// Sem import de URL e sem o global Deno: o Vitest importa (src/financeiro/mpConta.test.ts) e a tela reexporta (src/financeiro/mpConta.ts).
// Fontes (11/10/2026): mercadopago.com.br/developers/pt/docs/security/oauth/creation · …/en/reference/authentication/oauth/_oauth_token/post ·
// …/pt/docs/security/oauth/renewal · …/pt/docs/your-integrations/notifications/webhooks.

export type Schema = "public" | "staging";
/** A autorização da doc (o personal escolhe o país 1 vez). O auth.mercadopago.com.br vai direto ao login do MLB (medido em 11/10, NÃO
 *  documentado): só vira o padrão se a prova (Task 1) mostrar que o .com não fecha o ciclo — o filtro da tela já aceita os 2 (I6). */
export const MP_AUTH = "https://auth.mercadopago.com/authorization";
const HOSTS_DE_AUTORIZACAO = new Set(["auth.mercadopago.com", "auth.mercadopago.com.br"]);
/** O filtro da tela (MENOR 9): só abre a autorização do MP — https, host EXATO e o caminho /authorization. */
export function ehUrlDeAutorizacaoMp(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS_DE_AUTORIZACAO.has(u.hostname) && u.pathname === "/authorization";
  } catch {
    return false;
  }
}
/** MENOR 20: a conta conectada tem de ser do mundo do schema — produção (live_mode true) no public, teste no staging. Sem a informação,
 *  não dá para conferir (true): a prova (Task 1) mostra se o MP manda. */
export function modoDaConexaoConfere(live: boolean | null | undefined, schema: Schema): boolean {
  return typeof live !== "boolean" || live === (schema === "public");
}
/** O domínio próprio da API (Worker api-principal — docs/api-dominio-proprio.md). */
export const URL_API_PROPRIA = "https://api-principal.physiqcalc.com.br";
/** A volta do OAuth cadastrada no MP (W2-a): fixa, uma por schema (o MP exige estática e nada de dado nela). */
export function redirectDoSchema(schema: Schema): string {
  return `${URL_API_PROPRIA}/functions/v1/mp-conectar-retorno/${schema}`;
}
/** O ÚNICO redirect que a aplicação já tinha (GET /applications/<id>, 11/10). SÓ no staging: prova e E2E do OAuth real antes da W2-a. */
export const REDIRECT_TESTE_MP = "https://www.mercadopago.com";
/** A notification_url de um pagamento/assinatura NA CONTA do personal. */
export function notificacaoDaConta(schema: Schema, contaId: string): string {
  return `${URL_API_PROPRIA}/functions/v1/mp-webhook-aluno?schema=${schema}&conta=${contaId}`;
}
export const ESTADO_MS = 10 * 60_000;
export const RENOVAR_ANTES_MS = 30 * 86_400_000;
export const RENOVAR_NA_HORA_MS = 86_400_000;
export const AVISO_DONO_MS = 86_400_000;
const SIMULADOR = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;

export function base64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** state (32 bytes → 43 caracteres) e verifier do PKCE (48 bytes → 64 caracteres; a RFC pede 43–128). */
export function novoSegredoUrl(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function sha256Hex(texto: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function desafioPkce(verificador: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))));
}
export function ehEstado(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
}

export function urlDeAutorizacao(p: { base?: string | null; clientId: string; redirect: string; estado: string; desafio: string | null }): string {
  const u = new URL(p.base && SIMULADOR.test(p.base) ? `${p.base}/authorization` : MP_AUTH);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("state", p.estado);
  u.searchParams.set("redirect_uri", p.redirect);
  if (p.desafio) {
    u.searchParams.set("code_challenge", p.desafio);
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

export interface TokenMp {
  access: string;
  refresh: string | null;
  expiraEm: string;
  userId: number;
  publicKey: string | null;
  live: boolean | null;
  /** tem refresh E o escopo offline_access (a doc da renovação pede) */
  renovavel: boolean;
}
const TOKEN = /^(APP_USR|TEST)-[A-Za-z0-9_-]{10,300}$/;
const REFRESH = /^[A-Za-z0-9_-]{8,300}$/;
const CHAVE_PUBLICA = /^(APP_USR|TEST)-[A-Za-z0-9-]{8,72}$/;

export function lerTokenDoMp(corpo: unknown, agora = Date.now()): TokenMp | null {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
  if (!c || typeof c.access_token !== "string" || !TOKEN.test(c.access_token)) return null;
  const userId = Number(c.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const segundos = Number(c.expires_in);
  if (!Number.isFinite(segundos) || segundos < 60 || segundos > 400 * 86_400) return null;
  const refresh = typeof c.refresh_token === "string" && REFRESH.test(c.refresh_token) ? c.refresh_token : null;
  const escopo = typeof c.scope === "string" ? c.scope.split(/\s+/) : [];
  return {
    access: c.access_token, refresh, userId, expiraEm: new Date(agora + segundos * 1000).toISOString(),
    publicKey: typeof c.public_key === "string" && CHAVE_PUBLICA.test(c.public_key) ? c.public_key : null,
    live: typeof c.live_mode === "boolean" ? c.live_mode : null, renovavel: !!refresh && escopo.includes("offline_access"),
  };
}
export type MotivoOauth = "recusado" | "fora";
export function motivoDoOauth(status: number): MotivoOauth {
  return status >= 500 || status === 429 ? "fora" : "recusado";
}
/** Só o código do erro do OAuth (invalid_grant…) — vai para o log no campo mp_erro; a mensagem nunca. */
export function codigoDoOauth(corpo: unknown): string | null {
  const e = (corpo as { error?: unknown } | null)?.error;
  return typeof e === "string" && /^[a-z_]{1,40}$/.test(e) ? e : null;
}

export function precisaRenovar(expiraEm: string | null | undefined, agora = Date.now(), antesMs = RENOVAR_ANTES_MS): boolean {
  const t = expiraEm ? Date.parse(expiraEm) : NaN;
  return Number.isFinite(t) && t - agora < antesMs;
}
export function proximaTentativa(tentativas: number, agora = Date.now()): string {
  const horas = Math.min(24, 2 ** Math.max(0, Math.min(5, tentativas)));
  return new Date(agora + horas * 3_600_000).toISOString();
}

export type ResultadoDoRetorno = "ok" | "negado" | "vencido" | "invalido" | "falhou" | "outra_conta" | "conectado_sem_trocar"
  | "confirmar" | "conta_de_teste" | "outra_pessoa" | "mp_em_outra_conta";
export const TEXTO_DO_RETORNO: Record<ResultadoDoRetorno, string> = {
  ok: "Pronto: o seu Mercado Pago está conectado. Os alunos pagam por Pix ou cartão e o dinheiro cai direto na sua conta.",
  negado: "Você não autorizou o Physiq no Mercado Pago. Toque em Conectar para tentar de novo.",
  vencido: "Passaram mais de 10 minutos. Toque em Conectar de novo.",
  invalido: "Esse link de conexão já foi usado ou não vale mais. Toque em Conectar de novo.",
  falhou: "O Mercado Pago não respondeu agora. Tente de novo em instantes.",
  // I5: a conta antiga ainda tem algo em andamento nos alunos desta conta (automática ou Pix aberto / cartão em análise)
  outra_conta: "Essa é outra conta do Mercado Pago, e a de antes ainda tem pagamento em andamento (cobrança automática ou Pix aberto). Desligue as cobranças automáticas (Desconectar) e espere o Pix aberto vencer — até 3 dias — ou peça ao aluno para pagar de outro jeito; depois conecte a nova.",
  conectado_sem_trocar: "Conectado. Toque em \"Salvar a forma\" para os alunos passarem a pagar pelo seu Mercado Pago.",
  // I8: a volta não grava nada; quem começou confirma, logado (a pergunta mostra a conta do Mercado Pago)
  confirmar: "Falta confirmar: é esta a conta do Mercado Pago que vai receber dos seus alunos?",
  // MENOR 20: conta de teste na produção (ou de verdade no ambiente de teste)
  conta_de_teste: "Essa conta do Mercado Pago não serve aqui (é uma conta de teste). Conecte a sua conta de verdade.",
  outra_pessoa: "Essa conexão foi começada por outra conta do Physiq. Se foi você, entre nela; se não foi, ignore — nada foi ligado.",
  // MENOR 29 (só se a prova mostrar que a 2ª autorização derruba a 1ª)
  mp_em_outra_conta: "Essa conta do Mercado Pago já está ligada em outra conta do Physiq. Desconecte lá antes.",
};
export function ehResultadoDoRetorno(v: unknown): v is ResultadoDoRetorno {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TEXTO_DO_RETORNO, v);
}
/** A volta SEMPRE cai no site (decisão 6): no APK, o Conectar abre o site no navegador e o fluxo todo acontece nele. O "confirmar" leva o id
 *  da conexão (uuid); qualquer outra coisa vira "invalido" (nada da URL do MP chega aqui). */
export function destinoDoRetorno(site: string, r: ResultadoDoRetorno, conexao?: string): string {
  const base = `${site}/painel/configuracoes/recebimento`;
  if (r !== "confirmar") return `${base}?mp=${r}`;
  return ehUuidMp(conexao) ? `${base}?mp=confirmar&c=${conexao}` : `${base}?mp=invalido`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function ehUuidMp(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
export interface AvisoDoMp { topico: string; id: string; userId: number | null }
export interface AvisoDaConta extends AvisoDoMp { conta: string }
/** O tópico, o id e o user_id de um aviso do MP (corpo novo ou IPN na query) — sem a conta (o caminho pelo user_id do painel — I1). */
export function lerAvisoDoMp(url: URL, corpo: unknown): AvisoDoMp {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  const dados = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
  const topico = String(c.type || c.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
  const id = String(dados.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  const userId = Number(c.user_id);
  return { topico, id, userId: Number.isSafeInteger(userId) && userId > 0 ? userId : null };
}
export function lerAvisoDaConta(url: URL, corpo: unknown): AvisoDaConta | null {
  const conta = (url.searchParams.get("conta") || "").toLowerCase();
  if (!UUID.test(conta)) return null;
  return { conta, ...lerAvisoDoMp(url, corpo) };
}

export function manifestoDaAssinatura(dataId: string | null, requestId: string | null, ts: string): string {
  return `${dataId ? `id:${dataId.toLowerCase()};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
}
export async function assinaturaMp(p: { cabecalho: string | null; requestId: string | null; dataId: string | null; segredo: string | null | undefined }):
  Promise<"valida" | "invalida" | "ausente"> {
  const segredo = (p.segredo ?? "").trim();
  if (!segredo || !p.cabecalho) return "ausente";
  const partes = new Map(p.cabecalho.split(",").map((x) => x.trim().split("=", 2)).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const ts = partes.get("ts") ?? "";
  const v1 = (partes.get("v1") ?? "").toLowerCase();
  if (!/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/.test(v1)) return "invalida";
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifestoDaAssinatura(p.dataId, p.requestId, ts))));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  let dif = 0;
  for (let i = 0; i < 64; i++) dif |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0 ? "valida" : "invalida";
}

export function qualCredencial(collector: number | string | null | undefined, integ: { mp_user_id: number | string | null } | null):
  "physiq" | "conta" | "outra_conta" {
  if (collector === null || collector === undefined || collector === "") return "physiq";
  return integ?.mp_user_id != null && Number(collector) === Number(integ.mp_user_id) ? "conta" : "outra_conta";
}

export interface SituacaoMp { tom: "verde" | "ambar" | "rosa" | "cinza"; titulo: string; texto: string; acao: "conectar" | "reconectar" | null }
export function situacaoDoMp(i: { status: string | null; mp_erro: string | null; mp_expira_em: string | null; mp_apelido: string | null } | null): SituacaoMp {
  if (!i?.status || i.status === "desconectada") {
    return { tom: "cinza", titulo: "Desconectado", texto: "Toque em Conectar e entre na sua conta do Mercado Pago.", acao: "conectar" };
  }
  const conta = i.mp_apelido ? ` (conta ${i.mp_apelido})` : "";
  if (i.status === "erro") {
    return { tom: "rosa", titulo: "Conexão caiu", acao: "reconectar",
      texto: `A conexão com o Mercado Pago${conta} caiu: o acesso foi retirado no Mercado Pago ou venceu. Os alunos não conseguem pagar pelo app até você conectar de novo.` };
  }
  if (i.mp_erro === "renovacao_recusada" || i.mp_erro === "sem_renovacao") {
    const ate = i.mp_expira_em ? new Date(i.mp_expira_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "o vencimento";
    return { tom: "ambar", titulo: "Conectado — renove", acao: "reconectar",
      texto: `Conectado ao Mercado Pago${conta}, mas o Mercado Pago não renovou o acesso sozinho. Conecte de novo até ${ate} para não parar.` };
  }
  return { tom: "verde", titulo: "Conectado", acao: null, texto: `Conectado ao Mercado Pago${conta}. O dinheiro cai direto na sua conta, sem taxa do Physiq.` };
}

export function erroPixSemChave(corpo: unknown): boolean {
  const m = String((corpo as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return m.includes("without key enabled for qr") || m.includes("collector user without key");
}
