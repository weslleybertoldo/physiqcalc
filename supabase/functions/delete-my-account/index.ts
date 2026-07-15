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

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonErr("missing_auth", 401, origin);
  const token = auth.slice(7);

  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return jsonErr("invalid_token", 401, origin);
  const userId = data.user.id;

  // staging só apaga CONTA DE TESTE (user_metadata.ambiente='staging') — auth é global,
  // apagar uma conta real pelo staging sumiria com ela da produção
  if (currentSchema() === "staging" && (data.user.user_metadata as any)?.ambiente !== "staging") {
    return jsonErr("conta_real_protegida", 403, origin);
  }

  // Rate limit: 3 tentativas por hora por user
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_user_id: userId, p_endpoint: "delete-my-account", p_max_count: 3, p_window_secs: 3600,
  });
  if (allowed === false) return jsonErr("rate_limited", 429, origin);

  try {
    const body = await req.json();
    if (body?.confirm !== "DELETE_MY_ACCOUNT") return jsonErr("confirmation_required", 400, origin);
  } catch { return jsonErr("invalid_body", 400, origin); }

  try {
    await admin.from("tb_treino_series").delete().eq("user_id", userId);
    await admin.from("tb_treino_concluido").delete().eq("user_id", userId);
    await admin.from("tb_treino_dia_override").delete().eq("user_id", userId);
    await admin.from("treino_historico").delete().eq("user_id", userId);
    await admin.from("exercicio_ordem_usuario").delete().eq("user_id", userId);
    await admin.from("tb_grupos_treino_usuario").delete().eq("user_id", userId);
    await admin.from("tb_exercicios_usuario").delete().eq("user_id", userId);
    await admin.from("tb_grupos_exercicios_usuario").delete().eq("user_id", userId);
    await admin.from("tb_exercicio_comentarios").delete().eq("user_id", userId);
    await admin.from("physiq_avaliacoes").delete().eq("user_id", userId);
    await admin.from("physiq_user_tags").delete().eq("user_id", userId);
    await admin.from("physiq_profiles").delete().eq("id", userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
