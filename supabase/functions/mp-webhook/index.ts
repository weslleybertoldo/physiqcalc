// Webhook de notificações do Mercado Pago (verify_jwt = false).
// Nunca confia no payload: sempre re-busca o recurso na API do MP (fonte da verdade).
// external_reference: "<schema>:<user_id>[:<mes_ref>[:<contexto>[:<tipo_cobranca>]]]"
//   contexto = aluno (mensalidade do aluno, padrão) | plano_professor (SaaS 12/09/2026: adesão/mensal/anual do professor)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_API = "https://api.mercadopago.com";
const TZ = "America/Sao_Paulo";
const _ALLOWED_SCHEMAS = ["public", "staging"];
const _CONTEXTOS = ["aluno", "plano_professor"];

function tokens(): string[] {
  return [Deno.env.get("MP_ACCESS_TOKEN_PROD") || "", Deno.env.get("MP_ACCESS_TOKEN_TEST") || ""].filter(Boolean);
}

// tenta com prod e depois test — o recurso só existe na credencial que o criou
async function mpGet(path: string): Promise<any | null> {
  for (const tk of tokens()) {
    const res = await fetch(`${MP_API}${path}`, { headers: { "Authorization": `Bearer ${tk}` } });
    if (res.status === 200) return await res.json();
  }
  return null;
}

interface Ref { schema: string; userId: string; mesRef: string | null; contexto: string; tipoCobranca: string | null }
function parseRef(ref: string | null | undefined): Ref | null {
  if (!ref) return null;
  const parts = ref.split(":");
  if (parts.length < 2 || !_ALLOWED_SCHEMAS.includes(parts[0])) return null;
  const contexto = _CONTEXTOS.includes(parts[3] || "") ? parts[3] : "aluno";
  return { schema: parts[0], userId: parts[1], mesRef: parts[2] || null, contexto, tipoCobranca: parts[4] || (contexto === "aluno" ? "mensal" : null) };
}

function adminFor(schema: string) {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });
}

function mesRefFromDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const br = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  return `${br.getFullYear()}-${String(br.getMonth() + 1).padStart(2, "0")}-01`;
}

function addDias(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
function addMes(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  const dia = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return x.toISOString().slice(0, 10);
}

// ---- cobrança do PROFESSOR (pós-pago): efeito de um pagamento aprovado — MESMA lógica do mp-payments ----
async function aplicarPagamentoPlano(admin: any, userId: string, tipoCobranca: string | null, dataAprov: Date) {
  const { data: p } = await admin.from("physiq_professores").select("ciclo_vence_em, plano_id, adesao_paga_em").eq("id", userId).maybeSingle();
  if (!p) return;
  const hoje = dataAprov.toLocaleDateString("en-CA", { timeZone: TZ });
  const { data: pl } = (p as any).plano_id
    ? await admin.from("physiq_planos_professor").select("valor_mensal").eq("id", (p as any).plano_id).maybeSingle()
    : { data: null };
  const valorMensal = (pl as any)?.valor_mensal ?? null;
  if (tipoCobranca === "adesao") {
    await admin.from("physiq_professores").update({
      adesao_paga_em: (p as any).adesao_paga_em ?? hoje, ciclo_inicio: hoje, ciclo_vence_em: addDias(hoje, 30), ciclo_valor: valorMensal, trial_ate: null,
    }).eq("id", userId);
  } else if (tipoCobranca === "mensal") {
    const vence = (p as any).ciclo_vence_em as string | null;
    const base = vence && vence > hoje ? vence : hoje;
    await admin.from("physiq_professores").update({ ciclo_inicio: base, ciclo_vence_em: addMes(base), ciclo_valor: valorMensal }).eq("id", userId);
  } else if (tipoCobranca === "anual") {
    const x = new Date(`${hoje}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + 1);
    await admin.from("physiq_professores").update({ anual_ate: x.toISOString().slice(0, 10), adesao_paga_em: (p as any).adesao_paga_em ?? hoje, trial_ate: null }).eq("id", userId);
  }
}

// grava/atualiza o pagamento e, se acabou de ser APROVADO num contexto de plano, aplica o efeito (idempotente:
// só aplica na transição para approved — webhook e refresh do app podem chegar os dois)
async function gravarPagamento(admin: any, row: Record<string, unknown>, pay: any, contexto: string, tipoCobranca: string | null) {
  const { data: antes } = await admin.from("physiq_pagamentos").select("status").eq("mp_payment_id", String(pay.id)).maybeSingle();
  await admin.from("physiq_pagamentos").upsert({
    ...row, mp_payment_id: String(pay.id), status: pay.status || "pending", contexto, tipo_cobranca: tipoCobranca,
    updated_at: new Date().toISOString(),
  }, { onConflict: "mp_payment_id" });
  if (contexto === "plano_professor" && pay.status === "approved" && (antes as any)?.status !== "approved") {
    await aplicarPagamentoPlano(admin, row.user_id as string, tipoCobranca, new Date(pay.date_approved || pay.date_created || Date.now()));
  }
}

async function handlePayment(paymentId: string) {
  const pay = await mpGet(`/v1/payments/${paymentId}`);
  if (!pay) return;
  const ref = parseRef(pay.external_reference);
  const tipo = pay.payment_method_id === "pix" ? "pix" : "cartao";

  // pagamento avulso criado por nós (tem external_reference schema:user:mes[:contexto:tipo])
  if (ref?.mesRef) {
    const admin = adminFor(ref.schema);
    await gravarPagamento(admin, { user_id: ref.userId, tipo, valor: Number(pay.transaction_amount), mes_ref: ref.mesRef }, pay, ref.contexto, ref.tipoCobranca);
    return;
  }

  // pagamento gerado por assinatura: acha o dono pela preapproval
  const preapprovalId = pay.metadata?.preapproval_id || pay.point_of_interaction?.transaction_data?.subscription_id || null;
  await upsertPagamentoAssinatura(preapprovalId, pay, ref);
}

async function upsertPagamentoAssinatura(preapprovalId: string | null, pay: any, ref: Ref | null) {
  const schemas = ref ? [ref.schema] : _ALLOWED_SCHEMAS;
  for (const sch of schemas) {
    const admin = adminFor(sch);
    let userId = ref?.userId || null;
    let contexto = ref?.contexto || "aluno";
    if (preapprovalId) {
      const { data } = await admin.from("physiq_assinaturas").select("user_id, contexto").eq("mp_preapproval_id", String(preapprovalId)).maybeSingle();
      if (data) { userId = userId || (data as any).user_id; contexto = (data as any).contexto || contexto; }
    }
    if (!userId) continue;
    await gravarPagamento(admin, {
      user_id: userId, tipo: "cartao", valor: Number(pay.transaction_amount),
      mes_ref: mesRefFromDate(pay.date_approved || pay.date_created),
    }, pay, contexto, "mensal");
    return;
  }
}

async function handlePreapproval(preapprovalId: string) {
  const pre = await mpGet(`/preapproval/${preapprovalId}`);
  if (!pre) return;
  const ref = parseRef(pre.external_reference);
  const schemas = ref ? [ref.schema] : _ALLOWED_SCHEMAS;
  for (const sch of schemas) {
    const admin = adminFor(sch);
    const { data } = await admin.from("physiq_assinaturas").select("id").eq("mp_preapproval_id", String(pre.id)).maybeSingle();
    if (data) {
      await admin.from("physiq_assinaturas").update({ status: pre.status, updated_at: new Date().toISOString() }).eq("id", (data as any).id);
      return;
    }
    if (ref && sch === ref.schema) {
      await admin.from("physiq_assinaturas").insert({
        user_id: ref.userId, mp_preapproval_id: String(pre.id), contexto: ref.contexto,
        status: pre.status || "pending", valor: Number(pre.auto_recurring?.transaction_amount || 0) || 1,
      });
      return;
    }
  }
}

async function handleAuthorizedPayment(authPaymentId: string) {
  const ap = await mpGet(`/authorized_payments/${authPaymentId}`);
  if (!ap) return;
  const paymentId = ap.payment?.id;
  if (paymentId) { await handlePayment(String(paymentId)); return; }
  if (ap.preapproval_id) {
    await upsertPagamentoAssinatura(String(ap.preapproval_id), {
      id: `ap-${ap.id}`, transaction_amount: ap.transaction_amount,
      date_created: ap.date_created, status: ap.status === "processed" ? "approved" : "pending",
    }, null);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* IPN via query */ }
    const topic = body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "";
    const id = body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "";
    if (!id) return new Response("ok", { status: 200 });

    if (topic === "payment") await handlePayment(String(id));
    else if (topic === "subscription_preapproval" || topic === "preapproval") await handlePreapproval(String(id));
    else if (topic === "subscription_authorized_payment") await handleAuthorizedPayment(String(id));
    // outros tópicos: ignora silenciosamente

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("mp-webhook error", e);
    // 200 mesmo em erro pra não gerar tempestade de retries; o refresh do status cobre
    return new Response("ok", { status: 200 });
  }
});
