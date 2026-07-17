import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { AsyncLocalStorage } from "node:async_hooks";
import { calcCobertura } from "./cobertura.ts";

// Ambiente: schema "public" (prod) ou "staging", resolvido por request via header x-schema.
const _ALLOWED_SCHEMAS = ["public", "staging"];
function resolveSchema(req: Request): string {
  const h = (req.headers.get("x-schema") || "public").toLowerCase();
  return _ALLOWED_SCHEMAS.includes(h) ? h : "public";
}
const schemaCtx = new AsyncLocalStorage<string>();
function currentSchema(): "public" { return (schemaCtx.getStore() || "public") as "public"; }

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc-staging.vercel.app",
  "https://physiqcalc.lovable.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonOk(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_API = "https://api.mercadopago.com";

// staging sempre usa credencial de TESTE; public exige PROD (fail-secure: sem fallback
// pra TEST — senão aluno real "pagaria" um Pix de sandbox e o mês constaria pago sem dinheiro)
function mpToken(): string {
  const test = Deno.env.get("MP_ACCESS_TOKEN_TEST") || "";
  const prod = Deno.env.get("MP_ACCESS_TOKEN_PROD") || "";
  if (currentSchema() === "staging") return test;
  return prod;
}
function usingTestToken(): boolean {
  return mpToken().startsWith("TEST-");
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
}

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId, p_endpoint: endpoint, p_max_count: maxCount, p_window_secs: windowSecs,
    });
    if (error) return true;
    return data === true;
  } catch { return true; }
}

async function requireUser(req: Request): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const allowed = await checkRateLimit(data.user.id, "mp-payments", 30, 60);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user: data.user, error: null };
}

async function mpFetch(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  // retry em 5xx (API do MP tem 500 transiente); seguro pois POSTs usam X-Idempotency-Key
  let status = 0;
  let body: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
    const res = await fetch(`${MP_API}${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${mpToken()}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    status = res.status;
    body = null;
    try { body = await res.json(); } catch { /* corpo vazio */ }
    if (status < 500) break;
  }
  return { status, body };
}

function mesRefAtual(): string {
  // primeiro dia do mês corrente em BRT
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesLabel(mesRef: string): string {
  const [y, m] = mesRef.split("-");
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[parseInt(m, 10) - 1]}/${y}`;
}

// null = sem cobrança (não configurada OU pausada pelo admin)
async function getMensalidade(userId: string): Promise<number | null> {
  const admin = adminClient();
  const { data } = await admin.from("physiq_profiles").select("mensalidade_valor, cobranca_pausada").eq("id", userId).maybeSingle();
  if ((data as any)?.cobranca_pausada) return null;
  const v = (data as any)?.mensalidade_valor;
  return typeof v === "number" && v > 0 ? v : null;
}

// nome do plano do aluno (catálogo physiq_planos; atribuição em physiq_profiles.plano_nome)
async function getPlanoNome(userId: string): Promise<string | null> {
  const admin = adminClient();
  const { data } = await admin.from("physiq_profiles").select("plano_nome").eq("id", userId).maybeSingle();
  const p = (data as any)?.plano_nome;
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

// dia do ciclo da assinatura ativa (dia da próxima cobrança no MP); null = sem assinatura ativa
async function getAnchorDay(userId: string): Promise<number | null> {
  const admin = adminClient();
  const { data } = await admin.from("physiq_assinaturas")
    .select("mp_preapproval_id, created_at").eq("user_id", userId)
    .eq("status", "authorized").order("created_at", { ascending: false }).limit(1);
  const a = ((data as any[]) || [])[0];
  if (!a) return null;
  const next = await proximaCobranca(a);
  return new Date(next || a.created_at).getUTCDate();
}

// cobertura sequencial (regras em cobertura.ts): atraso move o vencimento; adiantado preserva
// o dia; com assinatura ativa o avulso de reposição cobre só até a próxima cobrança do ciclo.
// pago_ate = null → nunca pagou (ou tudo reembolsado)
async function getPagoAte(userId: string, anchorDay: number | null = null): Promise<Date | null> {
  const admin = adminClient();
  const { data } = await admin.from("physiq_pagamentos")
    .select("created_at, updated_at")
    .eq("user_id", userId).eq("status", "approved")
    .order("created_at", { ascending: true }).limit(48);
  const datas = ((data as any[]) || []).map((p) => new Date(p.updated_at || p.created_at));
  return calcCobertura(datas, anchorDay);
}

// próxima cobrança da assinatura: data real do MP; fallback = mesmo dia da adesão no mês seguinte
async function proximaCobranca(ass: { mp_preapproval_id?: string | null; created_at: string }): Promise<string | null> {
  if (ass.mp_preapproval_id) {
    const { status, body } = await mpFetch(`/preapproval/${ass.mp_preapproval_id}`);
    const next = body?.next_payment_date || body?.auto_recurring?.next_payment_date || body?.summarized?.next_payment_date;
    if (status === 200 && next) return next;
  }
  const adesao = new Date(ass.created_at);
  const agora = new Date();
  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), adesao.getUTCDate(), adesao.getUTCHours(), adesao.getUTCMinutes()));
  if (alvo <= agora) alvo.setUTCMonth(alvo.getUTCMonth() + 1);
  return alvo.toISOString();
}

// e-mail do pagador: com credencial de TESTE o MP exige comprador de teste
function payerEmail(realEmail: string): string {
  if (usingTestToken()) return Deno.env.get("MP_TEST_PAYER_EMAIL") || realEmail;
  return realEmail;
}

// re-consulta pagamentos/assinatura pendentes no MP (funciona mesmo sem webhook configurado)
async function refreshPendentes(userId: string) {
  const admin = adminClient();
  const { data: pend } = await admin.from("physiq_pagamentos")
    .select("id, mp_payment_id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "in_process"])
    .not("mp_payment_id", "is", null)
    .limit(6);
  for (const p of (pend as any[]) || []) {
    const { status, body } = await mpFetch(`/v1/payments/${p.mp_payment_id}`);
    if (status === 200 && body?.status && body.status !== p.status) {
      await admin.from("physiq_pagamentos").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", p.id);
    }
  }
  const { data: ass } = await admin.from("physiq_assinaturas")
    .select("id, mp_preapproval_id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "authorized", "paused"])
    .not("mp_preapproval_id", "is", null)
    .limit(3);
  for (const a of (ass as any[]) || []) {
    const { status, body } = await mpFetch(`/preapproval/${a.mp_preapproval_id}`);
    if (status === 200 && body?.status && body.status !== a.status) {
      await admin.from("physiq_assinaturas").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", a.id);
    }
  }
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (!mpToken()) return jsonErr("mp_not_configured", 500, origin);

  const { user, error: authErr } = await requireUser(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const action = body?.action;
    const admin = adminClient();

    // ---- status (aba Pagamentos do aluno) ----
    if (action === "status") {
      await refreshPendentes(user.id);
      const { data: assData } = await admin.from("physiq_assinaturas").select("id, status, valor, created_at, mp_preapproval_id")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
      const assinatura = ((assData as any[]) || [])[0] || null;
      let anchorDay: number | null = null;
      if (assinatura && ["authorized", "pending"].includes(assinatura.status)) {
        assinatura.proxima_cobranca = await proximaCobranca(assinatura);
        if (assinatura.status === "authorized") {
          anchorDay = new Date(assinatura.proxima_cobranca || assinatura.created_at).getUTCDate();
        }
      }
      if (assinatura) delete assinatura.mp_preapproval_id;
      const [prof, plano, pagRes, pagoAte] = await Promise.all([
        getMensalidade(user.id),
        getPlanoNome(user.id),
        admin.from("physiq_pagamentos").select("id, tipo, metodo, valor, mes_ref, status, pix_qr_code, pix_qr_code_base64, pix_expira_em, mp_payment_id, created_at, updated_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
        getPagoAte(user.id, anchorDay),
      ]);
      const pagamentos = (pagRes.data as any[]) || [];
      // em dia = SÓ cobertura vigente. Assinatura não é atalho: mês reembolsado fica
      // pendente mesmo com assinatura ativa (ela cobre só o próximo ciclo).
      const emDia = pagoAte !== null && pagoAte > new Date();
      return jsonOk({
        mensalidade: prof, plano, emDia, mesPago: emDia,
        pagoAte: pagoAte ? pagoAte.toISOString() : null,
        mesRef: mesRefAtual(), mesLabel: mesLabel(mesRefAtual()),
        assinatura, pagamentos,
      }, origin);
    }

    // ---- Pix avulso (cobre 1 mês a partir do pagamento) ----
    if (action === "create-pix") {
      const valor = await getMensalidade(user.id);
      if (!valor) return jsonErr("sem_mensalidade", 400, origin);
      const mesRef = mesRefAtual();

      // cobertura vigente? não deixa pagar de novo antes de vencer (reembolso derruba a
      // cobertura → reposição liberada na hora, mesmo com assinatura ativa)
      const pagoAte = await getPagoAte(user.id, await getAnchorDay(user.id));
      if (pagoAte && pagoAte > new Date()) return jsonErr("ainda_coberto", 400, origin);

      // reusa pix pendente ainda válido (independente do mês)
      const { data: existing } = await admin.from("physiq_pagamentos")
        .select("id, status, pix_qr_code, pix_qr_code_base64, pix_expira_em, mp_payment_id, valor")
        .eq("user_id", user.id).eq("tipo", "pix")
        .eq("status", "pending")
        .order("created_at", { ascending: false }).limit(1);
      const ex = ((existing as any[]) || [])[0];
      if (ex?.status === "pending" && ex.pix_qr_code && Number(ex.valor) === valor) {
        const { status, body: pay } = await mpFetch(`/v1/payments/${ex.mp_payment_id}`);
        if (status === 200 && pay?.status === "pending") {
          return jsonOk({ pagamento: ex, reused: true }, origin);
        }
        await admin.from("physiq_pagamentos").update({ status: (status === 200 && pay?.status) || "cancelled", updated_at: new Date().toISOString() }).eq("id", ex.id);
      }

      const expiraDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const expira = expiraDate.toISOString().replace("Z", "-00:00");
      const { status, body: pay } = await mpFetch("/v1/payments", {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: valor,
          description: `Mensalidade PhysiqCalc — ${mesLabel(mesRef)}`,
          payment_method_id: "pix",
          payer: { email: payerEmail(user.email) },
          external_reference: `${currentSchema()}:${user.id}:${mesRef}`,
          notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
          date_of_expiration: expira,
        }),
      });
      if (status >= 300 || !pay?.id) {
        console.error("mp create-pix fail", status, JSON.stringify(pay).slice(0, 500));
        return jsonErr("mp_error", 502, origin);
      }
      const td = pay.point_of_interaction?.transaction_data || {};
      const { data: inserted, error: insErr } = await admin.from("physiq_pagamentos").insert({
        user_id: user.id, tipo: "pix", valor, mes_ref: mesRef,
        mp_payment_id: String(pay.id), status: pay.status || "pending",
        pix_qr_code: td.qr_code || null, pix_qr_code_base64: td.qr_code_base64 || null,
        pix_expira_em: pay.date_of_expiration || expiraDate.toISOString(),
      }).select().single();
      if (insErr) throw insErr;
      return jsonOk({ pagamento: inserted }, origin);
    }

    // ---- cartão avulso: paga só o mês atual ----
    if (action === "create-card-payment") {
      const cardToken = body?.card_token;
      if (!cardToken || typeof cardToken !== "string") return jsonErr("missing_card_token", 400, origin);
      const valor = await getMensalidade(user.id);
      if (!valor) return jsonErr("sem_mensalidade", 400, origin);
      const mesRef = mesRefAtual();

      const pagoAteCartao = await getPagoAte(user.id, await getAnchorDay(user.id));
      if (pagoAteCartao && pagoAteCartao > new Date()) return jsonErr("ainda_coberto", 400, origin);

      const payload: Record<string, unknown> = {
        transaction_amount: valor,
        token: cardToken,
        description: `Mensalidade PhysiqCalc — ${mesLabel(mesRef)}`,
        installments: 1,
        payer: { email: payerEmail(user.email) },
        external_reference: `${currentSchema()}:${user.id}:${mesRef}`,
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      };
      if (body?.payment_method_id && typeof body.payment_method_id === "string") payload.payment_method_id = body.payment_method_id;
      if (body?.issuer_id) payload.issuer_id = body.issuer_id;

      const { status, body: pay } = await mpFetch("/v1/payments", {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });
      if (status >= 300 || !pay?.id) {
        console.error("mp create-card-payment fail", status, JSON.stringify(pay).slice(0, 500));
        return jsonErr("mp_error", 502, origin);
      }
      const { data: inserted, error: insErr } = await admin.from("physiq_pagamentos").insert({
        user_id: user.id, tipo: "cartao", valor, mes_ref: mesRef,
        mp_payment_id: String(pay.id), status: pay.status || "pending",
      }).select().single();
      if (insErr) throw insErr;
      return jsonOk({ pagamento: inserted, status_detail: pay.status_detail || null }, origin);
    }

    // ---- assinatura recorrente no cartão ----
    if (action === "create-subscription") {
      const cardToken = body?.card_token;
      if (!cardToken || typeof cardToken !== "string") return jsonErr("missing_card_token", 400, origin);
      const valor = await getMensalidade(user.id);
      if (!valor) return jsonErr("sem_mensalidade", 400, origin);

      const { data: ativa } = await admin.from("physiq_assinaturas")
        .select("id").eq("user_id", user.id).in("status", ["authorized", "pending"]).limit(1);
      if (((ativa as any[]) || []).length > 0) return jsonErr("assinatura_ja_ativa", 400, origin);

      // cobertura rolling vigente? 1ª cobrança quando ela termina (ex.: avulso dia 15 →
      // assinou até 15 do mês seguinte → cobra dia 15 e recorre nesse dia). Vencido → cobra na hora.
      const pagoAteSub = await getPagoAte(user.id);
      const startDate: string | null = pagoAteSub && pagoAteSub > new Date() ? pagoAteSub.toISOString() : null;

      const { status, body: pre } = await mpFetch("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: "Mensalidade PhysiqCalc",
          external_reference: `${currentSchema()}:${user.id}`,
          payer_email: payerEmail(user.email),
          card_token_id: cardToken,
          auto_recurring: {
            frequency: 1, frequency_type: "months", transaction_amount: valor, currency_id: "BRL",
            ...(startDate ? { start_date: startDate } : {}),
          },
          back_url: "https://physiqcalc.vercel.app/pagamentos",
          // webhook por assinatura (config global da app só existe via painel; WAF bloqueia a API legada)
          notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
          status: "authorized",
        }),
      });
      if (status >= 300 || !pre?.id) {
        console.error("mp create-subscription fail", status, JSON.stringify(pre).slice(0, 500));
        // /preapproval não tem sandbox: com credencial TEST o MP responde 404 "Card token service not found"
        if (usingTestToken() && status === 404) return jsonErr("assinatura_sem_sandbox", 400, origin);
        return jsonErr("mp_error", 502, origin);
      }
      const { data: inserted, error: insErr } = await admin.from("physiq_assinaturas").insert({
        user_id: user.id, mp_preapproval_id: String(pre.id), status: pre.status || "pending", valor,
      }).select().single();
      if (insErr) throw insErr;

      // 1ª cobrança da assinatura pode levar minutos; o mês fica pago via webhook/refresh
      return jsonOk({ assinatura: inserted, primeira_cobranca: startDate }, origin);
    }

    // ---- cancelar assinatura ----
    if (action === "cancel-subscription") {
      const { data: ativa } = await admin.from("physiq_assinaturas")
        .select("id, mp_preapproval_id").eq("user_id", user.id).in("status", ["authorized", "pending", "paused"])
        .order("created_at", { ascending: false }).limit(1);
      const a = ((ativa as any[]) || [])[0];
      if (!a) return jsonErr("sem_assinatura", 400, origin);
      const { status } = await mpFetch(`/preapproval/${a.mp_preapproval_id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (status >= 300) return jsonErr("mp_error", 502, origin);
      await admin.from("physiq_assinaturas").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", a.id);
      return jsonOk({ ok: true }, origin);
    }

    // ---- comprovante: dados reais da transação no MP ----
    if (action === "receipt") {
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      // admin pode ver comprovante de qualquer aluno; aluno só o próprio
      const isAdmin = (user.app_metadata as any)?.role === "admin";
      let q = admin.from("physiq_pagamentos").select("*").eq("id", pagamentoId);
      if (!isAdmin) q = q.eq("user_id", user.id);
      const { data: row } = await q.maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      let mp: any = null;
      if ((row as any).mp_payment_id) {
        const { status, body: pay } = await mpFetch(`/v1/payments/${(row as any).mp_payment_id}`);
        if (status === 200 && pay) {
          // e-mail mascarado pelo MP (privacidade do Pix) não serve pra exibir
          const email = pay.payer?.email || null;
          const emailVisivel = email && !/x{3,}/i.test(email) ? email : null;
          const nomeTitular = pay.card?.cardholder?.name || null;
          const bancoPagador = pay.point_of_interaction?.transaction_data?.bank_info?.payer?.long_name || null;
          mp = {
            status: pay.status || null,
            status_detail: pay.status_detail || null,
            date_created: pay.date_created || null,
            date_approved: pay.date_approved || null,
            payment_method: pay.payment_method_id || null,
            payment_type: pay.payment_type_id || null,
            installments: pay.installments || null,
            payer_email: emailVisivel,
            payer_nome: nomeTitular,
            banco_pagador: bancoPagador,
            e2e_id: pay.point_of_interaction?.transaction_data?.e2e_id || null,
            bank_transfer_id: pay.transaction_details?.bank_transfer_id || null,
            transaction_id: pay.transaction_details?.transaction_id || null,
            card_last4: pay.card?.last_four_digits || null,
          };
          if (pay.status && pay.status !== (row as any).status) {
            await admin.from("physiq_pagamentos").update({ status: pay.status, updated_at: new Date().toISOString() }).eq("id", (row as any).id);
            (row as any).status = pay.status;
          }
        }
      }
      return jsonOk({ pagamento: row, mp }, origin);
    }

    // ---- badges pago/pendente da lista do admin ----
    if (action === "admin-badges") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      // cobertura sequencial → 90 dias de histórico dão folga pra atraso/adiantamento encadeado.
      // Sem atalho de assinante: mês reembolsado aparece pendente mesmo com assinatura ativa.
      // (Aqui não consulta o MP por user — sem âncora; diferença só em janela de reposição, aceitável pro badge.)
      const corte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const [profs, pagos] = await Promise.all([
        admin.from("physiq_profiles").select("id, mensalidade_valor, cobranca_pausada").not("mensalidade_valor", "is", null),
        admin.from("physiq_pagamentos").select("user_id, created_at, updated_at").eq("status", "approved").gte("updated_at", corte),
      ]);
      const agora = new Date();
      const datasPorUser: Record<string, Date[]> = {};
      for (const p of ((pagos.data as any[]) || [])) {
        (datasPorUser[p.user_id] ||= []).push(new Date(p.updated_at || p.created_at));
      }
      // badges = string (compatível com bundles antigos em cache/APK); badgesData = detalhe com data
      const badges: Record<string, string> = {};
      const badgesData: Record<string, { s: string; ate: string | null }> = {};
      for (const p of ((profs.data as any[]) || [])) {
        if (Number(p.mensalidade_valor) > 0 && !p.cobranca_pausada) {
          const fim = calcCobertura(datasPorUser[p.id] || [], null);
          const coberto = fim !== null && fim > agora;
          badges[p.id] = coberto ? "pago" : "pendente";
          badgesData[p.id] = { s: badges[p.id], ate: fim ? fim.toISOString() : null };
        }
      }
      return jsonOk({ badges, badgesData }, origin);
    }

    // ---- visão do admin sobre um aluno ----
    if (action === "admin-status") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      await refreshPendentes(userId);
      const { data: assDataAdm } = await admin.from("physiq_assinaturas").select("id, status, valor, created_at, mp_preapproval_id")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const assinaturaAdm = ((assDataAdm as any[]) || [])[0] || null;
      let anchorDayAdm: number | null = null;
      if (assinaturaAdm && ["authorized", "pending"].includes(assinaturaAdm.status)) {
        assinaturaAdm.proxima_cobranca = await proximaCobranca(assinaturaAdm);
        if (assinaturaAdm.status === "authorized") {
          anchorDayAdm = new Date(assinaturaAdm.proxima_cobranca || assinaturaAdm.created_at).getUTCDate();
        }
      }
      if (assinaturaAdm) delete assinaturaAdm.mp_preapproval_id;
      const [profRow, pagRes, pagoAte] = await Promise.all([
        admin.from("physiq_profiles").select("mensalidade_valor, cobranca_pausada").eq("id", userId).maybeSingle(),
        admin.from("physiq_pagamentos").select("id, tipo, metodo, valor, mes_ref, status, mp_payment_id, pix_expira_em, created_at, updated_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(24),
        getPagoAte(userId, anchorDayAdm),
      ]);
      const pagamentos = (pagRes.data as any[]) || [];
      const valorProf = (profRow.data as any)?.mensalidade_valor;
      const mensalidadeAdm = typeof valorProf === "number" && valorProf > 0 ? valorProf : null;
      const pausada = Boolean((profRow.data as any)?.cobranca_pausada);
      // em dia = SÓ cobertura vigente (reembolso derruba na hora, assinatura não mascara)
      const emDia = pagoAte !== null && pagoAte > new Date();
      return jsonOk({
        mensalidade: mensalidadeAdm, pausada, emDia, mesPago: emDia,
        pagoAte: pagoAte ? pagoAte.toISOString() : null,
        assinatura: assinaturaAdm, pagamentos,
      }, origin);
    }

    // ---- admin cancela a assinatura de um aluno ----
    if (action === "admin-cancel-subscription") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const { data: ativa } = await admin.from("physiq_assinaturas")
        .select("id, mp_preapproval_id").eq("user_id", userId).in("status", ["authorized", "pending", "paused"])
        .order("created_at", { ascending: false }).limit(1);
      const a = ((ativa as any[]) || [])[0];
      if (!a) return jsonErr("sem_assinatura", 400, origin);
      const { status } = await mpFetch(`/preapproval/${a.mp_preapproval_id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (status >= 300) return jsonErr("mp_error", 502, origin);
      await admin.from("physiq_assinaturas").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", a.id);
      return jsonOk({ ok: true }, origin);
    }

    // ---- admin pausa/reativa a cobrança de um aluno ----
    if (action === "admin-pausar-cobranca") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      const pausar = Boolean(body?.pausar);
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const { error } = await admin.from("physiq_profiles").update({ cobranca_pausada: pausar }).eq("id", userId);
      if (error) throw error;
      return jsonOk({ ok: true, pausada: pausar }, origin);
    }

    // ---- admin registra pagamento manual (ex.: dinheiro vivo) ----
    if (action === "admin-registrar-pagamento") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      const dataPagamento = body?.dataPagamento; // yyyy-mm-dd
      const metodo = typeof body?.metodo === "string" ? body.metodo.trim().slice(0, 40) : "";
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!metodo) return jsonErr("missing_metodo", 400, origin);
      if (typeof dataPagamento !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) return jsonErr("invalid_data", 400, origin);
      // meio-dia UTC evita pular de dia no fuso BRT; cobre 1 mês a partir daí (mesma régua dos demais)
      const quando = new Date(`${dataPagamento}T12:00:00Z`);
      if (isNaN(quando.getTime())) return jsonErr("invalid_data", 400, origin);
      if (quando.getTime() > Date.now() + 24 * 60 * 60 * 1000) return jsonErr("data_futura", 400, origin);
      const { data: profRow } = await admin.from("physiq_profiles").select("mensalidade_valor").eq("id", userId).maybeSingle();
      const valorBody = Number(body?.valor);
      const valor = valorBody > 0 ? valorBody : Number((profRow as any)?.mensalidade_valor);
      if (!(valor > 0)) return jsonErr("sem_valor", 400, origin);
      const iso = quando.toISOString();
      const { data: inserted, error: insErr } = await admin.from("physiq_pagamentos").insert({
        user_id: userId, tipo: "manual", metodo, valor,
        mes_ref: `${dataPagamento.slice(0, 7)}-01`,
        status: "approved", created_at: iso, updated_at: iso,
      }).select().single();
      if (insErr) throw insErr;
      return jsonOk({ pagamento: inserted }, origin);
    }

    // ---- admin remove um pagamento manual (cobertura recua → volta a pendente/cobrança) ----
    if (action === "admin-remover-pagamento-manual") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, tipo").eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if ((row as any).tipo !== "manual") return jsonErr("nao_manual", 400, origin);
      const { error: delErr } = await admin.from("physiq_pagamentos").delete().eq("id", pagamentoId);
      if (delErr) throw delErr;
      return jsonOk({ ok: true }, origin);
    }

    // ---- admin reembolsa um pagamento (total) ----
    if (action === "admin-refund") {
      const role = (user.app_metadata as any)?.role;
      if (role !== "admin") return jsonErr("forbidden", 403, origin);
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, mp_payment_id, status, valor")
        .eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if ((row as any).status !== "approved") return jsonErr("nao_reembolsavel", 400, origin);
      if (!(row as any).mp_payment_id) return jsonErr("sem_transacao_mp", 400, origin);
      const { status, body: ref } = await mpFetch(`/v1/payments/${(row as any).mp_payment_id}/refunds`, {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      if (status >= 300) {
        console.error("mp refund fail", status, JSON.stringify(ref).slice(0, 400));
        return jsonErr("mp_error", 502, origin);
      }
      await admin.from("physiq_pagamentos").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", (row as any).id);
      return jsonOk({ ok: true, refund_id: ref?.id || null }, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    console.error("mp-payments error", e);
    return jsonErr("internal_error", 500, origin);
  }
});
