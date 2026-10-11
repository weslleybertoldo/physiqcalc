// @vitest-environment node
// src/financeiro/cifraMp.test.ts
// Physiq W2 — a cifra dos tokens do Mercado Pago do personal (supabase-principal/functions/_shared/cifra-mp.ts): AES-256-GCM pelo Web
// Crypto, formato "v1:<iv>:<cifra>", dado associado por schema, conta e campo, a chave do ambiente (MP_TOKENS_CHAVE). Chaves de teste
// feitas aqui (Buffer.alloc); nenhum segredo de verdade, nada vai à rede.
import { describe, expect, it } from "vitest";
import { chaveDoAmbiente, cifrar, dadoAssociado, decifrar, ehCifra, importarChave } from "../../supabase-principal/functions/_shared/cifra-mp";

const CHAVE_B64 = Buffer.alloc(32, 7).toString("base64url");

describe("cifra-mp", () => {
  it("cifra e decifra; o mesmo texto dá cifras diferentes (iv novo); o formato é v1:<iv 16>:<cifra>", async () => {
    const k = await importarChave(CHAVE_B64);
    const ad = dadoAssociado("staging", "conta-1", "access");
    const a = await cifrar("APP_USR-123-segredo", ad, k), b = await cifrar("APP_USR-123-segredo", ad, k);
    expect(ehCifra(a) && ehCifra(b) && a !== b).toBe(true);
    expect(a).not.toContain("APP_USR");
    expect(await decifrar(a, ad, k)).toBe("APP_USR-123-segredo");
  });
  it("outro dado associado (outra conta, outro campo, outro schema) NÃO abre", async () => {
    const k = await importarChave(CHAVE_B64);
    const c = await cifrar("x".repeat(30), dadoAssociado("staging", "conta-1", "access"), k);
    await expect(decifrar(c, dadoAssociado("staging", "conta-2", "access"), k)).rejects.toThrow();
    await expect(decifrar(c, dadoAssociado("staging", "conta-1", "refresh"), k)).rejects.toThrow();
    await expect(decifrar(c, dadoAssociado("public", "conta-1", "access"), k)).rejects.toThrow();
  });
  it("outra chave não abre; chave fora de 32 bytes é recusada; o ambiente sem a chave → null", async () => {
    const k = await importarChave(CHAVE_B64), k2 = await importarChave(Buffer.alloc(32, 8).toString("base64url"));
    const ad = dadoAssociado("public", "c", "access");
    await expect(decifrar(await cifrar("t".repeat(20), ad, k), ad, k2)).rejects.toThrow();
    await expect(importarChave(Buffer.alloc(16, 1).toString("base64url"))).rejects.toThrow("chave_invalida");
    expect(await chaveDoAmbiente(() => undefined)).toBeNull();
    expect(await chaveDoAmbiente(() => CHAVE_B64)).not.toBeNull();
    // a chave vem do segredo MP_TOKENS_CHAVE (e de nenhum outro nome); fora do formato → null; fora do Deno (o leitor padrão) → null
    expect(await chaveDoAmbiente((nome) => (nome === "MP_TOKENS_CHAVE" ? CHAVE_B64 : undefined))).not.toBeNull();
    expect(await chaveDoAmbiente((nome) => (nome === "MP_TOKENS_CHAVE" ? undefined : CHAVE_B64))).toBeNull();
    expect(await chaveDoAmbiente(() => Buffer.alloc(16, 1).toString("base64url"))).toBeNull();
    expect(await chaveDoAmbiente()).toBeNull();
  });
  it("cifra adulterada → erro (a tag do GCM)", async () => {
    const k = await importarChave(CHAVE_B64);
    const ad = dadoAssociado("public", "c", "refresh");
    const c = await cifrar("TG-abcdefgh-1", ad, k);
    // troca o PENÚLTIMO caractere (dentro da tag): ele sempre leva 6 bits de dado. Trocar os 2 últimos ("BA" → "BB") às vezes não muda
    // nenhum byte — com 29 bytes o último caractere leva só 4 bits — e o teste falharia 1 vez em ~1024.
    const p = c.length - 2;
    const ruim = c.slice(0, p) + (c[p] === "A" ? "B" : "A") + c.slice(p + 1);
    expect(ehCifra(ruim) && ruim !== c).toBe(true);
    await expect(decifrar(ruim, ad, k)).rejects.toThrow();
    await expect(decifrar("APP_USR-123-em-claro", ad, k)).rejects.toThrow("cifra_invalida");
  });
});
