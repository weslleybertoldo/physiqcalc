// Physiq W4 — mp-webhook-conta (banco principal): avisos do Mercado Pago das cobranças das CONTAS (spec §6.6). O MP chama
// sem JWT (verify_jwt = false) a notification_url que a cobranca-conta põe em cada cobrança:
//   https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/mp-webhook-conta?schema=<public|staging>
// O aviso só diz "olhe este recurso": a função SEMPRE busca de novo na API do MP com a credencial do ambiente (produção só
// com a de produção; staging só com a de teste — um pagamento de sandbox nunca vale para uma conta de verdade) e só trata
// o que é das contas do Physiq (external_reference physiq:<schema>:conta:…, ou a assinatura guardada em conta_assinaturas).
// Idempotente: mp_payment_id único + aplicar_pagamento_conta uma vez só por fatura (spec 6.6, Nativo OS W30).
// Tópicos: payment · subscription_preapproval (preapproval) · subscription_authorized_payment. Responde 200 sempre (o MP
// repete em erro; a conferência da tela cobre o que falhar).
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook-conta false
// Segredos: MP_ACCESS_TOKEN_PROD, MP_ACCESS_TOKEN_TEST (+ os automáticos).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { lerReferencia, preapprovalDoPagamento, type AssinaturaMp, type PagamentoMp } from "../_shared/cobranca-regras.ts";
import {
  COLUNAS_ASSINATURA,
  COLUNAS_FATURA,
  aplicarStatus,
  credencialDoSchema,
  espelhoAssinatura,
  mpFetch,
  registrarCobrancaRecorrente,
  tokenMp,
  type AssinaturaConta,
  type Fatura,
  type Schema,
} from "../_shared/cobranca-mp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS: Schema[] = ["public", "staging"];

const ok = (resultado: string) => new Response(JSON.stringify({ ok: true, resultado }), { status: 200, headers: { "Content-Type": "application/json" } });

function dbDe(schema: Schema): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
}

/** Preço mensal atual da assinatura (quando o MP não traz o valor da cobrança). */
async function valorMensal(db: SupabaseClient, a: AssinaturaConta): Promise<number | null> {
  const { data } = await db.from("contas").select("plano, faixa").eq("id", a.conta_id).maybeSingle();
  const c = data as { plano: string; faixa: string } | null;
  if (!c) return a.valor;
  const { data: v } = await db.rpc("conta_preco", { p_conta: a.conta_id, p_plano: a.plano ?? c.plano, p_faixa: a.faixa ?? c.faixa, p_meses: 1 });
  return v === null || v === undefined ? a.valor : Number(v);
}

async function tratarPagamento(schema: Schema, id: string): Promise<string> {
  const credencial = credencialDoSchema(schema);
  const { status, body: pay } = await mpFetch<PagamentoMp>(credencial, `/v1/payments/${encodeURIComponent(id)}`);
  if (status !== 200 || !pay?.id) return `pagamento_nao_encontrado_${status}`;
  const ref = lerReferencia(pay.external_reference);
  if (ref && ref.schema !== schema) return "outro_ambiente";
  const db = dbDe(schema);

  // cobrança avulsa (Pix ou cartão à vista): a referência traz a fatura
  if (ref?.faturaId) {
    const { data } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("id", ref.faturaId).eq("conta_id", ref.contaId).maybeSingle();
    let f = data as Fatura | null;
    if (!f) return "fatura_inexistente";
    if (!f.mp_payment_id) {
      await db.from("conta_faturas").update({ mp_payment_id: String(pay.id) }).eq("id", f.id).is("mp_payment_id", null);
      f = ((await db.from("conta_faturas").select(COLUNAS_FATURA).eq("id", f.id).maybeSingle()).data as Fatura | null) ?? f;
    }
    if (f.mp_payment_id !== String(pay.id)) return "fatura_de_outro_pagamento";
    const r = await aplicarStatus(db, f, pay);
    return `fatura_${r.status}${r.aplicou ? "_aplicada" : ""}`;
  }

  // cobrança mensal da assinatura: acha a conta pela assinatura
  const preId = preapprovalDoPagamento(pay);
  let assinatura: AssinaturaConta | null = null;
  if (preId) {
    const { data } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("mp_preapproval_id", preId).maybeSingle();
    assinatura = (data as AssinaturaConta | null) ?? null;
  }
  if (!assinatura && ref?.tipo === "recorrente") {
    const { data } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("conta_id", ref.contaId).maybeSingle();
    assinatura = (data as AssinaturaConta | null) ?? null;
  }
  if (!assinatura) return ref ? "assinatura_inexistente" : "nao_e_do_physiq";
  const r = await registrarCobrancaRecorrente(db, assinatura, pay, await valorMensal(db, assinatura));
  return r ? `recorrente_${r.status}${r.aplicou ? "_aplicada" : ""}` : "recorrente_sem_id";
}

async function tratarAssinatura(schema: Schema, id: string): Promise<string> {
  const credencial = credencialDoSchema(schema);
  const { status, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(id)}`);
  if (status !== 200 || !pre?.id) return `assinatura_nao_encontrada_${status}`;
  const ref = lerReferencia(pre.external_reference);
  if (ref && ref.schema !== schema) return "outro_ambiente";
  const db = dbDe(schema);
  const { data } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("mp_preapproval_id", String(pre.id)).maybeSingle();
  const a = data as AssinaturaConta | null;
  if (a) {
    if (a.payload?.simulada === true) return "assinatura_simulada";
    await db.from("conta_assinaturas").update(espelhoAssinatura(pre, { ...(a.payload ?? {}) })).eq("id", a.id);
    return `assinatura_${pre.status}`;
  }
  if (!ref || ref.tipo !== "recorrente") return "nao_e_do_physiq";
  // o aviso chegou antes de a cobranca-conta gravar a linha: grava pela conta da referência (1 assinatura por conta)
  const { data: atual } = await db.from("conta_assinaturas").select("id, mp_preapproval_id").eq("conta_id", ref.contaId).maybeSingle();
  const linhaAtual = atual as { id: string; mp_preapproval_id: string | null } | null;
  if (linhaAtual?.mp_preapproval_id && linhaAtual.mp_preapproval_id !== String(pre.id)) return "assinatura_antiga";
  await db.from("conta_assinaturas").upsert({ conta_id: ref.contaId, ...espelhoAssinatura(pre) }, { onConflict: "conta_id" });
  return `assinatura_${pre.status}_gravada`;
}

async function tratarCobrancaAutorizada(schema: Schema, id: string): Promise<string> {
  const credencial = credencialDoSchema(schema);
  const { status, body: ap } = await mpFetch<{ payment?: { id?: number | string | null } | null }>(credencial, `/authorized_payments/${encodeURIComponent(id)}`);
  if (status !== 200 || !ap) return `cobranca_nao_encontrada_${status}`;
  const pagamento = ap.payment?.id;
  if (pagamento === null || pagamento === undefined) return "cobranca_sem_pagamento_ainda";
  return await tratarPagamento(schema, String(pagamento));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok("ignorado_metodo");
  try {
    const url = new URL(req.url);
    const schema = (url.searchParams.get("schema") || "public").toLowerCase() as Schema;
    if (!SCHEMAS.includes(schema)) return ok("schema_invalido");
    if (!tokenMp(credencialDoSchema(schema))) return ok("mp_nao_configurado");
    let corpo: Record<string, unknown> = {};
    try {
      corpo = (await req.json()) as Record<string, unknown>;
    } catch {
      corpo = {}; // IPN antigo: tudo na query
    }
    const dados = (corpo.data ?? {}) as Record<string, unknown>;
    const topico = String(corpo.type || corpo.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    const id = String(dados.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return ok("sem_id");
    let resultado = "topico_ignorado";
    if (topico === "payment") resultado = await tratarPagamento(schema, id);
    else if (topico === "subscription_preapproval" || topico === "preapproval") resultado = await tratarAssinatura(schema, id);
    else if (topico === "subscription_authorized_payment" || topico === "authorized_payment") resultado = await tratarCobrancaAutorizada(schema, id);
    console.log("mp-webhook-conta", schema, topico, id, resultado);
    return ok(resultado);
  } catch (e) {
    console.error("mp-webhook-conta erro", String((e as { message?: string })?.message || e));
    return ok("erro");
  }
});
