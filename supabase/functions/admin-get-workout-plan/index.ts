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

// Rate limit em MEMÓRIA do isolate — esta função só LÊ: poupa a ida ao banco (RPC check_rate_limit
// ~80 ms na VM Nano). As funções que escrevem continuam com o check_rate_limit do banco.
const janelasRate = new Map<string, number[]>();
async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  const agora = Date.now();
  const chave = `${endpoint}:${userId}`;
  const validos = (janelasRate.get(chave) ?? []).filter((t) => t > agora - windowSecs * 1000);
  if (validos.length >= maxCount) {
    janelasRate.set(chave, validos);
    return false;
  }
  validos.push(agora);
  janelasRate.set(chave, validos);
  return true;
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
  const { user, error: authErr } = await requireAdmin(req, "admin-get-workout-plan", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);

    // Perfil (cabeçalho do PDF)
    const { data: profile, error: pErr } = await admin
      .from("physiq_profiles")
      .select("id, nome, user_code, sexo, idade, peso, altura, plano_nome, series_padrao_qtd")
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

    // Nomes dos grupos (global + pessoal) + nº de séries configurado pro aluno
    const [gGlob, gUsu, seriesCfg] = await Promise.all([
      grupoIds.length
        ? admin.from("tb_grupos_treino").select("id, nome").in("id", grupoIds)
        : Promise.resolve({ data: [] as any[] }),
      grupoUsuIds.length
        ? admin.from("tb_grupos_treino_usuario").select("id, nome").in("id", grupoUsuIds)
        : Promise.resolve({ data: [] as any[] }),
      admin.from("tb_series_padrao_usuario")
        .select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series")
        .eq("user_id", userId),
    ]);
    if (seriesCfg.error) throw seriesCfg.error;
    const nomeGrupoGlob = new Map((gGlob.data ?? []).map((g: any) => [g.id, g.nome]));
    const nomeGrupoUsu = new Map((gUsu.data ?? []).map((g: any) => [g.id, g.nome]));

    // Nº de séries de cada exercício no PDF = o mesmo que o app do aluno monta (src/lib/seriesPadrao.ts):
    // linha do EXERCÍCIO > linha GERAL do treino > padrão (3). Antes o PDF imprimia "3" fixo (18/09/2026).
    // padrão do ALUNO (aba Configuração, 18/09/2026): physiq_profiles.series_padrao_qtd; sem ele, 3
    const qtdPerfil = Number((profile as any).series_padrao_qtd);
    const SERIES_PADRAO_ALUNO = Number.isInteger(qtdPerfil) && qtdPerfil >= 1 ? Math.min(10, qtdPerfil) : 3;
    const chaveTreino = (gid: string | null, guid: string | null): string | null =>
      guid ? `pessoal:${guid}` : gid ? `catalogo:${gid}` : null;
    const chaveExercicio = (exid: string | null, exuid: string | null): string | null =>
      exuid ? `exu:${exuid}` : exid ? `ex:${exid}` : null;
    const clampSeries = (n: number): number => Math.min(10, Math.max(1, Math.round(n)));
    const mapaSeries = new Map<string, number>();
    for (const r of (seriesCfg.data ?? []) as any[]) {
      const treino = chaveTreino(r.grupo_id ?? null, r.grupo_usuario_id ?? null);
      if (!treino || r.num_series == null || !Number.isFinite(Number(r.num_series))) continue;
      const ex = chaveExercicio(r.exercicio_id ?? null, r.exercicio_usuario_id ?? null);
      mapaSeries.set(ex ? `${treino}|${ex}` : treino, clampSeries(Number(r.num_series)));
    }
    const numSeriesDe = (treino: string | null, exid: string | null, exuid: string | null): number => {
      if (!treino) return SERIES_PADRAO_ALUNO;
      const ex = chaveExercicio(exid, exuid);
      const proprio = ex ? mapaSeries.get(`${treino}|${ex}`) : undefined;
      return proprio ?? mapaSeries.get(treino) ?? SERIES_PADRAO_ALUNO;
    };

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
      lista.push({
        nome: ex.nome, grupo_muscular: ex.grupo_muscular, ordem: pos ?? r.ordem ?? 0,
        exercicio_id: r.exercicio_id ?? null, exercicio_usuario_id: null,
      });
      exsPorGrupoGlob.set(r.grupo_id, lista);
    }
    // Exercícios por grupo pessoal
    const exsPorGrupoUsu = new Map<string, any[]>();
    for (const r of geUsu.data ?? []) {
      const ex = r.exercicio_usuario_id ? exMapUsu.get(r.exercicio_usuario_id) : exMapGlob.get(r.exercicio_id);
      if (!ex) continue;
      const lista = exsPorGrupoUsu.get(r.grupo_usuario_id) ?? [];
      lista.push({
        nome: ex.nome, grupo_muscular: ex.grupo_muscular, ordem: r.ordem ?? 0,
        exercicio_id: r.exercicio_usuario_id ? null : (r.exercicio_id ?? null),
        exercicio_usuario_id: r.exercicio_usuario_id ?? null,
      });
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
        const treino = chaveTreino(r.grupo_id ?? null, r.grupo_usuario_id ?? null);
        return {
          dia_semana: r.dia_semana,
          grupo_nome: grupoNome,
          exercicios: exercicios.map((e) => ({
            nome: e.nome,
            grupo_muscular: e.grupo_muscular ?? null,
            num_series: numSeriesDe(treino, e.exercicio_id, e.exercicio_usuario_id),
          })),
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
