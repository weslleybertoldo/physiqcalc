// professor-convites (SaaS 12/09/2026) — STAFF (professor ou master): link/código de convite e convites por e-mail dos ALUNOS.
// actions: link | email | list | revoke | resend
// Professor com plano vencido (fora da tolerância) NÃO convida (403 plano_vencido).
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
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }

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
type Papel = "master" | "professor";
function papelDe(role: unknown): Papel | null {
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return null;
}
async function requireStaff(req: Request, endpoint: string): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const user = await usuarioDoToken(auth.slice(7), auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const papel = papelDe((user.app_metadata as any)?.role);
  if (!papel) return { user: null, error: jsonErr("forbidden", 403, origin) };
  if (papel === "professor") {
    const { data: ok } = await adminClient().rpc("physiq_professor_acesso_ok", { pid: user.id });
    if (ok !== true) return { user: null, error: jsonErr("plano_vencido", 403, origin) };
  }
  user.papel = papel;
  if (!checkRateLimit(user.id, endpoint, 60, 60)) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireStaff(req, "professor-convites");
  if (authErr) return authErr;
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const { data: prof } = await admin.from("physiq_professores").select("id, nome, codigo_convite, status").eq("id", user.id).maybeSingle();
    if (!prof) return jsonErr("nao_professor", 404, origin);
    const appOrigin = origin && ALLOWED_ORIGINS.has(origin) && origin.startsWith("http") ? origin : "https://physiqcalc.vercel.app";

    if (action === "link") {
      const base = typeof body?.base === "string" && /^https?:\/\//.test(body.base) ? body.base.replace(/\/+$/, "") : appOrigin;
      return jsonOk({ codigo: (prof as any).codigo_convite, url: `${base}/?prof=${encodeURIComponent((prof as any).codigo_convite)}` }, origin);
    }

    // convite por e-mail: se a pessoa já tem conta neste ambiente e está sem professor, vincula na hora
    if (action === "email") {
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonErr("email_invalido", 400, origin);
      const { data: pode } = await admin.rpc("physiq_professor_pode_convidar", { pid: user.id });
      if (pode !== true) return jsonErr("limite_plano", 409, origin);
      const { data: perfil } = await admin.from("physiq_profiles").select("id, professor_id").ilike("email", email).limit(1).maybeSingle();
      if (perfil) {
        if ((perfil as any).professor_id === user.id) return jsonOk({ vinculado: true, jaEra: true }, origin);
        if ((perfil as any).professor_id) return jsonErr("aluno_de_outro_professor", 409, origin);
        const { data: ehProf } = await admin.from("physiq_professores").select("id").eq("id", (perfil as any).id).maybeSingle();
        if (ehProf) return jsonErr("email_de_professor", 409, origin);
        const { error } = await admin.from("physiq_profiles").update({ professor_id: user.id }).eq("id", (perfil as any).id).is("professor_id", null);
        if (error) throw error;
        return jsonOk({ vinculado: true }, origin);
      }
      const { data: existente } = await admin.from("physiq_convites").select("id").eq("professor_id", user.id).eq("papel", "aluno").eq("status", "pendente").ilike("email", email).maybeSingle();
      if (existente) return jsonOk({ vinculado: false, convite: existente, jaExistia: true }, origin);
      const { data: conv, error } = await admin.from("physiq_convites").insert({ professor_id: user.id, email, papel: "aluno", criado_por: user.id }).select().single();
      if (error) throw error;
      return jsonOk({ vinculado: false, convite: conv }, origin);
    }

    if (action === "list") {
      const { data, error } = await admin.from("physiq_convites").select("id, email, status, enviado_em, aceito_em").eq("professor_id", user.id).eq("papel", "aluno").order("status").order("enviado_em", { ascending: false }).limit(200);
      if (error) throw error;
      return jsonOk({ convites: data ?? [] }, origin);
    }

    if (action === "revoke" || action === "resend") {
      const id = body?.id;
      if (!id || typeof id !== "string") return jsonErr("missing_id", 400, origin);
      const patch = action === "revoke" ? { status: "revogado" } : { enviado_em: new Date().toISOString() };
      const { data, error } = await admin.from("physiq_convites").update(patch).eq("id", id).eq("professor_id", user.id).eq("status", "pendente").select().maybeSingle();
      if (error) throw error;
      if (!data) return jsonErr("not_found", 404, origin);
      return jsonOk({ convite: data }, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    console.error("professor-convites", e);
    return jsonErr("internal", 500, origin);
  }
});
