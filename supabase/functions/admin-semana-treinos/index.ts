/* eslint-disable @typescript-eslint/no-explicit-any -- função Deno: as respostas do supabase-js (service_role, sem os tipos gerados) são `any` desde sempre neste arquivo */
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
const DIAS = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId, p_endpoint: endpoint, p_max_count: maxCount, p_window_secs: windowSecs,
    });
    if (error) return true;
    return data === true;
  } catch { return true; }
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
    console.error("pode_ver_aluno_treino_por", error.message);
    const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", alunoId).maybeSingle();
    return (perfil as { professor_id?: string } | null)?.professor_id === user.id;
  }
  return data === true;
}

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60, leitura = false): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const user = await usuarioDoToken(token, auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (user.app_metadata as any)?.role;
  const papel = papelDe(role);
  if (!papel) {
    // Physiq W15: quem não tem papel no Treino (o DONO da conta que não é personal — spec 4.1: "Treino: dono vê") só LÊ,
    // e só o aluno que a regra do banco deixa (pode_ver_aluno_treino_por, conferida depois pelo alunoDoProfessor)
    if (!leitura) return { user: null, error: jsonErr("forbidden", 403, origin) };
    user.papel = "leitor";
    const permitido = await checkRateLimit(user.id, endpoint, maxCount, windowSecs);
    if (!permitido) return { user: null, error: jsonErr("rate_limited", 429, origin) };
    return { user, error: null };
  }
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

async function gruposDisponiveis(admin: any, userId: string): Promise<{ catalogo: Set<string>; pessoal: Set<string>; lista: any[] }> {
  const [perf, pess] = await Promise.all([
    admin.from("tb_grupos_treino_perfis").select("grupo_id, tb_grupos_treino(id, nome, professor_id)").eq("user_id", userId),
    admin.from("tb_grupos_treino_usuario").select("id, nome").eq("user_id", userId),
  ]);
  const catalogo = new Set<string>();
  const lista: any[] = [];
  ((perf.data as any[]) || []).forEach((p) => {
    if (p.grupo_id) {
      catalogo.add(p.grupo_id);
      // W15: professor_id (null = global do master) — o editor decide se muda a lista direto ou faz a cópia só do aluno
      lista.push({ id: p.grupo_id, nome: p.tb_grupos_treino?.nome ?? "(grupo)", tipo: "catalogo", professor_id: p.tb_grupos_treino?.professor_id ?? null });
    }
  });
  const pessoal = new Set<string>();
  ((pess.data as any[]) || []).forEach((g) => { pessoal.add(g.id); lista.push({ id: g.id, nome: g.nome, tipo: "pessoal" }); });
  return { catalogo, pessoal, lista };
}

/** W15: campos do exercício que o editor da tela 8 mostra (GIF, "grupo · subgrupo", tipo, classificação da W9) — opcionais. */
function detalheExercicio(e: any) {
  return {
    grupo_muscular: e?.grupo_muscular ?? null,
    subgrupo: e?.subgrupo ?? null,
    imagem_url: e?.imagem_url ?? null,
    tipo: e?.tipo ?? null,
    padrao_movimento: e?.padrao_movimento ?? null,
    equipamento: e?.equipamento ?? null,
  };
}

/** Exercícios de um treino: catálogo (tb_grupos_exercicios) ou pessoal (tb_grupos_exercicios_usuario) */
async function exerciciosDoTreino(admin: any, userId: string, gid: string | null, guid: string | null) {
  let links: { exercicio_id: string | null; exercicio_usuario_id: string | null; ordem: number }[] = [];
  if (gid) {
    const r = await admin.from("tb_grupos_exercicios").select("exercicio_id, ordem").eq("grupo_id", gid).order("ordem");
    if (r.error) throw r.error;
    links = ((r.data as any[]) || []).map((l) => ({ exercicio_id: l.exercicio_id, exercicio_usuario_id: null, ordem: l.ordem ?? 0 }));
  } else {
    const r = await admin.from("tb_grupos_exercicios_usuario")
      .select("exercicio_id, exercicio_usuario_id, ordem").eq("grupo_usuario_id", guid).eq("user_id", userId).order("ordem");
    if (r.error) throw r.error;
    links = ((r.data as any[]) || []).map((l) => ({ exercicio_id: l.exercicio_id ?? null, exercicio_usuario_id: l.exercicio_usuario_id ?? null, ordem: l.ordem ?? 0 }));
  }
  const idsCat = links.map((l) => l.exercicio_id).filter(Boolean) as string[];
  const idsPes = links.map((l) => l.exercicio_usuario_id).filter(Boolean) as string[];
  const [cat, pes] = await Promise.all([
    idsCat.length ? admin.from("tb_exercicios").select("id, nome, emoji, grupo_muscular, subgrupo, imagem_url, tipo, padrao_movimento, equipamento").in("id", idsCat) : Promise.resolve({ data: [], error: null }),
    idsPes.length ? admin.from("tb_exercicios_usuario").select("id, nome, emoji, grupo_muscular, tipo").in("id", idsPes).eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (cat.error) throw cat.error;
  if (pes.error) throw pes.error;
  const porIdCat = new Map(((cat.data as any[]) || []).map((e) => [e.id, e]));
  const porIdPes = new Map(((pes.data as any[]) || []).map((e) => [e.id, e]));
  const vistos = new Set<string>();
  const saida: any[] = [];
  for (const l of links) {
    const e = l.exercicio_usuario_id ? porIdPes.get(l.exercicio_usuario_id) : porIdCat.get(l.exercicio_id as string);
    const chave = l.exercicio_usuario_id ? `exu:${l.exercicio_usuario_id}` : `ex:${l.exercicio_id}`;
    if (!e || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ exercicio_id: l.exercicio_id, exercicio_usuario_id: l.exercicio_usuario_id, nome: e.nome, emoji: e.emoji ?? "🏋️", ordem: l.ordem, ...detalheExercicio(e) });
  }
  return saida;
}

/** exercícios de TODOS os treinos disponíveis do usuário, em 2 rodadas de queries (popup abre na hora) */
async function exerciciosPorTreino(admin: any, userId: string, lista: any[]): Promise<Record<string, any[]>> {
  const gids = lista.filter((g) => g.tipo === "catalogo").map((g) => g.id);
  const guids = lista.filter((g) => g.tipo === "pessoal").map((g) => g.id);
  const vazio = Promise.resolve({ data: [], error: null });
  const [cat, pes] = await Promise.all([
    gids.length ? admin.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, ordem").in("grupo_id", gids).order("ordem") : vazio,
    guids.length
      ? admin.from("tb_grupos_exercicios_usuario").select("grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem")
          .in("grupo_usuario_id", guids).eq("user_id", userId).order("ordem")
      : vazio,
  ]);
  if (cat.error) throw cat.error;
  if (pes.error) throw pes.error;
  const links = [
    ...((cat.data as any[]) || []).map((l) => ({ key: `catalogo:${l.grupo_id}`, exercicio_id: l.exercicio_id as string | null, exercicio_usuario_id: null as string | null, ordem: l.ordem ?? 0 })),
    ...((pes.data as any[]) || []).map((l) => ({ key: `pessoal:${l.grupo_usuario_id}`, exercicio_id: (l.exercicio_id ?? null) as string | null, exercicio_usuario_id: (l.exercicio_usuario_id ?? null) as string | null, ordem: l.ordem ?? 0 })),
  ];
  const idsCat = [...new Set(links.map((l) => l.exercicio_id).filter(Boolean))] as string[];
  const idsPes = [...new Set(links.map((l) => l.exercicio_usuario_id).filter(Boolean))] as string[];
  const [ec, ep] = await Promise.all([
    idsCat.length ? admin.from("tb_exercicios").select("id, nome, emoji, grupo_muscular, subgrupo, imagem_url, tipo, padrao_movimento, equipamento").in("id", idsCat) : vazio,
    idsPes.length ? admin.from("tb_exercicios_usuario").select("id, nome, emoji, grupo_muscular, tipo").in("id", idsPes).eq("user_id", userId) : vazio,
  ]);
  if (ec.error) throw ec.error;
  if (ep.error) throw ep.error;
  const porIdCat = new Map(((ec.data as any[]) || []).map((e) => [e.id, e]));
  const porIdPes = new Map(((ep.data as any[]) || []).map((e) => [e.id, e]));
  const saida: Record<string, any[]> = {};
  const vistos = new Set<string>();
  for (const g of lista) saida[`${g.tipo}:${g.id}`] = [];
  for (const l of links) {
    const e = l.exercicio_usuario_id ? porIdPes.get(l.exercicio_usuario_id) : porIdCat.get(l.exercicio_id as string);
    const chave = `${l.key}|${l.exercicio_usuario_id ? `exu:${l.exercicio_usuario_id}` : `ex:${l.exercicio_id}`}`;
    if (!e || vistos.has(chave)) continue;
    vistos.add(chave);
    (saida[l.key] ||= []).push({ exercicio_id: l.exercicio_id, exercicio_usuario_id: l.exercicio_usuario_id, nome: e.nome, emoji: e.emoji ?? "🏋️", ordem: l.ordem, ...detalheExercicio(e) });
  }
  return saida;
}

/**
 * W15 — a LISTA de exercícios de um treino do catálogo pode mudar direto (só para este aluno)? Só quando o treino é de quem
 * mexe ou do professor do aluno, só este aluno o recebe e ele não está em nenhuma pasta (pasta = modelo). Global do master
 * (professor_id null), de outro professor, com mais alunos ou numa pasta → vira antes uma cópia só do aluno.
 */
function listaDireta(professorId: string | null, alunos: number, emPasta: boolean, quem: string, professorDoAluno: string | null): boolean {
  if (!professorId) return false;
  if (professorId !== quem && professorId !== professorDoAluno) return false;
  return alunos <= 1 && !emPasta;
}

/** W15 — colunas da prescrição opcional (NF1: repetições, descanso, carga · NF2: observação do treino) */
const COLS_PRESCRICAO = "reps_alvo, descanso_segundos, carga_sugerida_kg, observacao";
const temPrescricao = (l: any): boolean =>
  (l?.reps_alvo != null && String(l.reps_alvo).trim() !== "") || l?.descanso_segundos != null || l?.carga_sugerida_kg != null
  || (l?.observacao != null && String(l.observacao).trim() !== "");

// ───────────────────────── W15 — editor do treino no perfil do aluno (tela 8, lado esquerdo) ─────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Repetições-alvo (NF1): "10" ou a faixa "8-12" (1 a 999); vazio = sem prescrição (como hoje). */
function lerReps(v: unknown): { ok: boolean; valor: string | null } {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return { ok: true, valor: null };
  const t = (typeof v === "number" ? String(v) : typeof v === "string" ? v : "").trim().replace(/\s*[-–]\s*/, "-");
  const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(t);
  if (!m) return { ok: false, valor: null };
  const a = Number(m[1]);
  const b = m[2] !== undefined ? Number(m[2]) : null;
  if (a < 1 || (b !== null && b <= a)) return { ok: false, valor: null };
  return { ok: true, valor: b !== null ? `${a}-${b}` : String(a) };
}

/** Inteiro entre min e max; vazio = null (quando `vazio` vale). */
function lerInteiro(v: unknown, min: number, max: number, vazio = true): { ok: boolean; valor: number | null } {
  if (v === null || v === undefined || v === "") return { ok: vazio, valor: null };
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, valor: null };
  return { ok: true, valor: n };
}

/** Carga sugerida (NF1) em kg: 0,25 a 999,75 com até 2 casas; vazio = sem carga. */
function lerCarga(v: unknown): { ok: boolean; valor: number | null } {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0.25 || n > 999.75) return { ok: false, valor: null };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

function lerData(v: unknown): { ok: boolean; valor: string | null } {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, valor: null };
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { ok: false, valor: null };
  return { ok: true, valor: v };
}

async function professorDoAluno(admin: any, aluno: string): Promise<string | null> {
  const { data, error } = await admin.from("physiq_profiles").select("professor_id").eq("id", aluno).maybeSingle();
  if (error) throw error;
  return (data as { professor_id?: string | null } | null)?.professor_id ?? null;
}

/**
 * A lista de exercícios deste treino do catálogo pode mudar só para este aluno? Se não pode (treino compartilhado, global,
 * de outro professor ou numa pasta), vira antes uma cópia só dele (physiq_treino_personalizar, 1 transação no banco).
 */
async function listaDoAluno(admin: any, user: any, aluno: string, gid: string): Promise<{ gid: string; personalizado: boolean }> {
  const [g, perfis, pastas, prof] = await Promise.all([
    admin.from("tb_grupos_treino").select("professor_id").eq("id", gid).maybeSingle(),
    admin.from("tb_grupos_treino_perfis").select("user_id").eq("grupo_id", gid),
    admin.from("tb_pastas_treino_grupos").select("grupo_id").eq("grupo_id", gid).limit(1),
    professorDoAluno(admin, aluno),
  ]);
  if (g.error) throw g.error;
  if (perfis.error) throw perfis.error;
  if (pastas.error) throw pastas.error;
  const professorId = (g.data as { professor_id?: string | null } | null)?.professor_id ?? null;
  if (listaDireta(professorId, ((perfis.data as any[]) || []).length, ((pastas.data as any[]) || []).length > 0, user.id, prof)) {
    return { gid, personalizado: false };
  }
  const { data: novo, error } = await admin.rpc("physiq_treino_personalizar", { p_aluno: aluno, p_grupo: gid, p_dono: prof ?? user.id });
  if (error) throw error;
  return { gid: String(novo), personalizado: true };
}

/** O exercício da biblioteca que o aluno enxerga no app (globais do master + os do professor dele — sync-config.yaml). */
async function exercicioVisivelAoAluno(admin: any, exid: string, prof: string | null): Promise<boolean> {
  const { data, error } = await admin.from("tb_exercicios").select("id, professor_id").eq("id", exid).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const dono = (data as { professor_id?: string | null }).professor_id ?? null;
  return dono === null || (prof !== null && dono === prof);
}

// ───────────────────────── W23 — Painel › Treinos (modelos) ─────────────────────────

const temPrescricaoDoModelo = (l: any): boolean =>
  l?.num_series != null || (l?.reps_alvo != null && String(l.reps_alvo).trim() !== "") || l?.descanso_segundos != null || l?.carga_sugerida_kg != null;

/**
 * W23 — a prescrição do MODELO (tb_grupos_exercicios: séries, repetições, descanso e carga, do Painel › Treinos) vai para a
 * prescrição DO ALUNO (tb_series_padrao_usuario, a que o app lê), só onde o aluno ainda não tem nada: o exercício sem linha do
 * aluno ganha a linha com o que o modelo tem (as séries do modelo ou, sem elas, o padrão do aluno); a linha que já existe ganha
 * só os campos vazios (as séries dela ficam). Nunca sobrescreve o que foi ajustado no perfil do aluno. Devolve quantos
 * exercícios mudaram. Schema sem as colunas da W23 (migração ainda não aplicada) = nada a copiar.
 */
async function aplicarPrescricaoDoModelo(admin: any, aluno: string, gid: string): Promise<number> {
  const modelo = await admin.from("tb_grupos_exercicios")
    .select("exercicio_id, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg").eq("grupo_id", gid);
  if (modelo.error) {
    if (/column|coluna/i.test(String(modelo.error.message ?? ""))) return 0;
    throw modelo.error;
  }
  const comPrescricao = ((modelo.data as any[]) || []).filter((l) => l.exercicio_id && temPrescricaoDoModelo(l));
  if (!comPrescricao.length) return 0;
  const [doAluno, perfil] = await Promise.all([
    admin.from("tb_series_padrao_usuario").select("id, exercicio_id, reps_alvo, descanso_segundos, carga_sugerida_kg")
      .eq("user_id", aluno).eq("grupo_id", gid).not("exercicio_id", "is", null),
    admin.from("physiq_profiles").select("series_padrao_qtd").eq("id", aluno).maybeSingle(),
  ]);
  if (doAluno.error) throw doAluno.error;
  if (perfil.error) throw perfil.error;
  const qtd = Number((perfil.data as any)?.series_padrao_qtd);
  const padrao = Number.isInteger(qtd) && qtd >= 1 ? Math.min(10, qtd) : 3;
  const porExercicio = new Map(((doAluno.data as any[]) || []).map((l) => [l.exercicio_id as string, l]));
  const agora = new Date().toISOString();
  const novas: any[] = [];
  let mudou = 0;
  for (const l of comPrescricao) {
    const reps = l.reps_alvo != null && String(l.reps_alvo).trim() !== "" ? String(l.reps_alvo) : null;
    const atual = porExercicio.get(l.exercicio_id);
    if (!atual) {
      novas.push({
        user_id: aluno, grupo_id: gid, exercicio_id: l.exercicio_id, num_series: l.num_series ?? padrao,
        reps_alvo: reps, descanso_segundos: l.descanso_segundos ?? null, carga_sugerida_kg: l.carga_sugerida_kg ?? null, updated_at: agora,
      });
      continue;
    }
    const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    const patch: Record<string, unknown> = {};
    if (vazio(atual.reps_alvo) && reps) patch.reps_alvo = reps;
    if (vazio(atual.descanso_segundos) && l.descanso_segundos != null) patch.descanso_segundos = l.descanso_segundos;
    if (vazio(atual.carga_sugerida_kg) && l.carga_sugerida_kg != null) patch.carga_sugerida_kg = l.carga_sugerida_kg;
    if (!Object.keys(patch).length) continue;
    const up = await admin.from("tb_series_padrao_usuario").update({ ...patch, updated_at: agora }).eq("id", atual.id);
    if (up.error) throw up.error;
    mudou++;
  }
  if (novas.length) {
    const ins = await admin.from("tb_series_padrao_usuario").insert(novas);
    if (ins.error) throw ins.error;
    mudou += novas.length;
  }
  return mudou;
}

// as contas em que quem chama é DONO no espelho (a mesma regra da lista de alunos — admin-list-users)
async function contasOndeSouDono(admin: any, userId: string): Promise<string[]> {
  const { data, error } = await admin.rpc("contas_onde_sou_dono_treino", { p_usuario: userId });
  if (error) {
    console.error("contas_onde_sou_dono_treino", error.message);
    return [];
  }
  return ((data as unknown[]) || [])
    .map((x) => (typeof x === "string" ? x : (x as { contas_onde_sou_dono_treino?: unknown } | null)?.contas_onde_sou_dono_treino))
    .filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
}

/** treino alvo do body: grupo_id XOR grupo_usuario_id (null = inválido) */
function alvoTreino(body: any): { gid: string | null; guid: string | null } | null {
  const gid = body?.grupo_id ?? null;
  const guid = body?.grupo_usuario_id ?? null;
  if ((gid && guid) || (!gid && !guid)) return null;
  return { gid, guid };
}

const okJson = (payload: unknown, origin: string | null) =>
  new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });

// Physiq W15: ações que só leem (o dono da conta sem papel de personal também usa — requireAdmin com leitura)
const ACOES_LEITURA = new Set(["get", "volume", "volumePraticado", "getSeriesPadrao", "exerciciosTreino", "semanaAtual", "resolverAluno", "quemRecebe"]);

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  let body: any = null;
  let corpoOk = true;
  try { body = await req.json(); } catch { corpoOk = false; }
  const { user, error: authErr } = await requireAdmin(req, "admin-semana-treinos", 60, 60, ACOES_LEITURA.has(body?.action));
  if (authErr) return authErr;
  try {
    if (!corpoOk) throw new Error("corpo_invalido");
    const action = body?.action;
    if (action === "resolverAluno") {
      // W15: o painel acha o usuário do Treino de uma matrícula nova (aluno que entrou pelo Physiq e não tem o treino_user_id
      // guardado no principal) pelo vínculo de identidade — e só devolve se quem chama vê esse aluno (a mesma regra de sempre)
      const pid = body?.principalUserId;
      if (!ehUuid(pid)) return jsonErr("missing_userId", 400, origin);
      const adminR = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
      const { data: v, error: ev } = await adminR.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", pid).maybeSingle();
      if (ev) throw ev;
      const tid = (v as { treino_user_id?: string } | null)?.treino_user_id ?? null;
      if (!tid) return okJson({ treino_user_id: null }, origin);
      if (!(await alunoDoProfessor(adminR, user, tid))) return jsonErr("forbidden", 403, origin);
      return okJson({ treino_user_id: tid }, origin);
    }
    if (action === "quemRecebe") {
      // W23 (Painel › Treinos › "Quem recebe"): quais dos alunos de quem chama recebem cada modelo. Os alunos são os da lista de
      // alunos dele (admin-list-users: os que têm ele de professor, ele mesmo e os das contas de que é dono — o master, os dele)
      // — a RLS de tb_grupos_treino_perfis só deixa ler os que têm ele de professor, e o dono precisa ver os da conta toda
      const grupos = Array.isArray(body?.grupos) ? [...new Set((body.grupos as unknown[]).filter(ehUuid))].slice(0, 500) : [];
      if (!grupos.length) return okJson({ perfis: [] }, origin);
      const adminQ = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
      const contas = await contasOndeSouDono(adminQ, user.id);
      const extra = contas.length ? `,conta_id.in.(${contas.join(",")})` : "";
      const { data: alunos, error: ea } = await adminQ.from("physiq_profiles").select("id").or(`professor_id.eq.${user.id},id.eq.${user.id}${extra}`).limit(2000);
      if (ea) throw ea;
      const ids = ((alunos as any[]) || []).map((a) => a.id as string);
      const perfis: { grupo_id: string; user_id: string }[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await adminQ.from("tb_grupos_treino_perfis").select("grupo_id, user_id").in("grupo_id", grupos).in("user_id", ids.slice(i, i + 150));
        if (error) throw error;
        perfis.push(...((data as any[]) || []));
      }
      return okJson({ perfis }, origin);
    }
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
    if (user.papel === "leitor" && !ACOES_LEITURA.has(action)) return jsonErr("somente_leitura", 403, origin);

    if (action === "get") {
      const [semanaRes, disp, cfgRes, seriesRes, perfilRes] = await Promise.all([
        admin.from("tb_semana_treinos")
          .select("dia_semana, slot_idx, grupo_id, grupo_usuario_id, extra, extra_atrelado_grupo_id, extra_atrelado_grupo_usuario_id")
          .eq("user_id", userId),
        gruposDisponiveis(admin, userId),
        admin.from("tb_semana_dia_config").select("dia_semana, alternado, alternado_inicio").eq("user_id", userId),
        // nº de séries por treino (sem linha = padrão 3 no app) + a prescrição opcional (W15 — NF1/NF2)
        admin.from("tb_series_padrao_usuario")
          .select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg, observacao")
          .eq("user_id", userId),
        // aba Configuração (18/09/2026): padrão de séries do aluno, modo, cadeado e descanso (+ W15: troca do treino — NF7)
        admin.from("physiq_profiles")
          .select("series_padrao_qtd, series_modo, series_travadas, tempo_descanso_segundos, proxima_troca_treino, proxima_avaliacao, professor_id")
          .eq("id", userId).maybeSingle(),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      if (cfgRes.error) throw cfgRes.error;
      if (perfilRes.error) throw perfilRes.error;
      if (seriesRes.error) throw seriesRes.error;
      // exercícios de cada treino já vão junto: o popup "Séries" abre sem nova chamada
      const exerciciosPorTreinoMap = await exerciciosPorTreino(admin, userId, disp.lista);
      // W15: quantos alunos recebem cada treino do catálogo e se ele está numa pasta (= modelo) — com isso o editor sabe se
      // mudar a LISTA de exercícios vale só pra este aluno (muda direto) ou se antes vira uma cópia só dele
      const idsCat = [...disp.catalogo];
      const [perfisRes, pastasRes] = await Promise.all([
        idsCat.length ? admin.from("tb_grupos_treino_perfis").select("grupo_id").in("grupo_id", idsCat) : Promise.resolve({ data: [], error: null }),
        idsCat.length ? admin.from("tb_pastas_treino_grupos").select("grupo_id").in("grupo_id", idsCat) : Promise.resolve({ data: [], error: null }),
      ]);
      if (perfisRes.error) throw perfisRes.error;
      if (pastasRes.error) throw pastasRes.error;
      const alunosPorGrupo = new Map<string, number>();
      ((perfisRes.data as any[]) || []).forEach((r) => alunosPorGrupo.set(r.grupo_id, (alunosPorGrupo.get(r.grupo_id) ?? 0) + 1));
      const emPasta = new Set(((pastasRes.data as any[]) || []).map((r) => r.grupo_id));
      const professorDoAluno = (perfilRes.data as any)?.professor_id ?? null;
      const gruposComMeta = disp.lista.map((g: any) => g.tipo !== "catalogo" ? { ...g, alunos: 1, em_pasta: false, lista_direta: false } : {
        ...g,
        alunos: alunosPorGrupo.get(g.id) ?? 1,
        em_pasta: emPasta.has(g.id),
        lista_direta: listaDireta(g.professor_id, alunosPorGrupo.get(g.id) ?? 1, emPasta.has(g.id), user.id, professorDoAluno),
      });
      const { professor_id: _p, ...config } = (perfilRes.data as any) ?? {};
      return new Response(JSON.stringify({
        semana: semanaRes.data ?? [], gruposDisponiveis: gruposComMeta, diasConfig: cfgRes.data ?? [],
        seriesPadrao: seriesRes.data ?? [], exerciciosPorTreino: exerciciosPorTreinoMap,
        config: perfilRes.data ? config : null,
        // W15: quem chamou pode mudar o treino? (o dono sem papel de personal só lê — spec 4.1)
        podeEditar: user.papel !== "leitor",
        professorDoAluno,
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "semanaAtual") {
      // W15 — card Treino do Resumo e aba Treino do perfil: "N de M na semana" com a MESMA conta do app do aluno (trocas do
      // dia e treinos concluídos da semana; a semana recorrente e o alternado vêm do get)
      const inicio = body?.inicio;
      const fim = body?.fim;
      const reData = /^\d{4}-\d{2}-\d{2}$/;
      if (!reData.test(inicio ?? "") || !reData.test(fim ?? "") || inicio > fim) return jsonErr("periodo_invalido", 400, origin);
      const dias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000;
      if (dias > 13) return jsonErr("periodo_invalido", 400, origin);
      const [ovRes, coRes] = await Promise.all([
        admin.from("tb_treino_dia_override").select("data_treino, slot_idx, grupo_id, grupo_usuario_id")
          .eq("user_id", userId).gte("data_treino", inicio).lte("data_treino", fim),
        admin.from("tb_treino_concluido").select("data_treino, slot_idx")
          .eq("user_id", userId).eq("concluido", true).gte("data_treino", inicio).lte("data_treino", fim),
      ]);
      if (ovRes.error) throw ovRes.error;
      if (coRes.error) throw coRes.error;
      const dia = (v: unknown) => String(v ?? "").split("T")[0];
      return okJson({
        overrides: ((ovRes.data as any[]) || []).map((o) => ({ ...o, data_treino: dia(o.data_treino) })),
        concluidos: ((coRes.data as any[]) || []).map((c) => ({ data_treino: dia(c.data_treino), slot_idx: c.slot_idx ?? 0 })),
      }, origin);
    }

    if (action === "setDia") {
      const dia = body?.dia_semana;
      const grupos = Array.isArray(body?.grupos) ? body.grupos : [];
      if (!DIAS.has(dia)) return jsonErr("invalid_dia", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      // valida e normaliza: cada item é OU catálogo OU pessoal (nunca ambos)
      const norm: { grupo_id: string | null; grupo_usuario_id: string | null }[] = [];
      for (const g of grupos) {
        const gid = g?.grupo_id ?? null;
        const guid = g?.grupo_usuario_id ?? null;
        if (gid && guid) return jsonErr("grupo_ambiguo", 400, origin);
        if (gid) {
          if (!catalogo.has(gid)) return jsonErr("grupo_nao_disponivel", 400, origin);
          norm.push({ grupo_id: gid, grupo_usuario_id: null });
        } else if (guid) {
          if (!pessoal.has(guid)) return jsonErr("grupo_nao_disponivel", 400, origin);
          norm.push({ grupo_id: null, grupo_usuario_id: guid });
        } else {
          return jsonErr("grupo_invalido", 400, origin);
        }
      }
      // preserva as linhas de treino EXTRA do alternado (geridas via setExtras)
      const del = await admin.from("tb_semana_treinos").delete().eq("user_id", userId).eq("dia_semana", dia).eq("extra", false);
      if (del.error) throw del.error;
      // não-atômico de propósito: se o insert falhar após o delete, o dia fica vazio
      // (admin re-marca). Aceitável para um painel admin.
      if (norm.length > 0) {
        const rows = norm.map((g, i) => ({
          user_id: userId, dia_semana: dia, slot_idx: i,
          grupo_id: g.grupo_id, grupo_usuario_id: g.grupo_usuario_id,
          updated_at: new Date().toISOString(),
        }));
        const ins = await admin.from("tb_semana_treinos").insert(rows);
        if (ins.error) throw ins.error;
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "volume") {
      // extras do alternado ficam fora do volume (decisão: aba Volume não muda)
      const [semanaRes, disp, seriesRes, perfilRes] = await Promise.all([
        admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId).eq("extra", false),
        gruposDisponiveis(admin, userId),
        // nº de séries configurado no Treino Diário (badge "Séries") — o Programado usa a mesma fonte do treino do aluno
        admin.from("tb_series_padrao_usuario").select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series").eq("user_id", userId),
        admin.from("physiq_profiles").select("series_padrao_qtd").eq("id", userId).maybeSingle(),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      if (seriesRes.error) throw seriesRes.error;
      if (perfilRes.error) throw perfilRes.error;
      const semana = (semanaRes.data as any[]) ?? [];
      // TODOS os grupos disponíveis do usuário (não só os da semana) — o front
      // decide quais compõem o volume via seletor "Treino selecionado"
      const gruposCatalogo = [...disp.catalogo];
      const gruposPessoais = [...disp.pessoal];

      const [catRes, pessRes, subsRes] = await Promise.all([
        gruposCatalogo.length
          ? admin.from("tb_grupos_exercicios")
              .select("grupo_id, exercicio_id, tb_exercicios(id, nome, grupo_muscular, tipo)")
              .in("grupo_id", gruposCatalogo)
          : Promise.resolve({ data: [], error: null }),
        gruposPessoais.length
          ? admin.from("tb_grupos_exercicios_usuario")
              .select("grupo_usuario_id, exercicio_id, exercicio_usuario_id, tb_exercicios(id, nome, grupo_muscular, tipo), tb_exercicios_usuario(id, nome, grupo_muscular, tipo)")
              .eq("user_id", userId).in("grupo_usuario_id", gruposPessoais)
          : Promise.resolve({ data: [], error: null }),
        admin.from("exercicio_substituicao_usuario")
          .select("grupo_id, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id")
          .eq("user_id", userId).is("data_treino", null),
      ]);
      if (catRes.error) throw catRes.error;
      if (pessRes.error) throw pessRes.error;
      if (subsRes.error) throw subsRes.error;

      // substituições definitivas (só grupos do catálogo; pessoal edita o grupo direto).
      // chave por (grupo, origem) — ignora slot_idx: pro volume semanal a troca vale no grupo inteiro.
      const subs = new Map<string, { novoId: string | null; novoUsuarioId: string | null }>();
      ((subsRes.data as any[]) || []).forEach((s) => {
        subs.set(`${s.grupo_id}:${s.exercicio_origem_id}`, { novoId: s.exercicio_novo_id, novoUsuarioId: s.exercicio_novo_usuario_id });
      });
      const idsNovosCat = [...new Set([...subs.values()].map((s) => s.novoId).filter(Boolean))] as string[];
      const idsNovosPess = [...new Set([...subs.values()].map((s) => s.novoUsuarioId).filter(Boolean))] as string[];
      const [novosCat, novosPess] = await Promise.all([
        idsNovosCat.length
          ? admin.from("tb_exercicios").select("id, nome, grupo_muscular, tipo").in("id", idsNovosCat)
          : Promise.resolve({ data: [], error: null }),
        idsNovosPess.length
          ? admin.from("tb_exercicios_usuario").select("id, nome, grupo_muscular, tipo").in("id", idsNovosPess).eq("user_id", userId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const detNovoCat = new Map(((novosCat.data as any[]) || []).map((e) => [e.id, e]));
      const detNovoPess = new Map(((novosPess.data as any[]) || []).map((e) => [e.id, e]));

      type ExVol = { id: string; isPessoal: boolean; nome: string; grupo_muscular: string; tipo: string | null };
      const grupos: Record<string, { nome: string; exercicios: ExVol[] }> = {};
      const nomeGrupo = new Map(disp.lista.map((g: any) => [`${g.tipo}:${g.id}`, g.nome]));

      ((catRes.data as any[]) || []).forEach((r) => {
        const key = `catalogo:${r.grupo_id}`;
        const g = (grupos[key] ||= { nome: nomeGrupo.get(key) ?? "(grupo)", exercicios: [] });
        const sub = subs.get(`${r.grupo_id}:${r.exercicio_id}`);
        let ex = r.tb_exercicios;
        let isPessoal = false;
        if (sub) {
          // linha sem exercício novo = removido definitivamente pelo aluno → fora do volume programado
          if (!sub.novoId && !sub.novoUsuarioId) return;
          const det = sub.novoUsuarioId ? detNovoPess.get(sub.novoUsuarioId) : detNovoCat.get(sub.novoId);
          if (det) { ex = det; isPessoal = !!sub.novoUsuarioId; }
        }
        if (ex) g.exercicios.push({ id: ex.id, isPessoal, nome: ex.nome, grupo_muscular: ex.grupo_muscular ?? "", tipo: ex.tipo ?? null });
      });
      ((pessRes.data as any[]) || []).forEach((r) => {
        const key = `pessoal:${r.grupo_usuario_id}`;
        const g = (grupos[key] ||= { nome: nomeGrupo.get(key) ?? "(grupo)", exercicios: [] });
        const ex = r.exercicio_usuario_id ? r.tb_exercicios_usuario : r.tb_exercicios;
        if (ex) g.exercicios.push({ id: ex.id, isPessoal: !!r.exercicio_usuario_id, nome: ex.nome, grupo_muscular: ex.grupo_muscular ?? "", tipo: ex.tipo ?? null });
      });

      // seriesUltimo ("último treino registrado") foi aposentado: o Programado usa seriesPadrao (PR #29).

      return new Response(JSON.stringify({ semana, grupos, seriesPadrao: seriesRes.data ?? [], config: perfilRes.data ?? null }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "getSeriesPadrao") {
      // só as linhas de séries (leve) — recarga do popup "Séries" após gravação ou evento Realtime
      const { data, error } = await admin.from("tb_series_padrao_usuario")
        .select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series").eq("user_id", userId);
      if (error) throw error;
      return okJson({ seriesPadrao: data ?? [] }, origin);
    }

    if (action === "exerciciosTreino") {
      // exercícios do treino (pro popup "Séries" do admin) — cobre treino pessoal do aluno
      const alvo = alvoTreino(body);
      if (!alvo) return jsonErr("grupo_invalido", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      if ((alvo.gid && !catalogo.has(alvo.gid)) || (alvo.guid && !pessoal.has(alvo.guid))) return jsonErr("grupo_nao_disponivel", 400, origin);
      return okJson({ exercicios: await exerciciosDoTreino(admin, userId, alvo.gid, alvo.guid) }, origin);
    }

    if (action === "setSeriesPadrao") {
      // nº de séries no app pra (usuário, treino[, exercício]) — 1 a 10; sem exercício = geral do treino
      const alvo = alvoTreino(body);
      if (!alvo) return jsonErr("grupo_invalido", 400, origin);
      const exid = body?.exercicio_id ?? null;
      const exuid = body?.exercicio_usuario_id ?? null;
      if (exid && exuid) return jsonErr("exercicio_ambiguo", 400, origin);
      const n = Number(body?.num_series);
      if (!Number.isInteger(n) || n < 1 || n > 10) return jsonErr("num_series_invalido", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      if ((alvo.gid && !catalogo.has(alvo.gid)) || (alvo.guid && !pessoal.has(alvo.guid))) return jsonErr("grupo_nao_disponivel", 400, origin);
      if (exid || exuid) {
        const lista = await exerciciosDoTreino(admin, userId, alvo.gid, alvo.guid);
        const pertence = lista.some((e) => (exid ? e.exercicio_id === exid : e.exercicio_usuario_id === exuid));
        if (!pertence) return jsonErr("exercicio_fora_do_treino", 400, origin);
      }
      // select → update/insert (índice UNIQUE é de expressão, não serve pro upsert do PostgREST)
      let q = admin.from("tb_series_padrao_usuario").select("id").eq("user_id", userId);
      q = alvo.gid ? q.eq("grupo_id", alvo.gid) : q.eq("grupo_usuario_id", alvo.guid);
      q = exid ? q.eq("exercicio_id", exid) : q.is("exercicio_id", null);
      q = exuid ? q.eq("exercicio_usuario_id", exuid) : q.is("exercicio_usuario_id", null);
      const atual = await q.maybeSingle();
      if (atual.error) throw atual.error;
      const now = new Date().toISOString();
      if (atual.data?.id) {
        const up = await admin.from("tb_series_padrao_usuario").update({ num_series: n, updated_at: now }).eq("id", atual.data.id);
        if (up.error) throw up.error;
      } else {
        const ins = await admin.from("tb_series_padrao_usuario").insert({
          user_id: userId, grupo_id: alvo.gid, grupo_usuario_id: alvo.guid,
          exercicio_id: exid, exercicio_usuario_id: exuid, num_series: n, updated_at: now,
        });
        if (ins.error) throw ins.error;
      }
      return okJson({ ok: true, num_series: n }, origin);
    }

    if (action === "aplicarSeriesTreino") {
      // n vira o geral do treino; os números próprios por exercício são apagados
      const alvo = alvoTreino(body);
      if (!alvo) return jsonErr("grupo_invalido", 400, origin);
      const n = Number(body?.num_series);
      if (!Number.isInteger(n) || n < 1 || n > 10) return jsonErr("num_series_invalido", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      if ((alvo.gid && !catalogo.has(alvo.gid)) || (alvo.guid && !pessoal.has(alvo.guid))) return jsonErr("grupo_nao_disponivel", 400, origin);
      // W15: a prescrição do profissional (repetições, descanso, carga — NF1 — e a observação do treino — NF2) mora nas
      // mesmas linhas: quem tem prescrição fica, só com o nº novo; as outras linhas somem (o nº próprio delas é o que zera)
      let sel = admin.from("tb_series_padrao_usuario").select(`id, exercicio_id, exercicio_usuario_id, ${COLS_PRESCRICAO}`).eq("user_id", userId);
      sel = alvo.gid ? sel.eq("grupo_id", alvo.gid) : sel.eq("grupo_usuario_id", alvo.guid);
      const linhas = await sel;
      if (linhas.error) throw linhas.error;
      const agora = new Date().toISOString();
      const comPrescricao = ((linhas.data as any[]) || []).filter(temPrescricao);
      const semPrescricao = ((linhas.data as any[]) || []).filter((l) => !temPrescricao(l)).map((l) => l.id);
      if (semPrescricao.length) {
        const d = await admin.from("tb_series_padrao_usuario").delete().in("id", semPrescricao);
        if (d.error) throw d.error;
      }
      if (comPrescricao.length) {
        const u = await admin.from("tb_series_padrao_usuario").update({ num_series: n, updated_at: agora }).in("id", comPrescricao.map((l) => l.id));
        if (u.error) throw u.error;
      }
      // não-atômico de propósito (mesmo padrão do setDia): se o insert falhar, o treino volta ao padrão 3
      if (!comPrescricao.some((l) => !l.exercicio_id && !l.exercicio_usuario_id)) {
        const ins = await admin.from("tb_series_padrao_usuario").insert({
          user_id: userId, grupo_id: alvo.gid, grupo_usuario_id: alvo.guid,
          exercicio_id: null, exercicio_usuario_id: null, num_series: n, updated_at: agora,
        });
        if (ins.error) throw ins.error;
      }
      return okJson({ ok: true, num_series: n }, origin);
    }

    if (action === "limparSeriesAluno") {
      // aba Configuração › Padrão N › "Aplicar a todos": apaga TODAS as linhas de séries do aluno (por exercício e
      // geral de cada treino) — o nº que passa a valer é physiq_profiles.series_padrao_qtd, gravado antes pelo
      // admin-update-user. Não-atômico com o update do perfil, de propósito (mesmo padrão do aplicarSeriesTreino).
      // W15: as linhas com prescrição (NF1/NF2) ficam, com o nº novo do aluno (series_padrao_qtd) — só o nº próprio zera
      const [linhasRes, perfilRes] = await Promise.all([
        admin.from("tb_series_padrao_usuario").select(`id, ${COLS_PRESCRICAO}`).eq("user_id", userId),
        admin.from("physiq_profiles").select("series_padrao_qtd").eq("id", userId).maybeSingle(),
      ]);
      if (linhasRes.error) throw linhasRes.error;
      if (perfilRes.error) throw perfilRes.error;
      const todas = (linhasRes.data as any[]) || [];
      const ficam = todas.filter(temPrescricao).map((l) => l.id);
      const saem = todas.filter((l) => !temPrescricao(l)).map((l) => l.id);
      if (saem.length) {
        const { error } = await admin.from("tb_series_padrao_usuario").delete().in("id", saem);
        if (error) throw error;
      }
      if (ficam.length) {
        const qtd = Number((perfilRes.data as any)?.series_padrao_qtd);
        const n = Number.isInteger(qtd) && qtd >= 1 ? Math.min(10, qtd) : 3;
        const { error } = await admin.from("tb_series_padrao_usuario").update({ num_series: n, updated_at: new Date().toISOString() }).in("id", ficam);
        if (error) throw error;
      }
      return okJson({ ok: true, removidas: saem.length }, origin);
    }

    if (action === "setDiaConfig") {
      const dia = body?.dia_semana;
      const alternado = body?.alternado === true;
      const inicio = body?.inicio;
      if (!DIAS.has(dia)) return jsonErr("invalid_dia", 400, origin);
      if (alternado && !/^\d{4}-\d{2}-\d{2}$/.test(inicio ?? "")) return jsonErr("inicio_invalido", 400, origin);
      const up = await admin.from("tb_semana_dia_config").upsert(
        {
          user_id: userId, dia_semana: dia, alternado,
          alternado_inicio: alternado ? inicio : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,dia_semana" },
      );
      if (up.error) throw up.error;
      if (!alternado) {
        // desativar o alternado remove os treinos extras do dia
        const del = await admin.from("tb_semana_treinos").delete()
          .eq("user_id", userId).eq("dia_semana", dia).eq("extra", true);
        if (del.error) throw del.error;
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "setExtras") {
      const dia = body?.dia_semana;
      const extras = Array.isArray(body?.extras) ? body.extras : [];
      if (!DIAS.has(dia)) return jsonErr("invalid_dia", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      const valido = (gid: string | null, guid: string | null): boolean =>
        (!!gid && !guid && catalogo.has(gid)) || (!!guid && !gid && pessoal.has(guid));
      const rows: any[] = [];
      for (let i = 0; i < extras.length; i++) {
        const e = extras[i];
        const gid = e?.grupo_id ?? null;
        const guid = e?.grupo_usuario_id ?? null;
        if (!valido(gid, guid)) return jsonErr("grupo_nao_disponivel", 400, origin);
        const agid = e?.atrelado_grupo_id ?? null;
        const aguid = e?.atrelado_grupo_usuario_id ?? null;
        if (agid && aguid) return jsonErr("atrelamento_ambiguo", 400, origin);
        if ((agid || aguid) && !valido(agid, aguid)) return jsonErr("atrelamento_invalido", 400, origin);
        rows.push({
          user_id: userId, dia_semana: dia, slot_idx: 100 + i, extra: true,
          grupo_id: gid, grupo_usuario_id: guid,
          extra_atrelado_grupo_id: agid, extra_atrelado_grupo_usuario_id: aguid,
          updated_at: new Date().toISOString(),
        });
      }
      const del = await admin.from("tb_semana_treinos").delete()
        .eq("user_id", userId).eq("dia_semana", dia).eq("extra", true);
      if (del.error) throw del.error;
      if (rows.length > 0) {
        const ins = await admin.from("tb_semana_treinos").insert(rows);
        if (ins.error) throw ins.error;
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "volumePraticado") {
      const inicio = body?.inicio;
      const fim = body?.fim;
      const reData = /^\d{4}-\d{2}-\d{2}$/;
      if (!reData.test(inicio ?? "") || !reData.test(fim ?? "") || inicio > fim) {
        return jsonErr("periodo_invalido", 400, origin);
      }
      const { data: seriesRows, error: serErr } = await admin.from("tb_treino_series")
        .select("exercicio_id, exercicio_usuario_id")
        .eq("user_id", userId).eq("concluida", true)
        .gte("data_treino", inicio).lte("data_treino", fim)
        .limit(2000);
      if (serErr) throw serErr;

      // conta séries concluídas por exercício no período
      const porEx = new Map<string, { id: string; isPessoal: boolean; series: number }>();
      ((seriesRows as any[]) || []).forEach((r) => {
        const isPessoal = !!r.exercicio_usuario_id;
        const id = r.exercicio_usuario_id ?? r.exercicio_id;
        if (!id) return;
        const k = `${isPessoal ? "p" : "c"}:${id}`;
        const atual = porEx.get(k);
        if (atual) atual.series += 1;
        else porEx.set(k, { id, isPessoal, series: 1 });
      });

      const idsCat = [...porEx.values()].filter((e) => !e.isPessoal).map((e) => e.id);
      const idsPess = [...porEx.values()].filter((e) => e.isPessoal).map((e) => e.id);
      const [detCat, detPess] = await Promise.all([
        idsCat.length
          ? admin.from("tb_exercicios").select("id, nome, grupo_muscular, tipo").in("id", idsCat)
          : Promise.resolve({ data: [], error: null }),
        idsPess.length
          ? admin.from("tb_exercicios_usuario").select("id, nome, grupo_muscular, tipo").in("id", idsPess).eq("user_id", userId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const nomes = new Map<string, any>();
      ((detCat.data as any[]) || []).forEach((e) => nomes.set(`c:${e.id}`, e));
      ((detPess.data as any[]) || []).forEach((e) => nomes.set(`p:${e.id}`, e));

      const exercicios = [...porEx.entries()].map(([k, e]) => {
        const det = nomes.get(k);
        return {
          id: e.id,
          isPessoal: e.isPessoal,
          nome: det?.nome ?? "(exercício removido)",
          grupo_muscular: det?.grupo_muscular ?? "",
          tipo: det?.tipo ?? null,
          series: e.series,
        };
      });

      return new Response(JSON.stringify({ exercicios }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    // ───────────────────────── W15 — editor do treino (tela 8) ─────────────────────────

    if (action === "setPrescricao") {
      // séries + repetições, descanso e carga (NF1) de UM exercício do treino, só deste aluno (o app lê desta linha)
      const alvo = alvoTreino(body);
      if (!alvo) return jsonErr("grupo_invalido", 400, origin);
      const exid = body?.exercicio_id ?? null;
      const exuid = body?.exercicio_usuario_id ?? null;
      if (exid && exuid) return jsonErr("exercicio_ambiguo", 400, origin);
      if (!exid && !exuid) return jsonErr("exercicio_obrigatorio", 400, origin);
      const n = Number(body?.num_series);
      if (!Number.isInteger(n) || n < 1 || n > 10) return jsonErr("num_series_invalido", 400, origin);
      const reps = lerReps(body?.reps_alvo);
      if (!reps.ok) return jsonErr("reps_invalidas", 400, origin);
      const desc = lerInteiro(body?.descanso_segundos, 5, 900);
      if (!desc.ok) return jsonErr("descanso_invalido", 400, origin);
      const carga = lerCarga(body?.carga_sugerida_kg);
      if (!carga.ok) return jsonErr("carga_invalida", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      if ((alvo.gid && !catalogo.has(alvo.gid)) || (alvo.guid && !pessoal.has(alvo.guid))) return jsonErr("grupo_nao_disponivel", 400, origin);
      const lista = await exerciciosDoTreino(admin, userId, alvo.gid, alvo.guid);
      if (!lista.some((e) => (exid ? e.exercicio_id === exid && !e.exercicio_usuario_id : e.exercicio_usuario_id === exuid))) {
        return jsonErr("exercicio_fora_do_treino", 400, origin);
      }
      let q = admin.from("tb_series_padrao_usuario").select("id").eq("user_id", userId);
      q = alvo.gid ? q.eq("grupo_id", alvo.gid) : q.eq("grupo_usuario_id", alvo.guid);
      q = exid ? q.eq("exercicio_id", exid) : q.is("exercicio_id", null);
      q = exuid ? q.eq("exercicio_usuario_id", exuid) : q.is("exercicio_usuario_id", null);
      const atual = await q.maybeSingle();
      if (atual.error) throw atual.error;
      const linha = { num_series: n, reps_alvo: reps.valor, descanso_segundos: desc.valor, carga_sugerida_kg: carga.valor, updated_at: new Date().toISOString() };
      if (atual.data?.id) {
        const up = await admin.from("tb_series_padrao_usuario").update(linha).eq("id", atual.data.id);
        if (up.error) throw up.error;
      } else {
        const ins = await admin.from("tb_series_padrao_usuario").insert({
          user_id: userId, grupo_id: alvo.gid, grupo_usuario_id: alvo.guid, exercicio_id: exid, exercicio_usuario_id: exuid, ...linha,
        });
        if (ins.error) throw ins.error;
      }
      return okJson({ ok: true, prescricao: { grupo_id: alvo.gid, grupo_usuario_id: alvo.guid, exercicio_id: exid, exercicio_usuario_id: exuid, ...linha } }, origin);
    }

    if (action === "setObservacao") {
      // observação do treino para o aluno (NF2): na linha geral do treino (sem exercício) — a mesma que o app lê
      const alvo = alvoTreino(body);
      if (!alvo) return jsonErr("grupo_invalido", 400, origin);
      const bruto = body?.observacao;
      if (bruto !== null && bruto !== undefined && typeof bruto !== "string") return jsonErr("observacao_invalida", 400, origin);
      const obs = typeof bruto === "string" && bruto.trim() ? bruto.trim() : null;
      if (obs && obs.length > 1000) return jsonErr("observacao_longa", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      if ((alvo.gid && !catalogo.has(alvo.gid)) || (alvo.guid && !pessoal.has(alvo.guid))) return jsonErr("grupo_nao_disponivel", 400, origin);
      let q = admin.from("tb_series_padrao_usuario").select("id").eq("user_id", userId).is("exercicio_id", null).is("exercicio_usuario_id", null);
      q = alvo.gid ? q.eq("grupo_id", alvo.gid) : q.eq("grupo_usuario_id", alvo.guid);
      const atual = await q.maybeSingle();
      if (atual.error) throw atual.error;
      const agora = new Date().toISOString();
      if (atual.data?.id) {
        const up = await admin.from("tb_series_padrao_usuario").update({ observacao: obs, updated_at: agora }).eq("id", atual.data.id);
        if (up.error) throw up.error;
      } else if (obs) {
        // linha geral nova: o nº de séries dela é o padrão do aluno (o que já valia pra quem não tem nº próprio)
        const { data: perfil, error: pe } = await admin.from("physiq_profiles").select("series_padrao_qtd").eq("id", userId).maybeSingle();
        if (pe) throw pe;
        const qtd = Number((perfil as any)?.series_padrao_qtd);
        const ins = await admin.from("tb_series_padrao_usuario").insert({
          user_id: userId, grupo_id: alvo.gid, grupo_usuario_id: alvo.guid, exercicio_id: null, exercicio_usuario_id: null,
          num_series: Number.isInteger(qtd) && qtd >= 1 ? Math.min(10, qtd) : 3, observacao: obs, updated_at: agora,
        });
        if (ins.error) throw ins.error;
      }
      return okJson({ ok: true, observacao: obs }, origin);
    }

    if (action === "setConfig") {
      // descanso padrão, cadeado das séries, nº padrão/modo e a data da troca do treino (NF7) — o que o app do aluno lê
      const campos: Record<string, unknown> = {};
      if ("tempo_descanso_segundos" in (body ?? {})) {
        const r = lerInteiro(body.tempo_descanso_segundos, 10, 600, false);
        if (!r.ok) return jsonErr("descanso_invalido", 400, origin);
        campos.tempo_descanso_segundos = r.valor;
      }
      if ("series_travadas" in (body ?? {})) {
        if (typeof body.series_travadas !== "boolean") return jsonErr("cadeado_invalido", 400, origin);
        campos.series_travadas = body.series_travadas;
      }
      if ("series_padrao_qtd" in (body ?? {})) {
        const r = lerInteiro(body.series_padrao_qtd, 1, 10, false);
        if (!r.ok) return jsonErr("num_series_invalido", 400, origin);
        campos.series_padrao_qtd = r.valor;
      }
      if ("series_modo" in (body ?? {})) {
        if (body.series_modo !== "padrao" && body.series_modo !== "personalizada") return jsonErr("modo_invalido", 400, origin);
        campos.series_modo = body.series_modo;
      }
      if ("proxima_troca_treino" in (body ?? {})) {
        const r = lerData(body.proxima_troca_treino);
        if (!r.ok) return jsonErr("data_invalida", 400, origin);
        campos.proxima_troca_treino = r.valor;
      }
      if (Object.keys(campos).length === 0) return jsonErr("sem_campos", 400, origin);
      const { data, error } = await admin.from("physiq_profiles").update(campos).eq("id", userId)
        .select("series_padrao_qtd, series_modo, series_travadas, tempo_descanso_segundos, proxima_troca_treino, proxima_avaliacao").maybeSingle();
      if (error) throw error;
      if (!data) return jsonErr("not_found", 404, origin);
      return okJson({ ok: true, config: data }, origin);
    }

    if (action === "modelos") {
      // "Modelos": os treinos que quem mexe pode dar ao aluno — os globais do master e os dele (os mesmos do Painel › Treinos)
      const { data: gs, error } = await admin.from("tb_grupos_treino").select("id, nome, professor_id")
        .or(`professor_id.is.null,professor_id.eq.${user.id}`).order("nome").limit(500);
      if (error) throw error;
      const lista = (gs as any[]) || [];
      const ids = lista.map((g) => g.id);
      const [exs, pastas, disp] = await Promise.all([
        ids.length ? admin.from("tb_grupos_exercicios").select("grupo_id").in("grupo_id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? admin.from("tb_pastas_treino_grupos").select("grupo_id, tb_pastas_treino(nome)").in("grupo_id", ids) : Promise.resolve({ data: [], error: null }),
        gruposDisponiveis(admin, userId),
      ]);
      if (exs.error) throw exs.error;
      if (pastas.error) throw pastas.error;
      const nEx = new Map<string, number>();
      ((exs.data as any[]) || []).forEach((r) => nEx.set(r.grupo_id, (nEx.get(r.grupo_id) ?? 0) + 1));
      const pastasDe = new Map<string, string[]>();
      ((pastas.data as any[]) || []).forEach((r) => {
        const nome = r.tb_pastas_treino?.nome;
        if (nome) pastasDe.set(r.grupo_id, [...(pastasDe.get(r.grupo_id) ?? []), nome]);
      });
      return okJson({
        modelos: lista.map((g) => ({
          id: g.id, nome: g.nome, global: g.professor_id === null, meu: g.professor_id === user.id,
          exercicios: nEx.get(g.id) ?? 0, pastas: pastasDe.get(g.id) ?? [], ja_tem: disp.catalogo.has(g.id),
        })),
      }, origin);
    }

    if (action === "novoTreino") {
      // "+": treino novo, vazio, só deste aluno (dono = o professor do aluno; sem professor, quem criou)
      const nome = typeof body?.nome === "string" ? body.nome.trim().replace(/\s+/g, " ") : "";
      if (!nome || nome.length > 60) return jsonErr("nome_invalido", 400, origin);
      const prof = await professorDoAluno(admin, userId);
      const { data: g, error } = await admin.from("tb_grupos_treino").insert({ nome, professor_id: prof ?? user.id }).select("id").single();
      if (error) throw error;
      const ins = await admin.from("tb_grupos_treino_perfis").insert({ grupo_id: g.id, user_id: userId });
      if (ins.error) throw ins.error;
      return okJson({ ok: true, grupo_id: g.id }, origin);
    }

    if (action === "usarTreino") {
      // "Modelos" › usar: o aluno passa a receber o treino (compartilhado, como o "quem recebe" do Painel › Treinos)
      const gid = body?.grupo_id;
      if (!ehUuid(gid)) return jsonErr("grupo_invalido", 400, origin);
      const { data: g, error } = await admin.from("tb_grupos_treino").select("id, professor_id").eq("id", gid).maybeSingle();
      if (error) throw error;
      if (!g) return jsonErr("grupo_nao_disponivel", 400, origin);
      const dono = (g as any).professor_id ?? null;
      if (dono !== null && dono !== user.id && user.papel !== "master") return jsonErr("grupo_nao_disponivel", 400, origin);
      const ja = await admin.from("tb_grupos_treino_perfis").select("id").eq("grupo_id", gid).eq("user_id", userId).maybeSingle();
      if (ja.error) throw ja.error;
      let prescricaoDoModelo = 0;
      if (!ja.data) {
        const ins = await admin.from("tb_grupos_treino_perfis").insert({ grupo_id: gid, user_id: userId });
        if (ins.error) throw ins.error;
        // W23: quem passa a receber o modelo leva a prescrição dele (séries, repetições, descanso, carga) onde não tem nada seu
        prescricaoDoModelo = await aplicarPrescricaoDoModelo(admin, userId, gid);
      }
      return okJson({ ok: true, grupo_id: gid, prescricao_do_modelo: prescricaoDoModelo }, origin);
    }

    if (action === "aplicarModelo") {
      // W23 (Painel › Treinos › "Aplicar a quem recebe"): a prescrição do modelo neste aluno, que já recebe o modelo — só o vazio
      const gid = body?.grupo_id;
      if (!ehUuid(gid)) return jsonErr("grupo_invalido", 400, origin);
      const { catalogo } = await gruposDisponiveis(admin, userId);
      if (!catalogo.has(gid)) return jsonErr("grupo_nao_disponivel", 400, origin);
      const n = await aplicarPrescricaoDoModelo(admin, userId, gid);
      return okJson({ ok: true, grupo_id: gid, preenchidos: n }, origin);
    }

    if (action === "tirarTreino") {
      // o aluno deixa de receber o treino (o treino continua na biblioteca do professor); sai da semana e das trocas futuras
      const gid = body?.grupo_id;
      if (!ehUuid(gid)) return jsonErr("grupo_invalido", 400, origin);
      const { catalogo } = await gruposDisponiveis(admin, userId);
      if (!catalogo.has(gid)) return jsonErr("grupo_nao_disponivel", 400, origin);
      const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const [d1, d2, d3] = await Promise.all([
        admin.from("tb_semana_treinos").delete().eq("user_id", userId).eq("grupo_id", gid),
        admin.from("tb_treino_dia_override").delete().eq("user_id", userId).eq("grupo_id", gid).gte("data_treino", hoje),
        admin.from("tb_grupos_treino_perfis").delete().eq("user_id", userId).eq("grupo_id", gid),
      ]);
      if (d1.error) throw d1.error;
      if (d2.error) throw d2.error;
      if (d3.error) throw d3.error;
      return okJson({ ok: true }, origin);
    }

    if (action === "adicionarExercicio" || action === "removerExercicio" || action === "ordenarExercicios") {
      // a LISTA de exercícios de um treino do catálogo, só para este aluno (compartilhado → cópia só dele antes)
      const gid = body?.grupo_id;
      if (!ehUuid(gid)) return jsonErr("grupo_invalido", 400, origin);
      const { catalogo } = await gruposDisponiveis(admin, userId);
      if (!catalogo.has(gid)) return jsonErr("grupo_nao_disponivel", 400, origin);
      const atuais = await admin.from("tb_grupos_exercicios").select("exercicio_id, ordem").eq("grupo_id", gid).order("ordem");
      if (atuais.error) throw atuais.error;
      const idsAtuais = ((atuais.data as any[]) || []).map((r) => r.exercicio_id as string);

      if (action === "adicionarExercicio") {
        const exid = body?.exercicio_id;
        if (!ehUuid(exid)) return jsonErr("exercicio_invalido", 400, origin);
        if (idsAtuais.includes(exid)) return jsonErr("ja_no_treino", 400, origin);
        if (!(await exercicioVisivelAoAluno(admin, exid, await professorDoAluno(admin, userId)))) return jsonErr("exercicio_invisivel", 400, origin);
        const alvo = await listaDoAluno(admin, user, userId, gid);
        const maior = ((atuais.data as any[]) || []).reduce((m, r) => Math.max(m, Number(r.ordem ?? 0)), -1);
        const ins = await admin.from("tb_grupos_exercicios").insert({ grupo_id: alvo.gid, exercicio_id: exid, ordem: maior + 1 });
        if (ins.error) throw ins.error;
        return okJson({ ok: true, grupo_id: alvo.gid, personalizado: alvo.personalizado }, origin);
      }

      if (action === "removerExercicio") {
        const exid = body?.exercicio_id;
        if (!ehUuid(exid) || !idsAtuais.includes(exid)) return jsonErr("exercicio_fora_do_treino", 400, origin);
        const alvo = await listaDoAluno(admin, user, userId, gid);
        const [d1, d2, d3, d4] = await Promise.all([
          admin.from("tb_grupos_exercicios").delete().eq("grupo_id", alvo.gid).eq("exercicio_id", exid),
          admin.from("tb_series_padrao_usuario").delete().eq("user_id", userId).eq("grupo_id", alvo.gid).eq("exercicio_id", exid),
          admin.from("exercicio_substituicao_usuario").delete().eq("user_id", userId).eq("grupo_id", alvo.gid).eq("exercicio_origem_id", exid),
          admin.from("exercicio_ordem_usuario").delete().eq("user_id", userId).eq("grupo_id", alvo.gid).eq("exercicio_id", exid),
        ]);
        for (const d of [d1, d2, d3, d4]) if (d.error) throw d.error;
        return okJson({ ok: true, grupo_id: alvo.gid, personalizado: alvo.personalizado }, origin);
      }

      // ordenarExercicios: a ordem nova precisa ter exatamente os mesmos exercícios
      const ordem = Array.isArray(body?.ordem) ? body.ordem : null;
      if (!ordem || ordem.length !== idsAtuais.length || !ordem.every(ehUuid) || new Set(ordem).size !== ordem.length
          || !ordem.every((id: string) => idsAtuais.includes(id))) {
        return jsonErr("ordem_invalida", 400, origin);
      }
      const alvo = await listaDoAluno(admin, user, userId, gid);
      for (let i = 0; i < ordem.length; i++) {
        const up = await admin.from("tb_grupos_exercicios").update({ ordem: i }).eq("grupo_id", alvo.gid).eq("exercicio_id", ordem[i]);
        if (up.error) throw up.error;
      }
      // a ordem que o próprio aluno tinha feito sai: vale a do professor (o app mostra "a ordem do profissional")
      const d = await admin.from("exercicio_ordem_usuario").delete().eq("user_id", userId).eq("grupo_id", alvo.gid);
      if (d.error) throw d.error;
      return okJson({ ok: true, grupo_id: alvo.gid, personalizado: alvo.personalizado }, origin);
    }

    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
