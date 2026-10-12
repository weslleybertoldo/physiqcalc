// @vitest-environment node
// src/master/masterContasRecebimento.test.ts
// Physiq W2 (Task 12) — o "Desligar" do master cancela ANTES (MENOR 7 da revisão da W1): supabase-principal/functions/master-contas/recebimento.ts
// (o case "acao" › tipo "recebimento" da master-contas). Um banco FALSO em memória (as chamadas do supabase-js gravadas numa lista; sem a W2
// ele responde 42P01 ao mp_conexoes e 42703 a qualquer select com mp_collector_id), a master_conta_acao FALSA (a mesma regra do ramo
// 'recebimento' da migration da W2: modo_invalido, automaticas_ativas antes de trocar) e um fetch FALSO para as rotas do MP (o mpFetch e o
// /oauth/token usam o fetch global — vi.stubGlobal). Tokens e chave são de teste, feitos aqui; nada vai à rede. Cada teste importa o
// módulo de novo (vi.resetModules): a memória de 60 s do schemaTemW2 não vaza de um teste para o outro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrar, dadoAssociado, importarChave } from "../../supabase-principal/functions/_shared/cifra-mp";
import type { Log } from "../../supabase-principal/functions/_shared/log";
import type { Prazo } from "../../supabase-principal/functions/_shared/tempo";

type ModRecebimento = typeof import("../../supabase-principal/functions/master-contas/recebimento");

const CONTA = "c0a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b";
const DONO = "d0d0d0d0-1111-4222-8333-444455556666";
const MASTER = "f0f0f0f0-9999-4888-8777-666655554444";
const P1 = "a1111111-1111-4111-8111-111111111111";
const P2 = "a2222222-2222-4222-8222-222222222222";
const P3 = "a3333333-3333-4333-8333-333333333333";
const P4 = "a4444444-4444-4444-8444-444444444444";
const P6 = "a6666666-6666-4666-8666-666666666666";
const OUTRA_CONTA = "e0e0e0e0-2222-4333-8444-555566667777";
const U1 = "b1111111-1111-4111-8111-111111111111";
const U2 = "b2222222-2222-4222-8222-222222222222";
const U3 = "b3333333-3333-4333-8333-333333333333";
const COLLECTOR = 777;
const TOKEN_CONTA = "APP_USR-acesso-da-conta-0001";
const REFRESH_CONTA = "TG-refresh-da-conta-0001";
const PHYSIQ_TEST = "TEST-physiq-do-ambiente-0003";
const PHYSIQ_PROD = "APP_USR-physiq-producao-0004";
const CHAVE_B64 = Buffer.alloc(32, 9).toString("base64url");
const DIA = 86_400_000;
const VIVAS = ["authorized", "pending", "paused"];

const TEXTO_W1 = "Seu profissional mudou a forma de receber: a cobrança automática no cartão foi desligada. Veja em Pagamentos.";
const TEXTO_MENOR_17 = "Seu profissional mudou a forma de receber. Se o seu cartão continuar sendo cobrado pela cobrança automática, fale com o seu profissional.";

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
  faixa: [number, number] | null;
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
  is(col: string, v: null): Consulta;
  not(col: string, op: string, v: unknown): Consulta;
  in(col: string, v: unknown[]): Consulta;
  or(texto: string): Consulta;
  order(col: string, opcoes?: unknown): Consulta;
  limit(n: number): Consulta;
  range(de: number, ate: number): Consulta;
  maybeSingle(): Consulta;
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
    const embutida = /^(?:(\w+):)?(\w+)(?:!\w+)?\(/.exec(parte);   // pacientes!inner(conta_id) → "pacientes"
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
  if (p.tabela === "recebimento_integracoes" && /\bmp_/.test(`${p.colunas ?? ""} ${JSON.stringify(p.filtros)}`)) {
    return { code: "42703", message: "column recebimento_integracoes.mp_user_id does not exist" };   // as colunas do MP são da W2
  }
  if (!citaACollector(p)) return null;
  return p.op === "select"
    ? { code: "42703", message: `column ${p.tabela}.mp_collector_id does not exist` }
    : { code: "PGRST204", message: `Could not find the 'mp_collector_id' column of '${p.tabela}' in the schema cache` };
}

function criarDb(inicio: Record<string, Linha[]>, opcoes: { semW2?: boolean; responder?: (p: Pedido) => RespostaDb | undefined } = {}) {
  const tabelas: Record<string, Linha[]> = { mp_conexoes: [], avisos: [], conta_eventos: [], ...inicio };
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
      range: (de, ate) => muda(() => Object.assign(p, { faixa: [de, ate] })),
      maybeSingle: () => muda(() => Object.assign(p, { unico: true })),
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

/** Os alunos DESTA conta com automática viva — a mesma conta do mp_automaticas_vivas (Task 6). */
const alunosVivos = (db: DbFalso) => [...new Set((db.tabelas.aluno_assinaturas ?? [])
  .filter((a) => VIVAS.includes(String(a.status)) && valorDe(a, "pacientes.conta_id") === CONTA).map((a) => String(a.paciente_id)))];

/** A master_conta_acao('recebimento') FALSA: o ramo da migration da W2 (o master liga o MP do Physiq, o Pix e o "não cobrar"; sair de um
 *  MP com automática viva → automaticas_ativas, antes de trocar). `antes` roda antes de cada ida (a corrida, o gatilho que lança). */
function bancoFalso(db: DbFalso, antes?: (vez: number) => void) {
  const chamadas: Array<Record<string, unknown>> = [];
  const noBanco = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    chamadas.push({ ...args });
    antes?.(chamadas.length);
    const modo = typeof args.modo === "string" ? args.modo : null;
    if (!modo || !["pix_manual", "nenhum", "mercadopago"].includes(modo)) return { ok: false, erro: "modo_invalido" };
    const conta = db.tabelas.contas.find((c) => c.id === CONTA)!;
    const vivas = alunosVivos(db).length;
    if (["mercadopago", "mercadopago_conta"].includes(String(conta.recebimento_modo)) && modo !== conta.recebimento_modo && vivas > 0) {
      return { ok: false, erro: "automaticas_ativas", alunos: vivas };
    }
    conta.recebimento_modo = modo;
    return { ok: true, acao: "recebimento", conta: { id: CONTA, recebimento_modo: modo } };
  };
  return { noBanco, chamadas };
}

// ───────────────────────── o fetch falso, o log falso, o prazo, o ambiente ─────────────────────────

interface Ida { caminho: string; metodo: string; token: string | null; corpo: Record<string, unknown> | null }
type RespostaFalsa = { status: number; body?: unknown };
function rotasDoMp(responder: (ida: Ida) => RespostaFalsa) {
  const idas: Ida[] = [];
  const f = async (entrada: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const cab = new Headers(init.headers);
    const ida: Ida = {
      caminho: u.pathname + u.search, metodo: (init.method ?? "GET").toUpperCase(),
      token: cab.get("Authorization")?.replace(/^Bearer /, "") ?? null,
      corpo: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    idas.push(ida);
    const r = responder(ida);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  };
  vi.stubGlobal("fetch", f as typeof fetch);
  return { idas };
}
/** O MP de sempre: o PUT cancela; o /users/me da conta responde o collector dela. */
const mpQueCancela = (ida: Ida): RespostaFalsa => {
  if (ida.caminho === "/users/me") return { status: 200, body: { id: ida.token === TOKEN_CONTA ? COLLECTOR : 1 } };
  return { status: 200, body: { id: ida.caminho.split("/").pop(), status: ida.metodo === "PUT" ? "cancelled" : "authorized" } };
};
const putsDe = (idas: Ida[]) => idas.filter((i) => i.metodo === "PUT").map((i) => [i.caminho, i.token]);

function ambiente(env: Record<string, string> = {}) {
  vi.stubGlobal("Deno", { env: { get: (n: string) => ({ MP_TOKENS_CHAVE: CHAVE_B64, MP_ACCESS_TOKEN_TEST: PHYSIQ_TEST,
    MP_ACCESS_TOKEN_PROD: PHYSIQ_PROD, MP_CLIENT_ID: "1234567890123456", MP_CLIENT_SECRET: "client-secret-de-teste-000000000", ...env } as Record<string, string>)[n] } });
}

interface LinhaLog { nivel: "info" | "aviso" | "erro" | "excecao"; campos: Record<string, unknown> }
function logFalso(): { log: Log; linhas: LinhaLog[] } {
  const linhas: LinhaLog[] = [];
  const anotar = (nivel: LinhaLog["nivel"], campos: object) => linhas.push({ nivel, campos: { ...campos } });
  const log: Log = {
    info: (campos) => anotar("info", campos),
    aviso: (campos) => anotar("aviso", campos),
    erro: (campos) => anotar("erro", campos),
    excecao: (_erro, campos) => anotar("excecao", campos ?? {}),
  };
  return { log, linhas };
}
const prazoDe = (ms: number): Prazo => ({ restante: () => ms, esgotado: () => ms <= 0 });

// ───────────────────────── as peças de cada cenário ─────────────────────────

let CHAVE: CryptoKey;
async function integracao(o: Linha = {}): Promise<Linha> {
  return {
    conta_id: CONTA, provedor: "mercadopago", status: "ativa", mp_user_id: COLLECTOR, mp_apelido: "VENDEDOR_TESTE", mp_public_key: null,
    mp_access_token: await cifrar(TOKEN_CONTA, dadoAssociado("staging", CONTA, "access"), CHAVE),
    mp_refresh_token: await cifrar(REFRESH_CONTA, dadoAssociado("staging", CONTA, "refresh"), CHAVE),
    mp_expira_em: new Date(Date.now() + 90 * DIA).toISOString(), mp_teste: true, mp_origem: "oauth", mp_renovado_em: null,
    mp_renovando_ate: null, mp_renovar_tentativas: 0, mp_renovar_proxima_em: null, mp_erro: null, mp_avisado_em: null,
    mp_conferido_em: null, conectado_em: new Date(Date.now() - 10 * DIA).toISOString(), desconectada_em: null, ...o,
  };
}
const ass = (id: string, paciente: string, collector: number | null, status = "authorized", o: Linha = {}): Linha =>
  ({ id, paciente_id: paciente, conta_id: CONTA, mp_collector_id: collector, mp_preapproval_id: `pre-${id}`, status,
    payload: { origem: "teste" }, pacientes: { conta_id: CONTA }, ...o });
const pacientes = (): Linha[] => [
  { id: P1, conta_id: CONTA, user_id: U1 }, { id: P2, conta_id: CONTA, user_id: U2 }, { id: P3, conta_id: CONTA, user_id: U3 },
  { id: P4, conta_id: CONTA, user_id: null }, { id: P6, conta_id: CONTA, user_id: U1 },
];
/** P1 e P2 no MP do Physiq (collector nulo), P3 na conta do personal (collector = a integração). */
async function cenario(o: { modo?: string; integ?: Linha | null; assinaturas?: Linha[]; semW2?: boolean;
  responder?: (p: Pedido) => RespostaDb | undefined } = {}) {
  const assinaturas = o.assinaturas ?? [ass("as1", P1, null), ass("as2", P2, null, "pending"), ass("as3", P3, COLLECTOR)];
  return criarDb({
    contas: [{ id: CONTA, dono_id: DONO, recebimento_modo: o.modo ?? "mercadopago_conta", origem: "personal" },
      { id: OUTRA_CONTA, dono_id: U3, recebimento_modo: "mercadopago", origem: "personal" }],
    pacientes: pacientes(),
    aluno_assinaturas: assinaturas,
    recebimento_integracoes: o.integ === null ? [] : [o.integ ?? (await integracao())],
  }, { semW2: o.semW2, responder: o.responder });
}
const avisosPara = (db: DbFalso, destino: string) => db.tabelas.avisos.filter((a) => a.destino_user_id === destino).map((a) => a.titulo);
const statusDe = (db: DbFalso) => Object.fromEntries(db.tabelas.aluno_assinaturas.map((a) => [a.id, a.status]));

let R: ModRecebimento;
beforeAll(async () => {
  CHAVE = await importarChave(CHAVE_B64);
});
beforeEach(async () => {
  vi.resetModules();
  R = await import("../../supabase-principal/functions/master-contas/recebimento");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function pedido(db: DbFalso, banco: ReturnType<typeof bancoFalso>, o: { schema?: "public" | "staging"; prazo?: Prazo } = {}) {
  const { log, linhas } = logFalso();
  const p = { schema: o.schema ?? "staging", masterId: MASTER, db: db.cliente, log, prazo: o.prazo ?? prazoDe(20_000), noBanco: banco.noBanco } as const;
  return { p, linhas };
}

// ───────────────────────── os casos ─────────────────────────

describe("master-contas › recebimento — sem automática viva, nada muda do que já era", () => {
  it("sem automática viva: 1 ida ao banco, a resposta dele (200), nada no MP e nenhum aviso", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario({ assinaturas: [ass("as1", P1, null, "cancelled")] });
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual" });
    expect(r).toEqual({ status: 200, corpo: { ok: true, acao: "recebimento", conta: { id: CONTA, recebimento_modo: "pix_manual" } } });
    expect(banco.chamadas).toEqual([{ modo: "pix_manual" }]);
    expect(mp.idas).toHaveLength(0);
    expect(db.tabelas.avisos).toHaveLength(0);
  });
  it("modo inválido (o MP da conta e a InfinitePay só o dono liga; sem modo também): o 400 do banco, nada lido nem cancelado — mesmo com o OK", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    for (const args of [{ modo: "mercadopago_conta", cancelar_automaticas: true }, { modo: "infinitepay" }, {}]) {
      const db = await cenario();
      const banco = bancoFalso(db);
      const { p } = pedido(db, banco);
      expect(await R.trocarRecebimento(p, CONTA, args)).toEqual({ status: 400, corpo: { ok: false, erro: "modo_invalido" } });
      expect(banco.chamadas).toHaveLength(1);
      expect(db.pedidos).toHaveLength(0);
    }
    expect(mp.idas).toHaveLength(0);
  });
  it("os outros erros do banco saem como sempre (o status do statusDoErro: so_master 403, conta_inexistente 404)", async () => {
    ambiente();
    const db = await cenario();
    for (const [erro, status] of [["so_master", 403], ["conta_inexistente", 404], ["cobranca_legada", 400]] as const) {
      const { p } = pedido(db, { noBanco: async () => ({ ok: false, erro }), chamadas: [] });
      expect(await R.trocarRecebimento(p, CONTA, { modo: "nenhum", cancelar_automaticas: true })).toEqual({ status, corpo: { ok: false, erro } });
    }
    expect(db.pedidos).toHaveLength(0);
  });
});

describe("master-contas › recebimento — sair do MP com automática viva (MENOR 7)", () => {
  it("sem o OK: 409 automaticas_ativas com o nº de alunos — nada muda (nem no MP, nem no banco)", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario();
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco);
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual" })).toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_ativas", alunos: 3 } });
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: "sim" })).toMatchObject({ status: 409 });   // só o true vale
    expect(mp.idas).toHaveLength(0);
    expect(db.pedidos).toHaveLength(0);
    expect(statusDe(db)).toEqual({ as1: "authorized", as2: "pending", as3: "authorized" });
    expect(db.tabelas.contas[0].recebimento_modo).toBe("mercadopago_conta");
  });
  it("com o OK: cada uma com a credencial DELA (o Physiq pelo token do ambiente, a da conta pelo token decifrado), troca e avisa cada aluno (o texto da W1)", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario({ assinaturas: [ass("as1", P1, null), ass("as2", P2, null, "pending"), ass("as3", P3, COLLECTOR),
      ass("as4", P4, null, "paused"), ass("as5", P1, null, "cancelled"), ass("as10", P6, null)] });
    const banco = bancoFalso(db);
    const { p, linhas } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true });
    expect(r).toEqual({ status: 200, corpo: { ok: true, acao: "recebimento", conta: { id: CONTA, recebimento_modo: "pix_manual" },
      automaticas: { canceladas: 5, forcadas: 0 } } });
    expect(banco.chamadas).toEqual([{ modo: "pix_manual", cancelar_automaticas: true }, { modo: "pix_manual", cancelar_automaticas: true }]);
    expect(putsDe(mp.idas)).toEqual([["/preapproval/pre-as1", PHYSIQ_TEST], ["/preapproval/pre-as2", PHYSIQ_TEST], ["/preapproval/pre-as4", PHYSIQ_TEST],
      ["/preapproval/pre-as10", PHYSIQ_TEST], ["/preapproval/pre-as3", TOKEN_CONTA]]);
    expect(statusDe(db)).toEqual({ as1: "cancelled", as2: "cancelled", as3: "cancelled", as4: "cancelled", as5: "cancelled", as10: "cancelled" });
    expect(db.tabelas.aluno_assinaturas[2].payload).toMatchObject({ origem: "teste", motivo_cancelamento: "master_trocou_a_forma" });
    for (const u of [U1, U2, U3]) expect(avisosPara(db, u)).toEqual([TEXTO_W1]);                // P4 sem login: nenhum; U1 (P1 e P6): 1 só
    expect(db.tabelas.avisos).toHaveLength(3);
    expect(db.tabelas.avisos.every((a) => a.tipo === "geral" && a.link === "/perfil/pagamentos")).toBe(true);
    expect(db.tabelas.conta_eventos).toHaveLength(0);
    expect(linhas.filter((l) => l.nivel === "erro")).toHaveLength(0);
  });
  it("o MP recusa cancelar uma: 502 automaticas_nao_canceladas — o modo NÃO muda; quem foi desligado é avisado (W1); log.erro", async () => {
    ambiente();
    const mp = rotasDoMp((ida) => (ida.caminho === "/preapproval/pre-as2"
      ? (ida.metodo === "PUT" ? { status: 400, body: { message: "nao" } } : { status: 200, body: { id: "pre-as2", status: "authorized" } })
      : mpQueCancela(ida)));
    const db = await cenario();
    const banco = bancoFalso(db);
    const { p, linhas } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "nenhum", cancelar_automaticas: true, forcar_sem_acesso: true });
    expect(r).toEqual({ status: 502, corpo: { ok: false, erro: "automaticas_nao_canceladas", falhas: 1, canceladas: 2, sem_acesso: 0 } });
    expect(banco.chamadas).toHaveLength(1);
    expect(db.tabelas.contas[0].recebimento_modo).toBe("mercadopago_conta");
    expect(statusDe(db)).toEqual({ as1: "cancelled", as2: "pending", as3: "cancelled" });
    expect(avisosPara(db, U1)).toEqual([TEXTO_W1]);
    expect(avisosPara(db, U3)).toEqual([TEXTO_W1]);
    expect(avisosPara(db, U2)).toEqual([]);
    expect(putsDe(mp.idas).map((x) => x[0])).toContain("/preapproval/pre-as2");
    expect(linhas.some((l) => l.nivel === "erro" && l.campos.codigo === "automaticas_nao_canceladas" && l.campos.n === 1 && l.campos.ref === CONTA)).toBe(true);
  });
  it("a conta sem acesso (integração em erro): 409 automaticas_sem_acesso — o do Physiq cancela e avisa; o da conta fica; o modo não muda", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario({ integ: await integracao({ status: "erro", mp_erro: "acesso_recusado" }) });
    const banco = bancoFalso(db);
    const { p, linhas } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true });
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_sem_acesso", alunos: 1, canceladas: 2 } });
    expect(banco.chamadas).toHaveLength(1);
    expect(mp.idas.every((i) => i.token === PHYSIQ_TEST)).toBe(true);
    expect(statusDe(db)).toEqual({ as1: "cancelled", as2: "cancelled", as3: "authorized" });
    expect(avisosPara(db, U1)).toEqual([TEXTO_W1]);
    expect(avisosPara(db, U3)).toEqual([]);
    expect(avisosPara(db, DONO)).toEqual([]);
    expect(db.tabelas.conta_eventos).toHaveLength(0);
    expect(db.tabelas.contas[0].recebimento_modo).toBe("mercadopago_conta");
    expect(linhas.some((l) => l.nivel === "aviso" && l.campos.codigo === "automaticas_sem_acesso" && l.campos.n === 1)).toBe(true);
    // só o true força: o "sim" pergunta de novo (e o do Physiq já cancelado não conta)
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: "sim" }))
      .toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_sem_acesso", alunos: 1, canceladas: 0 } });
    expect(statusDe(db).as3).toBe("authorized");
    expect(db.tabelas.conta_eventos).toHaveLength(0);
  });
  it("sem a MP_TOKENS_CHAVE nas funções: a da conta conta como sem acesso (409), o do Physiq segue", async () => {
    ambiente({ MP_TOKENS_CHAVE: "" });
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario();
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco);
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true }))
      .toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_sem_acesso", alunos: 1, canceladas: 2 } });
    expect(mp.idas.every((i) => i.token === PHYSIQ_TEST)).toBe(true);
    expect(statusDe(db)).toEqual({ as1: "cancelled", as2: "cancelled", as3: "authorized" });
  });
});

describe("master-contas › recebimento — forçar sem acesso (decisão 11 + MENOR 17)", () => {
  it("marca no Physiq (cancelada_por = o master + o motivo), 1 evento, aviso ao dono com N e o texto do MENOR 17 a cada aluno; nada vai ao MP da conta; troca", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario({
      integ: await integracao({ status: "erro", mp_erro: "acesso_recusado" }),
      assinaturas: [ass("as1", P1, null), ass("as3", P3, COLLECTOR, "authorized", { payload: { antigo: 1 } }), ass("as8", P3, COLLECTOR, "pending"),
        ass("as6", P2, 888, "paused")],
    });
    const banco = bancoFalso(db);
    const { p, linhas } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: true });
    expect(r).toEqual({ status: 200, corpo: { ok: true, acao: "recebimento", conta: { id: CONTA, recebimento_modo: "pix_manual" },
      automaticas: { canceladas: 1, forcadas: 2 } } });
    expect(putsDe(mp.idas)).toEqual([["/preapproval/pre-as1", PHYSIQ_TEST]]);                     // nada vai ao MP da conta (nem à 888)
    expect(statusDe(db)).toEqual({ as1: "cancelled", as3: "cancelled", as8: "cancelled", as6: "cancelled" });
    const forcada = db.tabelas.aluno_assinaturas.find((a) => a.id === "as3")!;
    expect(forcada.payload).toMatchObject({ antigo: 1, cancelada_por: MASTER, motivo_cancelamento: "sem_acesso_ao_mp_do_personal" });
    expect(Date.parse(String((forcada.payload as Linha).cancelada_em))).toBeGreaterThan(Date.now() - 60_000);
    expect(db.tabelas.conta_eventos).toEqual([expect.objectContaining({ conta_id: CONTA, tipo: "outro", por: MASTER,
      depois: { w2: "forcou_sem_acesso", n: 2, assinaturas: 3 } })]);
    expect(avisosPara(db, DONO)).toEqual([R.textoDoDonoSemAcesso(2)]);
    expect(db.tabelas.avisos.find((a) => a.destino_user_id === DONO)?.link).toBe("/painel/configuracoes/recebimento");
    expect(avisosPara(db, U3)).toEqual([TEXTO_MENOR_17]);
    expect(avisosPara(db, U2)).toEqual([TEXTO_MENOR_17]);
    expect(avisosPara(db, U1)).toEqual([TEXTO_W1]);
    expect(banco.chamadas).toHaveLength(2);
    expect(linhas.some((l) => l.nivel === "aviso" && l.campos.codigo === "mp_forcou_sem_acesso" && l.campos.n === 2)).toBe(true);
  });
  it("a gravação do forçado é condicional: a assinatura que mudou no meio (o aviso do MP já a cancelou) não conta, nem gera evento ou aviso", async () => {
    ambiente();
    rotasDoMp(mpQueCancela);
    const db: DbFalso = await cenario({
      integ: await integracao({ status: "erro" }),
      assinaturas: [ass("as3", P3, COLLECTOR)],
      responder: (q) => {
        if (q.tabela === "aluno_assinaturas" && q.op === "update"
          && (q.valores?.payload as Linha | undefined)?.motivo_cancelamento === "sem_acesso_ao_mp_do_personal") {
          const l = db.tabelas.aluno_assinaturas.find((a) => a.id === "as3")!;
          l.status = "cancelled";                                           // o aviso do MP chegou entre a leitura e a gravação
          l.payload = { pelo_aviso: true };
        }
        return undefined;
      },
    });
    const { p } = pedido(db, bancoFalso(db));
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: true }))
      .toEqual({ status: 200, corpo: { ok: true, acao: "recebimento", conta: { id: CONTA, recebimento_modo: "pix_manual" },
        automaticas: { canceladas: 0, forcadas: 0 } } });
    expect(db.tabelas.aluno_assinaturas[0].payload).toEqual({ pelo_aviso: true });
    expect(db.tabelas.conta_eventos).toHaveLength(0);
    expect(avisosPara(db, DONO)).toEqual([]);
    expect(avisosPara(db, U3)).toEqual([]);
  });
  it("forçar não passa por cima de uma falha do MP: 502 e nada forçado (nem evento, nem aviso ao dono)", async () => {
    ambiente();
    rotasDoMp((ida) => (ida.caminho === "/preapproval/pre-as1"
      ? (ida.metodo === "PUT" ? { status: 400, body: {} } : { status: 200, body: { id: "pre-as1", status: "authorized" } })
      : mpQueCancela(ida)));
    const db = await cenario({ integ: await integracao({ status: "erro" }) });
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: true });
    expect(r).toMatchObject({ status: 502, corpo: { erro: "automaticas_nao_canceladas", falhas: 1, sem_acesso: 1 } });
    expect(statusDe(db)).toEqual({ as1: "authorized", as2: "cancelled", as3: "authorized" });
    expect(db.tabelas.conta_eventos).toHaveLength(0);
    expect(avisosPara(db, DONO)).toEqual([]);
    expect(avisosPara(db, U3)).toEqual([]);
  });
  it("o forçado só pega o que o Physiq NÃO alcança (collector preenchido) e só dos alunos desta conta que estavam na lista", async () => {
    ambiente();
    rotasDoMp(mpQueCancela);
    const P5 = "a5555555-5555-4555-8555-555555555555";
    let leituras = 0;
    const db: DbFalso = await cenario({
      integ: await integracao({ status: "desconectada", desconectada_em: new Date().toISOString() }),
      assinaturas: [ass("as1", P1, null), ass("as3", P3, COLLECTOR),
        ass("as7", P5, COLLECTOR, "authorized", { conta_id: OUTRA_CONTA, pacientes: { conta_id: OUTRA_CONTA } })],
      responder: (q) => {
        // a 2ª leitura dos alunos com automática viva (depois do cancelamento): nasce uma automática NOVA no MP do Physiq para o P1 — o
        // forçar NÃO a marca (o Physiq alcança: ela é cancelada de verdade numa nova tentativa) e o banco recusa a troca
        if (q.tabela === "aluno_assinaturas" && q.op === "select" && q.colunas === "paciente_id, pacientes!inner(conta_id)" && ++leituras === 2) {
          db.tabelas.aluno_assinaturas.push(ass("as9", P1, null));
        }
        return undefined;
      },
    });
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: true });
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_ativas", alunos: 1 } });
    expect(statusDe(db)).toEqual({ as1: "cancelled", as3: "cancelled", as7: "authorized", as9: "authorized" });
    expect(db.tabelas.conta_eventos).toEqual([expect.objectContaining({ depois: { w2: "forcou_sem_acesso", n: 1, assinaturas: 1 } })]);
    expect(avisosPara(db, U3)).toEqual([TEXTO_MENOR_17]);
  });
});

describe("master-contas › recebimento — o acesso tirado no MP (revogado) e as corridas", () => {
  it("revogado (decisão 11): o token recusado e a renovação recusada → a integração vira erro ANTES de cancelar → 409 sem acesso (não 502); nada vai ao MP da conta além do /users/me", async () => {
    ambiente();
    const mp = rotasDoMp((ida) => {
      if (ida.token === TOKEN_CONTA) return { status: 401, body: { message: "invalid access token" } };
      if (ida.caminho === "/oauth/token") return { status: 400, body: { error: "invalid_grant" } };
      return mpQueCancela(ida);
    });
    const db = await cenario();
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco);
    const r = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true });
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_sem_acesso", alunos: 1, canceladas: 2 } });
    expect(db.tabelas.recebimento_integracoes[0]).toMatchObject({ status: "erro", mp_erro: "acesso_recusado" });
    expect(mp.idas.filter((i) => i.token === TOKEN_CONTA).map((i) => [i.metodo, i.caminho])).toEqual([["GET", "/users/me"], ["GET", "/users/me"]]);
    expect(statusDe(db).as3).toBe("authorized");
    // e o forçar resolve logo (sem esperar o diário marcar o erro)
    const r2 = await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true, forcar_sem_acesso: true });
    expect(r2).toMatchObject({ status: 200, corpo: { ok: true, automaticas: { canceladas: 0, forcadas: 1 } } });
    expect(statusDe(db).as3).toBe("cancelled");
  });
  it("o acesso confere (/users/me = o collector): nada marcado, cancela com o token da conta", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario();
    const { p } = pedido(db, bancoFalso(db));
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true })).toMatchObject({ status: 200 });
    expect(db.tabelas.recebimento_integracoes[0]).toMatchObject({ status: "ativa", mp_erro: null });
    expect(mp.idas.filter((i) => i.token === TOKEN_CONTA).map((i) => [i.metodo, i.caminho])).toEqual([["GET", "/users/me"], ["PUT", "/preapproval/pre-as3"]]);
  });
  it("o token é de OUTRO usuário do MP (/users/me 200 com outro id): conta_trocada → sem acesso; só com automática na conta ele confere", async () => {
    ambiente();
    const mp = rotasDoMp((ida) => (ida.caminho === "/users/me" ? { status: 200, body: { id: 999 } } : mpQueCancela(ida)));
    const db = await cenario();
    const { p } = pedido(db, bancoFalso(db));
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true })).toMatchObject({ status: 409, corpo: { erro: "automaticas_sem_acesso" } });
    expect(db.tabelas.recebimento_integracoes[0]).toMatchObject({ status: "erro", mp_erro: "conta_trocada" });
    // sem automática VIVA na conta do personal (a dela já cancelada): nem confere (nenhuma ida com o token dela)
    const so = await cenario({ assinaturas: [ass("as1", P1, null), ass("as3", P3, COLLECTOR, "cancelled")] });
    const ida0 = mp.idas.length;
    const { p: p2 } = pedido(so, bancoFalso(so));
    expect(await R.trocarRecebimento(p2, CONTA, { modo: "pix_manual", cancelar_automaticas: true })).toMatchObject({ status: 200 });
    expect(mp.idas.slice(ida0).map((i) => [i.metodo, i.caminho, i.token])).toEqual([["PUT", "/preapproval/pre-as1", PHYSIQ_TEST]]);
  });
  it("o MP fora no /users/me não decide nada: segue para o cancelamento (que diz o resto)", async () => {
    ambiente();
    rotasDoMp((ida) => (ida.caminho === "/users/me" ? { status: 503, body: {} } : mpQueCancela(ida)));
    const db = await cenario();
    const { p } = pedido(db, bancoFalso(db), { prazo: prazoDe(2_500) });
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true })).toMatchObject({ status: 200 });
    expect(db.tabelas.recebimento_integracoes[0].status).toBe("ativa");
  });
  it("a corrida: a 2ª ida ao banco ainda vê automática viva → 409 automaticas_ativas (quem já foi desligado foi avisado)", async () => {
    ambiente();
    rotasDoMp(mpQueCancela);
    const db = await cenario();
    const banco = bancoFalso(db, (vez) => {
      if (vez === 2) db.tabelas.aluno_assinaturas.push(ass("as9", P4, null));
    });
    const { p } = pedido(db, banco);
    expect(await R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true }))
      .toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_ativas", alunos: 1 } });
    expect(avisosPara(db, U1)).toEqual([TEXTO_W1]);
    expect(db.tabelas.contas[0].recebimento_modo).toBe("mercadopago_conta");
  });
  it("o gatilho (P0001 automaticas_ativas:<n>, a corrida dentro da RPC) vira 409 com o n — nunca 500; outro erro do banco lança", async () => {
    ambiente();
    rotasDoMp(mpQueCancela);
    const db = await cenario();
    const gatilho = { noBanco: async () => { throw { code: "P0001", message: "automaticas_ativas:2", details: null, hint: "w2" }; }, chamadas: [] };
    expect(await R.trocarRecebimento(pedido(db, gatilho).p, CONTA, { modo: "pix_manual" }))
      .toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_ativas", alunos: 2 } });
    let vez = 0;
    const naSegunda = { noBanco: async (args: Record<string, unknown>) => {
      vez++;
      if (vez === 2) throw { code: "P0001", message: "automaticas_ativas:1" };
      return bancoFalso(db).noBanco(args);
    }, chamadas: [] };
    expect(await R.trocarRecebimento(pedido(db, naSegunda).p, CONTA, { modo: "pix_manual", cancelar_automaticas: true }))
      .toEqual({ status: 409, corpo: { ok: false, erro: "automaticas_ativas", alunos: 1 } });
    const quebrado = { noBanco: async () => { throw { code: "57014", message: "canceling statement due to statement timeout" }; }, chamadas: [] };
    await expect(R.trocarRecebimento(pedido(db, quebrado).p, CONTA, { modo: "pix_manual" })).rejects.toMatchObject({ code: "57014" });
  });
  it("erro do banco na leitura LANÇA (o catch da porta: 500) antes de ir ao MP", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario({ responder: (q) => (q.tabela === "aluno_assinaturas" && q.op === "select"
      ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } : undefined) });
    const { p } = pedido(db, bancoFalso(db));
    await expect(R.trocarRecebimento(p, CONTA, { modo: "pix_manual", cancelar_automaticas: true })).rejects.toMatchObject({ code: "57014" });
    expect(mp.idas).toHaveLength(0);
  });
});

describe("master-contas › recebimento — a regra da coluna nova (C2) e os textos", () => {
  it("schema sem a W2 (o public até a Task 22): cancela só pelo MP do Physiq (o token de produção), sem citar a coluna nova, e troca", async () => {
    ambiente();
    const mp = rotasDoMp(mpQueCancela);
    const db = await cenario({ modo: "mercadopago", integ: null, semW2: true,
      assinaturas: [ass("as1", P1, null), ass("as2", P2, null, "pending")].map(({ mp_collector_id: _fora, ...a }) => a) });
    const banco = bancoFalso(db);
    const { p } = pedido(db, banco, { schema: "public" });
    const r = await R.trocarRecebimento(p, CONTA, { modo: "nenhum", cancelar_automaticas: true, forcar_sem_acesso: true });
    expect(r).toMatchObject({ status: 200, corpo: { ok: true, automaticas: { canceladas: 2, forcadas: 0 } } });
    expect(putsDe(mp.idas)).toEqual([["/preapproval/pre-as1", PHYSIQ_PROD], ["/preapproval/pre-as2", PHYSIQ_PROD]]);
    expect(JSON.stringify(db.pedidos.filter((q) => q.tabela !== "mp_conexoes"))).not.toContain("mp_collector_id");
    expect(avisosPara(db, U1)).toEqual([TEXTO_W1]);
  });
  it("os textos: o da W1 igual, o do MENOR 17, o do dono com N e ≤ 160 (o sino corta em 160)", () => {
    expect(R.TEXTO_AUTOMATICA_DESLIGADA).toBe(TEXTO_W1);
    expect(R.TEXTO_AUTOMATICA_SEM_ACESSO).toBe(TEXTO_MENOR_17);
    for (const n of [1, 2, 37, 99_999]) {
      const t = R.textoDoDonoSemAcesso(n);
      expect(t).toContain(`${n} aluno(s)`);
      expect(t).toContain("app do Mercado Pago");
      expect(t.length).toBeLessThanOrEqual(160);
    }
    for (const t of [R.TEXTO_AUTOMATICA_DESLIGADA, R.TEXTO_AUTOMATICA_SEM_ACESSO, R.textoDoDonoSemAcesso(1)]) {
      expect(t).not.toMatch(/token|oauth|webhook|redirect|collector/i);
    }
  });
  it("a regra da coluna nova na própria função: toda linha de código com mp_collector_id em master-contas/** leva a marca (a guarda da Task 18)", () => {
    const pasta = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/master-contas");
    const soltas: string[] = [];
    let marcadas = 0;
    for (const nome of readdirSync(pasta).filter((n) => n.endsWith(".ts"))) {
      readFileSync(resolve(pasta, nome), "utf8").split("\n").forEach((linha, i) => {
        const t = linha.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        const codigo = linha.split("//")[0];
        if (!codigo.includes("mp_collector_id")) return;
        if (linha.includes("// W2: depois do schemaTemW2")) marcadas++;
        else soltas.push(`${nome}:${i + 1}`);
      });
    }
    expect(soltas).toEqual([]);
    expect(marcadas).toBeGreaterThan(0);
  });
});
