import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
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
  if (role !== "admin") return { user: null, error: jsonErr("forbidden", 403, origin) };
  const allowed = await checkRateLimit(data.user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user: data.user, error: null };
}

const ALLOWED_FIELDS = new Set([
  "nome", "email", "data_nascimento", "sexo", "altura", "peso", "idade",
  "dobra_1", "dobra_2", "dobra_3", "nivel_atividade", "tempo_descanso_segundos",
  "macro_proteina_multiplicador", "macro_gordura_percentual", "ajuste_calorico",
  "tmb_metodo", "plano_nome", "plano_expiracao", "status", "admin_locked",
  "foto_url",
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-update-user", 30, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const userId = body?.userId;
    const profileData = body?.profileData ?? {};
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
    if (typeof profileData !== "object" || profileData === null) return jsonErr("invalid_profileData", 400, origin);
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(profileData)) if (ALLOWED_FIELDS.has(key)) filtered[key] = profileData[key];
    if (Object.keys(filtered).length === 0) return jsonErr("no_valid_fields", 400, origin);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin.from("physiq_profiles").update(filtered).eq("id", userId).select().maybeSingle();
    if (error) throw error;
    return new Response(JSON.stringify({ profile: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
