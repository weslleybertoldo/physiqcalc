// Webhook de notificações do Mercado Pago (verify_jwt = false).
// Nunca confia no payload: sempre re-busca o recurso na API do MP (fonte da verdade).
// external_reference: "<schema>:<user_id>[:<mes_ref>]" identifica ambiente e aluno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_API = "https://api.mercadopago.com";
const _ALLOWED_SCHEMAS = ["public", "staging"];

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

function parseRef(ref: string | null | undefined): { schema: string; userId: string; mesRef: string | null } | null {
  if (!ref) return null;
  const parts = ref.split(":");
  if (parts.length < 2 || !_ALLOWED_SCHEMAS.includes(parts[0])) return null;
  return { schema: parts[0], userId: parts[1], mesRef: parts[2] || null };
}

function adminFor(schema: string) {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });
}

function mesRefFromDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const br = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${br.getFullYear()}-${String(br.getMonth() + 1).padStart(2, "0")}-01`;
}

async function handlePayment(paymentId: string) {
  const pay = await mpGet(`/v1/payments/${paymentId}`);
  if (!pay) return;
  const ref = parseRef(pay.external_reference);
  const tipo = pay.payment_method_id === "pix" ? "pix" : "cartao";

  // pagamento avulso criado por nós (tem external_reference schema:user:mes)
  if (ref?.mesRef) {
    const admin = adminFor(ref.schema);
    await admin.from("physiq_pagamentos").upsert({
      user_id: ref.userId, tipo, valor: Number(pay.transaction_amount), mes_ref: ref.mesRef,
      mp_payment_id: String(pay.id), status: pay.status || "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "mp_payment_id" });
    return;
  }

  // pagamento gerado por assinatura: acha o aluno pela preapproval
  const preapprovalId = pay.metadata?.preapproval_id || pay.point_of_interaction?.transaction_data?.subscription_id || null;
  await upsertPagamentoAssinatura(preapprovalId, pay, ref);
}

async function upsertPagamentoAssinatura(preapprovalId: string | null, pay: any, ref: { schema: string; userId: string } | null) {
  const schemas = ref ? [ref.schema] : _ALLOWED_SCHEMAS;
  for (const sch of schemas) {
    const admin = adminFor(sch);
    let userId = ref?.userId || null;
    if (!userId && preapprovalId) {
      const { data } = await admin.from("physiq_assinaturas").select("user_id").eq("mp_preapproval_id", String(preapprovalId)).maybeSingle();
      userId = (data as any)?.user_id || null;
    }
    if (!userId) continue;
    await admin.from("physiq_pagamentos").upsert({
      user_id: userId, tipo: "cartao", valor: Number(pay.transaction_amount),
      mes_ref: mesRefFromDate(pay.date_approved || pay.date_created),
      mp_payment_id: String(pay.id), status: pay.status || "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "mp_payment_id" });
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
        user_id: ref.userId, mp_preapproval_id: String(pre.id),
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
