// @vitest-environment node
// src/financeiro/mpContaAviso.test.ts
// Physiq W2 — o aviso do Mercado Pago NA CONTA do personal (supabase-principal/functions/mp-webhook-aluno/conta.ts: o caminho por &conta= e
// o pelo user_id da URL do painel — revisão I1 e MENOR 5; o collector, o live_mode e a referência de um aluno DESSA conta; a x-signature;
// os tetos separados — MENORES 6 e 26; sem cache de "repetido" — I4; o 401 de recurso alheio — I2; nada de renovar dentro do aviso —
// MENOR 34), a credencial de cada automática na fila (automaticas-fila/credencial.ts) e o contrato do código das entradas que o Vitest
// não importa (a index.ts do aviso e a da fila, e a exclusão do personal: Deno.serve, esm.sh e o Deno.env no topo).
// Um banco FALSO em memória (o molde do mpContaServidor.test.ts, enxuto: sem a W2 ele responde 42P01 ao mp_conexoes e 42703/PGRST204 a
// tudo que cita mp_collector_id) e um MP FALSO pelo fetch global (vi.stubGlobal) que sabe de quem é cada token. O ambiente do Deno é
// falso (vi.stubGlobal("Deno")). Tokens, chave e segredo são de teste, feitos aqui; nada vai à rede. Cada teste importa os módulos de
// novo (vi.resetModules): as memórias de 60 s (schemaTemW2, a flag da assinatura), a conta do Physiq guardada e os tetos não vazam.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrar, dadoAssociado, importarChave } from "../../supabase-principal/functions/_shared/cifra-mp";
import type { Log } from "../../supabase-principal/functions/_shared/log";
import type { ContextoMpConta } from "../../supabase-principal/functions/_shared/mp-conta";
import { manifestoDaAssinatura, type AvisoDaConta } from "../../supabase-principal/functions/_shared/mp-conta-regras";
import type { Prazo } from "../../supabase-principal/functions/_shared/tempo";

type ModAviso = typeof import("../../supabase-principal/functions/mp-webhook-aluno/conta");
type ModFila = typeof import("../../supabase-principal/functions/automaticas-fila/credencial");

const CONTA = "c0a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b";
const OUTRA = "c1111111-2222-4333-8444-555555555555";       // outra conta do Physiq
const DONO = "d0d0d0d0-1111-4222-8333-444455556666";
const DONO_OUTRA = "d1d1d1d1-1111-4222-8333-444455556666";
const P1 = "a1111111-1111-4111-8111-111111111111";          // aluno da CONTA
const P9 = "a9999999-9999-4999-8999-999999999999";          // aluno da OUTRA
const COB = "b1111111-1111-4111-8111-111111111111";
const ALUNO_USER = "e1111111-1111-4111-8111-111111111111";
const VENDEDOR = 777;                                        // a conta do MP da integração
const OUTRO_VENDEDOR = 888;
const PHYSIQ_ID = 555;                                       // a conta do MP do Physiq (o token do schema)
const TOKEN_CONTA = "APP_USR-acesso-da-conta-0001";
const TOKEN_OUTRA = "APP_USR-acesso-da-outra-0002";
const PHYSIQ_TEST = "TEST-physiq-do-ambiente-0003";
const SEGREDO = "segredo-da-assinatura-de-teste-0001";
const DIA = 86_400_000;
const FUNCOES = resolve(__dirname, "../../supabase-principal/functions");
const fonte = (rel: string) => readFileSync(resolve(FUNCOES, rel), "utf-8");

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
  op: "select" | "update" | "insert" | "rpc";
  colunas: string | null;
  volta: string | null;
  valores: Linha | null;
  filtros: Filtro[];
  unico: boolean;
  limite: number | null;
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
  is(col: string, v: null): Consulta;
  not(col: string, op: string, v: unknown): Consulta;
  in(col: string, v: unknown[]): Consulta;
  or(texto: string): Consulta;
  order(col: string, opcoes?: unknown): Consulta;
  limit(n: number): Consulta;
  range(de: number, ate: number): Consulta;
  maybeSingle(): Consulta;
}

const vazio = (x: unknown) => x === null || x === undefined;
const comparavel = (x: unknown) => (typeof x === "string" && /^\d{4}-\d\d-\d\dT/.test(x) ? Date.parse(x) : Number(x));
function passa(l: Linha, f: Filtro): boolean {
  if (f.op === "or") {
    return f.texto.split(",").some((parte) => {
      const [col, op, ...resto] = parte.split(".");
      return op === "is" ? passa(l, { col, op: "is", v: null }) : passa(l, { col, op: op as OpSimples, v: resto.join(".") });
    });
  }
  const x = l[f.col];
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
    const embutida = /^(?:(\w+):)?(\w+)(?:!\w+)?\(/.exec(parte);   // conta:contas(…) → "conta"
    const chave = embutida ? (embutida[1] ?? embutida[2]) : parte;
    saida[chave] = l[chave] ?? null;
  }
  return saida;
}
const citaACollector = (p: Pedido) =>
  [p.colunas, p.volta].some((c) => !!c && c.includes("mp_collector_id"))
  || p.filtros.some((f) => ("col" in f ? f.col === "mp_collector_id" : f.texto.includes("mp_collector_id")))
  || Object.prototype.hasOwnProperty.call(p.valores ?? {}, "mp_collector_id");

function criarDb(inicio: Record<string, Linha[]>, opcoes: { semW2?: boolean } = {}) {
  const tabelas: Record<string, Linha[]> = { mp_conexoes: [], ...inicio };
  const pedidos: Pedido[] = [];
  let seq = 0;
  const linhasDe = (t: string) => (tabelas[t] ??= []);
  const semUndefined = (v: Linha | null): Linha => Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x !== undefined));
  function executar(p: Pedido): RespostaDb {
    if (opcoes.semW2) {
      if (p.tabela === "mp_conexoes") return { data: null, error: { code: "42P01", message: 'relation "staging.mp_conexoes" does not exist' } };
      if (citaACollector(p)) {
        return { data: null, error: p.op === "select"
          ? { code: "42703", message: `column ${p.tabela}.mp_collector_id does not exist` }
          : { code: "PGRST204", message: `Could not find the 'mp_collector_id' column of '${p.tabela}' in the schema cache` } };
      }
    }
    if (p.op === "rpc") return { data: null, error: { code: "42883", message: `function ${p.tabela} does not exist` } };
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
    const lista = p.limite === null ? achadas : achadas.slice(0, p.limite);
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
      is: (col) => filtro({ col, op: "is", v: null }),
      not: (col, op, v) => filtro(op === "is" && v === null ? { col, op: "nao_nulo", v: null } : { col, op: "neq", v }),
      in: (col, v) => filtro({ col, op: "in", v }),
      or: (texto) => filtro({ op: "or", texto }),
      order: () => q,
      limit: (n) => muda(() => Object.assign(p, { limite: n })),
      range: () => q,
      maybeSingle: () => muda(() => Object.assign(p, { unico: true })),
      then<A = RespostaDb, B = never>(ok?: ((v: RespostaDb) => A | PromiseLike<A>) | null,
        ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
        return Promise.resolve().then(() => executar(p)).then(ok, ko);
      },
    };
    return q;
  }
  const novo = (tabela: string, op: Pedido["op"]): Pedido => {
    const p: Pedido = { tabela, op, colunas: null, volta: null, valores: null, filtros: [], unico: false, limite: null };
    pedidos.push(p);
    return p;
  };
  const cliente = {
    from: (tabela: string) => consulta(novo(tabela, "select")),
    rpc: (nome: string) => consulta(novo(nome, "rpc")),
  } as unknown as SupabaseClient;
  return { cliente, pedidos, tabelas };
}
type DbFalso = ReturnType<typeof criarDb>;
const gravou = (db: DbFalso, tabela: string) => db.pedidos.some((p) => p.tabela === tabela && (p.op === "update" || p.op === "insert"));

// ───────────────────────── o MP falso (o fetch global), o log, o prazo, o ambiente ─────────────────────────

interface Ida { caminho: string; metodo: string; token: string | null }
type RespostaFalsa = { status: number; body?: unknown };
/** O MP do cenário: cada token é de um usuário; o pagamento só é lido por quem recebeu (collector) ou pelos `leitores` (quem pagou). */
interface Mundo {
  tokens: Record<string, number>;
  pagamentos: Record<string, Linha>;
  assinaturas: Record<string, Linha>;
  autorizadas: Record<string, Linha>;
  /** recurso de outro vendedor: 401 (o MP de verdade pode responder assim — I2) em vez de 404 */
  alheio401?: boolean;
  /** tudo 500 */
  fora?: boolean;
  /** só o /users/me sem resposta que decida (429: o mpFetch não repete — o teste não espera) */
  usersMeFora?: boolean;
}
function mpFalso(m: Mundo) {
  const idas: Ida[] = [];
  const responder = (ida: Ida): RespostaFalsa => {
    if (m.fora) return { status: 500, body: { message: "internal_error" } };
    const dono = ida.token ? m.tokens[ida.token] : undefined;
    if (ida.caminho === "/users/me" && m.usersMeFora) return { status: 429, body: { message: "too_many_requests" } };
    if (dono === undefined) return { status: 401, body: { message: "invalid_token" } };
    if (ida.caminho === "/users/me") return { status: 200, body: { id: dono, nickname: `USUARIO_${dono}` } };
    const achar = (tabela: Record<string, Linha>, re: RegExp): RespostaFalsa => {
      const id = re.exec(ida.caminho)?.[1];
      const r = id ? tabela[id] : undefined;
      if (!r) return { status: 404, body: { message: "not_found" } };
      const pode = Number(r.collector_id) === dono || ((r.leitores as number[] | undefined) ?? []).includes(dono);
      if (!pode) return m.alheio401 ? { status: 401, body: { message: "unauthorized" } } : { status: 404, body: { message: "not_found" } };
      const { leitores: _leitores, ...corpo } = r;
      return { status: 200, body: corpo };
    };
    if (/^\/v1\/payments\//.test(ida.caminho)) return achar(m.pagamentos, /^\/v1\/payments\/([^/?]+)$/);
    if (/^\/preapproval\//.test(ida.caminho)) return achar(m.assinaturas, /^\/preapproval\/([^/?]+)$/);
    if (/^\/authorized_payments\//.test(ida.caminho)) return achar(m.autorizadas, /^\/authorized_payments\/([^/?]+)$/);
    return { status: 404, body: { message: "not_found" } };
  };
  vi.stubGlobal("fetch", async (entrada: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const ida: Ida = { caminho: u.pathname + u.search, metodo: (init.method ?? "GET").toUpperCase(),
      token: new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "") ?? null };
    idas.push(ida);
    const r = responder(ida);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  });
  return idas;
}

interface LinhaLog { nivel: "info" | "aviso" | "erro" | "excecao"; campos: Record<string, unknown> }
function logFalso(): { log: Log; linhas: LinhaLog[] } {
  const linhas: LinhaLog[] = [];
  const anotar = (nivel: LinhaLog["nivel"], campos: object) => void linhas.push({ nivel, campos: { ...campos } });
  return {
    linhas,
    log: {
      info: (c) => anotar("info", c),
      aviso: (c) => anotar("aviso", c),
      erro: (c) => anotar("erro", c),
      excecao: (_e, c) => anotar("excecao", c ?? {}),
    },
  };
}
/** O prazo parado num valor (2,5 s: o mpFetch não repete o 5xx — o MP fora responde na hora). */
const prazoDe = (ms: number): Prazo => ({ restante: () => ms, esgotado: () => ms <= 0 });
let CHAVE: CryptoKey;
const CHAVE_B64 = Buffer.alloc(32, 7).toString("base64url");
function ambiente(o: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = { MP_TOKENS_CHAVE: CHAVE_B64, MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST, ...o };
  vi.stubGlobal("Deno", { env: { get: (n: string) => env[n] } });
}

// ───────────────────────── as peças de cada cenário ─────────────────────────

async function integracao(o: Linha = {}, conta = CONTA, token = TOKEN_CONTA): Promise<Linha> {
  return {
    conta_id: conta, provedor: "mercadopago", status: "ativa", mp_user_id: VENDEDOR, mp_apelido: "VENDEDOR_TESTE", mp_public_key: null,
    mp_access_token: await cifrar(token, dadoAssociado("staging", conta, "access"), CHAVE),
    mp_refresh_token: await cifrar("TG-refresh-0001", dadoAssociado("staging", conta, "refresh"), CHAVE),
    mp_expira_em: new Date(Date.now() + 90 * DIA).toISOString(), mp_teste: true, mp_origem: "oauth", mp_renovado_em: null,
    mp_renovando_ate: null, mp_renovar_tentativas: 0, mp_renovar_proxima_em: null, mp_erro: null, mp_avisado_em: null,
    conectado_em: new Date(Date.now() - 10 * DIA).toISOString(), desconectada_em: null, ...o,
  };
}
const matricula = (id: string, conta: string, dono: string): Linha => ({
  id, conta_id: conta, user_id: ALUNO_USER, treino_user_id: null, nome: "Aluno", email: null, cpf: null, foto_url: null, ativo: true,
  tags: null, personal_id: null, nutricionista_id: null, plano_aluno_id: null, mensalidade_valor: 100, cobranca_pausada: false,
  mensalidade_desde: null, mensalidade_pago_ate: null, deleted_at: null, app_teste_de: null, app_teste_ate: null, objetivo_app: null,
  plano_modalidade: null, plano_valor_negociado: null,
  conta: { id: conta, nome: "Conta", dono_id: dono, recebimento_modo: "mercadopago_conta", bloquear_app_inadimplente: false, origem: "personal" },
  plano: null,
});
const cobranca = (o: Linha = {}): Linha => ({
  id: COB, paciente_id: P1, conta_id: CONTA, nutricionista_id: DONO, criado_por: null, tipo: "avulsa", descricao: "Avulsa", valor: 100,
  vencimento: "2026-10-11", status: "aguardando_confirmacao", forma: "mp", metodo: "pix", mes_ref: null, pago_em: null,
  mp_payment_id: null, mp_status: "pending", mp_preapproval_id: null, pix_expira_em: new Date(Date.now() + DIA).toISOString(),
  reembolsado_em: null, origem: null, mp_collector_id: VENDEDOR, deleted_at: null, ...o,
});
const pagamento = (o: Linha = {}): Linha => ({
  id: 123, status: "approved", collector_id: VENDEDOR, live_mode: false, external_reference: `physiq:staging:aluno:${P1}:avulsa:${COB}`,
  transaction_amount: 100, date_approved: "2026-10-11T15:00:00.000-03:00", date_created: "2026-10-11T14:59:00.000-03:00",
  payment_method_id: "pix", ...o,
});
const preapproval = (o: Linha = {}): Linha => ({
  id: "pre9", status: "authorized", collector_id: VENDEDOR, live_mode: false, external_reference: `physiq:staging:aluno:${P1}:recorrente`,
  auto_recurring: { transaction_amount: 100 }, next_payment_date: "2026-11-11T00:00:00.000-03:00", init_point: null, ...o,
});
async function cenario(o: Record<string, Linha[]> = {}, opcoes: { semW2?: boolean } = {}) {
  return criarDb({
    recebimento_integracoes: [await integracao()],
    app_config: [{ chave: "mp_webhook", valor: { exigir_assinatura: false } }],
    contas: [{ id: CONTA, dono_id: DONO }, { id: OUTRA, dono_id: DONO_OUTRA }],
    pacientes: [matricula(P1, CONTA, DONO), matricula(P9, OUTRA, DONO_OUTRA)],
    cobrancas: [cobranca()],
    aluno_assinaturas: [],
    avisos: [],
    ...o,
  }, opcoes);
}
const mundo = (o: Partial<Mundo> = {}): Mundo => ({
  tokens: { [TOKEN_CONTA]: VENDEDOR, [TOKEN_OUTRA]: VENDEDOR, [PHYSIQ_TEST]: PHYSIQ_ID },
  pagamentos: { 123: pagamento() }, assinaturas: {}, autorizadas: {}, ...o,
});
const aviso = (o: Partial<AvisoDaConta> = {}): AvisoDaConta => ({ conta: CONTA, topico: "payment", id: "123", userId: VENDEDOR, ...o });
const URL_CONTA = (dataId = "123") => new URL(`https://x.supabase.co/functions/v1/mp-webhook-aluno?schema=staging&conta=${CONTA}&data.id=${dataId}&type=payment`);
const pedido = (cab: Record<string, string> = {}) => new Request("https://x.supabase.co/functions/v1/mp-webhook-aluno", { method: "POST", headers: cab });
const semOauth = (idas: Ida[]) => expect(idas.filter((i) => i.caminho.startsWith("/oauth"))).toEqual([]);

let A: ModAviso;
beforeAll(async () => {
  CHAVE = await importarChave(CHAVE_B64);
});
beforeEach(async () => {
  vi.resetModules();
  ambiente();
  A = await import("../../supabase-principal/functions/mp-webhook-aluno/conta");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function deps(db: DbFalso) {
  const { log, linhas } = logFalso();
  return { d: { dbDe: () => db.cliente, log }, linhas };
}
async function tratar(db: DbFalso, a: AvisoDaConta = aviso(), o: { url?: URL; req?: Request; prazo?: Prazo } = {}) {
  const { d, linhas } = deps(db);
  const r = await A.tratarDaConta(d, o.req ?? pedido(), o.url ?? URL_CONTA(a.id), "staging", a, o.prazo ?? prazoDe(18_000));
  return { r, linhas };
}

// ───────────────────────── a entrada: o corpo medido e os tetos ─────────────────────────

describe("lerAte — o corpo é MEDIDO antes de ler (MENOR 4)", () => {
  it("até o limite → o texto; sem corpo → texto vazio", async () => {
    expect(await A.lerAte(new Request("https://x", { method: "POST", body: '{"type":"payment"}' }), 16_384)).toBe('{"type":"payment"}');
    expect(await A.lerAte(new Request("https://x", { method: "POST" }), 16_384)).toBe("");
  });
  it("17 KB em pedaços SEM content-length (chunked) → null, e a leitura para no limite", async () => {
    let enviados = 0;
    const pedacos = new ReadableStream<Uint8Array>({
      pull(c) {
        if (enviados >= 40) return c.close();
        enviados++;
        c.enqueue(new Uint8Array(1024).fill(65));
      },
    });
    const req = new Request("https://x", { method: "POST", body: pedacos, duplex: "half" } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    expect(await A.lerAte(req, 16_384)).toBeNull();
    expect(enviados).toBeLessThan(40);
  });
  it("content-length declarado acima do limite → null sem ler", async () => {
    const req = new Request("https://x", { method: "POST", body: "x", headers: { "content-length": "20000" } });
    expect(await A.lerAte(req, 16_384)).toBeNull();
  });
});

describe("criarTeto — os tetos separados (MENORES 6 e 26)", () => {
  it("N por chave na janela; outra chave tem o seu", () => {
    const teto = A.criarTeto(2);
    expect([teto("a"), teto("a"), teto("a"), teto("b")]).toEqual([true, true, false, true]);
  });
  it("encher um teto de chaves inventadas (ele se limpa) não zera o outro", () => {
    const ip = A.criarTeto(2);
    const conta = A.criarTeto(2, 60_000, 100);
    ip("1.2.3.4");
    ip("1.2.3.4");
    for (let i = 0; i < 300; i++) conta(`inventada-${i}`);
    expect(ip("1.2.3.4")).toBe(false);
  });
  it("os tetos publicados: 120/min por IP (só o aviso sem user_id — a index.ts) e 60/min por conta (dentro do tratarDaConta)", () => {
    for (let i = 0; i < 120; i++) expect(A.permitidoIp("9.9.9.9")).toBe(true);
    expect(A.permitidoIp("9.9.9.9")).toBe(false);
  });
});

// ───────────────────────── o caminho da conta ─────────────────────────

describe("tratarDaConta — o que decide antes de ir ao MP", () => {
  it("schema sem a W2 → 500 schema_sem_w2 (o MP manda de novo — MENOR 4 da W1) e nenhuma ida ao MP", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario({}, { semW2: true });
    expect((await tratar(db)).r).toEqual({ http: 500, resultado: "schema_sem_w2" });
    expect(idas).toEqual([]);
  });
  it("conta inventada ou sem token → 200 conta_sem_mp, nenhuma ida ao MP e o teto da conta intacto (MENOR 26)", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario();
    db.tabelas.recebimento_integracoes.push({ ...(await integracao({}, OUTRA)), mp_access_token: null });
    expect((await tratar(db, aviso({ conta: OUTRA }))).r).toEqual({ http: 200, resultado: "conta_sem_mp" });
    expect(idas).toEqual([]);
    // o teto da conta de verdade: 60 por minuto
    for (let i = 0; i < 60; i++) expect((await tratar(db)).r.http, `aviso ${i + 1}`).toBe(200);
    expect((await tratar(db)).r).toEqual({ http: 429, resultado: "limite" });
    // 5.001 avisos com uuids inventados (passa do limite de chaves do Map): nenhum entra no teto, então ele NÃO se limpa — a conta segue no 429
    const antes = idas.length;
    for (let i = 0; i <= 5_000; i++) {
      const r = await tratar(db, aviso({ conta: `c0a1b2c3-d4e5-4f60-8a7b-${String(i).padStart(12, "0")}` }));
      if (r.r.resultado !== "conta_sem_mp") throw new Error(`inventada ${i}: ${r.r.resultado}`);
    }
    expect(idas.length).toBe(antes);
    expect((await tratar(db)).r).toEqual({ http: 429, resultado: "limite" });
  });
  it("conta em erro → 500 conta_em_erro sem ir ao MP (quando o dono reconectar, o reenvio entra); o lixo nela → 200 (sem reenvio à toa)", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    expect((await tratar(db)).r).toEqual({ http: 500, resultado: "conta_em_erro" });
    expect((await tratar(db, aviso({ topico: "merchant_order" }))).r).toEqual({ http: 200, resultado: "topico_ignorado" });
    expect((await tratar(db, aviso({ id: "x/y" }))).r).toEqual({ http: 200, resultado: "sem_id" });
    expect(idas).toEqual([]);
  });
  it("tópico desconhecido → topico_ignorado; id fora do formato → sem_id; nenhum dos 2 vai ao MP", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario();
    expect((await tratar(db, aviso({ topico: "merchant_order" }))).r).toEqual({ http: 200, resultado: "topico_ignorado" });
    expect((await tratar(db, aviso({ id: "../../users/me" }))).r).toEqual({ http: 200, resultado: "sem_id" });
    expect((await tratar(db, aviso({ topico: "subscription_preapproval", id: "pre-9" }))).r).toEqual({ http: 200, resultado: "sem_id" });
    expect(idas).toEqual([]);
  });
  it("sem a MP_TOKENS_CHAVE → lança MpContaSemAcesso nao_configurado (o catch final da index.ts: 500 + aviso ao Weslley)", async () => {
    mpFalso(mundo());
    ambiente({ MP_TOKENS_CHAVE: undefined });
    const db = await cenario();
    await expect(tratar(db)).rejects.toThrow(/mp_conta_sem_acesso_nao_configurado/);
  });
  it("I4: o user_id diferente do da integração só vai ao log — o aviso é tratado (quem decide é o collector do recurso)", async () => {
    mpFalso(mundo());
    const db = await cenario();
    const { r, linhas } = await tratar(db, aviso({ userId: 4242 }));
    expect(r.resultado).toBe("cobranca_paga_paga");
    expect(linhas.some((l) => l.nivel === "aviso" && l.campos.codigo === "aviso_mp_conta_user_id_diferente")).toBe(true);
  });
});

describe("tratarDaConta — o pagamento (o aviso nunca é a verdade: o recurso com o token DA CONTA)", () => {
  it("Pix aprovado da conta → a cobrança vira paga (o collector, o live_mode e a referência conferidos), o aluno é avisado", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario();
    const { r, linhas } = await tratar(db);
    expect(r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
    expect(idas.map((i) => [i.metodo, i.caminho, i.token])).toEqual([["GET", "/v1/payments/123", TOKEN_CONTA]]);
    expect(db.tabelas.cobrancas[0]).toMatchObject({ status: "paga", mp_payment_id: "123", mp_status: "approved" });
    expect(db.tabelas.avisos).toEqual([expect.objectContaining({ destino_user_id: ALUNO_USER, tipo: "pagamento_confirmado" })]);
    expect(linhas).toContainEqual({ nivel: "info", campos: expect.objectContaining({ codigo: "aviso_mp_conta", ref: "123", resultado: "cobranca_paga_paga" }) });
    semOauth(idas);
  });
  it("I4: payment.created (pendente) e, logo depois, payment.updated (aprovado) do MESMO id → os 2 tratados; paga no 2º", async () => {
    const m = mundo({ pagamentos: { 123: pagamento({ status: "pending", date_approved: null }) } });
    mpFalso(m);
    const db = await cenario();
    expect((await tratar(db)).r).toEqual({ http: 200, resultado: "cobranca_aguardando_confirmacao" });
    m.pagamentos[123] = pagamento();
    expect((await tratar(db)).r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
    expect(db.tabelas.cobrancas[0].status).toBe("paga");
  });
  it("mpc-b: o cartão EM ANÁLISE e, logo depois, RECUSADO pelo aviso → a recusa gravada + 1 linha mp_cartao_recusado com o motivo (sem dado pessoal); o aviso repetido não repete a linha", async () => {
    const recusas = (linhas: LinhaLog[]) => linhas.filter((l) => l.campos.codigo === "mp_cartao_recusado");
    const cartao = { date_approved: null, payment_method_id: "master" };
    const m = mundo({ pagamentos: { 123: pagamento({ ...cartao, status: "in_process", status_detail: "pending_review_manual" }) } });
    mpFalso(m);
    const db = await cenario();
    const r1 = await tratar(db);
    expect(r1.r).toEqual({ http: 200, resultado: "cobranca_aguardando_confirmacao" });
    expect(recusas(r1.linhas)).toEqual([]);
    m.pagamentos[123] = pagamento({ ...cartao, status: "rejected", status_detail: "cc_rejected_high_risk",
      payer: { email: "fulana@exemplo.com", first_name: "Fulana", last_name: "Tal", identification: { type: "CPF", number: "12345678909" } } });
    const r2 = await tratar(db);
    expect(r2.r).toEqual({ http: 200, resultado: "cobranca_aberta" }); // a avulsa recusada volta a ficar em aberto (paga-se de novo)
    expect(db.tabelas.cobrancas[0]).toMatchObject({ status: "aberta", mp_status: "rejected" });
    expect(recusas(r2.linhas)).toEqual([{ nivel: "aviso", campos: expect.objectContaining({
      codigo: "mp_cartao_recusado", schema: "staging", acao: "aviso_mp_conta", ref: "123", externo: { mp_status_detail: "cc_rejected_high_risk" } }) }]);
    expect(JSON.stringify(r2.linhas)).not.toMatch(/Fulana|fulana@|12345678909/);
    const r3 = await tratar(db);
    expect(r3.r).toEqual({ http: 200, resultado: "cobranca_aberta" });
    expect(recusas(r3.linhas)).toEqual([]);
  });
  it("de OUTRO vendedor (a conta leu o pagamento como quem pagou) → 200 collector_diferente e nada gravado", async () => {
    mpFalso(mundo({ pagamentos: { 123: pagamento({ collector_id: OUTRO_VENDEDOR, leitores: [VENDEDOR] }) } }));
    const db = await cenario();
    expect((await tratar(db)).r).toEqual({ http: 200, resultado: "collector_diferente" });
    expect(gravou(db, "cobrancas")).toBe(false);
  });
  it("a referência é de um aluno de OUTRA conta do Physiq → 200 referencia_de_outra_conta e nada gravado", async () => {
    mpFalso(mundo({ pagamentos: { 123: pagamento({ external_reference: `physiq:staging:aluno:${P9}:avulsa:${COB}` }) } }));
    const db = await cenario();
    expect((await tratar(db)).r).toEqual({ http: 200, resultado: "referencia_de_outra_conta" });
    expect(gravou(db, "cobrancas")).toBe(false);
  });
  it("W1b M4: mensalidade/avulsa SEM o id da cobrança → 200 referencia_sem_cobranca e nada gravado", async () => {
    for (const tipo of ["mensalidade", "avulsa"]) {
      mpFalso(mundo({ pagamentos: { 123: pagamento({ external_reference: `physiq:staging:aluno:${P1}:${tipo}` }) } }));
      const db = await cenario();
      expect((await tratar(db)).r, tipo).toEqual({ http: 200, resultado: "referencia_sem_cobranca" });
      expect(gravou(db, "cobrancas")).toBe(false);
    }
  });
  it("outro ambiente na referência → outro_ambiente; a referência que não é de aluno → nao_e_de_aluno", async () => {
    mpFalso(mundo({ pagamentos: { 123: pagamento({ external_reference: `physiq:public:aluno:${P1}:avulsa:${COB}` }), 124: pagamento({ id: 124, external_reference: "pedido-da-loja-77" }) } }));
    const db = await cenario();
    expect((await tratar(db)).r.resultado).toBe("outro_ambiente");
    expect((await tratar(db, aviso({ id: "124" }))).r.resultado).toBe("nao_e_de_aluno");
    expect(gravou(db, "cobrancas")).toBe(false);
  });
  it("a cobrança da referência é do MP do Physiq (collector nulo) → cobranca_de_outro_collector; já com OUTRO pagamento → cobranca_de_outro_pagamento", async () => {
    mpFalso(mundo());
    let db = await cenario({ cobrancas: [cobranca({ mp_collector_id: null })] });
    expect((await tratar(db)).r.resultado).toBe("cobranca_de_outro_collector");
    expect(gravou(db, "cobrancas")).toBe(false);
    db = await cenario({ cobrancas: [cobranca({ mp_payment_id: "999" })] });
    expect((await tratar(db)).r.resultado).toBe("cobranca_de_outro_pagamento");
    expect(db.tabelas.cobrancas[0]).toMatchObject({ status: "aguardando_confirmacao", mp_payment_id: "999" });
  });
  it("recorrente (a cobrança do mês da automática) → a linha nova nasce com o mp_collector_id da conta (a regra da coluna nova)", async () => {
    mpFalso(mundo({ pagamentos: { 321: pagamento({ id: 321, payment_method_id: "visa", external_reference: `physiq:staging:aluno:${P1}:recorrente`,
      metadata: { preapproval_id: "pre9" } }) } }));
    const db = await cenario();
    expect((await tratar(db, aviso({ id: "321" }))).r).toEqual({ http: 200, resultado: "recorrente_paga" });
    const nova = db.tabelas.cobrancas.find((c) => c.mp_payment_id === "321");
    expect(nova).toMatchObject({ paciente_id: P1, conta_id: CONTA, tipo: "mensalidade", forma: "mp", status: "paga", mp_preapproval_id: "pre9",
      mp_collector_id: VENDEDOR, origem: "assinatura" });
    // o mesmo aviso de novo: nada dobra (mp_payment_id — a mesma linha)
    expect((await tratar(db, aviso({ id: "321" }))).r.resultado).toBe("recorrente_paga");
    expect(db.tabelas.cobrancas.filter((c) => c.mp_payment_id === "321")).toHaveLength(1);
  });
  it("mpc-b: a cobrança do mês da automática RECUSADA → a linha nova recusada + 1 linha mp_cartao_recusado com o motivo; o aviso repetido não repete", async () => {
    mpFalso(mundo({ pagamentos: { 321: pagamento({ id: 321, payment_method_id: "visa", status: "rejected", status_detail: "cc_rejected_insufficient_amount",
      date_approved: null, external_reference: `physiq:staging:aluno:${P1}:recorrente`, metadata: { preapproval_id: "pre9" } }) } }));
    const db = await cenario();
    const r1 = await tratar(db, aviso({ id: "321" }));
    expect(r1.r).toEqual({ http: 200, resultado: "recorrente_cancelada" });
    expect(r1.linhas.filter((l) => l.campos.codigo === "mp_cartao_recusado")).toEqual([{ nivel: "aviso", campos: expect.objectContaining({
      codigo: "mp_cartao_recusado", acao: "aviso_mp_conta", ref: "321", externo: { mp_status_detail: "cc_rejected_insufficient_amount" } }) }]);
    const r2 = await tratar(db, aviso({ id: "321" }));
    expect(r2.r.resultado).toBe("recorrente_cancelada");
    expect(r2.linhas.filter((l) => l.campos.codigo === "mp_cartao_recusado")).toEqual([]);
  });
  it("sem a referência: pelo preapproval guardado (a automática DESTA conta) → registra; a de outro collector → ignora", async () => {
    const sem = { external_reference: null, metadata: { preapproval_id: "pre9" } };
    mpFalso(mundo({ pagamentos: { 400: pagamento({ id: 400, ...sem }) } }));
    let db = await cenario({ aluno_assinaturas: [{ id: "as-1", paciente_id: P1, conta_id: CONTA, mp_preapproval_id: "pre9", status: "authorized",
      mp_collector_id: VENDEDOR, payload: {} }] });
    expect((await tratar(db, aviso({ id: "400" }))).r.resultado).toBe("recorrente_paga");
    expect(db.tabelas.cobrancas.find((c) => c.mp_payment_id === "400")).toMatchObject({ mp_collector_id: VENDEDOR, mp_preapproval_id: "pre9" });
    db = await cenario({ aluno_assinaturas: [{ id: "as-1", paciente_id: P1, conta_id: CONTA, mp_preapproval_id: "pre9", status: "authorized",
      mp_collector_id: null, payload: {} }] });
    expect((await tratar(db, aviso({ id: "400" }))).r.resultado).toBe("assinatura_de_outro_collector");
    db = await cenario();
    expect((await tratar(db, aviso({ id: "400" }))).r.resultado).toBe("assinatura_inexistente");
    expect(gravou(db, "cobrancas")).toBe(false);
  });
  it("desconectada há menos de 7 dias (ainda com token) → o Pix pago depois da troca ainda dá baixa (só leitura — decisão 10)", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario({ recebimento_integracoes: [await integracao({ status: "desconectada", desconectada_em: new Date(Date.now() - DIA).toISOString() })] });
    expect((await tratar(db)).r.resultado).toBe("cobranca_paga_paga");
    expect(idas.map((i) => i.token)).toEqual([TOKEN_CONTA]);
  });
});

describe("tratarDaConta — o 401, o MP fora e o modo (I2, MENOR 34)", () => {
  it("I2: 401 no pagamento de OUTRO vendedor com o /users/me 200 → 200 nao_achado; a integração segue ATIVA e nenhuma renovação", async () => {
    const idas = mpFalso(mundo({ alheio401: true, pagamentos: { 123: pagamento({ collector_id: OUTRO_VENDEDOR }) } }));
    const db = await cenario();
    expect((await tratar(db)).r).toEqual({ http: 200, resultado: "nao_achado" });
    expect(idas.map((i) => i.caminho)).toEqual(["/v1/payments/123", "/users/me"]);
    expect(db.tabelas.recebimento_integracoes[0]).toMatchObject({ status: "ativa", mp_erro: null });
    expect(gravou(db, "recebimento_integracoes")).toBe(false);
    semOauth(idas);
  });
  it("MENOR 34: o token recusado (401 e o /users/me 401) → 500 conta_sem_acesso, SEM renovar e sem marcar erro (o job renova)", async () => {
    const m = mundo();
    delete m.tokens[TOKEN_CONTA];
    const idas = mpFalso(m);
    const db = await cenario();
    expect((await tratar(db)).r).toEqual({ http: 500, resultado: "conta_sem_acesso" });
    expect(db.tabelas.recebimento_integracoes[0].status).toBe("ativa");
    expect(gravou(db, "recebimento_integracoes")).toBe(false);
    expect(db.tabelas.avisos).toEqual([]);
    semOauth(idas);
  });
  it("o MP fora → 500 mp_fora (o MP manda de novo); o pagamento de produção no staging (live_mode true) → nao_achado", async () => {
    mpFalso(mundo({ fora: true }));
    let db = await cenario();
    expect((await tratar(db, aviso(), { prazo: prazoDe(2_500) })).r).toEqual({ http: 500, resultado: "mp_fora" });
    mpFalso(mundo({ pagamentos: { 123: pagamento({ live_mode: true }) } }));
    db = await cenario();
    expect((await tratar(db)).r).toEqual({ http: 200, resultado: "nao_achado" });
    expect(gravou(db, "cobrancas")).toBe(false);
  });
  it("o acesso vencido (mp_expira_em no passado) → 500 conta_sem_acesso sem ir ao MP (o job marca o erro)", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario({ recebimento_integracoes: [await integracao({ mp_expira_em: new Date(Date.now() - 60_000).toISOString() })] });
    expect((await tratar(db)).r).toEqual({ http: 500, resultado: "conta_sem_acesso" });
    expect(idas).toEqual([]);
  });
});

describe("tratarDaConta — a x-signature (decisão 9: só registra até a flag exigir)", () => {
  const assinar = (dataId: string, requestId: string, ts: string, segredo = SEGREDO) =>
    `ts=${ts},v1=${createHmac("sha256", segredo).update(manifestoDaAssinatura(dataId, requestId, ts)).digest("hex")}`;
  it("com a flag exigir: sem assinatura → 401 (log aviso); com a assinatura certa → passa", async () => {
    ambiente({ MP_WEBHOOK_ASSINATURA: SEGREDO });
    const idas = mpFalso(mundo());
    const db = await cenario({ app_config: [{ chave: "mp_webhook", valor: { exigir_assinatura: true } }] });
    const sem = await tratar(db);
    expect(sem.r).toEqual({ http: 401, resultado: "assinatura" });
    expect(sem.linhas).toContainEqual({ nivel: "aviso", campos: expect.objectContaining({ codigo: "aviso_mp_conta_sem_assinatura", resultado: "ausente" }) });
    expect(idas).toEqual([]);
    const errada = await tratar(db, aviso(), { req: pedido({ "x-signature": assinar("123", "req-1", "1760000000", "outro-segredo"), "x-request-id": "req-1" }) });
    expect(errada.r).toEqual({ http: 401, resultado: "assinatura" });
    // revisão M-1: o ts de agora (o assinado há mais de 5 min não passa — o caso abaixo)
    const agora = String(Math.floor(Date.now() / 1000));
    const certa = await tratar(db, aviso(), { req: pedido({ "x-signature": assinar("123", "req-1", agora), "x-request-id": "req-1" }) });
    expect(certa.r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
    expect(certa.linhas).toContainEqual({ nivel: "info", campos: expect.objectContaining({ codigo: "aviso_mp_conta", msg: "assinatura valida" }) });
  });
  it("revisão M-1: com a flag exigir, a assinatura amarra O QUE e QUANDO — o id do aviso é o data.id ASSINADO (o da busca) e o ts de até 5 min", async () => {
    ambiente({ MP_WEBHOOK_ASSINATURA: SEGREDO });
    const idas = mpFalso(mundo());
    const db = await cenario({ app_config: [{ chave: "mp_webhook", valor: { exigir_assinatura: true } }] });
    const agora = String(Math.floor(Date.now() / 1000));
    // o corpo diz 999; a busca (o que a assinatura cobre) diz 123: um aviso assinado capturado não trata outro id
    const trocado = await tratar(db, aviso({ id: "999" }), { url: URL_CONTA("123"),
      req: pedido({ "x-signature": assinar("123", "req-1", agora), "x-request-id": "req-1" }) });
    expect(trocado.r).toEqual({ http: 401, resultado: "assinatura" });
    expect(trocado.linhas).toContainEqual({ nivel: "aviso", campos: expect.objectContaining({ codigo: "aviso_mp_conta_sem_assinatura", resultado: "id_diferente" }) });
    // assinado há 10 min (capturado e reenviado depois) → recusa
    const velho = String(Math.floor(Date.now() / 1000) - 600);
    const atrasado = await tratar(db, aviso(), { req: pedido({ "x-signature": assinar("123", "req-1", velho), "x-request-id": "req-1" }) });
    expect(atrasado.r).toEqual({ http: 401, resultado: "assinatura" });
    expect(atrasado.linhas).toContainEqual({ nivel: "aviso", campos: expect.objectContaining({ codigo: "aviso_mp_conta_sem_assinatura", resultado: "fora_do_prazo" }) });
    expect(idas).toEqual([]);                                               // nada foi ao MP
    // o ts em milissegundos (o simulador local do e2e/w2/api.py) há 1 min → passa
    const ms = String(Date.now() - 60_000);
    const certo = await tratar(db, aviso(), { req: pedido({ "x-signature": assinar("123", "req-1", ms), "x-request-id": "req-1" }) });
    expect(certo.r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
  });
  it("revisão M-1: sem a flag (o padrão), nada muda — o id do corpo diferente da busca e o ts velho só vão ao log; o aviso é tratado pelo do corpo", async () => {
    ambiente({ MP_WEBHOOK_ASSINATURA: SEGREDO });
    mpFalso(mundo());
    const db = await cenario();
    const velho = String(Math.floor(Date.now() / 1000) - 3600);
    const { r } = await tratar(db, aviso(), { url: URL_CONTA("999"), req: pedido({ "x-signature": assinar("999", "req-1", velho), "x-request-id": "req-1" }) });
    expect(r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
  });
  it("com a flag desligada (o padrão): a assinatura inválida só vai ao log e o aviso é tratado", async () => {
    ambiente({ MP_WEBHOOK_ASSINATURA: SEGREDO });
    mpFalso(mundo());
    const db = await cenario();
    const { r, linhas } = await tratar(db, aviso(), { req: pedido({ "x-signature": "ts=1,v1=00", "x-request-id": "req-1" }) });
    expect(r.resultado).toBe("cobranca_paga_paga");
    expect(linhas).toContainEqual({ nivel: "info", campos: expect.objectContaining({ codigo: "aviso_mp_conta", msg: "assinatura invalida" }) });
  });
});

describe("tratarDaConta — a automática (preapproval) e a cobrança autorizada", () => {
  it("existente → o espelho; nova com a referência recorrente → gravada com o mp_collector_id; outro collector ou aluno de outra conta → ignorada", async () => {
    const m = mundo({ assinaturas: { pre9: preapproval() } });
    mpFalso(m);
    const pre = aviso({ topico: "subscription_preapproval", id: "pre9" });
    let db = await cenario();
    expect((await tratar(db, pre)).r).toEqual({ http: 200, resultado: "assinatura_authorized_gravada" });
    expect(db.tabelas.aluno_assinaturas).toEqual([expect.objectContaining({ paciente_id: P1, conta_id: CONTA, mp_preapproval_id: "pre9",
      status: "authorized", mp_collector_id: VENDEDOR, valor: 100 })]);
    m.assinaturas.pre9 = preapproval({ status: "cancelled" });
    expect((await tratar(db, pre)).r.resultado).toBe("assinatura_cancelled");
    expect(db.tabelas.aluno_assinaturas).toHaveLength(1);
    expect(db.tabelas.aluno_assinaturas[0].status).toBe("cancelled");
    m.assinaturas.pre9 = preapproval({ collector_id: OUTRO_VENDEDOR, leitores: [VENDEDOR] });
    db = await cenario();
    expect((await tratar(db, pre)).r.resultado).toBe("collector_diferente");
    m.assinaturas.pre9 = preapproval({ external_reference: `physiq:staging:aluno:${P9}:recorrente` });
    expect((await tratar(db, pre)).r.resultado).toBe("referencia_de_outra_conta");
    expect(gravou(db, "aluno_assinaturas")).toBe(false);
  });
  it("a linha guardada de OUTRA conta do Physiq não recebe o espelho; a simulada do staging também não", async () => {
    mpFalso(mundo({ assinaturas: { pre9: preapproval({ status: "cancelled" }) } }));
    const pre = aviso({ topico: "preapproval", id: "pre9" });
    let db = await cenario({ aluno_assinaturas: [{ id: "as-9", paciente_id: P9, conta_id: OUTRA, mp_preapproval_id: "pre9", status: "authorized", payload: {} }] });
    expect((await tratar(db, pre)).r.resultado).toBe("referencia_de_outra_conta");
    db = await cenario({ aluno_assinaturas: [{ id: "as-1", paciente_id: P1, conta_id: CONTA, mp_preapproval_id: "pre9", status: "authorized", payload: { simulada: true } }] });
    expect((await tratar(db, pre)).r.resultado).toBe("assinatura_simulada");
    expect(gravou(db, "aluno_assinaturas")).toBe(false);
  });
  it("a cobrança autorizada (subscription_authorized_payment) → o pagamento dela pelo caminho da conta; sem pagamento ainda → espera", async () => {
    const m = mundo({
      autorizadas: { 5001: { id: 5001, collector_id: VENDEDOR, payment: { id: 321 } }, 5002: { id: 5002, collector_id: VENDEDOR, payment: null } },
      pagamentos: { 321: pagamento({ id: 321, external_reference: `physiq:staging:aluno:${P1}:recorrente`, metadata: { preapproval_id: "pre9" } }) },
    });
    const idas = mpFalso(m);
    const db = await cenario();
    expect((await tratar(db, aviso({ topico: "subscription_authorized_payment", id: "5001" }))).r.resultado).toBe("recorrente_paga");
    expect(idas.map((i) => [i.caminho, i.token])).toEqual([["/authorized_payments/5001", TOKEN_CONTA], ["/v1/payments/321", TOKEN_CONTA]]);
    expect((await tratar(db, aviso({ topico: "subscription_authorized_payment", id: "5002" }))).r.resultado).toBe("cobranca_sem_pagamento_ainda");
  });
});

describe("tratarDaConta — o mp-connect (MENOR 5: a vinculação/desvinculação na conta do MP)", () => {
  const connect = aviso({ topico: "mp-connect", id: "999" });
  it("o token vale → 200 acesso_ok e nada muda", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario();
    expect((await tratar(db, connect)).r).toEqual({ http: 200, resultado: "acesso_ok" });
    expect(idas.map((i) => [i.caminho, i.token])).toEqual([["/users/me", TOKEN_CONTA]]);
    expect(gravou(db, "recebimento_integracoes")).toBe(false);
  });
  it("revogado (401) → erro acesso_revogado + 1 aviso ao dono, SEM renovar; de novo → nada muda (o aviso é 1 por dia)", async () => {
    const m = mundo();
    delete m.tokens[TOKEN_CONTA];
    const idas = mpFalso(m);
    const db = await cenario();
    expect((await tratar(db, connect)).r).toEqual({ http: 200, resultado: "acesso_revogado" });
    expect(db.tabelas.recebimento_integracoes[0]).toMatchObject({ status: "erro", mp_erro: "acesso_revogado" });
    expect(db.tabelas.avisos).toEqual([expect.objectContaining({ destino_user_id: DONO, tipo: "geral", link: "/painel/configuracoes/recebimento" })]);
    semOauth(idas);
    // a conta agora em erro: o reenvio volta 500 (conta_em_erro) sem ir ao MP e sem 2º aviso
    expect((await tratar(db, connect)).r).toEqual({ http: 500, resultado: "conta_em_erro" });
    expect(db.tabelas.avisos).toHaveLength(1);
  });
  it("o token de OUTRO usuário do MP → erro conta_trocada; o MP fora → 500 mp_fora", async () => {
    mpFalso(mundo({ tokens: { [TOKEN_CONTA]: 4242, [PHYSIQ_TEST]: PHYSIQ_ID } }));
    let db = await cenario();
    expect((await tratar(db, connect)).r).toEqual({ http: 200, resultado: "conta_trocada" });
    expect(db.tabelas.recebimento_integracoes[0]).toMatchObject({ status: "erro", mp_erro: "conta_trocada" });
    mpFalso(mundo({ fora: true }));
    db = await cenario();
    expect((await tratar(db, connect, { prazo: prazoDe(2_500) })).r).toEqual({ http: 500, resultado: "mp_fora" });
    expect(db.tabelas.recebimento_integracoes[0].status).toBe("ativa");
  });
});

// ───────────────────────── o aviso da URL do painel, pelo user_id ─────────────────────────

describe("pelaContaDoUserId — o aviso SEM &conta= com o user_id de uma integração (I1 + MENOR 5)", () => {
  const URL_PAINEL = new URL("https://x.supabase.co/functions/v1/mp-webhook-aluno?schema=staging&data.id=123&type=payment");
  async function pelaUserId(db: DbFalso, corpo: Record<string, unknown>) {
    const { d, linhas } = deps(db);
    return { r: await A.pelaContaDoUserId(d, pedido(), URL_PAINEL, "staging", corpo), linhas };
  }
  const corpo = (o: Record<string, unknown> = {}) => ({ type: "payment", action: "payment.updated", data: { id: "123" }, user_id: VENDEDOR, ...o });

  it("sem user_id, schema sem a W2 ou o user_id de ninguém → null (o caminho de hoje, o MP do Physiq)", async () => {
    mpFalso(mundo());
    expect((await pelaUserId(await cenario(), corpo({ user_id: undefined }))).r).toBeNull();
    expect((await pelaUserId(await cenario(), corpo({ user_id: "abc" }))).r).toBeNull();
    expect((await pelaUserId(await cenario({}, { semW2: true }), corpo())).r).toBeNull();
    expect((await pelaUserId(await cenario(), corpo({ user_id: 31337 }))).r).toBeNull();
  });
  it("o user_id da conta do PHYSIQ → null sem olhar as integrações; o /users/me do Physiq vai 1 vez só (guardado na instância)", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario({ recebimento_integracoes: [await integracao({ mp_user_id: PHYSIQ_ID })] });
    expect((await pelaUserId(db, corpo({ user_id: PHYSIQ_ID }))).r).toBeNull();
    expect((await pelaUserId(db, corpo({ user_id: PHYSIQ_ID }))).r).toBeNull();
    expect(idas.map((i) => [i.caminho, i.token])).toEqual([["/users/me", PHYSIQ_TEST]]);
    expect(gravou(db, "cobrancas")).toBe(false);
  });
  it("o /users/me do Physiq sem resposta: o user_id de uma integração → 500 mp_fora (não arrisca nem perde o aviso); de ninguém → null", async () => {
    const m = mundo({ usersMeFora: true });
    const idas = mpFalso(m);
    const db = await cenario();
    expect((await pelaUserId(db, corpo())).r).toEqual({ http: 500, resultado: "mp_fora" });
    expect((await pelaUserId(db, corpo({ user_id: 31337 }))).r).toBeNull();
    expect(gravou(db, "cobrancas")).toBe(false);
    // não guardou: quando o MP volta, o reenvio é tratado pela conta
    m.usersMeFora = false;
    expect((await pelaUserId(db, corpo())).r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
    expect(idas.filter((i) => i.caminho === "/users/me").length).toBe(3);
  });
  it("o user_id de uma integração conhecida → tratado pela conta (o token DELA) → paga", async () => {
    const idas = mpFalso(mundo());
    const db = await cenario();
    expect((await pelaUserId(db, corpo())).r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
    expect(idas.map((i) => [i.caminho, i.token])).toEqual([["/users/me", PHYSIQ_TEST], ["/v1/payments/123", TOKEN_CONTA]]);
    expect(db.tabelas.cobrancas[0].status).toBe("paga");
  });
  it("2 contas do Physiq com a MESMA conta do MP: a referência é da 2ª → paga na 2ª (tenta cada uma)", async () => {
    mpFalso(mundo({ pagamentos: { 123: pagamento({ external_reference: `physiq:staging:aluno:${P9}:avulsa:${COB}` }) } }));
    const db = await cenario({
      recebimento_integracoes: [await integracao(), await integracao({}, OUTRA, TOKEN_OUTRA)],
      cobrancas: [cobranca({ paciente_id: P9, conta_id: OUTRA })],
    });
    expect((await pelaUserId(db, corpo())).r).toEqual({ http: 200, resultado: "cobranca_paga_paga" });
    expect(db.tabelas.cobrancas[0].status).toBe("paga");
  });
  it("o mp-connect pelo user_id confere TODAS as contas daquela conta do MP (o acesso foi tirado de todas)", async () => {
    const m = mundo();
    delete m.tokens[TOKEN_CONTA];
    delete m.tokens[TOKEN_OUTRA];
    mpFalso(m);
    const db = await cenario({ recebimento_integracoes: [await integracao(), await integracao({}, OUTRA, TOKEN_OUTRA)] });
    expect((await pelaUserId(db, { type: "mp-connect", action: "application.deauthorized", data: { id: "1" }, user_id: VENDEDOR })).r)
      .toEqual({ http: 200, resultado: "acesso_revogado" });
    expect(db.tabelas.recebimento_integracoes.map((i) => [i.conta_id, i.status, i.mp_erro])).toEqual([
      [CONTA, "erro", "acesso_revogado"], [OUTRA, "erro", "acesso_revogado"],
    ]);
    expect(db.tabelas.avisos.map((a) => a.destino_user_id).sort()).toEqual([DONO, DONO_OUTRA].sort());
  });
});

// ───────────────────────── a fila das automáticas: a credencial de cada uma ─────────────────────────

describe("automaticas-fila — a credencial de CADA automática (credencial.ts)", () => {
  let F: ModFila;
  beforeEach(async () => {
    F = await import("../../supabase-principal/functions/automaticas-fila/credencial");
  });
  const assinatura = (o: Linha = {}) => ({ id: "as-1", paciente_id: P1, conta_id: CONTA, mp_preapproval_id: "pre9", status: "authorized",
    valor: 100, payload: {}, mp_collector_id: VENDEDOR, ...o });
  const ctxMp = (chave: CryptoKey | null = CHAVE) => (): ContextoMpConta => {
    if (!chave) throw new Error("nao deveria");
    return { schema: "staging", log: logFalso().log, prazo: prazoDe(20_000), chave, oauth: null };
  };
  it("a do MP do Physiq (collector nulo) → a do schema, sem ler integração nem a chave", async () => {
    const db = await cenario();
    const r = await F.credencialDaPendencia(db.cliente, () => { throw new Error("sem chave"); }, assinatura({ mp_collector_id: null }), "test");
    expect(r).toEqual({ cred: "test" });
    expect(db.pedidos).toEqual([]);
  });
  it("a da conta com a integração ativa → a credencial DA CONTA (o token decifrado), para o PUT ir à conta certa", async () => {
    const db = await cenario();
    const r = await F.credencialDaPendencia(db.cliente, ctxMp(), assinatura(), "test");
    expect(r.cred).toMatchObject({ tipo: "conta", contaId: CONTA, collectorId: VENDEDOR, token: TOKEN_CONTA });
  });
  it("sem acesso ao MP da conta (desconectada, em erro, outra conta do MP, sem a MP_TOKENS_CHAVE) → semAcesso com o motivo", async () => {
    let db = await cenario({ recebimento_integracoes: [await integracao({ status: "desconectada", desconectada_em: new Date().toISOString() })] });
    expect(await F.credencialDaPendencia(db.cliente, ctxMp(), assinatura(), "test")).toEqual({ semAcesso: "outra_conta_ou_desconectada" });
    db = await cenario({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    expect(await F.credencialDaPendencia(db.cliente, ctxMp(), assinatura(), "test")).toEqual({ semAcesso: "erro" });
    db = await cenario();
    expect(await F.credencialDaPendencia(db.cliente, ctxMp(), assinatura({ mp_collector_id: OUTRO_VENDEDOR }), "test"))
      .toEqual({ semAcesso: "outra_conta_ou_desconectada" });
    const { MpContaSemAcesso } = await import("../../supabase-principal/functions/_shared/mp-conta");
    const semChave = (): ContextoMpConta => {
      throw new MpContaSemAcesso("-", "nao_configurado");
    };
    expect(await F.credencialDaPendencia(db.cliente, semChave, assinatura(), "test")).toEqual({ semAcesso: "nao_configurado" });
  });
  it("a que NÃO vai ao MP (cancelada, simulada, sem id) numa conta em erro → a do schema: fecha sem_automatica, sem falhar 24 vezes", async () => {
    const db = await cenario({ recebimento_integracoes: [await integracao({ status: "erro", mp_erro: "acesso_recusado" })] });
    for (const a of [assinatura({ status: "cancelled" }), assinatura({ mp_preapproval_id: "sim-1" }), assinatura({ payload: { simulada: true } }),
      assinatura({ mp_preapproval_id: null })]) {
      expect(await F.credencialDaPendencia(db.cliente, ctxMp(), a, "test")).toEqual({ cred: "test" });
    }
    expect(await F.credencialDaPendencia(db.cliente, ctxMp(), null, "test")).toEqual({ cred: "test" });
    expect(db.pedidos).toEqual([]);
  });
  it("assinaturaDoAluno — C2: no schema sem a W2 o select NÃO cita a mp_collector_id; com a W2, cita (a credencial depende dela)", async () => {
    const linha = assinatura();
    let db = await cenario({ aluno_assinaturas: [linha] }, { semW2: true });
    const sem = await F.assinaturaDoAluno(db.cliente, "staging", P1);
    expect(sem).toMatchObject({ id: "as-1", paciente_id: P1, conta_id: CONTA, mp_preapproval_id: "pre9", status: "authorized" });
    expect(sem && "mp_collector_id" in sem).toBe(false);
    vi.resetModules();
    F = await import("../../supabase-principal/functions/automaticas-fila/credencial");
    db = await cenario({ aluno_assinaturas: [linha] });
    expect(await F.assinaturaDoAluno(db.cliente, "staging", P1)).toMatchObject({ mp_collector_id: VENDEDOR });
  });
});

// ───────────────────────── o contrato do código das entradas ─────────────────────────

describe("contrato do código — a index.ts da mp-webhook-aluno (o Deno.serve não roda no Vitest)", () => {
  let index = "";
  let serve = "";
  beforeEach(() => {
    index = fonte("mp-webhook-aluno/index.ts");
    serve = index.slice(index.indexOf("Deno.serve("));
  });
  it("MENOR 4: o corpo é medido (lerAte) antes do JSON.parse; nada de req.json(); passou → 413", () => {
    expect(index).not.toMatch(/req\.json\(/);
    expect(serve.indexOf("await lerAte(req, LIMITE_CORPO)")).toBeGreaterThan(-1);
    expect(serve.indexOf("await lerAte(req, LIMITE_CORPO)")).toBeLessThan(serve.indexOf("JSON.parse("));
    expect(serve).toContain('resposta(413, "corpo_grande")');
  });
  it("o &conta= vai ao tratarDaConta com o prazo de 18 s (MENOR 34); o teto por IP só sem user_id (MENOR 6); o user_id do painel antes do caminho de hoje (I1)", () => {
    expect(serve).toMatch(/const daConta = lerAvisoDaConta\(url, corpo\);/);
    expect(serve).toMatch(/daConta\.userId === null && !permitidoIp\(ip\)\) return resposta\(429, "limite"\)/);
    expect(serve).toMatch(/await tratarDaConta\(deps, req, url, schema, daConta, prazo\(PRAZO_CONTA_MS\)\)/);
    expect(serve.indexOf("await pelaContaDoUserId(deps, req, url, schema, corpo)")).toBeGreaterThan(serve.indexOf("lerAvisoDaConta(url, corpo)"));
    expect(serve.indexOf("await pelaContaDoUserId(deps, req, url, schema, corpo)")).toBeLessThan(serve.indexOf("const dados ="));
    expect(index).toContain('const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") ?? null;');
    expect(serve).toContain('ipDoPedido(req.headers, PROXY_SEGREDO) ?? "sem-ip"');
  });
  it("W1b M4 também no caminho de hoje: mensalidade/avulsa sem o id da cobrança não vira cobrança (antes do carregarMatricula)", () => {
    const corpo = index.slice(index.indexOf("async function tratarPagamento"), index.indexOf("async function tratarAssinatura"));
    const m4 = corpo.indexOf('if (ref.tipo !== "recorrente") return "referencia_sem_cobranca";');
    expect(m4).toBeGreaterThan(corpo.indexOf("if (ref.cobrancaId)"));
    expect(m4).toBeLessThan(corpo.indexOf("await carregarMatricula(db, ref.pacienteId)"));
  });
  it("mpc-b: em TODA gravação de pagamento do aviso (o MP do Physiq, a do personal e a conferência do app) a recusa vai ao log com o motivo, logo depois", () => {
    const depois = (fonteTs: string, alvo: RegExp) => [...fonteTs.matchAll(alvo)].map((x) => x[1]);
    // index.ts: a cobrança, a recorrente, a automática sem a referência nova e o Calc antigo (o MP do Physiq) — 4 gravações, 4 linhas
    const doIndex = depois(index, /const r = await (?:aplicarPagamentoMp|registrarPagamentoAvulsoDoMp)\([^;]*?\);\n([^\n]*)/g);
    expect(doIndex).toHaveLength(4);
    for (const l of doIndex) expect(l).toMatch(/^\s+registrarRecusaDoAviso\(log, schema, pay, r, "aviso_mp"\);$/);
    // conta.ts: a cobrança e a recorrente (o MP do personal)
    const daConta = depois(fonte("mp-webhook-aluno/conta.ts"), /const r = await (?:aplicarPagamentoMp|registrarPagamentoAvulsoDoMp)\([^;]*?\);\n([^\n]*)/g);
    expect(daConta).toHaveLength(2);
    for (const l of daConta) expect(l).toMatch(/^\s+registrarRecusaDoAviso\(t\.log, t\.schema, pay, r, "aviso_mp_conta"\);$/);
    // a conferência do app (pagamentos-aluno): pode ver a recusa antes do aviso
    expect(fonte("pagamentos-aluno/index.ts")).toContain(
      'registrarRecusaDoAviso(log, schema, r.pay, await aplicarPagamentoMp(db, c, r.pay, m, log, schema), "aluno_conferir");');
  });
  it("I4: sem cache de \"repetido\" (nem na index.ts, nem no conta.ts)", () => {
    for (const f of ["mp-webhook-aluno/index.ts", "mp-webhook-aluno/conta.ts"]) expect(fonte(f), f).not.toMatch(/recente\(|repetido_/);
  });
});

describe("contrato do código — o conta.ts (as guardas da hml-06 que valem para a index.ts)", () => {
  let conta = "";
  beforeEach(() => {
    conta = fonte("mp-webhook-aluno/conta.ts");
  });
  it("todo id que vai ao caminho da API do MP passa pelo encodeURIComponent", () => {
    const caminhos = [...conta.matchAll(/`\/(?:v1\/payments|preapproval|authorized_payments)\/\$\{([^}]*)\}/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThanOrEqual(3);
    for (const c of caminhos) expect(c).toMatch(/^encodeURIComponent\(/);
  });
  it("MENOR 34: toda credencial e toda busca do aviso SEM renovar", () => {
    const creds = [...conta.matchAll(/credencialDaConta\(([^)]*)\)/g)].map((m) => m[1]);
    expect(creds.length).toBeGreaterThan(0);
    for (const c of creds) expect(c).toContain("renovar: false");
    const buscas = [...conta.matchAll(/buscarNaConta<[^>]*>\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(buscas.length).toBeGreaterThanOrEqual(3);
    for (const b of buscas) expect(b).toContain("{ renovar: false }");
  });
  it("nenhuma gravação ignora o erro do banco; nenhum req.json()", () => {
    expect(conta).not.toMatch(/^\s*await [\w.]+\.from\("(cobrancas|aluno_assinaturas|recebimento_integracoes)"\)\.(update|insert)\(/m);
    expect(conta).not.toMatch(/req\.json\(/);
  });
});

describe("contrato do código — a automaticas-fila e a exclusão do personal (Deno.serve / esm.sh no topo)", () => {
  it("a fila: a assinatura pelas colunas da regra nova, a credencial de cada uma e o PUT com ela; sem acesso → mp_conta_sem_acesso", () => {
    const fila = fonte("automaticas-fila/index.ts");
    expect(fila).toMatch(/await assinaturaDoAluno\(r\.db, r\.schema, p\.paciente_id\)/);
    expect(fila).toMatch(/await credencialDaPendencia\(r\.db, ctxMp, atual, r\.credencial\)/);
    expect(fila).toMatch(/assinaturaComoNoMp\(r\.db, escolha\.cred, atual, ctx\)/);
    expect(fila).toMatch(/trocarValorDaAutomatica\(r\.db, escolha\.cred, a, /);
    expect(fila).not.toMatch(/(assinaturaComoNoMp|trocarValorDaAutomatica)\(r\.db, r\.credencial/);
    expect(fila).toContain('erro = "mp_conta_sem_acesso";');
    expect(fila).toContain('throw new MpContaSemAcesso("-", "nao_configurado");');
    expect(fila).toContain("const chaveMp = await chaveDoAmbiente();");
  });
  it("a exclusão: os alunos pela credencial de CADA assinatura; sem acesso ao MP da conta = falha (502 e nada apagado)", () => {
    const exc = fonte("_shared/exclusao-profissional.ts");
    const corpo = exc.slice(exc.indexOf("cancelarDosAlunos:"), exc.indexOf("cancelarSolta:"));
    expect(corpo).toMatch(/cancelarAssinaturasPorCredencial\(db, \{ schema: p\.schema, log: p\.log, prazo: mp\.prazo! \}, ctxMp, credencial, ids,\s*"profissional_excluiu_a_conta"\)/);
    expect(corpo).toContain("falhas: r.falhas + r.semAcesso");
    expect(corpo).not.toContain("cancelarAssinaturasDasMatriculas(");
    expect(exc).toContain('throw new MpContaSemAcesso("-", "nao_configurado");');
    expect(exc).toContain("const chaveMp = await chaveDoAmbiente();");
  });
});
