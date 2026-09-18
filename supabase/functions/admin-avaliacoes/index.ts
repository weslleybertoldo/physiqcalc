import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
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

function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_max_count: maxCount,
      p_window_secs: windowSecs,
    });
    if (error) return true; // fail-open em erro pra evitar lockout
    return data === true;
  } catch {
    return true;
  }
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

// ---- SaaS (12/09/2026): papéis master (role admin|master) e professor; escopo por professor_id ----
type Papel = "master" | "professor";
function papelDe(role: unknown): Papel | null {
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return null;
}
// endpoints que o professor TRAVADO (plano vencido) ainda pode usar
const SEM_ACESSO_OK = new Set<string>(["mp-payments"]);
// escopo: professor só enxerga aluno com professor_id = ele; master enxerga todos
async function alunoDoProfessor(admin: any, user: any, alunoId: string): Promise<boolean> {
  if (alunoId && alunoId === user?.id) return true; // o professor abre o PRÓPRIO perfil (aluno de si mesmo, 18/09/2026)
  if (user?.papel === "master") return true;
  const { data } = await admin.from("physiq_profiles").select("professor_id").eq("id", alunoId).maybeSingle();
  return (data as any)?.professor_id === user?.id;
}

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const user = await usuarioDoToken(token, auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (user.app_metadata as any)?.role;
  const papel = papelDe(role);
  if (!papel) return { user: null, error: jsonErr("forbidden", 403, origin) };
  // professor com plano vencido (fora da tolerância) só acessa o que está em SEM_ACESSO_OK
  if (papel === "professor" && !SEM_ACESSO_OK.has(endpoint)) {
    const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data: ok } = await admin0.rpc("physiq_professor_acesso_ok", { pid: user.id });
    if (ok !== true) return { user: null, error: jsonErr("plano_vencido", 403, origin) };
  }
  user.papel = papel;
  const allowed = await checkRateLimit(user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireAdmin(req, "admin-avaliacoes", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const action = body?.action;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const ALLOWED = new Set(["data_avaliacao","peso","altura","dobra_1","dobra_2","dobra_3","observacao","percentual_gordura","massa_gorda","massa_magra"]);
    // avaliação existente → dono → escopo do professor
    const avaliacaoNoEscopo = async (avaliacaoId: string): Promise<boolean> => {
      const { data: av } = await admin.from("physiq_avaliacoes").select("user_id").eq("id", avaliacaoId).maybeSingle();
      return !!av && (await alunoDoProfessor(admin, user, (av as any).user_id));
    };
    if (action === "list") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const { data, error } = await admin.from("physiq_avaliacoes").select("*").eq("user_id", userId).order("data_avaliacao", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ avaliacoes: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "create") {
      const userId = body?.userId;
      const avaliacao = body?.avaliacao;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (typeof avaliacao !== "object" || avaliacao === null) return jsonErr("missing_avaliacao", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const filtered: Record<string, unknown> = { user_id: userId };
      for (const k of Object.keys(avaliacao)) if (ALLOWED.has(k)) filtered[k] = avaliacao[k];
      const { data, error } = await admin.from("physiq_avaliacoes").insert(filtered).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ avaliacao: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "update") {
      const avaliacaoId = body?.avaliacaoId;
      const avaliacao = body?.avaliacao ?? {};
      if (!avaliacaoId || typeof avaliacaoId !== "string") return jsonErr("missing_avaliacaoId", 400, origin);
      if (!(await avaliacaoNoEscopo(avaliacaoId))) return jsonErr("forbidden", 403, origin);
      const filtered: Record<string, unknown> = {};
      for (const k of Object.keys(avaliacao)) if (ALLOWED.has(k)) filtered[k] = avaliacao[k];
      if (Object.keys(filtered).length === 0) return jsonErr("no_valid_fields", 400, origin);
      const { data, error } = await admin.from("physiq_avaliacoes").update(filtered).eq("id", avaliacaoId).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ avaliacao: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "delete") {
      const avaliacaoId = body?.avaliacaoId;
      if (!avaliacaoId || typeof avaliacaoId !== "string") return jsonErr("missing_avaliacaoId", 400, origin);
      if (!(await avaliacaoNoEscopo(avaliacaoId))) return jsonErr("forbidden", 403, origin);
      const { error } = await admin.from("physiq_avaliacoes").delete().eq("id", avaliacaoId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
