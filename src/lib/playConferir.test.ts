// @vitest-environment node
// src/lib/playConferir.test.ts
// Physiq play-W6 F1 (22/10/2026) — a CONFERÊNCIA de hora em hora das assinaturas da Google Play (supabase-principal/functions/play-conferir/
// rodada.ts), no lugar do aviso do Google pelo Pub/Sub (o RTDN e a play-rtdn saíram em 22/10: o Google Cloud ficou sem faturamento e sem
// faturamento não há Pub/Sub). Um banco FALSO em memória (o molde do src/financeiro/mpContasRenovar.test.ts) com a play_aplicar FALSA — o
// essencial da migration: a assinatura pelo token (a substituída não volta), a cobrança do pedido PAGO 1 vez só, a devolução do pedido — e
// um Google FALSO pelo fetch (o GET purchases.subscriptionsv2, o acknowledge, o cancel e a Voided Purchases API com a janela e as páginas).
// E o contrato da index.ts, que o Vitest não importa (Deno.serve, esm.sh e o Deno.env no topo): o segredo S11 ANTES do corpo e o 401 igual
// para o sem e o errado. Nada vai à rede: a conta de serviço é FALSA, com a chave gerada aqui.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  FOLGA_DEVOLVIDAS_MS, JANELA_PADRAO_DEVOLVIDAS_MS, MAX_JANELA_DEVOLVIDAS_MS, janelaDasDevolvidas, lerDevolvidas,
} from "../../supabase-principal/functions/_shared/play-regras";
import { conferir, lerPedido, POR_RODADA, type Contagem } from "../../supabase-principal/functions/play-conferir/rodada";

const HORA = 3_600_000;
const DIA = 24 * HORA;
const FUNCOES = resolve(__dirname, "../../supabase-principal/functions");
const fonte = (rel: string) => readFileSync(resolve(FUNCOES, rel), "utf-8");
const iso = (ms: number) => new Date(ms).toISOString();
/** A matrícula n do teste (o uuid c3000000-…-00000000000n). */
const mat = (n: number) => `c3000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ───────────────────────── o banco falso ─────────────────────────

type Linha = Record<string, unknown>;
type Filtro =
  | { col: string; op: "eq" | "neq" | "gt" | "lt" | "gte" | "lte"; v: unknown }
  | { col: string; op: "is"; v: null }
  | { col: string; op: "in"; v: unknown[] }
  | { op: "or"; texto: string };
interface Pedido {
  tabela: string;
  op: "select" | "update" | "upsert" | "rpc";
  colunas: string | null;
  volta: string | null;
  contar: boolean;
  valores: Linha | null;
  conflito: string | null;
  filtros: Filtro[];
  ordens: Array<{ col: string; asc: boolean }>;
  unico: boolean;
  limite: number | null;
  args: Record<string, unknown> | null;
}
interface RespostaDb { data: unknown; error: { code: string; message: string } | null; count?: number | null }

const vazio = (x: unknown) => x === null || x === undefined;
const comparavel = (x: unknown) => (typeof x === "string" && /^\d{4}-\d\d-\d\dT/.test(x) ? Date.parse(x) : Number(x));
function passa(l: Linha, f: Filtro): boolean {
  if (f.op === "or") {
    return f.texto.split(",").some((parte) => {
      const [col, op, ...resto] = parte.split(".");
      return op === "is" ? vazio(l[col]) : passa(l, { col, op: op as "eq", v: resto.join(".") });
    });
  }
  const x = l[f.col];
  switch (f.op) {
    case "eq": return !vazio(x) && String(x) === String(f.v);
    case "neq": return !vazio(x) && String(x) !== String(f.v);
    case "is": return vazio(x);
    case "in": return f.v.map(String).includes(String(x));
    case "gt": return !vazio(x) && comparavel(x) > comparavel(f.v);
    case "lt": return !vazio(x) && comparavel(x) < comparavel(f.v);
    case "gte": return !vazio(x) && comparavel(x) >= comparavel(f.v);
    case "lte": return !vazio(x) && comparavel(x) <= comparavel(f.v);
    default: return false;
  }
}
function projetar(l: Linha, colunas: string): Linha {
  if (colunas.trim() === "*") return { ...l };
  return Object.fromEntries(colunas.split(",").map((c) => c.trim()).map((c) => [c, l[c] ?? null]));
}

/** O essencial da {schema}.play_aplicar (supabase-principal/migrations/20261016010000_playw6_play_billing.sql §5). */
function playAplicarFalsa(t: Record<string, Linha[]>, p: Linha, agora: () => string): Linha {
  const pac = t.pacientes.find((x) => x.id === p.paciente_id);
  if (!pac) return { ok: false, erro: "sem_matricula" };
  let a = t.play_assinaturas.find((x) => x.token === p.token);
  const nova = !a;
  if (a && a.paciente_id !== p.paciente_id) return { ok: false, erro: "token_de_outra_matricula" };
  const estado = String(p.estado);
  const porGoogle = ["cancelada", "expirada", "revogada"].includes(estado) ? "google" : null;
  if (!a) {
    a = { paciente_id: p.paciente_id, token: p.token, produto: p.produto, estado, expira_em: p.expira_em ?? null, renova: p.renova === true,
          reconhecida_em: p.reconhecida ? agora() : null, teste: p.teste === true, ultimo_pedido: p.pedido ?? null,
          cancelada_por: p.cancelada_por ?? porGoogle, atualizada_em: agora() };
    t.play_assinaturas.push(a);
  } else {
    const substituida = a.estado === "substituida";
    Object.assign(a, {
      produto: p.produto, estado: substituida ? "substituida" : estado, expira_em: p.expira_em ?? null, renova: p.renova === true,
      reconhecida_em: a.reconhecida_em ?? (p.reconhecida ? agora() : null), teste: a.teste === true || p.teste === true,
      ultimo_pedido: p.pedido ?? a.ultimo_pedido,
      cancelada_por: !substituida && ["pendente", "ativa", "carencia"].includes(estado) ? null : (p.cancelada_por ?? a.cancelada_por ?? porGoogle),
      atualizada_em: agora(),
    });
  }
  let cobranca: string | null = null;
  if (p.pedido && a.teste !== true && ["ativa", "cancelada", "carencia"].includes(String(a.estado))) {
    if (t.cobrancas.some((c) => c.play_pedido === p.pedido)) cobranca = "ja_tinha";
    else {
      t.cobrancas.push({ id: `cob-${t.cobrancas.length + 1}`, paciente_id: p.paciente_id, forma: "google_play", status: "paga", play_pedido: p.pedido,
                         valor: p.valor ?? 29.9, reembolsado_em: null });
      cobranca = "nova";
    }
  }
  let devolvidas = 0;
  if (p.devolvido_pedido) {
    for (const c of t.cobrancas) {
      if (c.play_pedido === p.devolvido_pedido && c.forma === "google_play" && c.paciente_id === p.paciente_id && c.status === "paga") {
        c.status = "cancelada";
        c.reembolsado_em = agora();
        devolvidas++;
      }
    }
  }
  return { ok: true, nova, estado: a.estado, expira_em: a.expira_em, reconhecida_em: a.reconhecida_em, adiar_ate: null, adiada_em: null,
           cobranca, devolvidas, matricula_ativa: pac.ativo === true && !pac.deleted_at };
}

function criarDb(inicio: Partial<Record<string, Linha[]>>) {
  const t: Record<string, Linha[]> = { pacientes: [], play_assinaturas: [], cobrancas: [], app_config: [], ...inicio } as Record<string, Linha[]>;
  const pedidos: Pedido[] = [];
  let relogio = Date.parse("2026-10-22T20:00:00.000Z");
  /** cada gravação anda 1 ms (a ordem do atualizada_em = a ordem das sincronias, como no banco de verdade) */
  const agora = () => iso(++relogio);

  function executar(p: Pedido): RespostaDb {
    if (p.op === "rpc") {
      if (p.tabela !== "play_aplicar") return { data: null, error: { code: "42883", message: `function ${p.tabela} does not exist` } };
      return { data: playAplicarFalsa(t, (p.args?.p ?? {}) as Linha, agora), error: null };
    }
    const lista = (t[p.tabela] ??= []);
    if (p.op === "upsert") {
      const chave = p.conflito ?? "id";
      const achada = lista.find((l) => l[chave] === p.valores?.[chave]);
      if (achada) Object.assign(achada, p.valores);
      else lista.push({ ...p.valores });
      return { data: null, error: null };
    }
    const achadas = lista.filter((l) => p.filtros.every((f) => passa(l, f)));
    if (p.op === "update") {
      for (const l of achadas) Object.assign(l, p.valores);
      return { data: p.volta === null ? null : achadas.map((l) => projetar(l, p.volta!)), error: null };
    }
    let saida = [...achadas].sort((a, b) => {
      for (const o of p.ordens) {
        const d = comparavel(a[o.col]) - comparavel(b[o.col]) || (String(a[o.col]) < String(b[o.col]) ? -1 : String(a[o.col]) > String(b[o.col]) ? 1 : 0);
        if (d) return o.asc ? d : -d;
      }
      return 0;
    });
    if (p.limite !== null) saida = saida.slice(0, p.limite);
    const linhas = saida.map((l) => projetar(l, p.colunas ?? "*"));
    return { data: p.unico ? (linhas[0] ?? null) : linhas, error: null, count: p.contar ? achadas.length : null };
  }

  function consulta(p: Pedido) {
    const q = {
      select: (colunas = "*", opcoes?: { count?: string }) => {
        if (p.op === "select") {
          p.colunas = colunas;
          p.contar = opcoes?.count === "exact";
        } else p.volta = colunas;
        return q;
      },
      update: (valores: Linha) => Object.assign(p, { op: "update", valores }) && q,
      upsert: (valores: Linha, opcoes?: { onConflict?: string }) => Object.assign(p, { op: "upsert", valores, conflito: opcoes?.onConflict ?? null }) && q,
      eq: (col: string, v: unknown) => (p.filtros.push({ col, op: "eq", v }), q),
      neq: (col: string, v: unknown) => (p.filtros.push({ col, op: "neq", v }), q),
      lt: (col: string, v: unknown) => (p.filtros.push({ col, op: "lt", v }), q),
      gte: (col: string, v: unknown) => (p.filtros.push({ col, op: "gte", v }), q),
      is: (col: string) => (p.filtros.push({ col, op: "is", v: null }), q),
      in: (col: string, v: unknown[]) => (p.filtros.push({ col, op: "in", v }), q),
      or: (texto: string) => (p.filtros.push({ op: "or", texto }), q),
      order: (col: string, opcoes: { ascending?: boolean } = {}) => (p.ordens.push({ col, asc: opcoes.ascending !== false }), q),
      limit: (n: number) => Object.assign(p, { limite: n }) && q,
      maybeSingle: () => Object.assign(p, { unico: true }) && q,
      then<A = RespostaDb, B = never>(ok?: ((v: RespostaDb) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
        return Promise.resolve().then(() => executar(p)).then(ok, ko);
      },
    };
    return q;
  }
  const novo = (tabela: string, op: Pedido["op"], args: Record<string, unknown> | null = null): Pedido => {
    const p: Pedido = { tabela, op, colunas: null, volta: null, contar: false, valores: null, conflito: null, filtros: [], ordens: [], unico: false,
                        limite: null, args };
    pedidos.push(p);
    return p;
  };
  const cliente = {
    from: (tabela: string) => consulta(novo(tabela, "select")),
    rpc: (nome: string, args: Record<string, unknown>) => consulta(novo(nome, "rpc", args)),
  };
  return { cliente, t, pedidos };
}

// ───────────────────────── o Google falso ─────────────────────────

interface CompraG {
  estado: string;
  produto: string;
  expira: number;
  renova: boolean;
  conta: string;
  pedidos: string[];
  reconhecida: boolean;
}
const ESTADO_G: Record<string, string> = {
  pendente: "SUBSCRIPTION_STATE_PENDING", ativa: "SUBSCRIPTION_STATE_ACTIVE", cancelada: "SUBSCRIPTION_STATE_CANCELED",
  carencia: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", suspensa: "SUBSCRIPTION_STATE_ON_HOLD", pausada: "SUBSCRIPTION_STATE_PAUSED",
  expirada: "SUBSCRIPTION_STATE_EXPIRED",
};
const resposta = (status: number, corpo: unknown) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function googleFalso(agoraMs: () => number) {
  const compras = new Map<string, CompraG>();
  const devolvidas: Array<{ token: string; pedido: string; vistaMs: number }> = [];
  const idas: Array<{ metodo: string; acao: string; token: string | null; query: URLSearchParams; corpo: unknown }> = [];
  const falhas: { get?: Map<string, number>; voided?: number; porPagina: number } = { porPagina: 1000 };

  const v2 = (c: CompraG) => ({
    kind: "androidpublisher#subscriptionPurchaseV2",
    startTime: iso(c.expira - 30 * DIA),
    subscriptionState: c.estado,
    latestOrderId: c.pedidos[c.pedidos.length - 1],
    acknowledgementState: c.reconhecida ? "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" : "ACKNOWLEDGEMENT_STATE_PENDING",
    externalAccountIdentifiers: { obfuscatedExternalAccountId: c.conta },
    etag: `etag-${c.pedidos.length}`,
    lineItems: [{
      productId: c.produto, expiryTime: iso(c.expira),
      autoRenewingPlan: { autoRenewEnabled: c.renova, recurringPrice: { currencyCode: "BRL", units: "29", nanos: 900000000 } },
      offerDetails: { basePlanId: "mensal" }, latestSuccessfulOrderId: c.pedidos[c.pedidos.length - 1],
    }],
  });

  const buscar = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/token")) return resposta(200, { access_token: "acesso-falso", expires_in: 3600 });
    const metodo = String(init?.method ?? "GET");
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    if (u.pathname.endsWith("/purchases/voidedpurchases")) {
      idas.push({ metodo, acao: "voided", token: null, query: u.searchParams, corpo });
      if (falhas.voided) return resposta(falhas.voided, { error: { code: falhas.voided, status: "UNAVAILABLE", errors: [{ reason: "backendError" }] } });
      const de = Number(u.searchParams.get("startTime"));
      const ate = Number(u.searchParams.get("endTime"));
      // type=1 (as assinaturas também); sem ele o Google devolve só os produtos avulsos (nenhum aqui)
      const todas = u.searchParams.get("type") === "1" ? devolvidas.filter((d) => d.vistaMs >= de && d.vistaMs <= ate) : [];
      const inicio = Number(u.searchParams.get("token") || 0);
      const pagina = todas.slice(inicio, inicio + falhas.porPagina);
      const proxima = inicio + falhas.porPagina < todas.length ? String(inicio + falhas.porPagina) : null;
      return resposta(200, {
        ...(pagina.length ? {
          voidedPurchases: pagina.map((d) => ({ kind: "androidpublisher#voidedPurchase", purchaseToken: d.token, orderId: d.pedido,
            purchaseTimeMillis: String(d.vistaMs - DIA), voidedTimeMillis: String(d.vistaMs), voidedSource: 1, voidedReason: 1 })),
        } : {}),
        ...(proxima ? { tokenPagination: { nextPageToken: proxima } } : {}),
      });
    }
    const m = /\/purchases\/subscriptions(?:v2)?\/(?:[^/]+\/)?tokens\/([^/:]+)(?::(\w+))?$/.exec(u.pathname);
    const token = m ? decodeURIComponent(m[1]) : null;
    const acao = m?.[2] ?? "get";
    idas.push({ metodo, acao, token, query: u.searchParams, corpo });
    const c = token ? compras.get(token) : undefined;
    const st = token ? falhas.get?.get(token) : undefined;
    if (st) return resposta(st, { error: { code: st, status: "UNAVAILABLE", errors: [{ reason: "backendError" }] } });
    if (!c) return resposta(404, { error: { code: 404, status: "NOT_FOUND", errors: [{ reason: "purchaseTokenNotFound" }] } });
    if (acao === "acknowledge") {
      c.reconhecida = true;
      return resposta(204, null);
    }
    if (acao === "cancel") {
      c.estado = ESTADO_G.cancelada;
      c.renova = false;
      return resposta(200, {});
    }
    return resposta(200, v2(c));
  });

  return {
    buscar: buscar as unknown as typeof fetch,
    idas,
    falhas,
    compras,
    comprar(token: string, conta: string, estado = "ativa", diasAteVencer = 20) {
      compras.set(token, { estado: ESTADO_G[estado], produto: "app_treino", expira: agoraMs() + diasAteVencer * DIA, renova: estado !== "cancelada",
                           conta, pedidos: [`GPA.0000-${token}`], reconhecida: true });
    },
    renovar(token: string) {
      const c = compras.get(token)!;
      c.pedidos.push(`GPA.0000-${token}..${c.pedidos.length - 1}`);
      c.expira += 30 * DIA;
      c.estado = ESTADO_G.ativa;
      c.renova = true;
      return c.pedidos[c.pedidos.length - 1];
    },
    mudar(token: string, estado: string) {
      const c = compras.get(token)!;
      c.estado = ESTADO_G[estado];
      if (estado === "cancelada" || estado === "expirada") c.renova = false;
      if (estado === "expirada" || estado === "suspensa" || estado === "pausada") c.expira = agoraMs() - 60_000;
    },
    /** a devolução do pedido (o Console ou o próprio Google); `revogar` corta o acesso na hora (EXPIRED) */
    devolver(token: string, pedido: string, revogar: boolean, vistaMs = agoraMs()) {
      devolvidas.push({ token, pedido, vistaMs });
      if (revogar) {
        const c = compras.get(token);
        if (c) Object.assign(c, { estado: ESTADO_G.expirada, renova: false, expira: vistaMs });
      }
    },
    gets: () => idas.filter((i) => i.acao === "get").map((i) => i.token),
    voided: () => idas.filter((i) => i.acao === "voided"),
  };
}

// ───────────────────────── o contexto ─────────────────────────

let PEM = "";
beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString("base64")}\n-----END PRIVATE KEY-----\n`;
});
const contaFalsa = () => JSON.stringify({ project_id: "physiq-br", client_email: `conferir-${Math.random().toString(36).slice(2)}@physiq-br.iam.gserviceaccount.com`,
  private_key: PEM, token_uri: "https://oauth2.googleapis.com/token" });
const comCredencial = () => {
  const conta = contaFalsa();
  vi.stubGlobal("Deno", { env: { get: (n: string) => (n === "PLAY_SERVICE_ACCOUNT" ? conta : undefined) } });
};
const semCredencial = () => vi.stubGlobal("Deno", { env: { get: () => undefined } });
const logFalso = () => ({ info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() });
const codigos = (l: ReturnType<typeof logFalso>, nivel: "info" | "aviso" | "erro" | "excecao") =>
  l[nivel].mock.calls.map((c) => (nivel === "excecao" ? (c[1] as { codigo?: string } | undefined)?.codigo : (c[0] as { codigo: string }).codigo));
const prazoFolgado = () => ({ restante: () => 90_000, esgotado: () => false });

const AGORA = Date.parse("2026-10-22T20:00:00.000Z");
/** Um cenário: N matrículas do app ativas, cada uma com 1 linha na play_assinaturas (o estado do banco) e a compra no Google. */
function cenario(linhas: Array<{ n: number; estado: string; atualizadaMin?: number; ativo?: boolean; encerrada?: boolean }>, marca?: unknown) {
  const pacientes = linhas.map((l) => ({ id: mat(l.n), ativo: l.ativo !== false, deleted_at: null,
                                          app_encerrada_em: l.encerrada ? "2026-10-20T10:00:00.000Z" : null }));
  const play = linhas.map((l) => ({
    paciente_id: mat(l.n), token: `tok-${l.n}`, produto: "app_treino", estado: l.estado, expira_em: iso(AGORA + 20 * DIA),
    renova: !["cancelada", "expirada", "revogada", "substituida"].includes(l.estado), reconhecida_em: "2026-10-01T10:00:00.000Z", teste: false,
    ultimo_pedido: `GPA.0000-tok-${l.n}`, cancelada_por: null, atualizada_em: iso(AGORA - (l.atualizadaMin ?? 60 + l.n) * 60_000),
  }));
  const cobrancas = linhas.map((l) => ({ id: `cob-tok-${l.n}`, paciente_id: mat(l.n), forma: "google_play", status: "paga",
                                         play_pedido: `GPA.0000-tok-${l.n}`, valor: 29.9, reembolsado_em: null }));
  const app_config = marca === undefined ? [] : [{ chave: "play_conferir", valor: marca, publica: false }];
  const db = criarDb({ pacientes, play_assinaturas: play, cobrancas, app_config });
  const g = googleFalso(() => AGORA);
  for (const l of linhas) g.comprar(`tok-${l.n}`, mat(l.n), l.estado === "substituida" || l.estado === "revogada" ? "expirada" : l.estado);
  const log = logFalso();
  const ctx = { db: db.cliente as never, schema: "staging" as const, log: log as never, prazo: prazoFolgado(), buscar: g.buscar };
  return { db, g, log, ctx };
}
const rodar = (c: ReturnType<typeof cenario>, limite?: number) => conferir(c.ctx, { limite, agoraMs: AGORA }) as Promise<Contagem>;
const linhaDe = (c: ReturnType<typeof cenario>, n: number) => c.db.t.play_assinaturas.find((l) => l.token === `tok-${n}`)!;
/** As tabelas sem o atualizada_em (a sincronia grava a hora a cada rodada): o "mesmo resultado" da idempotência. */
const fotoDasTabelas = (c: ReturnType<typeof cenario>) => JSON.parse(JSON.stringify({
  play: c.db.t.play_assinaturas.map(({ atualizada_em: _a, ...resto }) => resto), cobrancas: c.db.t.cobrancas,
  pacientes: c.db.t.pacientes,
}));

afterEach(() => vi.unstubAllGlobals());

// ───────────────────────── as regras puras ─────────────────────────

describe("a Voided Purchases API: a leitura e a janela (startTime = a última rodada guardada − a folga; sem ela, 24 h)", () => {
  it("lê o token, o pedido e a próxima página; ignora o item sem token; o corpo vazio = nada", () => {
    expect(lerDevolvidas({
      voidedPurchases: [
        { purchaseToken: "tok-a", orderId: "GPA.1..0", voidedTimeMillis: "1761163200000", voidedSource: 1, voidedReason: 1 },
        { orderId: "GPA.sem-token" },
        { purchaseToken: "tok-b" },
      ],
      tokenPagination: { nextPageToken: "pag-2" },
    })).toEqual({
      itens: [
        { token: "tok-a", pedido: "GPA.1..0", quandoMs: 1761163200000, origem: 1, motivo: 1 },
        { token: "tok-b", pedido: null, quandoMs: null, origem: null, motivo: null },
      ],
      proxima: "pag-2",
    });
    expect(lerDevolvidas({})).toEqual({ itens: [], proxima: null });
    expect(lerDevolvidas(null)).toEqual({ itens: [], proxima: null });
  });

  it("sem marca (ou inválida, ou no futuro) = as últimas 24 h; com marca = desde ela − a folga; o teto é o da API (30 dias)", () => {
    expect(JANELA_PADRAO_DEVOLVIDAS_MS).toBe(DIA);
    expect(FOLGA_DEVOLVIDAS_MS).toBe(10 * 60_000);
    expect(MAX_JANELA_DEVOLVIDAS_MS).toBeLessThan(30 * DIA);
    expect(MAX_JANELA_DEVOLVIDAS_MS).toBeGreaterThan(29 * DIA);
    expect(janelaDasDevolvidas(null, AGORA)).toEqual({ inicioMs: AGORA - DIA, fimMs: AGORA });
    expect(janelaDasDevolvidas("lixo", AGORA)).toEqual({ inicioMs: AGORA - DIA, fimMs: AGORA });
    expect(janelaDasDevolvidas(iso(AGORA + HORA), AGORA)).toEqual({ inicioMs: AGORA - DIA, fimMs: AGORA });
    expect(janelaDasDevolvidas(iso(AGORA - HORA), AGORA)).toEqual({ inicioMs: AGORA - HORA - FOLGA_DEVOLVIDAS_MS, fimMs: AGORA });
    expect(janelaDasDevolvidas(iso(AGORA - 90 * DIA), AGORA)).toEqual({ inicioMs: AGORA - MAX_JANELA_DEVOLVIDAS_MS, fimMs: AGORA });
  });

  it("o pedido do pg_cron: o schema (só public/staging) e o limite opcional (1..POR_RODADA)", () => {
    expect(POR_RODADA).toBe(100);
    expect(lerPedido({ schema: "staging" })).toEqual({ ok: true, schema: "staging", limite: POR_RODADA });
    expect(lerPedido({ schema: "PUBLIC", limite: 5 })).toEqual({ ok: true, schema: "public", limite: 5 });
    expect(lerPedido({ schema: "outro" })).toEqual({ ok: false, erro: "schema_invalido" });
    expect(lerPedido(null)).toEqual({ ok: false, erro: "schema_invalido" });
    for (const limite of [0, -1, 1.5, "3", POR_RODADA + 1]) expect(lerPedido({ schema: "staging", limite })).toEqual({ ok: false, erro: "limite_invalido" });
  });
});

// ───────────────────────── a rodada ─────────────────────────

describe("sem a credencial (PLAY_SERVICE_ACCOUNT): pula com o log, nada quebra", () => {
  it("nenhuma ida ao banco nem ao Google; o log play_sem_credencial (aviso, sem o Telegram)", async () => {
    semCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }]);
    expect(await conferir(c.ctx, { agoraMs: AGORA })).toEqual({ pulou: "play_sem_credencial" });
    expect(c.db.pedidos).toHaveLength(0);
    expect(c.g.idas).toHaveLength(0);
    expect(codigos(c.log, "aviso")).toEqual(["play_sem_credencial"]);
    expect(c.log.erro).not.toHaveBeenCalled();
  });
});

describe("quais assinaturas entram na rodada: TODAS as vivas (não só as perto de vencer), as há mais tempo sem conferir primeiro", () => {
  it("as 6 vivas (pendente, ativa, cancelada, carência, suspensa, pausada) vão ao Google; expirada, revogada e substituída, não", async () => {
    comCredencial();
    const estados = ["pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada", "expirada", "revogada", "substituida"];
    const c = cenario(estados.map((estado, i) => ({ n: i + 1, estado })));
    const r = await rodar(c);
    expect(c.g.gets().sort()).toEqual(["tok-1", "tok-2", "tok-3", "tok-4", "tok-5", "tok-6"]);
    expect(r).toMatchObject({ conferidas: 6, recusadas: 0, falhas: 0, sobraram: 0 });
  });

  it("o limite por rodada: as mais antigas primeiro; o resto fica para a próxima hora (log play_conferir_sobrou) e vai na frente dela", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa", atualizadaMin: 30 }, { n: 2, estado: "ativa", atualizadaMin: 90 }, { n: 3, estado: "ativa", atualizadaMin: 60 }]);
    const r1 = await rodar(c, 2);
    expect(c.g.gets()).toEqual(["tok-2", "tok-3"]);
    expect(r1).toMatchObject({ conferidas: 2, sobraram: 1 });
    expect(codigos(c.log, "aviso")).toContain("play_conferir_sobrou");
    const sobrou = c.log.aviso.mock.calls.map((x) => x[0] as { codigo: string; n?: number }).find((x) => x.codigo === "play_conferir_sobrou");
    expect(sobrou).toMatchObject({ schema: "staging", n: 1 });
    c.g.idas.length = 0;
    const r2 = await rodar(c, 2);
    expect(c.g.gets()).toEqual(["tok-1", "tok-2"]);
    expect(r2).toMatchObject({ conferidas: 2, sobraram: 1 });
  });

  it("o orçamento acabando: não começa outra assinatura com menos de 10 s sobrando; o resto conta como sobra", async () => {
    comCredencial();
    const c = cenario([1, 2, 3].map((n) => ({ n, estado: "ativa" })));
    c.ctx.prazo = { restante: () => (c.g.gets().length >= 1 ? 5_000 : 90_000), esgotado: () => false };
    const r = await rodar(c);
    expect(r).toMatchObject({ conferidas: 1, sobraram: 2 });
    expect(codigos(c.log, "aviso")).toContain("play_conferir_sobrou");
  });
});

describe("o estado que o Google diz é aplicado pela MESMA sincronia do registrar (a play_aplicar)", () => {
  it("renovada: o fim anda e entra a cobrança do pedido novo (1 só); cancelada: vale até o fim (google); expirada, suspensa e pausada: travam", async () => {
    comCredencial();
    const c = cenario([1, 2, 3, 4, 5].map((n) => ({ n, estado: "ativa" })));
    const pedido = c.g.renovar("tok-1");
    c.g.mudar("tok-2", "cancelada");
    c.g.mudar("tok-3", "expirada");
    c.g.mudar("tok-4", "suspensa");
    c.g.mudar("tok-5", "pausada");
    const r = await rodar(c);
    expect(r).toMatchObject({ conferidas: 5, mudaram: 5, recusadas: 0 });
    expect(linhaDe(c, 1)).toMatchObject({ estado: "ativa", renova: true, expira_em: iso(AGORA + 50 * DIA) });
    expect(c.db.t.cobrancas.filter((x) => x.paciente_id === mat(1)).map((x) => [x.play_pedido, x.status])).toEqual([
      ["GPA.0000-tok-1", "paga"], [pedido, "paga"]]);
    expect(linhaDe(c, 2)).toMatchObject({ estado: "cancelada", renova: false, cancelada_por: "google", expira_em: iso(AGORA + 20 * DIA) });
    expect(linhaDe(c, 3)).toMatchObject({ estado: "expirada", renova: false });
    expect(linhaDe(c, 4)).toMatchObject({ estado: "suspensa" });
    expect(linhaDe(c, 5)).toMatchObject({ estado: "pausada" });
    expect(c.db.t.cobrancas).toHaveLength(6);
  });

  it("a compra ainda não reconhecida (a pendente que o Google aprovou) é reconhecida, como fazia o aviso do Google", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "pendente" }]);
    c.g.compras.get("tok-1")!.reconhecida = false;
    c.g.mudar("tok-1", "ativa");
    await rodar(c);
    expect(c.g.idas.filter((i) => i.acao === "acknowledge").map((i) => i.token)).toEqual(["tok-1"]);
    expect(linhaDe(c, 1)).toMatchObject({ estado: "ativa" });
  });

  it("a rede do vínculo: renovou numa matrícula encerrada → cancela (DEVELOPER_REQUESTED_STOP_PAYMENTS: vale até o fim, sem devolver)", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa", ativo: false, encerrada: true }]);
    c.g.renovar("tok-1");
    const r = await rodar(c);
    const cancel = c.g.idas.filter((i) => i.acao === "cancel");
    expect(cancel.map((i) => i.corpo)).toEqual([{ cancellationContext: { cancellationType: "DEVELOPER_REQUESTED_STOP_PAYMENTS" } }]);
    expect(r.canceladas_rede).toBe(1);
    expect(linhaDe(c, 1)).toMatchObject({ estado: "cancelada", renova: false, cancelada_por: "vinculo" });
  });

  it("idempotente: rodar 2 vezes = o mesmo resultado (nada de cobrança nem devolução a mais; a 2ª não muda nada)", async () => {
    comCredencial();
    const c = cenario([1, 2, 3].map((n) => ({ n, estado: "ativa" })));
    c.g.renovar("tok-1");
    c.g.mudar("tok-2", "cancelada");
    // a devolução DENTRO da folga da janela: a 2ª rodada lê a mesma devolução de novo (e não marca nada a mais)
    c.g.devolver("tok-3", "GPA.0000-tok-3", true, AGORA - 5 * 60_000);
    const r1 = await rodar(c);
    expect(r1).toMatchObject({ mudaram: 2, devolvidas_aplicadas: 1, devolvidas_marcadas: 1 });
    const depois1 = fotoDasTabelas(c);
    const r2 = await rodar(c);
    expect(fotoDasTabelas(c)).toEqual(depois1);
    expect(r2).toMatchObject({ mudaram: 0, devolvidas_aplicadas: 1, devolvidas_marcadas: 0 });
    expect(c.db.t.cobrancas.filter((x) => x.status === "cancelada")).toHaveLength(1);
  });

  it("o Google fora numa assinatura: conta a falha, segue com as outras e a que falhou volta na próxima hora", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa", atualizadaMin: 90 }, { n: 2, estado: "ativa", atualizadaMin: 60 }]);
    c.g.falhas.get = new Map([["tok-1", 503]]);
    c.g.renovar("tok-2");
    const r = await rodar(c);
    expect(r).toMatchObject({ conferidas: 1, falhas: 1, mudaram: 1 });
    expect(codigos(c.log, "aviso")).toContain("play_conferir_falhou");
    expect(c.log.erro).not.toHaveBeenCalled();
    c.g.falhas.get = undefined;
    c.g.idas.length = 0;
    await rodar(c, 1);
    expect(c.g.gets()).toEqual(["tok-1"]);
  });

  it("o GET que diz que a compra não existe (404) é recusa: nada muda e o log play_conferir_recusada", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }]);
    c.g.compras.delete("tok-1");
    const antes = fotoDasTabelas(c);
    const r = await rodar(c);
    expect(r).toMatchObject({ conferidas: 0, recusadas: 1 });
    expect(fotoDasTabelas(c)).toEqual(antes);
    expect(codigos(c.log, "aviso")).toContain("play_conferir_recusada");
  });

  it("a tabela que ainda não existe no schema (a função publicada antes da migration) = nada a conferir", async () => {
    comCredencial();
    const c = cenario([]);
    const original = c.db.cliente.from;
    c.db.cliente.from = (tabela: string) => (tabela === "play_assinaturas"
      ? { select: () => ({ in: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table 'staging.play_assinaturas'" }, count: null }) }) }) }) }) }
      : original(tabela)) as never;
    const r = await rodar(c);
    expect(r).toMatchObject({ conferidas: 0, sobraram: 0 });
  });
});

describe("as devolvidas pela Voided Purchases API (devolução e estorno em ≤ 1 h, sem o aviso do Google)", () => {
  it("a devolução com o acesso cortado: a cobrança do pedido devolvida (cancelada + reembolsado_em) e a assinatura revogada", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }, { n: 2, estado: "ativa" }]);
    c.g.devolver("tok-1", "GPA.0000-tok-1", true, AGORA - HORA);
    const r = await rodar(c);
    expect(r).toMatchObject({ devolvidas_lidas: 1, devolvidas_aplicadas: 1, devolvidas_marcadas: 1, devolvidas_completa: true });
    expect(c.db.t.cobrancas.find((x) => x.play_pedido === "GPA.0000-tok-1")).toMatchObject({ status: "cancelada" });
    expect(c.db.t.cobrancas.find((x) => x.play_pedido === "GPA.0000-tok-1")!.reembolsado_em).toBeTruthy();
    expect(linhaDe(c, 1)).toMatchObject({ estado: "revogada", renova: false });
    expect(linhaDe(c, 2)).toMatchObject({ estado: "ativa" });
    expect(c.db.t.cobrancas.find((x) => x.play_pedido === "GPA.0000-tok-2")).toMatchObject({ status: "paga" });
  });

  it("a devolução de um pedido de renovação SEM cortar o acesso: só a cobrança daquele pedido; a assinatura segue ativa", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }]);
    const renovado = c.g.renovar("tok-1");
    await rodar(c);
    c.g.devolver("tok-1", renovado, false, AGORA - 5 * 60_000);
    const r = await rodar(c);
    expect(r).toMatchObject({ devolvidas_marcadas: 1 });
    expect(c.db.t.cobrancas.find((x) => x.play_pedido === renovado)).toMatchObject({ status: "cancelada" });
    expect(c.db.t.cobrancas.find((x) => x.play_pedido === "GPA.0000-tok-1")).toMatchObject({ status: "paga" });
    expect(linhaDe(c, 1)).toMatchObject({ estado: "ativa" });
  });

  it("o token que o Google já esqueceu (GET 404/410, mais de 60 dias): a cobrança devolvida pelo pedido, sem o GET", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "expirada" }]);
    c.g.devolver("tok-1", "GPA.0000-tok-1", false, AGORA - HORA);
    c.g.compras.delete("tok-1");
    const r = await rodar(c);
    expect(r).toMatchObject({ devolvidas_aplicadas: 1, devolvidas_marcadas: 1 });
    expect(c.db.t.cobrancas.find((x) => x.play_pedido === "GPA.0000-tok-1")).toMatchObject({ status: "cancelada" });
  });

  it("a devolvida que não é deste schema (o outro schema ou compra de fora) só conta — nada gravado", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }]);
    c.g.comprar("tok-de-outro-schema", mat(99));
    c.g.devolver("tok-de-outro-schema", "GPA.0000-tok-de-outro-schema", true, AGORA - HORA);
    const antes = fotoDasTabelas(c);
    const r = await rodar(c);
    expect(r).toMatchObject({ devolvidas_lidas: 1, devolvidas_aplicadas: 0, devolvidas_outras: 1, devolvidas_completa: true });
    expect(fotoDasTabelas(c)).toEqual(antes);
  });

  it("a janela: type=1 (as assinaturas), sem marca = 24 h; a lista inteira lida → a marca anda até o fim da janela (app_config play_conferir)", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }]);
    await rodar(c);
    const q1 = c.g.voided()[0].query;
    expect(q1.get("type")).toBe("1");
    expect(Number(q1.get("startTime"))).toBe(AGORA - DIA);
    expect(Number(q1.get("endTime"))).toBe(AGORA);
    expect(c.db.t.app_config).toEqual([{ chave: "play_conferir", valor: { voided_ate: iso(AGORA) }, publica: false }]);
    // a próxima hora começa na marca, com a folga
    c.g.idas.length = 0;
    await conferir(c.ctx, { agoraMs: AGORA + HORA });
    expect(Number(c.g.voided()[0].query.get("startTime"))).toBe(AGORA - FOLGA_DEVOLVIDAS_MS);
    expect(c.db.t.app_config[0].valor).toEqual({ voided_ate: iso(AGORA + HORA) });
  });

  it("as páginas (nextPageToken): todas lidas; o Google fora no meio = a marca NÃO anda (a próxima hora lê a mesma janela)", async () => {
    comCredencial();
    const c = cenario([1, 2, 3].map((n) => ({ n, estado: "ativa" })), { voided_ate: iso(AGORA - 2 * HORA) });
    for (const n of [1, 2, 3]) c.g.devolver(`tok-${n}`, `GPA.0000-tok-${n}`, true, AGORA - HORA);
    c.g.falhas.porPagina = 2;
    const r = await rodar(c);
    expect(c.g.voided().map((v) => v.query.get("token"))).toEqual([null, "2"]);
    expect(r).toMatchObject({ devolvidas_lidas: 3, devolvidas_marcadas: 3, devolvidas_completa: true });
    // a 2ª: o Google fora na lista → nada marcado e a marca fica
    const c2 = cenario([{ n: 1, estado: "ativa" }], { voided_ate: iso(AGORA - 2 * HORA) });
    c2.g.falhas.voided = 503;
    const r2 = await rodar(c2);
    expect(r2).toMatchObject({ devolvidas_completa: false, conferidas: 1 });
    expect(c2.db.t.app_config[0].valor).toEqual({ voided_ate: iso(AGORA - 2 * HORA) });
    expect(codigos(c2.log, "aviso")).toContain("play_devolvidas_falhou");
  });

  it("o log da rodada não leva token, pedido nem e-mail — só códigos, o schema, a matrícula (ref) e contagens", async () => {
    comCredencial();
    const c = cenario([{ n: 1, estado: "ativa" }, { n: 2, estado: "ativa", ativo: false, encerrada: true }]);
    c.g.renovar("tok-2");
    c.g.devolver("tok-1", "GPA.0000-tok-1", true, AGORA - HORA);
    await rodar(c);
    const tudo = JSON.stringify([c.log.info.mock.calls, c.log.aviso.mock.calls, c.log.erro.mock.calls, c.log.excecao.mock.calls]);
    expect(tudo).not.toMatch(/tok-|GPA\.|@/);
    expect(codigos(c.log, "info")).toContain("play_conferir");
  });
});

// ───────────────────────── a index.ts (o Vitest não importa: Deno.serve, esm.sh, Deno.env no topo) ─────────────────────────

describe("o contrato da index.ts", () => {
  const index = fonte("play-conferir/index.ts");
  const posicao = (trecho: string) => {
    const i = index.indexOf(trecho);
    expect(i, trecho).toBeGreaterThan(-1);
    return i;
  };
  it("POST só; o segredo S11 (só a lista de hashes) ANTES de ler o corpo; o banco depois; a rodada por último", () => {
    const metodo = posicao('if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);');
    const segredo = posicao('await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_PLAY_CONFERIR")');
    const corpo = posicao("await req.json()");
    const banco = posicao("createClient(SUPABASE_URL, SERVICE_ROLE");
    const rodada = posicao("await conferir(");
    expect(metodo).toBeLessThan(segredo);
    expect(segredo).toBeLessThan(corpo);
    expect(corpo).toBeLessThan(banco);
    expect(banco).toBeLessThan(rodada);
  });
  it("sem o segredo ou com o errado: o MESMO 401, sem detalhe (o log não leva o recebido)", () => {
    expect(index.match(/, 401\)/g)).toHaveLength(1);
    expect(index).toContain('return json({ ok: false, erro: "segredo_invalido" }, 401);');
    expect(index).toContain('log.aviso({ codigo: "segredo_recusado", acao: "play_conferir" });');
  });
  it("verify_jwt false, o S11 no comentário, o log com o nome da função; nenhum segredo lido direto", () => {
    expect(index).toContain("scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions play-conferir false");
    expect(index).toContain("physiq_play_conferir_segredo");
    expect(index).toContain("scripts/segredos/servidor.py play_conferir");
    expect(index).toContain('criarLog("play-conferir", { avisar: avisarErro })');
    expect(index).not.toMatch(/Deno\.env\.get\("(SEGREDO_PLAY_CONFERIR|PLAY_SERVICE_ACCOUNT)/);
  });
  it("a rodada.ts: só import de tipo por URL e sem o global Deno (o Vitest importa)", () => {
    const rodadaTs = fonte("play-conferir/rodada.ts");
    expect(rodadaTs).not.toMatch(/^import (?!type )[^;]*from "https?:/m);
    expect(rodadaTs).not.toMatch(/\bDeno\./);
  });
});
