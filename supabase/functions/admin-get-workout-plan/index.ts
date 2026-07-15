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

// Ordem canônica dos dias (aceita PT-BR por extenso, abreviado ou número 0-6/1-7)
const DIA_ORDEM: Record<string, number> = {
  domingo: 0, dom: 0, "0": 0, "7": 7,
  segunda: 1, seg: 1, "1": 1,
  terca: 2, "terça": 2, ter: 2, "2": 2,
  quarta: 3, qua: 3, "3": 3,
  quinta: 4, qui: 4, "4": 4,
  sexta: 5, sex: 5, "5": 5,
  sabado: 6, "sábado": 6, sab: 6, "6": 6,
};
function ordemDia(d: string): number {
  const k = (d ?? "").toLowerCase().trim();
  return DIA_ORDEM[k] ?? 99;
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-get-workout-plan", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });

    // Perfil (cabeçalho do PDF)
    const { data: profile, error: pErr } = await admin
      .from("physiq_profiles")
      .select("id, nome, user_code, sexo, idade, peso, altura, plano_nome")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile) return jsonErr("not_found", 404, origin);

    // Config da semana (dia -> grupo global OU grupo pessoal)
    const { data: semana, error: sErr } = await admin
      .from("tb_semana_treinos")
      .select("dia_semana, grupo_id, grupo_usuario_id")
      .eq("user_id", userId);
    if (sErr) throw sErr;
    const semanaRows = (semana ?? []).filter((r) => r.grupo_id || r.grupo_usuario_id);

    const grupoIds = [...new Set(semanaRows.map((r) => r.grupo_id).filter(Boolean))];
    const grupoUsuIds = [...new Set(semanaRows.map((r) => r.grupo_usuario_id).filter(Boolean))];

    // Nomes dos grupos (global + pessoal)
    const [gGlob, gUsu] = await Promise.all([
      grupoIds.length
        ? admin.from("tb_grupos_treino").select("id, nome").in("id", grupoIds)
        : Promise.resolve({ data: [] as any[] }),
      grupoUsuIds.length
        ? admin.from("tb_grupos_treino_usuario").select("id, nome").in("id", grupoUsuIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const nomeGrupoGlob = new Map((gGlob.data ?? []).map((g: any) => [g.id, g.nome]));
    const nomeGrupoUsu = new Map((gUsu.data ?? []).map((g: any) => [g.id, g.nome]));

    // Vínculos exercício↔grupo (global e pessoal)
    const [geGlob, geUsu, ordemUsu] = await Promise.all([
      grupoIds.length
        ? admin.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, ordem").in("grupo_id", grupoIds)
        : Promise.resolve({ data: [] as any[] }),
      grupoUsuIds.length
        ? admin.from("tb_grupos_exercicios_usuario")
            .select("grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem")
            .in("grupo_usuario_id", grupoUsuIds)
        : Promise.resolve({ data: [] as any[] }),
      // Reordenação pessoal de exercícios em grupos globais
      grupoIds.length
        ? admin.from("exercicio_ordem_usuario")
            .select("grupo_id, exercicio_id, posicao")
            .eq("user_id", userId)
            .in("grupo_id", grupoIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const posUsu = new Map(
      (ordemUsu.data ?? []).map((o: any) => [`${o.grupo_id}|${o.exercicio_id}`, o.posicao]),
    );

    // Resolver nomes de exercícios (global + pessoal)
    const exGlobIds = [
      ...new Set([
        ...(geGlob.data ?? []).map((r: any) => r.exercicio_id),
        ...(geUsu.data ?? []).map((r: any) => r.exercicio_id).filter(Boolean),
      ]),
    ];
    const exUsuIds = [...new Set((geUsu.data ?? []).map((r: any) => r.exercicio_usuario_id).filter(Boolean))];
    const [exGlob, exUsu] = await Promise.all([
      exGlobIds.length
        ? admin.from("tb_exercicios").select("id, nome, grupo_muscular").in("id", exGlobIds)
        : Promise.resolve({ data: [] as any[] }),
      exUsuIds.length
        ? admin.from("tb_exercicios_usuario").select("id, nome, grupo_muscular").in("id", exUsuIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const exMapGlob = new Map((exGlob.data ?? []).map((e: any) => [e.id, e]));
    const exMapUsu = new Map((exUsu.data ?? []).map((e: any) => [e.id, e]));

    // Exercícios por grupo global
    const exsPorGrupoGlob = new Map<string, any[]>();
    for (const r of geGlob.data ?? []) {
      const ex = exMapGlob.get(r.exercicio_id);
      if (!ex) continue;
      const pos = posUsu.get(`${r.grupo_id}|${r.exercicio_id}`);
      const lista = exsPorGrupoGlob.get(r.grupo_id) ?? [];
      lista.push({ nome: ex.nome, grupo_muscular: ex.grupo_muscular, ordem: pos ?? r.ordem ?? 0 });
      exsPorGrupoGlob.set(r.grupo_id, lista);
    }
    // Exercícios por grupo pessoal
    const exsPorGrupoUsu = new Map<string, any[]>();
    for (const r of geUsu.data ?? []) {
      const ex = r.exercicio_usuario_id ? exMapUsu.get(r.exercicio_usuario_id) : exMapGlob.get(r.exercicio_id);
      if (!ex) continue;
      const lista = exsPorGrupoUsu.get(r.grupo_usuario_id) ?? [];
      lista.push({ nome: ex.nome, grupo_muscular: ex.grupo_muscular, ordem: r.ordem ?? 0 });
      exsPorGrupoUsu.set(r.grupo_usuario_id, lista);
    }

    // Montar a semana ordenada
    const dias = semanaRows
      .map((r) => {
        const pessoal = !!r.grupo_usuario_id;
        const grupoNome = pessoal
          ? nomeGrupoUsu.get(r.grupo_usuario_id) ?? "Treino"
          : nomeGrupoGlob.get(r.grupo_id) ?? "Treino";
        const exercicios = (pessoal
          ? exsPorGrupoUsu.get(r.grupo_usuario_id)
          : exsPorGrupoGlob.get(r.grupo_id)) ?? [];
        exercicios.sort((a, b) => a.ordem - b.ordem);
        return {
          dia_semana: r.dia_semana,
          grupo_nome: grupoNome,
          exercicios: exercicios.map((e) => ({ nome: e.nome, grupo_muscular: e.grupo_muscular ?? null })),
        };
      })
      .sort((a, b) => ordemDia(a.dia_semana) - ordemDia(b.dia_semana));

    return new Response(
      JSON.stringify({ profile, dias }),
      { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } },
    );
  } catch (_e) {
    return jsonErr("internal", 500, origin);
  }
});
