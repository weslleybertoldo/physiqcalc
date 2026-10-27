// Physiq T4 (27/10/2026) — o id novo do app (UUID v4), de uma função só. O crypto.randomUUID só existe no Chrome/WebView 92+ (e no
// Safari 15.4+): no WebView antigo ele "is not a function" (visto 23/10 no celular de teste do Google, Android 11 com o Chrome 90).
// Sem ele, o v4 sai do crypto.getRandomValues (aleatório forte, em todo navegador desde muito antes) — nunca do Math.random.
// Testes: src/lib/novoId.test.ts (inclusive a guarda: nenhum randomUUID no app fora daqui).

/** Um UUID v4 novo ("0b9c6f1e-2a3b-4c5d-8e9f-001122334455"). */
export function novoId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // a versão: 4
  b[8] = (b[8] & 0x3f) | 0x80; // a variante: RFC 4122 (8, 9, a ou b)
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
