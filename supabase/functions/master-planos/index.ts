// master-planos (SaaS 12/09/2026) — SÓ MASTER: catálogo de planos dos professores + regras gerais.
// actions: list | create | update | set-regras | historico
// Reflexo nos professores: nome na hora; valor novo vale a partir do PRÓXIMO ciclo (ciclo atual congelado em
// physiq_professores.ciclo_valor); assinatura MP ativa é atualizada (best effort) e o professor recebe aviso no app.
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

const CHAVES_REGRAS = ["adesao_professor", "tolerancia_dias", "trial_dias", "itens_pagina"];

function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireMaster(req, "master-planos");
  if (authErr) return authErr;
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const [{ data: planos, error }, { data: profs }, { data: cfg }] = await Promise.all([
        admin.from("physiq_planos_professor").select("*").order("ordem").order("nome"),
        admin.from("physiq_professores").select("plano_id"),
        admin.from("app_config").select("key, value").in("key", CHAVES_REGRAS),
      ]);
      if (error) throw error;
      const n: Record<string, number> = {};
      for (const p of ((profs as any[]) || [])) if (p.plano_id) n[p.plano_id] = (n[p.plano_id] || 0) + 1;
      const regras = Object.fromEntries(((cfg as any[]) || []).map((r) => [r.key, Number(r.value)]));
      return jsonOk({
        planos: ((planos as any[]) || []).map((p) => ({ ...p, professores: n[p.id] || 0, valor_anual_efetivo: p.valor_anual ?? Number((Number(p.valor_mensal) * 10).toFixed(2)) })),
        regras: { adesao_professor: regras.adesao_professor ?? 500, tolerancia_dias: regras.tolerancia_dias ?? 7, trial_dias: regras.trial_dias ?? 14, itens_pagina: regras.itens_pagina ?? 20 },
      }, origin);
    }

    if (action === "create" || action === "update") {
      const nome = typeof body?.nome === "string" ? body.nome.trim().slice(0, 40) : "";
      const minAlunos = num(body?.min_alunos, 0, 100000);
      const maxAlunos = body?.max_alunos === null || body?.max_alunos === "" || body?.max_alunos === undefined ? null : num(body?.max_alunos, 1, 100000);
      const valorMensal = num(body?.valor_mensal, 0, 100000);
      const valorAnual = body?.valor_anual === null || body?.valor_anual === "" || body?.valor_anual === undefined ? null : num(body?.valor_anual, 0, 1000000);
      const ativo = body?.ativo === undefined ? true : Boolean(body.ativo);
      const ordem = num(body?.ordem, 0, 1000);
      if (action === "create") {
        if (!nome) return jsonErr("missing_nome", 400, origin);
        if (valorMensal === null) return jsonErr("invalid_valor_mensal", 400, origin);
        const { data, error } = await admin.from("physiq_planos_professor").insert({ nome, min_alunos: minAlunos ?? 1, max_alunos: maxAlunos, valor_mensal: valorMensal, valor_anual: valorAnual, ativo, ordem: ordem ?? 99 }).select().single();
        if (error) { if ((error as any).code === "23505") return jsonErr("nome_duplicado", 409, origin); throw error; }
        await admin.from("physiq_planos_professor_hist").insert({ plano_id: (data as any).id, alterado_por: user.id, antes: null, depois: data });
        return jsonOk({ plano: data }, origin);
      }
      const id = body?.id;
      if (!id || typeof id !== "string") return jsonErr("missing_id", 400, origin);
      const { data: antes } = await admin.from("physiq_planos_professor").select("*").eq("id", id).maybeSingle();
      if (!antes) return jsonErr("not_found", 404, origin);
      const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      if (nome) patch.nome = nome;
      if (minAlunos !== null) patch.min_alunos = minAlunos;
      if ("max_alunos" in (body ?? {})) patch.max_alunos = maxAlunos;
      if (valorMensal !== null) patch.valor_mensal = valorMensal;
      if ("valor_anual" in (body ?? {})) patch.valor_anual = valorAnual;
      if ("ativo" in (body ?? {})) patch.ativo = ativo;
      if (ordem !== null) patch.ordem = ordem;
      const { data: depois, error } = await admin.from("physiq_planos_professor").update(patch).eq("id", id).select().single();
      if (error) { if ((error as any).code === "23505") return jsonErr("nome_duplicado", 409, origin); throw error; }
      await admin.from("physiq_planos_professor_hist").insert({ plano_id: id, alterado_por: user.id, antes, depois });

      // valor mensal mudou → assinaturas ativas dos professores deste plano acompanham + aviso de reajuste no app
      let assinaturasAtualizadas = 0, assinaturasFalhas = 0, avisados = 0;
      if (valorMensal !== null && Number((antes as any).valor_mensal) !== valorMensal) {
        const { data: profs } = await admin.from("physiq_professores").select("id, ciclo_vence_em").eq("plano_id", id).eq("status", "ativo");
        const ids = ((profs as any[]) || []).map((p) => p.id);
        if (ids.length) {
          const { data: ass } = await admin.from("physiq_assinaturas").select("id, user_id, mp_preapproval_id").eq("contexto", "plano_professor").eq("status", "authorized").in("user_id", ids);
          for (const a of ((ass as any[]) || [])) {
            const { status } = a.mp_preapproval_id ? await mpFetch(`/preapproval/${a.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: valorMensal } }) }) : { status: 599 };
            if (status < 300) { assinaturasAtualizadas++; await admin.from("physiq_assinaturas").update({ valor: valorMensal, updated_at: new Date().toISOString() }).eq("id", a.id); }
            else { assinaturasFalhas++; await admin.from("physiq_integracoes").upsert({ professor_id: a.user_id, config: { recriar_assinatura: true } }, { onConflict: "professor_id" }); }
          }
          const hoje = hojeISO();
          const msg = `O plano ${(depois as any).nome} passou de R$ ${Number((antes as any).valor_mensal).toFixed(2).replace(".", ",")} para R$ ${valorMensal.toFixed(2).replace(".", ",")} por mês. O valor novo vale a partir do seu próximo ciclo.`;
          const rows = ((profs as any[]) || []).map((p) => ({ professor_id: p.id, ciclo_vence_em: p.ciclo_vence_em ?? hoje, dia: Math.floor(Date.now() / 1000) % 1000000, canal: "reajuste", mensagem: msg }));
          if (rows.length) { const { error: avErr } = await admin.from("physiq_avisos_plano").insert(rows); if (!avErr) avisados = rows.length; }
        }
      }
      return jsonOk({ plano: depois, assinaturasAtualizadas, assinaturasFalhas, avisados }, origin);
    }

    if (action === "set-regras") {
      const patch: [string, string][] = [];
      const adesao = num(body?.adesao_professor, 0, 100000);
      const tol = num(body?.tolerancia_dias, 0, 90);
      const trial = num(body?.trial_dias, 0, 365);
      const itens = num(body?.itens_pagina, 5, 100);
      if (adesao !== null) patch.push(["adesao_professor", String(adesao)]);
      if (tol !== null) patch.push(["tolerancia_dias", String(Math.round(tol))]);
      if (trial !== null) patch.push(["trial_dias", String(Math.round(trial))]);
      if (itens !== null) patch.push(["itens_pagina", String(Math.round(itens))]);
      if (!patch.length) return jsonErr("no_fields", 400, origin);
      const { error } = await admin.from("app_config").upsert(patch.map(([key, value]) => ({ key, value })), { onConflict: "key" });
      if (error) throw error;
      await admin.from("physiq_planos_professor_hist").insert({ plano_id: null, alterado_por: user.id, antes: null, depois: { regras: Object.fromEntries(patch) } });
      return jsonOk({ ok: true, regras: Object.fromEntries(patch) }, origin);
    }

    if (action === "historico") {
      const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);
      const offset = Math.max(Number(body?.offset) || 0, 0);
      const { data, error, count } = await admin.from("physiq_planos_professor_hist").select("*", { count: "exact" }).order("alterado_em", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      const planoIds = [...new Set(((data as any[]) || []).map((h) => h.plano_id).filter(Boolean))];
      const profIds = [...new Set(((data as any[]) || []).map((h) => h.professor_id).filter(Boolean))];
      const [{ data: planos }, { data: profs }] = await Promise.all([
        planoIds.length ? admin.from("physiq_planos_professor").select("id, nome").in("id", planoIds) : Promise.resolve({ data: [] }),
        profIds.length ? admin.from("physiq_professores").select("id, nome").in("id", profIds) : Promise.resolve({ data: [] }),
      ]);
      const nomePlano = new Map(((planos as any[]) || []).map((p) => [p.id, p.nome]));
      const nomeProf = new Map(((profs as any[]) || []).map((p) => [p.id, p.nome]));
      return jsonOk({ historico: ((data as any[]) || []).map((h) => ({ ...h, plano_nome: nomePlano.get(h.plano_id) ?? null, professor_nome: nomeProf.get(h.professor_id) ?? null })), total: count ?? 0, limit, offset }, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    console.error("master-planos", e);
    return jsonErr("internal", 500, origin);
  }
});
