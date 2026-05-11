import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.lovable.app",
  "capacitor://localhost",
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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonErr("missing_auth", 401, origin);
  const token = auth.slice(7);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. valida JWT do caller
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return jsonErr("invalid_token", 401, origin);
  const userId = data.user.id;

  // 2. exige confirmação explícita no body
  try {
    const body = await req.json();
    if (body?.confirm !== "DELETE_MY_ACCOUNT") {
      return jsonErr("confirmation_required", 400, origin);
    }
  } catch {
    return jsonErr("invalid_body", 400, origin);
  }

  // 3. deleta auth.user (cascade pra tabelas FK)
  try {
    const admin = createClient(url, sr);
    // Limpa tabelas que nao têm CASCADE FK definida
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
  } catch (_e) {
    return jsonErr("internal", 500, origin);
  }
});
