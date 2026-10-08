// Physiq hml-06 (H-19) — regras PURAS dos avisos do Mercado Pago. Cópia das de supabase-principal/functions/_shared/
// cobranca-regras.ts (este projeto não enxerga o _shared do principal); o Vitest (src/nucleo/cobranca/avisosMp.test.ts) confere
// que as 2 cópias dão o mesmo resultado. Sem Deno, sem rede e sem banco.

/** MP sem resposta que permita decidir (fora do ar, limite, credencial recusada); 599 = rede. O aviso volta 500. */
export const mpTransitorio = (st: number) => st >= 500 || st === 429 || st === 401;

/**
 * O recurso só vale na credencial que o leu se o MODO dele bate: produção ↔ live_mode true, teste ↔ false. A credencial de
 * TESTE também LÊ pagamentos de produção (o MP devolve 200 com live_mode=true — medido em 08/10/2026 no E2E da hml-06), e sem
 * isto um pagamento real valia no staging. Sem o campo (nem todo recurso do MP traz), vale a credencial.
 */
export function modoConfere(credencial: "prod" | "test", recurso: unknown): boolean {
  const modo = (recurso as { live_mode?: unknown } | null)?.live_mode;
  return typeof modo !== "boolean" || modo === (credencial === "prod");
}

/**
 * O id do aviso vai no CAMINHO da API do MP: só o formato que o MP manda (pagamento = só dígitos; assinatura = letras e
 * dígitos). Sem isto, "../../users/me" fazia a função pública (sem JWT) ler qualquer rota do MP com o token de produção.
 */
export function idDoAvisoValido(topico: string, id: string): boolean {
  if (topico === "payment" || topico === "subscription_authorized_payment" || topico === "authorized_payment") return /^\d{1,20}$/.test(id);
  if (topico === "preapproval" || topico === "subscription_preapproval") return /^[A-Za-z0-9]{1,64}$/.test(id);
  return false;
}
