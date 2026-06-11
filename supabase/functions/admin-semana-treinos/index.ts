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
const DIAS = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId, p_endpoint: endpoint, p_max_count: maxCount, p_window_secs: windowSecs,
    });
    if (error) return true;
    return data === true;
  } catch { return true; }
}

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (data.user.app_metadata as any)?.role;
  if (role !== "admin") return { user: null, error: jsonErr("forbidden", 403, origin) };
  const allowed = await checkRateLimit(data.user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user: data.user, error: null };
}

async function gruposDisponiveis(admin: any, userId: string): Promise<{ catalogo: Set<string>; pessoal: Set<string>; lista: any[] }> {
  const [perf, pess] = await Promise.all([
    admin.from("tb_grupos_treino_perfis").select("grupo_id, tb_grupos_treino(id, nome)").eq("user_id", userId),
    admin.from("tb_grupos_treino_usuario").select("id, nome").eq("user_id", userId),
  ]);
  const catalogo = new Set<string>();
  const lista: any[] = [];
  ((perf.data as any[]) || []).forEach((p) => {
    if (p.grupo_id) { catalogo.add(p.grupo_id); lista.push({ id: p.grupo_id, nome: p.tb_grupos_treino?.nome ?? "(grupo)", tipo: "catalogo" }); }
  });
  const pessoal = new Set<string>();
  ((pess.data as any[]) || []).forEach((g) => { pessoal.add(g.id); lista.push({ id: g.id, nome: g.nome, tipo: "pessoal" }); });
  return { catalogo, pessoal, lista };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-semana-treinos", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const action = body?.action;
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "get") {
      const [semanaRes, disp] = await Promise.all([
        admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId),
        gruposDisponiveis(admin, userId),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      return new Response(JSON.stringify({ semana: semanaRes.data ?? [], gruposDisponiveis: disp.lista }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "setDia") {
      const dia = body?.dia_semana;
      const grupos = Array.isArray(body?.grupos) ? body.grupos : [];
      if (!DIAS.has(dia)) return jsonErr("invalid_dia", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      // valida e normaliza: cada item é OU catálogo OU pessoal (nunca ambos)
      const norm: { grupo_id: string | null; grupo_usuario_id: string | null }[] = [];
      for (const g of grupos) {
        const gid = g?.grupo_id ?? null;
        const guid = g?.grupo_usuario_id ?? null;
        if (gid && guid) return jsonErr("grupo_ambiguo", 400, origin);
        if (gid) {
          if (!catalogo.has(gid)) return jsonErr("grupo_nao_disponivel", 400, origin);
          norm.push({ grupo_id: gid, grupo_usuario_id: null });
        } else if (guid) {
          if (!pessoal.has(guid)) return jsonErr("grupo_nao_disponivel", 400, origin);
          norm.push({ grupo_id: null, grupo_usuario_id: guid });
        } else {
          return jsonErr("grupo_invalido", 400, origin);
        }
      }
      const del = await admin.from("tb_semana_treinos").delete().eq("user_id", userId).eq("dia_semana", dia);
      if (del.error) throw del.error;
      // não-atômico de propósito: se o insert falhar após o delete, o dia fica vazio
      // (admin re-marca). Aceitável para um painel admin.
      if (norm.length > 0) {
        const rows = norm.map((g, i) => ({
          user_id: userId, dia_semana: dia, slot_idx: i,
          grupo_id: g.grupo_id, grupo_usuario_id: g.grupo_usuario_id,
          updated_at: new Date().toISOString(),
        }));
        const ins = await admin.from("tb_semana_treinos").insert(rows);
        if (ins.error) throw ins.error;
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
