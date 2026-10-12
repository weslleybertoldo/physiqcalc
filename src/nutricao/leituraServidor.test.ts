// Physiq hml-20a (H-42 · jeito 2, etapa 2) — o MOTOR da ação `ler` (supabase-principal/functions/_shared/leitura-lote.ts), o CATÁLOGO da
// nutricao (_shared/nutricao-leituras.ts) e o módulo que roda as consultas COMO A PESSOA (functions/nutricao/leituras.ts — o import da
// porta é só de tipo, então ele roda aqui com um cliente falso que faz o papel do PostgREST/Storage com o RLS de quem chama).
// Positivo: cada `q` aceita os params certos, tem colunas explícitas (nenhum "*"), teto e, se "minha", o dono = quem chama; o lote mantém
// a ordem e roda 1 vez os itens iguais; a URL assinada sai só para o caminho que a própria consulta leu, relativa ao projeto.
// Negativo: q desconhecida → consulta_invalida; 17 itens → lote_grande; uuid/data/texto ruins → dados_invalidos; nutricionista_id,
// user_id e caminho no corpo são ignorados; o erro do banco vira o código (a mesma tabela do erroDoBanco); o log não leva params.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  LOTE_MAX, LOTE_PARALELO, PREFIXO_ASSINADA, Q_MAX, TETO_MAX, UUIDS_MAX, VALIDADE_MAX_S, argsDaRpc, assinaturaRelativa, caminhosParaAssinar, comUrls,
  comUrlsNaLista, ehRpc, erroDaLeitura, lerParams, lerPedidoDeLeitura, planoDaTabela, rodarLote, urlsAssinadas, valorDoParam,
  type CatalogoLeitura, type ConsultaLeitura, type FonteTabela, type ItemValido, type ParamLeitura, type RespostaDeItem,
} from "../../supabase-principal/functions/_shared/leitura-lote";
import {
  CONSULTAS_DA_NUTRICAO, CONSULTAS_NUTRICAO, DIARIO_IDS_MAX, VALIDADE_URL_LEITURA_S, bucketDaLeitura, consultaDaNutricao,
} from "../../supabase-principal/functions/_shared/nutricao-leituras";
import {
  ACOES_NUTRICAO, ACOES_DA_DIETA, ACOES_DO_ALUNO, ACOES_DA_AVALIACAO, erroDoBanco, moduloDoPedido,
} from "../../supabase-principal/functions/_shared/nutricao-regras";
import { atenderLeitura } from "../../supabase-principal/functions/nutricao/leituras";
import { RPC_SO_LEITURA } from "@/integrations/repeticao";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const D1 = "11111111-1111-4111-8111-111111111111";
const D2 = "22222222-2222-4222-8222-222222222222";
const D3 = "44444444-4444-4444-8444-444444444444";

// ───────────────────────── o cliente falso (o PostgREST e o Storage com o RLS do aluno) ─────────────────────────
interface Consulta {
  tabela: string;
  colunas: string | null;
  filtros: Array<[string, string, unknown]>;
  ordem: Array<[string, boolean]>;
  limite: number | null;
}
interface Banco {
  rpc?: (nome: string, args: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;
  tabela?: (c: Consulta) => { data: unknown; error: unknown };
  assinar?: (bucket: string, caminhos: string[], validade: number) => { data: unknown; error: unknown };
}

function clienteFalso(banco: Banco) {
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const consultas: Consulta[] = [];
  const assinaturas: Array<{ bucket: string; caminhos: string[]; validade: number }> = [];
  const cliente = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return banco.rpc ? await banco.rpc(nome, args) : { data: null, error: null };
    },
    from: (tabela: string) => {
      const c: Consulta = { tabela, colunas: null, filtros: [], ordem: [], limite: null };
      consultas.push(c);
      const b = {
        select: (colunas: string) => ((c.colunas = colunas), b),
        in: (col: string, v: unknown) => (c.filtros.push(["in", col, v]), b),
        eq: (col: string, v: unknown) => (c.filtros.push(["eq", col, v]), b),
        is: (col: string, v: unknown) => (c.filtros.push(["is", col, v]), b),
        order: (col: string, o: { ascending: boolean }) => (c.ordem.push([col, o.ascending]), b),
        limit: (n: number) => {
          c.limite = n;
          return Promise.resolve(banco.tabela ? banco.tabela(c) : { data: [], error: null });
        },
      };
      return b;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[], validade: number) => {
          assinaturas.push({ bucket, caminhos, validade });
          return banco.assinar ? banco.assinar(bucket, caminhos, validade) : { data: [], error: null };
        },
      }),
    },
  };
  return { cliente, rpcs, consultas, assinaturas };
}

/** O que o Storage devolve (o supabase-js monta a URL com o SUPABASE_URL da função — o <ref>.supabase.co). */
const assinadas = (bucket: string, caminhos: string[], extra: string[] = []) => ({
  data: [...caminhos, ...extra].map((p) => ({ path: p, error: null, signedUrl: `https://hkxv.supabase.co${PREFIXO_ASSINADA}${bucket}/${p}?token=t-${p.length}` })),
  error: null,
});

function contexto(corpo: Record<string, unknown>, banco: Banco) {
  const f = clienteFalso(banco);
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  const c = { schema: "staging" as const, origin: null, corpo, userId: EU, comoPessoa: f.cliente, log, prazo: { restante: () => 20_000 } };
  return { c: c as unknown as Parameters<typeof atenderLeitura>[0], ...f, log };
}
const itensDa = (r: Awaited<ReturnType<typeof atenderLeitura>>) => (r as unknown as { itens: RespostaDeItem[] }).itens;

// ───────────────────────── o motor ─────────────────────────
describe("hml-20a — o motor: o pedido `ler` (lerPedidoDeLeitura)", () => {
  const catalogo: CatalogoLeitura = {
    x: { params: { id: { tipo: "uuid", obrigatorio: true }, dia: { tipo: "data" } }, fonte: { rpc: "x" } },
    y: { params: {}, fonte: { rpc: "y" } },
  };

  it("lê cada item pelo catálogo, na ordem; a chave que o catálogo não declara cai (q vai por último e não troca a consulta)", () => {
    const r = lerPedidoDeLeitura({ itens: [{ q: "x", id: D1.toUpperCase(), nutricionista_id: OUTRA, user_id: OUTRA }, { q: "y", path: "a/b.jpg" }] }, catalogo);
    expect(r).toEqual({
      ok: true,
      itens: [
        { ok: true, q: "x", params: { id: D1 }, chave: expect.any(String) },
        { ok: true, q: "y", params: {}, chave: expect.any(String) },
      ],
    });
  });

  it("sem itens ou itens que não são lista → dados_invalidos; 17 → lote_grande; 16 passa", () => {
    for (const corpo of [{}, { itens: [] }, { itens: "x" }, { itens: { q: "y" } }, { itens: null }]) {
      expect(lerPedidoDeLeitura(corpo as Record<string, unknown>, catalogo), JSON.stringify(corpo)).toEqual({ ok: false, erro: "dados_invalidos" });
    }
    expect(LOTE_MAX).toBe(16);
    expect(lerPedidoDeLeitura({ itens: Array.from({ length: 17 }, () => ({ q: "y" })) }, catalogo)).toEqual({ ok: false, erro: "lote_grande" });
    expect(lerPedidoDeLeitura({ itens: Array.from({ length: 16 }, () => ({ q: "y" })) }, catalogo).ok).toBe(true);
  });

  it("q desconhecida (ou fora do formato, ou herdada do Object) → só aquele item volta consulta_invalida", () => {
    const r = lerPedidoDeLeitura({ itens: [{ q: "y" }, { q: "nao_existe" }, { q: "__proto__" }, { q: "constructor" }, { q: "Y" }, { q: "a".repeat(Q_MAX + 1) }, { q: 3 }, "y", null, {}] }, catalogo);
    if (r.ok === false) throw new Error("devia aceitar o pedido");
    expect(r.itens[0].ok).toBe(true);
    for (const item of r.itens.slice(1)) expect(item).toEqual({ ok: false, erro: "consulta_invalida", q: null });
  });

  it("param fora da forma ou obrigatório faltando → dados_invalidos naquele item (com o nome do campo, para o log)", () => {
    const r = lerPedidoDeLeitura({ itens: [{ q: "x" }, { q: "x", id: "abc" }, { q: "x", id: D1, dia: "2026-02-31" }, { q: "x", id: D1, dia: "31/10/2026" }, { q: "x", id: null }] }, catalogo);
    if (r.ok === false) throw new Error("devia aceitar o pedido");
    expect(r.itens.map((i) => (i.ok === false ? `${i.erro}:${i.campo}` : "ok"))).toEqual([
      "dados_invalidos:id", "dados_invalidos:id", "dados_invalidos:dia", "dados_invalidos:dia", "dados_invalidos:id",
    ]);
  });

  it("os tipos dos params: uuid, uuids (≤ teto, sem repetição), data real, inteiro na faixa, texto ≤ N, booleano, enum", () => {
    const sim = (p: ParamLeitura, v: unknown) => valorDoParam(p, v);
    expect(sim({ tipo: "uuid" }, D1.toUpperCase())).toEqual({ ok: true, valor: D1 });
    expect(sim({ tipo: "uuids", max: 3 }, [D1, D2, D1.toUpperCase()])).toEqual({ ok: true, valor: [D1, D2] });
    expect(sim({ tipo: "uuids", max: 3 }, [D1, D2, D3, D1]).ok).toBe(false); // 4 > 3 (conta antes de tirar a repetição)
    expect(sim({ tipo: "uuids", max: 500 }, Array.from({ length: UUIDS_MAX + 1 }, () => D1)).ok).toBe(false); // teto geral 200
    expect(sim({ tipo: "uuids", max: 3 }, []).ok).toBe(false);
    expect(sim({ tipo: "uuids", max: 3 }, [D1, "x"]).ok).toBe(false);
    expect(sim({ tipo: "data" }, "2026-10-11")).toEqual({ ok: true, valor: "2026-10-11" });
    for (const d of ["2026-02-30", "2026-13-01", "2026-10-1", "2026-10-11T00:00:00Z", 20261011, ""]) expect(sim({ tipo: "data" }, d).ok, String(d)).toBe(false);
    expect(sim({ tipo: "inteiro", min: 0, max: 10 }, 10)).toEqual({ ok: true, valor: 10 });
    for (const n of [11, -1, 1.5, "3", NaN]) expect(sim({ tipo: "inteiro", min: 0, max: 10 }, n).ok, String(n)).toBe(false);
    expect(sim({ tipo: "texto", max: 3 }, "abc").ok).toBe(true);
    expect(sim({ tipo: "texto", max: 3 }, "abcd").ok).toBe(false);
    expect(sim({ tipo: "booleano" }, false)).toEqual({ ok: true, valor: false });
    expect(sim({ tipo: "booleano" }, "true").ok).toBe(false);
    expect(sim({ tipo: "enum", valores: ["a", "b"] }, "b").ok).toBe(true);
    expect(sim({ tipo: "enum", valores: ["a", "b"] }, "c").ok).toBe(false);
    // ausente/null = não veio (o opcional fica de fora)
    expect(lerParams({ dia: null }, { dia: { tipo: "data" } })).toEqual({ ok: true, valores: {} });
  });
});

describe("hml-20a — o motor: rodarLote (ordem, iguais 1 vez, até 6 ao mesmo tempo, erro isolado)", () => {
  const item = (q: string, params: Record<string, unknown> = {}): ItemValido => ({ ok: true, q, params, chave: `${q}|${JSON.stringify(params)}` });

  it("a resposta sai na ORDEM do pedido; o recusado volta com o erro dele; os iguais rodam 1 vez e respondem nas 2 posições", async () => {
    const executar = vi.fn(async (i: ItemValido) => ({ ok: true as const, valor: `${i.q}:${String(i.params.n ?? "")}` }));
    const r = await rodarLote([item("a", { n: 1 }), { ok: false, erro: "consulta_invalida", q: null }, item("b"), item("a", { n: 1 }), item("a", { n: 2 })], executar);
    expect(r).toEqual([
      { ok: true, valor: "a:1" }, { ok: false, erro: "consulta_invalida" }, { ok: true, valor: "b:" }, { ok: true, valor: "a:1" }, { ok: true, valor: "a:2" },
    ]);
    expect(executar).toHaveBeenCalledTimes(3);
  });

  it("16 itens → no máximo 6 ao mesmo tempo (o paralelo pedido acima de 6 fica em 6)", async () => {
    let agora = 0;
    let pico = 0;
    const executar = async () => {
      agora++;
      pico = Math.max(pico, agora);
      await new Promise((r) => setTimeout(r, 2));
      agora--;
      return { ok: true as const, linhas: [] };
    };
    const itens = Array.from({ length: 16 }, (_, i) => item(`q${i}`));
    await rodarLote(itens, executar, { paralelo: 50 });
    expect(LOTE_PARALELO).toBe(6);
    expect(pico).toBe(6);
  });

  it("um item que lança não derruba os outros (aoFalhar; sem ele, erro_interno)", async () => {
    const executar = async (i: ItemValido) => {
      if (i.q === "ruim") throw new Error("boom");
      return { ok: true as const, valor: 1 };
    };
    expect(await rodarLote([item("bom"), item("ruim"), item("bom2")], executar)).toEqual([{ ok: true, valor: 1 }, { ok: false, erro: "erro_interno" }, { ok: true, valor: 1 }]);
    const r = await rodarLote([item("ruim")], executar, { aoFalhar: () => ({ ok: false, erro: "tempo_esgotado" }) });
    expect(r).toEqual([{ ok: false, erro: "tempo_esgotado" }]);
  });

  it("erroDaLeitura = a MESMA tabela do erroDoBanco da nutricao-regras (e o TimeoutError lançado também é tempo)", () => {
    const casos = [
      { code: "42501" }, { code: "23505" }, { code: "22P02" }, { code: "22008" }, { code: "23502" }, { code: "23503" }, { code: "23514" },
      { code: "PGRST301" }, { code: "PGRST116" }, { code: "42703" }, { message: "TimeoutError: signal timed out" }, { message: "AbortError: x" },
      { message: "qualquer" }, null, undefined, {},
    ];
    for (const e of casos) expect(erroDaLeitura(e), JSON.stringify(e)).toEqual(erroDoBanco(e));
    expect(erroDaLeitura({ name: "TimeoutError", message: "signal timed out" })).toEqual({ erro: "tempo_esgotado", inesperado: true });
  });
});

describe("hml-20a — o motor: a consulta montada NO SERVIDOR (dono, filtros, args) e a URL só do que a consulta leu", () => {
  const minha: ConsultaLeitura & { fonte: FonteTabela } = {
    params: { aluno: { tipo: "uuid", obrigatorio: true } },
    fonte: { tabela: "modelos_meta", colunas: ["id", "titulo"], teto: 5000, filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], vivas: true, ordem: [{ coluna: "titulo", asc: true }] },
    dono: "nutricionista_id",
  };

  it("N4: a consulta 'minha' filtra pelo dono = quem chama; nutricionista_id/user_id do corpo nem chegam aos params", () => {
    const r = lerPedidoDeLeitura({ itens: [{ q: "m", aluno: D1, nutricionista_id: OUTRA, user_id: OUTRA }] }, { m: minha });
    if (r.ok === false) throw new Error("devia aceitar");
    const lido = r.itens[0];
    if (lido.ok === false) throw new Error("devia aceitar o item");
    expect(lido.params).toEqual({ aluno: D1 });
    const plano = planoDaTabela(minha, lido.params, EU);
    expect(plano).toEqual({
      tabela: "modelos_meta", colunas: "id, titulo",
      filtros: [{ op: "eq", coluna: "paciente_id", valor: D1 }, { op: "eq", coluna: "nutricionista_id", valor: EU }, { op: "is_null", coluna: "deleted_at" }],
      ordem: [{ coluna: "titulo", asc: true }], teto: TETO_MAX, // o teto acima do max_rows fica no max_rows
    });
  });

  it("os args da RPC saem dos params declarados (o que não veio fica de fora; nada do corpo vira arg)", () => {
    expect(argsDaRpc({ rpc: "minha_dieta", args: { p_dia: "dia" } }, { dia: "2026-10-11" })).toEqual({ p_dia: "2026-10-11" });
    expect(argsDaRpc({ rpc: "minha_dieta", args: { p_dia: "dia" } }, {})).toEqual({});
    expect(argsDaRpc({ rpc: "minha_evolucao" }, { dia: "x" })).toEqual({});
  });

  it("N8: só assina o caminho que a consulta leu; o que o Storage devolver a mais é ignorado; a URL volta relativa ao projeto", () => {
    const lidos = caminhosParaAssinar([{ path: "a/1.jpg" }, { path: "a/1.jpg" }, { path: "" }, { path: 3 }, { outro: "x" }, null], "path");
    expect(lidos).toEqual(["a/1.jpg"]);
    const r = assinadas("evolucao-staging", ["a/1.jpg"], ["outra/pasta/x.jpg"]);
    const urls = urlsAssinadas(lidos, r.data, "evolucao-staging");
    expect([...urls.keys()]).toEqual(["a/1.jpg"]);
    expect(urls.get("a/1.jpg")).toBe(`${PREFIXO_ASSINADA}evolucao-staging/a/1.jpg?token=t-7`);
    // a URL de outro bucket (ou que não é de leitura) não vale
    expect(assinaturaRelativa("https://x.supabase.co/storage/v1/object/sign/anexos/a/1.jpg?token=t", "evolucao")).toBeNull();
    expect(assinaturaRelativa("https://x.supabase.co/storage/v1/object/upload/sign/evolucao/a.jpg?token=t", "evolucao")).toBeNull();
    expect(assinaturaRelativa(null, "evolucao")).toBeNull();
    // o item que o Storage não assinou fica sem URL (a tela mostra "Foto indisponível")
    expect(urlsAssinadas(["a/1.jpg"], [{ path: "a/1.jpg", error: "Object not found", signedUrl: null }], "evolucao")).toEqual(new Map());
    expect(comUrls([{ id: 1, path: "a/1.jpg" }, { id: 2, path: "b/2.jpg" }], "path", urls)).toEqual([
      { id: 1, path: "a/1.jpg", url: `${PREFIXO_ASSINADA}evolucao-staging/a/1.jpg?token=t-7` }, { id: 2, path: "b/2.jpg", url: null },
    ]);
    expect(comUrlsNaLista({ objetivo: "x", fotos: [{ path: "b/2.jpg" }] }, "fotos", "path", urls)).toEqual({ objetivo: "x", fotos: [{ path: "b/2.jpg", url: null }] });
    expect(comUrlsNaLista(null, "fotos", "path", urls)).toBeNull();
  });
});

// ───────────────────────── o catálogo da nutricao ─────────────────────────
describe("hml-20a — o catálogo da nutricao (as 3 consultas do app do aluno; as próximas W só acrescentam)", () => {
  it("as consultas da 20a", () => {
    expect([...CONSULTAS_DA_NUTRICAO].sort()).toEqual(["aluno_diario_urls", "aluno_dieta", "aluno_evolucao"]);
    expect(consultaDaNutricao("aluno_dieta")).toBe(CONSULTAS_NUTRICAO.aluno_dieta);
    for (const q of ["__proto__", "constructor", "nao_existe", 1, null]) expect(consultaDaNutricao(q), String(q)).toBeNull();
  });

  it.each(CONSULTAS_DA_NUTRICAO)("%s: forma fechada (nome, colunas explícitas, teto, filtros e args de params declarados, assinatura ≤ 1 h)", (q) => {
    const c: ConsultaLeitura = CONSULTAS_NUTRICAO[q];
    expect(q).toMatch(/^[a-z0-9_]{1,48}$/);
    if (ehRpc(c.fonte)) {
      // RPC só de LEITURA (as STABLE da RPC_SO_LEITURA do front) e os args só de params declarados
      expect(RPC_SO_LEITURA.has(c.fonte.rpc), c.fonte.rpc).toBe(true);
      for (const p of Object.values(c.fonte.args ?? {})) expect(c.params[p], p).toBeDefined();
    } else {
      expect(c.fonte.colunas.length).toBeGreaterThan(0);
      for (const col of c.fonte.colunas) expect(col, col).toMatch(/^[a-z_][a-z0-9_]*$/); // nenhum "*", nenhum embutido
      expect(c.fonte.teto).toBeGreaterThan(0);
      expect(c.fonte.teto).toBeLessThanOrEqual(TETO_MAX);
      for (const f of c.fonte.filtros ?? []) {
        expect(c.params[f.param], f.param).toBeDefined();
        expect(f.coluna).not.toBe(c.dono); // o dono nunca vem de param
      }
    }
    if (c.assinar) {
      expect(c.assinar.validade).toBeLessThanOrEqual(VALIDADE_MAX_S);
      expect(["diario", "evolucao"]).toContain(c.assinar.bucket);
      if (!ehRpc(c.fonte)) expect(c.fonte.colunas).toContain(c.assinar.coluna);
    }
  });

  it("os params de cada consulta (o aluno não manda id de quem ele é: as RPCs usam o auth.uid() lá dentro)", () => {
    expect(CONSULTAS_NUTRICAO.aluno_dieta.params).toEqual({ dia: { tipo: "data", obrigatorio: true } });
    expect(CONSULTAS_NUTRICAO.aluno_dieta.fonte).toEqual({ rpc: "minha_dieta", args: { p_dia: "dia" } });
    expect(CONSULTAS_NUTRICAO.aluno_evolucao.params).toEqual({});
    expect(CONSULTAS_NUTRICAO.aluno_evolucao.fonte).toEqual({ rpc: "minha_evolucao" });
    expect(CONSULTAS_NUTRICAO.aluno_diario_urls.params).toEqual({ ids: { tipo: "uuids", max: DIARIO_IDS_MAX, obrigatorio: true } });
    expect(DIARIO_IDS_MAX).toBe(60);
    expect(VALIDADE_URL_LEITURA_S).toBe(3600); // a de hoje (pacienteApp.ts e evolucao/fontes.ts: 3600)
  });

  it("o bucket do ambiente (o staging nunca lê do bucket da produção)", () => {
    expect(bucketDaLeitura("diario", "staging")).toBe("diario-staging");
    expect(bucketDaLeitura("diario", "public")).toBe("diario");
    expect(bucketDaLeitura("evolucao", "staging")).toBe("evolucao-staging");
    expect(bucketDaLeitura("evolucao", "public")).toBe("evolucao");
  });

  it("o despacho: `ler` vai ao módulo das leituras e não está em nenhuma das 4 listas (as ações de antes seguem para o módulo de antes)", () => {
    expect(moduloDoPedido({ acao: "ler", itens: [] })).toEqual({ modulo: "leitura", acao: "ler" });
    for (const lista of [ACOES_NUTRICAO, ACOES_DA_DIETA, ACOES_DO_ALUNO, ACOES_DA_AVALIACAO] as readonly string[][]) expect(lista).not.toContain("ler");
    expect(moduloDoPedido({ acao: "anamnese_criar" })?.modulo).toBe("prontuario");
    expect(moduloDoPedido({ acao: "plano_criar" })?.modulo).toBe("dieta");
    expect(moduloDoPedido({ acao: "aluno_marcar_refeicao" })?.modulo).toBe("aluno");
    expect(moduloDoPedido({ acao: "antropometria_criar" })?.modulo).toBe("avaliacao");
    expect(moduloDoPedido({ acao: "padroes_garantir", secao: "meta" })?.modulo).toBe("dieta");
    expect(moduloDoPedido({ acao: "LER" })).toBeNull();
    expect(moduloDoPedido({ action: "ler" })).toBeNull();
  });
});

// ───────────────────────── o módulo (functions/nutricao/leituras.ts), com o banco falso ─────────────────────────
describe("hml-20a — a ação `ler` de ponta a ponta no módulo (cliente falso no lugar do PostgREST/Storage)", () => {
  it("aluno_dieta: a minha_dieta(p_dia) como a pessoa; o valor volta como veio; o p_dia/paciente_id do corpo não entram", async () => {
    const dieta = { hoje: "2026-10-11", planos: [{ id: "p1" }], diario: [] };
    const { c, rpcs, log } = contexto({ acao: "ler", itens: [{ q: "aluno_dieta", dia: "2026-10-11", p_dia: "1999-01-01", paciente_id: OUTRA }] }, {
      rpc: () => ({ data: dieta, error: null }),
    });
    const r = await atenderLeitura(c);
    expect(r).toEqual({ ok: true, itens: [{ ok: true, valor: dieta }] });
    expect(rpcs).toEqual([{ nome: "minha_dieta", args: { p_dia: "2026-10-11" } }]);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ codigo: "leitura", acao: "ler", n: 1, resultado: "ok" }));
  });

  it("aluno_evolucao: a minha_evolucao() + a URL das fotos na MESMA ida, só dos caminhos que a RPC devolveu, no bucket do ambiente, 1 h", async () => {
    const valor = { objetivo: "emagrecer", antropometrias: [{ id: "a1" }], fotos: [{ id: "f1", path: `${D1}/x.jpg` }, { id: "f2", path: `${D1}/y.jpg` }] };
    const { c, rpcs, assinaturas } = contexto({ acao: "ler", itens: [{ q: "aluno_evolucao", path: "outra/pasta/z.jpg", caminhos: ["outra/pasta/z.jpg"] }] }, {
      rpc: () => ({ data: valor, error: null }),
      // o Storage assina f1, falha f2 e devolve um caminho que ninguém pediu (ignorado)
      assinar: (bucket, caminhos) => ({
        data: [...assinadas(bucket, [caminhos[0]], ["outra/pasta/z.jpg"]).data, { path: caminhos[1], error: "not found", signedUrl: null }], error: null,
      }),
    });
    const [item] = itensDa(await atenderLeitura(c));
    expect(rpcs).toEqual([{ nome: "minha_evolucao", args: {} }]);
    expect(assinaturas).toEqual([{ bucket: "evolucao-staging", caminhos: [`${D1}/x.jpg`, `${D1}/y.jpg`], validade: 3600 }]);
    expect(item).toEqual({
      ok: true,
      valor: {
        objetivo: "emagrecer", antropometrias: [{ id: "a1" }],
        fotos: [
          { id: "f1", path: `${D1}/x.jpg`, url: `${PREFIXO_ASSINADA}evolucao-staging/${D1}/x.jpg?token=t-${`${D1}/x.jpg`.length}` },
          { id: "f2", path: `${D1}/y.jpg`, url: null },
        ],
      },
    });
  });

  it("aluno_diario_urls: relê id/path dos ids COMO O ALUNO (só as vivas, até 60) e assina só o que o RLS devolveu", async () => {
    const meus: Record<string, string> = { [D1]: `n/${EU}/1.jpg`, [D2]: `n/${EU}/2.jpg` };
    const { c, consultas, assinaturas } = contexto({ acao: "ler", itens: [{ q: "aluno_diario_urls", ids: [D1, D2, D3], path: "n/outro/3.jpg" }] }, {
      // o RLS: o D3 é de outro aluno → não volta
      tabela: (q) => ({ data: (q.filtros.find((f) => f[0] === "in")?.[2] as string[]).filter((id) => meus[id]).map((id) => ({ id, path: meus[id] })), error: null }),
      assinar: (bucket, caminhos) => assinadas(bucket, caminhos),
    });
    const [item] = itensDa(await atenderLeitura(c));
    expect(consultas).toEqual([{
      tabela: "diario_alimentar", colunas: "id, path", filtros: [["in", "id", [D1, D2, D3]], ["is", "deleted_at", null]], ordem: [], limite: 60,
    }]);
    expect(assinaturas).toEqual([{ bucket: "diario-staging", caminhos: [meus[D1], meus[D2]], validade: 3600 }]);
    expect(item).toEqual({
      ok: true,
      linhas: [
        { id: D1, path: meus[D1], url: `${PREFIXO_ASSINADA}diario-staging/${meus[D1]}?token=t-${meus[D1].length}` },
        { id: D2, path: meus[D2], url: `${PREFIXO_ASSINADA}diario-staging/${meus[D2]}?token=t-${meus[D2].length}` },
      ],
    });
  });

  it("N1 (como hoje): o RLS de outra pessoa devolve vazio → o item volta vazio (e nada é assinado)", async () => {
    const { c, assinaturas } = contexto({ acao: "ler", itens: [{ q: "aluno_diario_urls", ids: [D1] }, { q: "aluno_evolucao" }] }, {
      tabela: () => ({ data: [], error: null }),
      rpc: () => ({ data: { objetivo: null, antropometrias: [], fotos: [] }, error: null }),
    });
    expect(itensDa(await atenderLeitura(c))).toEqual([
      { ok: true, linhas: [] }, { ok: true, valor: { objetivo: null, antropometrias: [], fotos: [] } },
    ]);
    expect(assinaturas).toEqual([]);
  });

  it("o lote: ordem do pedido, os iguais 1 vez, q desconhecida e params ruins só no item deles", async () => {
    const { c, rpcs, log } = contexto({
      acao: "ler",
      itens: [
        { q: "aluno_dieta", dia: "2026-10-11" }, { q: "nao_existe" }, { q: "aluno_dieta", dia: "2026-02-31" }, { q: "aluno_dieta", dia: "2026-10-11" },
        { q: "aluno_diario_urls", ids: Array.from({ length: 61 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) },
      ],
    }, { rpc: (_n, a) => ({ data: { dia: a.p_dia }, error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual([
      { ok: true, valor: { dia: "2026-10-11" } }, { ok: false, erro: "consulta_invalida" }, { ok: false, erro: "dados_invalidos" },
      { ok: true, valor: { dia: "2026-10-11" } }, { ok: false, erro: "dados_invalidos" },
    ]);
    expect(rpcs).toHaveLength(1);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ n: 5, resultado: "parcial" }));
    expect(log.aviso).toHaveBeenCalledWith(expect.objectContaining({ codigo: "dados_invalidos", acao: "aluno_diario_urls", resultado: "ids" }));
  });

  it("o pedido inteiro: sem itens → dados_invalidos; 17 → lote_grande (nada roda)", async () => {
    const vazio = contexto({ acao: "ler" }, {});
    expect(await atenderLeitura(vazio.c)).toEqual({ ok: false, erro: "dados_invalidos" });
    const grande = contexto({ acao: "ler", itens: Array.from({ length: 17 }, () => ({ q: "aluno_evolucao" })) }, {});
    expect(await atenderLeitura(grande.c)).toEqual({ ok: false, erro: "lote_grande" });
    expect(grande.rpcs).toEqual([]);
  });

  it("o erro do banco vira o código do item (42501 → sem_acesso, aviso; tempo → tempo_esgotado e o que lança → erro_interno, com aviso ao Weslley)", async () => {
    const { c, log } = contexto({ acao: "ler", itens: [{ q: "aluno_dieta", dia: "2026-10-11" }, { q: "aluno_evolucao" }, { q: "aluno_diario_urls", ids: [D1] }] }, {
      rpc: (nome) => {
        if (nome === "minha_dieta") return { data: null, error: { code: "42501", message: "permission denied" } };
        return { data: null, error: { code: "", message: "TimeoutError: signal timed out" } };
      },
      tabela: () => {
        throw new Error("quebrou");
      },
    });
    expect(itensDa(await atenderLeitura(c))).toEqual([
      { ok: false, erro: "sem_acesso" }, { ok: false, erro: "tempo_esgotado" }, { ok: false, erro: "erro_interno" },
    ]);
    expect(log.aviso).toHaveBeenCalledWith(expect.objectContaining({ codigo: "sem_acesso", acao: "aluno_dieta", pg: "42501" }));
    expect(log.excecao).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ n: 3, resultado: "falhou" }));
  });

  it("o Storage fora: as fotos ficam sem URL (como hoje) e o item segue ok; o log diz quantas, sem os caminhos", async () => {
    const { c, log } = contexto({ acao: "ler", itens: [{ q: "aluno_evolucao" }] }, {
      rpc: () => ({ data: { fotos: [{ path: "a/1.jpg" }] }, error: null }),
      assinar: () => ({ data: null, error: { status: 503, message: "indisponível" } }),
    });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, valor: { fotos: [{ path: "a/1.jpg", url: null }] } }]);
    expect(log.aviso).toHaveBeenCalledWith({ codigo: "assinar_falhou", schema: "staging", acao: "aluno_evolucao", status: 503, n: 1 });
  });

  it("o log nunca leva params, linhas nem caminhos (só código, schema, ação/q, n, ms, desfecho, status, pg)", async () => {
    const { c, log } = contexto({ acao: "ler", itens: [{ q: "aluno_dieta", dia: "2026-10-11" }, { q: "aluno_diario_urls", ids: [D1] }] }, {
      rpc: () => ({ data: { segredo: "dado de saúde" }, error: null }),
      tabela: () => ({ data: [{ id: D1, path: "n/a/1.jpg" }], error: null }),
      assinar: () => ({ data: null, error: { status: 500 } }),
    });
    await atenderLeitura(c);
    const texto = JSON.stringify([log.info.mock.calls, log.aviso.mock.calls, log.erro.mock.calls, log.excecao.mock.calls]);
    for (const proibido of ["2026-10-11", D1, "n/a/1.jpg", "dado de saúde"]) expect(texto, proibido).not.toContain(proibido);
    const permitidos = new Set(["codigo", "schema", "acao", "n", "ms", "resultado", "status", "pg"]);
    for (const [campos] of [...log.info.mock.calls, ...log.aviso.mock.calls]) for (const k of Object.keys(campos)) expect(permitidos.has(k), k).toBe(true);
  });
});

describe("hml-20a — o módulo lê como a pessoa (fonte)", () => {
  const fonte = readFileSync(resolve(RAIZ, "supabase-principal/functions/nutricao/leituras.ts"), "utf-8");
  it("sem chave secreta; tudo pelo c.comoPessoa; o select vem do planoDaTabela (o dono = c.userId) e a assinatura só dos caminhos lidos", () => {
    expect(fonte).not.toMatch(/SERVICE_ROLE|service_role|createClient\(/);
    expect(fonte).toMatch(/c\.comoPessoa\.rpc\(fonte\.rpc, argsDaRpc\(fonte, item\.params\)\)/);
    expect(fonte).toMatch(/planoDaTabela\(consulta, item\.params, c\.userId\)/);
    expect(fonte).toMatch(/c\.comoPessoa\.storage\.from\(bucket\)\.createSignedUrls\(caminhos, a\.validade\)/);
    expect(fonte).toMatch(/caminhosParaAssinar\(/);
    expect(fonte).not.toMatch(/select\(\s*["'`]\*/);
    // o despacho do index.ts chama o módulo
    expect(readFileSync(resolve(RAIZ, "supabase-principal/functions/nutricao/index.ts"), "utf-8")).toMatch(/case "leitura":\s*return atenderLeitura\(c\);/);
  });
});
