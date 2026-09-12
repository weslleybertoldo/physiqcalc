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
  const { user, error: authErr } = await requireAdmin(req, "admin-tags", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const action = body?.action;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const professor = user.papel === "professor";
    // ações com userId: professor só mexe em aluno dele
    if (typeof body?.userId === "string" && !(await alunoDoProfessor(admin, user, body.userId))) return jsonErr("forbidden", 403, origin);
    // tag existente: professor só edita/apaga as PRÓPRIAS (as globais são do master)
    const tagMinha = async (tagId: string): Promise<boolean> => {
      if (!professor) return true;
      const { data: t } = await admin.from("physiq_tags").select("professor_id").eq("id", tagId).maybeSingle();
      return (t as any)?.professor_id === user.id;
    };
    // catálogo visível: master = tudo; professor = globais (NULL) + as dele
    const tagsVisiveis = () => {
      let q = admin.from("physiq_tags").select("*").order("nome");
      if (professor) q = q.or(`professor_id.is.null,professor_id.eq.${user.id}`);
      return q;
    };
    if (action === "list-tags" || action === "list") {
      const { data, error } = await tagsVisiveis();
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
    // tags de UM usuario como lista de ids (AdminTagSelector)
    if (action === "getUserTags") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const { data, error } = await admin.from("physiq_user_tags").select("tag_id").eq("user_id", userId);
      if (error) throw error;
      const tagIds = (data ?? []).map((r: { tag_id: string }) => r.tag_id);
      return new Response(JSON.stringify({ tagIds, userTags: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    // tudo que o AdminTagSelector precisa numa chamada só (catálogo + ids do usuário)
    if (action === "getUserTagsCompleto") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const [tagsRes, userTagsRes] = await Promise.all([
        tagsVisiveis(),
        admin.from("physiq_user_tags").select("tag_id").eq("user_id", userId),
      ]);
      if (tagsRes.error) throw tagsRes.error;
      if (userTagsRes.error) throw userTagsRes.error;
      const tagIds = (userTagsRes.data ?? []).map((r: { tag_id: string }) => r.tag_id);
      return new Response(JSON.stringify({ tags: tagsRes.data ?? [], tagIds }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "getAllUserTags") {
      let q = admin.from("physiq_user_tags").select("user_id, tag_id");
      if (professor) {
        // só alunos do professor (lista vazia → filtro impossível, devolve [])
        const { data: alunos } = await admin.from("physiq_profiles").select("id").eq("professor_id", user.id);
        const ids = ((alunos as any[]) || []).map((a) => a.id);
        q = q.in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return new Response(JSON.stringify({ userTags: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "create-tag" || action === "create") {
      const nome = body?.tag?.nome ?? body?.nome;
      const cor = body?.tag?.cor ?? body?.cor ?? null;
      if (!nome || typeof nome !== "string") return jsonErr("missing_nome", 400, origin);
      // tag do professor leva o dono; do master fica global (NULL)
      const { data, error } = await admin.from("physiq_tags").insert({ nome: nome.trim(), cor, professor_id: professor ? user.id : null }).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ tag: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "update-tag" || action === "update") {
      const tagId = body?.tagId;
      const nome = body?.tag?.nome ?? body?.nome;
      const cor = body?.tag?.cor ?? body?.cor ?? null;
      if (!tagId || typeof tagId !== "string") return jsonErr("missing_tagId", 400, origin);
      if (!nome || typeof nome !== "string") return jsonErr("missing_nome", 400, origin);
      if (!(await tagMinha(tagId))) return jsonErr("forbidden", 403, origin);
      const { data, error } = await admin.from("physiq_tags").update({ nome: nome.trim(), cor }).eq("id", tagId).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ tag: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "delete-tag" || action === "delete") {
      const tagId = body?.tagId;
      if (!tagId || typeof tagId !== "string") return jsonErr("missing_tagId", 400, origin);
      if (!(await tagMinha(tagId))) return jsonErr("forbidden", 403, origin);
      const { error } = await admin.from("physiq_user_tags").delete().eq("tag_id", tagId);
      if (error) throw error;
      const { error: e2 } = await admin.from("physiq_tags").delete().eq("id", tagId);
      if (e2) throw e2;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    // substitui o conjunto de tags de um usuario (AdminTagSelector)
    if (action === "setUserTags") {
      const userId = body?.userId;
      const tagIds = body?.tagIds;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!Array.isArray(tagIds)) return jsonErr("missing_tagIds", 400, origin);
      const { error: delErr } = await admin.from("physiq_user_tags").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      if (tagIds.length > 0) {
        const rows = tagIds.map((t: string) => ({ user_id: userId, tag_id: t }));
        const { error: insErr } = await admin.from("physiq_user_tags").insert(rows);
        if (insErr) throw insErr;
      }
      return new Response(JSON.stringify({ ok: true, tagIds }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
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
