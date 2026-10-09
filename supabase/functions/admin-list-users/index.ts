import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { todasAsPaginas } from "../_shared/paginas.ts";
import { filtrosDaBusca } from "./busca.ts";
// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
const log = criarLog("admin-list-users", { avisar: avisarErro });
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
// Physiq W3: a regra mora no banco (pode_ver_aluno_treino): master, o professor responsável ou o DONO da conta do aluno
// (espelho do núcleo — o dono vê todos os alunos da conta; o personal, só os dele)
async function alunoDoProfessor(admin: any, user: any, alunoId: string): Promise<boolean> {
  if (alunoId && alunoId === user?.id) return true; // o professor abre o PRÓPRIO perfil (aluno de si mesmo, 18/09/2026)
  if (user?.papel === "master") return true;
  if (!alunoId || !user?.id) return false;
  const { data, error } = await admin.rpc("pode_ver_aluno_treino_por", { p_aluno: alunoId, p_usuario: user.id });
  if (error) {
    // schema ainda sem a função da W3 (a migração entra 1 schema de cada vez): vale a regra de antes
    log.excecao(error, { codigo: "pode_ver_aluno_falhou", schema: currentSchema() });
    const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", alunoId).maybeSingle();
    return (perfil as { professor_id?: string } | null)?.professor_id === user.id;
  }
  return data === true;
}

// Physiq W3: contas em que o usuário é DONO no espelho (a lista soma os alunos delas — spec 8.2, P1)
const _UUID_W3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type _ClienteRpcW3 = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
async function contasOndeSouDono(admin: _ClienteRpcW3, userId: string): Promise<string[]> {
  const { data, error } = await admin.rpc("contas_onde_sou_dono_treino", { p_usuario: userId });
  if (error) {
    log.excecao(error, { codigo: "contas_onde_sou_dono_falhou", schema: currentSchema() });
    return [];
  }
  return ((data as unknown[]) || [])
    .map((x) => (typeof x === "string" ? x : (x as { contas_onde_sou_dono_treino?: unknown } | null)?.contas_onde_sou_dono_treino))
    .filter((x): x is string => typeof x === "string" && _UUID_W3.test(x));
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

// Lista de alunos com escopo por papel + paginação (SaaS 12/09/2026). Desde 18/09/2026 a lista do professor
// (e a do Admin do master) traz também o PRÓPRIO perfil dele.
// body opcional: { limit (1..100, padrão 20), offset, q (nome/email/user_code), professorId (só master), semProfessor (só master), todos (só master: sem paginar),
// ordem ("nome" — hml-14d) }
// Contrato aditivo: `users` continua; `total/limit/offset` são novos. Sem body (bundle antigo) → professor recebe os dele
// e o master recebe TODOS (como antes), paginados em 100 só se `limit` vier.
// hml-14d (B19 · D22b, D27): `q` sem acento ("jose" acha "José": imatch com as variantes de cada letra — busca.ts); `ordem: "nome"`
// (o seletor do Histórico/Relatório do painel) = nome + id; sem `ordem`, a de sempre (mais novo primeiro) com o desempate pelo id.
// A resposta não muda ({ users, total, limit, offset }).
Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireAdmin(req, "admin-list-users", 60, 60);
  if (authErr) return authErr;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const paginar = body?.limit !== undefined || body?.offset !== undefined;
    const limit = paginar ? Math.min(Math.max(Number(body?.limit) || 20, 1), 100) : 1000;
    const offset = paginar ? Math.max(Number(body?.offset) || 0, 0) : 0;
    const busca = typeof body?.q === "string" ? body.q.trim().slice(0, 80) : "";
    const master = user.papel === "master";
    // master pode filtrar por professor ou pegar a fila "sem professor"; professor é forçado ao próprio escopo
    const professorId: string | null = master ? (typeof body?.professorId === "string" ? body.professorId : null) : user.id;
    const semProfessor = master && body?.semProfessor === true;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const sel = admin.from("physiq_profiles")
      .select("id, nome, email, user_code, plano_nome, plano_expiracao, status, admin_locked, foto_url, created_at, professor_id, mensalidade_valor", { count: "exact" });
    // hml-14d (D27): ordem estável — sem o desempate pelo id, alunos com o mesmo created_at pulavam ou repetiam entre as páginas
    let q = (body?.ordem === "nome" ? sel.order("nome").order("id") : sel.order("created_at", { ascending: false }).order("id"))
      .range(offset, offset + limit - 1);
    if (semProfessor) {
      // fila "Sem professor" = alunos sem vínculo; professores/master têm perfil próprio (professor_id NULL) e ficam de fora.
      // hml-14 (H-32): os professores vêm todos, em páginas (antes: até 1000, calado), e o erro vai para o catch (antes: a fila
      // passava a listar os perfis dos professores, sem aviso). O `not in` cresce com o nº de professores (4 hoje).
      const profs = await todasAsPaginas<{ id: string }>((de, ate) =>
        admin.from("physiq_professores").select("id").order("id").range(de, ate));
      q = q.is("professor_id", null);
      const idsProf = profs.map((p) => p.id);
      if (idsProf.length) q = q.not("id", "in", `(${idsProf.join(",")})`);
    } else if (professorId) {
      // O professor enxerga o PRÓPRIO perfil na sua lista de alunos (pedido do Weslley 18/09/2026: "o acesso do
      // professor sempre manter") — o perfil dele tem professor_id NULL por desenho do SaaS. Só quando lista a si
      // mesmo (professorId === user.id, uuid vindo do JWT); o master filtrando OUTRO professor não muda.
      if (professorId === user.id) {
        const contas = await contasOndeSouDono(admin, user.id);
        const extra = contas.length ? `,conta_id.in.(${contas.join(",")})` : "";
        q = q.or(`professor_id.eq.${user.id},id.eq.${user.id}${extra}`);
      } else {
        q = q.eq("professor_id", professorId);
      }
    }
    if (busca) {
      // hml-14d (D22b): nome e e-mail sem acento, termo escapado (o que a pessoa digita nunca vira operador do filtro nem da regex)
      const partes = filtrosDaBusca(busca);
      if (partes.length) q = q.or(partes.join(","));
    }
    const { data, error, count, status } = await q;
    if (error) {
      // hml-10 (H-24): o erro do PostgREST pode trazer o filtro de volta, com o termo de busca — no log, só o código e o status
      log.erro({ codigo: "lista_falhou", schema: currentSchema(), acao: busca ? "buscar" : "listar", status, pg: error.code });
      return jsonErr("internal", 500, origin);
    }
    return new Response(JSON.stringify({ users: data ?? [], total: count ?? (data?.length ?? 0), limit, offset }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  } catch (e) {
    log.excecao(e, { acao: "listar", schema: currentSchema() });
    return jsonErr("internal", 500, origin);
  }
});
