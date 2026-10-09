import { initMercadoPago } from "@mercadopago/sdk-react";

// Inicialização única do SDK do Mercado Pago (mesma chave pública da aba Pagamentos do aluno).
// Fica fora do componente pra não quebrar o Fast Refresh do mpBrick.tsx.
export const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined;

/**
 * hml-15 (H-33): o nonce da CSP do site para o `<script>` inline do antifraude ("device profile") que o SDK v2 do MP injeta.
 * É o MESMO valor do `'nonce-…'` do `script-src` no vercel.json (a guarda scripts/ci/cabecalhos.test.mjs confere). Fixo e
 * público: o site é estático e o service worker guarda o index.html, então não dá nonce por resposta (desvio 20 do docs/desvios.md).
 */
export const MP_CSP_NONCE = "2h70OaShTLYMw5AHt7G2nvZH";

// O TOptions do sdk-react não traz `deviceProfileCspNonce`, mas o sdk-react repassa as opções inteiras ao
// `new window.MercadoPago(chave, opções)` do SDK v2, que aceita a opção e põe o nonce no script do antifraude.
type OpcoesMercadoPago = NonNullable<Parameters<typeof initMercadoPago>[1]> & { deviceProfileCspNonce?: string };

let mpInitialized = false;
export function ensureMpInit() {
  if (!mpInitialized && MP_PUBLIC_KEY) {
    const opcoes: OpcoesMercadoPago = { locale: "pt-BR", deviceProfileCspNonce: MP_CSP_NONCE };
    initMercadoPago(MP_PUBLIC_KEY, opcoes);
    mpInitialized = true;
  }
}
