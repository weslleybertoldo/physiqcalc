import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
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
// mesma coisa, tipada como string (pra comparar com "staging" sem o TS reclamar)
function schemaAtual(): string { return schemaCtx.getStore() || "public"; }
function ehStaging(): boolean { return schemaAtual() === "staging"; }

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
const TZ = "America/Sao_Paulo";

// staging sempre usa credencial de TESTE; public exige PROD (fail-secure: sem fallback
// pra TEST — senão aluno real "pagaria" um Pix de sandbox e o mês constaria pago sem dinheiro)
function mpToken(): string {
  const test = Deno.env.get("MP_ACCESS_TOKEN_TEST") || "";
  const prod = Deno.env.get("MP_ACCESS_TOKEN_PROD") || "";
  if (ehStaging()) return test;
  return prod;
}
function usingTestToken(): boolean {
  return mpToken().startsWith("TEST-");
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
}
// storage não depende do schema — bucket por ambiente
function storageClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}
function bucketComprovantes(): string {
  return ehStaging() ? "comprovantes-staging" : "comprovantes";
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

// JWT validado LOCALMENTE (JWKS do GoTrue, cacheado no isolate) — poupa a ida ao /auth/v1/user
// na VM Nano a cada chamada. Token que o JWKS não reconhece cai no getUser (compatibilidade).
// Sessão revogada só é percebida quando o token expira (1 h) — por isso as funções destrutivas
// (delete) continuam com getUser sempre.
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
async function usuarioDoToken(token: string, auth: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" });
    if (payload.sub) {
      const p = payload as Record<string, unknown>;
      return { id: payload.sub, email: (p.email as string | undefined) ?? null, app_metadata: (p.app_metadata as Record<string, unknown>) ?? {}, user_metadata: (p.user_metadata as Record<string, unknown>) ?? {} };
    }
  } catch (_e) { /* assinatura/alg/kid desconhecido → getUser */ }
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

async function requireUser(req: Request): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const user = await usuarioDoToken(token, auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const allowed = await checkRateLimit(user.id, "mp-payments", 30, 60);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

// ---- SaaS (12/09/2026): papéis e escopo ----
type Papel = "master" | "professor";
function papelDe(role: unknown): Papel | null {
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return null;
}
// professor só enxerga aluno com professor_id = ele; master enxerga todos
async function alunoDoProfessor(admin: any, user: any, alunoId: string): Promise<boolean> {
  if (user?.papel === "master") return true;
  if (user?.papel !== "professor") return false;
  const { data } = await admin.from("physiq_profiles").select("professor_id").eq("id", alunoId).maybeSingle();
  return (data as any)?.professor_id === user.id;
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
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesLabel(mesRef: string): string {
  const [y, m] = mesRef.split("-");
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[parseInt(m, 10) - 1]}/${y}`;
}

// ---- datas (yyyy-mm-dd) ----
function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function addDias(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
// +1 mês com clamp de dia (31/01 → 28/02)
function addMes(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  const dia = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return x.toISOString().slice(0, 10);
}
function diffDias(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
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
    .select("mp_preapproval_id, created_at").eq("user_id", userId).eq("contexto", "aluno")
    .eq("status", "authorized").order("created_at", { ascending: false }).limit(1);
  const a = ((data as any[]) || [])[0];
  if (!a) return null;
  const next = await proximaCobranca(a);
  return new Date(next || a.created_at).getUTCDate();
}

// data que conta pra cobertura: pix_manual = quando o aluno avisou (created_at), demais = aprovação (updated_at)
function dataCobertura(p: any): Date {
  return new Date(p.tipo === "pix_manual" ? p.created_at : (p.updated_at || p.created_at));
}

// datas dos pagamentos aprovados do ALUNO (base da cobertura), mais antigos primeiro
async function datasPagamentosAprovados(userId: string): Promise<Date[]> {
  const admin = adminClient();
  const { data } = await admin.from("physiq_pagamentos")
    .select("created_at, updated_at, tipo")
    .eq("user_id", userId).eq("status", "approved").eq("contexto", "aluno")
    .order("created_at", { ascending: true }).limit(48);
  return ((data as any[]) || []).map(dataCobertura);
}

// cobertura sequencial (regras em cobertura.ts): atraso move o vencimento; adiantado preserva
// o dia; com assinatura ativa o avulso de reposição cobre só até a próxima cobrança do ciclo.
// pago_ate = null → nunca pagou (ou tudo reembolsado)
async function getPagoAte(userId: string, anchorDay: number | null = null): Promise<Date | null> {
  return calcCobertura(await datasPagamentosAprovados(userId), anchorDay);
}

// fallback sem consultar o MP: mesmo dia/hora da adesão no próximo ciclo
function proximaCobrancaFallback(createdAt: string): string {
  const adesao = new Date(createdAt);
  const agora = new Date();
  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), adesao.getUTCDate(), adesao.getUTCHours(), adesao.getUTCMinutes()));
  if (alvo <= agora) alvo.setUTCMonth(alvo.getUTCMonth() + 1);
  return alvo.toISOString();
}

// próxima cobrança da assinatura: data real do MP; fallback = mesmo dia da adesão no mês seguinte
async function proximaCobranca(ass: { mp_preapproval_id?: string | null; created_at: string }): Promise<string | null> {
  if (ass.mp_preapproval_id) {
    const { status, body } = await mpFetch(`/preapproval/${ass.mp_preapproval_id}`);
    const next = body?.next_payment_date || body?.auto_recurring?.next_payment_date || body?.summarized?.next_payment_date;
    if (status === 200 && next) return next;
  }
  return proximaCobrancaFallback(ass.created_at);
}

// e-mail do pagador: com credencial de TESTE o MP exige comprador de teste
function payerEmail(realEmail: string): string {
  if (usingTestToken()) return Deno.env.get("MP_TEST_PAYER_EMAIL") || realEmail;
  return realEmail;
}

// ---- cobrança do PROFESSOR (pós-pago): efeito de um pagamento aprovado ----
// adesao: ativa a conta e abre o 1º ciclo de 30 dias (paga no fim, pelo mês usado).
// mensal: fecha o ciclo → próximo ciclo a partir do vencimento (ou de hoje, se atrasou — mesma régua do aluno).
// anual: 12 meses de acesso a partir da aprovação.
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

// professor + plano + regras gerais (null = não é professor)
async function getPlanoProfessor(admin: any, userId: string) {
  const { data: p } = await admin.from("physiq_professores")
    .select("id, nome, email, status, codigo_convite, plano_id, trial_ate, adesao_paga_em, ciclo_inicio, ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada, acesso_liberado_ate, alunos_bloqueados_em")
    .eq("id", userId).maybeSingle();
  if (!p) return null;
  const [plRes, cfgRes, alunosRes] = await Promise.all([
    (p as any).plano_id
      ? admin.from("physiq_planos_professor").select("id, nome, min_alunos, max_alunos, valor_mensal, valor_anual, ativo").eq("id", (p as any).plano_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("app_config").select("key, value").in("key", ["adesao_professor", "tolerancia_dias", "trial_dias"]),
    admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", userId),
  ]);
  const conf = Object.fromEntries(((cfgRes.data as any[]) || []).map((r) => [r.key, Number(r.value)]));
  return {
    ...(p as any),
    plano: plRes.data as any,
    adesao: Number.isFinite(conf.adesao_professor) ? conf.adesao_professor : 500,
    tolerancia: Number.isFinite(conf.tolerancia_dias) ? conf.tolerancia_dias : 7,
    trial_dias: Number.isFinite(conf.trial_dias) ? conf.trial_dias : 14,
    alunos: alunosRes.count ?? 0,
  };
}

// modo de cobrança do ALUNO = integração do professor dele
async function modoCobrancaAluno(admin: any, professorId: string | null) {
  if (!professorId) return { modo: "none" as const, professor: null };
  const [profRes, integRes] = await Promise.all([
    admin.from("physiq_professores").select("id, nome, pix_tipo, pix_chave, pix_favorecido, pix_banco, pix_exibir, alunos_bloqueados_em, alunos_bloqueados_msg").eq("id", professorId).maybeSingle(),
    admin.from("physiq_integracoes").select("tipo").eq("professor_id", professorId).maybeSingle(),
  ]);
  const prof = profRes.data as any;
  if (!prof) return { modo: "none" as const, professor: null };
  const tipo = (integRes.data as any)?.tipo ?? "pix_manual";
  const pix = prof.pix_exibir && prof.pix_chave
    ? { tipo: prof.pix_tipo, chave: prof.pix_chave, favorecido: prof.pix_favorecido || prof.nome, banco: prof.pix_banco }
    : null;
  const modo: "mercadopago" | "pix_manual" | "none" = tipo === "mercadopago" ? "mercadopago" : (tipo === "pix_manual" && pix ? "pix_manual" : "none");
  return { modo, professor: { id: prof.id, nome: prof.nome, pix, alunosBloqueados: !!prof.alunos_bloqueados_em, alunosBloqueadosMsg: prof.alunos_bloqueados_msg } };
}

// cria pagamento no MP (pix ou cartão) e grava a linha; reusa Pix pendente equivalente
async function criarPagamentoMp(admin: any, o: {
  userId: string; email: string; valor: number; descricao: string; metodo: "pix" | "cartao";
  cardToken?: string; paymentMethodId?: string; issuerId?: unknown; contexto: "aluno" | "plano_professor";
  tipoCobranca: "mensal" | "adesao" | "anual"; mesRef: string; planoId?: string | null;
}): Promise<{ pagamento?: any; reused?: boolean; simulado?: boolean; status_detail?: string | null; erro?: string; http?: number }> {
  const extRef = `${currentSchema()}:${o.userId}:${o.mesRef}:${o.contexto}:${o.tipoCobranca}`;
  if (o.metodo === "pix") {
    const { data: existing } = await admin.from("physiq_pagamentos")
      .select("id, status, pix_qr_code, pix_qr_code_base64, pix_expira_em, mp_payment_id, valor, contexto, tipo_cobranca")
      .eq("user_id", o.userId).eq("tipo", "pix").eq("status", "pending").eq("contexto", o.contexto)
      .order("created_at", { ascending: false }).limit(1);
    const ex = ((existing as any[]) || [])[0];
    if (ex?.pix_qr_code && Number(ex.valor) === o.valor && (ex.tipo_cobranca ?? "mensal") === o.tipoCobranca) {
      if (String(ex.mp_payment_id).startsWith("sim-")) return { pagamento: ex, reused: true, simulado: true }; // staging simulado
      const { status, body: pay } = await mpFetch(`/v1/payments/${ex.mp_payment_id}`);
      if (status === 200 && pay?.status === "pending") return { pagamento: ex, reused: true };
      await admin.from("physiq_pagamentos").update({ status: (status === 200 && pay?.status) || "cancelled", updated_at: new Date().toISOString() }).eq("id", ex.id);
    }
    const expiraDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const expira = expiraDate.toISOString().replace("Z", "-00:00");
    const { status, body: pay } = await mpFetch("/v1/payments", {
      method: "POST",
      headers: { "X-Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        transaction_amount: o.valor, description: o.descricao, payment_method_id: "pix",
        payer: { email: payerEmail(o.email) }, external_reference: extRef,
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`, date_of_expiration: expira,
      }),
    });
    if (status >= 300 || !pay?.id) {
      console.error("mp pix fail", status, JSON.stringify(pay).slice(0, 500));
      // SÓ STAGING: o sandbox do MP cai com 500 de vez em quando (12/09/2026 caiu o dia todo) → Pix simulado,
      // sem QR real, pra manter os testes do fluxo (pendente → plano-simular-aprovacao). Produção NUNCA simula.
      if (ehStaging() && status >= 500) {
        const expiraSim = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: simulado, error: simErr } = await admin.from("physiq_pagamentos").insert({
          user_id: o.userId, tipo: "pix", metodo: "simulado", valor: o.valor, mes_ref: o.mesRef, contexto: o.contexto, tipo_cobranca: o.tipoCobranca, plano_id: o.planoId ?? null,
          mp_payment_id: `sim-${crypto.randomUUID()}`, status: "pending",
          pix_qr_code: "SIMULADO-SANDBOX-MP-INDISPONIVEL", pix_qr_code_base64: null, pix_expira_em: expiraSim,
        }).select().single();
        if (simErr) throw simErr;
        return { pagamento: simulado, simulado: true };
      }
      return { erro: "mp_error", http: 502 };
    }
    const td = pay.point_of_interaction?.transaction_data || {};
    const { data: inserted, error: insErr } = await admin.from("physiq_pagamentos").insert({
      user_id: o.userId, tipo: "pix", valor: o.valor, mes_ref: o.mesRef, contexto: o.contexto, tipo_cobranca: o.tipoCobranca, plano_id: o.planoId ?? null,
      mp_payment_id: String(pay.id), status: pay.status || "pending",
      pix_qr_code: td.qr_code || null, pix_qr_code_base64: td.qr_code_base64 || null,
      pix_expira_em: pay.date_of_expiration || expiraDate.toISOString(),
    }).select().single();
    if (insErr) throw insErr;
    return { pagamento: inserted };
  }
  // cartão avulso
  if (!o.cardToken) return { erro: "missing_card_token", http: 400 };
  const payload: Record<string, unknown> = {
    transaction_amount: o.valor, token: o.cardToken, description: o.descricao, installments: 1,
    payer: { email: payerEmail(o.email) }, external_reference: extRef,
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
  };
  if (o.paymentMethodId) payload.payment_method_id = o.paymentMethodId;
  if (o.issuerId) payload.issuer_id = o.issuerId;
  const { status, body: pay } = await mpFetch("/v1/payments", {
    method: "POST", headers: { "X-Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload),
  });
  if (status >= 300 || !pay?.id) {
    console.error("mp card fail", status, JSON.stringify(pay).slice(0, 500));
    return { erro: "mp_error", http: 502 };
  }
  const { data: inserted, error: insErr } = await admin.from("physiq_pagamentos").insert({
    user_id: o.userId, tipo: "cartao", valor: o.valor, mes_ref: o.mesRef, contexto: o.contexto, tipo_cobranca: o.tipoCobranca, plano_id: o.planoId ?? null,
    mp_payment_id: String(pay.id), status: pay.status || "pending",
  }).select().single();
  if (insErr) throw insErr;
  return { pagamento: inserted, status_detail: pay.status_detail || null };
}

// re-consulta pagamentos/assinatura pendentes no MP (funciona mesmo sem webhook configurado)
async function refreshPendentes(userId: string) {
  const admin = adminClient();
  const { data: pend } = await admin.from("physiq_pagamentos")
    .select("id, mp_payment_id, status, contexto, tipo_cobranca")
    .eq("user_id", userId)
    .in("status", ["pending", "in_process"])
    .not("mp_payment_id", "is", null)
    .limit(6);
  for (const p of (pend as any[]) || []) {
    const { status, body } = await mpFetch(`/v1/payments/${p.mp_payment_id}`);
    if (status === 200 && body?.status && body.status !== p.status) {
      await admin.from("physiq_pagamentos").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (body.status === "approved" && p.contexto === "plano_professor") {
        await aplicarPagamentoPlano(admin, userId, p.tipo_cobranca, new Date(body.date_approved || Date.now()));
      }
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

// aviso de tolerância registrado ao abrir o Admin (não depende de cron): dia = dias após o vencimento (0..tolerância)
async function registrarAvisoSeDevido(admin: any, prof: any) {
  if (!prof?.ciclo_vence_em || prof.cobranca_pausada || prof.anual_ate) return;
  const hoje = hojeISO();
  if (prof.acesso_liberado_ate && prof.acesso_liberado_ate >= hoje) return;
  const dia = diffDias(hoje, prof.ciclo_vence_em);
  if (dia < 0 || dia > (prof.tolerancia ?? 7)) return;
  await admin.from("physiq_avisos_plano").upsert(
    { professor_id: prof.id, ciclo_vence_em: prof.ciclo_vence_em, dia, canal: "app" },
    { onConflict: "professor_id,ciclo_vence_em,dia,canal", ignoreDuplicates: true },
  );
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (!mpToken()) return jsonErr("mp_not_configured", 500, origin);

  const { user, error: authErr } = await requireUser(req);
  if (authErr) return authErr;
  const papel = papelDe((user.app_metadata as any)?.role);
  user.papel = papel;

  try {
    const body = await req.json();
    const action = body?.action;
    const admin = adminClient();
    const hoje = hojeISO();

    // ---- status (aba Pagamentos do aluno) ----
    if (action === "status") {
      await refreshPendentes(user.id);
      const { data: assData } = await admin.from("physiq_assinaturas").select("id, status, valor, created_at, mp_preapproval_id")
        .eq("user_id", user.id).eq("contexto", "aluno").order("created_at", { ascending: false }).limit(1);
      const assinatura = ((assData as any[]) || [])[0] || null;
      let anchorDay: number | null = null;
      if (assinatura && ["authorized", "pending"].includes(assinatura.status)) {
        assinatura.proxima_cobranca = await proximaCobranca(assinatura);
        if (assinatura.status === "authorized") {
          anchorDay = new Date(assinatura.proxima_cobranca || assinatura.created_at).getUTCDate();
        }
      }
      if (assinatura) delete assinatura.mp_preapproval_id;
      const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", user.id).maybeSingle();
      const [prof, plano, pagRes, pagoAte, modoInfo, bloqRes] = await Promise.all([
        getMensalidade(user.id),
        getPlanoNome(user.id),
        admin.from("physiq_pagamentos").select("id, tipo, metodo, valor, mes_ref, status, pix_qr_code, pix_qr_code_base64, pix_expira_em, mp_payment_id, comprovante_path, recusado_motivo, created_at, updated_at")
          .eq("user_id", user.id).eq("contexto", "aluno").order("created_at", { ascending: false }).limit(12),
        getPagoAte(user.id, anchorDay),
        modoCobrancaAluno(admin, (perfil as any)?.professor_id ?? null),
        admin.rpc("physiq_aluno_bloqueado", { uid: user.id }),
      ]);
      const pagamentos = (pagRes.data as any[]) || [];
      // em dia = SÓ cobertura vigente. Assinatura não é atalho: mês reembolsado fica
      // pendente mesmo com assinatura ativa (ela cobre só o próximo ciclo).
      const emDia = pagoAte !== null && pagoAte > new Date();
      const aguardando = pagamentos.find((p) => p.tipo === "pix_manual" && p.status === "aguardando_confirmacao") || null;
      return jsonOk({
        mensalidade: prof, plano, emDia, mesPago: emDia,
        pagoAte: pagoAte ? pagoAte.toISOString() : null,
        mesRef: mesRefAtual(), mesLabel: mesLabel(mesRefAtual()),
        assinatura, pagamentos,
        modo: modoInfo.modo, professor: modoInfo.professor, aguardandoConfirmacao: aguardando,
        bloqueadoPeloMaster: bloqRes.data === true,
      }, origin);
    }

    // ---- status-lite (abertura do app: badge "!" no header + aviso "Parcela pendente") ----
    // Só banco — sem refreshPendentes nem ida ao Mercado Pago (isso fica pro `status` da aba
    // Pagamentos, que espelha o resultado no cache do app). Mesma régua de cobertura;
    // âncora do ciclo = fallback do dia da adesão. Contrato aditivo: `status` continua igual.
    if (action === "status-lite") {
      // leituras em paralelo = 1 ida ao banco em vez de várias (a VM Nano cobra caro por ida)
      const [assRes, mensalidade, datas, bloqRes] = await Promise.all([
        admin.from("physiq_assinaturas").select("status, created_at")
          .eq("user_id", user.id).eq("contexto", "aluno").order("created_at", { ascending: false }).limit(1),
        getMensalidade(user.id),
        datasPagamentosAprovados(user.id),
        admin.rpc("physiq_aluno_bloqueado", { uid: user.id }),
      ]);
      const ultimaAss = ((assRes.data as any[]) || [])[0] || null;
      const anchorLite = ultimaAss?.status === "authorized"
        ? new Date(proximaCobrancaFallback(ultimaAss.created_at)).getUTCDate()
        : null;
      const pagoAte = calcCobertura(datas, anchorLite);
      const emDia = pagoAte !== null && pagoAte > new Date();
      return jsonOk({
        mensalidade, emDia, mesPago: emDia,
        pagoAte: pagoAte ? pagoAte.toISOString() : null,
        mesRef: mesRefAtual(), mesLabel: mesLabel(mesRefAtual()),
        bloqueadoPeloMaster: bloqRes.data === true,
      }, origin);
    }

    // ---- Pix avulso do ALUNO (cobre 1 mês a partir do pagamento) — só alunos do Mercado Pago ----
    if (action === "create-pix" || action === "create-card-payment") {
      const valor = await getMensalidade(user.id);
      if (!valor) return jsonErr("sem_mensalidade", 400, origin);
      const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", user.id).maybeSingle();
      const { modo } = await modoCobrancaAluno(admin, (perfil as any)?.professor_id ?? null);
      if (modo !== "mercadopago") return jsonErr("modo_nao_mercadopago", 400, origin);
      const mesRef = mesRefAtual();
      // cobertura vigente? não deixa pagar de novo antes de vencer (reembolso derruba a
      // cobertura → reposição liberada na hora, mesmo com assinatura ativa)
      const pagoAte = await getPagoAte(user.id, await getAnchorDay(user.id));
      if (pagoAte && pagoAte > new Date()) return jsonErr("ainda_coberto", 400, origin);
      const r = await criarPagamentoMp(admin, {
        userId: user.id, email: user.email, valor, descricao: `Mensalidade PhysiqCalc — ${mesLabel(mesRef)}`,
        metodo: action === "create-pix" ? "pix" : "cartao", cardToken: body?.card_token, paymentMethodId: body?.payment_method_id, issuerId: body?.issuer_id,
        contexto: "aluno", tipoCobranca: "mensal", mesRef,
      });
      if (r.erro) return jsonErr(r.erro, r.http ?? 502, origin);
      return jsonOk({ pagamento: r.pagamento, reused: r.reused ?? false, status_detail: r.status_detail ?? null }, origin);
    }

    // ---- assinatura recorrente do ALUNO no cartão ----
    if (action === "create-subscription") {
      const cardToken = body?.card_token;
      if (!cardToken || typeof cardToken !== "string") return jsonErr("missing_card_token", 400, origin);
      const valor = await getMensalidade(user.id);
      if (!valor) return jsonErr("sem_mensalidade", 400, origin);
      const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", user.id).maybeSingle();
      const { modo } = await modoCobrancaAluno(admin, (perfil as any)?.professor_id ?? null);
      if (modo !== "mercadopago") return jsonErr("modo_nao_mercadopago", 400, origin);

      const { data: ativa } = await admin.from("physiq_assinaturas")
        .select("id").eq("user_id", user.id).eq("contexto", "aluno").in("status", ["authorized", "pending"]).limit(1);
      if (((ativa as any[]) || []).length > 0) return jsonErr("assinatura_ja_ativa", 400, origin);

      // cobertura rolling vigente? 1ª cobrança quando ela termina (ex.: avulso dia 15 →
      // assinou até 15 do mês seguinte → cobra dia 15 e recorre nesse dia). Vencido → cobra na hora.
      const pagoAteSub = await getPagoAte(user.id);
      const startDate: string | null = pagoAteSub && pagoAteSub > new Date() ? pagoAteSub.toISOString() : null;

      const { status, body: pre } = await mpFetch("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: "Mensalidade PhysiqCalc",
          external_reference: `${currentSchema()}:${user.id}::aluno:mensal`,
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
        user_id: user.id, mp_preapproval_id: String(pre.id), status: pre.status || "pending", valor, contexto: "aluno",
      }).select().single();
      if (insErr) throw insErr;

      // 1ª cobrança da assinatura pode levar minutos; o mês fica pago via webhook/refresh
      return jsonOk({ assinatura: inserted, primeira_cobranca: startDate }, origin);
    }

    // ---- cancelar assinatura (aluno: contexto aluno; professor: plano) ----
    if (action === "cancel-subscription" || action === "plano-cancelar-assinatura") {
      const contexto = action === "cancel-subscription" ? "aluno" : "plano_professor";
      const { data: ativa } = await admin.from("physiq_assinaturas")
        .select("id, mp_preapproval_id").eq("user_id", user.id).eq("contexto", contexto).in("status", ["authorized", "pending", "paused"])
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
      // dono vê o próprio; master vê qualquer um; professor vê os dos alunos dele
      const { data: row } = await admin.from("physiq_pagamentos").select("*").eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      const dono = (row as any).user_id === user.id;
      if (!dono && !(await alunoDoProfessor(admin, user, (row as any).user_id))) return jsonErr("not_found", 404, origin);
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
            if (pay.status === "approved" && (row as any).contexto === "plano_professor") {
              await aplicarPagamentoPlano(admin, (row as any).user_id, (row as any).tipo_cobranca, new Date(pay.date_approved || Date.now()));
            }
          }
        }
      }
      return jsonOk({ pagamento: row, mp }, origin);
    }

    // ---- Pix MANUAL do aluno (chave do professor): "já paguei" com comprovante obrigatório ----
    if (action === "pix-manual-avisar") {
      const path = typeof body?.comprovante_path === "string" ? body.comprovante_path.trim() : "";
      if (!path) return jsonErr("missing_comprovante", 400, origin);
      const valor = await getMensalidade(user.id);
      if (!valor) return jsonErr("sem_mensalidade", 400, origin);
      const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", user.id).maybeSingle();
      const professorId = (perfil as any)?.professor_id as string | null;
      if (!professorId) return jsonErr("sem_professor", 400, origin);
      // só a própria pasta: prof/<professor>/<aluno>/...
      if (!path.startsWith(`prof/${professorId}/${user.id}/`) || path.includes("..")) return jsonErr("comprovante_fora_da_pasta", 403, origin);
      const { data: bloq } = await admin.rpc("physiq_aluno_bloqueado", { uid: user.id });
      if (bloq === true) return jsonErr("bloqueado_pelo_master", 403, origin);
      const mesRef = mesRefAtual();
      // um aviso pendente por vez: troca o comprovante do pendente em vez de empilhar
      const { data: pend } = await admin.from("physiq_pagamentos").select("id").eq("user_id", user.id).eq("tipo", "pix_manual").eq("status", "aguardando_confirmacao").limit(1);
      const pendente = ((pend as any[]) || [])[0];
      if (pendente) {
        const { data: up, error: upErr } = await admin.from("physiq_pagamentos").update({ comprovante_path: path, valor, updated_at: new Date().toISOString() }).eq("id", pendente.id).select().single();
        if (upErr) throw upErr;
        return jsonOk({ pagamento: up, atualizado: true }, origin);
      }
      const { data: inserted, error: insErr } = await admin.from("physiq_pagamentos").insert({
        user_id: user.id, tipo: "pix_manual", metodo: "pix", valor, mes_ref: mesRef, status: "aguardando_confirmacao",
        contexto: "aluno", comprovante_path: path,
      }).select().single();
      if (insErr) throw insErr;
      return jsonOk({ pagamento: inserted }, origin);
    }

    // ---- URL assinada do comprovante (dono, professor do aluno ou master) ----
    if (action === "comprovante-url") {
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, user_id, comprovante_path").eq("id", pagamentoId).maybeSingle();
      if (!row || !(row as any).comprovante_path) return jsonErr("not_found", 404, origin);
      const dono = (row as any).user_id === user.id;
      if (!dono && !(await alunoDoProfessor(admin, user, (row as any).user_id))) return jsonErr("not_found", 404, origin);
      const { data: signed, error: sErr } = await storageClient().storage.from(bucketComprovantes()).createSignedUrl((row as any).comprovante_path, 300);
      if (sErr || !signed?.signedUrl) return jsonErr("storage_error", 502, origin);
      return jsonOk({ url: signed.signedUrl, expiraEm: 300 }, origin);
    }

    // ================= ações de STAFF (professor nos alunos dele; master em todos) =================
    if (action === "admin-badges") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      // cobertura sequencial → 90 dias de histórico dão folga pra atraso/adiantamento encadeado.
      // Sem atalho de assinante: mês reembolsado aparece pendente mesmo com assinatura ativa.
      const corte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      let profsQ = admin.from("physiq_profiles").select("id, mensalidade_valor, cobranca_pausada").not("mensalidade_valor", "is", null);
      if (papel === "professor") profsQ = profsQ.eq("professor_id", user.id);
      const profs = await profsQ;
      const ids = ((profs.data as any[]) || []).map((p) => p.id);
      const [pagos, aguardando] = ids.length ? await Promise.all([
        admin.from("physiq_pagamentos").select("user_id, created_at, updated_at, tipo").eq("status", "approved").eq("contexto", "aluno").gte("updated_at", corte).in("user_id", ids),
        admin.from("physiq_pagamentos").select("id, user_id").eq("status", "aguardando_confirmacao").eq("tipo", "pix_manual").in("user_id", ids),
      ]) : [{ data: [] }, { data: [] }];
      const agora = new Date();
      const datasPorUser: Record<string, Date[]> = {};
      for (const p of ((pagos.data as any[]) || [])) (datasPorUser[p.user_id] ||= []).push(dataCobertura(p));
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
      const aguardandoPorUser: Record<string, string> = {};
      for (const a of ((aguardando.data as any[]) || [])) aguardandoPorUser[a.user_id] = a.id;
      return jsonOk({ badges, badgesData, aguardando: aguardandoPorUser }, origin);
    }

    // comprovantes Pix aguardando confirmação (aba Cobrança do professor)
    if (action === "admin-pix-pendentes") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      let alunosQ = admin.from("physiq_profiles").select("id, nome, email, user_code");
      if (papel === "professor") alunosQ = alunosQ.eq("professor_id", user.id);
      const alunos = await alunosQ;
      const ids = ((alunos.data as any[]) || []).map((a) => a.id);
      if (!ids.length) return jsonOk({ pendentes: [] }, origin);
      const { data } = await admin.from("physiq_pagamentos").select("id, user_id, valor, mes_ref, comprovante_path, created_at")
        .eq("status", "aguardando_confirmacao").eq("tipo", "pix_manual").in("user_id", ids).order("created_at", { ascending: true }).limit(100);
      const nome = new Map(((alunos.data as any[]) || []).map((a) => [a.id, a]));
      return jsonOk({ pendentes: ((data as any[]) || []).map((p) => ({ ...p, aluno: nome.get(p.user_id) || null })) }, origin);
    }

    // professor confirma / recusa o Pix manual do aluno
    if (action === "admin-confirmar-pix" || action === "admin-recusar-pix") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, user_id, tipo, status").eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if (!(await alunoDoProfessor(admin, user, (row as any).user_id))) return jsonErr("forbidden", 403, origin);
      if ((row as any).tipo !== "pix_manual" || (row as any).status !== "aguardando_confirmacao") return jsonErr("nao_pendente", 400, origin);
      const patch = action === "admin-confirmar-pix"
        ? { status: "approved", confirmado_por: user.id, updated_at: new Date().toISOString() }
        : { status: "rejected", confirmado_por: user.id, recusado_motivo: (typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 200) : null) || "Comprovante não confere", updated_at: new Date().toISOString() };
      const { data: up, error } = await admin.from("physiq_pagamentos").update(patch).eq("id", pagamentoId).select().single();
      if (error) throw error;
      return jsonOk({ pagamento: up }, origin);
    }

    // ---- visão do admin sobre um aluno ----
    if (action === "admin-status") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      await refreshPendentes(userId);
      const { data: assDataAdm } = await admin.from("physiq_assinaturas").select("id, status, valor, created_at, mp_preapproval_id")
        .eq("user_id", userId).eq("contexto", "aluno").order("created_at", { ascending: false }).limit(1);
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
        admin.from("physiq_profiles").select("mensalidade_valor, cobranca_pausada, professor_id").eq("id", userId).maybeSingle(),
        admin.from("physiq_pagamentos").select("id, tipo, metodo, valor, mes_ref, status, mp_payment_id, pix_expira_em, comprovante_path, recusado_motivo, created_at, updated_at")
          .eq("user_id", userId).eq("contexto", "aluno").order("created_at", { ascending: false }).limit(24),
        getPagoAte(userId, anchorDayAdm),
      ]);
      const modoInfo = await modoCobrancaAluno(admin, (profRow.data as any)?.professor_id ?? null);
      const pagamentos = (pagRes.data as any[]) || [];
      const valorProf = (profRow.data as any)?.mensalidade_valor;
      const mensalidadeAdm = typeof valorProf === "number" && valorProf > 0 ? valorProf : null;
      const pausada = Boolean((profRow.data as any)?.cobranca_pausada);
      // em dia = SÓ cobertura vigente (reembolso derruba na hora, assinatura não mascara)
      const emDia = pagoAte !== null && pagoAte > new Date();
      return jsonOk({
        mensalidade: mensalidadeAdm, pausada, emDia, mesPago: emDia,
        pagoAte: pagoAte ? pagoAte.toISOString() : null,
        assinatura: assinaturaAdm, pagamentos, modo: modoInfo.modo,
      }, origin);
    }

    // ---- admin cancela a assinatura de um aluno ----
    if (action === "admin-cancel-subscription") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const { data: ativa } = await admin.from("physiq_assinaturas")
        .select("id, mp_preapproval_id").eq("user_id", userId).eq("contexto", "aluno").in("status", ["authorized", "pending", "paused"])
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
      if (!papel) return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      const pausar = Boolean(body?.pausar);
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const { error } = await admin.from("physiq_profiles").update({ cobranca_pausada: pausar }).eq("id", userId);
      if (error) throw error;
      return jsonOk({ ok: true, pausada: pausar }, origin);
    }

    // ---- admin registra pagamento manual (ex.: dinheiro vivo) ----
    if (action === "admin-registrar-pagamento") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const userId = body?.userId;
      const dataPagamento = body?.dataPagamento; // yyyy-mm-dd
      const metodo = typeof body?.metodo === "string" ? body.metodo.trim().slice(0, 40) : "";
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
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
        mes_ref: `${dataPagamento.slice(0, 7)}-01`, contexto: "aluno",
        status: "approved", created_at: iso, updated_at: iso, confirmado_por: user.id,
      }).select().single();
      if (insErr) throw insErr;
      return jsonOk({ pagamento: inserted }, origin);
    }

    // ---- admin remove um pagamento manual (cobertura recua → volta a pendente/cobrança) ----
    if (action === "admin-remover-pagamento-manual") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, tipo, user_id, contexto").eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if ((row as any).contexto !== "aluno" || !(await alunoDoProfessor(admin, user, (row as any).user_id))) return jsonErr("forbidden", 403, origin);
      if ((row as any).tipo !== "manual") return jsonErr("nao_manual", 400, origin);
      const { error: delErr } = await admin.from("physiq_pagamentos").delete().eq("id", pagamentoId);
      if (delErr) throw delErr;
      return jsonOk({ ok: true }, origin);
    }

    // ---- admin reembolsa um pagamento (total) ----
    if (action === "admin-refund") {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const pagamentoId = body?.pagamentoId;
      if (!pagamentoId || typeof pagamentoId !== "string") return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, mp_payment_id, status, valor, user_id, contexto")
        .eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if ((row as any).contexto !== "aluno" || !(await alunoDoProfessor(admin, user, (row as any).user_id))) return jsonErr("forbidden", 403, origin);
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

    // ================= PLANO do PROFESSOR (pós-pago, pago ao master pelo Mercado Pago) =================
    // Todas exigem papel (professor ou master). O professor TRAVADO passa (é aqui que ele paga).
    if (typeof action === "string" && action.startsWith("plano-")) {
      if (!papel) return jsonErr("forbidden", 403, origin);
      const prof = await getPlanoProfessor(admin, user.id);
      if (!prof) return jsonErr("nao_professor", 404, origin);
      const isento = papel === "master"; // o master não paga plano (é dele)

      if (action === "plano-status") {
        await refreshPendentes(user.id);
        await registrarAvisoSeDevido(admin, prof);
        const [okRes, pagRes, assRes, avisosRes, planosRes] = await Promise.all([
          admin.rpc("physiq_professor_acesso_ok", { pid: user.id }),
          admin.from("physiq_pagamentos").select("id, tipo, metodo, valor, mes_ref, status, tipo_cobranca, pix_qr_code, pix_qr_code_base64, pix_expira_em, mp_payment_id, created_at, updated_at")
            .eq("user_id", user.id).eq("contexto", "plano_professor").order("created_at", { ascending: false }).limit(12),
          admin.from("physiq_assinaturas").select("id, status, valor, created_at, mp_preapproval_id")
            .eq("user_id", user.id).eq("contexto", "plano_professor").order("created_at", { ascending: false }).limit(1),
          admin.from("physiq_avisos_plano").select("id, ciclo_vence_em, dia, canal, mensagem, enviado_em")
            .eq("professor_id", user.id).order("enviado_em", { ascending: false }).limit(10),
          admin.from("physiq_planos_professor").select("id, nome, min_alunos, max_alunos, valor_mensal, valor_anual, ordem, ativo").eq("ativo", true).order("ordem"),
        ]);
        const assinatura = ((assRes.data as any[]) || [])[0] || null;
        if (assinatura && ["authorized", "pending"].includes(assinatura.status)) assinatura.proxima_cobranca = await proximaCobranca(assinatura);
        if (assinatura) delete assinatura.mp_preapproval_id;
        const acessoOk = isento || okRes.data === true;
        const diasAtraso = prof.ciclo_vence_em ? diffDias(hoje, prof.ciclo_vence_em) : null;
        return jsonOk({
          isento, professor: prof, plano: prof.plano, planos: planosRes.data ?? [],
          adesao: prof.adesao, tolerancia: prof.tolerancia, trialDias: prof.trial_dias,
          acessoOk, travado: !acessoOk, diasAtraso,
          pagamentos: pagRes.data ?? [], assinatura, avisos: avisosRes.data ?? [], hoje,
        }, origin);
      }

      if (isento) return jsonErr("master_isento", 400, origin);
      if (!prof.plano) return jsonErr("sem_plano", 400, origin);
      const valorMensal = Number(prof.ciclo_valor ?? prof.plano.valor_mensal);
      const valorAnual = Number(prof.plano.valor_anual ?? Number(prof.plano.valor_mensal) * 10);
      const metodo: "pix" | "cartao" = body?.metodo === "cartao" ? "cartao" : "pix";
      const cobrar = (valor: number, tipoCobranca: "adesao" | "mensal" | "anual", descricao: string) => criarPagamentoMp(admin, {
        userId: user.id, email: user.email, valor, descricao, metodo, cardToken: body?.card_token, paymentMethodId: body?.payment_method_id, issuerId: body?.issuer_id,
        contexto: "plano_professor", tipoCobranca, mesRef: mesRefAtual(), planoId: prof.plano.id,
      });
      const responder = async (r: Awaited<ReturnType<typeof criarPagamentoMp>>, tipoCobranca: string) => {
        if (r.erro) return jsonErr(r.erro, r.http ?? 502, origin);
        // cartão aprovado na hora → aplica já (o webhook também chega, idempotente pelo mp_payment_id)
        if (r.pagamento?.status === "approved") await aplicarPagamentoPlano(admin, user.id, tipoCobranca, new Date());
        return jsonOk({ pagamento: r.pagamento, reused: r.reused ?? false, simulado: r.simulado ?? false, status_detail: r.status_detail ?? null }, origin);
      };

      // troca de plano ANTES da exigência de ter plano: professor sem plano (master zerou) escolhe o dele por aqui.
      // Upgrade vale na hora; downgrade só se os alunos couberem. Preço novo vale a partir do próximo ciclo.
      if (action === "plano-mudar") {
        const planoId = body?.planoId;
        if (!planoId || typeof planoId !== "string") return jsonErr("missing_planoId", 400, origin);
        const { data: novo } = await admin.from("physiq_planos_professor").select("id, nome, max_alunos, valor_mensal, ativo").eq("id", planoId).maybeSingle();
        if (!novo || !(novo as any).ativo) return jsonErr("plano_invalido", 400, origin);
        if ((novo as any).id === prof.plano_id) return jsonErr("mesmo_plano", 400, origin);
        const { count } = await admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", user.id).neq("status", "bloqueado");
        if ((novo as any).max_alunos !== null && (count ?? 0) > (novo as any).max_alunos) return jsonErr("alunos_acima_do_limite", 400, origin);
        const { error: upErr } = await admin.from("physiq_professores").update({ plano_id: (novo as any).id }).eq("id", user.id);
        if (upErr) throw upErr;
        await admin.from("physiq_planos_professor_hist").insert({
          plano_id: (novo as any).id, professor_id: user.id, alterado_por: user.id,
          antes: { plano_id: prof.plano_id, plano: prof.plano?.nome ?? null }, depois: { plano_id: (novo as any).id, plano: (novo as any).nome },
        });
        // assinatura ativa acompanha o novo valor (best effort)
        const { data: ass } = await admin.from("physiq_assinaturas").select("id, mp_preapproval_id").eq("user_id", user.id).eq("contexto", "plano_professor").eq("status", "authorized").limit(1);
        const a = ((ass as any[]) || [])[0];
        let assinaturaAtualizada: boolean | null = null;
        if (a?.mp_preapproval_id) {
          const { status } = await mpFetch(`/preapproval/${a.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: Number((novo as any).valor_mensal) } }) });
          assinaturaAtualizada = status < 300;
          if (assinaturaAtualizada) await admin.from("physiq_assinaturas").update({ valor: Number((novo as any).valor_mensal), updated_at: new Date().toISOString() }).eq("id", a.id);
          else await admin.from("physiq_integracoes").upsert({ professor_id: user.id, config: { recriar_assinatura: true } }, { onConflict: "professor_id" });
        }
        return jsonOk({ ok: true, plano: novo, assinaturaAtualizada }, origin);
      }

      // adesão única: ativa a conta; o ciclo de 30 dias começa e a mensalidade é paga no fim (pós-pago)
      if (action === "plano-ativar") {
        if (prof.adesao_paga_em) return jsonErr("ja_ativado", 400, origin);
        return await responder(await cobrar(Number(prof.adesao), "adesao", "PhysiqCalc — Adesão do professor"), "adesao");
      }
      // fecha o ciclo em uso (só a partir de 3 dias antes do vencimento)
      if (action === "plano-pagar-ciclo") {
        if (!prof.adesao_paga_em || !prof.ciclo_vence_em) return jsonErr("ative_primeiro", 400, origin);
        if (diffDias(prof.ciclo_vence_em, hoje) > 3) return jsonErr("ainda_no_ciclo", 400, origin);
        return await responder(await cobrar(valorMensal, "mensal", `PhysiqCalc — Plano ${prof.plano.nome} (ciclo ${prof.ciclo_inicio} a ${prof.ciclo_vence_em})`), "mensal");
      }
      // anual = 10 mensalidades, 12 meses de acesso
      if (action === "plano-anual") {
        return await responder(await cobrar(valorAnual, "anual", `PhysiqCalc — Plano ${prof.plano.nome} anual`), "anual");
      }
      // assinatura recorrente no cartão: 1ª cobrança no fim do ciclo atual
      if (action === "plano-assinar") {
        const cardToken = body?.card_token;
        if (!cardToken || typeof cardToken !== "string") return jsonErr("missing_card_token", 400, origin);
        if (!prof.adesao_paga_em) return jsonErr("ative_primeiro", 400, origin);
        const { data: ativa } = await admin.from("physiq_assinaturas").select("id").eq("user_id", user.id).eq("contexto", "plano_professor").in("status", ["authorized", "pending"]).limit(1);
        if (((ativa as any[]) || []).length > 0) return jsonErr("assinatura_ja_ativa", 400, origin);
        const inicio = prof.ciclo_vence_em && prof.ciclo_vence_em > hoje ? `${prof.ciclo_vence_em}T12:00:00.000Z` : null;
        const { status, body: pre } = await mpFetch("/preapproval", {
          method: "POST",
          body: JSON.stringify({
            reason: `PhysiqCalc — Plano ${prof.plano.nome}`,
            external_reference: `${currentSchema()}:${user.id}::plano_professor:mensal`,
            payer_email: payerEmail(user.email), card_token_id: cardToken,
            auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Number(prof.plano.valor_mensal), currency_id: "BRL", ...(inicio ? { start_date: inicio } : {}) },
            back_url: "https://physiqcalc.vercel.app/admin/planos",
            notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
            status: "authorized",
          }),
        });
        if (status >= 300 || !pre?.id) {
          console.error("mp plano-assinar fail", status, JSON.stringify(pre).slice(0, 500));
          if (usingTestToken() && status === 404) return jsonErr("assinatura_sem_sandbox", 400, origin);
          return jsonErr("mp_error", 502, origin);
        }
        const { data: inserted, error: insErr } = await admin.from("physiq_assinaturas").insert({
          user_id: user.id, mp_preapproval_id: String(pre.id), status: pre.status || "pending", valor: Number(prof.plano.valor_mensal), contexto: "plano_professor",
        }).select().single();
        if (insErr) throw insErr;
        return jsonOk({ assinatura: inserted, primeira_cobranca: inicio }, origin);
      }
      // SÓ STAGING: simula a aprovação de um pagamento do plano (token TEST não tem webhook confiável)
      if (action === "plano-simular-aprovacao") {
        if (!ehStaging()) return jsonErr("so_staging", 403, origin);
        const pagamentoId = body?.pagamentoId;
        const { data: row } = await admin.from("physiq_pagamentos").select("id, user_id, tipo_cobranca, status").eq("id", pagamentoId).eq("user_id", user.id).eq("contexto", "plano_professor").maybeSingle();
        if (!row) return jsonErr("not_found", 404, origin);
        await admin.from("physiq_pagamentos").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", (row as any).id);
        await aplicarPagamentoPlano(admin, user.id, (row as any).tipo_cobranca, new Date());
        return jsonOk({ ok: true }, origin);
      }
      return jsonErr("unknown_action", 400, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    console.error("mp-payments error", e);
    return jsonErr("internal_error", 500, origin);
  }
});
