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

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const user = await usuarioDoToken(token, auth);
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (user.app_metadata as any)?.role;
  if (role !== "admin") return { user: null, error: jsonErr("forbidden", 403, origin) };
  const allowed = await checkRateLimit(user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

async function gruposDisponiveis(admin: any, userId: string): Promise<{ catalogo: Set<string>; pessoal: Set<string>; lista: any[] }> {
  const [perf, pess] = await Promise.all([
    admin.from("tb_grupos_treino_perfis").select("grupo_id, tb_grupos_treino(id, nome)").eq("user_id", userId),
    admin.from("tb_grupos_treino_usuario").select("id, nome").eq("user_id", userId),
  ]);
  const catalogo = new Set<string>();
  const lista: any[] = [];
  ((perf.data as any[]) || []).forEach((p) => {
    if (p.grupo_id) { catalogo.add(p.grupo_id); lista.push({ id: p.grupo_id, nome: p.tb_grupos_treino?.nome ?? "(grupo)", tipo: "catalogo" }); }
  });
  const pessoal = new Set<string>();
  ((pess.data as any[]) || []).forEach((g) => { pessoal.add(g.id); lista.push({ id: g.id, nome: g.nome, tipo: "pessoal" }); });
  return { catalogo, pessoal, lista };
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
    idsCat.length ? admin.from("tb_exercicios").select("id, nome, emoji").in("id", idsCat) : Promise.resolve({ data: [], error: null }),
    idsPes.length ? admin.from("tb_exercicios_usuario").select("id, nome, emoji").in("id", idsPes).eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
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
    saida.push({ exercicio_id: l.exercicio_id, exercicio_usuario_id: l.exercicio_usuario_id, nome: e.nome, emoji: e.emoji ?? "🏋️", ordem: l.ordem });
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
    idsCat.length ? admin.from("tb_exercicios").select("id, nome, emoji").in("id", idsCat) : vazio,
    idsPes.length ? admin.from("tb_exercicios_usuario").select("id, nome, emoji").in("id", idsPes).eq("user_id", userId) : vazio,
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
    (saida[l.key] ||= []).push({ exercicio_id: l.exercicio_id, exercicio_usuario_id: l.exercicio_usuario_id, nome: e.nome, emoji: e.emoji ?? "🏋️", ordem: l.ordem });
  }
  return saida;
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

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-semana-treinos", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const action = body?.action;
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });

    if (action === "get") {
      const [semanaRes, disp, cfgRes, seriesRes] = await Promise.all([
        admin.from("tb_semana_treinos")
          .select("dia_semana, slot_idx, grupo_id, grupo_usuario_id, extra, extra_atrelado_grupo_id, extra_atrelado_grupo_usuario_id")
          .eq("user_id", userId),
        gruposDisponiveis(admin, userId),
        admin.from("tb_semana_dia_config").select("dia_semana, alternado, alternado_inicio").eq("user_id", userId),
        // nº de séries por treino (sem linha = padrão 3 no app)
        admin.from("tb_series_padrao_usuario").select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series").eq("user_id", userId),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      if (cfgRes.error) throw cfgRes.error;
      if (seriesRes.error) throw seriesRes.error;
      // exercícios de cada treino já vão junto: o popup "Séries" abre sem nova chamada
      const exerciciosPorTreinoMap = await exerciciosPorTreino(admin, userId, disp.lista);
      return new Response(JSON.stringify({
        semana: semanaRes.data ?? [], gruposDisponiveis: disp.lista, diasConfig: cfgRes.data ?? [],
        seriesPadrao: seriesRes.data ?? [], exerciciosPorTreino: exerciciosPorTreinoMap,
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
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
      const [semanaRes, disp, seriesRes] = await Promise.all([
        admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId).eq("extra", false),
        gruposDisponiveis(admin, userId),
        // nº de séries configurado no Treino Diário (badge "Séries") — o Programado usa a mesma fonte do treino do aluno
        admin.from("tb_series_padrao_usuario").select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series").eq("user_id", userId),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      if (seriesRes.error) throw seriesRes.error;
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

      return new Response(JSON.stringify({ semana, grupos, seriesPadrao: seriesRes.data ?? [] }), {
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
      let del = admin.from("tb_series_padrao_usuario").delete().eq("user_id", userId);
      del = alvo.gid ? del.eq("grupo_id", alvo.gid) : del.eq("grupo_usuario_id", alvo.guid);
      const d = await del;
      if (d.error) throw d.error;
      // não-atômico de propósito (mesmo padrão do setDia): se o insert falhar, o treino volta ao padrão 3
      const ins = await admin.from("tb_series_padrao_usuario").insert({
        user_id: userId, grupo_id: alvo.gid, grupo_usuario_id: alvo.guid,
        exercicio_id: null, exercicio_usuario_id: null, num_series: n, updated_at: new Date().toISOString(),
      });
      if (ins.error) throw ins.error;
      return okJson({ ok: true, num_series: n }, origin);
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

    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
