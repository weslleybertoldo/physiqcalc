// master-financeiro (SaaS 12/09/2026) — SÓ MASTER: cobrança dos professores (plano pós-pago).
// actions: list | detalhe | registrar-pagamento | remover-manual | set-ciclo | pausar-cobranca | liberar-acesso-ate |
//          cancelar-assinatura | refund | reenviar-aviso | bloquear-alunos | desbloquear-alunos
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";

const _ALLOWED_SCHEMAS = ["public", "staging"];
function resolveSchema(req: Request): string {
  const h = (req.headers.get("x-schema") || "public").toLowerCase();
  return _ALLOWED_SCHEMAS.includes(h) ? h : "public";
}
const schemaCtx = new AsyncLocalStorage<string>();
function currentSchema(): "public" { return (schemaCtx.getStore() || "public") as "public"; }

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
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
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}
function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_API = "https://api.mercadopago.com";
const TZ = "America/Sao_Paulo";
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }
function mpToken(): string {
  return (schemaCtx.getStore() || "public") === "staging" ? (Deno.env.get("MP_ACCESS_TOKEN_TEST") || "") : (Deno.env.get("MP_ACCESS_TOKEN_PROD") || "");
}
async function mpFetch(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  let status = 0; let body: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
    const res = await fetch(`${MP_API}${path}`, { ...init, headers: { "Authorization": `Bearer ${mpToken()}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    status = res.status; body = null;
    try { body = await res.json(); } catch { /* vazio */ }
    if (status < 500) break;
  }
  return { status, body };
}

const janelasRate = new Map<string, number[]>();
function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): boolean {
  const agora = Date.now();
  const chave = `${endpoint}:${userId}`;
  const validos = (janelasRate.get(chave) ?? []).filter((t) => t > agora - windowSecs * 1000);
  if (validos.length >= maxCount) { janelasRate.set(chave, validos); return false; }
  validos.push(agora); janelasRate.set(chave, validos);
  return true;
}

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
async function usuarioDoToken(token: string, auth: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" });
    if (payload.sub) {
      const p = payload as Record<string, unknown>;
      return { id: payload.sub, email: (p.email as string | undefined) ?? null, app_metadata: (p.app_metadata as Record<string, unknown>) ?? {}, user_metadata: (p.user_metadata as Record<string, unknown>) ?? {} };
    }
  } catch (_e) { /* → getUser */ }
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
function papelDe(role: unknown): "master" | "professor" | null {
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return null;
}
async function requireMaster(req: Request, endpoint: string): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const user = await usuarioDoToken(auth.slice(7), auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  if (papelDe((user.app_metadata as any)?.role) !== "master") return { user: null, error: jsonErr("forbidden", 403, origin) };
  if (!checkRateLimit(user.id, endpoint, 120, 60)) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

function hojeISO(): string { return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); }
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
function diffDias(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
}
function acessoOk(p: any, tolerancia: number, hoje: string): boolean {
  if (p.status !== "ativo") return false;
  if (p.cobranca_pausada) return true;
  if (p.acesso_liberado_ate && p.acesso_liberado_ate >= hoje) return true;
  if (p.trial_ate && p.trial_ate >= hoje) return true;
  if (p.anual_ate && p.anual_ate >= hoje) return true;
  if (p.ciclo_vence_em && addDias(p.ciclo_vence_em, tolerancia) >= hoje) return true;
  return false;
}
async function tolerancia(admin: any): Promise<number> {
  const { data } = await admin.from("app_config").select("value").eq("key", "tolerancia_dias").maybeSingle();
  const n = Number((data as any)?.value);
  return Number.isFinite(n) ? n : 7;
}

// MESMA lógica do mp-payments / mp-webhook
async function aplicarPagamentoPlano(admin: any, userId: string, tipoCobranca: string | null, dataAprov: Date) {
  const { data: p } = await admin.from("physiq_professores").select("ciclo_vence_em, plano_id, adesao_paga_em").eq("id", userId).maybeSingle();
  if (!p) return;
  const hoje = dataAprov.toLocaleDateString("en-CA", { timeZone: TZ });
  const { data: pl } = (p as any).plano_id
    ? await admin.from("physiq_planos_professor").select("valor_mensal").eq("id", (p as any).plano_id).maybeSingle()
    : { data: null };
  const valorMensal = (pl as any)?.valor_mensal ?? null;
  if (tipoCobranca === "adesao") {
    await admin.from("physiq_professores").update({ adesao_paga_em: (p as any).adesao_paga_em ?? hoje, ciclo_inicio: hoje, ciclo_vence_em: addDias(hoje, 30), ciclo_valor: valorMensal, trial_ate: null }).eq("id", userId);
  } else if (tipoCobranca === "mensal") {
    const vence = (p as any).ciclo_vence_em as string | null;
    const base = vence && vence > hoje ? vence : hoje;
    await admin.from("physiq_professores").update({ ciclo_inicio: base, ciclo_vence_em: addMes(base), ciclo_valor: valorMensal }).eq("id", userId);
  } else if (tipoCobranca === "anual") {
    const x = new Date(`${hoje}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + 1);
    await admin.from("physiq_professores").update({ anual_ate: x.toISOString().slice(0, 10), adesao_paga_em: (p as any).adesao_paga_em ?? hoje, trial_ate: null }).eq("id", userId);
  }
}

const SELECT_PROF = "id, nome, email, foto_url, status, codigo_convite, plano_id, trial_ate, adesao_paga_em, ciclo_inicio, ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada, acesso_liberado_ate, alunos_bloqueados_em, alunos_bloqueados_msg, created_at, physiq_planos_professor(id, nome, valor_mensal, valor_anual, max_alunos)";

function linhaCompacta(p: any, tol: number, hoje: string, nAlunos: number, assStatus: string | null) {
  const ok = acessoOk(p, tol, hoje);
  const diasAtraso = p.ciclo_vence_em ? diffDias(hoje, p.ciclo_vence_em) : null;
  let situacao: string;
  if (p.status !== "ativo") situacao = "suspenso";
  else if (p.cobranca_pausada) situacao = "cobranca_pausada";
  else if (p.acesso_liberado_ate && p.acesso_liberado_ate >= hoje) situacao = "liberado";
  else if (p.anual_ate && p.anual_ate >= hoje) situacao = "anual";
  else if (!p.adesao_paga_em && p.trial_ate && p.trial_ate >= hoje) situacao = "trial";
  else if (!p.adesao_paga_em) situacao = "sem_adesao";
  else if (diasAtraso !== null && diasAtraso > tol) situacao = "travado";
  else if (diasAtraso !== null && diasAtraso >= 0) situacao = "em_tolerancia";
  else situacao = "em_dia";
  return {
    id: p.id, nome: p.nome, email: p.email, status: p.status, codigo: p.codigo_convite,
    plano: p.physiq_planos_professor ? { id: p.physiq_planos_professor.id, nome: p.physiq_planos_professor.nome, valorMensal: Number(p.physiq_planos_professor.valor_mensal), valorAnual: p.physiq_planos_professor.valor_anual, maxAlunos: p.physiq_planos_professor.max_alunos } : null,
    cicloInicio: p.ciclo_inicio, cicloVenceEm: p.ciclo_vence_em, cicloValor: p.ciclo_valor, anualAte: p.anual_ate, trialAte: p.trial_ate, adesaoPagaEm: p.adesao_paga_em,
    cobrancaPausada: p.cobranca_pausada, acessoLiberadoAte: p.acesso_liberado_ate, alunosBloqueadosEm: p.alunos_bloqueados_em, alunosBloqueadosMsg: p.alunos_bloqueados_msg,
    alunos: nAlunos, assinatura: assStatus, acessoOk: ok, diasAtraso, situacao, recorrente: assStatus === "authorized",
  };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireMaster(req, "master-financeiro");
  if (authErr) return authErr;
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const hoje = hojeISO();

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);
      const offset = Math.max(Number(body?.offset) || 0, 0);
      const filtro = typeof body?.filtro === "string" ? body.filtro : "todos";
      // o master não aparece na cobrança (não paga plano)
      const { data: todos, error } = await admin.from("physiq_professores").select(SELECT_PROF).neq("id", user.id).order("nome");
      if (error) throw error;
      const ids = ((todos as any[]) || []).map((p) => p.id);
      const [alunosRes, assRes, tol] = await Promise.all([
        ids.length ? admin.from("physiq_profiles").select("professor_id").in("professor_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? admin.from("physiq_assinaturas").select("user_id, status, created_at").eq("contexto", "plano_professor").in("user_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
        tolerancia(admin),
      ]);
      const nAlunos: Record<string, number> = {};
      for (const a of ((alunosRes.data as any[]) || [])) nAlunos[a.professor_id] = (nAlunos[a.professor_id] || 0) + 1;
      const ass = new Map<string, string>();
      for (const a of ((assRes.data as any[]) || [])) if (!ass.has(a.user_id)) ass.set(a.user_id, a.status);
      let linhas = ((todos as any[]) || []).map((p) => linhaCompacta(p, tol, hoje, nAlunos[p.id] || 0, ass.get(p.id) ?? null));
      // resumo é do TODO (antes do filtro) — os KPIs não mudam quando o master troca o chip
      const resumo = { total: linhas.length, travados: linhas.filter((l) => l.situacao === "travado").length, emTolerancia: linhas.filter((l) => l.situacao === "em_tolerancia").length, emDia: linhas.filter((l) => l.situacao === "em_dia" || l.situacao === "anual").length, trial: linhas.filter((l) => l.situacao === "trial" || l.situacao === "sem_adesao").length };
      const filtros: Record<string, (l: any) => boolean> = {
        todos: () => true,
        atrasados: (l) => l.situacao === "em_tolerancia" || l.situacao === "travado",
        travados: (l) => l.situacao === "travado",
        trial: (l) => l.situacao === "trial" || l.situacao === "sem_adesao",
        pausados: (l) => l.situacao === "cobranca_pausada" || l.situacao === "liberado" || l.situacao === "suspenso",
        em_dia: (l) => l.situacao === "em_dia" || l.situacao === "anual",
      };
      linhas = linhas.filter(filtros[filtro] || filtros.todos);
      // ordem: quem precisa de atenção primeiro
      const peso: Record<string, number> = { travado: 0, em_tolerancia: 1, sem_adesao: 2, trial: 3, em_dia: 4, anual: 5, liberado: 6, cobranca_pausada: 7, suspenso: 8 };
      linhas.sort((a, b) => (peso[a.situacao] ?? 9) - (peso[b.situacao] ?? 9) || String(a.nome).localeCompare(String(b.nome)));
      return jsonOk({ professores: linhas.slice(offset, offset + limit), total: linhas.length, limit, offset, resumo, tolerancia: tol, hoje }, origin);
    }

    // todas as ações abaixo trabalham em um professor
    const userId = typeof body?.userId === "string" ? body.userId : null;
    const pagamentoId = typeof body?.pagamentoId === "string" ? body.pagamentoId : null;

    if (action === "detalhe") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const [{ data: p }, { count }, assRes, pagRes, avisosRes, histRes, tol, { data: integ }] = await Promise.all([
        admin.from("physiq_professores").select(SELECT_PROF).eq("id", userId).maybeSingle(),
        admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", userId),
        admin.from("physiq_assinaturas").select("id, status, valor, created_at, updated_at").eq("user_id", userId).eq("contexto", "plano_professor").order("created_at", { ascending: false }).limit(3),
        admin.from("physiq_pagamentos").select("id, tipo, metodo, valor, mes_ref, status, tipo_cobranca, mp_payment_id, pix_expira_em, created_at, updated_at").eq("user_id", userId).eq("contexto", "plano_professor").order("created_at", { ascending: false }).limit(36),
        admin.from("physiq_avisos_plano").select("id, ciclo_vence_em, dia, canal, mensagem, enviado_em").eq("professor_id", userId).order("enviado_em", { ascending: false }).limit(20),
        admin.from("physiq_planos_professor_hist").select("id, plano_id, alterado_por, alterado_em, antes, depois").eq("professor_id", userId).order("alterado_em", { ascending: false }).limit(20),
        tolerancia(admin),
        admin.from("physiq_integracoes").select("tipo, config").eq("professor_id", userId).maybeSingle(),
      ]);
      if (!p) return jsonErr("not_found", 404, origin);
      const assinatura = ((assRes.data as any[]) || [])[0] ?? null;
      return jsonOk({
        professor: linhaCompacta(p, tol, hoje, count ?? 0, assinatura?.status ?? null),
        assinatura, assinaturas: assRes.data ?? [], pagamentos: pagRes.data ?? [], avisos: avisosRes.data ?? [], historico: histRes.data ?? [],
        integracao: (integ as any)?.tipo ?? "pix_manual", integracaoConfig: (integ as any)?.config ?? {}, tolerancia: tol, hoje,
      }, origin);
    }

    // pagamento por fora (transferência, dinheiro…) — cobre adesão, ciclo ou anual e aplica o efeito
    if (action === "registrar-pagamento") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const tipoCobranca = ["adesao", "mensal", "anual"].includes(body?.tipoCobranca) ? body.tipoCobranca : "mensal";
      const valor = Number(body?.valor);
      const metodo = typeof body?.metodo === "string" ? body.metodo.trim().slice(0, 40) : "manual";
      const data = typeof body?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : hoje;
      if (!(valor > 0)) return jsonErr("sem_valor", 400, origin);
      if (data > hoje) return jsonErr("data_futura", 400, origin);
      const { data: p } = await admin.from("physiq_professores").select("id, plano_id").eq("id", userId).maybeSingle();
      if (!p) return jsonErr("not_found", 404, origin);
      const iso = `${data}T12:00:00.000Z`;
      const { data: inserted, error } = await admin.from("physiq_pagamentos").insert({
        user_id: userId, tipo: "manual", metodo, valor, mes_ref: `${data.slice(0, 7)}-01`, status: "approved",
        contexto: "plano_professor", tipo_cobranca: tipoCobranca, plano_id: (p as any).plano_id, confirmado_por: user.id, created_at: iso, updated_at: iso,
      }).select().single();
      if (error) throw error;
      await aplicarPagamentoPlano(admin, userId, tipoCobranca, new Date(iso));
      return jsonOk({ pagamento: inserted }, origin);
    }

    // remove um manual (só a linha; datas do ciclo ficam — ajuste com set-ciclo se precisar)
    if (action === "remover-manual") {
      if (!pagamentoId) return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, tipo, contexto").eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if ((row as any).tipo !== "manual" || (row as any).contexto !== "plano_professor") return jsonErr("nao_manual", 400, origin);
      const { error } = await admin.from("physiq_pagamentos").delete().eq("id", pagamentoId);
      if (error) throw error;
      return jsonOk({ ok: true, aviso: "as datas do ciclo não mudam automaticamente — use set-ciclo" }, origin);
    }

    // ajuste manual de datas (correções do master)
    if (action === "set-ciclo") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const patch: Record<string, unknown> = {};
      for (const k of ["ciclo_inicio", "ciclo_vence_em", "anual_ate", "trial_ate", "adesao_paga_em"]) {
        if (k in (body ?? {})) {
          const v = body[k];
          if (v === null) patch[k] = null;
          else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) patch[k] = v;
          else return jsonErr(`invalid_${k}`, 400, origin);
        }
      }
      if ("ciclo_valor" in (body ?? {})) patch.ciclo_valor = body.ciclo_valor === null ? null : Number(body.ciclo_valor);
      if (!Object.keys(patch).length) return jsonErr("no_fields", 400, origin);
      const { data, error } = await admin.from("physiq_professores").update(patch).eq("id", userId).select("id, ciclo_inicio, ciclo_vence_em, anual_ate, trial_ate, adesao_paga_em, ciclo_valor").maybeSingle();
      if (error) throw error;
      if (!data) return jsonErr("not_found", 404, origin);
      return jsonOk({ ok: true, professor: data }, origin);
    }

    if (action === "pausar-cobranca") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const pausar = Boolean(body?.pausar);
      const { error } = await admin.from("physiq_professores").update({ cobranca_pausada: pausar }).eq("id", userId);
      if (error) throw error;
      return jsonOk({ ok: true, pausada: pausar }, origin);
    }

    if (action === "liberar-acesso-ate") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const ate = body?.ate ?? null;
      if (ate !== null && !(typeof ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ate))) return jsonErr("invalid_ate", 400, origin);
      const { error } = await admin.from("physiq_professores").update({ acesso_liberado_ate: ate }).eq("id", userId);
      if (error) throw error;
      if (ate) await admin.from("physiq_avisos_plano").insert({ professor_id: userId, ciclo_vence_em: hoje, dia: Math.floor(Date.now() / 1000) % 1000000, canal: "manual", mensagem: `Acesso liberado pelo master até ${ate}${body?.motivo ? ` — ${String(body.motivo).slice(0, 200)}` : ""}` });
      return jsonOk({ ok: true, ate }, origin);
    }

    if (action === "cancelar-assinatura") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const { data: ativa } = await admin.from("physiq_assinaturas").select("id, mp_preapproval_id").eq("user_id", userId).eq("contexto", "plano_professor").in("status", ["authorized", "pending", "paused"]).order("created_at", { ascending: false }).limit(1);
      const a = ((ativa as any[]) || [])[0];
      if (!a) return jsonErr("sem_assinatura", 400, origin);
      if (a.mp_preapproval_id) {
        const { status } = await mpFetch(`/preapproval/${a.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
        if (status >= 300) return jsonErr("mp_error", 502, origin);
      }
      await admin.from("physiq_assinaturas").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", a.id);
      return jsonOk({ ok: true }, origin);
    }

    if (action === "refund") {
      if (!pagamentoId) return jsonErr("missing_pagamentoId", 400, origin);
      const { data: row } = await admin.from("physiq_pagamentos").select("id, mp_payment_id, status, contexto").eq("id", pagamentoId).maybeSingle();
      if (!row) return jsonErr("not_found", 404, origin);
      if ((row as any).contexto !== "plano_professor") return jsonErr("forbidden", 403, origin);
      if ((row as any).status !== "approved") return jsonErr("nao_reembolsavel", 400, origin);
      if (!(row as any).mp_payment_id) return jsonErr("sem_transacao_mp", 400, origin);
      const { status, body: ref } = await mpFetch(`/v1/payments/${(row as any).mp_payment_id}/refunds`, { method: "POST", headers: { "X-Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({}) });
      if (status >= 300) return jsonErr("mp_error", 502, origin);
      await admin.from("physiq_pagamentos").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", (row as any).id);
      return jsonOk({ ok: true, refund_id: ref?.id || null }, origin);
    }

    // aviso manual no app do professor
    if (action === "reenviar-aviso") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const { data: p } = await admin.from("physiq_professores").select("id, ciclo_vence_em").eq("id", userId).maybeSingle();
      if (!p) return jsonErr("not_found", 404, origin);
      const mensagem = typeof body?.mensagem === "string" && body.mensagem.trim() ? body.mensagem.trim().slice(0, 300) : "Sua mensalidade está pendente. Regularize em Planos para não perder o acesso.";
      const { data, error } = await admin.from("physiq_avisos_plano").insert({ professor_id: userId, ciclo_vence_em: (p as any).ciclo_vence_em ?? hoje, dia: Math.floor(Date.now() / 1000) % 1000000, canal: "manual", mensagem }).select().single();
      if (error) throw error;
      return jsonOk({ ok: true, aviso: data }, origin);
    }

    if (action === "bloquear-alunos" || action === "desbloquear-alunos") {
      if (!userId) return jsonErr("missing_userId", 400, origin);
      const bloquear = action === "bloquear-alunos";
      const msg = typeof body?.msg === "string" && body.msg.trim() ? body.msg.trim().slice(0, 300) : null;
      const { data, error } = await admin.from("physiq_professores").update({ alunos_bloqueados_em: bloquear ? new Date().toISOString() : null, alunos_bloqueados_msg: bloquear ? msg : null }).eq("id", userId).select("id, alunos_bloqueados_em, alunos_bloqueados_msg").maybeSingle();
      if (error) throw error;
      if (!data) return jsonErr("not_found", 404, origin);
      return jsonOk({ ok: true, professor: data }, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    console.error("master-financeiro", e);
    return jsonErr("internal", 500, origin);
  }
});
