import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
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

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (data.user.app_metadata as any)?.role;
  if (role !== "admin") return { user: null, error: jsonErr("forbidden", 403, origin) };
  const allowed = await checkRateLimit(data.user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user: data.user, error: null };
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
      const [semanaRes, disp] = await Promise.all([
        admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId),
        gruposDisponiveis(admin, userId),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      return new Response(JSON.stringify({ semana: semanaRes.data ?? [], gruposDisponiveis: disp.lista }), {
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
      const del = await admin.from("tb_semana_treinos").delete().eq("user_id", userId).eq("dia_semana", dia);
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
      const [semanaRes, disp] = await Promise.all([
        admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId),
        gruposDisponiveis(admin, userId),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      const semana = (semanaRes.data as any[]) ?? [];
      const gruposCatalogo = [...new Set(semana.map((r) => r.grupo_id).filter(Boolean))] as string[];
      const gruposPessoais = [...new Set(semana.map((r) => r.grupo_usuario_id).filter(Boolean))] as string[];

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

      // séries do último treino registrado de cada exercício (fallback null → front usa 3)
      const unicos = new Map<string, { id: string; isPessoal: boolean }>();
      Object.values(grupos).forEach((g) => g.exercicios.forEach((e) => unicos.set(`${e.isPessoal ? "p" : "c"}:${e.id}`, e)));
      const contagens = new Map<string, number>();
      await Promise.all([...unicos.entries()].map(async ([k, e]) => {
        const col = e.isPessoal ? "exercicio_usuario_id" : "exercicio_id";
        const { data } = await admin.from("tb_treino_series")
          .select("data_treino, slot_idx, numero_serie")
          .eq("user_id", userId).eq(col, e.id)
          .order("data_treino", { ascending: false }).limit(20);
        const rows = (data as any[]) || [];
        if (!rows.length) return;
        const ultima = rows[0].data_treino;
        const porSlot = new Map<number, number>();
        rows.filter((r) => r.data_treino === ultima).forEach((r) => {
          const s = r.slot_idx ?? 0;
          porSlot.set(s, (porSlot.get(s) ?? 0) + 1);
        });
        contagens.set(k, Math.max(...porSlot.values()));
      }));
      Object.values(grupos).forEach((g) => {
        (g.exercicios as any[]).forEach((e) => {
          e.seriesUltimo = contagens.get(`${e.isPessoal ? "p" : "c"}:${e.id}`) ?? null;
        });
      });

      return new Response(JSON.stringify({ semana, grupos }), {
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
