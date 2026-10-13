// Physiq hml-21a (H-112) — o MOTOR COMUM das leituras pelo servidor (supabase-principal/functions/_shared/leitura-servidor.ts): o que hoje
// está repetido em functions/nutricao/leituras.ts e functions/financeiro/leituras.ts, com o catálogo como parâmetro.
// A prova principal é DIFERENCIAL: cada consulta dos 2 catálogos de hoje (as 64 da nutricao e as 12 da financeiro) roda no módulo de hoje
// E no motor comum, com o MESMO banco falso (o papel do PostgREST e do Storage, como a pessoa) — e os 2 têm de dar a MESMA resposta, os
// MESMOS pedidos ao banco/Storage (na mesma ordem, com os mesmos argumentos) e as MESMAS linhas de log (fora o `ms`). Roda com os params
// válidos gerados pela declaração de cada consulta (os booleanos ligados e desligados, nos 2 schemas), com o banco respondendo bem, com
// erro e lançando; e os casos de borda (o laço no teto e no prazo, a página além do fim, o { ok: false } das RPCs da conta, os lotes).
// Depois, o motor com um 3º catálogo (de teste): a ordem, o erro por item, o dedupe, o laço de 1000 com teto, e o erro do banco que nunca
// vaza a mensagem. A nutricao e a financeiro publicadas seguem com os módulos de hoje (migram na hml-21c): este teste é a garantia dela.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOTE_MAX, ehRpc, type CatalogoLeitura, type ConsultaLeitura, type FonteRpc, type FonteTabela, type ParamLeitura, type ParamSimples,
} from "../../supabase-principal/functions/_shared/leitura-lote";
import { atenderLeitura as motor, bucketPadrao, type CatalogoDoServidor } from "../../supabase-principal/functions/_shared/leitura-servidor";
import { CONSULTAS_NUTRICAO, bucketDaLeitura } from "../../supabase-principal/functions/_shared/nutricao-leituras";
import { CONSULTAS_FINANCEIRO, filtroEmAbertoOuNoPeriodo, type ConsultaFinanceiro } from "../../supabase-principal/functions/_shared/financeiro-leituras";
import { atenderLeitura as moduloNutricao } from "../../supabase-principal/functions/nutricao/leituras";
import { atenderLeitura as moduloFinanceiro } from "../../supabase-principal/functions/financeiro/leituras";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRO = "99999999-9999-4999-8999-999999999999";
const CONTA = "66666666-6666-4666-8666-666666666666";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Os 2 catálogos de hoje no formato do motor comum (o que cada módulo faz de diferente vira opção — a hml-21c leva para as funções). */
const NUTRICAO: CatalogoDoServidor = { consultas: CONSULTAS_NUTRICAO as unknown as CatalogoLeitura, bucketDaLeitura };
const FINANCEIRO: CatalogoDoServidor = {
  consultas: CONSULTAS_FINANCEIRO as unknown as CatalogoLeitura,
  erroNoValorDaRpc: true,
  filtrosExtras: (consulta, params) => {
    const o = (consulta as ConsultaFinanceiro).emAbertoOuNoPeriodo;
    const ou = o ? filtroEmAbertoOuNoPeriodo(o, params) : null;
    return ou === null ? [] : [{ op: "ou", filtro: ou }];
  },
};

// ───────────────────────── o banco falso (grava cada pedido; responde pelo "comportamento" do cenário) ─────────────────────────
type Resposta = { data: unknown; error: unknown; count?: number | null };
interface Comportamento {
  tabela?: (tabela: string, passos: unknown[][], opcoes: unknown) => Resposta;
  rpc?: (nome: string, args: Record<string, unknown>) => Resposta;
  assinarVarios?: (bucket: string, caminhos: string[]) => Resposta;
  assinarUm?: (bucket: string, caminho: string, opcoes: unknown) => Resposta;
  /** o cliente lança (o supabase-js que quebra) */
  lancar?: boolean;
}
function bancoFalso(b: Comportamento) {
  const pedidos: unknown[] = [];
  const cliente = {
    rpc: (nome: string, args: Record<string, unknown>) => {
      pedidos.push(["rpc", nome, args]);
      if (b.lancar) throw new Error("o cliente quebrou");
      return Promise.resolve(b.rpc ? b.rpc(nome, args) : { data: null, error: null });
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: unknown) => {
        const passos: unknown[][] = [];
        const registro = ["from", tabela, colunas, opcoes ?? null, passos];
        pedidos.push(registro);
        const busca: Record<string, unknown> = {};
        for (const op of ["in", "eq", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) {
          busca[op] = (...args: unknown[]) => (passos.push([op, ...args]), busca);
        }
        busca.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
          if (b.lancar) return Promise.reject(new Error("o cliente quebrou")).then(ok, falhou);
          const r = b.tabela ? b.tabela(tabela, passos, opcoes) : { data: [], error: null, count: (opcoes as { count?: string } | undefined)?.count ? 0 : null };
          return Promise.resolve(r).then(ok, falhou);
        };
        return busca;
      },
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (caminhos: string[], validade: number) => {
          pedidos.push(["assinar", bucket, [...caminhos], validade]);
          return Promise.resolve(b.assinarVarios ? b.assinarVarios(bucket, caminhos) : { data: [], error: null });
        },
        createSignedUrl: (caminho: string, validade: number, opcoes?: unknown) => {
          pedidos.push(["assinar_um", bucket, caminho, validade, opcoes ?? null]);
          return Promise.resolve(b.assinarUm ? b.assinarUm(bucket, caminho, opcoes) : { data: null, error: { status: 400 } });
        },
      }),
    },
  };
  return { cliente, pedidos };
}
function logFalso() {
  const linhas: unknown[] = [];
  const anotar = (nivel: string) => (a: unknown, b?: unknown) => {
    // a excecao recebe o erro inteiro: guarda só o nome e a mensagem (o log.ts limpa); o `ms` varia de uma volta para outra
    const campos = (nivel === "excecao" ? b : a) as Record<string, unknown> | undefined;
    const semMs = campos ? Object.fromEntries(Object.entries(campos).filter(([k]) => k !== "ms")) : campos;
    linhas.push(nivel === "excecao" ? [nivel, String((a as Error)?.message ?? a), semMs] : [nivel, semMs]);
  };
  return { linhas, log: { info: anotar("info"), aviso: anotar("aviso"), erro: anotar("erro"), excecao: anotar("excecao") } };
}

type Rodar = (c: never) => Promise<unknown>;
/** Roda o MESMO pedido no módulo de hoje e no motor comum (cada um com o seu banco falso, do mesmo comportamento) e devolve os 2 lados. */
async function lado(
  rodar: Rodar,
  corpo: Record<string, unknown>,
  b: Comportamento,
  schema: "public" | "staging",
  prazo?: () => { esgotado(): boolean },
) {
  const banco = bancoFalso(b);
  const l = logFalso();
  const c = { schema, origin: null, corpo, userId: EU, comoPessoa: banco.cliente, log: l.log, ...(prazo ? { prazo: prazo() } : {}) };
  let resposta: unknown;
  try {
    resposta = await rodar(c as never);
  } catch (e) {
    resposta = { lancou: String((e as Error)?.message) };
  }
  return { resposta: JSON.parse(JSON.stringify(resposta)), pedidos: JSON.parse(JSON.stringify(banco.pedidos)), log: JSON.parse(JSON.stringify(l.linhas)) };
}
async function comparar(
  modulo: Rodar,
  catalogo: CatalogoDoServidor,
  corpo: Record<string, unknown>,
  b: Comportamento,
  schema: "public" | "staging" = "staging",
  prazo?: () => { esgotado(): boolean },
) {
  const hoje = await lado(modulo, corpo, b, schema, prazo);
  const comum = await lado(((c: never) => motor(c, catalogo)) as Rodar, corpo, b, schema, prazo);
  expect(comum).toEqual(hoje);
  return hoje;
}

// ───────────────────────── os params válidos de cada consulta, pela declaração ─────────────────────────
const INSTANTES = ["2026-10-01T03:00:00.000Z", "2026-10-02T03:00:00.000Z", "2026-10-03T03:00:00.000Z"];
function valorValido(nome: string, p: ParamLeitura | ParamSimples, ligado: boolean, n: number): unknown {
  switch (p.tipo) {
    case "uuid":
      return nome === "conta" ? CONTA : U(n);
    case "uuids":
      return p.max >= 2 ? [U(n), U(n + 1)] : [U(n)];
    case "data":
      return nome === "ate" ? "2026-10-31" : "2026-10-01";
    case "inteiro":
      return nome === "pagina" ? Math.min(p.max, Math.max(p.min, 2)) : Math.min(p.max, Math.max(p.min, 1));
    case "texto":
      return "abc".slice(0, Math.max(0, p.max));
    case "booleano":
      return ligado;
    case "enum":
      return p.valores[0];
    case "instante":
      return INSTANTES[0];
    case "instantes":
      return INSTANTES.slice(0, Math.max(1, Math.min(3, p.max)));
    case "textos":
      return ["abc"];
    case "objeto": {
      const o: Record<string, unknown> = {};
      for (const [k, campo] of Object.entries(p.campos)) o[k] = valorValido(k, campo, ligado, n + 7);
      return o;
    }
  }
}
function paramsValidos(consulta: ConsultaLeitura, ligado: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 1;
  for (const [nome, p] of Object.entries(consulta.params)) out[nome] = valorValido(nome, p, ligado, (n += 2));
  return out;
}

/** O banco que responde BEM, rico o bastante para passar por todos os caminhos (assinar, porDia, os ★, a série RPC → linhas). */
function bancoBom(consulta: ConsultaLeitura): Comportamento {
  const linhas = [
    { id: U(51), path: "pasta/a.jpg", nome: "a.pdf", data_hora: "2026-10-02T12:00:00.000Z", numero: 3 },
    { id: U(52), path: "pasta/b.jpg", nome: "b.pdf", data_hora: "2026-10-02T15:00:00.000Z", numero: 2 },
  ];
  const f = consulta.fonte;
  return {
    tabela: (_t, _p, opcoes) => {
      const o = opcoes as { count?: string; head?: boolean } | undefined;
      if (o?.head) return { data: null, error: null, count: 7 };
      return { data: linhas, error: null, count: o?.count ? 50 : null };
    },
    rpc: () => {
      if (ehRpc(f) && (f as FonteRpc).filtrarLista) {
        return { data: [{ nutricionista_id: EU, paciente: { conta_id: CONTA } }, { nutricionista_id: OUTRO, paciente: { conta_id: CONTA } }], error: null };
      }
      return { data: { ok: true, total: 2, fotos: [{ path: "pasta/f.jpg" }, { path: "pasta/g.jpg" }], ids: [U(61), U(62)], itens: [{ id: U(63) }] }, error: null };
    },
    assinarVarios: (bucket, caminhos) => ({
      data: caminhos.map((p) => ({ path: p, signedUrl: `https://ref.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t`, error: null })),
      error: null,
    }),
    assinarUm: (bucket, caminho, opcoes) => ({
      data: { signedUrl: `https://ref.supabase.co/storage/v1/object/sign/${bucket}/${caminho}?token=t${(opcoes as { download?: string } | null)?.download ? "&download=1" : ""}` },
      error: null,
    }),
  };
}
/** O banco que responde com ERRO em tudo (o RLS que recusa, a RPC que levanta, o Storage fora). */
const bancoComErro = (codigo: string, mensagem: string): Comportamento => ({
  tabela: () => ({ data: null, error: { code: codigo, message: mensagem }, count: null }),
  rpc: () => ({ data: null, error: { code: codigo, message: mensagem } }),
  assinarVarios: () => ({ data: null, error: { status: 503 } }),
  assinarUm: () => ({ data: null, error: { statusCode: "503" } }),
});

const CATALOGOS: Array<[string, Rodar, CatalogoDoServidor, Record<string, ConsultaLeitura>]> = [
  ["nutricao", moduloNutricao as unknown as Rodar, NUTRICAO, CONSULTAS_NUTRICAO as unknown as Record<string, ConsultaLeitura>],
  ["financeiro", moduloFinanceiro as unknown as Rodar, FINANCEIRO, CONSULTAS_FINANCEIRO as unknown as Record<string, ConsultaLeitura>],
];

describe("hml-21a (H-112) — o motor comum dá o MESMO que os 2 módulos de hoje, consulta por consulta", () => {
  it("os 2 catálogos de hoje: 64 consultas na nutricao e 12 na financeiro (todas passam pelo diferencial abaixo)", () => {
    expect(Object.keys(CONSULTAS_NUTRICAO)).toHaveLength(64);
    expect(Object.keys(CONSULTAS_FINANCEIRO)).toHaveLength(12);
  });

  for (const [nome, modulo, catalogo, consultas] of CATALOGOS) {
    it(`${nome}: cada consulta com o banco BOM — os booleanos ligados e desligados, nos 2 schemas`, async () => {
      let casos = 0;
      for (const [q, consulta] of Object.entries(consultas)) {
        for (const ligado of [true, false]) {
          for (const schema of ["staging", "public"] as const) {
            const hoje = await comparar(modulo, catalogo, { acao: "ler", itens: [{ ...paramsValidos(consulta, ligado), q }] }, bancoBom(consulta), schema);
            // a consulta rodou de verdade (não é o diferencial de 2 recusas iguais)
            expect((hoje.resposta as { ok?: boolean }).ok, `${q}`).toBe(true);
            expect(((hoje.resposta as { itens: Array<{ ok: boolean; erro?: string }> }).itens[0]), `${q} ${ligado}`).toMatchObject({ ok: expect.any(Boolean) });
            casos++;
          }
        }
      }
      expect(casos).toBe(Object.keys(consultas).length * 4);
    });

    it(`${nome}: cada consulta com o banco que RECUSA (42501), que levanta um código desconhecido (P0001) e que QUEBRA (lança)`, async () => {
      for (const [q, consulta] of Object.entries(consultas)) {
        const corpo = { acao: "ler", itens: [{ ...paramsValidos(consulta, true), q }] };
        await comparar(modulo, catalogo, corpo, bancoComErro("42501", "permission denied for table x"));
        await comparar(modulo, catalogo, corpo, bancoComErro("P0001", "boom"));
        await comparar(modulo, catalogo, corpo, { lancar: true });
        // o prazo que acaba logo (o laço e o total por dia param antes da leitura)
        await comparar(modulo, catalogo, corpo, bancoBom(consulta), "staging", () => ({ esgotado: () => true }));
      }
    });

    it(`${nome}: cada RPC que levanta de propósito um dos seus códigos (FonteRpc.erros) e que devolve { ok: false, erro } de propósito`, async () => {
      for (const [q, consulta] of Object.entries(consultas)) {
        if (!ehRpc(consulta.fonte)) continue;
        const erros = (consulta.fonte as FonteRpc).erros ?? ["sem_acesso"];
        const corpo = { acao: "ler", itens: [{ ...paramsValidos(consulta, true), q }] };
        for (const codigo of erros) {
          await comparar(modulo, catalogo, corpo, { rpc: () => ({ data: null, error: { code: "P0001", message: codigo } }) });
          await comparar(modulo, catalogo, corpo, { rpc: () => ({ data: { ok: false, erro: codigo }, error: null }) });
        }
      }
    });
  }

  it("os casos de borda nos 2: a página além do fim (PGRST103), o laço no teto (muitas_linhas) e a contagem que falta", async () => {
    // nutricao: os resultados de exame (o laço de 1000 × 50) e o diário (a página com o total)
    const cheia = { tabela: () => ({ data: Array.from({ length: 1000 }, (_, i) => ({ id: U(1000 + i) })), error: null, count: null }) };
    for (const [, modulo, catalogo, consultas] of CATALOGOS) {
      for (const [q, consulta] of Object.entries(consultas)) {
        if (ehRpc(consulta.fonte)) continue;
        const f = consulta.fonte as FonteTabela;
        const corpo = { acao: "ler", itens: [{ ...paramsValidos(consulta, true), q }] };
        if (f.laco) await comparar(modulo, catalogo, corpo, cheia);
        if (f.pagina || f.faixa) await comparar(modulo, catalogo, corpo, { tabela: () => ({ data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } }) });
        if (f.contar) await comparar(modulo, catalogo, corpo, { tabela: () => ({ data: [], error: null, count: null }) });
      }
    }
  });

  it("os lotes nos 2: a ordem, o dedupe, a q desconhecida, o param ruim, o lote vazio e o de 17", async () => {
    for (const [, modulo, catalogo, consultas] of CATALOGOS) {
      const qs = Object.keys(consultas);
      const itens = qs.slice(0, 5).map((q) => ({ ...paramsValidos(consultas[q], true), q }));
      const lote = [...itens, itens[0], { q: "nao_existe" }, { q: qs[0], ...paramsValidos(consultas[qs[0]], true), x_extra: 1 }, { q: "__proto__" }];
      await comparar(modulo, catalogo, { acao: "ler", itens: lote.slice(0, LOTE_MAX) }, bancoBom(consultas[qs[0]]));
      await comparar(modulo, catalogo, { acao: "ler", itens: [] }, {});
      await comparar(modulo, catalogo, { acao: "ler" }, {});
      await comparar(modulo, catalogo, { acao: "ler", itens: Array.from({ length: LOTE_MAX + 1 }, () => ({ q: qs[0] })) }, {});
      // um param fora da forma (o uuid ruim) só naquele item
      const comUuid = qs.find((q) => Object.values(consultas[q].params).some((p) => p.tipo === "uuid" && p.obrigatorio));
      if (comUuid) {
        const ruim = { ...paramsValidos(consultas[comUuid], true), q: comUuid };
        for (const [k, p] of Object.entries(consultas[comUuid].params)) if (p.tipo === "uuid") ruim[k] = "nao-e-uuid";
        await comparar(modulo, catalogo, { acao: "ler", itens: [ruim, itens[1]] }, bancoBom(consultas[comUuid]));
      }
    }
  });

  it("o { ok: false, erro } de propósito: no Financeiro vira o erro do item (aviso); na nutricao segue como valor — a opção do catálogo decide", async () => {
    const corpo = { acao: "ler", itens: [{ q: "fin_recibos", conta: CONTA, filtros: {}, offset: 0, limite: 20 }] };
    const fin = await comparar(moduloFinanceiro as unknown as Rodar, FINANCEIRO, corpo, { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) });
    expect(fin.resposta).toEqual({ ok: true, itens: [{ ok: false, erro: "sem_acesso" }] });
    // a mesma RPC sem a opção (o catálogo da financeiro "como a nutricao"): o valor volta como veio
    const semOpcao = await lado(((c: never) => motor(c, { ...FINANCEIRO, erroNoValorDaRpc: false })) as Rodar, corpo, { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) }, "staging");
    expect(semOpcao.resposta).toEqual({ ok: true, itens: [{ ok: true, valor: { ok: false, erro: "sem_acesso" } }] });
  });
});

// ───────────────────────── o motor com um 3º catálogo (o de teste): o que ele garante sozinho ─────────────────────────
const TESTE: CatalogoDoServidor = {
  consultas: {
    x_lista: {
      params: { aluno: { tipo: "uuid", obrigatorio: true } },
      fonte: { tabela: "x_tabela", colunas: ["id", "nome"], teto: 30, filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], ordem: [{ coluna: "criado_em", asc: false }] },
      dono: "destino_user_id",
    },
    x_todas: {
      params: {},
      fonte: { tabela: "x_tabela", colunas: ["id"], teto: 1000, ordem: [{ coluna: "id", asc: true }], laco: { tamanho: 1000, leituras: 3 } },
    },
    x_rpc: { params: { desde: { tipo: "instante" } }, fonte: { rpc: "x_rpc", args: { p_desde: "desde" }, erros: ["sem_acesso"] } },
    x_foto: {
      params: {},
      fonte: { tabela: "x_fotos", colunas: ["id", "path"], teto: 10 },
      assinar: { bucket: "x-bucket", coluna: "path", validade: 999_999 },
    },
  },
  filtrosExtras: (_c, params) => (params.aluno ? [{ op: "eq", coluna: "extra", valor: "sim" }] : []),
};
async function lerTeste(itens: unknown[], b: Comportamento, prazo?: { esgotado(): boolean }) {
  const banco = bancoFalso(b);
  const l = logFalso();
  const r = await motor({ schema: "staging", corpo: { acao: "ler", itens }, userId: EU, comoPessoa: banco.cliente, log: l.log, ...(prazo ? { prazo } : {}) } as never, TESTE);
  return { r, itens: r.ok ? r.itens : [], pedidos: banco.pedidos as unknown[][], log: l.linhas as unknown[][] };
}

describe("hml-21a (H-112) — o motor comum com outro catálogo: ordem, erro por item, dedupe, laço, bucket, filtros a mais", () => {
  it("a resposta na ORDEM do pedido; o erro de um item não derruba os outros; os iguais rodam 1 vez", async () => {
    const { itens, pedidos } = await lerTeste(
      [{ q: "x_lista", aluno: U(1) }, { q: "x_rpc" }, { q: "x_lista", aluno: U(1) }, { q: "nao_existe" }, { q: "x_lista", aluno: "ruim" }],
      { tabela: () => ({ data: [{ id: "l1", nome: "a" }], error: null }), rpc: () => ({ data: null, error: { code: "42501", message: "permission denied" } }) },
    );
    expect(itens).toEqual([
      { ok: true, linhas: [{ id: "l1", nome: "a" }] }, { ok: false, erro: "sem_acesso" }, { ok: true, linhas: [{ id: "l1", nome: "a" }] },
      { ok: false, erro: "consulta_invalida" }, { ok: false, erro: "dados_invalidos" },
    ]);
    // o x_lista igual rodou 1 vez (2 pedidos ao banco no total: a tabela e a RPC)
    expect(pedidos.map((p) => p[0])).toEqual(["from", "rpc"]);
  });

  it("o select montado aqui: as colunas fechadas, o filtro do param, o DONO = quem chama, os filtros a mais no fim, a ordem e o teto", async () => {
    const { pedidos } = await lerTeste([{ q: "x_lista", aluno: U(1), destino_user_id: OUTRO, user_id: OUTRO }], { tabela: () => ({ data: [], error: null }) });
    expect(pedidos).toEqual([
      ["from", "x_tabela", "id, nome", null, [["eq", "paciente_id", U(1)], ["eq", "destino_user_id", EU], ["eq", "extra", "sim"], ["order", "criado_em", { ascending: false }], ["limit", 30]]],
    ]);
    expect(JSON.stringify(pedidos)).not.toContain(OUTRO);
  });

  it("o laço de 1000 com teto: TODAS as linhas até a leitura que vem com menos; passou do teto → muitas_linhas (aviso); o prazo → tempo_esgotado", async () => {
    const lote = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
    let k = 0;
    const a = await lerTeste([{ q: "x_todas" }], { tabela: () => ({ data: lote(++k < 3 ? 1000 : 5), error: null }) });
    expect((a.itens[0] as { linhas: unknown[] }).linhas).toHaveLength(2005);
    expect(a.pedidos.map((p) => (p[4] as unknown[][]).at(-1))).toEqual([["range", 0, 999], ["range", 1000, 1999], ["range", 2000, 2999]]);
    const b = await lerTeste([{ q: "x_todas" }], { tabela: () => ({ data: lote(1000), error: null }) });
    expect(b.itens).toEqual([{ ok: false, erro: "muitas_linhas" }]);
    expect(b.log).toContainEqual(["aviso", expect.objectContaining({ codigo: "muitas_linhas", acao: "x_todas", n: 3 })]);
    let n = 0;
    const c = await lerTeste([{ q: "x_todas" }], { tabela: () => ({ data: lote(1000), error: null }) }, { esgotado: () => ++n > 1 });
    expect(c.itens).toEqual([{ ok: false, erro: "tempo_esgotado" }]);
    expect(c.pedidos).toHaveLength(1);
  });

  it("o erro do banco NUNCA vaza: o item leva só o código; a mensagem vai ao log.excecao (que limpa) e nunca à resposta", async () => {
    const segredo = "duplicate key value violates unique constraint \"x_pkey\" Key (email)=(maria@exemplo.com)";
    for (const [code, erro] of [["XX000", "erro_interno"], ["23505", "conflito"], ["22P02", "dados_invalidos"], ["PGRST301", "sem_login"], ["", "erro_interno"]]) {
      const k = await lerTeste([{ q: "x_lista", aluno: U(1) }], { tabela: () => ({ data: null, error: { code, message: segredo } }) });
      expect(k.itens, code).toEqual([{ ok: false, erro }]);
      expect(JSON.stringify(k.r), code).not.toContain("maria");
    }
    // o tempo (TimeoutError do fetch) → tempo_esgotado, com o aviso ao Weslley (excecao)
    const t = await lerTeste([{ q: "x_rpc" }], { rpc: () => ({ data: null, error: { message: "TimeoutError: signal timed out" } }) });
    expect(t.itens).toEqual([{ ok: false, erro: "tempo_esgotado" }]);
    expect(t.log.some((l) => l[0] === "excecao")).toBe(true);
  });

  it("a RPC: os args montados aqui (o corpo nunca vira arg); o código de propósito volta como ele (aviso, sem excecao)", async () => {
    const k = await lerTeste([{ q: "x_rpc", desde: "2026-10-01T03:00:00.000Z", p_desde: "1900-01-01", user_id: OUTRO }], { rpc: () => ({ data: null, error: { message: "sem_acesso" } }) });
    expect(k.pedidos).toEqual([["rpc", "x_rpc", { p_desde: "2026-10-01T03:00:00.000Z" }]]);
    expect(k.itens).toEqual([{ ok: false, erro: "sem_acesso" }]);
    expect(k.log.some((l) => l[0] === "excecao")).toBe(false);
  });

  it("o bucket do ambiente sem o do catálogo: o '-staging' no staging; a validade no teto de 1 h; a URL relativa", async () => {
    expect([bucketPadrao("x-bucket", "staging"), bucketPadrao("x-bucket", "public")]).toEqual(["x-bucket-staging", "x-bucket"]);
    const k = await lerTeste([{ q: "x_foto" }], {
      tabela: () => ({ data: [{ id: "f1", path: "u/1.jpg" }], error: null }),
      assinarVarios: (bucket, caminhos) => ({ data: caminhos.map((p) => ({ path: p, signedUrl: `https://h/storage/v1/object/sign/${bucket}/${p}?token=t` })), error: null }),
    });
    expect(k.pedidos[1]).toEqual(["assinar", "x-bucket-staging", ["u/1.jpg"], 3600]);
    expect(k.itens).toEqual([{ ok: true, linhas: [{ id: "f1", path: "u/1.jpg", url: "/storage/v1/object/sign/x-bucket-staging/u/1.jpg?token=t" }] }]);
  });

  it("o log: 1 linha por pedido (ler, n, desfecho) e 1 por item recusado — nunca os params", async () => {
    const k = await lerTeste([{ q: "x_lista", aluno: U(77) }, { q: "x_lista", aluno: "texto-livre-da-pessoa" }], { tabela: () => ({ data: [], error: null }) });
    expect(k.log).toContainEqual(["info", expect.objectContaining({ codigo: "leitura", acao: "ler", n: 2, resultado: "parcial" })]);
    expect(JSON.stringify(k.log)).not.toMatch(/texto-livre|000000000077/);
  });
});

describe("hml-21a (H-112) — a fonte do motor: como a pessoa, sem chave secreta, sem a porta", () => {
  const fonte = readFileSync(resolve(RAIZ, "supabase-principal/functions/_shared/leitura-servidor.ts"), "utf-8");
  it("tudo pelo c.comoPessoa; nenhuma chave secreta, cliente de serviço ou Deno; não importa a porta", () => {
    expect(fonte).not.toMatch(/service_?role|SERVICE_ROLE|sb_secret|createClient|Deno\.env/);
    expect(fonte).toMatch(/c\.comoPessoa\.rpc\(/);
    expect(fonte).toMatch(/c\.comoPessoa\.from\(plano\.tabela\)/);
    expect(fonte).not.toMatch(/from "[^"]*porta-pessoa/);
  });
  it("os 2 módulos de hoje e o motor puro NÃO mudaram nesta W (a nutricao e a financeiro migram na hml-21c)", () => {
    // o motor comum é um arquivo NOVO; os módulos de hoje seguem sem importá-lo
    for (const m of ["nutricao/leituras.ts", "financeiro/leituras.ts"]) {
      expect(readFileSync(resolve(RAIZ, `supabase-principal/functions/${m}`), "utf-8")).not.toContain("leitura-servidor");
    }
  });
});

