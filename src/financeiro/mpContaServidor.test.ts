// @vitest-environment node
// src/financeiro/mpContaServidor.test.ts
// Physiq W2 — o cliente do Mercado Pago DA CONTA do personal no servidor (supabase-principal/functions/_shared/mp-conta.ts) e o que a Task 4
// trocou nos _shared de sempre: cobranca-mp.ts (a CredencialConta no tokenMp e no mpFetch, o baseDoMp), app-sem-profissional.ts (o filtro
// pelo collector), financeiro-mp.ts (o colunasW2) e planos-automatica-mp.ts (a CredencialMp — MENOR 2). No fim, a Task 8: o
// guardarParaConfirmar da volta do OAuth (o par cifrado na conexão até a confirmação de quem começou — revisão I8).
// Um banco FALSO em memória (as chamadas do supabase-js gravadas numa lista; sem a W2 ele responde 42P01 ao mp_conexoes e 42703 a qualquer
// select com mp_collector_id) e um fetch FALSO: o do /oauth/token entra pelo ctx.fetch; o das rotas do MP, pelo fetch global
// (vi.stubGlobal). Tokens, chave e client são de teste, feitos aqui; nada vai à rede. Cada teste importa o módulo de novo
// (vi.resetModules): a memória de 60 s do schemaTemW2 não vaza de um teste para o outro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrar, dadoAssociado, decifrar, importarChave } from "../../supabase-principal/functions/_shared/cifra-mp";
import type { CredencialConta, RespostaMp } from "../../supabase-principal/functions/_shared/cobranca-mp";
import type { Matricula } from "../../supabase-principal/functions/_shared/financeiro-mp";
import type { Log } from "../../supabase-principal/functions/_shared/log";
import type { ContextoMpConta } from "../../supabase-principal/functions/_shared/mp-conta";
import { lerTokenDoMp, type TokenMp } from "../../supabase-principal/functions/_shared/mp-conta-regras";
import type { Prazo } from "../../supabase-principal/functions/_shared/tempo";

type ModMpConta = typeof import("../../supabase-principal/functions/_shared/mp-conta");
type ModCobrancaMp = typeof import("../../supabase-principal/functions/_shared/cobranca-mp");
type ModPlanosMp = typeof import("../../supabase-principal/functions/_shared/planos-automatica-mp");

const CONTA = "c0a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b";
const DONO = "d0d0d0d0-1111-4222-8333-444455556666";
const P1 = "a1111111-1111-4111-8111-111111111111";
const P2 = "a2222222-2222-4222-8222-222222222222";
const P3 = "a3333333-3333-4333-8333-333333333333";
const COLLECTOR = 777;
const TOKEN_A = "APP_USR-acesso-da-conta-0001";
const REFRESH_A = "TG-refresh-da-conta-0001";
const TOKEN_B = "APP_USR-acesso-renovado-0002";
const REFRESH_B = "TG-refresh-renovado-0002";
const PHYSIQ_TEST = "TEST-physiq-do-ambiente-0003";
const PHYSIQ_PROD = "APP_USR-physiq-producao-0004";
const CLIENT = { clientId: "1234567890123456", clientSecret: "client-secret-de-teste-000000000" };
const MP = "https://api.mercadopago.com";
const HORA = 3_600_000;
const DIA = 24 * HORA;
const BUSCA_PRE9 = "/authorized_payments/search?preapproval_id=pre-9&sort=date_created&criteria=desc&limit=6";

// ───────────────────────── o banco falso ─────────────────────────

type Linha = Record<string, unknown>;
type OpSimples = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
type Filtro =
  | { col: string; op: OpSimples; v: unknown }
  | { col: string; op: "is" | "nao_nulo"; v: null }
  | { col: string; op: "in"; v: unknown[] }
  | { op: "or"; texto: string };
interface Pedido {
  tabela: string;
  op: "select" | "update" | "insert" | "upsert" | "rpc";
  colunas: string | null;
  volta: string | null;
  valores: Linha | null;
  filtros: Filtro[];
  unico: boolean;
  limite: number | null;
  faixa: [number, number] | null;
  args: Record<string, unknown> | null;
}
interface ErroDb { code: string; message: string }
interface RespostaDb { data: unknown; error: ErroDb | null }
interface Consulta extends PromiseLike<RespostaDb> {
  select(colunas?: string, opcoes?: unknown): Consulta;
  update(valores: Linha): Consulta;
  insert(valores: Linha): Consulta;
  upsert(valores: Linha, opcoes?: unknown): Consulta;
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
  order(col: string, opcoes?: unknown): Consulta;
  limit(n: number): Consulta;
  range(de: number, ate: number): Consulta;
  maybeSingle(): Consulta;
  single(): Consulta;
}

const valorDe = (l: Linha, col: string): unknown =>
  col.split(".").reduce<unknown>((o, k) => (o !== null && typeof o === "object" ? (o as Linha)[k] : undefined), l);
const comparavel = (x: unknown) => (typeof x === "string" && /^\d{4}-\d\d-\d\dT/.test(x) ? Date.parse(x) : Number(x));
const vazio = (x: unknown) => x === null || x === undefined;

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

/** As colunas de um select (as vírgulas de dentro dos parênteses de um recurso embutido não separam). */
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
    const embutida = /^(?:(\w+):)?(\w+)(?:!\w+)?\(/.exec(parte);   // conta:contas(…) → "conta"; pacientes!inner(…) → "pacientes"
    const chave = embutida ? (embutida[1] ?? embutida[2]) : parte;
    saida[chave] = l[chave] ?? null;
  }
  return saida;
}

const citaACollector = (p: Pedido) =>
  [p.colunas, p.volta].some((c) => !!c && c.includes("mp_collector_id"))
  || p.filtros.some((f) => ("col" in f ? f.col === "mp_collector_id" : f.texto.includes("mp_collector_id")))
  || Object.prototype.hasOwnProperty.call(p.valores ?? {}, "mp_collector_id");

/** O schema SEM a migration da W2: a tabela nova não existe e a coluna nova também não (42703 no select, PGRST204 na gravação). */
function erroSemW2(p: Pedido): ErroDb | null {
  if (p.tabela === "mp_conexoes") return { code: "42P01", message: 'relation "public.mp_conexoes" does not exist' };
  if (!citaACollector(p)) return null;
  return p.op === "select"
    ? { code: "42703", message: `column ${p.tabela}.mp_collector_id does not exist` }
    : { code: "PGRST204", message: `Could not find the 'mp_collector_id' column of '${p.tabela}' in the schema cache` };
}

function criarDb(inicio: Record<string, Linha[]>, opcoes: { semW2?: boolean; responder?: (p: Pedido) => RespostaDb | undefined } = {}) {
  const tabelas: Record<string, Linha[]> = { mp_conexoes: [], ...inicio };
  const pedidos: Pedido[] = [];
  let seq = 0;
  const linhasDe = (t: string) => (tabelas[t] ??= []);
  const semUndefined = (v: Linha | null): Linha => Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x !== undefined));

  function rpc(p: Pedido): RespostaDb {
    // o molde do {schema}.mp_integracao_reservar (Task 6): reserva por p_segundos se a trava está livre (ou vencida)
    if (p.tabela !== "mp_integracao_reservar") return { data: null, error: { code: "42883", message: `function ${p.tabela} does not exist` } };
    const agora = Date.now();
    const l = linhasDe("recebimento_integracoes").find((x) => x.conta_id === p.args?.p_conta && x.provedor === "mercadopago"
      && (x.status === "ativa" || x.status === "erro"));
    if (!l || (l.mp_renovando_ate && Date.parse(String(l.mp_renovando_ate)) >= agora)) return { data: false, error: null };
    l.mp_renovando_ate = new Date(agora + Number(p.args?.p_segundos ?? 120) * 1000).toISOString();
    return { data: true, error: null };
  }

  function executar(p: Pedido): RespostaDb {
    const doSchema = opcoes.semW2 ? erroSemW2(p) : null;
    if (doSchema) return { data: null, error: doSchema };
    const pronta = opcoes.responder?.(p);
    if (pronta) return pronta;
    if (p.op === "rpc") return rpc(p);
    const unica = (lista: Linha[]) => (p.unico ? (lista[0] ?? null) : lista);
    if (p.op === "insert" || p.op === "upsert") {
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
    let lista = achadas;
    if (p.faixa) lista = lista.slice(p.faixa[0], p.faixa[1] + 1);
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
        else p.volta = colunas;                                             // .update(…).select(…): as colunas de volta
      }),
      update: (valores) => muda(() => Object.assign(p, { op: "update", valores })),
      insert: (valores) => muda(() => Object.assign(p, { op: "insert", valores })),
      upsert: (valores) => muda(() => Object.assign(p, { op: "upsert", valores })),
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
      order: () => q,
      limit: (n) => muda(() => Object.assign(p, { limite: n })),
      range: (de, ate) => muda(() => Object.assign(p, { faixa: [de, ate] })),
      maybeSingle: () => muda(() => Object.assign(p, { unico: true })),
      single: () => muda(() => Object.assign(p, { unico: true })),
      then<A = RespostaDb, B = never>(ok?: ((v: RespostaDb) => A | PromiseLike<A>) | null,
        ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
        return Promise.resolve().then(() => executar(p)).then(ok, ko);
      },
    };
    return q;
  }

  const novo = (tabela: string, op: Pedido["op"], args: Record<string, unknown> | null = null): Pedido => {
    const p: Pedido = { tabela, op, colunas: null, volta: null, valores: null, filtros: [], unico: false, limite: null, faixa: null, args };
    pedidos.push(p);
    return p;
  };
  const cliente = {
    from: (tabela: string) => consulta(novo(tabela, "select")),
    rpc: (nome: string, args: Record<string, unknown> = {}) => consulta(novo(nome, "rpc", args)),
  } as unknown as SupabaseClient;
  return { cliente, pedidos, tabelas };
}
type DbFalso = ReturnType<typeof criarDb>;
const integ = (db: DbFalso) => db.tabelas.recebimento_integracoes[0];
const gravacoes = (db: DbFalso, tabela: string) => db.pedidos.filter((p) => p.tabela === tabela && p.op === "update");

// ───────────────────────── o fetch falso, o log falso, o prazo ─────────────────────────

interface Ida { url: string; caminho: string; metodo: string; token: string | null; corpo: Record<string, unknown> | null }
type RespostaFalsa = { status: number; body?: unknown } | "rede";
function fetchFalso(responder: (ida: Ida) => RespostaFalsa) {
  const idas: Ida[] = [];
  const f = async (entrada: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const cab = new Headers(init.headers);
    const ida: Ida = {
      url: u.href, caminho: u.pathname + u.search, metodo: (init.method ?? "GET").toUpperCase(),
      token: cab.get("Authorization")?.replace(/^Bearer /, "") ?? null,
      corpo: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    idas.push(ida);
    const r = responder(ida);
    if (r === "rede") throw new TypeError("fetch failed");
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  };
  return { f: f as typeof fetch, idas };
}
/** As rotas do MP (api.mercadopago.com) — o mpFetch usa o fetch global. */
function rotasDoMp(responder: (ida: Ida) => RespostaFalsa) {
  const mp = fetchFalso(responder);
  vi.stubGlobal("fetch", mp.f);
  return mp;
}
const denoFalso = (env: Record<string, string>) => ({ env: { get: (n: string) => env[n] } });
const lerDe = (env: Record<string, string>) => (n: string) => env[n];

interface LinhaLog { nivel: "info" | "aviso" | "erro" | "excecao"; campos: Record<string, unknown>; erro?: unknown }
function logFalso(): { log: Log; linhas: LinhaLog[] } {
  const linhas: LinhaLog[] = [];
  const anotar = (nivel: LinhaLog["nivel"], campos: object, erro?: unknown) => {
    linhas.push({ nivel, campos: { ...campos }, ...(nivel === "excecao" ? { erro } : {}) });
  };
  const log: Log = {
    info: (campos) => anotar("info", campos),
    aviso: (campos) => anotar("aviso", campos),
    erro: (campos) => anotar("erro", campos),
    excecao: (erro, campos) => anotar("excecao", campos ?? {}, erro),
  };
  return { log, linhas };
}
/** O prazo do pedido parado num valor (o mpFetch só repete um 5xx com ≥ 2 s sobrando depois da espera: 2,5 s = sem repetição). */
const prazoDe = (ms: number): Prazo => ({ restante: () => ms, esgotado: () => ms <= 0 });
const perto = (iso: unknown, daquiMs: number, folga = 60_000) =>
  expect(Math.abs(Date.parse(String(iso)) - (Date.now() + daquiMs))).toBeLessThan(folga);

// ───────────────────────── as peças de cada cenário ─────────────────────────

let CHAVE: CryptoKey;
const ad = (campo: "access" | "refresh", schema = "staging") => dadoAssociado(schema, CONTA, campo);
const respostaDoToken = (o: Record<string, unknown> = {}) => ({
  access_token: TOKEN_B, token_type: "bearer", expires_in: 15_552_000, scope: "offline_access read write payments", user_id: COLLECTOR,
  refresh_token: REFRESH_B, public_key: "APP_USR-chave-publica-0002", live_mode: false, ...o,
});
async function integracao(o: Linha = {}): Promise<Linha> {
  return {
    conta_id: CONTA, provedor: "mercadopago", status: "ativa", mp_user_id: COLLECTOR, mp_apelido: "VENDEDOR_TESTE",
    mp_public_key: "APP_USR-chave-publica-0001", mp_access_token: await cifrar(TOKEN_A, ad("access"), CHAVE),
    mp_refresh_token: await cifrar(REFRESH_A, ad("refresh"), CHAVE), mp_expira_em: new Date(Date.now() + 90 * DIA).toISOString(),
    mp_teste: true, mp_origem: "oauth", mp_renovado_em: null, mp_renovando_ate: null, mp_renovar_tentativas: 0, mp_renovar_proxima_em: null,
    mp_erro: null, mp_avisado_em: null, mp_conferido_em: null, conectado_em: new Date(Date.now() - 10 * DIA).toISOString(),
    desconectada_em: null, ...o,
  };
}
const credConta = (o: Partial<CredencialConta> = {}): CredencialConta =>
  ({ tipo: "conta", schema: "staging", contaId: CONTA, collectorId: COLLECTOR, token: TOKEN_A, ...o });
function contexto(o: { prazo?: Prazo; oauth?: ContextoMpConta["oauth"]; token?: (ida: Ida) => RespostaFalsa } = {}) {
  const { log, linhas } = logFalso();
  const oauth = fetchFalso(o.token ?? (() => ({ status: 200, body: respostaDoToken() })));
  const ctx: ContextoMpConta = { schema: "staging", log, prazo: o.prazo ?? prazoDe(20_000), chave: CHAVE,
    oauth: o.oauth === undefined ? CLIENT : o.oauth, fetch: oauth.f };
  return { ctx, linhas, oauth };
}
const matricula = (): Matricula => ({
  id: P1, conta_id: CONTA, user_id: "u-aluno-1", treino_user_id: null, nome: "Aluno Um", email: null, cpf: null, foto_url: null, ativo: true,
  tags: null, personal_id: null, nutricionista_id: null, plano_aluno_id: null, mensalidade_valor: 100, cobranca_pausada: false,
  mensalidade_desde: null, mensalidade_pago_ate: null, deleted_at: null, plano_modalidade: null, plano_valor_negociado: null,
  conta: { id: CONTA, nome: "Conta do personal", dono_id: DONO, recebimento_modo: "mercadopago_conta", bloquear_app_inadimplente: false, origem: "personal" },
  plano: { id: "pl-1", nome: "Mensal" },
});
const assinaturas = (): Linha[] => [
  { id: "as-1", paciente_id: P1, conta_id: CONTA, mp_collector_id: null, mp_preapproval_id: "pre-1", status: "authorized", payload: {} },
  { id: "as-2", paciente_id: P2, conta_id: CONTA, mp_collector_id: null, mp_preapproval_id: "pre-2", status: "pending", payload: {} },
  { id: "as-3", paciente_id: P3, conta_id: CONTA, mp_collector_id: COLLECTOR, mp_preapproval_id: "pre-3", status: "authorized", payload: {} },
];
const cancelou = (ida: Ida): RespostaFalsa => ({ status: 200, body: { id: ida.caminho.split("/").pop(), status: "cancelled" } });

let M: ModMpConta;
let C: ModCobrancaMp;
beforeAll(async () => {
  CHAVE = await importarChave(Buffer.alloc(32, 7).toString("base64url"));
});
beforeEach(async () => {
  vi.resetModules();
  M = await import("../../supabase-principal/functions/_shared/mp-conta");
  C = await import("../../supabase-principal/functions/_shared/cobranca-mp");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ───────────────────────── Step 1: o que mudou nos _shared de sempre ─────────────────────────

describe("Step 1 — cobranca-mp: a credencial da conta (o tokenMp TROCADO — MENOR 1)", () => {
  it("tokenMp: a da conta leva o token dela; prod e test seguem lendo o ambiente (fora do Deno, vazio)", () => {
    expect(C.tokenMp("test")).toBe("");
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST, MP_ACCESS_TOKEN_PROD: PHYSIQ_PROD }));
    expect(C.tokenMp("test")).toBe(PHYSIQ_TEST);
    expect(C.tokenMp("prod")).toBe(PHYSIQ_PROD);
    expect(C.tokenMp(credConta())).toBe(TOKEN_A);
  });
  it("schemaDaCredencialMp: prod → public, test → staging, a da conta → o schema dela", () => {
    expect(C.schemaDaCredencialMp("prod")).toBe("public");
    expect(C.schemaDaCredencialMp("test")).toBe("staging");
    expect(C.schemaDaCredencialMp(credConta({ schema: "public" }))).toBe("public");
    expect(C.schemaDaCredencialMp(credConta())).toBe("staging");
  });
  it("baseDoMp: só o simulador em http://127.0.0.1:<porta> troca a base; qualquer outra coisa é a do MP", () => {
    expect(C.baseDoMp()).toBe(MP);
    for (const [valor, base] of [["http://127.0.0.1:8799", "http://127.0.0.1:8799"], ["https://evil.example", MP], ["http://127.0.0.1:8799/x", MP],
      ["http://localhost:8799", MP], ["http://127.0.0.1", MP]]) {
      vi.stubGlobal("Deno", denoFalso({ MP_API_BASE: valor }));
      expect(C.baseDoMp(), valor).toBe(base);
    }
  });
  it("mpFetch: a da conta vai com o token dela no Authorization; a do Physiq segue com o do ambiente", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST }));
    const mp = rotasDoMp(() => ({ status: 200, body: { id: 1 } }));
    await C.mpFetch(credConta(), "/users/me", {}, { prazo: prazoDe(5_000) });
    await C.mpFetch("test", "/users/me", {}, { prazo: prazoDe(5_000) });
    expect(mp.idas.map((i) => [i.url, i.token])).toEqual([[`${MP}/users/me`, TOKEN_A], [`${MP}/users/me`, PHYSIQ_TEST]]);
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST, MP_API_BASE: "http://127.0.0.1:8799" }));   // o simulador local
    await C.mpFetch(credConta(), "/v1/payments/1", {}, { prazo: prazoDe(5_000) });
    expect(mp.idas[2].url).toBe("http://127.0.0.1:8799/v1/payments/1");
  });
});

describe("Step 1 — planos-automatica-mp aceita a credencial de cada assinatura (MENOR 2)", () => {
  it("assinaturaComoNoMp e trocarValorDaAutomatica vão ao MP com o token da CONTA quando a credencial é dela", async () => {
    const PA: ModPlanosMp = await import("../../supabase-principal/functions/_shared/planos-automatica-mp");
    const mp = rotasDoMp((ida) => ({ status: 200, body: { id: "pre-1", status: "authorized",
      auto_recurring: { transaction_amount: ida.metodo === "PUT" ? 90 : 100 } } }));
    const db = criarDb({ aluno_assinaturas: [{ id: "as-1", paciente_id: P1, mp_preapproval_id: "pre-1", status: "authorized", valor: 100, payload: {} }] });
    const { log } = logFalso();
    const a = { id: "as-1", mp_preapproval_id: "pre-1", status: "authorized", valor: 100, payload: {} };
    const ctx = { prazo: prazoDe(5_000), log, schema: "staging" as const, acao: "teste" };
    expect((await PA.assinaturaComoNoMp(db.cliente, credConta(), a, ctx))?.status).toBe("authorized");
    expect((await PA.trocarValorDaAutomatica(db.cliente, credConta(), a, 90, ctx)).resultado).toBe("atualizada");
    expect(mp.idas.map((i) => [i.metodo, i.caminho, i.token])).toEqual([["GET", "/preapproval/pre-1", TOKEN_A], ["PUT", "/preapproval/pre-1", TOKEN_A]]);
    expect(db.tabelas.aluno_assinaturas[0].valor).toBe(90);
  });
});

// ───────────────────────── a integração e a credencial ─────────────────────────

describe("integracaoMp — a linha SEM token", () => {
  it("devolve a integração sem nenhum token (tem_acesso diz só se ainda há token) e o mp_user_id como número", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_user_id: "777" })] });
    const i = await M.integracaoMp(db.cliente, CONTA);
    expect(i).toMatchObject({ conta_id: CONTA, status: "ativa", mp_user_id: COLLECTOR, mp_apelido: "VENDEDOR_TESTE", mp_origem: "oauth", tem_acesso: true });
    expect(Object.keys(i ?? {}).some((k) => /token/.test(k))).toBe(false);
    expect(JSON.stringify(i)).not.toContain("v1:");
    integ(db).mp_access_token = null;
    expect((await M.integracaoMp(db.cliente, CONTA))?.tem_acesso).toBe(false);
    expect(await M.integracaoMp(db.cliente, "outra-conta")).toBeNull();
  });
});

describe("credencialDaConta (caso 1)", () => {
  it("ativa → o token decifrado só em memória: nada dele no banco falso nem no log", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const { ctx, linhas, oauth } = contexto();
    expect(await M.credencialDaConta(db.cliente, ctx, CONTA)).toEqual({ tipo: "conta", schema: "staging", contaId: CONTA, collectorId: COLLECTOR, token: TOKEN_A });
    expect(oauth.idas).toHaveLength(0);
    const tudo = JSON.stringify([db.pedidos, linhas]);
    expect(tudo).not.toContain(TOKEN_A);
    expect(tudo).not.toContain(REFRESH_A);
  });
  it("em erro, com exigirAtiva (o padrão) → MpContaSemAcesso('erro'); sem exigir, a credencial", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    const { ctx } = contexto();
    await expect(M.credencialDaConta(db.cliente, ctx, CONTA)).rejects.toMatchObject({ name: "MpContaSemAcesso", contaId: CONTA, motivo: "erro" });
    await expect(M.credencialDaConta(db.cliente, ctx, CONTA)).rejects.toBeInstanceOf(M.MpContaSemAcesso);
    expect((await M.credencialDaConta(db.cliente, ctx, CONTA, { exigirAtiva: false })).token).toBe(TOKEN_A);
  });
  it("sem token → MpContaSemAcesso('sem_token'); sem integração → 'sem_integracao'", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ status: "desconectada", mp_access_token: null, mp_refresh_token: null })] });
    const { ctx } = contexto();
    await expect(M.credencialDaConta(db.cliente, ctx, CONTA, { exigirAtiva: false })).rejects.toMatchObject({ motivo: "sem_token" });
    await expect(M.credencialDaConta(db.cliente, ctx, "outra-conta")).rejects.toMatchObject({ motivo: "sem_integracao" });
  });
  it("vence em < 1 dia → renova ANTES (1 POST /oauth/token) e devolve o token novo", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_expira_em: new Date(Date.now() + 12 * HORA).toISOString() })] });
    const { ctx, oauth } = contexto();
    const cred = await M.credencialDaConta(db.cliente, ctx, CONTA);
    expect(cred.token).toBe(TOKEN_B);
    expect(oauth.idas).toHaveLength(1);
    expect(oauth.idas[0]).toMatchObject({ metodo: "POST", url: `${MP}/oauth/token` });
    expect(oauth.idas[0].corpo).toEqual({ client_id: CLIENT.clientId, client_secret: CLIENT.clientSecret, grant_type: "refresh_token", refresh_token: REFRESH_A });
    const l = integ(db);
    expect(await decifrar(String(l.mp_access_token), ad("access"), CHAVE)).toBe(TOKEN_B);
    perto(l.mp_expira_em, 180 * DIA);
  });
  it("vencido e sem como renovar (teste_sem_oauth não renova) → MpContaSemAcesso('vencido')", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_origem: "teste_sem_oauth", mp_refresh_token: null,
      mp_expira_em: new Date(Date.now() - HORA).toISOString() })] });
    const { ctx, oauth } = contexto();
    await expect(M.credencialDaConta(db.cliente, ctx, CONTA)).rejects.toMatchObject({ motivo: "vencido" });
    expect(oauth.idas).toHaveLength(0);
  });
  it("MENOR 12 (caso 13): vence em < 1 dia mas o pedido tem < 10 s de prazo → NÃO renova; segue com o token que ainda vale", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_expira_em: new Date(Date.now() + 12 * HORA).toISOString() })] });
    const { ctx, oauth } = contexto({ prazo: prazoDe(5_000) });
    expect((await M.credencialDaConta(db.cliente, ctx, CONTA)).token).toBe(TOKEN_A);
    expect(oauth.idas).toHaveLength(0);
    expect(db.pedidos.some((p) => p.op === "rpc")).toBe(false);
  });
});

// ───────────────────────── a troca do code ─────────────────────────

describe("trocarCodigo (caso 2)", () => {
  it("manda client, secret, authorization_code, o code, o redirect da conexão, o verifier e test_token 'true' no staging", async () => {
    const { ctx, oauth } = contexto();
    const redirect = "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging";
    const r = await M.trocarCodigo(ctx, { codigo: "TG-codigo-de-teste-1", redirect, verificador: "v".repeat(64), teste: true });
    expect(r).toMatchObject({ ok: true, token: { access: TOKEN_B, refresh: REFRESH_B, userId: COLLECTOR, live: false, renovavel: true } });
    expect(oauth.idas[0]).toMatchObject({ metodo: "POST", url: `${MP}/oauth/token` });
    expect(oauth.idas[0].corpo).toEqual({ client_id: CLIENT.clientId, client_secret: CLIENT.clientSecret, grant_type: "authorization_code",
      code: "TG-codigo-de-teste-1", redirect_uri: redirect, code_verifier: "v".repeat(64), test_token: "true" });
  });
  it("400 invalid_grant → { ok: false, motivo: 'recusado' } e o log só com o código (nada do code, do secret ou da mensagem)", async () => {
    const { ctx, linhas, oauth } = contexto({ token: () => ({ status: 400, body: { error: "invalid_grant", message: "code TG-codigo-de-teste-2 expirado" } }) });
    const r = await M.trocarCodigo(ctx, { codigo: "TG-codigo-de-teste-2", redirect: "https://www.mercadopago.com", verificador: null, teste: false });
    expect(r).toEqual({ ok: false, motivo: "recusado", status: 400 });
    expect(oauth.idas[0].corpo).not.toHaveProperty("code_verifier");
    expect(oauth.idas[0].corpo?.test_token).toBe("false");
    expect(linhas).toEqual([{ nivel: "aviso", campos: { codigo: "mp_oauth_troca_falhou", schema: "staging", status: 400, externo: { mp_erro: "invalid_grant" } } }]);
    expect(JSON.stringify(linhas)).not.toMatch(/TG-codigo|client-secret|expirado/);
  });
  it("o MP fora (503), a rede caída ou o client não configurado → 'fora'; 2xx fora do formato → 'recusado'", async () => {
    const fora = contexto({ token: () => ({ status: 503, body: {} }) });
    expect(await M.trocarCodigo(fora.ctx, { codigo: "TG-x-12345678", redirect: "r", verificador: null, teste: true })).toEqual({ ok: false, motivo: "fora", status: 503 });
    const rede = contexto({ token: () => "rede" });
    expect(await M.trocarCodigo(rede.ctx, { codigo: "TG-x-12345678", redirect: "r", verificador: null, teste: true })).toEqual({ ok: false, motivo: "fora", status: 599 });
    const semClient = contexto({ oauth: null });
    expect(await M.trocarCodigo(semClient.ctx, { codigo: "TG-x-12345678", redirect: "r", verificador: null, teste: true })).toEqual({ ok: false, motivo: "fora", status: 599 });
    expect(semClient.oauth.idas).toHaveLength(0);
    const torto = contexto({ token: () => ({ status: 200, body: { access_token: "lixo" } }) });
    expect(await M.trocarCodigo(torto.ctx, { codigo: "TG-x-12345678", redirect: "r", verificador: null, teste: true })).toEqual({ ok: false, motivo: "recusado", status: 200 });
  });
});

// ───────────────────────── a renovação ─────────────────────────

describe("renovarConta (casos 3 a 7, 14)", () => {
  it("caso 3 — feliz: a trava → POST refresh_token → o UPDATE condicional (o refresh antigo) com o par NOVO cifrado e a trava solta", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const antiga = integ(db).mp_refresh_token;
    const { ctx, linhas, oauth } = contexto();
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("renovada");
    expect(db.pedidos[0]).toMatchObject({ op: "rpc", tabela: "mp_integracao_reservar", args: { p_conta: CONTA, p_segundos: 120 } });
    expect(oauth.idas.map((i) => i.corpo)).toEqual([{ client_id: CLIENT.clientId, client_secret: CLIENT.clientSecret, grant_type: "refresh_token", refresh_token: REFRESH_A }]);
    const [upd, ...resto] = gravacoes(db, "recebimento_integracoes");
    // revisão I-1: a gravação do par novo liga a conexão SÓ se ela está ativa ou em erro (a desconectada no meio do POST só ganha o par)
    expect(upd.filtros).toEqual([{ col: "conta_id", op: "eq", v: CONTA }, { col: "provedor", op: "eq", v: "mercadopago" }, { col: "mp_refresh_token", op: "eq", v: antiga },
      { col: "status", op: "in", v: ["ativa", "erro"] }]);
    expect(resto).toEqual([]);                                              // acertou: 1 gravação só
    expect(upd.valores).toMatchObject({ mp_renovando_ate: null, status: "ativa", mp_erro: null, mp_renovar_tentativas: 0, mp_renovar_proxima_em: null });
    const l = integ(db);
    expect(await decifrar(String(l.mp_access_token), ad("access"), CHAVE)).toBe(TOKEN_B);
    expect(await decifrar(String(l.mp_refresh_token), ad("refresh"), CHAVE)).toBe(REFRESH_B);
    expect(l).toMatchObject({ mp_renovando_ate: null, mp_public_key: "APP_USR-chave-publica-0002", status: "ativa" });
    perto(l.mp_renovado_em, 0);
    expect(linhas).toEqual([{ nivel: "info", campos: { codigo: "mp_conta_renovada", schema: "staging", ref: CONTA } }]);
    expect(JSON.stringify([db.pedidos, linhas])).not.toMatch(/APP_USR-acesso|TG-refresh/);
  });
  it("sem public_key na resposta, a guardada fica (o undefined não vai ao banco)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const { ctx } = contexto({ token: () => ({ status: 200, body: respostaDoToken({ public_key: undefined }) }) });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("renovada");
    expect(integ(db).mp_public_key).toBe("APP_USR-chave-publica-0001");
  });
  it("caso 4 — a trava ocupada → 'ocupada', sem ida ao MP e sem gravar", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_renovando_ate: new Date(Date.now() + 60_000).toISOString() })] });
    const { ctx, oauth } = contexto();
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("ocupada");
    expect(oauth.idas).toHaveLength(0);
    expect(gravacoes(db, "recebimento_integracoes")).toHaveLength(0);
  });
  it("caso 5 — invalid_grant com a linha já trocada por outra renovação → 'outra_renovou'; o status não muda e ninguém é avisado", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    const outra = await cifrar("TG-de-outra-renovacao-01", ad("refresh"), CHAVE);
    const { ctx } = contexto({ token: () => {
      integ(db).mp_refresh_token = outra;                                   // a outra renovação gravou no meio
      return { status: 400, body: { error: "invalid_grant" } };
    } });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("outra_renovou");
    expect(integ(db)).toMatchObject({ status: "ativa", mp_erro: null, mp_refresh_token: outra, mp_renovando_ate: null });
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
  });
  it("caso 6 — invalid_grant com a linha igual e o acesso valendo → mp_erro renovacao_recusada, próxima +24 h e 1 aviso ao dono", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_expira_em: new Date(Date.now() + 20 * DIA).toISOString() })],
      contas: [{ id: CONTA, dono_id: DONO }] });
    const { ctx, linhas } = contexto({ token: () => ({ status: 400, body: { error: "invalid_grant", message: "x" } }) });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("recusada");
    const l = integ(db);
    expect(l).toMatchObject({ status: "ativa", mp_erro: "renovacao_recusada", mp_renovando_ate: null });
    perto(l.mp_renovar_proxima_em, DIA);
    expect(db.tabelas.avisos).toHaveLength(1);
    expect(db.tabelas.avisos[0]).toMatchObject({ destino_user_id: DONO, tipo: "geral", link: "/painel/configuracoes/recebimento" });
    expect(String(db.tabelas.avisos[0].titulo)).toMatch(/^O Mercado Pago não renovou sozinho/);
    expect(linhas.find((x) => x.campos.codigo === "mp_renovacao_recusada")?.campos).toMatchObject({ status: 400, externo: { mp_erro: "invalid_grant" } });
  });
  it("caso 6 — com o acesso já vencido → status erro + 1 aviso (o marcarErro)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_expira_em: new Date(Date.now() - HORA).toISOString() })],
      contas: [{ id: CONTA, dono_id: DONO }] });
    const { ctx, linhas } = contexto({ token: () => ({ status: 400, body: { error: "invalid_grant" } }) });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("recusada");
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "renovacao_recusada", mp_renovando_ate: null });
    expect(db.tabelas.avisos).toHaveLength(1);
    expect(String(db.tabelas.avisos[0].titulo)).toMatch(/^Seu Mercado Pago desconectou do Physiq/);
    expect(linhas.find((x) => x.nivel === "erro")?.campos).toMatchObject({ codigo: "mp_conta_sem_acesso", ref: CONTA, resultado: "renovacao_recusada" });
  });
  it("caso 7 — o MP fora (503) → tentativas + 1, próxima em +1 h, o status igual e a trava solta", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const { ctx } = contexto({ token: () => ({ status: 503, body: {} }) });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("fora");
    const l = integ(db);
    expect(l).toMatchObject({ status: "ativa", mp_renovar_tentativas: 1, mp_renovando_ate: null, mp_erro: null });
    perto(l.mp_renovar_proxima_em, HORA);
    l.mp_renovar_tentativas = 3;
    expect(await M.renovarConta(db.cliente, contexto({ token: () => "rede" }).ctx, CONTA)).toBe("fora");
    expect(integ(db).mp_renovar_tentativas).toBe(4);
    perto(integ(db).mp_renovar_proxima_em, 8 * HORA);
  });
  it("sem refresh (a conexão de teste sem OAuth) → 'sem_refresh', sem ida ao MP, a trava solta", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_origem: "teste_sem_oauth", mp_refresh_token: null })] });
    const { ctx, oauth } = contexto();
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("sem_refresh");
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db).mp_renovando_ate).toBeNull();
  });
  it("caso 14 (MENOR 13) — 2xx fora do formato COM refresh → o refresh novo gravado (cifrado, condicional), mp_erro renovacao_formato e o log só com as CHAVES", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const antiga = integ(db).mp_refresh_token;
    const { ctx, linhas } = contexto({ token: () => ({ status: 200, body: { access_token: TOKEN_B, expires_in: 999_999_999, refresh_token: REFRESH_B, user_id: COLLECTOR } }) });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("recusada");
    const l = integ(db);
    expect(await decifrar(String(l.mp_refresh_token), ad("refresh"), CHAVE)).toBe(REFRESH_B);
    expect(await decifrar(String(l.mp_access_token), ad("access"), CHAVE)).toBe(TOKEN_A);
    expect(l).toMatchObject({ status: "ativa", mp_erro: "renovacao_formato", mp_renovando_ate: null });
    perto(l.mp_renovar_proxima_em, HORA);
    const upd = gravacoes(db, "recebimento_integracoes").find((p) => p.valores && "mp_refresh_token" in p.valores);
    expect(upd?.filtros).toContainEqual({ col: "mp_refresh_token", op: "eq", v: antiga });
    expect(linhas.find((x) => x.nivel === "erro")?.campos).toEqual({ codigo: "mp_renovacao_formato", schema: "staging", ref: CONTA, status: 200,
      msg: "chaves: access_token, expires_in, refresh_token, user_id" });
    expect(JSON.stringify(linhas)).not.toMatch(/APP_USR|TG-/);
  });
  it("caso 14 (MENOR 13) — 2xx fora do formato SEM refresh → 'recusada' e nada gravado além de soltar a trava", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const antes = { ...integ(db) };
    const { ctx } = contexto({ token: () => ({ status: 200, body: { ok: true } }) });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("recusada");
    expect(integ(db)).toEqual({ ...antes, mp_renovando_ate: null });
  });
  it("revisão I-1: desligada NO MEIO do POST (o gatilho contas_saiu_do_mp_conta) → o par novo é GRAVADO (o refresh girou no MP) e ela SEGUE desconectada", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    const desligadaEm = new Date().toISOString();
    const { ctx, linhas } = contexto({ token: () => {
      // o que o gatilho grava (status, desconectada_em e a trava) — o refresh da linha continua o mesmo
      Object.assign(integ(db), { status: "desconectada", desconectada_em: desligadaEm, mp_renovando_ate: null });
      return { status: 200, body: respostaDoToken() };
    } });
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("renovada");
    const l = integ(db);
    expect(l).toMatchObject({ status: "desconectada", desconectada_em: desligadaEm, mp_renovando_ate: null, mp_erro: null });
    expect(await decifrar(String(l.mp_access_token), ad("access"), CHAVE)).toBe(TOKEN_B);
    expect(await decifrar(String(l.mp_refresh_token), ad("refresh"), CHAVE)).toBe(REFRESH_B);
    perto(l.mp_expira_em, 180 * DIA);
    // nenhuma gravação que ACERTOU a linha desconectada levou status: só a do par
    expect(linhas).toEqual([{ nivel: "info", campos: { codigo: "mp_conta_renovada", schema: "staging", ref: CONTA, resultado: "desconectada" } }]);
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
    // a credencial da hora do uso (exige a ativa) não a devolve: a renovação não religa a conexão
    await expect(M.credencialDaConta(db.cliente, ctx, CONTA)).rejects.toMatchObject({ name: "MpContaSemAcesso", motivo: "desconectada" });
  });
  it("revisão I-1 (a): em ERRO e a renovação boa → volta a ativa (o mp_erro limpo); a gravação que liga é condicional (só ativa ou erro)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    const { ctx } = contexto();
    expect(await M.renovarConta(db.cliente, ctx, CONTA)).toBe("renovada");
    expect(integ(db)).toMatchObject({ status: "ativa", mp_erro: null, mp_renovando_ate: null });
    expect(await decifrar(String(integ(db).mp_access_token), ad("access"), CHAVE)).toBe(TOKEN_B);
    const liga = gravacoes(db, "recebimento_integracoes").filter((p) => p.valores?.status === "ativa");
    expect(liga.length).toBeGreaterThan(0);
    for (const p of liga) expect(p.filtros).toContainEqual({ col: "status", op: "in", v: ["ativa", "erro"] });
  });
});

// ───────────────────────── o 401 (revisão I2) ─────────────────────────

describe("mpContaFetch — o 401 confere o /users/me antes de renovar (caso 8, revisão I2)", () => {
  it("401 → /users/me com o MESMO token → 200 (o mesmo collector) → o 401 volta como veio: 0 renovação, a integração segue ativa", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const mp = rotasDoMp((ida) => (ida.caminho === "/users/me" ? { status: 200, body: { id: COLLECTOR } } : { status: 401, body: { message: "x" } }));
    const { ctx, oauth } = contexto();
    expect((await M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/123")).status).toBe(401);
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/123", TOKEN_A], ["/users/me", TOKEN_A]]);
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db).status).toBe("ativa");
  });
  it("401 → /users/me 401 → renova → refaz com o token NOVO → 200", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const mp = rotasDoMp((ida) => (ida.token === TOKEN_B ? { status: 200, body: { id: 123, status: "approved" } } : { status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    expect(await M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/123")).toEqual({ status: 200, body: { id: 123, status: "approved" } });
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/123", TOKEN_A], ["/users/me", TOKEN_A], ["/v1/payments/123", TOKEN_B]]);
    expect(oauth.idas).toHaveLength(1);
    expect(integ(db).status).toBe("ativa");
  });
  it("/users/me 401 com uma renovação há < 10 min → NÃO renova → marcarErro + MpContaSemAcesso('acesso_recusado')", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao({ mp_renovado_em: new Date(Date.now() - 5 * 60_000).toISOString() })],
      contas: [{ id: CONTA, dono_id: DONO }] });
    rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/123")).rejects.toMatchObject({ name: "MpContaSemAcesso", motivo: "acesso_recusado" });
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "acesso_recusado" });
    expect(db.tabelas.avisos).toHaveLength(1);
  });
  it("401 de novo depois de renovar → marcarErro + MpContaSemAcesso", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    const mp = rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/123")).rejects.toBeInstanceOf(M.MpContaSemAcesso);
    expect(oauth.idas).toHaveLength(1);
    expect(mp.idas.map((i) => i.token)).toEqual([TOKEN_A, TOKEN_A, TOKEN_B]);
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "acesso_recusado" });
  });
  it("{ renovar: false } (o aviso do MP — MENOR 34) → MpContaSemAcesso('token_recusado') sem renovar e sem marcarErro", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1", {}, { renovar: false })).rejects.toMatchObject({ motivo: "token_recusado" });
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db).status).toBe("ativa");
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
  });
  it("/users/me 5xx ou sem resposta → MpIndisponivel (sem decisão: ninguém marca nada)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    rotasDoMp((ida) => (ida.caminho === "/users/me" ? { status: 503, body: {} } : { status: 401, body: {} }));
    const { ctx, oauth } = contexto({ prazo: prazoDe(2_500) });
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toMatchObject({ name: "MpIndisponivel", status: 503 });
    rotasDoMp((ida) => (ida.caminho === "/users/me" ? "rede" : { status: 401, body: {} }));
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toBeInstanceOf(C.MpIndisponivel);
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db).status).toBe("ativa");
  });
  it("/users/me 200 de OUTRO usuário do MP → marcarErro('conta_trocada') (não confia no token)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    rotasDoMp((ida) => (ida.caminho === "/users/me" ? { status: 200, body: { id: 999 } } : { status: 401, body: {} }));
    const { ctx } = contexto();
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toMatchObject({ motivo: "conta_trocada" });
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "conta_trocada" });
  });
  it("MENOR 12: sem 10 s de prazo para girar o refresh → MpIndisponivel(599), sem renovar e sem marcar erro", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx, oauth } = contexto({ prazo: prazoDe(5_000) });
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toMatchObject({ name: "MpIndisponivel", status: 599 });
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db).status).toBe("ativa");
  });
  it("várias chamadas com a MESMA credencial: a 1ª renova e a 2ª já vai com o token novo (1 renovação só, nada de erro)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    const mp = rotasDoMp((ida) => (ida.token === TOKEN_B ? { status: 200, body: { id: 1 } } : { status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    const cred = credConta();
    expect((await M.mpContaFetch(db.cliente, ctx, cred, "/v1/payments/1")).status).toBe(200);
    expect((await M.mpContaFetch(db.cliente, ctx, cred, "/v1/payments/2")).status).toBe(200);
    expect(cred.token).toBe(TOKEN_B);
    expect(oauth.idas).toHaveLength(1);
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/1", TOKEN_A], ["/users/me", TOKEN_A], ["/v1/payments/1", TOKEN_B],
      ["/v1/payments/2", TOKEN_B]]);
    expect(integ(db).status).toBe("ativa");
  });
  it("outra credencial da conta lida ANTES de uma renovação recente: o 401 do token velho tenta o guardado e passa (sem renovar de novo nem marcar erro)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    const mp = rotasDoMp((ida) => (ida.token === TOKEN_B ? { status: 200, body: { id: 1 } } : { status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    const velha = credConta();
    expect((await M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).status).toBe(200);   // outra chamada renovou
    expect((await M.mpContaFetch(db.cliente, ctx, velha, "/v1/payments/2")).status).toBe(200);
    expect(oauth.idas).toHaveLength(1);
    expect(mp.idas.slice(3).map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/2", TOKEN_A], ["/users/me", TOKEN_A], ["/v1/payments/2", TOKEN_B]]);
    expect(integ(db).status).toBe("ativa");
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
  });
  it("o que não é 401 passa direto (sem /users/me)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const mp = rotasDoMp(() => ({ status: 404, body: { message: "not found" } }));
    const { ctx } = contexto();
    expect((await M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/9")).status).toBe(404);
    expect(mp.idas).toHaveLength(1);
  });

  // revisão M-4: a trava ocupada (outra renovação no meio do POST) — espera, relê o token GUARDADO e só o token NOVO decide
  const ocupada = async () => criarDb({ recebimento_integracoes: [await integracao({ mp_renovando_ate: new Date(Date.now() + 60_000).toISOString() })],
    contas: [{ id: CONTA, dono_id: DONO }] });
  /** a outra renovação grava o par novo (o token B) daqui a `ms` — no meio da espera de 1,5 s, ou depois dela */
  const outraGrava = (db: DbFalso, ms: number) => {
    const feito = cifrar(TOKEN_B, ad("access"), CHAVE).then((cifra) => new Promise<void>((ok) => setTimeout(() => {
      Object.assign(integ(db), { mp_access_token: cifra, mp_renovado_em: new Date().toISOString(), mp_renovando_ate: null });
      ok();
    }, ms)));
    return feito;
  };
  it("revisão M-4: 'ocupada' e a outra renovação ainda SEM gravar depois da espera → MpIndisponivel(599): nem erro nem aviso (o token velho não decide)", async () => {
    const db = await ocupada();
    const mp = rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toMatchObject({ name: "MpIndisponivel", status: 599 });
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db)).toMatchObject({ status: "ativa", mp_erro: null });
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/1", TOKEN_A], ["/users/me", TOKEN_A]]);   // o mesmo token não é refeito
  }, 10_000);
  it("revisão M-4: 'ocupada' e o token NOVO gravado durante a espera → refaz com ele: 200, sem erro nem aviso", async () => {
    const db = await ocupada();
    const mp = rotasDoMp((ida) => (ida.token === TOKEN_B ? { status: 200, body: { id: 1 } } : { status: 401, body: {} }));
    const { ctx, oauth } = contexto();
    const gravou = outraGrava(db, 300);
    const cred = credConta();
    expect((await M.mpContaFetch(db.cliente, ctx, cred, "/v1/payments/1")).status).toBe(200);
    await gravou;
    expect(cred.token).toBe(TOKEN_B);
    expect(oauth.idas).toHaveLength(0);
    expect(integ(db)).toMatchObject({ status: "ativa", mp_erro: null });
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/1", TOKEN_A], ["/users/me", TOKEN_A], ["/v1/payments/1", TOKEN_B]]);
  }, 10_000);
  it("revisão M-4: 'ocupada' e o token NOVO também recusado → aí sim erro acesso_recusado + 1 aviso ao dono", async () => {
    const db = await ocupada();
    const mp = rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx } = contexto();
    const gravou = outraGrava(db, 300);
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toMatchObject({ name: "MpContaSemAcesso", motivo: "acesso_recusado" });
    await gravou;
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "acesso_recusado" });
    expect(db.tabelas.avisos).toHaveLength(1);
    expect(mp.idas.map((i) => i.token)).toEqual([TOKEN_A, TOKEN_A, TOKEN_B]);
  }, 10_000);
  it("revisão M-4: 'ocupada' porque saiu de ativa (desligada no meio) → MpContaSemAcesso('desconectada'), sem marcar nada", async () => {
    const db = await ocupada();
    integ(db).status = "desconectada";
    integ(db).desconectada_em = new Date().toISOString();
    rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx } = contexto();
    await expect(M.mpContaFetch(db.cliente, ctx, credConta(), "/v1/payments/1")).rejects.toMatchObject({ name: "MpContaSemAcesso", motivo: "desconectada" });
    expect(integ(db)).toMatchObject({ status: "desconectada", mp_erro: null });
    expect(db.tabelas.avisos ?? []).toHaveLength(0);
  }, 10_000);
});

describe("buscarNaConta e chamarMp", () => {
  it("buscarNaConta: 200 do modo do schema → o recurso; de outro modo, 404 ou o 401 alheio (I2) → null; MP fora → MpIndisponivel", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const respostas: Record<string, RespostaFalsa> = {
      "/v1/payments/1": { status: 200, body: { id: 1, live_mode: false } },
      "/v1/payments/2": { status: 200, body: { id: 2, live_mode: true } },          // de produção, lido no staging: não vale
      "/v1/payments/3": { status: 404, body: {} },
      "/v1/payments/4": { status: 401, body: {} },
      "/users/me": { status: 200, body: { id: COLLECTOR } },
      "/v1/payments/5": { status: 503, body: {} },
    };
    rotasDoMp((ida) => respostas[ida.caminho] ?? { status: 404 });
    const { ctx } = contexto({ prazo: prazoDe(2_500) });
    expect(await M.buscarNaConta(db.cliente, ctx, credConta(), "/v1/payments/1")).toEqual({ id: 1, live_mode: false });
    expect(await M.buscarNaConta(db.cliente, ctx, credConta(), "/v1/payments/2")).toBeNull();
    expect(await M.buscarNaConta(db.cliente, ctx, credConta(), "/v1/payments/3")).toBeNull();
    expect(await M.buscarNaConta(db.cliente, ctx, credConta(), "/v1/payments/4")).toBeNull();
    await expect(M.buscarNaConta(db.cliente, ctx, credConta(), "/v1/payments/5")).rejects.toBeInstanceOf(C.MpIndisponivel);
    expect(integ(db).status).toBe("ativa");
  });
  it("chamarMp: a do Physiq pelo mpFetch (o token do ambiente, o 401 volta como veio); a da conta pelo mpContaFetch (o 401 confere o /users/me)", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST }));
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const mp = rotasDoMp((ida) => (ida.caminho === "/users/me" ? { status: 200, body: { id: COLLECTOR } } : { status: 401, body: {} }));
    const { ctx } = contexto();
    expect((await M.chamarMp(db.cliente, ctx, "test", "/v1/payments/1")).status).toBe(401);
    expect((await M.chamarMp(db.cliente, ctx, credConta(), "/v1/payments/1")).status).toBe(401);
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/v1/payments/1", PHYSIQ_TEST], ["/v1/payments/1", TOKEN_A], ["/users/me", TOKEN_A]]);
  });
});

// ───────────────────────── marcar erro e avisar o dono ─────────────────────────

describe("marcarErro e avisarDonoDaConexao (caso 9)", () => {
  it("marcarErro 2× no mesmo dia → 1 aviso só (o mp_avisado_em condicional); passadas 24 h, avisa de novo", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], contas: [{ id: CONTA, dono_id: DONO }] });
    const { ctx, linhas } = contexto();
    expect(await M.marcarErro(db.cliente, ctx, CONTA, "acesso_recusado")).toBe(true);
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "acesso_recusado", mp_renovando_ate: null });
    expect(await M.marcarErro(db.cliente, ctx, CONTA, "acesso_recusado")).toBe(false);      // já em erro: nada muda, nem log
    integ(db).status = "ativa";                                                             // voltou no mesmo dia…
    expect(await M.marcarErro(db.cliente, ctx, CONTA, "conta_trocada")).toBe(true);         // …e caiu de novo:
    expect(db.tabelas.avisos).toHaveLength(1);                                              // o dono já foi avisado hoje
    expect(db.tabelas.avisos[0]).toMatchObject({ destino_user_id: DONO, tipo: "geral", link: "/painel/configuracoes/recebimento" });
    expect(linhas.filter((x) => x.nivel === "erro" && x.campos.codigo === "mp_conta_sem_acesso").map((x) => x.campos.resultado))
      .toEqual(["acesso_recusado", "conta_trocada"]);
    integ(db).mp_avisado_em = new Date(Date.now() - 25 * HORA).toISOString();
    expect(await M.avisarDonoDaConexao(db.cliente, ctx, CONTA, "Texto de teste")).toBe(true);
    expect(await M.avisarDonoDaConexao(db.cliente, ctx, CONTA, "Texto de teste")).toBe(false);
    expect(db.tabelas.avisos).toHaveLength(2);
  });
});

// ───────────────────────── a credencial de uma cobrança / assinatura que já existe ─────────────────────────

describe("credencialDaCobranca e credencialDaAssinatura (caso 10; escrita × leitura — I3)", () => {
  const semContexto = () => vi.fn((): ContextoMpConta => {
    throw new Error("o contexto (MP_TOKENS_CHAVE) não devia ser pedido");
  });
  it("collector nulo → a do Physiq, sem tocar no banco nem pedir o contexto (o MP do Physiq não precisa da MP_TOKENS_CHAVE)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const ctx = semContexto();
    expect(await M.credencialDaCobranca(db.cliente, ctx, { conta_id: CONTA, mp_collector_id: null }, "test")).toBe("test");
    expect(await M.credencialDaCobranca(db.cliente, ctx, { conta_id: CONTA }, "prod", { escrita: true })).toBe("prod");
    expect(await M.credencialDaAssinatura(db.cliente, ctx, { paciente_id: P1, conta_id: null, mp_collector_id: null }, "test", { leitura: true })).toBe("test");
    expect(ctx).not.toHaveBeenCalled();
    expect(db.pedidos).toHaveLength(0);
  });
  it("o collector da integração → a da conta (também em texto); outro collector → null (outra conta do MP)", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()] });
    const { ctx } = contexto();
    expect(await M.credencialDaCobranca(db.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test")).toEqual(credConta());
    expect(await M.credencialDaCobranca(db.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: "777" }, "test", { escrita: true })).toEqual(credConta());
    expect(await M.credencialDaCobranca(db.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: 888 }, "test", { escrita: true })).toBeNull();
    expect(await M.credencialDaCobranca(db.cliente, () => ctx, { conta_id: null, mp_collector_id: COLLECTOR }, "test")).toBeNull();
  });
  it("escrita: desconectada → null (decisão 10: depois de desligar, só leitura); em erro → MpContaSemAcesso (quem chama: mp_conta_indisponivel)", async () => {
    const desligada = criarDb({ recebimento_integracoes: [await integracao({ status: "desconectada", desconectada_em: new Date().toISOString() })] });
    const { ctx } = contexto();
    expect(await M.credencialDaCobranca(desligada.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test", { escrita: true })).toBeNull();
    const caida = criarDb({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    await expect(M.credencialDaCobranca(caida.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test", { escrita: true }))
      .rejects.toMatchObject({ name: "MpContaSemAcesso", motivo: "erro" });
  });
  it("leitura (I3): em erro ou sem token → null (não confere: quem chama devolve a linha); desconectada com token → a credencial, SEM renovar", async () => {
    const { ctx, oauth } = contexto();
    const caida = criarDb({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    expect(await M.credencialDaCobranca(caida.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test", { leitura: true })).toBeNull();
    const semToken = criarDb({ recebimento_integracoes: [await integracao({ status: "desconectada", mp_access_token: null, mp_refresh_token: null })] });
    expect(await M.credencialDaCobranca(semToken.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test", { leitura: true })).toBeNull();
    const desligada = criarDb({ recebimento_integracoes: [await integracao({ status: "desconectada", desconectada_em: new Date().toISOString(),
      mp_expira_em: new Date(Date.now() + 12 * HORA).toISOString() })] });
    expect(await M.credencialDaCobranca(desligada.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test", { leitura: true })).toEqual(credConta());
    expect(oauth.idas).toHaveLength(0);
    const ativa = criarDb({ recebimento_integracoes: [await integracao()] });
    expect(await M.credencialDaCobranca(ativa.cliente, () => ctx, { conta_id: CONTA, mp_collector_id: COLLECTOR }, "test", { leitura: true })).toEqual(credConta());
  });
  it("credencialDaAssinatura: sem conta_id na assinatura (a antiga), a conta da matrícula", async () => {
    const db = criarDb({ recebimento_integracoes: [await integracao()], pacientes: [{ id: P3, conta_id: CONTA }] });
    const { ctx } = contexto();
    expect(await M.credencialDaAssinatura(db.cliente, () => ctx, { paciente_id: P3, conta_id: null, mp_collector_id: COLLECTOR }, "test", { escrita: true }))
      .toEqual(credConta());
    expect(await M.credencialDaAssinatura(db.cliente, () => ctx, { paciente_id: P2, conta_id: null, mp_collector_id: COLLECTOR }, "test", { escrita: true }))
      .toBeNull();
  });
});

// ───────────────────────── cancelar as automáticas, cada uma com a credencial dela ─────────────────────────

describe("cancelarAssinaturasPorCredencial (caso 11 e MENOR 11)", () => {
  it("2 alunos no MP do Physiq + 1 na conta → cada grupo com a credencial certa e o filtro do collector", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST }));
    const mp = rotasDoMp(cancelou);
    const db = criarDb({ recebimento_integracoes: [await integracao()], aluno_assinaturas: assinaturas() });
    const { ctx } = contexto();
    const r = await M.cancelarAssinaturasPorCredencial(db.cliente, { schema: "staging", log: ctx.log, prazo: ctx.prazo }, () => ctx, "test",
      [P1, P2, P3], "personal_desconectou_o_mp");
    expect(r).toEqual({ canceladas: 3, falhas: 0, semAcesso: 0 });
    expect(mp.idas.map((i) => [i.metodo, i.caminho, i.token])).toEqual([
      ["PUT", "/preapproval/pre-1", PHYSIQ_TEST], ["PUT", "/preapproval/pre-2", PHYSIQ_TEST], ["PUT", "/preapproval/pre-3", TOKEN_A]]);
    const leituras = db.pedidos.filter((p) => p.tabela === "aluno_assinaturas" && p.op === "select" && p.colunas?.startsWith("id, paciente_id"));
    expect(leituras.map((p) => p.filtros.find((f) => "col" in f && f.col === "mp_collector_id"))).toEqual([
      { col: "mp_collector_id", op: "is", v: null }, { col: "mp_collector_id", op: "eq", v: COLLECTOR }]);
    expect(db.tabelas.aluno_assinaturas.map((a) => a.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(db.tabelas.aluno_assinaturas[2].payload).toMatchObject({ motivo_cancelamento: "personal_desconectou_o_mp" });
  });
  it("a conta desconectada → semAcesso: 1 e nenhuma ida ao MP para ela", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST }));
    const mp = rotasDoMp(cancelou);
    const db = criarDb({ recebimento_integracoes: [await integracao({ status: "desconectada" })], aluno_assinaturas: assinaturas() });
    const { ctx } = contexto();
    const r = await M.cancelarAssinaturasPorCredencial(db.cliente, { schema: "staging", log: ctx.log, prazo: ctx.prazo }, () => ctx, "test", [P1, P2, P3], "m");
    expect(r).toEqual({ canceladas: 2, falhas: 0, semAcesso: 1 });
    expect(mp.idas.every((i) => i.token === PHYSIQ_TEST)).toBe(true);
    expect(db.tabelas.aluno_assinaturas[2].status).toBe("authorized");
  });
  it("MENOR 11: o MP fora num grupo → falhas; a conta em erro noutro → semAcesso; a função NUNCA lança por causa do MP", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST }));
    const mp = rotasDoMp(() => ({ status: 503, body: { message: "indisponivel" } }));
    const db = criarDb({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })], aluno_assinaturas: assinaturas() });
    const { ctx } = contexto({ prazo: prazoDe(2_500) });
    const r = await M.cancelarAssinaturasPorCredencial(db.cliente, { schema: "staging", log: ctx.log, prazo: ctx.prazo }, () => ctx, "test", [P1, P2, P3], "m");
    expect(r).toEqual({ canceladas: 0, falhas: 2, semAcesso: 1 });
    expect(mp.idas.every((i) => i.token === PHYSIQ_TEST)).toBe(true);
    expect(db.tabelas.aluno_assinaturas.map((a) => a.status)).toEqual(["authorized", "pending", "authorized"]);
  });
  it("sem a MP_TOKENS_CHAVE (o contexto lança MpContaSemAcesso) → a conta vira semAcesso e o MP do Physiq segue", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST }));
    rotasDoMp(cancelou);
    const db = criarDb({ recebimento_integracoes: [await integracao()], aluno_assinaturas: assinaturas() });
    const { log } = logFalso();
    const semChave = () => {
      throw new M.MpContaSemAcesso("-", "nao_configurado");
    };
    const r = await M.cancelarAssinaturasPorCredencial(db.cliente, { schema: "staging", log, prazo: prazoDe(5_000) }, semChave, "test", [P1, P2, P3], "m");
    expect(r).toEqual({ canceladas: 2, falhas: 0, semAcesso: 1 });
  });
  it("erro do banco LANÇA (500 antes de mudar qualquer coisa); a lista vazia não lê nada", async () => {
    const quebrado = criarDb({ aluno_assinaturas: assinaturas() }, { responder: (p) => (p.tabela === "aluno_assinaturas"
      ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } : undefined) });
    const { ctx } = contexto();
    await expect(M.cancelarAssinaturasPorCredencial(quebrado.cliente, { schema: "staging", log: ctx.log, prazo: ctx.prazo }, () => ctx, "test", [P1], "m"))
      .rejects.toMatchObject({ code: "57014" });
    const db = criarDb({});
    expect(await M.cancelarAssinaturasPorCredencial(db.cliente, { schema: "staging", log: ctx.log, prazo: ctx.prazo }, () => ctx, "test", [], "m"))
      .toEqual({ canceladas: 0, falhas: 0, semAcesso: 0 });
    expect(db.pedidos).toHaveLength(0);
  });
});

// ───────────────────────── C2: a regra da coluna nova ─────────────────────────

describe("C2 — a regra da coluna nova (caso 12)", () => {
  it("sem a W2 no schema: as colunas de antes, comCollector vazio e o cancelamento de antes (1 leitura sem a coluna, sem pedir o contexto)", async () => {
    vi.stubGlobal("Deno", denoFalso({ MP_ACCESS_TOKEN_PROD: PHYSIQ_PROD }));
    const mp = rotasDoMp(cancelou);
    const db = criarDb({ aluno_assinaturas: assinaturas().map(({ mp_collector_id: _fora, ...a }) => a) }, { semW2: true });
    const ctx = vi.fn((): ContextoMpConta => {
      throw new Error("sem a W2 o contexto não é pedido");
    });
    expect(await M.schemaTemW2(db.cliente, "public")).toBe(false);
    expect(await M.colunasAssinatura(db.cliente, "public")).toBe(M.COLUNAS_ASSINATURA);
    expect(M.COLUNAS_ASSINATURA).not.toContain("mp_collector_id");
    expect(await M.comCollector(db.cliente, "public", 123)).toEqual({});
    const { log } = logFalso();
    const r = await M.cancelarAssinaturasPorCredencial(db.cliente, { schema: "public", log, prazo: prazoDe(5_000) }, ctx, "prod", [P1, P2, P3], "m");
    expect(r).toEqual({ canceladas: 3, falhas: 0, semAcesso: 0 });
    expect(ctx).not.toHaveBeenCalled();
    expect(db.pedidos.filter((p) => p.tabela === "aluno_assinaturas" && p.op === "select")).toHaveLength(1);
    expect(JSON.stringify(db.pedidos)).not.toContain("mp_collector_id");
    expect(mp.idas.map((i) => i.token)).toEqual([PHYSIQ_PROD, PHYSIQ_PROD, PHYSIQ_PROD]);
  });
  it("sem a W2, a cobrança da automática nasce SEM a coluna (o insert com ela daria PGRST204 depois do MP já ter cobrado)", async () => {
    const db = criarDb({ cobrancas: [] }, { semW2: true });
    const { log } = logFalso();
    const colunasW2 = await M.comCollector(db.cliente, "public", COLLECTOR);
    const chamar = async <T>(caminho: string): Promise<RespostaMp<T>> => ({ status: 200, body: (caminho.startsWith("/authorized_payments")
      ? { results: [{ payment: { id: 501 } }] }
      : { id: 501, status: "approved", transaction_amount: 80, date_approved: "2026-10-05T12:00:00.000-03:00", collector_id: 1 }) as T });
    expect(await M.registrarCobrancasDaAutomatica(db.cliente, "public", log, chamar, matricula(), { mp_preapproval_id: "pre-9", status: "authorized" }, colunasW2)).toBe(1);
    expect(db.tabelas.cobrancas[0]).toMatchObject({ mp_payment_id: "501", status: "paga" });
    expect(db.tabelas.cobrancas[0]).not.toHaveProperty("mp_collector_id");
  });
  it("com a W2: a coluna entra no select e no insert; comCollector(…, null) = {}; collectorDe", async () => {
    const db = criarDb({});
    expect(await M.colunasAssinatura(db.cliente, "staging")).toBe(`${M.COLUNAS_ASSINATURA}, mp_collector_id`);
    expect(await M.comCollector(db.cliente, "staging", 123)).toEqual({ mp_collector_id: 123 });
    expect(await M.comCollector(db.cliente, "staging", null)).toEqual({});
    expect(await M.comCollector(db.cliente, "staging", undefined)).toEqual({});
    expect(M.collectorDe("test")).toBeNull();
    expect(M.collectorDe(credConta())).toBe(COLLECTOR);
  });
  it("schemaTemW2 guarda a resposta por 60 s (1 ida ao banco por schema); erro que não é 'tabela ausente' lança", async () => {
    const db = criarDb({});
    expect(await M.schemaTemW2(db.cliente, "staging")).toBe(true);
    expect(await M.schemaTemW2(db.cliente, "staging")).toBe(true);
    expect(db.pedidos.filter((p) => p.tabela === "mp_conexoes")).toHaveLength(1);
    const ausente = criarDb({}, { responder: (p) => (p.tabela === "mp_conexoes"
      ? { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.mp_conexoes' in the schema cache" } } : undefined) });
    expect(await M.schemaTemW2(ausente.cliente, "public")).toBe(false);
    vi.resetModules();
    const novo: ModMpConta = await import("../../supabase-principal/functions/_shared/mp-conta");
    const caiu = criarDb({}, { responder: (p) => (p.tabela === "mp_conexoes"
      ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } : undefined) });
    await expect(novo.schemaTemW2(caiu.cliente, "public")).rejects.toMatchObject({ code: "57014" });
  });
  it("revisão M-8: só 'a tabela (ou a coluna) não existe' desliga a W2 — o 'permission denied for relation …' (um grant que faltou) LANÇA", async () => {
    const com = async (erro: ErroDb) => {
      vi.resetModules();                                                    // a memória de 60 s: cada erro num módulo novo
      const mod: ModMpConta = await import("../../supabase-principal/functions/_shared/mp-conta");
      const db = criarDb({}, { responder: (p) => (p.tabela === "mp_conexoes" ? { data: null, error: erro } : undefined) });
      return await mod.schemaTemW2(db.cliente, "public");
    };
    await expect(com({ code: "42501", message: "permission denied for relation mp_conexoes" })).rejects.toMatchObject({ code: "42501" });
    await expect(com({ code: "42501", message: "permission denied for table mp_conexoes" })).rejects.toMatchObject({ code: "42501" });
    await expect(com({ code: "", message: "permission denied for relation mp_conexoes" })).rejects.toMatchObject({ code: "" });
    expect(await com({ code: "42P01", message: 'relation "public.mp_conexoes" does not exist' })).toBe(false);
    expect(await com({ code: "42703", message: "column mp_conexoes.id does not exist" })).toBe(false);
    expect(await com({ code: "PGRST205", message: "Could not find the table 'public.mp_conexoes' in the schema cache" })).toBe(false);
    expect(await com({ code: "", message: 'relation "staging.mp_conexoes" does not exist' })).toBe(false);
  });
});

// ───────────────────────── I1: a rede da cobrança de cada mês da automática ─────────────────────────

describe("registrarCobrancasDaAutomatica (caso 15, revisão I1)", () => {
  const rotas = (extra: Record<string, { status: number; body?: unknown }> = {}): Record<string, { status: number; body?: unknown }> => ({
    [BUSCA_PRE9]: { status: 200, body: { results: [{ payment: { id: 101 } }, { payment: { id: 102 } }, { payment: { id: 103 } }] } },
    "/v1/payments/102": { status: 200, body: { id: 102, status: "approved", transaction_amount: 120, date_approved: "2026-10-05T12:00:00.000-03:00",
      payment_method_id: "visa", collector_id: COLLECTOR } },
    "/v1/payments/103": { status: 200, body: { id: 103, status: "pending", transaction_amount: 120, collector_id: COLLECTOR } },
    ...extra,
  });
  const chamarDe = (r: Record<string, { status: number; body?: unknown }>, idas: string[]) => async <T>(caminho: string): Promise<RespostaMp<T>> => {
    idas.push(caminho);
    const x = r[caminho] ?? { status: 404 };
    return { status: x.status, body: (x.body ?? null) as T | null };
  };
  it("a busca traz 3, 1 já em cobrancas → 2 GET; só o approved vira cobrança (preapproval, origem assinatura e o collector do comCollector)", async () => {
    const db = criarDb({ cobrancas: [{ id: "co-1", mp_payment_id: "101", status: "paga" }] });
    const { log, linhas } = logFalso();
    const idas: string[] = [];
    const colunasW2 = await M.comCollector(db.cliente, "staging", COLLECTOR);
    const n = await M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe(rotas(), idas), matricula(),
      { mp_preapproval_id: "pre-9", status: "authorized" }, colunasW2);
    expect(n).toBe(1);
    expect(idas).toEqual([BUSCA_PRE9, "/v1/payments/102", "/v1/payments/103"]);
    expect(db.tabelas.cobrancas).toHaveLength(2);
    expect(db.tabelas.cobrancas[1]).toMatchObject({ paciente_id: P1, conta_id: CONTA, nutricionista_id: DONO, mp_payment_id: "102",
      mp_preapproval_id: "pre-9", origem: "assinatura", mp_collector_id: COLLECTOR, forma: "mp", metodo: "cartao", status: "paga", valor: 120 });
    expect(db.tabelas.avisos).toHaveLength(1);                                // o aluno: "Pagamento confirmado"
    expect(linhas.find((x) => x.campos.codigo === "mp_automatica_rede")?.campos).toMatchObject({ ref: "pre-9", n: 1 });
  });
  it("o aprovado que caiu em OUTRA conta do MP não entra; no MP do Physiq (colunasW2 vazio) não há conferência de collector", async () => {
    const outra = rotas({ "/v1/payments/102": { status: 200, body: { id: 102, status: "approved", transaction_amount: 120, collector_id: 999 } } });
    const db = criarDb({ cobrancas: [{ id: "co-1", mp_payment_id: "101", status: "paga" }] });
    const { log } = logFalso();
    expect(await M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe(outra, []), matricula(),
      { mp_preapproval_id: "pre-9", status: "authorized" }, { mp_collector_id: COLLECTOR })).toBe(0);
    expect(db.tabelas.cobrancas).toHaveLength(1);
    expect(await M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe(outra, []), matricula(),
      { mp_preapproval_id: "pre-9", status: "authorized" }, {})).toBe(1);
    expect(db.tabelas.cobrancas[1]).not.toHaveProperty("mp_collector_id");
  });
  it("a busca 5xx (ou o GET do pagamento) → MpIndisponivel; a assinatura que não está authorized (ou sem id) → nenhuma busca", async () => {
    const db = criarDb({ cobrancas: [] });
    const { log } = logFalso();
    await expect(M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe({ [BUSCA_PRE9]: { status: 503 } }, []), matricula(),
      { mp_preapproval_id: "pre-9", status: "authorized" }, {})).rejects.toBeInstanceOf(C.MpIndisponivel);
    await expect(M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe(rotas({ "/v1/payments/101": { status: 500 } }), []), matricula(),
      { mp_preapproval_id: "pre-9", status: "authorized" }, {})).rejects.toBeInstanceOf(C.MpIndisponivel);
    const idas: string[] = [];
    expect(await M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe(rotas(), idas), matricula(),
      { mp_preapproval_id: "pre-9", status: "pending" }, {})).toBe(0);
    expect(await M.registrarCobrancasDaAutomatica(db.cliente, "staging", log, chamarDe(rotas(), idas), matricula(),
      { mp_preapproval_id: null, status: "authorized" }, {})).toBe(0);
    expect(idas).toEqual([]);
  });
});

// ───────────────────────── o diário, os pacientes com automática, o client do ambiente ─────────────────────────

describe("conferirConta — o diário (MENOR 27 e I1)", () => {
  const cenario = async (o: Linha = {}) => criarDb({
    recebimento_integracoes: [await integracao(o)],
    contas: [{ id: CONTA, dono_id: DONO }],
    pacientes: [{ ...matricula() }],
    aluno_assinaturas: [
      { id: "as-9", paciente_id: P1, conta_id: CONTA, mp_collector_id: COLLECTOR, mp_preapproval_id: "pre-9", status: "authorized", valor: 120,
        proximo_vencimento: null, payload: {}, criado_em: "2026-10-01T00:00:00.000Z", pacientes: { conta_id: CONTA } },
      // do MP do Physiq (collector nulo) e de outra conta do Physiq: não entram
      { id: "as-8", paciente_id: P2, conta_id: CONTA, mp_collector_id: null, mp_preapproval_id: "pre-8", status: "authorized", valor: 90,
        proximo_vencimento: null, payload: {}, criado_em: "2026-10-01T00:00:00.000Z", pacientes: { conta_id: CONTA } },
      { id: "as-7", paciente_id: P3, conta_id: "outra", mp_collector_id: COLLECTOR, mp_preapproval_id: "pre-7", status: "authorized", valor: 90,
        proximo_vencimento: null, payload: {}, criado_em: "2026-10-01T00:00:00.000Z", pacientes: { conta_id: "outra" } },
    ],
    cobrancas: [],
  });
  it("o acesso vale (/users/me 200): busca as cobranças das automáticas DESTA conta com o token dela e grava o mp_conferido_em", async () => {
    const db = await cenario();
    const mp = rotasDoMp((ida) => ({
      "/users/me": { status: 200, body: { id: COLLECTOR } },
      [BUSCA_PRE9]: { status: 200, body: { results: [{ payment: { id: 102 } }] } },
      "/v1/payments/102": { status: 200, body: { id: 102, status: "approved", transaction_amount: 120, collector_id: COLLECTOR,
        date_approved: "2026-10-05T12:00:00.000-03:00" } },
    } as Record<string, RespostaFalsa>)[ida.caminho] ?? { status: 404 });
    const { ctx } = contexto();
    expect(await M.conferirConta(db.cliente, ctx, { conta_id: CONTA, mp_user_id: COLLECTOR })).toEqual({ resultado: "ok", cobrancas: 1 });
    expect(mp.idas.map((i) => [i.caminho, i.token])).toEqual([["/users/me", TOKEN_A], [BUSCA_PRE9, TOKEN_A], ["/v1/payments/102", TOKEN_A]]);
    expect(db.tabelas.cobrancas[0]).toMatchObject({ mp_payment_id: "102", mp_collector_id: COLLECTOR, mp_preapproval_id: "pre-9", status: "paga" });
    perto(integ(db).mp_conferido_em, 0);
  });
  it("o MP fora → 'fora' e o mp_conferido_em NÃO é gravado (a próxima hora tenta de novo)", async () => {
    const db = await cenario();
    rotasDoMp(() => ({ status: 503, body: {} }));
    const { ctx } = contexto({ prazo: prazoDe(2_500) });
    expect(await M.conferirConta(db.cliente, ctx, { conta_id: CONTA, mp_user_id: COLLECTOR })).toEqual({ resultado: "fora", cobrancas: 0 });
    expect(integ(db)).toMatchObject({ mp_conferido_em: null, status: "ativa" });
  });
  it("o acesso tirado no MP (401 e a renovação recusada) → marcarErro('acesso_recusado'), 1 aviso e 'sem_acesso'", async () => {
    const db = await cenario();
    rotasDoMp(() => ({ status: 401, body: {} }));
    const { ctx } = contexto({ token: () => ({ status: 400, body: { error: "invalid_grant" } }) });
    expect(await M.conferirConta(db.cliente, ctx, { conta_id: CONTA, mp_user_id: COLLECTOR })).toEqual({ resultado: "sem_acesso", cobrancas: 0 });
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "acesso_recusado", mp_conferido_em: null });
    expect(db.tabelas.avisos).toHaveLength(1);
  });
  it("o /users/me de OUTRO usuário do MP → marcarErro('conta_trocada') e 'sem_acesso'", async () => {
    const db = await cenario();
    rotasDoMp(() => ({ status: 200, body: { id: 999 } }));
    const { ctx } = contexto();
    expect(await M.conferirConta(db.cliente, ctx, { conta_id: CONTA, mp_user_id: COLLECTOR })).toEqual({ resultado: "sem_acesso", cobrancas: 0 });
    expect(integ(db)).toMatchObject({ status: "erro", mp_erro: "conta_trocada" });
  });
});

describe("pacientesComAutomaticaViva e oauthDoAmbiente", () => {
  it("pacientesComAutomaticaViva: os pacientes DA CONTA (pela matrícula — a assinatura antiga pode ter conta nula) com automática viva, sem repetir", async () => {
    const db = criarDb({ aluno_assinaturas: [
      { paciente_id: P1, conta_id: null, status: "authorized", pacientes: { conta_id: CONTA } },
      { paciente_id: P1, conta_id: CONTA, status: "paused", pacientes: { conta_id: CONTA } },
      { paciente_id: P2, conta_id: CONTA, status: "cancelled", pacientes: { conta_id: CONTA } },
      { paciente_id: P3, conta_id: "outra", status: "pending", pacientes: { conta_id: "outra" } },
    ] });
    expect(await M.pacientesComAutomaticaViva(db.cliente, CONTA)).toEqual([P1]);
  });
  it("caso 16 (I6): no staging, o par _STAGING quando os 2 existem; o public nunca o lê; faltando um do par de sempre → null", () => {
    const sempre = { MP_CLIENT_ID: "111", MP_CLIENT_SECRET: "sss" };
    const deTeste = { MP_CLIENT_ID_STAGING: "222", MP_CLIENT_SECRET_STAGING: "ttt" };
    expect(M.oauthDoAmbiente("staging", lerDe({ ...sempre, ...deTeste }))).toEqual({ clientId: "222", clientSecret: "ttt" });
    expect(M.oauthDoAmbiente("public", lerDe({ ...sempre, ...deTeste }))).toEqual({ clientId: "111", clientSecret: "sss" });
    expect(M.oauthDoAmbiente("staging", lerDe(sempre))).toEqual({ clientId: "111", clientSecret: "sss" });
    expect(M.oauthDoAmbiente("staging", lerDe({ ...sempre, MP_CLIENT_ID_STAGING: "222" }))).toEqual({ clientId: "111", clientSecret: "sss" });
    expect(M.oauthDoAmbiente("public", lerDe({ MP_CLIENT_ID: "111" }))).toBeNull();
    expect(M.oauthDoAmbiente("public", lerDe({ MP_CLIENT_SECRET: "sss", ...deTeste }))).toBeNull();
    expect(M.oauthDoAmbiente("public")).toBeNull();                                      // fora do Deno
    vi.stubGlobal("Deno", denoFalso(sempre));
    expect(M.oauthDoAmbiente("public")).toEqual({ clientId: "111", clientSecret: "sss" });
    expect(M.pkceLigado(lerDe({}))).toBe(true);
    expect(M.pkceLigado(lerDe({ MP_OAUTH_PKCE: "0" }))).toBe(false);
  });
});

// ───────────────────────── a volta do OAuth (Task 8 — revisão I8) ─────────────────────────

describe("guardarParaConfirmar — a volta guarda o par CIFRADO na conexão até a confirmação de quem começou (Task 8, revisão I8)", () => {
  const CONEXAO = "e0e0e0e0-1111-4222-8333-444455556666";
  const conexao = (o: Linha = {}): Linha => ({
    id: CONEXAO, estado_hash: "a".repeat(64), conta_id: CONTA, user_id: DONO, verificador: "v1:pkce-cifrado-falso:xxxxxxxxxxxxxxxxxxxx",
    redirect_uri: "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging", criado_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + 9 * 60_000).toISOString(), usado_em: new Date().toISOString(), resultado: null, token_access: null,
    token_refresh: null, token_expira_em: null, mp_user_id: null, mp_apelido: null, public_key: null, live: null, renovavel: null, ...o,
  });
  const tokenDe = (o: Record<string, unknown> = {}): TokenMp => {
    const t = lerTokenDoMp(respostaDoToken(o));
    if (!t) throw new Error("a resposta de teste do /oauth/token tinha de ser lida");
    return t;
  };
  /** O /users/me do token NOVO (o apelido) entra pelo ctx.fetch, como o /oauth/token. */
  const usuarioDoMp = (body: unknown, status = 200) => (ida: Ida): RespostaFalsa =>
    ida.caminho === "/users/me" ? { status, body } : { status: 404, body: {} };
  const con = { id: CONEXAO, conta_id: CONTA };

  it("grava as 2 cifras (o MESMO dado associado da integração: a RPC só copia), o collector, o apelido e resultado 'confirmar' — SEM tocar em recebimento_integracoes", async () => {
    const antes = await integracao();
    const db = criarDb({ mp_conexoes: [conexao()], recebimento_integracoes: [{ ...antes }] });
    const { ctx, linhas, oauth } = contexto({ token: usuarioDoMp({ id: COLLECTOR, nickname: "VENDEDOR_NOVO" }) });
    expect(await M.guardarParaConfirmar(db.cliente, ctx, con, tokenDe())).toBe("confirmar");
    const c = db.tabelas.mp_conexoes[0];
    expect(c).toMatchObject({ resultado: "confirmar", mp_user_id: COLLECTOR, mp_apelido: "VENDEDOR_NOVO", public_key: "APP_USR-chave-publica-0002",
      live: false, renovavel: true });
    perto(c.token_expira_em, 180 * DIA);
    expect(String(c.token_access)).toMatch(/^v1:/);
    expect(await decifrar(String(c.token_access), ad("access"), CHAVE)).toBe(TOKEN_B);
    expect(await decifrar(String(c.token_refresh), ad("refresh"), CHAVE)).toBe(REFRESH_B);
    // a cifra da conexão só abre com o dado associado da integração DESTA conta, deste schema e deste campo
    await expect(decifrar(String(c.token_access), dadoAssociado("staging", P1, "access"), CHAVE)).rejects.toThrow();
    await expect(decifrar(String(c.token_access), ad("access", "public"), CHAVE)).rejects.toThrow();
    await expect(decifrar(String(c.token_access), ad("refresh"), CHAVE)).rejects.toThrow();
    // I8: a volta NÃO grava a integração — 1 gravação só, na conexão, pelo id
    expect(db.pedidos.map((p) => [p.tabela, p.op])).toEqual([["mp_conexoes", "update"]]);
    expect(db.pedidos[0].filtros).toEqual([{ col: "id", op: "eq", v: CONEXAO }]);
    expect(db.tabelas.recebimento_integracoes).toEqual([antes]);
    // o apelido veio do /users/me com o token NOVO (e mais nada foi ao MP); nada em claro no banco nem no log
    expect(oauth.idas.map((i) => [i.metodo, i.url, i.token])).toEqual([["GET", `${MP}/users/me`, TOKEN_B]]);
    const tudo = JSON.stringify([db.pedidos, linhas]);
    expect(tudo).not.toContain(TOKEN_B);
    expect(tudo).not.toContain(REFRESH_B);
  });

  it("MENOR 20: conta de TESTE (live false) no public → 'conta_de_teste' e NADA gravado nem pedido ao MP; conta de verdade no staging → o mesmo", async () => {
    const db = criarDb({ mp_conexoes: [conexao()] });
    const pub = contexto({ token: usuarioDoMp({ id: COLLECTOR, nickname: "X" }) });
    expect(await M.guardarParaConfirmar(db.cliente, { ...pub.ctx, schema: "public" }, con, tokenDe({ live_mode: false }))).toBe("conta_de_teste");
    expect(pub.linhas).toEqual([{ nivel: "aviso", campos: { codigo: "mp_conexao_modo_errado", schema: "public", ref: CONTA, resultado: "conta_de_teste" } }]);
    const stg = contexto({ token: usuarioDoMp({ id: COLLECTOR, nickname: "X" }) });
    expect(await M.guardarParaConfirmar(db.cliente, stg.ctx, con, tokenDe({ live_mode: true }))).toBe("conta_de_teste");
    expect(stg.linhas).toEqual([{ nivel: "aviso", campos: { codigo: "mp_conexao_modo_errado", schema: "staging", ref: CONTA, resultado: "conta_real" } }]);
    expect(db.pedidos).toEqual([]);
    expect([...pub.oauth.idas, ...stg.oauth.idas]).toEqual([]);
    expect(db.tabelas.mp_conexoes[0]).toMatchObject({ resultado: null, token_access: null, token_refresh: null, mp_user_id: null });
    // o modo certo de cada schema passa (e o live desconhecido também: não dá para conferir)
    expect(await M.guardarParaConfirmar(db.cliente, { ...pub.ctx, schema: "public" }, con, tokenDe({ live_mode: true }))).toBe("confirmar");
    expect(await M.guardarParaConfirmar(db.cliente, stg.ctx, con, tokenDe({ live_mode: undefined }))).toBe("confirmar");
    expect(db.tabelas.mp_conexoes[0].live).toBeNull();
  });

  it("o apelido é melhor esforço: /users/me fora, rede caída, sem nickname, fora do tipo ou com mais de 80 → mp_apelido null e segue 'confirmar'", async () => {
    const casos: Array<[string, (ida: Ida) => RespostaFalsa]> = [
      ["500", usuarioDoMp({ message: "erro" }, 500)],
      ["401", usuarioDoMp({ message: "unauthorized" }, 401)],
      ["nickname num status que não é 200", usuarioDoMp({ id: COLLECTOR, nickname: "INTRUSO" }, 403)],
      ["rede", () => "rede"],
      ["sem nickname", usuarioDoMp({ id: COLLECTOR })],
      ["nickname número", usuarioDoMp({ id: COLLECTOR, nickname: 12345 })],
      ["nickname vazio", usuarioDoMp({ id: COLLECTOR, nickname: "   " })],
      ["81 caracteres", usuarioDoMp({ id: COLLECTOR, nickname: "N".repeat(81) })],
      ["corpo que não é JSON de objeto", usuarioDoMp(null)],
    ];
    for (const [nome, responder] of casos) {
      const db = criarDb({ mp_conexoes: [conexao()] });
      const { ctx } = contexto({ token: responder });
      expect(await M.guardarParaConfirmar(db.cliente, ctx, con, tokenDe()), nome).toBe("confirmar");
      expect(db.tabelas.mp_conexoes[0], nome).toMatchObject({ resultado: "confirmar", mp_apelido: null, mp_user_id: COLLECTOR });
    }
    // 80 caracteres (o CHECK da mp_conexoes) passa; o nome vem aparado
    const db = criarDb({ mp_conexoes: [conexao()] });
    const { ctx } = contexto({ token: usuarioDoMp({ id: COLLECTOR, nickname: ` ${"N".repeat(80)} ` }) });
    expect(await M.guardarParaConfirmar(db.cliente, ctx, con, tokenDe())).toBe("confirmar");
    expect(db.tabelas.mp_conexoes[0].mp_apelido).toBe("N".repeat(80));
  });

  it("sem prazo para o apelido (< 1 s) → nem pergunta ao MP: mp_apelido null e a conexão segue 'confirmar'", async () => {
    const db = criarDb({ mp_conexoes: [conexao()] });
    const { ctx, oauth } = contexto({ prazo: prazoDe(500), token: usuarioDoMp({ id: COLLECTOR, nickname: "VENDEDOR_NOVO" }) });
    expect(await M.guardarParaConfirmar(db.cliente, ctx, con, tokenDe())).toBe("confirmar");
    expect(oauth.idas).toEqual([]);
    expect(db.tabelas.mp_conexoes[0]).toMatchObject({ resultado: "confirmar", mp_apelido: null });
  });

  it("sem refresh na resposta → token_refresh nulo e renovavel false (a RPC grava mp_erro sem_renovacao); o erro do banco LANÇA", async () => {
    const db = criarDb({ mp_conexoes: [conexao()] });
    const { ctx } = contexto({ token: usuarioDoMp({ id: COLLECTOR, nickname: "VENDEDOR_NOVO" }) });
    expect(await M.guardarParaConfirmar(db.cliente, ctx, con, tokenDe({ refresh_token: undefined, public_key: undefined }))).toBe("confirmar");
    expect(db.tabelas.mp_conexoes[0]).toMatchObject({ resultado: "confirmar", token_refresh: null, renovavel: false, public_key: null });
    expect(await decifrar(String(db.tabelas.mp_conexoes[0].token_access), ad("access"), CHAVE)).toBe(TOKEN_B);
    const recusa = criarDb({ mp_conexoes: [conexao()] }, { responder: (p) => (p.tabela === "mp_conexoes" && p.op === "update"
      ? { data: null, error: { code: "23514", message: 'new row for relation "mp_conexoes" violates check constraint "mp_conexoes_check"' } }
      : undefined) });
    await expect(M.guardarParaConfirmar(recusa.cliente, ctx, con, tokenDe())).rejects.toMatchObject({ code: "23514" });
  });
});
