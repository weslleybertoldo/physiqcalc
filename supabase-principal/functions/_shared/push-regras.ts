// Physiq W20c — regras PURAS do push no celular (FCM HTTP v1): a mensagem que sai de cada aviso do sino, a leitura da
// resposta do FCM (token recusado → o aparelho sai da lista), a rota segura do toque e a conta de serviço do Google. Sem
// Deno, sem rede e sem banco: testadas no Vitest (src/push/mensagem.test.ts) e usadas pela função push-enviar e pelo app.
// hml-10 (H-48): o push sai SEM nome e SEM valor — título e corpo só pelo tipo do aviso; o texto completo fica no sino.

/** Canal de notificação do Android ("Avisos", importância alta) — o app cria; o FCM usa o mesmo id. */
export const CANAL_AVISOS = "avisos";
export const NOME_CANAL_AVISOS = "Avisos";
/** Ícone pequeno (android/app/src/main/res/drawable/ic_stat_physiq.xml): o traço de atividade da marca, branco. */
export const ICONE_PUSH = "ic_stat_physiq";
/** Violeta da marca: o Android pinta o ícone e o nome do app com ela. */
export const COR_PUSH = "#8B5CF6";
/** Um aparelho que não abre o app há 270 dias tem o token vencido no FCM — sai antes de enviar. */
export const DIAS_TOKEN_VENCIDO = 270;
/** Aviso mais velho que isto não vira push (o sino continua com ele). */
export const HORAS_AVISO_VELHO = 6;
/** Por pessoa: os 10 aparelhos mais recentes. */
export const MAX_APARELHOS = 10;
/** Token sintaticamente válido e inexistente no FCM — usado só na verificação da conta de serviço (validate_only). */
export const TOKEN_DE_VERIFICACAO = "physiq-verificacao-validate-only:APA91bVerificacaoSemAparelho";

export type Schema = "public" | "staging";

export interface AvisoParaPush {
  id: string;
  tipo: string;
  /** O texto do aviso no sino (pode ter nome, valor, dia e hora): NUNCA vai no push (hml-10, H-48). */
  titulo?: string | null;
  link: string | null;
}

const TITULOS: Record<string, string> = {
  consulta_marcada: "Agenda",
  plano_atualizado: "Seu plano",
  avaliacao_nova: "Avaliação nova",
  pagamento_confirmado: "Pagamento",
  pagamento_recusado: "Pagamento",
  reacao_diario: "Diário",
  geral: "Physiq",
};

/** O título da notificação pelo tipo do aviso (o corpo também é pelo tipo: corpoDoPush). */
export function tituloDoPush(tipo: string | null | undefined): string {
  return TITULOS[String(tipo ?? "")] ?? "Physiq";
}

/**
 * hml-10 (H-48) — o corpo do push é um texto FIXO por tipo, sem nome, sem valor, sem dia e hora: a notificação aparece na tela
 * bloqueada e passa pelo Google (FCM). O texto completo do aviso fica no sino do app, e o toque abre o aviso (data.link).
 * Os tipos são os do avisos_tipo_check (migração da W06); o 'geral' e qualquer outro caem no CORPO_PADRAO_DO_PUSH.
 */
const CORPOS: Record<string, string> = {
  comprovante_enviado: "Chegou um comprovante de pagamento.",
  pagamento_confirmado: "Um pagamento foi confirmado.",
  pagamento_recusado: "Um comprovante precisa da sua atenção.",
  consulta_marcada: "Tem novidade na sua agenda.",
  plano_atualizado: "Seu plano foi atualizado.",
  avaliacao_nova: "Você tem uma avaliação nova.",
  reacao_diario: "Tem novidade no seu diário.",
  membro_removido: "Houve uma mudança na sua equipe.",
};
export const CORPO_PADRAO_DO_PUSH = "Você tem um aviso novo no Physiq.";

/** O corpo da notificação pelo tipo do aviso (nunca o texto do aviso). */
export function corpoDoPush(tipo: string | null | undefined): string {
  const chave = String(tipo ?? "");
  // só as chaves do próprio objeto: "constructor", "__proto__" e afins viram o texto padrão
  return Object.prototype.hasOwnProperty.call(CORPOS, chave) ? CORPOS[chave] : CORPO_PADRAO_DO_PUSH;
}

/** Só caminho DENTRO do app ("/perfil/agenda", "/painel/agenda?data=…"); qualquer outra coisa abre o início. */
export function rotaSegura(link: unknown): string {
  if (typeof link !== "string") return "/";
  const l = link.trim();
  // eslint-disable-next-line no-control-regex
  if (!l.startsWith("/") || l.startsWith("//") || l.includes("\\") || /[\u0000-\u001f\u007f]/.test(l) || l.length > 300) return "/";
  return l;
}

/** Token de aparelho aceito no banco e no app (o do FCM tem ~150–200 caracteres destes). */
export function tokenValido(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_:.-]{20,4096}$/.test(token);
}

/** Só o fim do token, para o log (o token inteiro nunca vai para o log). */
export function fimDoToken(token: string): string {
  return `…${String(token).slice(-6)}`;
}

export interface MensagemFcm {
  validate_only?: boolean;
  message: {
    token: string;
    notification: { title: string; body: string };
    data: Record<string, string>;
    android: {
      priority: "HIGH";
      ttl: string;
      notification: { channel_id: string; icon: string; color: string; tag: string; visibility: "PRIVATE" };
    };
  };
}

/**
 * A mensagem do FCM HTTP v1 de um aviso do sino. `validar` = validate_only (o FCM confere e não entrega).
 * hml-10 (H-48): título e corpo só pelo tipo — o aviso.titulo (nome, valor, motivo, dia e hora) nunca entra na mensagem.
 */
export function montarMensagem(aviso: AvisoParaPush, token: string, opcoes: { validar?: boolean } = {}): MensagemFcm {
  const mensagem: MensagemFcm = {
    message: {
      token,
      notification: { title: tituloDoPush(aviso.tipo), body: corpoDoPush(aviso.tipo) },
      // os valores do data do FCM são sempre texto
      data: { link: rotaSegura(aviso.link), aviso_id: String(aviso.id), tipo: String(aviso.tipo ?? "geral") },
      android: {
        priority: "HIGH",
        ttl: "259200s",
        // PRIVATE é o padrão do Android e fica escrito: com "ocultar conteúdo sensível" ligado, a tela bloqueada esconde o
        // conteúdo. Sozinho não protege (vem desligado na maioria dos celulares): quem protege é o corpo sem dado, acima.
        notification: { channel_id: CANAL_AVISOS, icon: ICONE_PUSH, color: COR_PUSH, tag: `aviso-${aviso.id}`, visibility: "PRIVATE" },
      },
    },
  };
  if (opcoes.validar) mensagem.validate_only = true;
  return mensagem;
}

export type DesfechoFcm = "enviado" | "token_invalido" | "falha";

export interface ResultadoFcm {
  desfecho: DesfechoFcm;
  status: number;
  /** OK · UNREGISTERED · INVALID_ARGUMENT · SENDER_ID_MISMATCH · QUOTA_EXCEEDED · UNAVAILABLE · INTERNAL · UNAUTHENTICATED… */
  codigo: string;
  mensagem?: string;
  /** o id da mensagem aceita pelo FCM (projects/…/messages/…) */
  nome?: string;
}

interface ErroGoogle {
  status?: string;
  message?: string;
  details?: Array<Record<string, unknown>>;
}

/**
 * Lê a resposta do FCM. Token recusado (o aparelho sai da lista): UNREGISTERED (404 — app desinstalado/token apagado),
 * SENDER_ID_MISMATCH (403 — token de outro projeto) e INVALID_ARGUMENT do campo message.token (400 — token que não é do FCM).
 * O resto (cota, indisponível, autenticação) é falha passageira: o token fica.
 */
export function lerRespostaFcm(status: number, corpo: unknown): ResultadoFcm {
  if (status >= 200 && status < 300) {
    const nome = (corpo as { name?: unknown } | null)?.name;
    return { desfecho: "enviado", status, codigo: "OK", ...(typeof nome === "string" ? { nome } : {}) };
  }
  const erro: ErroGoogle = ((corpo as { error?: ErroGoogle } | null)?.error ?? {}) as ErroGoogle;
  const detalhes = Array.isArray(erro.details) ? erro.details : [];
  const fcm = detalhes.find((d) => String(d?.["@type"] ?? "").endsWith("google.firebase.fcm.v1.FcmError"));
  const codigo = String(fcm?.errorCode ?? erro.status ?? `HTTP_${status}`);
  const mensagem = String(erro.message ?? "").slice(0, 200);
  const campoDoToken = detalhes.some((d) => {
    const v = (d as { fieldViolations?: unknown }).fieldViolations;
    return Array.isArray(v) && v.some((x) => String((x as { field?: unknown })?.field ?? "") === "message.token");
  });
  const tokenRuim = codigo === "UNREGISTERED" || codigo === "SENDER_ID_MISMATCH"
    || (codigo === "INVALID_ARGUMENT" && (campoDoToken || /registration token/i.test(mensagem)));
  return { desfecho: tokenRuim ? "token_invalido" : "falha", status, codigo, ...(mensagem ? { mensagem } : {}) };
}

/**
 * A conta de serviço autenticou? Prova positiva: o FCM aceitou as credenciais e chegou a julgar o token (validate_only com o
 * token de verificação → 400 "token inválido" = sim). 401/403, falha do OAuth ou erro do servidor = não provado.
 */
export function contaAutenticou(r: ResultadoFcm): boolean {
  return r.desfecho === "enviado" || r.desfecho === "token_invalido";
}

export interface ContaDeServico {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

/** O JSON da chave da conta de serviço (segredo FCM_SERVICE_ACCOUNT); null se faltar algum campo. */
export function lerContaDeServico(texto: string | null | undefined): ContaDeServico | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as Record<string, unknown>;
    const project_id = typeof j.project_id === "string" ? j.project_id : "";
    const client_email = typeof j.client_email === "string" ? j.client_email : "";
    const private_key = typeof j.private_key === "string" ? j.private_key : "";
    const token_uri = typeof j.token_uri === "string" && j.token_uri.startsWith("https://") ? j.token_uri : "https://oauth2.googleapis.com/token";
    if (!project_id || !client_email.includes("@") || !private_key.includes("PRIVATE KEY")) return null;
    return { project_id, client_email, private_key, token_uri };
  } catch {
    return null;
  }
}

/** As claims do JWT que troca a conta de serviço por um token de acesso do Google (escopo do FCM; vale 1 hora). */
export function claimsDoGoogle(conta: Pick<ContaDeServico, "client_email" | "token_uri">, agoraSeg: number): Record<string, string | number> {
  return {
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: conta.token_uri,
    iat: agoraSeg,
    exp: agoraSeg + 3600,
  };
}

/** base64url (sem "=") de texto ou bytes. */
export function base64url(dado: string | Uint8Array): string {
  const bytes = typeof dado === "string" ? new TextEncoder().encode(dado) : dado;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A chave privada PEM (PKCS#8) em bytes DER, para o crypto.subtle.importKey("pkcs8"). O retorno é Uint8Array<ArrayBuffer>: o
 * importKey só aceita buffer comum (o deno check da push-enviar recusava o Uint8Array genérico — hml-10; só o tipo mudou).
 */
export function pemParaDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Comparação em tempo constante do segredo do cabeçalho (x-push-segredo) com o PUSH_SEGREDO. */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recebido || !esperado || esperado.length < 32) return false;
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  let dif = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) dif |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return dif === 0;
}

/** O aviso nasceu há mais de HORAS_AVISO_VELHO? (chamada repetida/atrasada: não vira push) */
export function avisoVelho(criadoEm: string | null | undefined, agora: Date = new Date()): boolean {
  const t = criadoEm ? new Date(criadoEm).getTime() : NaN;
  if (Number.isNaN(t)) return true;
  return agora.getTime() - t > HORAS_AVISO_VELHO * 3600_000;
}

/** O limite de "token vencido" (ISO): aparelho com atualizado_em antes disto sai da lista. */
export function limiteDoTokenVencido(agora: Date = new Date()): string {
  return new Date(agora.getTime() - DIAS_TOKEN_VENCIDO * 86400_000).toISOString();
}

export interface ResumoEnvio {
  aparelhos: number;
  enviados: number;
  recusados: number;
  falhas: number;
}

/** Soma os resultados de cada aparelho. */
export function resumirEnvio(resultados: readonly ResultadoFcm[]): ResumoEnvio {
  return {
    aparelhos: resultados.length,
    enviados: resultados.filter((r) => r.desfecho === "enviado").length,
    recusados: resultados.filter((r) => r.desfecho === "token_invalido").length,
    falhas: resultados.filter((r) => r.desfecho === "falha").length,
  };
}
