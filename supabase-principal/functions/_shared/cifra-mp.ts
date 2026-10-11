// supabase-principal/functions/_shared/cifra-mp.ts
// Physiq W2 — a cifra dos tokens do Mercado Pago do personal (e do code_verifier do PKCE): AES-256-GCM pelo Web Crypto (o mesmo no Deno e no
// Node — o Vitest testa este arquivo). A chave (32 bytes, base64url) é o segredo MP_TOKENS_CHAVE das funções — FORA do banco: uma cópia do
// banco (o backup diário) ou a senha do postgres não abrem os tokens (decisão 1 do plano da W2; por que não o Vault: lá).
// Formato "v1:<iv base64url, 12 bytes>:<cifra + tag base64url>" — o "v1" deixa trocar a chave depois (uma "v2" lida ao lado).
// Dado associado (AD) "physiq:w2:<schema>:<conta_id>:<campo>": a cifra copiada para outra conta, outro campo ou outro schema não abre.
// Sem import de URL e sem o global Deno no topo. Nunca loga nada.
export type LerAmbiente = (nome: string) => string | undefined;
type ComDeno = { Deno?: { env: { get: (nome: string) => string | undefined } } };
const lerDaFuncao: LerAmbiente = (nome) => (globalThis as ComDeno).Deno?.env.get(nome);

const FORMATO = /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{20,}$/;
// MENOR 0b da revisão: Uint8Array<ArrayBuffer> (não o Uint8Array solto = <ArrayBufferLike>) — o Deno 2.5.2 (TS 5.9) recusa o solto no
// importKey e no decrypt (TS2769/TS2322) e as 7 funções que importam este arquivo herdariam o erro. Passa também no TS 5.8.3 do app
// (conferido em 11/10 nas 2 pontas).
const de64 = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const para64 = (u: Uint8Array): string => {
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const texto = new TextEncoder();

export function ehCifra(v: unknown): v is string {
  return typeof v === "string" && FORMATO.test(v);
}
export function dadoAssociado(schema: string, contaId: string, campo: "access" | "refresh" | "pkce"): string {
  return `physiq:w2:${schema}:${contaId}:${campo}`;
}
export async function importarChave(base64url: string): Promise<CryptoKey> {
  const bruta = de64(base64url.trim());
  if (bruta.length !== 32) throw new Error("chave_invalida");
  return await crypto.subtle.importKey("raw", bruta, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
/** A chave das funções (MP_TOKENS_CHAVE); sem ela (ou fora do formato) → null: quem chama responde "não configurado". */
export async function chaveDoAmbiente(ler: LerAmbiente = lerDaFuncao): Promise<CryptoKey | null> {
  const v = ler("MP_TOKENS_CHAVE");
  if (!v) return null;
  try {
    return await importarChave(v);
  } catch {
    return null;
  }
}
export async function cifrar(claro: string, ad: string, chave: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: texto.encode(ad) }, chave, texto.encode(claro)));
  return `v1:${para64(iv)}:${para64(c)}`;
}
export async function decifrar(cifra: string, ad: string, chave: CryptoKey): Promise<string> {
  if (!ehCifra(cifra)) throw new Error("cifra_invalida");
  const [, iv, c] = cifra.split(":");
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: de64(iv), additionalData: texto.encode(ad) }, chave, de64(c));
  return new TextDecoder().decode(claro);
}
