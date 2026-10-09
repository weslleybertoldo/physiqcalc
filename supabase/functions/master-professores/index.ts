// master-professores (SaaS 12/09/2026) — SÓ MASTER: a lista dos professores do Banco do Treino (action: list).
// Physiq hml-14 (H-51 item 7, D10/P4, 08/10/2026): só a `list` ficou — a Biblioteca global do master (src/pages/master/
// BibliotecaPage.tsx: { action: "list", limit: 100 }) mostra o nome do dono de cada exercício. As outras ações (get, invite,
// promote, suspend, reactivate, move-alunos, set-plano, remove, integracoes-list, integracao-set) já respondiam 410 "migrado"
// desde a virada W28 (professores, convites, planos e integrações estão na master-contas do principal) e saíram; o código de
// antes está no histórico do git (178f5d6). Qualquer outra ação responde 410 {"error":"migrado"} antes do login e sem banco.
// Publicar SÓ ASSIM: scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions master-professores true
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { emLotes, todasAsPaginas } from "../_shared/paginas.ts";

// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
const log = criarLog("master-professores", { avisar: avisarErro });

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
const TZ = "America/Sao_Paulo";
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }

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
async function requireMaster(req: Request, endpoint: string): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  // hml-08 (H-22): o master é só do site — o app (WebView do Android: https://localhost; iOS: capacitor://localhost) recebe a
  // recusa; o CORS segue aceitando a origem dele para o APK antigo ler o erro. A barreira de verdade é o 2FA do master.
  if (origin === "https://localhost" || origin === "capacitor://localhost") return { user: null, error: jsonErr("so_no_site", 403, origin) };
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const user = await usuarioDoToken(auth.slice(7), auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const papel = papelDe((user.app_metadata as any)?.role);
  if (papel !== "master") return { user: null, error: jsonErr("forbidden", 403, origin) };
  user.papel = papel;
  if (!checkRateLimit(user.id, endpoint, 120, 60)) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

function hojeISO(): string { return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); }
function addDias(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
// mesma régua do SQL physiq_professor_acesso_ok
function acessoOk(p: any, tolerancia: number, hoje: string): boolean {
  if (p.status !== "ativo") return false;
  if (p.cobranca_pausada) return true;
  if (p.acesso_liberado_ate && p.acesso_liberado_ate >= hoje) return true;
  if (p.trial_ate && p.trial_ate >= hoje) return true;
  if (p.anual_ate && p.anual_ate >= hoje) return true;
  if (p.ciclo_vence_em && addDias(p.ciclo_vence_em, tolerancia) >= hoje) return true;
  return false;
}
async function tolerancia(admin: any): Promise<number> {
  const { data } = await admin.from("app_config").select("value").eq("key", "tolerancia_dias").maybeSingle();
  const n = Number((data as any)?.value);
  return Number.isFinite(n) ? n : 7;
}

const SELECT_PROF = "id, nome, email, foto_url, status, codigo_convite, plano_id, trial_ate, adesao_paga_em, ciclo_inicio, ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada, acesso_liberado_ate, alunos_bloqueados_em, alunos_bloqueados_msg, created_at, physiq_planos_professor(id, nome, valor_mensal, valor_anual, max_alunos)";

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  // Physiq W28 (virada) + hml-14 (D10): só a lista fica; o resto responde "migrado" (410) — antes do login, sem banco
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "list") return jsonErr("migrado", 410, origin);
  const { user, error: authErr } = await requireMaster(req, "master-professores");
  if (authErr) return authErr;
  const acao = "list"; // hml-10 (D6): a ação, para o log do catch final
  try {
    const admin = adminClient();
    const hoje = hojeISO();
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);
    const offset = Math.max(Number(body?.offset) || 0, 0);
    const q = typeof body?.q === "string" ? body.q.trim().replace(/[%,()]/g, " ").slice(0, 80) : "";
    let query = admin.from("physiq_professores").select(SELECT_PROF, { count: "exact" }).order("created_at", { ascending: true }).range(offset, offset + limit - 1);
    if (body?.status === "ativo" || body?.status === "suspenso") query = query.eq("status", body.status);
    if (q) query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%,codigo_convite.ilike.%${q}%`);
    const { data, error, count, status } = await query;
    if (error) {
      // hml-10 (H-24): o erro do PostgREST pode trazer o filtro de volta, com o termo de busca — no log, só o código e o status
      log.erro({ codigo: "lista_falhou", schema: currentSchema(), acao: q ? "buscar" : "listar", status, pg: error.code });
      return jsonErr("internal", 500, origin);
    }
    const ids = ((data as any[]) || []).map((p) => p.id);
    // hml-14 (H-32): os alunos dos professores da página vêm em todas as páginas (o PostgREST corta em 1000 calado e a contagem
    // por professor saía errada) e o erro de cada leitura vai para o catch (antes: 0 alunos e "pix_manual" sem aviso)
    const [alunos, integRes, tol] = await Promise.all([
      emLotes(ids, 150, (lote) =>
        todasAsPaginas<{ professor_id: string }>((de, ate) =>
          admin.from("physiq_profiles").select("professor_id").in("professor_id", lote).order("id").range(de, ate))),
      ids.length ? admin.from("physiq_integracoes").select("professor_id, tipo").in("professor_id", ids) : Promise.resolve({ data: [], error: null }),
      tolerancia(admin),
    ]);
    if (integRes.error) throw integRes.error;
    const nAlunos: Record<string, number> = {};
    for (const a of alunos) nAlunos[a.professor_id] = (nAlunos[a.professor_id] || 0) + 1;
    const integ = new Map(((integRes.data as any[]) || []).map((i) => [i.professor_id, i.tipo]));
    // fila "sem professor" = alunos sem vínculo, excluindo os perfis dos próprios professores (mesma régua do admin-list-users).
    // hml-14 (H-32): os professores vêm todos (antes: até 1000) e a conta é "sem vínculo" − "professores sem vínculo", em lotes
    // de 150 ids (o `not in (todos os ids)` crescia na URL com o número de professores)
    const idsTodosProfs = (await todasAsPaginas<{ id: string }>((de, ate) =>
      admin.from("physiq_professores").select("id").order("id").range(de, ate))).map((p) => p.id);
    const { count: semVinculo, error: semErr } = await admin.from("physiq_profiles").select("id", { count: "exact", head: true }).is("professor_id", null);
    if (semErr) throw semErr;
    const profsSemVinculo = await emLotes(idsTodosProfs, 150, async (lote) => {
      const { count: n, error: loteErr } = await admin.from("physiq_profiles").select("id", { count: "exact", head: true }).is("professor_id", null).in("id", lote);
      if (loteErr) throw loteErr;
      return [n ?? 0];
    });
    const semProfessor = Math.max(0, (semVinculo ?? 0) - profsSemVinculo.reduce((s, n) => s + n, 0));
    const professores = ((data as any[]) || []).map((p) => ({
      ...p, plano: p.physiq_planos_professor ?? null, physiq_planos_professor: undefined,
      alunos: nAlunos[p.id] || 0, integracao: integ.get(p.id) ?? "pix_manual", acessoOk: acessoOk(p, tol, hoje), ehMaster: p.id === user.id,
    }));
    return jsonOk({ professores, total: count ?? professores.length, limit, offset, semProfessor }, origin);
  } catch (e) {
    log.excecao(e, { acao, schema: currentSchema() });
    return jsonErr("internal", 500, origin);
  }
});
