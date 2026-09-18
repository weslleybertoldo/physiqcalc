import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
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
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (data.user.app_metadata as any)?.role;
  const papel = papelDe(role);
  if (!papel) return { user: null, error: jsonErr("forbidden", 403, origin) };
  // professor com plano vencido (fora da tolerância) só acessa o que está em SEM_ACESSO_OK
  if (papel === "professor" && !SEM_ACESSO_OK.has(endpoint)) {
    const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data: ok } = await admin0.rpc("physiq_professor_acesso_ok", { pid: data.user.id });
    if (ok !== true) return { user: null, error: jsonErr("plano_vencido", 403, origin) };
  }
  (data.user as any).papel = papel;
  const allowed = await checkRateLimit(data.user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user: data.user, error: null };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user: caller, error: authErr } = await requireAdmin(req, "admin-delete-user", 5, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
    if (userId === caller.id) return jsonErr("cannot_delete_self", 400, origin);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    if (!(await alunoDoProfessor(admin, caller, userId))) return jsonErr("forbidden", 403, origin);
    // PROFESSOR não apaga a conta do aluno (a conta é do aluno, não do professor): "excluir" pra ele = desvincular →
    // o aluno cai na fila "Sem professor" do master. Só o MASTER apaga de verdade (abaixo).
    if (caller.papel === "professor") {
      const { error: unlinkErr } = await admin.from("physiq_profiles").update({ professor_id: null }).eq("id", userId).eq("professor_id", caller.id);
      if (unlinkErr) throw unlinkErr;
      return new Response(JSON.stringify({ ok: true, desvinculado: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    // staging só apaga CONTA DE TESTE — auth é global, conta real sumiria da produção
    if ((schemaCtx.getStore() || "public") === "staging") {
      const { data: alvo } = await admin.auth.admin.getUserById(userId);
      if ((alvo?.user?.user_metadata as any)?.ambiente !== "staging") {
        return jsonErr("conta_real_protegida", 403, origin);
      }
    }
    const { data: profile } = await admin.from("physiq_profiles").select("*").eq("id", userId).maybeSingle();
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      if (profile) await admin.from("physiq_profiles").upsert(profile);
      throw delErr;
    }
    await admin.from("physiq_profiles").delete().eq("id", userId);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
