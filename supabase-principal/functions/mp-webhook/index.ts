// Physiq W2: cópia do physiqnutri (main ca9f66f). A partir daqui as funções do banco principal são publicadas a partir do
// physiqcalc (scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>).
/* eslint-disable @typescript-eslint/no-explicit-any -- código do physiqnutri copiado sem mudar o comportamento de hoje */
// PhysiqNutri — W42: webhook do Mercado Pago pras assinaturas (verify_jwt=false; a preapproval leva notification_url pra cá).
// NUNCA confia no payload: só pega o id do aviso e re-busca a preapproval na API do MP (fonte da verdade). Só mexe em linhas
// cuja external_reference é "physiqnutri:<schema>:<uid>" — o PhysiqCalc usa a MESMA conta MP e as refs dele são ignoradas.
// W50: aviso de `payment` cuja external_reference começa com "physiqnutri-pix:<schema>:<uid>" é um PIX avulso da assinatura →
// re-busca o pagamento e, aprovado pela 1ª vez, grava pago_em / cobre_ate em pagamentos_assinatura e soma 30 dias em
// profiles.pago_ate (mesma regra da action pix_status da mp-assinar; só quem troca pending→approved soma).
// O app também sincroniza ao abrir Configurações / voltar do checkout.
// Physiq W28 (virada): continua gravando o de sempre (assinaturas / pagamentos_assinatura / profiles.pago_ate) e REPASSA o
// mesmo aviso para a mp-webhook-conta (?schema=<schema da referência>&origem=nutri), que aplica na conta legado_nutri da
// nutri SÓ depois que ela passou para o núcleo (cobranca_legada = false). Repasse que falha → 500 (o MP manda de novo; as 2
// pontas são idempotentes).
// Physiq hml-06 (H-19): o ambiente é o da CREDENCIAL que achou o recurso (_shared/cobranca-mp.ts buscarNoMp: com ?schema= só a
// dele; sem, produção e depois teste) — Pix de sandbox com referência "public" não paga nada no public, e o de produção não
// vale no staging ("outro_ambiente": não grava nem repassa). O id do aviso só vai à API do MP no formato que o MP manda
// (idDoAvisoValido), e erro de banco/rede ou o MP fora → 500 (antes era 200 e o aviso se perdia).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { idDoAvisoValido } from "../_shared/cobranca-regras.ts";
import { buscarNoMp, type Schema } from "../_shared/cobranca-mp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS = ["public", "staging"];
const TOPICOS = ["subscription_preapproval", "preapproval", "subscription_authorized_payment", "payment"];
const STATUS = ["pending", "authorized", "paused", "cancelled"];
const VALOR_MENSAL = 80;
const DIAS_PIX = 30;
const PIX_PREFIXO = "physiqnutri-pix:";

const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function parseRef(ref: unknown): { schema: string; uid: string } | null {
  if (typeof ref !== "string") return null;
  const p = ref.split(":");
  if (p.length !== 3 || p[0] !== "physiqnutri" || !SCHEMAS.includes(p[1]) || !/^[0-9a-f-]{36}$/i.test(p[2])) return null;
  return { schema: p[1], uid: p[2] };
}
// "physiqnutri-pix:<schema>:<uid>" (W50) — qualquer outra ref (PhysiqCalc, preapproval) não é PIX da assinatura
function parseRefPix(ref: unknown): { schema: string; uid: string } | null {
  if (typeof ref !== "string" || !ref.startsWith(PIX_PREFIXO)) return null;
  const p = ref.split(":");
  if (p.length !== 3 || !SCHEMAS.includes(p[1]) || !/^[0-9a-f-]{36}$/i.test(p[2])) return null;
  return { schema: p[1], uid: p[2] };
}
function espelho(pre: any) {
  const st = String(pre?.status || "pending");
  return {
    mp_preapproval_id: String(pre.id),
    status: STATUS.includes(st) ? st : "pending",
    valor: Number(pre?.auto_recurring?.transaction_amount || VALOR_MENSAL),
    init_point: pre?.init_point ?? null,
    proximo_vencimento: pre?.next_payment_date ?? null,
    ultimo_pagamento_em: pre?.summarized?.last_charged_date ?? null,
    payload: pre,
    updated_at: new Date().toISOString(),
  };
}

// hml-06: schemaPedido = o ?schema= do aviso, ou o ambiente da credencial que achou o pagamento/cobrança que levou até aqui
async function sincronizarPreapproval(id: string, schemaPedido: Schema | null, ctx: { schema: string | null }): Promise<string> {
  const achado = await buscarNoMp<any>(`/preapproval/${encodeURIComponent(id)}`, schemaPedido);
  const pre = achado?.recurso;
  if (!achado || !pre?.id) return "mp_nao_achou";
  const ref = parseRef(pre.external_reference);
  if (!ref) return "nao_e_do_physiqnutri";
  if (ref.schema !== achado.schema) return "outro_ambiente"; // hml-06: nem grava nem repassa
  ctx.schema = achado.schema;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: achado.schema as "public" } });
  const { data: linha } = await admin.from("assinaturas").select("id, mp_preapproval_id").eq("nutricionista_id", ref.uid).maybeSingle();
  if (!linha) {
    const { error } = await admin.from("assinaturas").insert({ nutricionista_id: ref.uid, ...espelho(pre) });
    return error ? `erro_insert:${error.code}` : "inserida";
  }
  // aviso de uma preapproval antiga (trocada/cancelada) não sobrescreve a atual do profissional
  if ((linha as any).mp_preapproval_id && (linha as any).mp_preapproval_id !== String(pre.id)) return "preapproval_antiga";
  const { error } = await admin.from("assinaturas").update(espelho(pre)).eq("id", (linha as any).id);
  return error ? `erro_update:${error.code}` : "atualizada";
}

// ---- W50: PIX avulso da assinatura (mesmas regras da mp-assinar) ----
function statusPix(pay: any): string {
  const st = String(pay?.status || "pending");
  if (st === "approved") return "approved";
  if (st === "rejected") return "rejected";
  if (st === "cancelled" || st === "refunded" || st === "charged_back") {
    return String(pay?.status_detail || "").toLowerCase().includes("expir") ? "expired" : "cancelled";
  }
  return "pending";
}
function espelhoPix(pay: any) {
  const td = pay?.point_of_interaction?.transaction_data || {};
  return {
    mp_payment_id: String(pay.id),
    status: statusPix(pay),
    valor: Number(pay?.transaction_amount || VALOR_MENSAL),
    pix_qr_code: td.qr_code ?? null,
    pix_qr_code_base64: td.qr_code_base64 ?? null,
    pix_expira_em: pay?.date_of_expiration ?? null,
    payload: pay,
    updated_at: new Date().toISOString(),
  };
}
// aprovou → 30 dias a partir de HOJE, ou do que ainda vale (pago_ate / teste_ate no futuro): ninguém perde dias
function novoPagoAte(perfil: any): string {
  const futuros = [perfil?.pago_ate, perfil?.teste_ate]
    .map((d) => (d ? new Date(d).getTime() : 0))
    .filter((n) => Number.isFinite(n));
  return new Date(Math.max(Date.now(), ...futuros) + DIAS_PIX * 86_400_000).toISOString();
}
// hml-06: schema = o da credencial que achou o pagamento (quem chama já conferiu que é o mesmo da referência)
async function aplicarPagamentoPix(pay: any, schema: Schema): Promise<string> {
  const ref = parseRefPix(pay?.external_reference);
  if (!ref) return "nao_e_pix_do_physiqnutri";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });
  const { data: perfil } = await admin.from("profiles").select("id, pago_ate, teste_ate").eq("id", ref.uid).maybeSingle();
  if (!perfil) return "sem_perfil";
  const esp = espelhoPix(pay);
  let { data: linha } = await admin.from("pagamentos_assinatura").select("*").eq("mp_payment_id", String(pay.id)).maybeSingle();
  if (!linha) {
    // a tela pode não ter gravado (function caiu depois do POST no MP): a linha nasce daqui
    const { data: nova, error } = await admin.from("pagamentos_assinatura")
      .insert({ nutricionista_id: ref.uid, ...esp, status: "pending" }).select("*").single();
    if (error) return `erro_insert:${error.code}`;
    linha = nova;
  }
  const l = linha as any;
  if (l.status === "approved") return "ja_aprovado";
  if (esp.status === "pending" && l.pix_expira_em && new Date(l.pix_expira_em).getTime() < Date.now()) esp.status = "expired";
  if (esp.status === "approved") {
    const pagoAte = novoPagoAte(perfil);
    const { data: salvo, error } = await admin.from("pagamentos_assinatura")
      .update({ ...esp, pago_em: pay?.date_approved ?? new Date().toISOString(), cobre_ate: pagoAte })
      .eq("id", l.id).neq("status", "approved").select("id").maybeSingle();
    if (error) return `erro_update:${error.code}`;
    if (!salvo) return "ja_aprovado";
    const { error: ep } = await admin.from("profiles").update({ pago_ate: pagoAte }).eq("id", ref.uid);
    return ep ? `erro_perfil:${ep.code}` : "pix_aprovado";
  }
  const { error } = await admin.from("pagamentos_assinatura").update(esp).eq("id", l.id);
  return error ? `erro_update:${error.code}` : `pix_${esp.status}`;
}

// ---- W28: repasse para a mp-webhook-conta (mesmo projeto) ----
async function repassarParaConta(topic: string, id: string, schema: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/functions/v1/mp-webhook-conta?schema=${schema}&origem=nutri`;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: topic, data: { id } }), signal: ctrl.signal });
      clearTimeout(t);
      const txt = await res.text();
      console.log("mp-webhook repasse conta", topic, id, schema, res.status, txt.slice(0, 200));
      if (res.ok) return true;
    } catch (e) {
      console.error("mp-webhook repasse conta falhou", topic, id, String((e as { message?: string })?.message || e));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const url = new URL(req.url);
    // hml-06: o ?schema= (a notification_url da mp-assinar sempre trouxe) restringe a credencial; sem ele, produção e depois teste
    const bruto = (url.searchParams.get("schema") || "").toLowerCase();
    const schema = SCHEMAS.includes(bruto) ? (bruto as Schema) : null;
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const topic = String(body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    const id = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    // hml-06 (H-19): o id vai no caminho da API do MP — fora do formato que o MP manda, nem chega a ele
    if (id && TOPICOS.includes(topic) && !idDoAvisoValido(topic, id)) {
      console.log("mp-webhook", topic, "id_invalido");
      return resposta({ ok: true, resultado: "id_invalido" });
    }
    let resultado = "ignorado";
    const ctx: { schema: string | null } = { schema: null };
    if (id) {
      if (topic === "subscription_preapproval" || topic === "preapproval") {
        resultado = await sincronizarPreapproval(id, schema, ctx);
      } else if (topic === "subscription_authorized_payment") {
        const achado = await buscarNoMp<any>(`/authorized_payments/${encodeURIComponent(id)}`, schema);
        const ap = achado?.recurso;
        resultado = achado && ap?.preapproval_id ? await sincronizarPreapproval(String(ap.preapproval_id), achado.schema, ctx) : "sem_preapproval";
      } else if (topic === "payment") {
        const achado = await buscarNoMp<any>(`/v1/payments/${encodeURIComponent(id)}`, schema);
        const pay = achado?.recurso;
        const pix = parseRefPix(pay?.external_reference);
        if (achado && pix) {
          if (pix.schema !== achado.schema) resultado = "outro_ambiente"; // hml-06: nem grava nem repassa
          else {
            ctx.schema = achado.schema;
            resultado = await aplicarPagamentoPix(pay, achado.schema); // W50: PIX avulso da assinatura
          }
        } else {
          const preId = pay?.metadata?.preapproval_id || pay?.point_of_interaction?.transaction_data?.subscription_id || null;
          resultado = achado && preId ? await sincronizarPreapproval(String(preId), achado.schema, ctx) : "sem_preapproval";
        }
      }
    }
    console.log("mp-webhook", topic, id, resultado);
    // W28: o mesmo aviso vai para a cobrança das contas (só o que é do PhysiqNutri e do ambiente da credencial)
    if (id && ctx.schema && SCHEMAS.includes(ctx.schema)) {
      const repasse = await repassarParaConta(topic, id, ctx.schema);
      if (!repasse) return resposta({ ok: false, resultado, repasse: "falhou" }, 500);
    }
    return resposta({ ok: true, resultado });
  } catch (e) {
    // hml-06: 500 → o MP manda o aviso de novo (antes era 200 e o aviso se perdia; as pontas são idempotentes)
    console.error("mp-webhook erro", String((e as { message?: string })?.message || e));
    return resposta({ ok: false, resultado: "erro" }, 500);
  }
});
