// supabase-principal/functions/_shared/recebimento-regras.ts
// Physiq W1 — regras PURAS de Configurações › Recebimento pela função (jeito 2): os modos e o pedido do prof_recebimento_salvar.
// Reexportadas para a tela (src/financeiro/recebimento.ts) e testadas em src/financeiro/recebimento.test.ts.
import { normalizarHandle } from "./infinitepay-regras.ts";

export type ModoRecebimento = "pix_manual" | "nenhum" | "mercadopago" | "infinitepay";
/** A ordem da tela. 'mercadopago' = o Mercado Pago do Physiq (só o master liga — fica igual); 'infinitepay' = W1. */
export const MODOS: readonly ModoRecebimento[] = ["pix_manual", "infinitepay", "mercadopago", "nenhum"];
export const ROTULO_MODO: Record<ModoRecebimento, string> = {
  pix_manual: "PIX NA CHAVE", infinitepay: "INFINITEPAY", mercadopago: "MERCADO PAGO", nenhum: "POR FORA",
};

export function ehModo(v: unknown): v is ModoRecebimento {
  return typeof v === "string" && (MODOS as readonly string[]).includes(v);
}

export interface PedidoRecebimento {
  modo?: ModoRecebimento;
  bloquear?: boolean;
  /** a InfiniteTag normalizada; null = tirar; ausente = não mexe */
  handle?: string | null;
  /** o OK de quem troca de forma com cobrança automática viva no Mercado Pago (409 automaticas_ativas antes) */
  cancelarAutomaticas: boolean;
}

export function lerPedidoDoRecebimento(b: Record<string, unknown>): { ok: true; pedido: PedidoRecebimento } | { ok: false; erro: string } {
  const pedido: PedidoRecebimento = { cancelarAutomaticas: b.cancelar_automaticas === true };
  if ("modo" in b) {
    if (!ehModo(b.modo)) return { ok: false, erro: "modo_invalido" };
    pedido.modo = b.modo;
  }
  if ("bloquear" in b) {
    if (typeof b.bloquear !== "boolean") return { ok: false, erro: "bloquear_invalido" };
    pedido.bloquear = b.bloquear;
  }
  if ("handle" in b) {
    if (b.handle === null || b.handle === "") pedido.handle = null;
    else {
      const h = normalizarHandle(b.handle);
      if (!h) return { ok: false, erro: "infinitetag_invalida" };
      pedido.handle = h;
    }
  }
  if (pedido.modo === undefined && pedido.bloquear === undefined && pedido.handle === undefined) return { ok: false, erro: "nada_para_salvar" };
  return { ok: true, pedido };
}
