// vincular-professor (SaaS 12/09/2026) — chamado pelo app logo após SIGNED_IN (login só Google).
// body: { codigo?: string }  (código PROF-NOME-SOBRENOME capturado da URL ?prof=)
// Idempotente. Ordem: 1) convite de PROFESSOR pendente pro e-mail → promove; 2) já tem professor → nada;
// 3) convite de ALUNO por e-mail → vincula; 4) código do link → vincula; 5) nada → fila "Sem professor".
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
function jsonOk(body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}
function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }
function authAdmin() { return createClient(SUPABASE_URL, SERVICE_ROLE); }

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

async function requireUser(req: Request): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const user = await usuarioDoToken(token, auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  if (!checkRateLimit(user.id, "vincular-professor", 20, 60)) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

function hojeISO(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
function addDias(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}

// promove o usuário a PROFESSOR: linha em physiq_professores (código fixo, plano Start, trial), integração pix_manual, claim no JWT
async function promoverProfessor(admin: any, userId: string, email: string | null, nome: string, criadoPor: string | null) {
  const [{ data: cod }, { data: trialCfg }, { data: start }] = await Promise.all([
    admin.rpc("physiq_gerar_codigo_professor", { p_nome: nome }),
    admin.from("app_config").select("value").eq("key", "trial_dias").maybeSingle(),
    admin.from("physiq_planos_professor").select("id").eq("nome", "Start").maybeSingle(),
  ]);
  const trialDias = Number((trialCfg as any)?.value) || 14;
  const { data: existente } = await admin.from("physiq_professores").select("id, codigo_convite").eq("id", userId).maybeSingle();
  let codigo = (existente as any)?.codigo_convite as string | undefined;
  if (!existente) {
    codigo = cod as string;
    const { error } = await admin.from("physiq_professores").insert({
      id: userId, nome, email, codigo_convite: codigo, plano_id: (start as any)?.id ?? null, trial_ate: addDias(hojeISO(), trialDias), status: "ativo",
    });
    if (error) throw error;
  }
  await admin.from("physiq_integracoes").upsert({ professor_id: userId, tipo: "pix_manual" }, { onConflict: "professor_id", ignoreDuplicates: true });
  // o professor também tem perfil (é usuário do app) — se não tiver, cria
  await admin.from("physiq_profiles").upsert({ id: userId, nome, email }, { onConflict: "id", ignoreDuplicates: true });
  const aa = authAdmin();
  const { data: u } = await aa.auth.admin.getUserById(userId);
  const meta = { ...((u?.user?.app_metadata as Record<string, unknown>) || {}) };
  if (meta.role !== "admin" && meta.role !== "master") meta.role = "professor";
  await aa.auth.admin.updateUserById(userId, { app_metadata: meta });
  return { codigo, promovidoPor: criadoPor };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireUser(req);
  if (authErr) return authErr;
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const codigo = typeof body?.codigo === "string" ? body.codigo.trim().toUpperCase().slice(0, 60) : null;
    const email = (user.email || "").toLowerCase();
    const role = (user.app_metadata as any)?.role;
    const nome = ((user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || email.split("@")[0] || "Professor") as string;

    // 1. convite de PROFESSOR pendente para este e-mail → promove (mesmo que ainda não tenha perfil)
    const { data: convProf } = email
      ? await admin.from("physiq_convites").select("id, criado_por").eq("papel", "professor").eq("status", "pendente").ilike("email", email).maybeSingle()
      : { data: null };
    if (convProf) {
      const { codigo: cod } = await promoverProfessor(admin, user.id, user.email, nome, (convProf as any).criado_por);
      await admin.from("physiq_convites").update({ status: "aceito", aceito_em: new Date().toISOString() }).eq("id", (convProf as any).id);
      return jsonOk({ papel: "professor", codigo: cod, refresh: true }, origin);
    }
    // staff já é staff: nada a vincular
    if (role === "admin" || role === "master") return jsonOk({ papel: "master", vinculado: false, motivo: "ja_master" }, origin);
    if (role === "professor") return jsonOk({ papel: "professor", vinculado: false, motivo: "ja_professor" }, origin);

    // 2. aluno: já tem professor? não mexe (só o master move)
    const { data: perfil } = await admin.from("physiq_profiles").select("id, professor_id").eq("id", user.id).maybeSingle();
    if ((perfil as any)?.professor_id) return jsonOk({ papel: "aluno", vinculado: false, motivo: "ja_tem_professor" }, origin);
    // perfil ainda não existe (trigger atrasado / conta antiga sem perfil): cria pra poder vincular
    if (!perfil) await admin.from("physiq_profiles").upsert({ id: user.id, nome, email: user.email }, { onConflict: "id", ignoreDuplicates: true });

    // 3. convite de ALUNO por e-mail tem prioridade sobre o código do link
    let professorId: string | null = null;
    let conviteId: string | null = null;
    const { data: convAluno } = email
      ? await admin.from("physiq_convites").select("id, professor_id").eq("papel", "aluno").eq("status", "pendente").ilike("email", email).order("enviado_em", { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    if (convAluno?.professor_id) { professorId = (convAluno as any).professor_id; conviteId = (convAluno as any).id; }
    else if (codigo) {
      const { data: prof } = await admin.from("physiq_professores").select("id, status").eq("codigo_convite", codigo).maybeSingle();
      if (!prof) return jsonErr("codigo_invalido", 404, origin);
      if ((prof as any).status !== "ativo") return jsonErr("professor_inativo", 409, origin);
      professorId = (prof as any).id;
    }
    if (!professorId) return jsonOk({ papel: "aluno", vinculado: false, motivo: "sem_codigo" }, origin); // fila "Sem professor" do master
    if (professorId === user.id) return jsonOk({ papel: "aluno", vinculado: false, motivo: "proprio_codigo" }, origin);

    const { data: pode } = await admin.rpc("physiq_professor_pode_convidar", { pid: professorId });
    if (pode !== true) return jsonErr("limite_plano", 409, origin);
    const { error } = await admin.from("physiq_profiles").update({ professor_id: professorId }).eq("id", user.id).is("professor_id", null);
    if (error) throw error;
    if (conviteId) await admin.from("physiq_convites").update({ status: "aceito", aceito_em: new Date().toISOString() }).eq("id", conviteId);
    const { data: nomeProf } = await admin.from("physiq_professores").select("nome").eq("id", professorId).maybeSingle();
    return jsonOk({ papel: "aluno", vinculado: true, professor: (nomeProf as any)?.nome ?? null }, origin);
  } catch (e) {
    console.error("vincular-professor", e);
    return jsonErr("internal", 500, origin);
  }
});
