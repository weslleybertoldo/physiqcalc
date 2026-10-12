// @vitest-environment node
// src/financeiro/mpContasRenovar.test.ts
// Physiq W2 (Task 11) — a rodada do mp-contas-renovar (supabase-principal/functions/mp-contas-renovar/rodada.ts): de hora em hora renova o
// acesso do Mercado Pago das contas que vencem em < 30 dias (até 50, 5 por vez, pela renovarConta do _shared/mp-conta.ts), marca as que
// venceram ("vencido" + aviso) e, 1×/dia por integração ativa, CONFERE a conta (conferirConta: /users/me e as cobranças das automáticas —
// MENOR 27 e I1). E o contrato da index.ts, que o Vitest não importa (Deno.serve, esm.sh e o Deno.env no topo): o segredo S10, a ordem das
// conferências e a resposta só com contagens.
// Um banco FALSO em memória (o molde do mpContaAviso.test.ts, com o order do PostgREST — nulos por último no asc, primeiro no desc, ou o
// nullsFirst) e um MP FALSO pelo fetch global (vi.stubGlobal) que sabe de quem é cada token e GIRA o refresh a cada renovação. Tokens,
// chave e client são de teste, feitos aqui; nada vai à rede. Cada teste importa os módulos de novo (vi.resetModules): a memória de 60 s
// do schemaTemW2 não vaza de um teste para o outro.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrar, dadoAssociado, decifrar, importarChave } from "../../supabase-principal/functions/_shared/cifra-mp";
import type { Log } from "../../supabase-principal/functions/_shared/log";
import type { Prazo } from "../../supabase-principal/functions/_shared/tempo";

type ModRodada = typeof import("../../supabase-principal/functions/mp-contas-renovar/rodada");

const HORA = 3_600_000;
const DIA = 24 * HORA;
const DONO = "d0d0d0d0-1111-4222-8333-444455556666";
const P1 = "a1111111-1111-4111-8111-111111111111";
const CLIENT = { clientId: "1234567890123456", clientSecret: "client-secret-de-teste-000000000" };
const FUNCOES = resolve(__dirname, "../../supabase-principal/functions");
const fonte = (rel: string) => readFileSync(resolve(FUNCOES, rel), "utf-8");
/** O uuid da conta n (as contas do teste: c0000000-…-00000000000n). */
const conta = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const vendedor = (n: number) => 7000 + n;

// ───────────────────────── o banco falso ─────────────────────────

type Linha = Record<string, unknown>;
type OpSimples = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
type Filtro =
  | { col: string; op: OpSimples; v: unknown }
  | { col: string; op: "is" | "nao_nulo"; v: null }
  | { col: string; op: "in"; v: unknown[] }
  | { op: "or"; texto: string };
interface Ordem { col: string; asc: boolean; nullsFirst: boolean | undefined }
interface Pedido {
  tabela: string;
  op: "select" | "update" | "insert" | "rpc";
  colunas: string | null;
  volta: string | null;
  valores: Linha | null;
  filtros: Filtro[];
  ordens: Ordem[];
  unico: boolean;
  limite: number | null;
  args: Record<string, unknown> | null;
}
interface ErroDb { code: string; message: string }
interface RespostaDb { data: unknown; error: ErroDb | null }
interface Consulta extends PromiseLike<RespostaDb> {
  select(colunas?: string): Consulta;
  update(valores: Linha): Consulta;
  insert(valores: Linha): Consulta;
  eq(col: string, v: unknown): Consulta;
  neq(col: string, v: unknown): Consulta;
  gt(col: string, v: unknown): Consulta;
  lt(col: string, v: unknown): Consulta;
  gte(col: string, v: unknown): Consulta;
  lte(col: string, v: unknown): Consulta;
  is(col: string, v: null): Consulta;
  not(col: string, op: string, v: unknown): Consulta;
  in(col: string, v: unknown[]): Consulta;
  or(texto: string): Consulta;
  order(col: string, opcoes?: { ascending?: boolean; nullsFirst?: boolean }): Consulta;
  limit(n: number): Consulta;
  range(de: number, ate: number): Consulta;
  maybeSingle(): Consulta;
}

const valorDe = (l: Linha, col: string): unknown =>
  col.split(".").reduce<unknown>((o, k) => (o !== null && typeof o === "object" ? (o as Linha)[k] : undefined), l);
const vazio = (x: unknown) => x === null || x === undefined;
const comparavel = (x: unknown) => (typeof x === "string" && /^\d{4}-\d\d-\d\dT/.test(x) ? Date.parse(x) : Number(x));
function passa(l: Linha, f: Filtro): boolean {
  if (f.op === "or") {
    return f.texto.split(",").some((parte) => {
      const [col, op, ...resto] = parte.split(".");
      return op === "is" ? passa(l, { col, op: "is", v: null }) : passa(l, { col, op: op as OpSimples, v: resto.join(".") });
    });
  }
  const x = valorDe(l, f.col);
  switch (f.op) {
    case "eq": return !vazio(x) && String(x) === String(f.v);
    case "neq": return !vazio(x) && String(x) !== String(f.v);
    case "is": return vazio(x);
    case "nao_nulo": return !vazio(x);
    case "in": return f.v.map(String).includes(String(x));
    case "gt": return !vazio(x) && comparavel(x) > comparavel(f.v);
    case "lt": return !vazio(x) && comparavel(x) < comparavel(f.v);
    case "gte": return !vazio(x) && comparavel(x) >= comparavel(f.v);
    case "lte": return !vazio(x) && comparavel(x) <= comparavel(f.v);
    default: return false;
  }
}
/** O ORDER BY do Postgres: no asc os nulos vão por último, no desc primeiro — a não ser que o pedido diga (nullsFirst). */
function ordenar(lista: Linha[], ordens: Ordem[]): Linha[] {
  return [...lista].sort((a, b) => {
    for (const o of ordens) {
      const x = valorDe(a, o.col);
      const y = valorDe(b, o.col);
      const nulosPrimeiro = o.nullsFirst ?? !o.asc;
      if (vazio(x) || vazio(y)) {
        if (vazio(x) && vazio(y)) continue;
        return (vazio(x) ? -1 : 1) * (nulosPrimeiro ? 1 : -1);
      }
      const d = comparavel(x) - comparavel(y);
      if (d) return o.asc ? d : -d;
    }
    return 0;
  });
}
function partesDoSelect(s: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of s) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}
function projetar(l: Linha, colunas: string): Linha {
  if (colunas.trim() === "*") return { ...l };
  const saida: Linha = {};
  for (const parte of partesDoSelect(colunas)) {
    const embutida = /^(?:(\w+):)?(\w+)(?:!\w+)?\(/.exec(parte);
    const chave = embutida ? (embutida[1] ?? embutida[2]) : parte;
    saida[chave] = l[chave] ?? null;
  }
  return saida;
}

function criarDb(inicio: Record<string, Linha[]>) {
  const tabelas: Record<string, Linha[]> = { mp_conexoes: [], avisos: [], cobrancas: [], ...inicio };
  const pedidos: Pedido[] = [];
  /** a próxima ida que casar devolve este erro (uma vez) — o "banco caiu" de um caso */
  const falhas: Array<{ casa: (p: Pedido) => boolean; erro: ErroDb }> = [];
  let seq = 0;
  const linhasDe = (t: string) => (tabelas[t] ??= []);
  const semUndefined = (v: Linha | null): Linha => Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x !== undefined));

  function rpc(p: Pedido): RespostaDb {
    // o {schema}.mp_integracao_reservar da migration (Task 6): reserva p_segundos se a trava está livre (ou vencida) — ativa ou erro
    if (p.tabela !== "mp_integracao_reservar") return { data: null, error: { code: "42883", message: `function ${p.tabela} does not exist` } };
    const agora = Date.now();
    const l = linhasDe("recebimento_integracoes").find((x) => x.conta_id === p.args?.p_conta && x.provedor === "mercadopago"
      && (x.status === "ativa" || x.status === "erro"));
    if (!l || (l.mp_renovando_ate && Date.parse(String(l.mp_renovando_ate)) >= agora)) return { data: false, error: null };
    l.mp_renovando_ate = new Date(agora + Number(p.args?.p_segundos ?? 120) * 1000).toISOString();
    return { data: true, error: null };
  }

  function executar(p: Pedido): RespostaDb {
    const i = falhas.findIndex((f) => f.casa(p));
    if (i >= 0) return { data: null, error: falhas.splice(i, 1)[0].erro };
    if (p.op === "rpc") return rpc(p);
    const unica = (lista: Linha[]) => (p.unico ? (lista[0] ?? null) : lista);
    if (p.op === "insert") {
      const nova: Linha = { id: `id-${++seq}`, ...semUndefined(p.valores) };
      linhasDe(p.tabela).push(nova);
      return { data: p.volta === null ? null : unica([projetar(nova, p.volta)]), error: null };
    }
    const achadas = linhasDe(p.tabela).filter((l) => p.filtros.every((f) => passa(l, f)));
    if (p.op === "update") {
      for (const l of achadas) Object.assign(l, semUndefined(p.valores));
      const volta = p.volta;
      return { data: volta === null ? null : unica(achadas.map((l) => projetar(l, volta))), error: null };
    }
    let lista = ordenar(achadas, p.ordens);
    if (p.limite !== null) lista = lista.slice(0, p.limite);
    return { data: unica(lista.map((l) => projetar(l, p.colunas ?? "*"))), error: null };
  }

  function consulta(p: Pedido): Consulta {
    const filtro = (f: Filtro) => {
      p.filtros.push(f);
      return q;
    };
    const muda = (mudar: () => void) => {
      mudar();
      return q;
    };
    const q: Consulta = {
      select: (colunas = "*") => muda(() => {
        if (p.op === "select") p.colunas = colunas;
        else p.volta = colunas;
      }),
      update: (valores) => muda(() => Object.assign(p, { op: "update", valores })),
      insert: (valores) => muda(() => Object.assign(p, { op: "insert", valores })),
      eq: (col, v) => filtro({ col, op: "eq", v }),
      neq: (col, v) => filtro({ col, op: "neq", v }),
      gt: (col, v) => filtro({ col, op: "gt", v }),
      lt: (col, v) => filtro({ col, op: "lt", v }),
      gte: (col, v) => filtro({ col, op: "gte", v }),
      lte: (col, v) => filtro({ col, op: "lte", v }),
      is: (col) => filtro({ col, op: "is", v: null }),
      not: (col, op, v) => filtro(op === "is" && v === null ? { col, op: "nao_nulo", v: null } : { col, op: "neq", v }),
      in: (col, v) => filtro({ col, op: "in", v }),
      or: (texto) => filtro({ op: "or", texto }),
      order: (col, opcoes = {}) => muda(() => p.ordens.push({ col, asc: opcoes.ascending !== false, nullsFirst: opcoes.nullsFirst })),
      limit: (n) => muda(() => Object.assign(p, { limite: n })),
      range: (de, ate) => muda(() => Object.assign(p, { limite: ate - de + 1 })),
      maybeSingle: () => muda(() => Object.assign(p, { unico: true })),
      then<A = RespostaDb, B = never>(ok?: ((v: RespostaDb) => A | PromiseLike<A>) | null,
        ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
        return Promise.resolve().then(() => executar(p)).then(ok, ko);
      },
    };
    return q;
  }

  const novo = (tabela: string, op: Pedido["op"], args: Record<string, unknown> | null = null): Pedido => {
    const p: Pedido = { tabela, op, colunas: null, volta: null, valores: null, filtros: [], ordens: [], unico: false, limite: null, args };
    pedidos.push(p);
    return p;
  };
  const cliente = {
    from: (tabela: string) => consulta(novo(tabela, "select")),
    rpc: (nome: string, args: Record<string, unknown> = {}) => consulta(novo(nome, "rpc", args)),
  } as unknown as SupabaseClient;
  return { cliente, pedidos, tabelas, falhas };
}
type DbFalso = ReturnType<typeof criarDb>;
const integDe = (db: DbFalso, n: number) => db.tabelas.recebimento_integracoes.find((l) => l.conta_id === conta(n))!;

// ───────────────────────── o MP falso (o fetch global): quem é cada token; o refresh GIRA ─────────────────────────

interface Ida { caminho: string; metodo: string; token: string | null; corpo: Record<string, unknown> | null }
type Comportamento = "ok" | "recusar" | "fora";
interface MpFalso {
  idas: Ida[];
  /** token de acesso vivo → o user_id do MP dele */
  vivos: Map<string, number>;
  /** refresh vivo → de quem é e o que o MP faz com ele */
  refreshes: Map<string, { userId: number; faz: Comportamento }>;
  /** respostas prontas por caminho (a busca das automáticas, os pagamentos) */
  rotas: Record<string, { status: number; body?: unknown }>;
  /** força o status do /users/me (o MP fora no diário) */
  usersMe?: number;
  emitidos: string[];
  maxEmVoo: number;
}
function mpFalso(): MpFalso {
  const mp: MpFalso = { idas: [], vivos: new Map(), refreshes: new Map(), rotas: {}, emitidos: [], maxEmVoo: 0 };
  let emVoo = 0;
  let n = 0;
  const responder = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal("fetch", async (entrada: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const caminho = u.pathname + u.search;
    const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "") ?? null;
    const corpo = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    mp.idas.push({ caminho, metodo: (init.method ?? "GET").toUpperCase(), token, corpo });
    if (caminho === "/oauth/token") {
      emVoo++;
      mp.maxEmVoo = Math.max(mp.maxEmVoo, emVoo);
      await new Promise((ok) => setTimeout(ok, 15));
      emVoo--;
      const r = mp.refreshes.get(String(corpo?.refresh_token));
      if (corpo?.client_id !== CLIENT.clientId || corpo?.client_secret !== CLIENT.clientSecret) return responder(400, { error: "invalid_client" });
      if (corpo?.grant_type !== "refresh_token") return responder(400, { error: "unsupported_grant_type" });
      if (r?.faz === "fora") return responder(500, { message: "internal_error" });
      if (!r || r.faz === "recusar") return responder(400, { error: "invalid_grant" });
      mp.refreshes.delete(String(corpo.refresh_token));                    // o refresh "can only be used once": GIRA
      n++;
      const access = `APP_USR-novo-${n}-${r.userId}-renovado`;
      const refresh = `TG-novo-${n}-${r.userId}-girado`;
      mp.vivos.set(access, r.userId);
      mp.refreshes.set(refresh, { userId: r.userId, faz: "ok" });
      mp.emitidos.push(access, refresh);
      return responder(200, { access_token: access, token_type: "bearer", expires_in: 15_552_000, scope: "offline_access read write",
        user_id: r.userId, refresh_token: refresh, public_key: `TEST-chave-${n}-0000`, live_mode: false });
    }
    if (caminho === "/users/me") {
      if (mp.usersMe) return responder(mp.usersMe, { message: "x" });
      const id = token ? mp.vivos.get(token) : undefined;
      return id === undefined ? responder(401, { message: "invalid_token" }) : responder(200, { id, nickname: `VENDEDOR_${id}` });
    }
    const pronta = mp.rotas[caminho];
    return pronta ? responder(pronta.status, pronta.body ?? null) : responder(404, { message: "not_found" });
  });
  return mp;
}

// ───────────────────────── o log falso, o prazo, as linhas ─────────────────────────

interface LinhaLog { nivel: "info" | "aviso" | "erro" | "excecao"; campos: Record<string, unknown> }
function logFalso(): { log: Log; linhas: LinhaLog[] } {
  const linhas: LinhaLog[] = [];
  const anotar = (nivel: LinhaLog["nivel"], campos: object) => void linhas.push({ nivel, campos: { ...campos } });
  const log: Log = {
    info: (c) => anotar("info", c),
    aviso: (c) => anotar("aviso", c),
    erro: (c) => anotar("erro", c),
    excecao: (_e, c) => anotar("excecao", c ?? {}),
  };
  return { log, linhas };
}
const prazoDe = (ms: number): Prazo => ({ restante: () => ms, esgotado: () => ms <= 0 });
const perto = (iso: unknown, daquiMs: number, folga = 120_000) =>
  expect(Math.abs(Date.parse(String(iso)) - (Date.now() + daquiMs))).toBeLessThan(folga);
const iso = (daquiMs: number) => new Date(Date.now() + daquiMs).toISOString();

let CHAVE: CryptoKey;
let OUTRA_CHAVE: CryptoKey;
const accessDe = (n: number) => `APP_USR-acesso-da-conta-${n}-0001`;
const refreshDe = (n: number) => `TG-refresh-da-conta-${n}-0001`;
/** A integração OAuth da conta n (staging), cifrada com a chave do teste; o MP falso conhece o par (a não ser que `mp` não seja dado). */
async function integracao(n: number, o: Linha = {}, mp?: MpFalso, faz: Comportamento = "ok", chave: CryptoKey = CHAVE): Promise<Linha> {
  const ad = (campo: "access" | "refresh") => dadoAssociado("staging", conta(n), campo);
  if (mp) {
    mp.vivos.set(accessDe(n), vendedor(n));
    mp.refreshes.set(refreshDe(n), { userId: vendedor(n), faz });
  }
  return {
    conta_id: conta(n), provedor: "mercadopago", status: "ativa", mp_user_id: vendedor(n), mp_apelido: `VENDEDOR_${n}`, mp_public_key: null,
    mp_access_token: await cifrar(accessDe(n), ad("access"), chave), mp_refresh_token: await cifrar(refreshDe(n), ad("refresh"), chave),
    mp_expira_em: iso(90 * DIA), mp_teste: true, mp_origem: "oauth", mp_renovado_em: null, mp_renovando_ate: null, mp_renovar_tentativas: 0,
    mp_renovar_proxima_em: null, mp_erro: null, mp_avisado_em: null, mp_conferido_em: iso(-HORA), conectado_em: iso(-10 * DIA),
    desconectada_em: null, ...o,
  };
}
const donoDe = (n: number) => `d${String(n).padStart(7, "0")}-1111-4222-8333-444455556666`;
const contas = (...ns: number[]) => ns.map((n) => ({ id: conta(n), dono_id: donoDe(n) }));
const tokenOauth = (mp: MpFalso) => mp.idas.filter((i) => i.caminho === "/oauth/token").map((i) => i.corpo?.refresh_token);

let R: ModRodada;
beforeAll(async () => {
  CHAVE = await importarChave(Buffer.alloc(32, 7).toString("base64url"));
  OUTRA_CHAVE = await importarChave(Buffer.alloc(32, 9).toString("base64url"));
});
beforeEach(async () => {
  vi.resetModules();
  R = await import("../../supabase-principal/functions/mp-contas-renovar/rodada");
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function rodada(db: DbFalso, o: { prazo?: Prazo } = {}) {
  const { log, linhas } = logFalso();
  return { r: { db: db.cliente, schema: "staging" as const, log, prazo: o.prazo ?? prazoDe(100_000), chave: CHAVE, oauth: CLIENT }, linhas };
}

// ───────────────────────── o pedido ─────────────────────────

describe("lerPedido — o corpo { schema, forcar_conta? }", () => {
  it("schema só como texto (public | staging, sem caixa); o resto → schema_invalido", () => {
    expect(R.lerPedido({ schema: "staging" })).toEqual({ ok: true, schema: "staging", forcarConta: null });
    expect(R.lerPedido({ schema: "PUBLIC" })).toEqual({ ok: true, schema: "public", forcarConta: null });
    for (const ruim of [null, "staging", [], {}, { schema: ["staging"] }, { schema: "producao" }, { schema: 1 }]) {
      expect(R.lerPedido(ruim)).toEqual({ ok: false, erro: "schema_invalido" });
    }
  });
  it("forcar_conta: SÓ no staging (o E2E da renovação de verdade) e só um uuid; nulo/ausente = a rodada de sempre", () => {
    expect(R.lerPedido({ schema: "staging", forcar_conta: conta(1) })).toEqual({ ok: true, schema: "staging", forcarConta: conta(1) });
    expect(R.lerPedido({ schema: "staging", forcar_conta: null })).toEqual({ ok: true, schema: "staging", forcarConta: null });
    expect(R.lerPedido({ schema: "public", forcar_conta: conta(1) })).toEqual({ ok: false, erro: "forcar_so_no_staging" });
    for (const ruim of ["x", 1, conta(1).toUpperCase(), `${conta(1)} `, [conta(1)]]) {
      expect(R.lerPedido({ schema: "staging", forcar_conta: ruim })).toEqual({ ok: false, erro: "conta_invalida" });
    }
  });
});

// ───────────────────────── a renovação ─────────────────────────

describe("rodada — a renovação (até 50, 5 por vez, as que vencem em < 30 dias)", () => {
  it("renova só as OAuth ativas que vencem em < 30 dias e estão na hora da tentativa; o refresh gira e a linha guarda o par novo cifrado", async () => {
    const mp = mpFalso();
    const db = criarDb({
      contas: contas(1, 2, 3, 4, 5, 6, 7, 8),
      recebimento_integracoes: [
        await integracao(1, { mp_expira_em: iso(10 * DIA) }, mp),                                  // renova
        await integracao(2, { mp_expira_em: iso(29 * DIA) }, mp),                                  // renova
        await integracao(3, { mp_expira_em: iso(31 * DIA) }, mp),                                  // longe: não
        await integracao(4, { mp_expira_em: iso(5 * DIA), mp_origem: "teste_local" }, mp),         // E2E local (MENOR 12): não
        await integracao(5, { mp_expira_em: iso(5 * DIA), mp_origem: "teste_sem_oauth" }, mp),     // a simulada: não
        await integracao(6, { mp_expira_em: iso(5 * DIA), status: "erro", mp_erro: "acesso_recusado" }, mp),   // em erro: não
        await integracao(7, { mp_expira_em: iso(5 * DIA), mp_renovar_proxima_em: iso(HORA) }, mp), // esperando a nova tentativa: não
        await integracao(8, { mp_expira_em: iso(5 * DIA), mp_renovar_proxima_em: iso(-HORA) }, mp), // a tentativa venceu: renova
        { conta_id: conta(9), provedor: "infinitepay", status: "ativa", infinitepay_handle: "loja" },  // outro provedor
      ],
    });
    const { r, linhas } = rodada(db);
    const c = await R.rodada(r);
    expect(c).toMatchObject({ renovadas: 3, outras: 0, recusadas: 0, fora: 0, ocupadas: 0, sem_renovacao: 0, vencidas: 0, erros: 0 });
    expect(tokenOauth(mp).sort()).toEqual([refreshDe(1), refreshDe(2), refreshDe(8)].sort());
    for (const n of [1, 2, 8]) {
      const l = integDe(db, n);
      perto(l.mp_expira_em, 180 * DIA);
      expect(l).toMatchObject({ status: "ativa", mp_erro: null, mp_renovar_tentativas: 0, mp_renovar_proxima_em: null, mp_renovando_ate: null });
      const access = await decifrar(String(l.mp_access_token), dadoAssociado("staging", conta(n), "access"), CHAVE);
      expect(access).toMatch(new RegExp(`^APP_USR-novo-\\d+-${vendedor(n)}-renovado$`));
      expect(mp.refreshes.has(refreshDe(n))).toBe(false);                  // o refresh velho morreu no MP
    }
    for (const n of [3, 4, 5, 6, 7]) expect(integDe(db, n).mp_access_token).not.toBe(undefined);
    expect(await decifrar(String(integDe(db, 3).mp_access_token), dadoAssociado("staging", conta(3), "access"), CHAVE)).toBe(accessDe(3));
    // o log: só ids de conta e resultados (nada de token)
    expect(linhas.filter((l) => l.campos.codigo === "mp_renovar_conta").map((l) => [l.campos.ref, l.campos.resultado]).sort())
      .toEqual([[conta(1), "renovada"], [conta(2), "renovada"], [conta(8), "renovada"]]);
    const texto = JSON.stringify(linhas);
    for (const t of [...mp.emitidos, accessDe(1), refreshDe(1), CLIENT.clientSecret]) expect(texto).not.toContain(t);
  });

  it("5 por vez e até 50 por rodada, as que vencem antes primeiro", async () => {
    const mp = mpFalso();
    const integs: Linha[] = [];
    for (let n = 1; n <= 53; n++) integs.push(await integracao(n, { mp_expira_em: iso((60 - n) * HORA * 10) }, mp));  // a 53 vence antes
    const db = criarDb({ contas: contas(...integs.map((_, i) => i + 1)), recebimento_integracoes: integs });
    const { r } = rodada(db);
    const c = await R.rodada(r);
    expect(c.renovadas).toBe(50);
    expect(tokenOauth(mp)).toHaveLength(50);
    expect(tokenOauth(mp)).not.toContain(refreshDe(1));                    // as 3 que vencem por último ficam para a próxima hora
    expect(tokenOauth(mp)).not.toContain(refreshDe(2));
    expect(tokenOauth(mp)).not.toContain(refreshDe(3));
    expect(mp.maxEmVoo).toBeLessThanOrEqual(5);
    expect(mp.maxEmVoo).toBeGreaterThan(1);
  });

  it("sem tempo (< 30 s no orçamento): só o 1º grupo de 5 renova, o diário fica para a próxima hora — e as vencidas ainda saem", async () => {
    const mp = mpFalso();
    const integs: Linha[] = [];
    for (let n = 1; n <= 7; n++) integs.push(await integracao(n, { mp_expira_em: iso((10 + n) * DIA), mp_conferido_em: null }, mp));
    integs.push(await integracao(8, { mp_expira_em: iso(-2 * DIA), mp_refresh_token: null, mp_erro: "sem_renovacao" }));
    const db = criarDb({ contas: contas(1, 2, 3, 4, 5, 6, 7, 8), recebimento_integracoes: integs });
    const { r, linhas } = rodada(db, { prazo: prazoDe(20_000) });
    const c = await R.rodada(r);
    // o 1º grupo = as 5 que vencem antes: a 8 (vencida, sem refresh — nem vai ao MP) e as 1–4
    expect(c).toMatchObject({ renovadas: 4, sem_renovacao: 1, vencidas: 1, conferidas: 0 });
    expect(tokenOauth(mp).sort()).toEqual([refreshDe(1), refreshDe(2), refreshDe(3), refreshDe(4)].sort());
    expect(db.tabelas.avisos.map((a) => a.destino_user_id)).toEqual([donoDe(8)]);   // a vencida: "desconectou", não "conecte até"
    expect(String(db.tabelas.avisos[0].titulo)).toContain("desconectou");
    expect(mp.idas.filter((i) => i.caminho === "/users/me")).toEqual([]);
    expect(linhas.some((l) => l.nivel === "aviso" && l.campos.codigo === "rodada_no_limite")).toBe(true);
    expect(integDe(db, 8)).toMatchObject({ status: "erro", mp_erro: "vencido" });
  });

  it("os resultados viram contagens: recusada (o acesso ainda vale → ativa + renovacao_recusada + 1 aviso), MP fora (espera crescente), ocupada", async () => {
    const mp = mpFalso();
    const db = criarDb({
      contas: contas(1, 2, 3),
      recebimento_integracoes: [
        await integracao(1, { mp_expira_em: iso(10 * DIA) }, mp, "recusar"),
        await integracao(2, { mp_expira_em: iso(10 * DIA), mp_renovar_tentativas: 2 }, mp, "fora"),
        await integracao(3, { mp_expira_em: iso(10 * DIA), mp_renovando_ate: iso(60_000) }, mp),       // outra renovação no meio
      ],
    });
    const { r } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ renovadas: 0, recusadas: 1, fora: 1, ocupadas: 1, erros: 0 });
    expect(integDe(db, 1)).toMatchObject({ status: "ativa", mp_erro: "renovacao_recusada" });
    perto(integDe(db, 1).mp_renovar_proxima_em, DIA);
    expect(integDe(db, 2)).toMatchObject({ status: "ativa", mp_renovar_tentativas: 3 });
    perto(integDe(db, 2).mp_renovar_proxima_em, 4 * HORA);                // 2^(tentativas de antes) horas — o proximaTentativa(2)
    expect(tokenOauth(mp)).toEqual(expect.arrayContaining([refreshDe(1), refreshDe(2)]));
    expect(tokenOauth(mp)).not.toContain(refreshDe(3));                   // a trava de outro: nem pediu ao MP
    expect(db.tabelas.avisos).toEqual([expect.objectContaining({ destino_user_id: donoDe(1), tipo: "geral",
      link: "/painel/configuracoes/recebimento" })]);
  });

  it("sem refresh (mp_erro sem_renovacao — decisão 8): não pede ao MP; 1 aviso 'conecte de novo até dd/mm' e a próxima tentativa amanhã", async () => {
    const mp = mpFalso();
    const vence = iso(12 * DIA);
    const db = criarDb({
      contas: contas(1),
      recebimento_integracoes: [await integracao(1, { mp_expira_em: vence, mp_refresh_token: null, mp_erro: "sem_renovacao" })],
    });
    const { r } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ renovadas: 0, sem_renovacao: 1, vencidas: 0 });
    expect(tokenOauth(mp)).toEqual([]);
    const data = new Date(vence).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    expect(db.tabelas.avisos).toHaveLength(1);
    expect(db.tabelas.avisos[0]).toMatchObject({ destino_user_id: donoDe(1), tipo: "geral", link: "/painel/configuracoes/recebimento" });
    expect(String(db.tabelas.avisos[0].titulo)).toContain(data);
    expect(String(db.tabelas.avisos[0].titulo)).toMatch(/antes disso\.$/);   // inteiro: o avisar corta o título em 160
    expect(String(db.tabelas.avisos[0].titulo)).not.toMatch(/token|oauth|refresh/i);
    expect(integDe(db, 1)).toMatchObject({ status: "ativa", mp_erro: "sem_renovacao" });
    perto(integDe(db, 1).mp_renovar_proxima_em, DIA);
    // a rodada da hora seguinte não pega de novo (a próxima tentativa é amanhã): nada de aviso dobrado nem vaga ocupada
    const { r: r2 } = rodada(db);
    expect(await R.rodada(r2)).toMatchObject({ sem_renovacao: 0 });
    expect(db.tabelas.avisos).toHaveLength(1);
  });

  it("uma conta que lança (a cifra de outra chave) não para as outras: erros 1, log.excecao com a conta, as outras renovam", async () => {
    const mp = mpFalso();
    const db = criarDb({
      contas: contas(1, 2, 3),
      recebimento_integracoes: [
        await integracao(1, { mp_expira_em: iso(3 * DIA) }, mp, "ok", OUTRA_CHAVE),
        await integracao(2, { mp_expira_em: iso(4 * DIA) }, mp),
        await integracao(3, { mp_expira_em: iso(5 * DIA) }, mp),
      ],
    });
    const { r, linhas } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ renovadas: 2, erros: 1 });
    expect(linhas.find((l) => l.nivel === "excecao")?.campos).toMatchObject({ codigo: "mp_renovar_conta_falhou", ref: conta(1), schema: "staging" });
    expect(integDe(db, 1).mp_renovando_ate).toBeNull();                    // a trava foi solta (o finally da renovarConta)
  });

  it("revisão I-1: desligada NO MEIO do POST da renovação → o par novo gravado, ela SEGUE desconectada e a próxima rodada não a pega (nem a renovação, nem o diário)", async () => {
    const mp = mpFalso();
    const db = criarDb({ contas: contas(1), recebimento_integracoes: [await integracao(1, { mp_expira_em: iso(10 * DIA) }, mp)] });
    const desligadaEm = iso(0);
    const doMp = globalThis.fetch;
    vi.stubGlobal("fetch", (entrada: string | URL | Request, init?: RequestInit) => {
      const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      // o dono desliga enquanto o POST /oauth/token está no ar: o gatilho contas_saiu_do_mp_conta (status, data e a trava; o refresh igual)
      if (new URL(url).pathname === "/oauth/token") Object.assign(integDe(db, 1), { status: "desconectada", desconectada_em: desligadaEm, mp_renovando_ate: null });
      return doMp(entrada, init);
    });
    const { r } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ renovadas: 1, erros: 0 });
    const l = integDe(db, 1);
    expect(l).toMatchObject({ status: "desconectada", desconectada_em: desligadaEm, mp_renovando_ate: null });
    const access = await decifrar(String(l.mp_access_token), dadoAssociado("staging", conta(1), "access"), CHAVE);
    expect(access).toMatch(new RegExp(`^APP_USR-novo-\\d+-${vendedor(1)}-renovado$`));   // o par novo (o velho morreu no MP: os 7 dias de leitura seguem)
    expect(mp.refreshes.has(refreshDe(1))).toBe(false);
    const idas = mp.idas.length;
    const { r: r2 } = rodada(db);
    expect(await R.rodada(r2)).toMatchObject({ renovadas: 0, conferidas: 0, sem_acesso: 0, vencidas: 0, erros: 0 });
    expect(mp.idas.slice(idas)).toEqual([]);                               // nem /oauth/token nem /users/me para quem desligou
    expect(db.tabelas.avisos).toEqual([]);
  });
});

// ───────────────────────── as vencidas ─────────────────────────

describe("rodada — as que venceram ainda ativas", () => {
  it("vencida sem refresh, ou vencida há > 1 dia → erro 'vencido' + 1 aviso; vencida há < 1 dia com o MP fora nesta rodada → fica (a próxima hora tenta)", async () => {
    const mp = mpFalso();
    const db = criarDb({
      contas: contas(1, 2, 3, 4, 5),
      recebimento_integracoes: [
        await integracao(1, { mp_expira_em: iso(-HORA), mp_refresh_token: null, mp_erro: "sem_renovacao" }),         // vencida, sem refresh
        await integracao(2, { mp_expira_em: iso(-3 * DIA), mp_renovar_proxima_em: iso(5 * HORA) }, mp, "fora"),       // vencida há 3 dias
        await integracao(3, { mp_expira_em: iso(-2 * HORA) }, mp, "fora"),                                           // há 2 h, o MP fora agora
        await integracao(4, { mp_expira_em: iso(-2 * HORA), mp_origem: "teste_local", mp_refresh_token: null, mp_erro: "sem_renovacao" }),
        await integracao(5, { mp_expira_em: iso(-2 * HORA) }, mp, "recusar"),                                        // há 2 h, recusada
      ],
    });
    const { r, linhas } = rodada(db);
    const c = await R.rodada(r);
    expect(c).toMatchObject({ vencidas: 2, fora: 1, recusadas: 1 });
    expect(integDe(db, 1)).toMatchObject({ status: "erro", mp_erro: "vencido" });
    expect(integDe(db, 2)).toMatchObject({ status: "erro", mp_erro: "vencido" });
    expect(integDe(db, 3)).toMatchObject({ status: "ativa", mp_erro: null });                    // 1 dia de tolerância para quem ainda renova
    expect(integDe(db, 4)).toMatchObject({ status: "ativa", mp_origem: "teste_local" });         // o job não toca nas locais
    expect(integDe(db, 5)).toMatchObject({ status: "erro", mp_erro: "renovacao_recusada" });     // a própria renovarConta marcou
    expect(db.tabelas.avisos.map((a) => a.destino_user_id).sort()).toEqual([donoDe(1), donoDe(2), donoDe(5)].sort());
    expect(linhas.filter((l) => l.nivel === "erro" && l.campos.codigo === "mp_conta_sem_acesso").map((l) => l.campos.ref).sort())
      .toEqual([conta(1), conta(2), conta(5)].sort());
  });
});

// ───────────────────────── o diário ─────────────────────────

describe("rodada — o diário (1×/dia por integração OAuth ativa: /users/me + as cobranças das automáticas)", () => {
  const matricula = (n: number): Linha => ({
    id: P1, conta_id: conta(n), user_id: "e1111111-1111-4111-8111-111111111111", treino_user_id: null, nome: "Aluno Um", email: null, cpf: null,
    foto_url: null, ativo: true, tags: null, personal_id: null, nutricionista_id: null, plano_aluno_id: null, mensalidade_valor: 120,
    cobranca_pausada: false, mensalidade_desde: null, mensalidade_pago_ate: null, deleted_at: null, plano_modalidade: null,
    plano_valor_negociado: null, conta: { id: conta(n), nome: "Conta", dono_id: donoDe(n), recebimento_modo: "mercadopago_conta",
      bloquear_app_inadimplente: false, origem: "personal" }, plano: { id: "pl-1", nome: "Mensal" },
  });

  it("confere as que nunca conferiram (nulos primeiro) e as de > 1 dia; as de hoje e as não-OAuth não; grava o mp_conferido_em", async () => {
    const mp = mpFalso();
    const db = criarDb({
      contas: contas(1, 2, 3, 4),
      recebimento_integracoes: [
        await integracao(1, { mp_conferido_em: iso(-2 * DIA) }, mp),
        await integracao(2, { mp_conferido_em: null }, mp),
        await integracao(3, { mp_conferido_em: iso(-2 * HORA) }, mp),                             // hoje: não
        await integracao(4, { mp_conferido_em: null, mp_origem: "teste_sem_oauth" }, mp),        // a simulada: não
      ],
    });
    const { r } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ conferidas: 2, sem_acesso: 0, conferir_fora: 0, cobrancas_da_rede: 0, renovadas: 0 });
    const me = mp.idas.filter((i) => i.caminho === "/users/me").map((i) => i.token);
    expect(me).toEqual([accessDe(2), accessDe(1)]);                         // os nulos primeiro; cada uma com o token DELA
    perto(integDe(db, 1).mp_conferido_em, 0);
    perto(integDe(db, 2).mp_conferido_em, 0);
    perto(integDe(db, 3).mp_conferido_em, -2 * HORA);
    expect(integDe(db, 4).mp_conferido_em).toBeNull();
  });

  it("MENOR 27: o acesso tirado no MP (o token morto e a renovação recusada) → erro + 1 aviso, sem esperar um aluno pagar", async () => {
    const mp = mpFalso();
    const db = criarDb({ contas: contas(1), recebimento_integracoes: [await integracao(1, { mp_conferido_em: null }, mp, "recusar")] });
    mp.vivos.delete(accessDe(1));                                           // tiraram o acesso do Physiq na conta do MP
    const { r } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ conferidas: 0, sem_acesso: 1 });
    expect(integDe(db, 1)).toMatchObject({ status: "erro", mp_erro: "acesso_recusado", mp_conferido_em: null });
    expect(db.tabelas.avisos).toHaveLength(1);
  });

  it("I1: a cobrança aprovada do mês que o aviso não trouxe entra paga com o mp_collector_id da conta; de novo no mesmo dia não confere; forçado, não dobra", async () => {
    const mp = mpFalso();
    const busca = "/authorized_payments/search?preapproval_id=pre-1&sort=date_created&criteria=desc&limit=6";
    mp.rotas[busca] = { status: 200, body: { results: [{ payment: { id: 501 } }] } };
    mp.rotas["/v1/payments/501"] = { status: 200, body: { id: 501, status: "approved", transaction_amount: 120, collector_id: vendedor(1),
      payment_method_id: "visa", date_approved: "2026-10-05T12:00:00.000-03:00" } };
    const db = criarDb({
      contas: contas(1),
      recebimento_integracoes: [await integracao(1, { mp_conferido_em: null }, mp)],
      pacientes: [matricula(1)],
      aluno_assinaturas: [{ id: "as-1", paciente_id: P1, conta_id: conta(1), mp_collector_id: vendedor(1), mp_preapproval_id: "pre-1",
        status: "authorized", valor: 120, proximo_vencimento: null, payload: {}, criado_em: "2026-10-01T00:00:00.000Z", pacientes: { conta_id: conta(1) } }],
    });
    const { r } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ conferidas: 1, cobrancas_da_rede: 1 });
    expect(db.tabelas.cobrancas).toEqual([expect.objectContaining({ mp_payment_id: "501", mp_collector_id: vendedor(1), status: "paga",
      mp_preapproval_id: "pre-1", origem: "assinatura" })]);
    expect(mp.idas.filter((i) => i.caminho === busca || i.caminho === "/v1/payments/501").every((i) => i.token === accessDe(1))).toBe(true);
    const { r: r2 } = rodada(db);
    expect(await R.rodada(r2)).toMatchObject({ conferidas: 0, cobrancas_da_rede: 0 });     // conferida hoje
    integDe(db, 1).mp_conferido_em = iso(-2 * DIA);
    const { r: r3 } = rodada(db);
    expect(await R.rodada(r3)).toMatchObject({ conferidas: 1, cobrancas_da_rede: 0 });     // mp_payment_id único: nada dobra
    expect(db.tabelas.cobrancas).toHaveLength(1);
  });

  it("o MP fora no diário → conferir_fora e o mp_conferido_em NÃO é gravado; o banco que cai numa conta não para as outras", async () => {
    const mp = mpFalso();
    mp.usersMe = 429;
    const db = criarDb({
      contas: contas(1, 2),
      recebimento_integracoes: [await integracao(1, { mp_conferido_em: null }, mp), await integracao(2, { mp_conferido_em: iso(-3 * DIA) }, mp)],
    });
    db.falhas.push({ casa: (p) => p.tabela === "recebimento_integracoes" && p.op === "select" && p.filtros.some((f) => "col" in f
      && f.col === "conta_id" && f.v === conta(2)), erro: { code: "57014", message: "canceling statement due to statement timeout" } });
    const { r, linhas } = rodada(db);
    expect(await R.rodada(r)).toMatchObject({ conferidas: 0, conferir_fora: 1, erros: 1 });
    expect(integDe(db, 1).mp_conferido_em).toBeNull();
    expect(linhas.find((l) => l.nivel === "excecao")?.campos).toMatchObject({ codigo: "mp_conferir_conta_falhou", ref: conta(2) });
  });
});

// ───────────────────────── a resposta e o forçado ─────────────────────────

describe("a resposta (só contagens) e o forcar_conta (só staging)", () => {
  it("a contagem tem só números, com estas chaves", async () => {
    mpFalso();
    const db = criarDb({ contas: [], recebimento_integracoes: [] });
    const { r, linhas } = rodada(db);
    const c = await R.rodada(r);
    expect(Object.keys(c).sort()).toEqual(["cobrancas_da_rede", "conferidas", "conferir_fora", "erros", "fora", "ocupadas", "outras", "recusadas",
      "renovadas", "sem_acesso", "sem_renovacao", "vencidas"]);
    expect(Object.values(c).every((v) => v === 0)).toBe(true);
    expect(linhas.find((l) => l.campos.codigo === "rodada_feita")?.campos).toMatchObject({ schema: "staging", acao: "mp_renovar", n: 0 });
  });

  it("forcar_conta renova AGORA a conta (mesmo vencendo em 170 dias) e só ela: nem as outras, nem as vencidas, nem o diário", async () => {
    const mp = mpFalso();
    const db = criarDb({
      contas: contas(1, 2, 3),
      recebimento_integracoes: [
        await integracao(1, { mp_expira_em: iso(170 * DIA), mp_conferido_em: null }, mp),
        await integracao(2, { mp_expira_em: iso(2 * DIA), mp_conferido_em: null }, mp),
        await integracao(3, { mp_expira_em: iso(-3 * DIA), mp_refresh_token: null, mp_erro: "sem_renovacao" }),
      ],
    });
    const { r } = rodada(db);
    const c = await R.forcarRenovacao(r, conta(1));
    expect(c).toMatchObject({ renovadas: 1, vencidas: 0, conferidas: 0 });
    expect(mp.idas.map((i) => [i.caminho, i.corpo?.refresh_token ?? null])).toEqual([["/oauth/token", refreshDe(1)]]);
    perto(integDe(db, 1).mp_expira_em, 180 * DIA);
    expect(integDe(db, 3)).toMatchObject({ status: "ativa" });
    expect(await R.forcarRenovacao(r, conta(7))).toBeNull();               // sem integração do MP: a index.ts responde 404 conta_sem_mp
  });
});

// ───────────────────────── a index.ts (o Vitest não importa: Deno.serve, esm.sh, Deno.env no topo) ─────────────────────────

describe("o contrato da index.ts", () => {
  const index = fonte("mp-contas-renovar/index.ts");
  const posicao = (trecho: string) => {
    const i = index.indexOf(trecho);
    expect(i, trecho).toBeGreaterThan(-1);
    return i;
  };
  it("POST só; o segredo S10 (só a lista de hashes) ANTES de ler o corpo; a configuração ANTES do banco; o schema com a W2 ANTES da rodada", () => {
    const metodo = posicao('if (req.method !== "POST") return json({ error: "metodo" }, 405);');
    const segredo = posicao('await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_MP_RENOVAR")');
    const corpo = posicao("await req.json()");
    const configuracao = posicao("if (!chave || !oauth) {");
    const banco = posicao("createClient(SUPABASE_URL, SERVICE_ROLE");
    const w2 = posicao("await schemaTemW2(db, pedido.schema)");
    const rodar = posicao("await rodada(r)");
    expect(metodo).toBeLessThan(segredo);
    expect(segredo).toBeLessThan(corpo);
    expect(corpo).toBeLessThan(configuracao);
    expect(configuracao).toBeLessThan(banco);
    expect(banco).toBeLessThan(w2);
    expect(w2).toBeLessThan(rodar);
    expect(index).toContain('return json({ error: "segredo_invalido" }, 401);');
    expect(index).toContain('return json({ error: "nao_configurada" }, 500);');
    expect(index).toContain('return json({ error: "schema_sem_w2" }, 409);');
    expect(index).toContain('return json({ error: "conta_sem_mp" }, 404);');
    expect(index).toContain("chaveDoAmbiente()");
    expect(index).toContain("oauthDoAmbiente(pedido.schema)");
    expect(index).toContain("prazo(ORCAMENTO_MS.loteEspelho)");
  });
  it("verify_jwt false, o S10 no comentário e o log com o nome da função; nenhum Deno.env de segredo do MP lido direto", () => {
    expect(index).toContain("scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-contas-renovar false");
    expect(index).toContain("physiq_mp_renovar_segredo");
    expect(index).toContain("scripts/segredos/servidor.py mp_renovar");
    expect(index).toContain('criarLog("mp-contas-renovar", { avisar: avisarErro })');
    expect(index).not.toMatch(/Deno\.env\.get\("(MP_TOKENS_CHAVE|MP_CLIENT_SECRET|MP_CLIENT_ID|SEGREDO_MP_RENOVAR)/);
  });
  it("a rodada.ts: só import de tipo por URL e sem o global Deno (o Vitest importa)", () => {
    const rodadaTs = fonte("mp-contas-renovar/rodada.ts");
    expect(rodadaTs).not.toMatch(/^import (?!type )[^;]*from "https?:/m);
    expect(rodadaTs).not.toMatch(/\bDeno\./);
  });
});
