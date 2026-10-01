// Physiq W16 — treino-leitura (Banco do Treino). O treino do aluno SÓ PARA LER, para quem vê o aluno no painel mas não tem sessão
// do Banco do Treino — a nutricionista responsável (spec 4.1: "Treino | Nutricionista responsável: vê"; decisão da W5: a nutri
// não troca o token). A nutri nunca ganha sessão nem escrita no Treino: esta função só lê, com a service_role, depois de o
// BANCO PRINCIPAL dizer que quem chama vê aquele aluno.
//
// POST, headers: Authorization: Bearer <access_token do PRINCIPAL> · x-schema: public|staging.
// Corpo: { action: "get" | "semanaAtual" | "volume", aluno: <id da rota: matrícula ou id do Treino>, inicio?, fim? }
// 200 → o mesmo formato das ações de leitura da admin-semana-treinos (get com podeEditar=false)
// Erros: 401 missing_auth | invalid_token · 403 sem_acesso · 404 sem_treino (o aluno ainda não entrou no app) ·
//        400 acao_invalida | aluno_invalido | periodo_invalido · 429 rate_limited · 502 principal_indisponivel · 500 erro_interno
//
// Regras de segurança: (1) o token é validado no próprio principal (GET /auth/v1/user: assinatura, validade e revogação);
// (2) quem vê o aluno é o principal que decide, com o JWT de quem chama (RPC aluno_treino → w14_matricula_da_rota: a mesma
// regra do perfil do aluno — dono, personal ou nutricionista responsável, master); (3) só as 3 leituras acima, nada grava;
// (4) freio por IP e por pessoa no isolate.
//
// verify_jwt = false (o token é do outro banco). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treino-leitura false
// NUNCA pelo workflow deploy-function.yml (ele liga o verify_jwt e a função passa a responder 401).
// Segredos: PRINCIPAL_URL, PRINCIPAL_ANON_KEY (os mesmos da trocar-token) + os automáticos do Supabase.
/* eslint-disable @typescript-eslint/no-explicit-any -- função Deno: respostas do supabase-js (service_role, sem os tipos gerados) */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRINCIPAL_URL = (Deno.env.get("PRINCIPAL_URL") || "").replace(/\/+$/, "");
const PRINCIPAL_ANON_KEY = Deno.env.get("PRINCIPAL_ANON_KEY") || "";

const SCHEMAS = ["public", "staging"];
const ACOES = new Set(["get", "semanaAtual", "volume"]);
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

// freio no isolate: por IP antes de validar o token e por pessoa depois (leitura do painel: poucas chamadas por tela)
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

async function usuarioDoPrincipal(token: string): Promise<{ id: string | null; status: number }> {
  const r = await fetch(`${PRINCIPAL_URL}/auth/v1/user`, { headers: { apikey: PRINCIPAL_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (r.status === 200) {
    const u = await r.json().catch(() => null);
    return { id: typeof u?.id === "string" ? u.id : null, status: 200 };
  }
  await r.body?.cancel();
  return { id: null, status: r.status };
}

/** O principal diz se quem chama vê o aluno (a regra do perfil do aluno) e devolve o login e o id do Treino guardado. */
async function alunoNoPrincipal(token: string, aluno: string, schema: string): Promise<{ ok: true; user_id: string | null; treino_user_id: string | null; conta_id: string | null } | { ok: false; status: number; codigo: string }> {
  const r = await fetch(`${PRINCIPAL_URL}/rest/v1/rpc/aluno_treino`, {
    method: "POST",
    headers: {
      apikey: PRINCIPAL_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Profile": schema,
      "Accept-Profile": schema,
    },
    body: JSON.stringify({ p_aluno: aluno }),
  });
  const corpo = await r.json().catch(() => null);
  if (r.status === 200 && corpo && corpo.ok === true) {
    return { ok: true, user_id: corpo.user_id ?? null, treino_user_id: corpo.treino_user_id ?? null, conta_id: corpo.conta_id ?? null };
  }
  const msg = String(corpo?.message ?? corpo?.error ?? "");
  if (r.status >= 500) return { ok: false, status: 502, codigo: "principal_indisponivel" };
  if (/aluno_inexistente/.test(msg)) return { ok: false, status: 404, codigo: "aluno_inexistente" };
  return { ok: false, status: 403, codigo: "sem_acesso" };
}

// ───────────────────────── leituras (as mesmas da admin-semana-treinos, sem nada de escrita) ─────────────────────────

async function gruposDisponiveis(admin: any, userId: string) {
  const [perf, pess] = await Promise.all([
    admin.from("tb_grupos_treino_perfis").select("grupo_id, tb_grupos_treino(id, nome, professor_id)").eq("user_id", userId),
    admin.from("tb_grupos_treino_usuario").select("id, nome").eq("user_id", userId),
  ]);
  if (perf.error) throw perf.error;
  if (pess.error) throw pess.error;
  const catalogo = new Set<string>();
  const pessoal = new Set<string>();
  const lista: any[] = [];
  ((perf.data as any[]) || []).forEach((p) => {
    if (!p.grupo_id) return;
    catalogo.add(p.grupo_id);
    lista.push({ id: p.grupo_id, nome: p.tb_grupos_treino?.nome ?? "(grupo)", tipo: "catalogo", professor_id: p.tb_grupos_treino?.professor_id ?? null });
  });
  ((pess.data as any[]) || []).forEach((g) => {
    pessoal.add(g.id);
    lista.push({ id: g.id, nome: g.nome, tipo: "pessoal" });
  });
  return { catalogo, pessoal, lista };
}

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

async function exerciciosPorTreino(admin: any, userId: string, lista: any[]): Promise<Record<string, any[]>> {
  const gids = lista.filter((g) => g.tipo === "catalogo").map((g) => g.id);
  const guids = lista.filter((g) => g.tipo === "pessoal").map((g) => g.id);
  const vazio = Promise.resolve({ data: [], error: null });
  const [cat, pes] = await Promise.all([
    gids.length ? admin.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, ordem").in("grupo_id", gids).order("ordem") : vazio,
    guids.length
      ? admin.from("tb_grupos_exercicios_usuario").select("grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem").in("grupo_usuario_id", guids).eq("user_id", userId).order("ordem")
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

async function lerGet(admin: any, userId: string) {
  const [semanaRes, disp, cfgRes, seriesRes, perfilRes] = await Promise.all([
    admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id, extra, extra_atrelado_grupo_id, extra_atrelado_grupo_usuario_id").eq("user_id", userId),
    gruposDisponiveis(admin, userId),
    admin.from("tb_semana_dia_config").select("dia_semana, alternado, alternado_inicio").eq("user_id", userId),
    admin.from("tb_series_padrao_usuario")
      .select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg, observacao")
      .eq("user_id", userId),
    admin.from("physiq_profiles")
      .select("series_padrao_qtd, series_modo, series_travadas, tempo_descanso_segundos, proxima_troca_treino, proxima_avaliacao, professor_id")
      .eq("id", userId).maybeSingle(),
  ]);
  for (const r of [semanaRes, cfgRes, seriesRes, perfilRes]) if (r.error) throw r.error;
  const exerciciosPorTreinoMap = await exerciciosPorTreino(admin, userId, disp.lista);
  const { professor_id: professorDoAluno, ...config } = (perfilRes.data as any) ?? {};
  return {
    semana: semanaRes.data ?? [],
    // quem lê por aqui não muda a lista: sem os dados de "cópia só do aluno" (lista_direta = false)
    gruposDisponiveis: disp.lista.map((g: any) => ({ ...g, alunos: 1, em_pasta: false, lista_direta: false })),
    diasConfig: cfgRes.data ?? [],
    seriesPadrao: seriesRes.data ?? [],
    exerciciosPorTreino: exerciciosPorTreinoMap,
    config: perfilRes.data ? config : null,
    podeEditar: false,
    professorDoAluno: professorDoAluno ?? null,
    somenteLeitura: true,
  };
}

async function lerSemanaAtual(admin: any, userId: string, inicio: string, fim: string) {
  const [ovRes, coRes] = await Promise.all([
    admin.from("tb_treino_dia_override").select("data_treino, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId).gte("data_treino", inicio).lte("data_treino", fim),
    admin.from("tb_treino_concluido").select("data_treino, slot_idx").eq("user_id", userId).eq("concluido", true).gte("data_treino", inicio).lte("data_treino", fim),
  ]);
  if (ovRes.error) throw ovRes.error;
  if (coRes.error) throw coRes.error;
  const dia = (v: unknown) => String(v ?? "").split("T")[0];
  return {
    overrides: ((ovRes.data as any[]) || []).map((o) => ({ ...o, data_treino: dia(o.data_treino) })),
    concluidos: ((coRes.data as any[]) || []).map((c) => ({ data_treino: dia(c.data_treino), slot_idx: c.slot_idx ?? 0 })),
  };
}

async function lerVolume(admin: any, userId: string) {
  const [semanaRes, disp, seriesRes, perfilRes] = await Promise.all([
    admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId).eq("extra", false),
    gruposDisponiveis(admin, userId),
    admin.from("tb_series_padrao_usuario").select("grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series").eq("user_id", userId),
    admin.from("physiq_profiles").select("series_padrao_qtd").eq("id", userId).maybeSingle(),
  ]);
  for (const r of [semanaRes, seriesRes, perfilRes]) if (r.error) throw r.error;
  const gruposCatalogo = [...disp.catalogo];
  const gruposPessoais = [...disp.pessoal];
  const vazio = Promise.resolve({ data: [], error: null });
  const [catRes, pessRes, subsRes] = await Promise.all([
    gruposCatalogo.length ? admin.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, tb_exercicios(id, nome, grupo_muscular, tipo)").in("grupo_id", gruposCatalogo) : vazio,
    gruposPessoais.length
      ? admin.from("tb_grupos_exercicios_usuario")
          .select("grupo_usuario_id, exercicio_id, exercicio_usuario_id, tb_exercicios(id, nome, grupo_muscular, tipo), tb_exercicios_usuario(id, nome, grupo_muscular, tipo)")
          .eq("user_id", userId).in("grupo_usuario_id", gruposPessoais)
      : vazio,
    admin.from("exercicio_substituicao_usuario").select("grupo_id, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id").eq("user_id", userId).is("data_treino", null),
  ]);
  for (const r of [catRes, pessRes, subsRes]) if (r.error) throw r.error;
  const subs = new Map<string, { novoId: string | null; novoUsuarioId: string | null }>();
  ((subsRes.data as any[]) || []).forEach((s) => subs.set(`${s.grupo_id}:${s.exercicio_origem_id}`, { novoId: s.exercicio_novo_id, novoUsuarioId: s.exercicio_novo_usuario_id }));
  const idsNovosCat = [...new Set([...subs.values()].map((s) => s.novoId).filter(Boolean))] as string[];
  const idsNovosPess = [...new Set([...subs.values()].map((s) => s.novoUsuarioId).filter(Boolean))] as string[];
  const [novosCat, novosPess] = await Promise.all([
    idsNovosCat.length ? admin.from("tb_exercicios").select("id, nome, grupo_muscular, tipo").in("id", idsNovosCat) : vazio,
    idsNovosPess.length ? admin.from("tb_exercicios_usuario").select("id, nome, grupo_muscular, tipo").in("id", idsNovosPess).eq("user_id", userId) : vazio,
  ]);
  const detNovoCat = new Map(((novosCat.data as any[]) || []).map((e) => [e.id, e]));
  const detNovoPess = new Map(((novosPess.data as any[]) || []).map((e) => [e.id, e]));
  const grupos: Record<string, { nome: string; exercicios: any[] }> = {};
  const nomeGrupo = new Map(disp.lista.map((g: any) => [`${g.tipo}:${g.id}`, g.nome]));
  ((catRes.data as any[]) || []).forEach((r) => {
    const key = `catalogo:${r.grupo_id}`;
    const g = (grupos[key] ||= { nome: nomeGrupo.get(key) ?? "(grupo)", exercicios: [] });
    const sub = subs.get(`${r.grupo_id}:${r.exercicio_id}`);
    let ex = r.tb_exercicios;
    let isPessoal = false;
    if (sub) {
      if (!sub.novoId && !sub.novoUsuarioId) return;
      const det = sub.novoUsuarioId ? detNovoPess.get(sub.novoUsuarioId) : detNovoCat.get(sub.novoId);
      if (det) {
        ex = det;
        isPessoal = !!sub.novoUsuarioId;
      }
    }
    if (ex) g.exercicios.push({ id: ex.id, isPessoal, nome: ex.nome, grupo_muscular: ex.grupo_muscular ?? "", tipo: ex.tipo ?? null });
  });
  ((pessRes.data as any[]) || []).forEach((r) => {
    const key = `pessoal:${r.grupo_usuario_id}`;
    const g = (grupos[key] ||= { nome: nomeGrupo.get(key) ?? "(grupo)", exercicios: [] });
    const ex = r.exercicio_usuario_id ? r.tb_exercicios_usuario : r.tb_exercicios;
    if (ex) g.exercicios.push({ id: ex.id, isPessoal: !!r.exercicio_usuario_id, nome: ex.nome, grupo_muscular: ex.grupo_muscular ?? "", tipo: ex.tipo ?? null });
  });
  return { semana: semanaRes.data ?? [], grupos, seriesPadrao: seriesRes.data ?? [], config: perfilRes.data ?? null };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);
  if (!PRINCIPAL_URL || !PRINCIPAL_ANON_KEY) return erro("nao_configurada", 500, origin);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";
  if (!freio(`ip:${ip}`, 120)) return erro("rate_limited", 429, origin);
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
  const action = String(corpo?.action ?? "");
  if (!ACOES.has(action)) return erro("acao_invalida", 400, origin);
  const aluno = corpo?.aluno;
  if (typeof aluno !== "string" || !UUID.test(aluno)) return erro("aluno_invalido", 400, origin);
  let inicio = "";
  let fim = "";
  if (action === "semanaAtual") {
    inicio = String(corpo?.inicio ?? "");
    fim = String(corpo?.fim ?? "");
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(inicio) || !re.test(fim) || inicio > fim) return erro("periodo_invalido", 400, origin);
    if ((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000 > 13) return erro("periodo_invalido", 400, origin);
  }

  try {
    // 1. quem chama: o login do principal (assinatura, validade e revogação conferidas lá)
    const u = await usuarioDoPrincipal(token);
    if (!u.id) return u.status >= 500 ? erro("principal_indisponivel", 502, origin) : erro("invalid_token", 401, origin);
    if (!freio(`u:${u.id}`, 60)) return erro("rate_limited", 429, origin);

    // 2. o principal decide se essa pessoa vê o aluno (e devolve o login dele)
    const a = await alunoNoPrincipal(token, aluno, schema);
    if (!a.ok) return erro(a.codigo, a.status, origin);

    // 3. o usuário do Treino do aluno: o guardado na matrícula ou o vínculo de identidade
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    let treinoUserId = a.treino_user_id;
    if (!treinoUserId && a.user_id) {
      const { data: v, error: ev } = await admin.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", a.user_id).maybeSingle();
      if (ev) throw ev;
      treinoUserId = (v as { treino_user_id?: string } | null)?.treino_user_id ?? null;
    }
    if (!treinoUserId) return erro("sem_treino", 404, origin);
    // o mesmo login pode ter matrícula em 2 contas (P7): só o treino do aluno NESTA conta (espelho do núcleo no Treino)
    if (a.conta_id) {
      const { data: pf, error: epf } = await admin.from("physiq_profiles").select("conta_id").eq("id", treinoUserId).maybeSingle();
      if (epf) throw epf;
      const contaTreino = (pf as { conta_id?: string | null } | null)?.conta_id ?? null;
      if (contaTreino && contaTreino !== a.conta_id) return erro("sem_acesso", 403, origin);
    }

    // 4. só leitura
    if (action === "get") return json({ ...(await lerGet(admin, treinoUserId)), treino_user_id: treinoUserId }, 200, origin);
    if (action === "semanaAtual") return json(await lerSemanaAtual(admin, treinoUserId, inicio, fim), 200, origin);
    return json(await lerVolume(admin, treinoUserId), 200, origin);
  } catch (e) {
    console.error("treino-leitura", action, String((e as { message?: string })?.message || e).slice(0, 300));
    return erro("erro_interno", 500, origin);
  }
});
