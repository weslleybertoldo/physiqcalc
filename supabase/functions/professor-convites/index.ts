// professor-convites (SaaS 12/09/2026) — STAFF (professor ou master): link/código de convite e convites por e-mail dos ALUNOS.
// actions: link | email | list | revoke | resend
// Professor com plano vencido (fora da tolerância) NÃO convida (403 plano_vencido).
//
// Physiq W13 — os convites de ALUNO passaram para o banco principal (a lista nova do painel e o aceite no 1º login com aquele
// e-mail, C7). Esta função fica no ar para o APK antigo (≤ 3.15, a lista antiga do Calc) e REPASSA email/list/revoke/resend para a
// função alunos do principal (modo servidor, ESPELHO_SEGREDO) — com o LIMITE DA FAIXA da conta (C96, spec 6.4), o P7 e o e-mail
// pelo Resend saindo de lá. O "link" continua daqui (o código do professor é o mesmo nos 2 bancos).
// verify_jwt = true (chamada com o token do Treino do professor). Publicar:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions professor-convites true
// Segredos: PRINCIPAL_URL, ESPELHO_SEGREDO (W2), RESEND_* (não usados desde a W13).
// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";

const log = criarLog("professor-convites", { avisar: avisarErro });

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
const PRINCIPAL_URL = (Deno.env.get("PRINCIPAL_URL") || "").replace(/\/+$/, "");
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }

// ---- Physiq W13: repasse dos convites de aluno para o banco principal (função alunos, modo servidor) ----
/** Erro do principal → o vocabulário que o APK antigo conhece (ConviteAlunoDialog). */
function erroParaApkAntigo(erro: unknown): string {
  switch (String(erro ?? "")) {
    case "email_invalido": return "email_invalido";
    case "limite_plano": return "limite_plano";
    case "outro_profissional": return "aluno_de_outro_professor";
    case "conta_travada": return "plano_vencido";
    case "nao_professor": return "nao_professor";
    case "muitos_convites": return "rate_limited";
    case "convite_inexistente":
    case "convite_nao_pendente": return "not_found";
    case "ja_e_aluno": return "ja_e_aluno";
    case "conta_real_no_staging": return "conta_real_no_staging";
    default: return "internal";
  }
}
function statusParaApkAntigo(status: unknown): "pendente" | "aceito" | "revogado" {
  return status === "aceito" ? "aceito" : status === "pendente" ? "pendente" : "revogado";
}
async function repassarAoPrincipal(treinoUserId: string, corpo: Record<string, unknown>): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!PRINCIPAL_URL || ESPELHO_SEGREDO.length < 32) return { status: 500, corpo: { ok: false, erro: "sem_configuracao" } };
  const { data: v } = await adminClient().from("physiq_identidades").select("principal_user_id").eq("treino_user_id", treinoUserId).maybeSingle();
  const principalId = (v as { principal_user_id?: string } | null)?.principal_user_id;
  if (!principalId) return { status: 404, corpo: { ok: false, erro: "nao_professor" } };
  try {
    const r = await fetch(`${PRINCIPAL_URL}/functions/v1/alunos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-espelho-segredo": ESPELHO_SEGREDO, "x-schema": currentSchema() },
      body: JSON.stringify({ acao: "repasse", principal_user_id: principalId, ...corpo }),
    });
    return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch (e) {
    log.excecao(e, { codigo: "principal_indisponivel", schema: currentSchema(), acao: "repasse" });
    return { status: 502, corpo: { ok: false, erro: "principal_indisponivel" } };
  }
}

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
  let acao: string | null = null; // hml-10 (D6): a ação, para o log do catch final
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    acao = typeof action === "string" ? action.replace(/-/g, "_") : null;
    const { data: prof } = await admin.from("physiq_professores").select("id, nome, codigo_convite, status").eq("id", user.id).maybeSingle();
    if (!prof) return jsonErr("nao_professor", 404, origin);
    // Link público SEMPRE pelo ambiente: o Origin do APK é https://localhost / capacitor://localhost e o do dev é
    // localhost:8080 — nenhum serve pra um aluno abrir. staging → site de staging; public → site oficial.
    const base = (schemaCtx.getStore() || "public") === "staging" ? "https://physiqcalc-staging.vercel.app" : "https://physiqcalc.com.br";

    if (action === "link") {
      return jsonOk({ codigo: (prof as any).codigo_convite, url: `${base}/?prof=${encodeURIComponent((prof as any).codigo_convite)}` }, origin);
    }

    // W13: convite por e-mail → banco principal (o convite fica pendente até a pessoa entrar com aquele e-mail; limite da faixa)
    if (action === "email") {
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonErr("email_invalido", 400, origin);
      const r = await repassarAoPrincipal(user.id, { repasse: "convidar", email });
      if (r.corpo.ok !== true) return jsonErr(erroParaApkAntigo(r.corpo.erro), r.status >= 400 ? r.status : 400, origin);
      const convite = { id: r.corpo.convite_id, email: r.corpo.email, status: "pendente", enviado_em: new Date().toISOString(), aceito_em: null };
      return jsonOk({ vinculado: false, convite, jaExistia: r.corpo.reenvio === true, emailEnviado: r.corpo.email_enviado === true }, origin);
    }

    if (action === "list") {
      const r = await repassarAoPrincipal(user.id, { repasse: "convites" });
      if (r.corpo.ok !== true) return jsonErr(erroParaApkAntigo(r.corpo.erro), r.status >= 400 ? r.status : 400, origin);
      const lista = Array.isArray(r.corpo.convites) ? (r.corpo.convites as Array<Record<string, unknown>>) : [];
      return jsonOk({ convites: lista.map((c) => ({ id: c.id, email: c.email, status: statusParaApkAntigo(c.status), enviado_em: c.enviado_em, aceito_em: c.aceito_em ?? null })) }, origin);
    }

    if (action === "revoke" || action === "resend") {
      const id = body?.id;
      if (!id || typeof id !== "string") return jsonErr("missing_id", 400, origin);
      const r = await repassarAoPrincipal(user.id, { repasse: action === "revoke" ? "cancelar" : "reenviar", convite_id: id });
      if (r.corpo.ok !== true) return jsonErr(erroParaApkAntigo(r.corpo.erro), r.status >= 400 ? r.status : 400, origin);
      const convite = { id, email: r.corpo.email ?? null, status: action === "revoke" ? "revogado" : "pendente", enviado_em: new Date().toISOString(), aceito_em: null };
      return jsonOk({ convite, emailEnviado: r.corpo.email_enviado === true }, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    log.excecao(e, { acao, schema: currentSchema() });
    return jsonErr("internal", 500, origin);
  }
});
