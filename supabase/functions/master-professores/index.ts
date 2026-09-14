// master-professores (SaaS 12/09/2026) — SÓ MASTER: gestão dos professores, movimentação de alunos e integrações.
// actions: list | get | invite | promote | suspend | reactivate | move-alunos | set-plano | remove | integracoes-list | integracao-set
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
const TZ = "America/Sao_Paulo";
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

type Papel = "master" | "professor";
function papelDe(role: unknown): Papel | null {
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return null;
}
async function requireMaster(req: Request, endpoint: string): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
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

// promove o usuário a PROFESSOR (mesma lógica da edge vincular-professor)
async function promoverProfessor(admin: any, userId: string, email: string | null, nome: string) {
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
  await admin.from("physiq_profiles").upsert({ id: userId, nome, email }, { onConflict: "id", ignoreDuplicates: true });
  const aa = authAdmin();
  const { data: u } = await aa.auth.admin.getUserById(userId);
  const meta = { ...((u?.user?.app_metadata as Record<string, unknown>) || {}) };
  if (meta.role !== "admin" && meta.role !== "master") meta.role = "professor";
  const { error: metaErr } = await aa.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (metaErr) throw metaErr;
  return codigo;
}

const SELECT_PROF = "id, nome, email, foto_url, status, codigo_convite, plano_id, trial_ate, adesao_paga_em, ciclo_inicio, ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada, acesso_liberado_ate, alunos_bloqueados_em, alunos_bloqueados_msg, created_at, physiq_planos_professor(id, nome, valor_mensal, valor_anual, max_alunos)";

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { user, error: authErr } = await requireMaster(req, "master-professores");
  if (authErr) return authErr;
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const hoje = hojeISO();

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);
      const offset = Math.max(Number(body?.offset) || 0, 0);
      const q = typeof body?.q === "string" ? body.q.trim().replace(/[%,()]/g, " ").slice(0, 80) : "";
      let query = admin.from("physiq_professores").select(SELECT_PROF, { count: "exact" }).order("created_at", { ascending: true }).range(offset, offset + limit - 1);
      if (body?.status === "ativo" || body?.status === "suspenso") query = query.eq("status", body.status);
      if (q) query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%,codigo_convite.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      const ids = ((data as any[]) || []).map((p) => p.id);
      const [alunosRes, integRes, tol] = await Promise.all([
        ids.length ? admin.from("physiq_profiles").select("professor_id").in("professor_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? admin.from("physiq_integracoes").select("professor_id, tipo").in("professor_id", ids) : Promise.resolve({ data: [] }),
        tolerancia(admin),
      ]);
      const nAlunos: Record<string, number> = {};
      for (const a of ((alunosRes.data as any[]) || [])) nAlunos[a.professor_id] = (nAlunos[a.professor_id] || 0) + 1;
      const integ = new Map(((integRes.data as any[]) || []).map((i) => [i.professor_id, i.tipo]));
      // fila "sem professor" = alunos sem vínculo, excluindo os perfis dos próprios professores (mesma régua do admin-list-users)
      const { data: todosProfs } = await admin.from("physiq_professores").select("id");
      const idsTodosProfs = ((todosProfs as any[]) || []).map((p) => p.id);
      let semQ = admin.from("physiq_profiles").select("id", { count: "exact", head: true }).is("professor_id", null);
      if (idsTodosProfs.length) semQ = semQ.not("id", "in", `(${idsTodosProfs.join(",")})`);
      const { count: semProfessor } = await semQ;
      const professores = ((data as any[]) || []).map((p) => ({
        ...p, plano: p.physiq_planos_professor ?? null, physiq_planos_professor: undefined,
        alunos: nAlunos[p.id] || 0, integracao: integ.get(p.id) ?? "pix_manual", acessoOk: acessoOk(p, tol, hoje), ehMaster: p.id === user.id,
      }));
      return jsonOk({ professores, total: count ?? professores.length, limit, offset, semProfessor: semProfessor ?? 0 }, origin);
    }

    if (action === "get") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const [{ data: p }, { count }, { data: integ }, tol] = await Promise.all([
        admin.from("physiq_professores").select(SELECT_PROF).eq("id", userId).maybeSingle(),
        admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", userId),
        admin.from("physiq_integracoes").select("tipo, status, config").eq("professor_id", userId).maybeSingle(),
        tolerancia(admin),
      ]);
      if (!p) return jsonErr("not_found", 404, origin);
      return jsonOk({ professor: { ...(p as any), plano: (p as any).physiq_planos_professor ?? null, physiq_planos_professor: undefined, alunos: count ?? 0, integracao: (integ as any)?.tipo ?? "pix_manual", integracaoConfig: (integ as any)?.config ?? {}, acessoOk: acessoOk(p, tol, hoje), ehMaster: (p as any).id === user.id } }, origin);
    }

    // convite por e-mail: se a pessoa já tem conta (perfil no ambiente), promove na hora; senão fica pendente até ela entrar com Google
    if (action === "invite") {
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonErr("email_invalido", 400, origin);
      const { data: perfil } = await admin.from("physiq_profiles").select("id, nome, email").ilike("email", email).limit(1).maybeSingle();
      if (perfil) {
        const { data: jaProf } = await admin.from("physiq_professores").select("id").eq("id", (perfil as any).id).maybeSingle();
        if (jaProf) return jsonErr("ja_professor", 409, origin);
        const codigo = await promoverProfessor(admin, (perfil as any).id, (perfil as any).email, (perfil as any).nome || email.split("@")[0]);
        return jsonOk({ promovido: true, userId: (perfil as any).id, codigo }, origin);
      }
      const { data: existente } = await admin.from("physiq_convites").select("id").eq("papel", "professor").eq("status", "pendente").ilike("email", email).maybeSingle();
      if (existente) return jsonOk({ promovido: false, convite: existente, jaExistia: true }, origin);
      const { data: conv, error } = await admin.from("physiq_convites").insert({ email, papel: "professor", criado_por: user.id }).select().single();
      if (error) throw error;
      return jsonOk({ promovido: false, convite: conv }, origin);
    }

    if (action === "promote") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const { data: perfil } = await admin.from("physiq_profiles").select("id, nome, email").eq("id", userId).maybeSingle();
      if (!perfil) return jsonErr("not_found", 404, origin);
      const { data: jaProf } = await admin.from("physiq_professores").select("id").eq("id", userId).maybeSingle();
      if (jaProf) return jsonErr("ja_professor", 409, origin);
      const codigo = await promoverProfessor(admin, userId, (perfil as any).email, (perfil as any).nome || ((perfil as any).email || "professor").split("@")[0]);
      return jsonOk({ ok: true, codigo }, origin);
    }

    if (action === "suspend" || action === "reactivate") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (userId === user.id) return jsonErr("nao_pode_suspender_master", 400, origin);
      const { data, error } = await admin.from("physiq_professores").update({ status: action === "suspend" ? "suspenso" : "ativo" }).eq("id", userId).select("id, status").maybeSingle();
      if (error) throw error;
      if (!data) return jsonErr("not_found", 404, origin);
      return jsonOk({ ok: true, professor: data }, origin);
    }

    // move alunos entre professores (paraId = null → fila "Sem professor")
    if (action === "move-alunos") {
      const deId = typeof body?.deId === "string" ? body.deId : null;
      const paraId = typeof body?.paraId === "string" ? body.paraId : null;
      const alunoIds: string[] | null = Array.isArray(body?.alunoIds) ? body.alunoIds.filter((x: unknown) => typeof x === "string").slice(0, 500) : null;
      if (!alunoIds && !deId) return jsonErr("missing_alunos", 400, origin);
      if (paraId) {
        const { data: destino } = await admin.from("physiq_professores").select("id, status, plano_id, physiq_planos_professor(max_alunos)").eq("id", paraId).maybeSingle();
        if (!destino || (destino as any).status !== "ativo") return jsonErr("destino_invalido", 400, origin);
        const max = (destino as any).physiq_planos_professor?.max_alunos ?? null;
        if (max !== null) {
          const { count: atuais } = await admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", paraId);
          let movendo = 0;
          if (alunoIds) movendo = alunoIds.length;
          else { const { count } = await admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", deId); movendo = count ?? 0; }
          if ((atuais ?? 0) + movendo > max) return jsonErr("limite_plano_destino", 409, origin);
        }
      }
      let q = admin.from("physiq_profiles").update({ professor_id: paraId });
      if (alunoIds) q = q.in("id", alunoIds); else q = q.eq("professor_id", deId);
      // nunca transforma um professor em aluno de outro por acidente
      const { data: profs } = await admin.from("physiq_professores").select("id");
      const idsProf = ((profs as any[]) || []).map((p) => p.id);
      if (idsProf.length) q = q.not("id", "in", `(${idsProf.join(",")})`);
      const { data, error } = await q.select("id");
      if (error) throw error;
      return jsonOk({ ok: true, movidos: (data as any[])?.length ?? 0 }, origin);
    }

    if (action === "set-plano") {
      const userId = body?.userId;
      const planoId = body?.planoId ?? null;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const { data: p } = await admin.from("physiq_professores").select("id, plano_id").eq("id", userId).maybeSingle();
      if (!p) return jsonErr("not_found", 404, origin);
      if (planoId) {
        const { data: pl } = await admin.from("physiq_planos_professor").select("id").eq("id", planoId).maybeSingle();
        if (!pl) return jsonErr("plano_invalido", 400, origin);
      }
      const { error } = await admin.from("physiq_professores").update({ plano_id: planoId }).eq("id", userId);
      if (error) throw error;
      await admin.from("physiq_planos_professor_hist").insert({ plano_id: planoId, professor_id: userId, alterado_por: user.id, antes: { plano_id: (p as any).plano_id }, depois: { plano_id: planoId, por: "master" } });
      return jsonOk({ ok: true }, origin);
    }

    // remove o papel de professor (só sem alunos); a pessoa volta a ser aluno comum
    if (action === "remove") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (userId === user.id) return jsonErr("nao_pode_remover_master", 400, origin);
      const { count } = await admin.from("physiq_profiles").select("id", { count: "exact", head: true }).eq("professor_id", userId);
      if ((count ?? 0) > 0) return jsonErr("tem_alunos", 409, origin);
      const { error } = await admin.from("physiq_professores").delete().eq("id", userId);
      if (error) throw error;
      const aa = authAdmin();
      const { data: u } = await aa.auth.admin.getUserById(userId);
      const meta = { ...((u?.user?.app_metadata as Record<string, unknown>) || {}) };
      if (meta.role === "professor") { delete meta.role; await aa.auth.admin.updateUserById(userId, { app_metadata: meta }); }
      return jsonOk({ ok: true }, origin);
    }

    if (action === "integracoes-list") {
      const [{ data: profs }, { data: integ }] = await Promise.all([
        admin.from("physiq_professores").select("id, nome, email, status, pix_chave, pix_tipo, pix_exibir").order("nome"),
        admin.from("physiq_integracoes").select("professor_id, tipo, status, config, atualizado_em"),
      ]);
      const mapa = new Map(((integ as any[]) || []).map((i) => [i.professor_id, i]));
      return jsonOk({
        integracoes: ((profs as any[]) || []).map((p) => ({
          professorId: p.id, nome: p.nome, email: p.email, status: p.status, temPix: !!p.pix_chave, pixExibir: p.pix_exibir,
          tipo: mapa.get(p.id)?.tipo ?? "pix_manual", config: mapa.get(p.id)?.config ?? {}, atualizadoEm: mapa.get(p.id)?.atualizado_em ?? null, ehMaster: p.id === user.id,
        })),
      }, origin);
    }

    if (action === "integracao-set") {
      const professorId = body?.professorId;
      const tipo = body?.tipo;
      if (!professorId || typeof professorId !== "string") return jsonErr("missing_professorId", 400, origin);
      if (!["pix_manual", "none", "mercadopago"].includes(tipo)) return jsonErr("tipo_invalido", 400, origin);
      // Mercado Pago só na conta do próprio master (fase 8a = MP de cada professor)
      if (tipo === "mercadopago" && professorId !== user.id) return jsonErr("mercadopago_so_master", 400, origin);
      const { error } = await admin.from("physiq_integracoes").upsert({ professor_id: professorId, tipo, atualizado_em: new Date().toISOString() }, { onConflict: "professor_id" });
      if (error) throw error;
      return jsonOk({ ok: true, tipo }, origin);
    }

    return jsonErr("unknown_action", 400, origin);
  } catch (e) {
    console.error("master-professores", e);
    return jsonErr("internal", 500, origin);
  }
});
