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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-tags", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const action = body?.action;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    if (action === "list-tags" || action === "list") {
      const { data, error } = await admin.from("physiq_tags").select("*").order("nome");
      if (error) throw error;
      return new Response(JSON.stringify({ tags: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "list-user-tags") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const { data, error } = await admin.from("physiq_user_tags").select("*, physiq_tags(*)").eq("user_id", userId);
      if (error) throw error;
      return new Response(JSON.stringify({ userTags: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "getAllUserTags") {
      const { data, error } = await admin.from("physiq_user_tags").select("user_id, tag_id");
      if (error) throw error;
      return new Response(JSON.stringify({ userTags: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "create-tag") {
      const nome = body?.nome;
      const cor = body?.cor ?? null;
      if (!nome || typeof nome !== "string") return jsonErr("missing_nome", 400, origin);
      const { data, error } = await admin.from("physiq_tags").insert({ nome, cor }).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ tag: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "delete-tag") {
      const tagId = body?.tagId;
      if (!tagId || typeof tagId !== "string") return jsonErr("missing_tagId", 400, origin);
      const { error } = await admin.from("physiq_tags").delete().eq("id", tagId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "assign-tag") {
      const userId = body?.userId;
      const tagId = body?.tagId;
      if (!userId || !tagId) return jsonErr("missing_ids", 400, origin);
      const { data, error } = await admin.from("physiq_user_tags").insert({ user_id: userId, tag_id: tagId }).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ userTag: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "remove-tag") {
      const userId = body?.userId;
      const tagId = body?.tagId;
      if (!userId || !tagId) return jsonErr("missing_ids", 400, origin);
      const { error } = await admin.from("physiq_user_tags").delete().eq("user_id", userId).eq("tag_id", tagId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
