import { initMercadoPago } from "@mercadopago/sdk-react";

// Inicialização do SDK do Mercado Pago, por chave pública (W2): a do Physiq (o build — o plano do personal e o modo de hoje) ou a do
// VENDEDOR (o Mercado Pago do personal: o token do cartão nasce na conta que recebe).
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

let chaveEmUso: string | null = null;
/**
 * W2: a chave do vendedor (o MP do personal) ou a do Physiq (padrão: o plano do personal, o modo de hoje). Trocou → o próximo Brick nasce
 * com a nova (o initMercadoPago do sdk-react 1.0.7 zera a instância quando a chave muda; o Brick a pede 200 ms depois de montar). A mesma
 * chave não inicia de novo; sem chave (ou com ela vazia), nada.
 */
export function ensureMpInit(chave: string | undefined = MP_PUBLIC_KEY) {
  if (!chave || chave === chaveEmUso) return;
  const opcoes: OpcoesMercadoPago = { locale: "pt-BR", deviceProfileCspNonce: MP_CSP_NONCE };
  initMercadoPago(chave, opcoes);
  chaveEmUso = chave;
}
