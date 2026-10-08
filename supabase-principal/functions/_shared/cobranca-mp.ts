// Physiq W4 — o que a cobranca-conta e a mp-webhook-conta fazem igual (Mercado Pago + banco): buscar no MP com a credencial
// certa do ambiente, gravar o status da fatura e aplicar o pagamento aprovado UMA vez (aplicar_pagamento_conta, SQL),
// registrar a cobrança mensal da assinatura. O aviso do MP nunca é a verdade: sempre se busca o recurso de novo na API.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  mpTransitorio,
  statusAberto,
  statusDaFatura,
  type AssinaturaMp,
  type PagamentoMp,
} from "./cobranca-regras.ts";

export const MP_API = "https://api.mercadopago.com";
export type Schema = "public" | "staging";
export type Credencial = "prod" | "test";

/** Staging usa SEMPRE a credencial de teste; produção exige a de produção (sem cair na de teste — o Pix de sandbox "pagaria" o mês). */
export function credencialDoSchema(schema: Schema): Credencial {
  return schema === "staging" ? "test" : "prod";
}

export function tokenMp(c: Credencial): string {
  return (c === "test" ? Deno.env.get("MP_ACCESS_TOKEN_TEST") : Deno.env.get("MP_ACCESS_TOKEN_PROD")) || "";
}

export interface RespostaMp<T> {
  status: number;
  body: T | null;
}

/** fetch na API do MP com nova tentativa em 5xx (o MP tem 500 passageiro); o POST leva X-Idempotency-Key. */
export async function mpFetch<T = Record<string, unknown>>(c: Credencial, caminho: string, init: RequestInit = {}): Promise<RespostaMp<T>> {
  let status = 0;
  let body: T | null = null;
  const metodo = (init.method || "GET").toUpperCase();
  const idem = metodo === "POST" ? crypto.randomUUID() : null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 800 * tentativa));
    try {
      const res = await fetch(`${MP_API}${caminho}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${tokenMp(c)}`,
          "Content-Type": "application/json",
          ...(idem ? { "X-Idempotency-Key": idem } : {}),
          ...((init.headers as Record<string, string>) || {}),
        },
      });
      status = res.status;
      try {
        body = (await res.json()) as T;
      } catch {
        body = null;
      }
    } catch (e) {
      status = 599;
      body = { message: String((e as Error)?.message || e) } as unknown as T;
    }
    if (status < 500) break;
  }
  return { status, body };
}

/** hml-06: o MP não respondeu de um jeito que permita decidir (fora do ar, limite, credencial recusada) — o aviso volta 500. */
export class MpIndisponivel extends Error {
  status: number;
  constructor(status: number) {
    super(`mp_indisponivel_${status}`);
    this.name = "MpIndisponivel";
    this.status = status;
  }
}

/**
 * hml-06 (H-19) — busca no MP o recurso de um aviso. Com o ambiente pedido (?schema=), só a credencial dele; sem ele (repasse
 * do Calc, aviso antigo), produção e depois teste. O ambiente devolvido é SEMPRE o da credencial que achou (produção →
 * public, teste → staging): um recurso de sandbox nunca vale no public, nem um de produção no staging (a referência de outro
 * ambiente vira "outro_ambiente" em quem chama). 404/403 = não é desta credencial; MP fora → MpIndisponivel.
 */
export async function buscarNoMp<T>(caminho: string, schema: Schema | null): Promise<{ recurso: T; schema: Schema } | null> {
  for (const c of schema ? [credencialDoSchema(schema)] : (["prod", "test"] as Credencial[])) {
    if (!tokenMp(c)) continue;
    const { status, body } = await mpFetch<T>(c, caminho);
    if (status === 200 && body) return { recurso: body, schema: c === "prod" ? "public" : "staging" };
    if (mpTransitorio(status)) throw new MpIndisponivel(status); // o aviso volta 500 e o MP manda de novo
  }
  return null; // 404/403: não é desta credencial
}

export interface Fatura {
  id: string;
  conta_id: string;
  tipo: string;
  valor: number;
  status: string;
  forma: string | null;
  mp_payment_id: string | null;
  mp_preapproval_id: string | null;
  pix_qr: string | null;
  pix_copia_cola: string | null;
  pix_expira_em: string | null;
  pago_em: string | null;
  plano: string | null;
  faixa: string | null;
  meses: number | null;
  cobre_de: string | null;
  cobre_ate: string | null;
  descricao: string | null;
  criado_em: string;
}

export const COLUNAS_FATURA =
  "id, conta_id, tipo, valor, status, forma, mp_payment_id, mp_preapproval_id, pix_qr, pix_copia_cola, pix_expira_em, pago_em, plano, faixa, meses, cobre_de, cobre_ate, descricao, criado_em";

export interface ResultadoAplicar {
  status: string;
  aplicou: boolean;
  resultado?: Record<string, unknown> | null;
}

/**
 * Grava o que o MP disse do pagamento da fatura. Aprovado → aplicar_pagamento_conta (uma vez só: o pago_em marca). Pix que
 * passou da validade e o MP ainda diz "pending" → 'expired' aqui (se pagarem mesmo assim, o aprovado chega e aplica).
 * Estorno/chargeback depois de aplicado: fica registrado na fatura e na linha do tempo (o master decide o acesso).
 */
export async function aplicarStatus(db: SupabaseClient, f: Fatura, pay: PagamentoMp, porUsuario: string | null = null): Promise<ResultadoAplicar> {
  let st = statusDaFatura(pay);
  if (st === "approved") {
    if (f.pago_em) return { status: "approved", aplicou: false };
    const { data, error } = await db.rpc("aplicar_pagamento_conta", { p_fatura: f.id, p_pago_em: pay.date_approved ?? null });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return { status: "approved", aplicou: r.aplicada === true, resultado: r };
  }
  if (st === "pending" && f.pix_expira_em && new Date(f.pix_expira_em).getTime() < Date.now()) st = "expired";
  // aplicada é final: depois do pagamento só estorno/chargeback mudam a fatura (o aviso de "cancelled" do Pix de sandbox que
  // o staging fecha ao simular a aprovação — ou qualquer aviso atrasado — não desfaz o que foi pago)
  if (f.pago_em && st !== "refunded" && st !== "charged_back") return { status: f.status, aplicou: false };
  if (f.status === "approved" && statusAberto(st)) return { status: f.status, aplicou: false };
  if (st !== f.status) {
    const { error } = await db.from("conta_faturas").update({ status: st }).eq("id", f.id);
    if (error) throw error;
    if ((st === "refunded" || st === "charged_back") && f.pago_em) {
      await db.from("conta_eventos").insert({
        conta_id: f.conta_id, tipo: "pagamento", antes: { fatura_id: f.id, status: f.status },
        depois: { fatura_id: f.id, status: st, mp_payment_id: f.mp_payment_id, estorno: true }, por: porUsuario,
      });
    }
  }
  return { status: st, aplicou: false };
}

export interface AssinaturaConta {
  id: string;
  conta_id: string;
  mp_preapproval_id: string | null;
  status: string;
  valor: number | null;
  plano: string | null;
  faixa: string | null;
  proximo_vencimento: string | null;
  ultimo_pagamento_em: string | null;
  payload: Record<string, unknown> | null;
}

export const COLUNAS_ASSINATURA = "id, conta_id, mp_preapproval_id, status, valor, plano, faixa, proximo_vencimento, ultimo_pagamento_em, payload";

/**
 * Cobrança mensal da assinatura (o MP cobrou o cartão): vira uma fatura 'recorrente' (mp_payment_id único — o webhook e a
 * conferência podem chegar juntos) com o plano da assinatura e aplica como o avulso (+1 mês).
 */
export async function registrarCobrancaRecorrente(
  db: SupabaseClient,
  a: AssinaturaConta,
  pay: PagamentoMp,
  valorPadrao: number | null,
): Promise<ResultadoAplicar | null> {
  if (pay?.id === undefined || pay?.id === null) return null;
  const mpId = String(pay.id);
  let { data: linha } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("mp_payment_id", mpId).maybeSingle();
  // W28: assinatura que veio de um app antigo na virada — a cobrança de ANTES da virada já valia lá (o vencimento migrado já a
  // conta): entra só como histórico ('migrado', paga), sem somar mais 1 mês (nada de cobrança dobrada no acesso)
  if (!linha && cobrancaAntesDaVirada(a, pay)) {
    const st = statusDaFatura(pay);
    const { error } = await db.from("conta_faturas").insert({
      conta_id: a.conta_id, tipo: "migrado", valor: Number(pay.transaction_amount) > 0 ? Number(pay.transaction_amount) : Number(a.valor ?? valorPadrao ?? 0),
      status: st, forma: "cartao", mp_payment_id: mpId, mp_preapproval_id: a.mp_preapproval_id, plano: a.plano, faixa: a.faixa, meses: 1,
      pago_em: st === "approved" ? (pay.date_approved ?? pay.date_created ?? new Date().toISOString()) : null,
      descricao: "Cobrança do cartão de antes da virada (já valia no app antigo)", origem: "virada_w28",
    });
    if (error && !String(error.message || "").includes("duplicate")) throw error;
    return { status: st, aplicou: false };
  }
  if (!linha) {
    const valor = Number(pay.transaction_amount) > 0 ? Number(pay.transaction_amount) : Number(a.valor ?? valorPadrao ?? 0);
    const { data: nova, error } = await db.from("conta_faturas").insert({
      conta_id: a.conta_id, tipo: "recorrente", valor, status: "pending", forma: "cartao", mp_payment_id: mpId,
      mp_preapproval_id: a.mp_preapproval_id, plano: a.plano, faixa: a.faixa, meses: 1,
      descricao: "Physiq — cobrança automática no cartão (1 mês)", origem: "assinatura",
    }).select(COLUNAS_FATURA).maybeSingle();
    if (error && !String(error.message || "").includes("duplicate")) throw error;
    linha = nova ?? (await db.from("conta_faturas").select(COLUNAS_FATURA).eq("mp_payment_id", mpId).maybeSingle()).data;
  }
  if (!linha) return null;
  const r = await aplicarStatus(db, linha as Fatura, pay);
  if (r.status === "approved") {
    await db.from("conta_assinaturas").update({ ultimo_pagamento_em: pay.date_approved ?? new Date().toISOString() }).eq("id", a.id);
  }
  return r;
}

/** W28: a cobrança é de uma assinatura migrada na virada e foi aprovada (ou criada) ANTES da migração? */
export function cobrancaAntesDaVirada(a: Pick<AssinaturaConta, "payload">, pay: Pick<PagamentoMp, "date_approved" | "date_created">): boolean {
  const migradaEm = typeof a.payload?.migrada_em === "string" ? Date.parse(a.payload.migrada_em as string) : NaN;
  const quando = Date.parse(String(pay.date_approved ?? pay.date_created ?? ""));
  return Number.isFinite(migradaEm) && Number.isFinite(quando) && quando < migradaEm;
}

/** O que vai pra conta_assinaturas a partir da assinatura do MP (fonte da verdade). */
export function espelhoAssinatura(pre: AssinaturaMp, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const valor = Number(pre.auto_recurring?.transaction_amount);
  return {
    mp_preapproval_id: String(pre.id),
    status: ["pending", "authorized", "paused", "cancelled"].includes(String(pre.status)) ? String(pre.status) : "pending",
    ...(valor > 0 ? { valor } : {}),
    proximo_vencimento: pre.next_payment_date || pre.auto_recurring?.next_payment_date || pre.summarized?.next_payment_date || null,
    payload: { ...extra, init_point: pre.init_point ?? null, external_reference: pre.external_reference ?? null, status: pre.status ?? null },
  };
}
