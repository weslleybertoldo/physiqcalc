// Physiq restaurar-login (30/10/2026) — o AUTENTICADOR VIRTUAL dos testes: o "Android" de mentira da chave de volta. Um par de chaves de
// verdade (WebCrypto: ES256 = ECDSA P-256 ou RS256 = RSASSA-PKCS1-v1_5 2048), atestação "none" e a origem android:apk-key-hash:… — devolve
// o RegistrationResponseJSON e o AuthenticationResponseJSON no formato do Credential Manager (CreateRestoreCredentialResponse.responseJson
// e RestoreCredential.authenticationResponseJson). O formato exato do Android sai da fase 0; aqui vale o do WebAuthn (o que a biblioteca
// confere). Usado pelas regras (src/nucleo/restaurarLoginRegras.test.ts) e pelas funções (src/nucleo/restaurarLoginFuncoes.test.ts);
// a mesma receita em Python no E2E do staging (e2e/restaurar_login/_autenticador.py).
// Rodar no ambiente node do Vitest (// @vitest-environment node): o crypto.subtle de verdade.
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { RP_ID, base64urlParaBytes, bytesParaBase64url } from "../../supabase-principal/functions/_shared/restaurar-login-regras";

/** As flags do authenticatorData: UP 0x01, UV 0x04, BE 0x08, BS 0x10, AT 0x40 (dados da chave junto). */
export interface Flags {
  up?: boolean;
  uv?: boolean;
  be?: boolean;
  bs?: boolean;
}

export interface OpcoesDoPedido extends Flags {
  /** a origem no clientDataJSON (padrão: a do autenticador) */
  origem?: string;
  /** o RP ID cujo hash vai no authenticatorData (padrão: physiqcalc.com.br) */
  rpId?: string;
  /** o tipo no clientDataJSON (padrão: webauthn.create / webauthn.get) */
  tipo?: string;
  /** o contador que vai no authenticatorData (padrão: o do autenticador — 0, como a chave que vai na cópia) */
  contador?: number;
  /** o androidPackageName no clientDataJSON (o Android pode mandar; o servidor não depende dele) */
  androidPackageName?: string;
}

export interface OpcoesDoRegistro extends OpcoesDoPedido {
  /** o alg escrito na chave pública COSE (padrão: o do par) — para provar a recusa de algoritmo fora da lista */
  algNaChave?: number;
  /** o fmt da atestação (padrão: "none") */
  fmt?: string;
  /** com o fmt "packed": a auto-atestação de verdade (attStmt { alg, sig } assinado pela própria chave) — que a biblioteca ACEITA */
  autoAtestacao?: boolean;
  /** o id no JSON diferente do id no authData (padrão: o mesmo) */
  idNoJson?: string;
  /** o AAGUID do authData (padrão: zerado — o que a fase 0 deve medir, Q3) */
  aaguid?: Uint8Array;
}

export interface OpcoesDaEntrada extends OpcoesDoPedido {
  /** o userHandle (padrão: o user.id do registro; null = não manda) */
  userHandle?: string | null;
}

const enc = new TextEncoder();

function concat(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function sha256(b: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", b));
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

/** A assinatura ECDSA do WebCrypto (r||s, 64 bytes) → DER (SEQUENCE de 2 INTEGER), o formato do WebAuthn. */
export function rsParaDer(rs: Uint8Array): Uint8Array {
  const inteiro = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const corpo = concat(inteiro(rs.slice(0, 32)), inteiro(rs.slice(32)));
  return concat(new Uint8Array([0x30, corpo.length]), corpo);
}

function flagsByte(f: Flags, comChave: boolean): number {
  return (f.up === false ? 0 : 0x01) | (f.uv ? 0x04 : 0) | (f.be ? 0x08 : 0) | (f.bs ? 0x10 : 0) | (comChave ? 0x40 : 0);
}

export interface AutenticadorVirtual {
  /** o id da chave (base64url) */
  id: string;
  alg: -7 | -257;
  /** o user.id que o registro gravou (base64url) — vai como userHandle na entrada */
  userHandle: string | null;
  registrar(opcoes: { challenge: string; user: { id: string } }, o?: OpcoesDoRegistro): Promise<Record<string, unknown>>;
  entrar(desafio: string, o?: OpcoesDaEntrada): Promise<Record<string, unknown>>;
}

/** Um autenticador novo (um "aparelho" com uma chave de volta). */
export async function criarAutenticador(origemPadrao: string, alg: -7 | -257 = -7): Promise<AutenticadorVirtual> {
  const par = (alg === -7
    ? await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
    : await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["sign", "verify"],
    )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", par.publicKey);
  const credId = crypto.getRandomValues(new Uint8Array(32));
  const id = bytesParaBase64url(credId);

  const cosePublica = (algNaChave: number) =>
    alg === -7
      ? isoCBOR.encode(new Map<number, number | Uint8Array>([
        [1, 2], [3, algNaChave], [-1, 1], [-2, base64urlParaBytes(jwk.x)!], [-3, base64urlParaBytes(jwk.y)!],
      ]))
      : isoCBOR.encode(new Map<number, number | Uint8Array>([
        [1, 3], [3, algNaChave], [-1, base64urlParaBytes(jwk.n)!], [-2, base64urlParaBytes(jwk.e)!],
      ]));

  async function assinar(dados: Uint8Array): Promise<Uint8Array> {
    if (alg === -7) {
      const rs = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, dados));
      return rsParaDer(rs);
    }
    return new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, par.privateKey, dados));
  }

  const clientData = (tipo: string, desafio: string, origem: string, pacote?: string) =>
    enc.encode(JSON.stringify({ type: tipo, challenge: desafio, origin: origem, crossOrigin: false, ...(pacote ? { androidPackageName: pacote } : {}) }));

  const auto: AutenticadorVirtual = {
    id,
    alg,
    userHandle: null,
    async registrar(opcoes, o = {}) {
      auto.userHandle = opcoes.user.id;
      const cd = clientData(o.tipo ?? "webauthn.create", opcoes.challenge, o.origem ?? origemPadrao, o.androidPackageName);
      const authData = concat(
        await sha256(enc.encode(o.rpId ?? RP_ID)),
        new Uint8Array([flagsByte(o, true)]),
        u32(o.contador ?? 0),
        o.aaguid ?? new Uint8Array(16),
        new Uint8Array([(credId.length >> 8) & 0xff, credId.length & 0xff]),
        credId,
        cosePublica(o.algNaChave ?? alg),
      );
      const attStmt = o.autoAtestacao
        ? new Map<string, unknown>([["alg", alg], ["sig", await assinar(concat(authData, await sha256(cd)))]])
        : new Map();
      const atestacao = isoCBOR.encode(new Map<string, unknown>([["fmt", o.fmt ?? "none"], ["attStmt", attStmt], ["authData", authData]]) as never);
      const idJson = o.idNoJson ?? id;
      return {
        id: idJson,
        rawId: idJson,
        type: "public-key",
        authenticatorAttachment: "platform",
        response: { clientDataJSON: bytesParaBase64url(cd), attestationObject: bytesParaBase64url(atestacao), transports: ["internal"] },
        clientExtensionResults: {},
      };
    },
    async entrar(desafio, o = {}) {
      const cd = clientData(o.tipo ?? "webauthn.get", desafio, o.origem ?? origemPadrao, o.androidPackageName);
      const authData = concat(await sha256(enc.encode(o.rpId ?? RP_ID)), new Uint8Array([flagsByte(o, false)]), u32(o.contador ?? 0));
      const assinatura = await assinar(concat(authData, await sha256(cd)));
      const handle = o.userHandle === undefined ? auto.userHandle : o.userHandle;
      return {
        id,
        rawId: id,
        type: "public-key",
        authenticatorAttachment: "platform",
        response: {
          clientDataJSON: bytesParaBase64url(cd),
          authenticatorData: bytesParaBase64url(authData),
          signature: bytesParaBase64url(assinatura),
          ...(handle ? { userHandle: handle } : {}),
        },
        clientExtensionResults: {},
      };
    },
  };
  return auto;
}
