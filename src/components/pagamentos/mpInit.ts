import { initMercadoPago } from "@mercadopago/sdk-react";

// Inicialização única do SDK do Mercado Pago (mesma chave pública da aba Pagamentos do aluno).
// Fica fora do componente pra não quebrar o Fast Refresh do mpBrick.tsx.
export const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined;

let mpInitialized = false;
export function ensureMpInit() {
  if (!mpInitialized && MP_PUBLIC_KEY) {
    initMercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
    mpInitialized = true;
  }
}
