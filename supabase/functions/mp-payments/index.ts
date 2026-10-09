// Physiq hml-14 (H-51 item 7, D10/P4, 08/10/2026): mp-payments do Banco do Treino virou CASCA — só o `status-lite` ficou; toda
// outra ação (e o pedido sem ação) responde 410 {"error":"migrado"} antes do login e sem banco. O resto já respondia "migrado"
// desde a W6 (a cobrança do aluno foi para a pagamentos-aluno do principal) e a W28 (o plano do professor foi para a
// cobranca-conta), e não rodava mais (34 leituras e 13 gravações sem conferir o erro, o fetch do Mercado Pago sem tempo). O
// código de antes está no histórico do git (178f5d6). Não lê mais o token do Mercado Pago.
// O `status-lite` fica porque as versões do app de antes da W28 parte 2 (6d8ef45) ainda o chamam na abertura (10 POST de
// Android em 7 dias) — e delas só o `bloqueadoPeloMaster` vale (o master pausou os alunos do profissional: o espelho do núcleo
// grava isso no Treino, physiq_aluno_bloqueado). A mensalidade é a do principal: aqui sai sempre "em dia", como desde a W6.
// Fica `cobertura.ts` nesta pasta: o Vitest importa (src/lib/cobertura.test.ts, src/financeiro/regras.test.ts).
// Publicar SÓ ASSIM: scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions mp-payments true
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";

// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
const log = criarLog("mp-payments", { avisar: avisarErro });

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
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TZ = "America/Sao_Paulo";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
}

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId, p_endpoint: endpoint, p_max_count: maxCount, p_window_secs: windowSecs,
    });
    if (error) return true;
    return data === true;
  } catch { return true; }
}

// JWT validado LOCALMENTE (JWKS do GoTrue, cacheado no isolate) — poupa a ida ao /auth/v1/user
// na VM Nano a cada chamada. Token que o JWKS não reconhece cai no getUser (compatibilidade).
// O status-lite só lê: vale a regra das leituras (JWKS; sessão revogada só é percebida quando o token expira, 1 h).
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

async function requireUser(req: Request): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const user = await usuarioDoToken(token, auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const allowed = await checkRateLimit(user.id, "mp-payments", 30, 60);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

function mesRefAtual(): string {
  // primeiro dia do mês corrente em BRT
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesLabel(mesRef: string): string {
  const [y, m] = mesRef.split("-");
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[parseInt(m, 10) - 1]}/${y}`;
}

/** A resposta do status-lite desde a W6 (o app antigo guarda tudo por 6 h, mas só usa o bloqueadoPeloMaster). */
function statusLite(bloqueadoPeloMaster: boolean) {
  const mesRef = mesRefAtual();
  return { migrado: true, mensalidade: null, emDia: true, mesPago: true, pagoAte: null, mesRef, mesLabel: mesLabel(mesRef), bloqueadoPeloMaster };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  // hml-14 (D10): fora o status-lite, tudo "migrado" — antes do login, sem banco
  const body = await req.json().catch(() => null);
  if (body?.action !== "status-lite") return jsonErr("migrado", 410, origin);

  const { user, error: authErr } = await requireUser(req);
  if (authErr) return authErr;
  try {
    const { data: bloq, error } = await adminClient().rpc("physiq_aluno_bloqueado", { uid: user.id });
    if (error) throw error;
    return jsonOk(statusLite(bloq === true), origin);
  } catch (e) {
    // hml-14 (H-32; era a GRAVE mp-payments:506): sem saber, responde BLOQUEADO (falha fechada). Antes o erro virava
    // `bloqueadoPeloMaster: false` e liberava o aluno que o master pausou; e um 500 também liberaria — o app antigo engole o erro
    // e segue sem a trava (6d8ef45^:src/hooks/useMensalidadeStatus.ts:32-34 e src/lib/mpClient.ts:99-100). Ele guarda a resposta
    // por 6 h (mpClient.ts:121, :187): um erro do banco trava o aluno do app antigo até a próxima leitura.
    log.excecao(e, { acao: "status_lite", schema: currentSchema() });
    return jsonOk(statusLite(true), origin);
  }
});
