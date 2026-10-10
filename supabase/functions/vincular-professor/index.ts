// vincular-professor (SaaS 12/09/2026) — chamado pelo app logo após SIGNED_IN (login só Google).
// body: { codigo?: string }  (código PROF-NOME-SOBRENOME capturado da URL ?prof=)
// Idempotente. Ordem: 1) convite de PROFESSOR pendente pro e-mail → promove; 2) já tem professor → nada;
// 3) convite de ALUNO por e-mail → vincula; 4) código do link → vincula; 5) nada → fila "Sem professor".
//
// Physiq W3 (login único no banco principal) — esta função REPASSA para o principal:
//   · modo app (JWT do Treino): só os APKs antigos (≤ 3.1) ainda chamam. Faz o de sempre e, quando liga um aluno pelo
//     código e a pessoa já tem login no Physiq (physiq_identidades), repassa o vínculo ao principal (vincular-aluno, modo
//     servidor) — a matrícula nasce lá e o espelho mantém o professor aqui;
//   · modo servidor (x-espelho-segredo, chamado pelo pos-login do principal — hml-16c, S2: o pos-login manda SEGREDO_PONTE_CALC;
//     aqui fica só o hash, em SEGREDO_PONTE_CALC_ACEITOS; aceitou → log segredo_aceito com acao ponte_calc e resultado
//     lista | legado): devolve o que o Calc sabe da pessoa e o
//     principal ainda não — professor do Calc, convite de professor do master pendente (consumido aqui, com o código novo)
//     e aluno de um professor do Calc. O app novo (3.2+) não chama mais esta função: o código vai para o vincular-aluno.
// verify_jwt = false desde a W3 (o modo servidor não tem JWT; o modo app valida o token aqui). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions vincular-professor false   (FORCAR_VERIFY_JWT=1 na 1ª vez)
// Segredos: PRINCIPAL_URL, SEGREDO_PONTE_CALC_ACEITOS (recebe, S2) e SEGREDO_REPASSE_VINCULO (manda à vincular-aluno, S5) —
// _shared/segredo-servidor.ts (hml-16c); até o F7, também o legado ESPELHO_SEGREDO nos 2 sentidos.
// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
// hml-14 (H-32): o repasse ao principal espera no máximo TEMPO_MS.principal (vincular-aluno: máx. medido 1,1 s; estourou → o
// principal_indisponivel de sempre); erro do banco lança (o catch responde 500 e avisa) — antes virava "não tem" calado; o
// vínculo do APK antigo confere a linha gravada (sem linha mudada: nada de convite aceito, repasse nem vinculado: true).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { TEMPO_MS, buscarComTempo, tempoEsgotado } from "../_shared/tempo.ts";
import { segredoAceito, segredoParaEnviar } from "../_shared/segredo-servidor.ts";

const log = criarLog("vincular-professor", { avisar: avisarErro });

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
const SEGREDO_REPASSE_VINCULO = segredoParaEnviar("SEGREDO_REPASSE_VINCULO");
function adminClient() { return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } }); }
function authAdmin() { return createClient(SUPABASE_URL, SERVICE_ROLE); }

// ---- Physiq W3: repasse para o banco principal ----
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// o aluno ligado pelo APK antigo ganha a matrícula no principal (se já tem login lá); falha aqui não desfaz o vínculo
type ClienteW3 = ReturnType<typeof adminClient>;
async function repassarAoPrincipal(admin: ClienteW3, treinoUserId: string, codigo: string): Promise<string> {
  if (!PRINCIPAL_URL || !SEGREDO_REPASSE_VINCULO) return "sem_configuracao";
  const { data: v, error: ev } = await admin.from("physiq_identidades").select("principal_user_id").eq("treino_user_id", treinoUserId).maybeSingle();
  if (ev) throw ev; // hml-14 (H-32): antes virava "sem_login_no_physiq" calado
  const principalId = (v as { principal_user_id?: string } | null)?.principal_user_id;
  if (!principalId) return "sem_login_no_physiq";
  try {
    const r = await buscarComTempo(`${PRINCIPAL_URL}/functions/v1/vincular-aluno`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-espelho-segredo": SEGREDO_REPASSE_VINCULO, "x-schema": currentSchema() },
      body: JSON.stringify({ principal_user_id: principalId, codigo }),
    }, TEMPO_MS.principal);
    // o tempo vale até ler o corpo: estourou no meio dele → o catch (não um "recusado" sem corpo)
    const corpo = (await r.json().catch((e) => {
      if (tempoEsgotado(e)) throw e;
      return {};
    })) as { ok?: boolean; erro?: string };
    return corpo.ok ? "repassado" : `recusado:${corpo.erro ?? r.status}`;
  } catch (e) {
    log.excecao(e, { codigo: "principal_indisponivel", schema: currentSchema(), acao: "repasse" });
    return "principal_indisponivel";
  }
}

interface LinhaProfessorW3 {
  codigo_convite: string | null; nome: string | null; status: string | null; trial_ate: string | null; adesao_paga_em: string | null;
  ciclo_vence_em: string | null; anual_ate: string | null; cobranca_pausada: boolean | null; acesso_liberado_ate: string | null;
  physiq_planos_professor: { nome: string | null } | null;
}

// modo servidor: o que o Calc sabe desta pessoa (o pos-login do principal cria a conta/matrícula que faltar)
// hml-14 (H-32): erro do banco ou do Auth lança → 500 (o pos-login registra, o login segue e a ponte tenta de novo no próximo
// login) — antes cada leitura que falhava virava "não tem" e o pos-login decidia com a resposta errada
async function legadoDaPessoa(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const admin = adminClient();
  const principalId = typeof body.principal_user_id === "string" && UUID.test(body.principal_user_id) ? body.principal_user_id : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 120) : "";
  let treinoUserId: string | null = null;
  if (principalId) {
    const { data: v, error: ev } = await admin.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", principalId).maybeSingle();
    if (ev) throw ev;
    treinoUserId = (v as { treino_user_id?: string } | null)?.treino_user_id ?? null;
  }
  // sem vínculo: só procura pelo e-mail quando o login do principal foi Google (a mesma regra da trocar-token)
  if (!treinoUserId && body.google === true && email) {
    const { data: achado, error: ea } = await admin.rpc("physiq_auth_user_id_por_email", { p_email: email });
    if (ea) throw ea;
    treinoUserId = (achado as string | null) ?? null;
  }
  const saida: Record<string, unknown> = { treino_user_id: treinoUserId, professor: null, convite_professor: null, aluno: null };
  if (treinoUserId) {
    const { data: prof, error: ep } = await admin.from("physiq_professores")
      .select("codigo_convite, nome, status, trial_ate, adesao_paga_em, ciclo_vence_em, anual_ate, cobranca_pausada, acesso_liberado_ate, physiq_planos_professor(nome)")
      .eq("id", treinoUserId).maybeSingle();
    if (ep) throw ep;
    const p = prof as LinhaProfessorW3 | null;
    if (p) {
      const { data: u, error: eu } = await authAdmin().auth.admin.getUserById(treinoUserId);
      if (eu) throw eu; // sem ler o login, o master viraria master: false
      const role = (u?.user?.app_metadata as { role?: string } | undefined)?.role;
      saida.professor = {
        codigo_convite: p.codigo_convite, nome: p.nome, status: p.status, plano_nome: p.physiq_planos_professor?.nome ?? null,
        trial_ate: p.trial_ate, adesao_paga_em: p.adesao_paga_em, ciclo_vence_em: p.ciclo_vence_em, anual_ate: p.anual_ate,
        cobranca_pausada: p.cobranca_pausada, acesso_liberado_ate: p.acesso_liberado_ate, master: role === "admin" || role === "master",
      };
    } else {
      const { data: perfil, error: epf } = await admin.from("physiq_profiles").select("professor_id").eq("id", treinoUserId).maybeSingle();
      if (epf) throw epf;
      const profId = (perfil as { professor_id?: string | null } | null)?.professor_id;
      if (profId) {
        const { data: p2, error: ep2 } = await admin.from("physiq_professores").select("codigo_convite").eq("id", profId).maybeSingle();
        if (ep2) throw ep2;
        saida.aluno = { professor_codigo: (p2 as { codigo_convite?: string | null } | null)?.codigo_convite ?? null };
      }
    }
  }
  // convite de professor do master pendente pra este e-mail (ainda sem linha de professor): consome e gera o código
  if (!saida.professor && email) {
    const { data: conv, error: ec } = await admin.from("physiq_convites").select("id").eq("papel", "professor").eq("status", "pendente").eq("email", email).maybeSingle();
    if (ec) throw ec;
    const conviteId = (conv as { id?: string } | null)?.id;
    if (conviteId) {
      const { data: cod, error: eg } = await admin.rpc("physiq_gerar_codigo_professor", { p_nome: nome || email.split("@")[0] });
      if (eg) throw eg;
      // sem linha marcada = outro pedido já consumiu o convite; erro do banco lança (antes parecia "outro consumiu")
      const { data: marcado, error: em } = await admin.from("physiq_convites").update({ status: "aceito", aceito_em: new Date().toISOString() })
        .eq("id", conviteId).eq("status", "pendente").select("id").maybeSingle();
      if (em) throw em;
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
// hml-14 (H-32): leituras e gravações conferem o erro — antes o trial (14 dias) e o plano (nenhum) eram gravados com o padrão
// calado, a integração e o perfil podiam não nascer e, sem ler o login, o papel admin/master virava "professor"
async function promoverProfessor(admin: any, userId: string, email: string | null, nome: string, criadoPor: string | null) {
  const [{ data: cod, error: e1 }, { data: trialCfg, error: e2 }, { data: start, error: e3 }] = await Promise.all([
    admin.rpc("physiq_gerar_codigo_professor", { p_nome: nome }),
    admin.from("app_config").select("value").eq("key", "trial_dias").maybeSingle(),
    admin.from("physiq_planos_professor").select("id").eq("nome", "Start").maybeSingle(),
  ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;
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
  const { error: ei } = await admin.from("physiq_integracoes").upsert({ professor_id: userId, tipo: "pix_manual" }, { onConflict: "professor_id", ignoreDuplicates: true });
  if (ei) throw ei;
  // o professor também tem perfil (é usuário do app) — se não tiver, cria
  const { error: epf } = await admin.from("physiq_profiles").upsert({ id: userId, nome, email }, { onConflict: "id", ignoreDuplicates: true });
  if (epf) throw epf;
  const aa = authAdmin();
  const { data: u, error: eu } = await aa.auth.admin.getUserById(userId);
  if (eu) throw eu;
  const meta = { ...((u?.user?.app_metadata as Record<string, unknown>) || {}) };
  if (meta.role !== "admin" && meta.role !== "master") meta.role = "professor";
  const { error: eup } = await aa.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (eup) throw eup;
  return { codigo, promovidoPor: criadoPor };
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  // Physiq W3: modo servidor (pos-login do banco principal), autenticado pelo segredo da ponte do Calc (S2, hml-16c)
  const segredo = req.headers.get("x-espelho-segredo");
  if (segredo) {
    const via = await segredoAceito(segredo, "SEGREDO_PONTE_CALC");
    if (!via) return jsonErr("segredo_invalido", 401, origin);
    log.info({ codigo: "segredo_aceito", schema: currentSchema(), acao: "ponte_calc", resultado: via });
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (body.modo !== "servidor") return jsonErr("modo_invalido", 400, origin);
      return jsonOk(await legadoDaPessoa(body), origin);
    } catch (e) {
      log.excecao(e, { acao: "servidor", schema: currentSchema() });
      return jsonErr("internal", 500, origin);
    }
  }
  const { user, error: authErr } = await requireUser(req);
  if (authErr) return authErr;
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const codigo = typeof body?.codigo === "string" ? body.codigo.trim().toUpperCase().slice(0, 60) : null;
    const email = (user.email || "").trim().toLowerCase();
    const role = (user.app_metadata as any)?.role;
    const nome = ((user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || email.split("@")[0] || "Professor") as string;

    // 1. convite de PROFESSOR pendente para este e-mail → promove (mesmo que ainda não tenha perfil)
    // hml-14 (H-32): erro do banco lança (antes virava "sem convite" e a pessoa seguia como aluno)
    const { data: convProf, error: ecp } = email
      ? await admin.from("physiq_convites").select("id, criado_por").eq("papel", "professor").eq("status", "pendente").eq("email", email).maybeSingle()
      : { data: null, error: null };
    if (ecp) throw ecp;
    if (convProf) {
      const { codigo: cod } = await promoverProfessor(admin, user.id, user.email, nome, (convProf as any).criado_por);
      const { error: eac } = await admin.from("physiq_convites").update({ status: "aceito", aceito_em: new Date().toISOString() }).eq("id", (convProf as any).id);
      if (eac) throw eac;
      return jsonOk({ papel: "professor", codigo: cod, refresh: true }, origin);
    }
    // staff já é staff: nada a vincular
    if (role === "admin" || role === "master") return jsonOk({ papel: "master", vinculado: false, motivo: "ja_master" }, origin);
    if (role === "professor") return jsonOk({ papel: "professor", vinculado: false, motivo: "ja_professor" }, origin);

    // 2. aluno: já tem professor? não mexe (só o master move)
    // hml-14 (H-32): sem ler o perfil → 500 (antes seguia como "sem professor" e respondia vinculado: true sem vincular)
    const { data: perfil, error: epf } = await admin.from("physiq_profiles").select("id, professor_id").eq("id", user.id).maybeSingle();
    if (epf) throw epf;
    if ((perfil as any)?.professor_id) return jsonOk({ papel: "aluno", vinculado: false, motivo: "ja_tem_professor" }, origin);
    // perfil ainda não existe (trigger atrasado / conta antiga sem perfil): cria pra poder vincular
    if (!perfil) {
      const { error: ecr } = await admin.from("physiq_profiles").upsert({ id: user.id, nome, email: user.email }, { onConflict: "id", ignoreDuplicates: true });
      if (ecr) throw ecr;
    }

    // 3. convite de ALUNO por e-mail tem prioridade sobre o código do link
    let professorId: string | null = null;
    let conviteId: string | null = null;
    const { data: convAluno, error: eca } = email
      ? await admin.from("physiq_convites").select("id, professor_id").eq("papel", "aluno").eq("status", "pendente").eq("email", email).order("enviado_em", { ascending: false }).limit(1).maybeSingle()
      : { data: null, error: null };
    if (eca) throw eca; // hml-14 (H-32): antes o código do link passava na frente do convite
    if (convAluno?.professor_id) { professorId = (convAluno as any).professor_id; conviteId = (convAluno as any).id; }
    else if (codigo) {
      const { data: prof, error: ep } = await admin.from("physiq_professores").select("id, status").eq("codigo_convite", codigo).maybeSingle();
      if (ep) throw ep; // hml-14 (H-32): antes "codigo_invalido" com o banco fora
      if (!prof) return jsonErr("codigo_invalido", 404, origin);
      if ((prof as any).status !== "ativo") return jsonErr("professor_inativo", 409, origin);
      professorId = (prof as any).id;
    }
    if (!professorId) return jsonOk({ papel: "aluno", vinculado: false, motivo: "sem_codigo" }, origin); // fila "Sem professor" do master
    if (professorId === user.id) return jsonOk({ papel: "aluno", vinculado: false, motivo: "proprio_codigo" }, origin);

    const { data: pode } = await admin.rpc("physiq_professor_pode_convidar", { pid: professorId });
    if (pode !== true) return jsonErr("limite_plano", 409, origin);
    // hml-14 (H-32): confere a linha gravada — o perfil existe (lido ou criado acima), então nenhuma linha mudada quer dizer que
    // outro pedido ligou um professor depois da leitura (a trava .is): é o "ja_tem_professor", sem convite, repasse nem vínculo
    const { data: ligado, error } = await admin.from("physiq_profiles").update({ professor_id: professorId }).eq("id", user.id).is("professor_id", null).select("id");
    if (error) throw error;
    if (!ligado?.length) return jsonOk({ papel: "aluno", vinculado: false, motivo: "ja_tem_professor" }, origin);
    if (conviteId) {
      const { error: eac } = await admin.from("physiq_convites").update({ status: "aceito", aceito_em: new Date().toISOString() }).eq("id", conviteId);
      if (eac) throw eac;
    }
    const { data: nomeProf, error: enp } = await admin.from("physiq_professores").select("nome, codigo_convite").eq("id", professorId).maybeSingle();
    if (enp) throw enp; // hml-14 (H-32): antes o repasse ao principal não saía ("sem_codigo") e ninguém sabia
    // Physiq W3: a matrícula nasce no principal quando a pessoa já tem login lá
    const prof = nomeProf as { nome?: string | null; codigo_convite?: string | null } | null;
    const repasse = prof?.codigo_convite ? await repassarAoPrincipal(admin, user.id, prof.codigo_convite) : "sem_codigo";
    return jsonOk({ papel: "aluno", vinculado: true, professor: prof?.nome ?? null, principal: repasse }, origin);
  } catch (e) {
    log.excecao(e, { acao: "app", schema: currentSchema() });
    return jsonErr("internal", 500, origin);
  }
});
