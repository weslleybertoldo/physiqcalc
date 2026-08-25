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

function jsonOk(payload: unknown, origin: string | null) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TZ = "America/Sao_Paulo";
const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId, p_endpoint: endpoint, p_max_count: maxCount, p_window_secs: windowSecs,
    });
    if (error) return true; // fail-open em erro pra evitar lockout
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

// ── Helpers de data ──

/** Data (YYYY-MM-DD) de um timestamptz no fuso de São Paulo. */
function dataBRT(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Primeiro e último dia do mês em YYYY-MM-DD. */
function limitesDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { inicio: `${ano}-${pad(mes)}-01`, fim: `${ano}-${pad(mes)}-${pad(ultimo)}` };
}

/** Rótulo do dia da semana (DOM..SAB) para uma data YYYY-MM-DD. */
function diaSemana(dataStr: string): string {
  const [y, m, d] = dataStr.split("-").map(Number);
  return DIAS_LABEL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// ── Resolução do nome do treino ──

/**
 * Resolve o nome do treino por (data, slot) para um usuário.
 * Ordem: override do dia → programação da semana (tb_semana_treinos) → null.
 * Observação: dias marcados como "alternado" (tb_semana_dia_config) fazem rotação
 * entre treinos; aqui usamos o slot programado como aproximação — os dias alternados
 * na prática vêm do cronômetro, que já grava o nome exato em treino_historico.
 */
async function resolverNomesTreino(
  admin: any,
  userId: string,
  datas: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (datas.length === 0) return mapa;

  const ordenadas = [...datas].sort();
  const [overRes, semanaRes] = await Promise.all([
    admin.from("tb_treino_dia_override")
      .select("data_treino, slot_idx, grupo_id, grupo_usuario_id")
      .eq("user_id", userId)
      .gte("data_treino", ordenadas[0])
      .lte("data_treino", ordenadas[ordenadas.length - 1]),
    admin.from("tb_semana_treinos")
      .select("dia_semana, slot_idx, grupo_id, grupo_usuario_id")
      .eq("user_id", userId),
  ]);

  const linhas = [...((overRes.data as any[]) || []), ...((semanaRes.data as any[]) || [])];
  const idsCat = [...new Set(linhas.map((l) => l.grupo_id).filter(Boolean))];
  const idsPess = [...new Set(linhas.map((l) => l.grupo_usuario_id).filter(Boolean))];

  const [cat, pess] = await Promise.all([
    idsCat.length ? admin.from("tb_grupos_treino").select("id, nome").in("id", idsCat) : Promise.resolve({ data: [] }),
    idsPess.length ? admin.from("tb_grupos_treino_usuario").select("id, nome").in("id", idsPess) : Promise.resolve({ data: [] }),
  ]);
  const nomePorId = new Map<string, string>();
  ((cat.data as any[]) || []).forEach((g) => nomePorId.set(g.id, g.nome));
  ((pess.data as any[]) || []).forEach((g) => nomePorId.set(g.id, g.nome));

  const nomeDaLinha = (l: any): string | null =>
    nomePorId.get(l.grupo_usuario_id) ?? nomePorId.get(l.grupo_id) ?? null;

  // Programação da semana: dia_semana + slot_idx
  const porDiaSlot = new Map<string, string>();
  ((semanaRes.data as any[]) || []).forEach((l) => {
    const nome = nomeDaLinha(l);
    if (nome) porDiaSlot.set(`${l.dia_semana}#${l.slot_idx ?? 0}`, nome);
  });

  // Override do dia tem precedência
  const porDataSlot = new Map<string, string>();
  ((overRes.data as any[]) || []).forEach((l) => {
    const nome = nomeDaLinha(l);
    const dataKey = l.data_treino ? String(l.data_treino).split("T")[0] : null;
    if (nome && dataKey) porDataSlot.set(`${dataKey}#${l.slot_idx ?? 0}`, nome);
  });

  datas.forEach((data) => {
    for (let slot = 0; slot <= 3; slot++) {
      const chave = `${data}#${slot}`;
      const nome = porDataSlot.get(chave) ?? porDiaSlot.get(`${diaSemana(data)}#${slot}`);
      if (nome) mapa.set(chave, nome);
    }
  });

  return mapa;
}

/**
 * Monta registros no formato de `treino_historico` a partir das séries concluídas,
 * para treinos que NÃO passaram pelo cronômetro (quem só marca os exercícios).
 * Sem cronômetro não há duração nem horários — só a lista de exercícios e séries.
 *
 * `datasConcluidas` (linhas de tb_treino_concluido) delimita o que conta como treino:
 * é o MESMO universo da lista do mês. Sem esse recorte, um dia com séries soltas que
 * o aluno nunca concluiu apareceria no popup — carimbado "✓ Concluído" pelo card —
 * sem aparecer na lista.
 */
async function sintetizarDeSeries(
  admin: any,
  userId: string,
  inicio: string,
  fim: string,
  datasComTimer: Set<string>,
  datasConcluidas: Set<string>,
): Promise<any[]> {
  const { data: series } = await admin.from("tb_treino_series")
    .select("data_treino, slot_idx, numero_serie, peso, reps, exercicio_id, exercicio_usuario_id, academia_nome")
    .eq("user_id", userId)
    .eq("concluida", true)
    .gte("data_treino", inicio)
    .lte("data_treino", fim)
    .order("data_treino")
    .order("numero_serie")
    .limit(5000);

  const linhas = ((series as any[]) || []).filter((s) => {
    const data = String(s.data_treino).split("T")[0];
    return !datasComTimer.has(data) && datasConcluidas.has(data);
  });
  if (linhas.length === 0) return [];

  // Nomes dos exercícios
  const idsCat = [...new Set(linhas.map((s) => s.exercicio_id).filter(Boolean))];
  const idsPess = [...new Set(linhas.map((s) => s.exercicio_usuario_id).filter(Boolean))];
  const [cat, pess] = await Promise.all([
    idsCat.length ? admin.from("tb_exercicios").select("id, nome").in("id", idsCat) : Promise.resolve({ data: [] }),
    idsPess.length ? admin.from("tb_exercicios_usuario").select("id, nome").in("id", idsPess) : Promise.resolve({ data: [] }),
  ]);
  const nomeEx = new Map<string, string>();
  ((cat.data as any[]) || []).forEach((e) => nomeEx.set(e.id, e.nome));
  ((pess.data as any[]) || []).forEach((e) => nomeEx.set(e.id, e.nome));

  // Agrupa por (data, slot) → exercício
  const porTreino = new Map<string, { data: string; slot: number; exercicios: Map<string, any> }>();
  linhas.forEach((s) => {
    const data = String(s.data_treino).split("T")[0];
    const slot = s.slot_idx ?? 0;
    const chave = `${data}#${slot}`;
    if (!porTreino.has(chave)) porTreino.set(chave, { data, slot, exercicios: new Map() });
    const treino = porTreino.get(chave)!;
    const exId = s.exercicio_usuario_id ?? s.exercicio_id;
    if (!exId) return;
    if (!treino.exercicios.has(exId)) {
      treino.exercicios.set(exId, {
        exercicio_id: exId,
        nome: nomeEx.get(exId) ?? "Exercício",
        academia_nome: s.academia_nome ?? null,
        series: [],
      });
    }
    treino.exercicios.get(exId).series.push({
      numero_serie: s.numero_serie,
      peso: Number(s.peso ?? 0),
      reps: Number(s.reps ?? 0),
    });
  });

  const datasSintetizadas = [...porTreino.values()].map((t) => t.data);
  const nomes = await resolverNomesTreino(admin, userId, [...new Set(datasSintetizadas)]);

  return [...porTreino.entries()].map(([chave, t]) => {
    const exercicios = [...t.exercicios.values()].map((ex) => ({
      ...ex,
      series_concluidas: ex.series.length,
    }));
    // Meia-noite BRT (UTC-3) do dia do treino — só para ordenação/rótulo de data.
    const refIso = `${t.data}T12:00:00-03:00`;
    return {
      id: `sintetico:${chave}`,
      user_id: userId,
      nome_treino: nomes.get(chave) ?? "Treino",
      iniciado_em: refIso,
      concluido_em: refIso,
      duracao_segundos: 0,
      exercicios_concluidos: exercicios,
      sem_cronometro: true,
    };
  });
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-relatorio", 60, 60);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });

    // ── Relatório mensal de um aluno (usado pela aba Relatório e pelos exports) ──
    if (action === "relatorio") {
      const userId = body?.userId;
      const ano = Number(body?.ano);
      const mes = Number(body?.mes);
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
        return jsonErr("periodo_invalido", 400, origin);
      }
      const { inicio, fim } = limitesDoMes(ano, mes);

      const [concluidosRes, seriesRes] = await Promise.all([
        admin.from("tb_treino_concluido")
          .select("data_treino, slot_idx")
          .eq("user_id", userId).eq("concluido", true)
          .gte("data_treino", inicio).lte("data_treino", fim)
          .order("data_treino"),
        admin.from("tb_treino_series")
          .select(`
            data_treino, numero_serie, peso, reps, concluida, slot_idx,
            exercicio_id, exercicio_usuario_id,
            tb_exercicios ( nome, grupo_muscular, emoji ),
            tb_exercicios_usuario ( nome, grupo_muscular, emoji )
          `)
          .eq("user_id", userId).eq("concluida", true)
          .gte("data_treino", inicio).lte("data_treino", fim)
          .order("data_treino").order("numero_serie")
          .limit(5000),
      ]);
      if (concluidosRes.error) throw concluidosRes.error;
      if (seriesRes.error) throw seriesRes.error;

      const concluidos = ((concluidosRes.data as any[]) || []).map((c) => ({
        data_treino: String(c.data_treino).split("T")[0],
      }));
      const series = (seriesRes.data as any[]) || [];

      // Nome do treino por data: override → programação da semana.
      const datas = [...new Set([
        ...concluidos.map((c) => c.data_treino),
        ...series.map((s) => String(s.data_treino).split("T")[0]),
      ])];
      const nomes = await resolverNomesTreino(admin, userId, datas);
      const grupoNomePorData: Record<string, string> = {};
      datas.forEach((d) => {
        const nome = nomes.get(`${d}#0`) ?? nomes.get(`${d}#1`);
        if (nome) grupoNomePorData[d] = nome;
      });

      return jsonOk({ concluidos, series, grupoNomePorData }, origin);
    }

    // ── Lista do mês com os treinos de TODOS os alunos ──
    if (action === "historicoMes") {
      const ano = Number(body?.ano);
      const mes = Number(body?.mes);
      if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
        return jsonErr("periodo_invalido", 400, origin);
      }
      const { inicio, fim } = limitesDoMes(ano, mes);
      // Janela ampliada em timestamptz: um treino iniciado no fim do mês pode
      // ter sido concluído no mês seguinte (cronômetro atravessa a virada).
      const deIso = `${inicio}T00:00:00-03:00`;
      const ateIso = `${fim}T23:59:59-03:00`;

      const [perfisRes, timerRes, concluidosRes] = await Promise.all([
        admin.from("physiq_profiles").select("id, nome, email, user_code"),
        admin.from("treino_historico")
          .select("id, user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos")
          .gte("iniciado_em", deIso).lte("iniciado_em", ateIso)
          .order("iniciado_em", { ascending: false })
          .limit(1000),
        admin.from("tb_treino_concluido")
          .select("user_id, data_treino, slot_idx")
          .eq("concluido", true)
          .gte("data_treino", inicio).lte("data_treino", fim)
          .limit(2000),
      ]);
      if (timerRes.error) throw timerRes.error;
      if (concluidosRes.error) throw concluidosRes.error;

      const perfil = new Map<string, any>();
      ((perfisRes.data as any[]) || []).forEach((p) => perfil.set(p.id, p));

      const itens: any[] = [];
      const timerPorUsuarioData = new Map<string, Set<string>>();

      // 1) Treinos com cronômetro: nome, duração e academia já gravados.
      ((timerRes.data as any[]) || []).forEach((h) => {
        const data = dataBRT(h.iniciado_em);
        if (data < inicio || data > fim) return;
        if (!timerPorUsuarioData.has(h.user_id)) timerPorUsuarioData.set(h.user_id, new Set());
        timerPorUsuarioData.get(h.user_id)!.add(data);

        const exs = Array.isArray(h.exercicios_concluidos) ? h.exercicios_concluidos : [];
        const academia = exs.find((e: any) => e?.academia_nome)?.academia_nome ?? null;
        itens.push({
          chave: `h:${h.id}`,
          userId: h.user_id,
          pessoa: perfil.get(h.user_id)?.nome || "(sem nome)",
          data,
          diaSemana: diaSemana(data),
          nomeTreino: h.nome_treino || "Treino",
          duracaoSegundos: h.duracao_segundos ?? 0,
          totalExercicios: exs.length,
          academia,
          comCronometro: true,
        });
      });

      // 2) Treinos marcados como concluídos que não passaram pelo cronômetro.
      const semTimer = ((concluidosRes.data as any[]) || []).filter((c) => {
        const data = String(c.data_treino).split("T")[0];
        return !timerPorUsuarioData.get(c.user_id)?.has(data);
      });

      const porUsuario = new Map<string, string[]>();
      semTimer.forEach((c) => {
        const data = String(c.data_treino).split("T")[0];
        if (!porUsuario.has(c.user_id)) porUsuario.set(c.user_id, []);
        porUsuario.get(c.user_id)!.push(data);
      });

      const nomesPorUsuario = new Map<string, Map<string, string>>();
      await Promise.all([...porUsuario.entries()].map(async ([uid, datas]) => {
        nomesPorUsuario.set(uid, await resolverNomesTreino(admin, uid, [...new Set(datas)]));
      }));

      // Contagem de exercícios distintos por (usuário, data) para os sem cronômetro.
      await Promise.all([...porUsuario.entries()].map(async ([uid, datas]) => {
        const ordenadas = [...datas].sort();
        const { data: sRows } = await admin.from("tb_treino_series")
          .select("data_treino, exercicio_id, exercicio_usuario_id")
          .eq("user_id", uid).eq("concluida", true)
          .gte("data_treino", ordenadas[0]).lte("data_treino", ordenadas[ordenadas.length - 1])
          .limit(3000);
        const exsPorData = new Map<string, Set<string>>();
        ((sRows as any[]) || []).forEach((s) => {
          const d = String(s.data_treino).split("T")[0];
          if (!exsPorData.has(d)) exsPorData.set(d, new Set());
          const exId = s.exercicio_usuario_id ?? s.exercicio_id;
          if (exId) exsPorData.get(d)!.add(exId);
        });
        [...new Set(datas)].forEach((data) => {
          const slot = semTimer.find((c) => c.user_id === uid && String(c.data_treino).split("T")[0] === data)?.slot_idx ?? 0;
          itens.push({
            chave: `c:${uid}:${data}:${slot}`,
            userId: uid,
            pessoa: perfil.get(uid)?.nome || "(sem nome)",
            data,
            diaSemana: diaSemana(data),
            nomeTreino: nomesPorUsuario.get(uid)?.get(`${data}#${slot}`) ?? "Treino",
            duracaoSegundos: null,
            totalExercicios: exsPorData.get(data)?.size ?? 0,
            academia: null,
            comCronometro: false,
          });
        });
      }));

      itens.sort((a, b) => (a.data === b.data ? a.pessoa.localeCompare(b.pessoa) : b.data.localeCompare(a.data)));
      return jsonOk({ itens }, origin);
    }

    // ── UM treino específico (popup ao clicar na linha da lista) ──
    // `chave` vem da lista: "h:<id>" para registro do cronômetro,
    // "c:<userId>:<data>:<slot>" para treino reconstruído das séries.
    if (action === "historicoTreino") {
      const userId = body?.userId;
      const chave = body?.chave;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!chave || typeof chave !== "string") return jsonErr("missing_chave", 400, origin);

      if (chave.startsWith("h:")) {
        const { data, error } = await admin.from("treino_historico")
          .select("id, user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos")
          .eq("id", chave.slice(2))
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        return jsonOk({ treino: data ?? null }, origin);
      }

      if (chave.startsWith("c:")) {
        const partes = chave.split(":");
        const dataTreino = partes[2];
        const slot = partes[3] ?? "0";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTreino ?? "")) return jsonErr("chave_invalida", 400, origin);
        const sinteticos = await sintetizarDeSeries(
          admin, userId, dataTreino, dataTreino, new Set<string>(), new Set<string>([dataTreino]),
        );
        const alvo = sinteticos.find((s) => s.id === `sintetico:${dataTreino}#${slot}`) ?? sinteticos[0] ?? null;
        return jsonOk({ treino: alvo }, origin);
      }

      return jsonErr("chave_invalida", 400, origin);
    }

    // ── Histórico completo de um aluno (popup do botão Buscar) ──
    if (action === "historicoUsuario") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);

      const { data: timerRows, error: timerErr } = await admin.from("treino_historico")
        .select("id, user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos")
        .eq("user_id", userId)
        .order("concluido_em", { ascending: false })
        .limit(500);
      if (timerErr) throw timerErr;

      const comTimer = new Set<string>(((timerRows as any[]) || []).map((h) => dataBRT(h.iniciado_em)));

      // Sintetiza os últimos 12 meses de treinos sem cronômetro.
      const hoje = new Date();
      const fim = hoje.toLocaleDateString("en-CA", { timeZone: TZ });
      const dozeMesesAtras = new Date(hoje.getTime() - 365 * 24 * 3600 * 1000);
      const inicio = dozeMesesAtras.toLocaleDateString("en-CA", { timeZone: TZ });
      const { data: conclRows } = await admin.from("tb_treino_concluido")
        .select("data_treino")
        .eq("user_id", userId).eq("concluido", true)
        .gte("data_treino", inicio).lte("data_treino", fim)
        .limit(2000);
      const datasConcluidas = new Set<string>(
        ((conclRows as any[]) || []).map((c) => String(c.data_treino).split("T")[0]),
      );

      const sinteticos = await sintetizarDeSeries(admin, userId, inicio, fim, comTimer, datasConcluidas);

      const historico = [...((timerRows as any[]) || []), ...sinteticos]
        .sort((a, b) => String(b.iniciado_em).localeCompare(String(a.iniciado_em)));

      return jsonOk({ historico }, origin);
    }

    return jsonErr("invalid_action", 400, origin);
  } catch (_e) {
    return jsonErr("internal", 500, origin);
  }
});
