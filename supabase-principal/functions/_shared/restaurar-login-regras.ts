// Physiq restaurar-login (30/10/2026) — regras PURAS de "entrar já logado no celular novo" (a chave de volta do Android: API Restore
// Credentials, a regra "Zero-Tap Sign-In" da Google Play de abr/2027). Sem Deno, sem rede e sem banco: testadas no Vitest com um
// autenticador virtual (src/nucleo/restaurarLoginRegras.test.ts). Quem usa: as funções chave-restauracao (registrar/apagar, com o login da
// pessoa) e restaurar-login (o celular novo, sem login). Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.6, §4.7, D1 = A).
//
// A biblioteca WebAuthn (@simplewebauthn/server 13.3.3 — a 14 pede Deno 2.4 e o Edge Runtime está no 2.1) entra por PARÂMETRO (LibWebAuthn):
// a função passa a do JSR (jsr:@simplewebauthn/server@13.3.3), o Vitest a do npm na MESMA versão (devDependency exata). Assim a conferência
// testada é a de verdade e este arquivo não tem import de URL.
//
// O que a conferência exige (antes da biblioteca, para o log saber o motivo; depois dela, o que ela não confere):
//   registrar  clientDataJSON.type = webauthn.create · o desafio dado · a origem na lista do schema · o RP ID (a biblioteca só confere com
//              expectedRPID — sempre passado) · atestação "none" · o id da resposta = o id do authData (a biblioteca não compara) ·
//              algoritmo -7 ou -257. UP e UV NÃO são exigidos: a criação é silenciosa (o app cria logo depois do login).
//   entrar     clientDataJSON.type = webauthn.get · o desafio dado · a origem · o id = o da chave guardada · o userHandle (quando vem) =
//              o id da pessoa dona da chave · o UP (TOLERANCIA.exigirPresenca) · o RP ID, a assinatura e o contador (só sobe, se algum dos 2
//              passar de 0) pela biblioteca.
// A TOLERANCIA segue o que a fase 0 MEDIU no Android (fase0.md §2–§3: 16 respostas, emulador Google APIs, Android 15, Play services 24.23.35):
// o UP veio 1 em todas → EXIGIDO na entrada (o padrão da biblioteca); o UV veio 0 em todas → não exigido; o contador vem sempre 0 → aceito
// (o > 0 que não sobe é recusado sempre); o AAGUID vem zerado com fmt "none" (autodeclarado: restringir não dá segurança) → qualquer um; BE/BS
// só guardados; o androidPackageName (só vem no registro) e o response.publicKey (COSE, não SPKI) são ignorados — a chave sai do
// attestationObject. Tudo no objeto TOLERANCIA (mudar = trocar 1 valor; cada ponto tem teste, inclusive com as respostas REAIS do Android).
// RÍGIDO sempre: o desafio de uso único (o banco), a origem na lista, o RP ID, a assinatura e a chave não apagada (o banco).
// Para fora, toda recusa da conferência vira 401 chave_invalida (sem oráculo); o motivo exato vai só para o log (MotivoConferencia).
import { emailDeTeste, type UsuarioAuth } from "./login-regras.ts";
import type { Schema } from "./master-regras.ts";

/** O RP ID das chaves de volta nos 2 schemas (o Auth é um só). Trocar inutiliza as chaves guardadas: escolhido uma vez. */
export const RP_ID = "physiqcalc.com.br";
export const RP_NOME = "Physiq";
/** O tempo que o Android tem para responder (o timeout das opções). O desafio vale 5 min no banco. */
export const TEMPO_DO_PEDIDO_MS = 60_000;
export const ALGORITMOS = [-7, -257] as const;

/** O que a conferência deixa passar (medido na fase 0 — fase0.md). Mudar = trocar o valor aqui (+ o teste que fixa o valor). */
export interface Tolerancia {
  /** UP (o "toque") na entrada. true = exige (a fase 0 mediu UP = 1 em 16/16 respostas — a Q2 fechada). O registro nunca exige. */
  exigirPresenca: boolean;
  /** UV (a biometria/PIN) na entrada e no registro. false = não exige (a fase 0 mediu UV = 0 em 16/16; o Android força "discouraged"). */
  exigirVerificacao: boolean;
  /**
   * Contador 0 na entrada vale mesmo com o guardado > 0? true = sim (a fase 0 mediu o contador SEMPRE 0 — no registro e em 2 entradas
   * seguidas; 0 = "sem contador" no WebAuthn). Contador > 0 que não sobe é recusado sempre (contador_voltou: sinal de clone).
   */
  aceitarContadorZero: boolean;
  /**
   * Os AAGUID aceitos no registro; null = qualquer. A fase 0 mediu o AAGUID ZERADO com a atestação "none" (a Q3): sem atestação o AAGUID é
   * autodeclarado — uma lista não daria segurança nenhuma e arriscaria recusar um celular de verdade que mande outro. Fica aberto (decisão).
   */
  aaguidsAceitos: readonly string[] | null;
}

/** Medido na fase 0 (30/10/2026): UP exigido na entrada; UV não (vem sempre 0); contador 0 aceito (vem sempre 0); AAGUID aberto. */
export const TOLERANCIA: Readonly<Tolerancia> = {
  exigirPresenca: true,
  exigirVerificacao: false,
  aceitarContadorZero: true,
  aaguidsAceitos: null,
};

/** As origens do app (o certificado que assina o APP INSTALADO): `android:apk-key-hash:` + base64url(SHA-256 do certificado). */
export const ORIGEM_PLAY = "android:apk-key-hash:neGb1EVsM6ZD2RD0DZkTbTRsnpKVn_OabkwH9QTZLHY"; // 9D:E1:…:2C:76 — a assinatura da Play
export const ORIGEM_APK_SITE = "android:apk-key-hash:z_fskOc_zK8eZADOI_IfLJbQPPcQOIYEAVqFtYk4n2w"; // CF:F7:…:9F:6C — o APK do site
export const ORIGEM_UPLOAD = "android:apk-key-hash:VK67sCdxC-oBwEdTRtsXjGZPcxFB3YyUuohP0jilJk0"; // 54:AE:…:26:4D — a de upload (só staging)
/** A chave de DEBUG do notebook (~/.config/.android/debug.keystore, D3:98:…:9C:A8 — fase0.md M5): o APK "loja + staging". SÓ staging. */
export const ORIGEM_DEBUG_STAGING = "android:apk-key-hash:05haVpcS9Tr4n5ZkaJwGYowtzEhHIQzQyLWHvcYYnKg";

/**
 * As origens aceitas por schema. Produção: a assinatura da Play e o APK do site. Staging: essas 2 + a chave de upload (o APK de teste
 * assinado com ela, o plano B do §4.7 se o Android exigir o assetlinks) + a de debug do notebook (o APK "loja + staging"). A de upload e a de
 * debug NUNCA entram no public (nem no assetlinks.json de produção).
 */
export function origensDoSchema(schema: Schema): string[] {
  return schema === "staging"
    ? [ORIGEM_PLAY, ORIGEM_APK_SITE, ORIGEM_UPLOAD, ORIGEM_DEBUG_STAGING]
    : [ORIGEM_PLAY, ORIGEM_APK_SITE];
}

/** A origem a partir da impressão SHA-256 do certificado ("9D:E1:…", a do assetlinks.json e do Play Console). null = impressão inválida. */
export function origemDoCertificado(impressaoSha256: string): string | null {
  const hex = (impressaoSha256 || "").replace(/:/g, "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return `android:apk-key-hash:${bytesParaBase64url(bytes)}`;
}

// ───────────────────────── base64url (sem Deno: atob/btoa existem no Deno, no Node e no navegador) ─────────────────────────

export function bytesParaBase64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url (sem "=") → bytes; null se não é base64url. */
export function base64urlParaBytes(s: unknown): Uint8Array | null {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function bytesParaHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** hex (o que a restauracao_usar devolve da chave guardada) → bytes; null se não é hex. */
export function hexParaBytes(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O user.id do WebAuthn: os 16 bytes do uuid da pessoa, em base64url (o Android recusa id inválido — IllegalArgumentException). */
export function userHandleDe(userId: string): string {
  if (!UUID.test(userId)) throw new Error("userId não é uuid");
  return bytesParaBase64url(hexParaBytes(userId.replace(/-/g, ""))!);
}

// ───────────────────────── as opções que o app passa ao Android ─────────────────────────

/** PublicKeyCredentialCreationOptionsJSON da chave de volta (CreateRestoreCredentialRequest). Nada de e-mail: a chave é escondida. */
export function opcoesDeRegistro(desafio: string, userId: string) {
  return {
    challenge: desafio,
    rp: { id: RP_ID, name: RP_NOME },
    user: { id: userHandleDe(userId), name: RP_NOME, displayName: RP_NOME },
    pubKeyCredParams: ALGORITMOS.map((alg) => ({ type: "public-key", alg })),
    timeout: TEMPO_DO_PEDIDO_MS,
    attestation: "none",
    // vazio de propósito: quem tem mais de um aparelho não trava
    excludeCredentials: [] as unknown[],
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
  };
}

/** PublicKeyCredentialRequestOptionsJSON da restauração (GetRestoreCredentialOption; o Android força o "discouraged"). */
export function opcoesDeEntrada(desafio: string) {
  return { challenge: desafio, rpId: RP_ID, timeout: TEMPO_DO_PEDIDO_MS, userVerification: "discouraged", allowCredentials: [] as unknown[] };
}

// ───────────────────────── o que o app manda ─────────────────────────

/**
 * Tamanhos máximos (caracteres base64url): o id da chave (o Android manda 32 bytes = 43 caracteres — fase 0; até 128, como o banco), o
 * clientDataJSON, a atestação, o authData e a assinatura.
 */
export const LIMITES = { id: 128, clientData: 4096, atestacao: 16384, authData: 4096, assinatura: 1024, userHandle: 128 } as const;
/** O corpo máximo dos 2 pedidos (bytes). */
export const LIMITE_CORPO = 32_768;
/** O desafio: base64url de 32 bytes (43 caracteres). */
export const RE_DESAFIO = /^[A-Za-z0-9_-]{43}$/;

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const b64u = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v);

/** O id de uma chave (base64url, 16 a 128 caracteres). */
export function credencialValida(v: unknown): v is string {
  return b64u(v, 16, LIMITES.id);
}

/** RegistrationResponseJSON (CreateRestoreCredentialResponse.responseJson). Só os campos conhecidos passam adiante. */
export interface RespostaRegistro {
  id: string;
  rawId: string;
  type: "public-key";
  response: { clientDataJSON: string; attestationObject: string; transports?: string[] };
  clientExtensionResults: Record<string, never>;
}

/** AuthenticationResponseJSON (RestoreCredential.authenticationResponseJson). */
export interface RespostaEntrada {
  id: string;
  rawId: string;
  type: "public-key";
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string };
  clientExtensionResults: Record<string, never>;
}

export function lerRespostaRegistro(v: unknown): RespostaRegistro | null {
  const o = objeto(v);
  const r = objeto(o?.response);
  if (!o || !r || !credencialValida(o.id) || o.rawId !== o.id || o.type !== "public-key") return null;
  if (!b64u(r.clientDataJSON, 16, LIMITES.clientData) || !b64u(r.attestationObject, 16, LIMITES.atestacao)) return null;
  const transports = Array.isArray(r.transports)
    ? r.transports.filter((t): t is string => typeof t === "string" && /^[a-z-]{1,20}$/.test(t)).slice(0, 8)
    : null;
  return {
    id: o.id,
    rawId: o.id,
    type: "public-key",
    response: { clientDataJSON: r.clientDataJSON, attestationObject: r.attestationObject, ...(transports ? { transports } : {}) },
    clientExtensionResults: {},
  };
}

export function lerRespostaEntrada(v: unknown): RespostaEntrada | null {
  const o = objeto(v);
  const r = objeto(o?.response);
  if (!o || !r || !credencialValida(o.id) || o.rawId !== o.id || o.type !== "public-key") return null;
  if (!b64u(r.clientDataJSON, 16, LIMITES.clientData) || !b64u(r.authenticatorData, 37, LIMITES.authData)
    || !b64u(r.signature, 8, LIMITES.assinatura)) return null;
  const temHandle = r.userHandle !== undefined && r.userHandle !== null && r.userHandle !== "";
  if (temHandle && !b64u(r.userHandle, 1, LIMITES.userHandle)) return null;
  return {
    id: o.id,
    rawId: o.id,
    type: "public-key",
    response: {
      clientDataJSON: r.clientDataJSON,
      authenticatorData: r.authenticatorData,
      signature: r.signature,
      ...(temHandle ? { userHandle: r.userHandle as string } : {}),
    },
    clientExtensionResults: {},
  };
}

/** O clientDataJSON (base64url → JSON): tipo, desafio e origem; null se não dá para ler. */
export function clientDataDe(clientDataJSON: string): { type: string; challenge: string; origin: string } | null {
  const bytes = base64urlParaBytes(clientDataJSON);
  if (!bytes) return null;
  try {
    const cd = objeto(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (!cd || typeof cd.type !== "string" || typeof cd.challenge !== "string" || typeof cd.origin !== "string") return null;
    return { type: cd.type, challenge: cd.challenge, origin: cd.origin };
  } catch {
    return null;
  }
}

/** O contador do authenticatorData (bytes 33–36, big-endian); null se o authData é curto ou não é base64url. */
export function contadorDaResposta(authenticatorData: string): number | null {
  const b = base64urlParaBytes(authenticatorData);
  if (!b || b.length < 37) return null;
  return ((b[33] << 24) >>> 0) + (b[34] << 16) + (b[35] << 8) + b[36];
}

/** O desafio que a resposta diz responder (para gastar no banco antes de conferir); null se não é um desafio nosso no formato. */
export function desafioDaResposta(r: { response: { clientDataJSON: string } }): string | null {
  const cd = clientDataDe(r.response.clientDataJSON);
  return cd && RE_DESAFIO.test(cd.challenge) ? cd.challenge : null;
}

/** "marca modelo · Android N" (o aparelho que o app manda; só letras, números e pontuação simples; até 80). */
export function textoDoAparelho(v: unknown): string | null {
  const o = objeto(v);
  if (!o) return null;
  const limpar = (s: unknown, max: number) =>
    typeof s === "string" || typeof s === "number"
      ? String(s).normalize("NFKC").replace(/[^\p{L}\p{N} ._()+/-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max).trim()
      : "";
  const modelo = limpar(o.modelo, 60);
  const android = limpar(o.android, 10);
  const texto = [modelo, android ? `Android ${android}` : ""].filter(Boolean).join(" · ");
  return texto ? texto.slice(0, 80) : null;
}

export function versaoDoApp(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[0-9A-Za-z._+-]{1,32}$/.test(s) ? s : null;
}

export interface PedidoRegistrar {
  resposta: RespostaRegistro;
  /** o app criou com isCloudBackupEnabled = true? (false = caiu no E2eeUnavailableException: a chave fica só no aparelho) */
  nuvem: boolean | null;
  /** o id da chave antiga DESTE aparelho (a renovação, ou a volta depois de restaurar) */
  substitui: string | null;
  aparelho: string | null;
  versao: string | null;
}

/** { acao: "registrar", resposta, nuvem?, substitui?, aparelho?: { modelo, android }, versao? } → o pedido, ou null (dados_invalidos). */
export function lerPedidoRegistrar(corpo: Record<string, unknown>): PedidoRegistrar | null {
  const resposta = lerRespostaRegistro(corpo.resposta);
  if (!resposta) return null;
  let substitui: string | null = null;
  if (corpo.substitui !== undefined && corpo.substitui !== null) {
    if (!credencialValida(corpo.substitui)) return null;
    substitui = corpo.substitui;
  }
  return {
    resposta,
    nuvem: typeof corpo.nuvem === "boolean" ? corpo.nuvem : null,
    substitui,
    aparelho: textoDoAparelho(corpo.aparelho),
    versao: versaoDoApp(corpo.versao),
  };
}

/** { acao: "apagar", todas: true } (o Sair: todas as chaves da pessoa) ou { acao: "apagar", credencial } (o Sair local: a deste aparelho). */
export function lerPedidoApagar(corpo: Record<string, unknown>): { todas: true } | { credencial: string } | null {
  if (corpo.todas === true) return { todas: true };
  return credencialValida(corpo.credencial) ? { credencial: corpo.credencial } : null;
}

// ───────────────────────── a conferência (a biblioteca entra por parâmetro) ─────────────────────────

/** O pedaço do @simplewebauthn/server 13.3.3 que a conferência usa (o index.ts passa o do JSR; o Vitest, o do npm). */
export interface LibWebAuthn {
  verifyRegistrationResponse(opcoes: Record<string, unknown>): Promise<{
    verified: boolean;
    registrationInfo?: {
      fmt: string;
      aaguid: string;
      credential: { id: string; publicKey: Uint8Array; counter: number };
      credentialDeviceType: string;
      credentialBackedUp: boolean;
      origin: string;
    };
  }>;
  verifyAuthenticationResponse(opcoes: Record<string, unknown>): Promise<{ verified: boolean; authenticationInfo: { newCounter: number } }>;
  decodeCredentialPublicKey(chave: Uint8Array): { get(chave: number): unknown };
}

/** Por que a conferência recusou (só para o log; para fora vira chave_invalida). */
export type MotivoConferencia =
  | "formato_invalido" | "tipo_invalido" | "desafio_invalido" | "origem_invalida" | "rp_invalido" | "atestacao_invalida"
  | "algoritmo_invalido" | "id_divergente" | "chave_divergente" | "usuario_divergente" | "presenca_ausente" | "verificacao_ausente"
  | "contador_voltou" | "assinatura_invalida" | "aaguid_recusado";

/** O erro que a biblioteca lança → o motivo (pelo nome ou pela mensagem; o resto é formato). */
export function motivoDoErro(e: unknown): MotivoConferencia {
  const nome = e && typeof e === "object" ? String((e as { name?: unknown }).name ?? "") : "";
  const msg = e && typeof e === "object" ? String((e as { message?: unknown }).message ?? "") : "";
  if (nome === "UnexpectedRPIDHash" || /RP ID/i.test(msg)) return "rp_invalido";
  if (/counter/i.test(msg)) return "contador_voltou";
  if (/user verification/i.test(msg)) return "verificacao_ausente";
  if (/user (not )?present|presence/i.test(msg)) return "presenca_ausente";
  if (/\balg\b/i.test(msg)) return "algoritmo_invalido";
  if (/attestation/i.test(msg)) return "atestacao_invalida";
  if (/origin/i.test(msg)) return "origem_invalida";
  if (/challenge/i.test(msg)) return "desafio_invalido";
  return "formato_invalido";
}

type Conferencia<T> = ({ ok: true } & T) | { ok: false; motivo: MotivoConferencia };

/** O que o clientDataJSON tem que dizer (antes da biblioteca: o motivo certo para o log). */
function conferirClientData(clientDataJSON: string, tipo: string, desafio: string, origens: string[]): Conferencia<{ origem: string }> {
  const cd = clientDataDe(clientDataJSON);
  if (!cd) return { ok: false, motivo: "formato_invalido" };
  if (cd.type !== tipo) return { ok: false, motivo: "tipo_invalido" };
  if (!RE_DESAFIO.test(desafio) || cd.challenge !== desafio) return { ok: false, motivo: "desafio_invalido" };
  if (!origens.includes(cd.origin)) return { ok: false, motivo: "origem_invalida" };
  return { ok: true, origem: cd.origin };
}

export interface ChaveNova {
  credencialId: string;
  chavePublica: Uint8Array;
  contador: number;
  algoritmo: number;
  aaguid: string | null;
  /** BE: a chave pode ir para o backup */
  backupElegivel: boolean;
  /** BS: a chave já está no backup */
  backupEstado: boolean;
  origem: string;
}

/**
 * A resposta do registro confere com o desafio dado, a origem do schema e o RP ID? UP nunca exigido (a criação é silenciosa); UV e AAGUID pela
 * TOLERANCIA (o `tolerancia` do parâmetro troca pontos dela — os testes).
 */
export async function conferirRegistro(
  resposta: RespostaRegistro,
  o: { desafio: string; schema: Schema; tolerancia?: Partial<Tolerancia> },
  lib: LibWebAuthn,
): Promise<Conferencia<{ chave: ChaveNova }>> {
  const tol = { ...TOLERANCIA, ...o.tolerancia };
  const origens = origensDoSchema(o.schema);
  const cd = conferirClientData(resposta.response.clientDataJSON, "webauthn.create", o.desafio, origens);
  if (cd.ok === false) return cd;
  let r: Awaited<ReturnType<LibWebAuthn["verifyRegistrationResponse"]>>;
  try {
    r = await lib.verifyRegistrationResponse({
      response: resposta,
      expectedChallenge: o.desafio,
      expectedOrigin: origens,
      expectedRPID: RP_ID,
      expectedType: "webauthn.create",
      requireUserPresence: false,
      requireUserVerification: tol.exigirVerificacao,
      supportedAlgorithmIDs: [...ALGORITMOS],
    });
  } catch (e) {
    return { ok: false, motivo: motivoDoErro(e) };
  }
  const info = r?.verified === true ? r.registrationInfo : undefined;
  if (!info || info.fmt !== "none") return { ok: false, motivo: "atestacao_invalida" };
  if (info.credential?.id !== resposta.id) return { ok: false, motivo: "id_divergente" };
  let alg: unknown;
  try {
    alg = lib.decodeCredentialPublicKey(info.credential.publicKey).get(3);
  } catch {
    return { ok: false, motivo: "formato_invalido" };
  }
  if (alg !== -7 && alg !== -257) return { ok: false, motivo: "algoritmo_invalido" };
  const aaguid = typeof info.aaguid === "string" && UUID.test(info.aaguid) ? info.aaguid.toLowerCase() : null;
  if (tol.aaguidsAceitos && !(aaguid && tol.aaguidsAceitos.includes(aaguid))) return { ok: false, motivo: "aaguid_recusado" };
  return {
    ok: true,
    chave: {
      credencialId: info.credential.id,
      chavePublica: info.credential.publicKey,
      contador: Number.isInteger(info.credential.counter) && info.credential.counter >= 0 ? info.credential.counter : 0,
      algoritmo: alg,
      aaguid,
      backupElegivel: info.credentialDeviceType === "multiDevice",
      backupEstado: info.credentialBackedUp === true,
      origem: cd.origem,
    },
  };
}

/** A chave guardada (o que a restauracao_usar devolve). */
export interface ChaveGuardada {
  credencialId: string;
  userId: string;
  chavePublica: Uint8Array;
  contador: number;
}

/**
 * A assinatura da restauração confere com a chave guardada, o desafio dado, a origem e o RP ID? Devolve o contador novo. UP, UV e o contador
 * 0 pela TOLERANCIA (o `tolerancia` do parâmetro troca pontos dela — os testes).
 */
export async function conferirEntrada(
  resposta: RespostaEntrada,
  o: { desafio: string; schema: Schema; chave: ChaveGuardada; tolerancia?: Partial<Tolerancia> },
  lib: LibWebAuthn,
): Promise<Conferencia<{ novoContador: number; origem: string }>> {
  const tol = { ...TOLERANCIA, ...o.tolerancia };
  const origens = origensDoSchema(o.schema);
  const cd = conferirClientData(resposta.response.clientDataJSON, "webauthn.get", o.desafio, origens);
  if (cd.ok === false) return cd;
  if (resposta.id !== o.chave.credencialId) return { ok: false, motivo: "chave_divergente" };
  const handle = resposta.response.userHandle;
  if (handle !== undefined && handle !== userHandleDe(o.chave.userId)) return { ok: false, motivo: "usuario_divergente" };
  // contador 0 com o guardado > 0: a biblioteca recusaria (clone); tolerado, ela confere contra 0 (e o banco guarda o maior — greatest)
  const contadorNovo = contadorDaResposta(resposta.response.authenticatorData);
  const contadorGuardado = tol.aceitarContadorZero && contadorNovo === 0 ? 0 : o.chave.contador;
  let r: Awaited<ReturnType<LibWebAuthn["verifyAuthenticationResponse"]>>;
  try {
    r = await lib.verifyAuthenticationResponse({
      response: resposta,
      expectedChallenge: o.desafio,
      expectedOrigin: origens,
      expectedRPID: RP_ID,
      expectedType: "webauthn.get",
      credential: { id: o.chave.credencialId, publicKey: o.chave.chavePublica, counter: contadorGuardado },
      requireUserVerification: tol.exigirVerificacao,
      // sem o advancedFIDOConfig a biblioteca exige o UP (e o UV, com o requireUserVerification); com o "discouraged" ignora os 2
      ...(tol.exigirPresenca || tol.exigirVerificacao ? {} : { advancedFIDOConfig: { userVerification: "discouraged" } }),
    });
  } catch (e) {
    return { ok: false, motivo: motivoDoErro(e) };
  }
  if (r?.verified !== true) return { ok: false, motivo: "assinatura_invalida" };
  const novo = r.authenticationInfo?.newCounter;
  return { ok: true, novoContador: Number.isInteger(novo) && novo >= 0 ? novo : 0, origem: cd.origem };
}

// ───────────────────────── o desafio de ENTRAR sem estado (revisão de segurança, achado 4) ─────────────────────────

/** O desafio de entrar vale 5 minutos (o mesmo de antes, no banco). */
export const VIDA_DO_DESAFIO_S = 300;

/** O segredo do desafio (RESTAURAR_LOGIN_SEGREDO: base64url de 32 bytes ou mais, só nos segredos das funções) → bytes; null = falta. */
export function segredoDoDesafio(valor: string | null | undefined): Uint8Array | null {
  const b = base64urlParaBytes((valor ?? "").trim());
  return b && b.length >= 32 ? b : null;
}

async function marcaDoDesafio(segredo: Uint8Array, schema: Schema, corpo: Uint8Array): Promise<Uint8Array> {
  // a cópia é Uint8Array<ArrayBuffer>: o importKey do Deno 2.5 (TS 5.9) recusa o Uint8Array genérico (TS2769 no deno check; o mesmo
  // caso do pemParaDer e do cifra-mp) — só o tipo muda
  const chave = await crypto.subtle.importKey("raw", new Uint8Array(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const dados = new Uint8Array([...new TextEncoder().encode(schema), 0, ...corpo]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", chave, dados)).slice(0, 16);
}

/**
 * Cria o desafio de entrar SEM gravar nada: 32 bytes = validade (4, segundos unix, big-endian) + aleatório (12) + HMAC-SHA256(segredo,
 * schema ‖ 0 ‖ validade ‖ aleatório) cortado em 16 → base64url de 43 caracteres (o formato de sempre). Quem não tem conta não enche tabela
 * nenhuma; o desafio só é gasto (a chave primária, no banco) depois da assinatura conferida.
 */
export async function criarDesafioEntrar(
  segredo: Uint8Array,
  schema: Schema,
  agoraS: number = Math.floor(Date.now() / 1000),
  aleatorio: Uint8Array = crypto.getRandomValues(new Uint8Array(12)),
): Promise<string> {
  const validade = agoraS + VIDA_DO_DESAFIO_S;
  const corpo = new Uint8Array(16);
  new DataView(corpo.buffer).setUint32(0, validade >>> 0, false);
  corpo.set(aleatorio.slice(0, 12), 4);
  const marca = await marcaDoDesafio(segredo, schema, corpo);
  const tudo = new Uint8Array(32);
  tudo.set(corpo, 0);
  tudo.set(marca, 16);
  return bytesParaBase64url(tudo);
}

export type ConferenciaDoDesafio = { ok: true; expiraEm: number } | { ok: false; motivo: "formato" | "assinatura" | "vencido" };

/**
 * O desafio de entrar é nosso, deste schema, e não venceu? Compara a marca em tempo constante. `expiraEm` (segundos unix) vai com o
 * desafio gasto para o banco (a limpeza).
 */
export async function conferirDesafioEntrar(
  desafio: string,
  segredo: Uint8Array,
  schema: Schema,
  agoraS: number = Math.floor(Date.now() / 1000),
): Promise<ConferenciaDoDesafio> {
  const b = RE_DESAFIO.test(desafio) ? base64urlParaBytes(desafio) : null;
  if (!b || b.length !== 32) return { ok: false, motivo: "formato" };
  const corpo = b.slice(0, 16);
  const esperada = await marcaDoDesafio(segredo, schema, corpo);
  let dif = 0;
  for (let i = 0; i < 16; i++) dif |= esperada[i] ^ b[16 + i];
  if (dif !== 0) return { ok: false, motivo: "assinatura" };
  const validade = new DataView(corpo.buffer, corpo.byteOffset, 4).getUint32(0, false);
  // vencido, ou com uma validade mais longa do que a função dá (só ela assina: não acontece)
  if (validade <= agoraS || validade > agoraS + VIDA_DO_DESAFIO_S + 5) return { ok: false, motivo: "vencido" };
  return { ok: true, expiraEm: validade };
}

// ───────────────────────── a trava, a pessoa e a sessão ─────────────────────────

export interface Trava {
  ligado: boolean;
  /** só as contas de TESTE (a liberação da D7: staging → produção só para teste → todos) */
  soTeste: boolean;
}

/** app_config.restaurar_login → a trava. Falha fechada: só liga com "ligado": true; o so_teste só sai com false explícito. */
export function lerTrava(valor: unknown): Trava {
  const v = objeto(valor) ?? {};
  return { ligado: v.ligado === true, soTeste: v.so_teste !== false };
}

/** A pessoa dona da chave, como o Auth admin devolve (getUserById). */
export interface UsuarioDaChave extends UsuarioAuth {
  banned_until?: string | null;
}

export type RecusaDaPessoa =
  | "chave_invalida" | "conta_real_no_staging" | "desligado" | "acesso_desativado" | "email_nao_confirmado" | "conta_master";

/**
 * A pessoa pode entrar pela chave? Staging só conta de TESTE (P26); com o so_teste, só conta de teste (as outras: desligado); o master não
 * (o papel no Auth — o banco confere também o perfil: revisão, achado 2); desativada (banida) não entra; e-mail não confirmado não entra —
 * o link de uso único CONFIRMARIA o e-mail. Aqui vale SÓ o email_confirmed_at: o confirmed_at do GoTrue também vem do telefone (achado 7;
 * a regra compartilhada dos outros logins não muda).
 */
export function recusaDaPessoa(u: UsuarioDaChave | null, o: { schema: Schema; soTeste: boolean; agora?: number }): RecusaDaPessoa | null {
  if (!u || typeof u.id !== "string" || !UUID.test(u.id)) return "chave_invalida";
  const teste = emailDeTeste(u.email);
  if (o.schema === "staging" && !teste) return "conta_real_no_staging";
  if (o.soTeste && !teste) return "desligado";
  if ((u.app_metadata as { role?: unknown } | null | undefined)?.role === "master") return "conta_master";
  const ban = u.banned_until ? Date.parse(u.banned_until) : NaN;
  if (Number.isFinite(ban) && ban > (o.agora ?? Date.now())) return "acesso_desativado";
  if (!(u.email && u.email.trim()) || !u.email_confirmed_at) return "email_nao_confirmado";
  return null;
}

/**
 * O HTTP de cada recusa de quem entra (desligado é um estado da trava: 200 com ok false). O 401 é SÓ "a chave não vale mais" (não existe,
 * apagada, vencida, a sessão dela acabou, a senha foi trocada, a dona saiu) — é o único que faz o app apagar a chave do aparelho e do backup
 * (2ª revisão, achado 2). O desafio repetido, vencido ou de outro segredo é 409 (o app tenta na próxima abertura); a resposta do Android que
 * não confere (assinatura, UP, contador, origem, RP) é 403 conferencia_falhou (o app NÃO apaga: espera 7 dias). Códigos distintos não abrem
 * enumeração útil: o 403 só aparece com um id de chave ATIVA, que é aleatório de 32 bytes, e o freio por IP e o de 3 por chave seguem.
 */
export const STATUS_DA_RECUSA: Record<
  RecusaDaPessoa | "muitas_tentativas" | "indisponivel" | "dados_invalidos" | "desafio_invalido" | "conferencia_falhou",
  number
> = {
  chave_invalida: 401,
  desafio_invalido: 409,
  conferencia_falhou: 403,
  conta_real_no_staging: 403,
  acesso_desativado: 403,
  email_nao_confirmado: 403,
  conta_master: 403,
  desligado: 200,
  muitas_tentativas: 429,
  indisponivel: 503,
  dados_invalidos: 400,
};

export interface SessaoParaApp {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: { id: string };
}

/**
 * A resposta do /auth/v1/verify → a sessão que o app grava (setSession, como a da entrar-senha), com SÓ o id da pessoa (minimização). null se
 * falta token ou se a sessão é de OUTRA pessoa (o link saiu do e-mail da dona da chave: não pode acontecer — quem chama recusa e avisa).
 */
export function sessaoParaApp(v: unknown, userId: string, agoraSeg: number = Math.floor(Date.now() / 1000)): SessaoParaApp | null {
  const s = objeto(v);
  const u = objeto(s?.user);
  if (!s || typeof s.access_token !== "string" || !s.access_token || typeof s.refresh_token !== "string" || !s.refresh_token) return null;
  if (!u || u.id !== userId) return null;
  const expiresIn = typeof s.expires_in === "number" && s.expires_in > 0 ? s.expires_in : 3600;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: expiresIn,
    expires_at: typeof s.expires_at === "number" && s.expires_at > 0 ? s.expires_at : agoraSeg + expiresIn,
    token_type: typeof s.token_type === "string" && s.token_type ? s.token_type : "bearer",
    user: { id: userId },
  };
}

/** O começo do id da chave para o log (nunca a chave, o e-mail, os tokens ou a resposta do Android). */
export function refDaChave(credencialId: string): string {
  return credencialValida(credencialId) ? credencialId.slice(0, 12) : "?";
}
