// vincular-professor (SaaS 12/09/2026) — chamado pelo app logo após SIGNED_IN (login só Google).
// body: { codigo?: string }  (código PROF-NOME-SOBRENOME capturado da URL ?prof=)
// Idempotente. Ordem: 1) convite de PROFESSOR pendente pro e-mail → promove; 2) já tem professor → nada;
// 3) convite de ALUNO por e-mail → vincula; 4) código do link → vincula; 5) nada → fila "Sem professor".
//
// Physiq W3 (login único no banco principal) — esta função REPASSA para o principal:
//   · modo app (JWT do Treino): só os APKs antigos (≤ 3.1) ainda chamam. Faz o de sempre e, quando liga um aluno pelo
//     código e a pessoa já tem login no Physiq (physiq_identidades), repassa o vínculo ao principal (vincular-aluno, modo
//     servidor) — a matrícula nasce lá e o espelho mantém o professor aqui;
//   · modo servidor (x-espelho-segredo, chamado pelo pos-login do principal): devolve o que o Calc sabe da pessoa e o
//     principal ainda não — professor do Calc, convite de professor do master pendente (consumido aqui, com o código novo)
//     e aluno de um professor do Calc. O app novo (3.2+) não chama mais esta função: o código vai para o vincular-aluno.
// verify_jwt = false desde a W3 (o modo servidor não tem JWT; o modo app valida o token aqui). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions vincular-professor false   (FORCAR_VERIFY_JWT=1 na 1ª vez)
// Segredos: PRINCIPAL_URL, ESPELHO_SEGREDO (W2).
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
const PRINCIPAL_URL = (Deno.env.get("PRINCIPAL_URL") || "").replace(/\/+$/, "");
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }
function authAdmin() { return createClient(SUPABASE_URL, SERVICE_ROLE); }

// ---- Physiq W3: repasse para o banco principal ----
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = recebido || "";
  const b = esperado || "";
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// o aluno ligado pelo APK antigo ganha a matrícula no principal (se já tem login lá); falha aqui não desfaz o vínculo
type ClienteW3 = ReturnType<typeof adminClient>;
async function repassarAoPrincipal(admin: ClienteW3, treinoUserId: string, codigo: string): Promise<string> {
  if (!PRINCIPAL_URL || ESPELHO_SEGREDO.length < 32) return "sem_configuracao";
  const { data: v } = await admin.from("physiq_identidades").select("principal_user_id").eq("treino_user_id", treinoUserId).maybeSingle();
  const principalId = (v as { principal_user_id?: string } | null)?.principal_user_id;
  if (!principalId) return "sem_login_no_physiq";
  try {
    const r = await fetch(`${PRINCIPAL_URL}/functions/v1/vincular-aluno`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-espelho-segredo": ESPELHO_SEGREDO, "x-schema": currentSchema() },
      body: JSON.stringify({ principal_user_id: principalId, codigo }),
    });
    const corpo = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string };
    return corpo.ok ? "repassado" : `recusado:${corpo.erro ?? r.status}`;
  } catch (e) {
    console.error("vincular-professor: repasse", String(e));
    return "principal_indisponivel";
  }
}

interface LinhaProfessorW3 {
  codigo_convite: string | null; nome: string | null; status: string | null; trial_ate: string | null; adesao_paga_em: string | null;
  ciclo_vence_em: string | null; anual_ate: string | null; cobranca_pausada: boolean | null; acesso_liberado_ate: string | null;
  physiq_planos_professor: { nome: string | null } | null;
}

// modo servidor: o que o Calc sabe desta pessoa (o pos-login do principal cria a conta/matrícula que faltar)
async function legadoDaPessoa(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const admin = adminClient();
  const principalId = typeof body.principal_user_id === "string" && UUID.test(body.principal_user_id) ? body.principal_user_id : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 120) : "";
  let treinoUserId: string | null = null;
  if (principalId) {
    const { data: v } = await admin.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", principalId).maybeSingle();
    treinoUserId = (v as { treino_user_id?: string } | null)?.treino_user_id ?? null;
  }
  // sem vínculo: só procura pelo e-mail quando o login do principal foi Google (a mesma regra da trocar-token)
  if (!treinoUserId && body.google === true && email) {
    const { data: achado } = await admin.rpc("physiq_auth_user_id_por_email", { p_email: email });
    treinoUserId = (achado as string | null) ?? null;
  }
  const saida: Record<string, unknown> = { treino_user_id: treinoUserId, professor: null, convite_professor: null, aluno: null };
  if (treinoUserId) {
    const { data: prof } = await admin.from("physiq_professores")
      .select("codigo_convite, nome, status, trial_ate, adesao_paga_em, ciclo_vence_em, anual_ate, cobranca_pausada, acesso_liberado_ate, physiq_planos_professor(nome)")
      .eq("id", treinoUserId).maybeSingle();
    const p = prof as LinhaProfessorW3 | null;
    if (p) {
      const { data: u } = await authAdmin().auth.admin.getUserById(treinoUserId);
      const role = (u?.user?.app_metadata as { role?: string } | undefined)?.role;
      saida.professor = {
        codigo_convite: p.codigo_convite, nome: p.nome, status: p.status, plano_nome: p.physiq_planos_professor?.nome ?? null,
        trial_ate: p.trial_ate, adesao_paga_em: p.adesao_paga_em, ciclo_vence_em: p.ciclo_vence_em, anual_ate: p.anual_ate,
        cobranca_pausada: p.cobranca_pausada, acesso_liberado_ate: p.acesso_liberado_ate, master: role === "admin" || role === "master",
      };
    } else {
      const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", treinoUserId).maybeSingle();
      const profId = (perfil as { professor_id?: string | null } | null)?.professor_id;
      if (profId) {
        const { data: p2 } = await admin.from("physiq_professores").select("codigo_convite").eq("id", profId).maybeSingle();
        saida.aluno = { professor_codigo: (p2 as { codigo_convite?: string | null } | null)?.codigo_convite ?? null };
      }
    }
  }
  // convite de professor do master pendente pra este e-mail (ainda sem linha de professor): consome e gera o código
  if (!saida.professor && email) {
    const { data: conv } = await admin.from("physiq_convites").select("id").eq("papel", "professor").eq("status", "pendente").ilike("email", email).maybeSingle();
    const conviteId = (conv as { id?: string } | null)?.id;
    if (conviteId) {
      const { data: cod, error: eg } = await admin.rpc("physiq_gerar_codigo_professor", { p_nome: nome || email.split("@")[0] });
      if (eg) throw eg;
      const { data: marcado } = await admin.from("physiq_convites").update({ status: "aceito", aceito_em: new Date().toISOString() })
        .eq("id", conviteId).eq("status", "pendente").select("id").maybeSingle();
      if (marcado) saida.convite_professor = { codigo: cod as string, nome: nome || null };
    }
  }
  return saida;
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
  // Physiq W3: modo servidor (pos-login do banco principal), autenticado pelo segredo do espelho
  const segredo = req.headers.get("x-espelho-segredo");
  if (segredo) {
    if (!segredoConfere(segredo, ESPELHO_SEGREDO)) return jsonErr("segredo_invalido", 401, origin);
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (body.modo !== "servidor") return jsonErr("modo_invalido", 400, origin);
      return jsonOk(await legadoDaPessoa(body), origin);
    } catch (e) {
      console.error("vincular-professor (servidor)", e);
      return jsonErr("internal", 500, origin);
    }
  }
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
    const { data: nomeProf } = await admin.from("physiq_professores").select("nome, codigo_convite").eq("id", professorId).maybeSingle();
    // Physiq W3: a matrícula nasce no principal quando a pessoa já tem login lá
    const prof = nomeProf as { nome?: string | null; codigo_convite?: string | null } | null;
    const repasse = prof?.codigo_convite ? await repassarAoPrincipal(admin, user.id, prof.codigo_convite) : "sem_codigo";
    return jsonOk({ papel: "aluno", vinculado: true, professor: prof?.nome ?? null, principal: repasse }, origin);
  } catch (e) {
    console.error("vincular-professor", e);
    return jsonErr("internal", 500, origin);
  }
});
