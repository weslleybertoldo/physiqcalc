// Physiq W25 — painel-resumo-treino (Banco do Treino). O RESUMO DO TREINO da conta para o Dashboard do painel (tela 6, NF6, P28):
// último treino, treinos feitos e programados dos últimos 7 dias (a adesão), próxima e última avaliação, treinos concluídos e
// recordes recentes (Atividade recente). O painel não lê as tabelas do Treino direto: tudo passa por aqui, só leitura.
//
// POST, headers: Authorization: Bearer <access_token da sessão do TREINO (a da trocar-token)> · x-schema: public|staging.
// Corpo: { conta: <id da conta ativa (o mesmo nos 2 bancos — espelho do núcleo)> }
// 200 → { ok: true, hoje, de, todos, alunos: [...], historico: [...], recordes: [...] } (formato: painel_resumo_treino, migração
//       supabase/migrations/20261001200100_w25_resumo_treino.sql)
// Erros: 401 missing_auth | invalid_token · 403 sem_acesso · 400 conta_invalida · 429 rate_limited · 500 erro_interno
//
// Segurança: verify_jwt = TRUE (o gateway confere a assinatura; aqui o JWT é conferido de novo pelo JWKS do Auth do Treino, como
// as admin-*); quem vê o quê é o banco que decide (a regra da W3: master e o dono da conta veem a conta; o personal, os alunos dele);
// só UMA função de leitura (security definer, só a service_role executa); freio por pessoa e por IP no isolate.
// Leve: 1 ida ao banco por chamada (a VM Nano trava com carga).
//
// PUBLICAR: scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions painel-resumo-treino true
/* eslint-disable @typescript-eslint/no-explicit-any -- função Deno: payload do JWT e resposta da RPC sem os tipos gerados */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const SCHEMAS = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
  "https://physiqcalc-staging.vercel.app",
  "https://physiqcalc.vercel.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const erro = (codigo: string, status: number, origin: string | null) => json({ error: codigo }, status, origin);

// freio no isolate (a tela chama 1 vez ao abrir e no foco): por IP antes de validar o token e por pessoa depois
const janelas = new Map<string, number[]>();
function freio(chave: string, max: number, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) {
    janelas.set(chave, validos);
    return false;
  }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

// JWT conferido LOCALMENTE (JWKS do GoTrue do Treino, cacheado no isolate) — poupa a ida ao /auth/v1/user na VM Nano; token que o
// JWKS não reconhece cai no getUser (a mesma receita das admin-*).
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
async function usuarioDoToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" });
    if (typeof payload.sub === "string" && UUID.test(payload.sub)) return payload.sub;
  } catch (_e) { /* assinatura/alg/kid desconhecido → getUser */ }
  const cliente = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await cliente.auth.getUser(token);
  return error || !data?.user?.id ? null : data.user.id;
}

/** "Hoje" em São Paulo (UTC−3 o ano inteiro desde 2019), AAAA-MM-DD. */
export function hojeSaoPaulo(agora = Date.now()): string {
  return new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";
  if (!freio(`ip:${ip}`, 90)) return erro("rate_limited", 429, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return erro("missing_auth", 401, origin);
  const token = auth.slice(7).trim();

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    corpo = null;
  }
  const conta = corpo?.conta;
  if (typeof conta !== "string" || !UUID.test(conta)) return erro("conta_invalida", 400, origin);

  try {
    const uid = await usuarioDoToken(token);
    if (!uid) return erro("invalid_token", 401, origin);
    if (!freio(`u:${uid}`, 30)) return erro("rate_limited", 429, origin);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    const { data, error } = await admin.rpc("painel_resumo_treino", { p_usuario: uid, p_conta: conta, p_hoje: hojeSaoPaulo() });
    if (error) throw error;
    const r = (data ?? {}) as { ok?: boolean; erro?: string };
    if (r.ok !== true) return erro(r.erro === "sem_acesso" ? "sem_acesso" : "erro_interno", r.erro === "sem_acesso" ? 403 : 500, origin);
    return json(r, 200, origin);
  } catch (e) {
    console.error("painel-resumo-treino", String((e as { message?: string })?.message || e).slice(0, 300));
    return erro("erro_interno", 500, origin);
  }
});
