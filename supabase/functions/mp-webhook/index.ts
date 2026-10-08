// Webhook de notificações do Mercado Pago (verify_jwt = false). Publicar SÓ pelo scripts/deploy_function.sh (o workflow
// deploy-function.yml liga o verify_jwt e o MP passaria a levar 401).
// Nunca confia no payload: sempre re-busca o recurso na API do MP (fonte da verdade).
// external_reference: "<schema>:<user_id>[:<mes_ref>[:<contexto>[:<tipo_cobranca>]]]"
//   contexto = aluno (mensalidade do aluno, padrão) | plano_professor (SaaS 12/09/2026: adesão/mensal/anual do professor)
// Physiq W6: a cobrança do ALUNO mudou para o banco principal. Os pagamentos e as assinaturas que o Calc criou antes continuam
// avisando esta URL: aqui eles seguem sendo gravados no Treino (como sempre) e o MESMO aviso é repassado para a
// mp-webhook-aluno do principal (segredo PRINCIPAL_WEBHOOK_URL), que busca de novo no MP e grava a cobrança lá. Se o repasse
// falha, a resposta é 500 — o MP manda de novo e nada se perde (as duas pontas são idempotentes). PRINCIPAL_WEBHOOK_SCHEMAS
// (ex.: "staging" ou "staging,public") liga o repasse por ambiente.
// Physiq W28 (virada): os do PROFESSOR (plano_professor) também são repassados — para a mp-webhook-conta do principal
// (segredo PRINCIPAL_WEBHOOK_CONTA_URL), que aplica na conta legada_calc do professor SÓ depois que ela passou para o núcleo
// (cobranca_legada = false); antes disso ela ignora e vale o que este webhook grava aqui (as colunas antigas continuam).
// Physiq hml-06 (H-19): o ambiente é o da CREDENCIAL que achou o recurso (produção → public, teste → staging), nunca o da
// referência — Pix de sandbox com referência "public:" não paga nada no public, e o de produção não vale no staging
// ("outro_ambiente": não grava nem repassa). O id do aviso só vai à API do MP no formato que o MP manda (regras.ts) e o MP
// fora devolve 500 (o MP manda de novo; antes o aviso seguia sem o recurso e se perdia).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { idDoAvisoValido, modoConfere, mpTransitorio } from "./regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_API = "https://api.mercadopago.com";
const TZ = "America/Sao_Paulo";
const _ALLOWED_SCHEMAS = ["public", "staging"];
const _CONTEXTOS = ["aluno", "plano_professor"];
const TOPICOS = ["payment", "subscription_preapproval", "preapproval", "subscription_authorized_payment"];

type Cred = "prod" | "test";
// hml-06: o schema onde o recurso vale é o da credencial que o achou
const SCHEMA: Record<Cred, string> = { prod: "public", test: "staging" };

/** hml-06: o MP não respondeu de um jeito que permita decidir — o aviso volta 500 e o MP manda de novo. */
class MpIndisponivel extends Error {
  status: number;
  constructor(status: number) {
    super(`mp_indisponivel_${status}`);
    this.status = status;
  }
}

function tokenDe(c: Cred): string {
  return Deno.env.get(c === "prod" ? "MP_ACCESS_TOKEN_PROD" : "MP_ACCESS_TOKEN_TEST") || "";
}

// tenta com prod e depois test (ou só a credencial pedida) — o recurso só existe na credencial que o criou.
// 404/403 = não é desta credencial; MP fora (5xx, 429, 401 ou rede) → MpIndisponivel
async function buscarNoMp(caminho: string, cred?: Cred): Promise<{ body: any; cred: Cred } | null> {
  let recusado = 0;
  for (const c of cred ? [cred] : (["prod", "test"] as Cred[])) {
    const tk = tokenDe(c);
    if (!tk) continue;
    let status = 599; // rede
    let body = null;
    try {
      const res = await fetch(`${MP_API}${caminho}`, { headers: { "Authorization": `Bearer ${tk}` } });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch {
      status = 599;
    }
    if (status === 200 && body) {
      if (!modoConfere(c, body)) continue; // pagamento de produção lido pela credencial de teste: não vale no staging
      return { body, cred: c };
    }
    if (status === 401) recusado = status; // pode ser recurso da outra credencial: decide no fim
    else if (mpTransitorio(status)) throw new MpIndisponivel(status);
  }
  if (recusado) throw new MpIndisponivel(recusado);
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

// o que o aviso era: de quem (contexto) e de qual ambiente — decide o repasse ao principal (W6).
// hml-06: ignorar = referência de outro ambiente (pula os 2 repasses)
interface Alvo { contexto: string | null; schema: string | null; ignorar?: boolean }

async function handlePayment(paymentId: string, cred?: Cred): Promise<Alvo> {
  const achado = await buscarNoMp(`/v1/payments/${encodeURIComponent(paymentId)}`, cred);
  if (!achado) return { contexto: null, schema: null };
  const pay = achado.body;
  const sch = SCHEMA[achado.cred];
  const ref = parseRef(pay.external_reference);
  if (ref && ref.schema !== sch) return { contexto: ref.contexto, schema: null, ignorar: true };
  const tipo = pay.payment_method_id === "pix" ? "pix" : "cartao";

  // pagamento avulso criado por nós (tem external_reference schema:user:mes[:contexto:tipo])
  if (ref?.mesRef) {
    const admin = adminFor(sch);
    await gravarPagamento(admin, { user_id: ref.userId, tipo, valor: Number(pay.transaction_amount), mes_ref: ref.mesRef }, pay, ref.contexto, ref.tipoCobranca);
    return { contexto: ref.contexto, schema: sch };
  }

  // pagamento gerado por assinatura: acha o dono pela preapproval
  const preapprovalId = pay.metadata?.preapproval_id || pay.point_of_interaction?.transaction_data?.subscription_id || null;
  return await upsertPagamentoAssinatura(preapprovalId, pay, ref, sch);
}

// hml-06: só no schema da credencial que achou o pagamento (antes, sem referência, varria os 2)
async function upsertPagamentoAssinatura(preapprovalId: string | null, pay: any, ref: Ref | null, sch: string): Promise<Alvo> {
  const admin = adminFor(sch);
  let userId = ref?.userId || null;
  let contexto = ref?.contexto || "aluno";
  if (preapprovalId) {
    const { data } = await admin.from("physiq_assinaturas").select("user_id, contexto").eq("mp_preapproval_id", String(preapprovalId)).maybeSingle();
    if (data) { userId = userId || (data as any).user_id; contexto = (data as any).contexto || contexto; }
  }
  if (!userId) return { contexto: ref?.contexto ?? null, schema: sch };
  await gravarPagamento(admin, {
    user_id: userId, tipo: "cartao", valor: Number(pay.transaction_amount),
    mes_ref: mesRefFromDate(pay.date_approved || pay.date_created),
  }, pay, contexto, "mensal");
  return { contexto, schema: sch };
}

async function handlePreapproval(preapprovalId: string): Promise<Alvo> {
  const achado = await buscarNoMp(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  if (!achado) return { contexto: null, schema: null };
  const pre = achado.body;
  const sch = SCHEMA[achado.cred];
  const ref = parseRef(pre.external_reference);
  if (ref && ref.schema !== sch) return { contexto: ref.contexto, schema: null, ignorar: true };
  const admin = adminFor(sch);
  const { data } = await admin.from("physiq_assinaturas").select("id, contexto").eq("mp_preapproval_id", String(pre.id)).maybeSingle();
  if (data) {
    const linha = data as { id: string; contexto: string | null };
    await admin.from("physiq_assinaturas").update({ status: pre.status, updated_at: new Date().toISOString() }).eq("id", linha.id);
    return { contexto: linha.contexto || ref?.contexto || "aluno", schema: sch };
  }
  if (ref) {
    await admin.from("physiq_assinaturas").insert({
      user_id: ref.userId, mp_preapproval_id: String(pre.id), contexto: ref.contexto,
      status: pre.status || "pending", valor: Number(pre.auto_recurring?.transaction_amount || 0) || 1,
    });
    return { contexto: ref.contexto, schema: sch };
  }
  return { contexto: null, schema: sch };
}

async function handleAuthorizedPayment(authPaymentId: string): Promise<Alvo> {
  const achado = await buscarNoMp(`/authorized_payments/${encodeURIComponent(authPaymentId)}`);
  if (!achado) return { contexto: null, schema: null };
  const ap = achado.body;
  const paymentId = ap.payment?.id;
  // o pagamento está na mesma credencial da cobrança autorizada
  if (paymentId) return await handlePayment(String(paymentId), achado.cred);
  if (ap.preapproval_id) {
    return await upsertPagamentoAssinatura(String(ap.preapproval_id), {
      id: `ap-${ap.id}`, transaction_amount: ap.transaction_amount,
      date_created: ap.date_created, status: ap.status === "processed" ? "approved" : "pending",
    }, null, SCHEMA[achado.cred]);
  }
  return { contexto: null, schema: SCHEMA[achado.cred] };
}

// ---- W6: repasse dos avisos de ALUNO para o banco principal ----
// W28: repasse dos avisos de PROFESSOR para a cobrança das contas (mp-webhook-conta do principal)
function repasseContaLigado(): boolean {
  return !!Deno.env.get("PRINCIPAL_WEBHOOK_CONTA_URL");
}

function repasseLigado(schema: string | null): boolean {
  if (!Deno.env.get("PRINCIPAL_WEBHOOK_URL")) return false;
  const ligados = (Deno.env.get("PRINCIPAL_WEBHOOK_SCHEMAS") || "staging,public").split(",").map((x) => x.trim()).filter(Boolean);
  // sem saber o ambiente (aviso sem referência que o Treino não reconheceu), só repassa com a produção ligada
  return ligados.includes(schema || "public");
}

async function repassar(topic: string, id: string, schema: string | null, destino = "PRINCIPAL_WEBHOOK_URL"): Promise<boolean> {
  const base = Deno.env.get(destino)!;
  const url = `${base}${base.includes("?") ? "&" : "?"}origem=treino${schema ? `&schema=${schema}` : ""}`;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: topic, data: { id } }), signal: ctrl.signal });
      clearTimeout(t);
      const txt = await res.text();
      console.log("mp-webhook repasse", topic, id, schema ?? "?", res.status, txt.slice(0, 200));
      if (res.ok) return true;
    } catch (e) {
      console.error("mp-webhook repasse falhou", topic, id, String((e as { message?: string })?.message || e));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* IPN via query */ }
    const topic = String(body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    const id = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (!id) return new Response("ok", { status: 200 });
    if (!TOPICOS.includes(topic)) return new Response("ok", { status: 200 }); // outros tópicos: ignora silenciosamente
    // hml-06 (H-19): o id vai no caminho da API do MP — fora do formato que o MP manda, nem chega a ele
    if (!idDoAvisoValido(topic, id)) return new Response("id_invalido", { status: 200 });

    let alvo: Alvo = { contexto: null, schema: null };
    try {
      if (topic === "payment") alvo = await handlePayment(id);
      else if (topic === "subscription_preapproval" || topic === "preapproval") alvo = await handlePreapproval(id);
      else alvo = await handleAuthorizedPayment(id);
    } catch (e) {
      // hml-06: o MP fora → 500 (o MP manda de novo; antes o aviso seguia sem o recurso e se perdia)
      if (e instanceof MpIndisponivel) {
        console.error("mp-webhook: MP indisponível", topic, e.status);
        return new Response("mp_indisponivel", { status: 500 });
      }
      // o Treino não gravou (o refresh da tela antiga cobria); o principal ainda recebe o aviso abaixo
      console.error("mp-webhook error", e);
    }
    // hml-06 (H-19): referência de outro ambiente (sandbox com "public:", produção com "staging:") não grava nem repassa
    if (alvo.ignorar) return new Response("outro_ambiente", { status: 200 });

    // W6: aviso de aluno (ou de dono desconhecido) vai também para o principal; sem sucesso → 500 (o MP manda de novo)
    if (alvo.contexto !== "plano_professor" && repasseLigado(alvo.schema)) {
      const ok = await repassar(String(topic), String(id), alvo.schema);
      if (!ok) return new Response("repasse_falhou", { status: 500 });
    }
    // W28: aviso de professor vai para a cobrança das contas (o principal só aplica se a conta já está no núcleo)
    if (alvo.contexto === "plano_professor" && alvo.schema && repasseContaLigado()) {
      const ok = await repassar(String(topic), String(id), alvo.schema, "PRINCIPAL_WEBHOOK_CONTA_URL");
      if (!ok) return new Response("repasse_falhou", { status: 500 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("mp-webhook error", e);
    // 200 mesmo em erro pra não gerar tempestade de retries; o refresh do status cobre
    return new Response("ok", { status: 200 });
  }
});
