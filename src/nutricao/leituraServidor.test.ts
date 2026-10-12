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
  comUrlsNaLista, ehRpc, erroDaLeitura, lerParams, lerPedidoDeLeitura, planoDaTabela, rodarLote, urlsAssinadas, validadeDaAssinatura, valorDoParam,
  type CatalogoLeitura, type ConsultaLeitura, type FonteTabela, type ItemValido, type ParamLeitura, type RespostaDeItem,
  // hml-20b
  ERRO_MUITAS_LINHAS, LACO_LEITURAS_MAX, extrasDaTabela, intervaloDaPagina, nomeDoDownload,
} from "../../supabase-principal/functions/_shared/leitura-lote";
import {
  BUCKETS_DE_LEITURA, CONSULTAS_DA_NUTRICAO, CONSULTAS_NUTRICAO, DIARIO_IDS_MAX, VALIDADE_URL_LEITURA_S, bucketDaLeitura, consultaDaNutricao,
  // hml-20b
  ANOTACOES_LIMITE_MAX, COLUNAS_DO_PAINEL, ERROS_DA_ROTA, EXAMES_LIMITE_MAX, EXAME_NOME_MAX, INT4_MAX, MAX_LEITURAS_RESULTADOS, POR_PAGINA_LEITURA,
  RESULTADOS_POR_LEITURA, TETO_LISTA, VALIDADE_ANEXO_BAIXAR_S, VALIDADE_ANEXO_VER_S,
} from "../../supabase-principal/functions/_shared/nutricao-leituras";
import {
  ACOES_NUTRICAO, ACOES_DA_DIETA, ACOES_DO_ALUNO, ACOES_DA_AVALIACAO, erroDoBanco, moduloDoPedido,
  // hml-20b
  ERROS_DO_AVISO, bucketDosAnexos,
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
  it("as consultas da 20a (hml-20b: seguem as 3, iguais; as da 20b só ACRESCENTARAM — a lista delas no bloco hml-20b abaixo)", () => {
    const da20a = ["aluno_diario_urls", "aluno_dieta", "aluno_evolucao"];
    expect([...CONSULTAS_DA_NUTRICAO].filter((q) => da20a.includes(q)).sort()).toEqual(da20a);
    expect(CONSULTAS_DA_NUTRICAO.slice(0, 3)).toEqual(["aluno_dieta", "aluno_diario_urls", "aluno_evolucao"]); // o bloco da 20a na frente
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
      expect(BUCKETS_DE_LEITURA).toContain(c.assinar.bucket); // a lista fechada (20a: diario, evolucao; 20b: + anexos)
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
    expect(fonte).toMatch(/c\.comoPessoa\.storage\.from\(bucket\)\.createSignedUrls\(caminhos, validadeDaAssinatura\(a\)\)/);
    expect(fonte).not.toMatch(/createSignedUrls\(caminhos, a\.validade\)/);
    expect(fonte).toMatch(/caminhosParaAssinar\(/);
    expect(fonte).not.toMatch(/select\(\s*["'`]\*/);
    // o despacho do index.ts chama o módulo
    expect(readFileSync(resolve(RAIZ, "supabase-principal/functions/nutricao/index.ts"), "utf-8")).toMatch(/case "leitura":\s*return atenderLeitura\(c\);/);
  });
});

describe("hml-20a (revisão) — o teto da validade da URL assinada vale para TODO catálogo (no motor)", () => {
  it("validadeDaAssinatura: a do catálogo, no teto de 1 h e no mínimo 1 s (o que não é número → o teto)", () => {
    expect(VALIDADE_MAX_S).toBe(3600);
    expect(validadeDaAssinatura({ validade: 99_999 })).toBe(3600);
    expect(validadeDaAssinatura({ validade: 3600.9 })).toBe(3600);
    expect(validadeDaAssinatura({ validade: 60 })).toBe(60);
    expect(validadeDaAssinatura({ validade: 0 })).toBe(1);
    expect(validadeDaAssinatura({ validade: -5 })).toBe(1);
    expect(validadeDaAssinatura({ validade: Number.NaN })).toBe(3600);
    for (const q of CONSULTAS_DA_NUTRICAO) {
      const a = (CONSULTAS_NUTRICAO[q] as ConsultaLeitura).assinar;
      if (a) expect(validadeDaAssinatura(a), q).toBe(a.validade); // o catálogo da 20a já está dentro do teto
    }
  });

  it("de ponta a ponta: um catálogo com validade ACIMA do teto (99999 s) assina com 3600 s no módulo", async () => {
    const caminho = "../../supabase-principal/functions/_shared/nutricao-leituras";
    vi.resetModules();
    vi.doMock(caminho, async () => {
      const real = await vi.importActual<typeof import("../../supabase-principal/functions/_shared/nutricao-leituras")>(caminho);
      const ev = real.CONSULTAS_NUTRICAO.aluno_evolucao;
      const CONSULTAS = { ...real.CONSULTAS_NUTRICAO, aluno_evolucao: { ...ev, assinar: { ...ev.assinar, validade: 99_999 } } };
      return {
        ...real,
        CONSULTAS_NUTRICAO: CONSULTAS,
        consultaDaNutricao: (q: unknown) =>
          typeof q === "string" && Object.prototype.hasOwnProperty.call(CONSULTAS, q) ? CONSULTAS[q as keyof typeof CONSULTAS] : null,
      };
    });
    try {
      const { atenderLeitura: atender } = await import("../../supabase-principal/functions/nutricao/leituras");
      const { c, assinaturas } = contexto({ acao: "ler", itens: [{ q: "aluno_evolucao" }] }, {
        rpc: () => ({ data: { fotos: [{ path: "a/1.jpg" }] }, error: null }),
        assinar: (bucket, caminhos) => assinadas(bucket, caminhos),
      });
      expect(await atender(c)).toMatchObject({ ok: true, itens: [{ ok: true }] });
      expect(assinaturas).toEqual([{ bucket: "evolucao-staging", caminhos: ["a/1.jpg"], validade: 3600 }]);
    } finally {
      vi.doUnmock(caminho);
      vi.resetModules();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// hml-20b (H-42 · Painel › Aluno, 12/10/2026) — as ~29 consultas do painel (spec hml-20 §2.5.2) e os campos OPCIONAIS do motor que elas
// usam (RPC com os códigos de propósito, página + total, laço, 1 linha, a URL de 1 arquivo com o "baixar"). As consultas da 20a não
// declaram nenhum desses campos: o caminho delas é o de antes (os testes acima seguem iguais).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const ALUNO = "55555555-5555-4555-8555-555555555555";

/** As consultas da 20b (o conjunto do contrato; os nomes que mudaram estão no progresso_20b). */
const CONSULTAS_20B = [
  "aluno_perfil", "aluno_evolucao_painel", "profissional", "anotacoes", "anotacoes_todas", "consultas_do_aluno", "anamneses_do_aluno", "modelos_anamnese",
  "questionarios", "respostas_questionario_do_aluno", "pedidos_exame_do_aluno", "exames_do_aluno", "exames_catalogo", "resultados_exame_do_aluno",
  "avaliacoes_integradas_do_aluno", "gestacoes_do_aluno", "registros_gestacionais", "interacoes_farmaco", "medicamentos_do_aluno",
  "analises_farmaco_do_aluno", "documentos_do_aluno", "modelos_documento", "anexos_do_aluno", "anexo_url", "antropometrias_do_aluno", "antropometria",
  "antropometrias_pdf",
] as const;

/** As listas do aluno (tabela + paciente_id = o aluno do corpo + vivas + a ordem da lib de hoje) — a lib, a tabela e a ordem. */
const LISTAS_DO_ALUNO: Array<{ q: string; tabela: string; ordem: Array<[string, boolean]>; lib: string }> = [
  { q: "consultas_do_aluno", tabela: "consultas", ordem: [["data", false], ["created_at", false]], lib: "prontuario/lib/consultas.ts listarConsultas" },
  { q: "anamneses_do_aluno", tabela: "anamneses", ordem: [["data", false], ["created_at", false]], lib: "prontuario/lib/anamneses.ts listarAnamneses" },
  { q: "respostas_questionario_do_aluno", tabela: "respostas_questionario", ordem: [["data", false], ["created_at", false]], lib: "questionarios.ts listarAplicacoesDoPaciente" },
  { q: "avaliacoes_integradas_do_aluno", tabela: "avaliacoes_integradas", ordem: [["data", false], ["created_at", false]], lib: "avaliacaoIntegrada.ts listarAvaliacoes" },
  { q: "gestacoes_do_aluno", tabela: "gestacoes", ordem: [["created_at", false]], lib: "gestacional.ts listarGestacoes" },
  { q: "registros_gestacionais", tabela: "registros_gestacionais", ordem: [["data", false], ["created_at", false]], lib: "gestacional.ts listarRegistrosDoPaciente" },
  { q: "medicamentos_do_aluno", tabela: "medicamentos_paciente", ordem: [["ativo", false], ["created_at", true]], lib: "farmaco.ts listarMedicamentosDoPaciente" },
  { q: "analises_farmaco_do_aluno", tabela: "analises_farmaco", ordem: [["data", false], ["created_at", false]], lib: "farmaco.ts listarAnalises" },
  { q: "documentos_do_aluno", tabela: "documentos", ordem: [["created_at", false]], lib: "documentos.ts listarDocumentosDoPaciente" },
  { q: "anexos_do_aluno", tabela: "anexos", ordem: [["created_at", false]], lib: "anexos.ts listarAnexosDoPaciente" },
  { q: "antropometrias_do_aluno", tabela: "antropometrias", ordem: [["data", false], ["created_at", false]], lib: "editor/lib/antropometrias.ts listarAntropometrias" },
];
/** Os modelos e catálogos (o RLS decide: os do sistema + os próprios — a lib não filtrava por dono, o servidor também não). */
const LISTAS_DA_CONTA: Array<{ q: string; tabela: string; ordem: Array<[string, boolean]> }> = [
  { q: "modelos_anamnese", tabela: "modelos_anamnese", ordem: [["favorito", false], ["titulo", true]] },
  { q: "questionarios", tabela: "questionarios", ordem: [["titulo", true]] },
  { q: "exames_catalogo", tabela: "exames_catalogo", ordem: [["favorito", false], ["nome", true]] },
  { q: "interacoes_farmaco", tabela: "interacoes_farmaco_nutriente", ordem: [["medicamento", true], ["nutriente", true]] },
  { q: "modelos_documento", tabela: "modelos_documento", ordem: [["favorito", false], ["titulo", true]] },
];

/** As colunas do Row de cada tabela no tipo gerado do principal (src/integrations/principal/types.ts) — o "tipo" que a lib devolve. */
function colunasDoTipo(tabela: string): string[] {
  const tipos = readFileSync(resolve(RAIZ, "src/integrations/principal/types.ts"), "utf-8");
  const m = new RegExp(`\\n      ${tabela}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`).exec(tipos);
  if (!m) throw new Error(`tabela ${tabela} fora do tipo gerado`);
  return [...m[1].matchAll(/^ {10}([a-z_0-9]+)\??: /gm)].map((x) => x[1]).sort();
}

// ───────────────────────── o cliente falso da 20b (RLS simulado, count, range, createSignedUrl) ─────────────────────────
interface Consulta20b {
  tabela: string;
  colunas: string | null;
  contar: boolean;
  filtros: Array<[string, string, unknown]>;
  ordem: Array<[string, boolean]>;
  limite: number | null;
  range: [number, number] | null;
}
interface Banco20b {
  rpc?: (nome: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
  tabela?: (c: Consulta20b) => { data: unknown; error: unknown; count?: number | null };
  assinarUma?: (bucket: string, caminho: string, validade: number, opcoes?: { download: string }) => { data: unknown; error: unknown };
  assinar?: (bucket: string, caminhos: string[], validade: number) => { data: unknown; error: unknown };
}
function clienteFalso20b(banco: Banco20b) {
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const consultas: Consulta20b[] = [];
  const assinaturas: Array<{ bucket: string; caminhos: string[]; validade: number; opcoes?: { download: string } }> = [];
  const cliente = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return banco.rpc ? banco.rpc(nome, args) : { data: null, error: null };
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: { count?: string }) => {
        const c: Consulta20b = { tabela, colunas, contar: opcoes?.count === "exact", filtros: [], ordem: [], limite: null, range: null };
        consultas.push(c);
        const fim = () => Promise.resolve(banco.tabela ? banco.tabela(c) : { data: [], error: null, count: c.contar ? 0 : null });
        const b = {
          in: (col: string, v: unknown) => (c.filtros.push(["in", col, v]), b),
          eq: (col: string, v: unknown) => (c.filtros.push(["eq", col, v]), b),
          is: (col: string, v: unknown) => (c.filtros.push(["is", col, v]), b),
          order: (col: string, o: { ascending: boolean }) => (c.ordem.push([col, o.ascending]), b),
          limit: (n: number) => ((c.limite = n), fim()),
          range: (de: number, ate: number) => ((c.range = [de, ate]), fim()),
        };
        return b;
      },
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[], validade: number) => {
          assinaturas.push({ bucket, caminhos, validade });
          return banco.assinar ? banco.assinar(bucket, caminhos, validade) : assinadas(bucket, caminhos);
        },
        createSignedUrl: async (caminho: string, validade: number, opcoes?: { download: string }) => {
          assinaturas.push({ bucket, caminhos: [caminho], validade, ...(opcoes ? { opcoes } : {}) });
          if (banco.assinarUma) return banco.assinarUma(bucket, caminho, validade, opcoes);
          const extra = opcoes ? `&download=${encodeURIComponent(opcoes.download)}` : "";
          return { data: { signedUrl: `https://hkxv.supabase.co${PREFIXO_ASSINADA}${bucket}/${caminho}?token=t1${extra}` }, error: null };
        },
      }),
    },
  };
  return { cliente, rpcs, consultas, assinaturas };
}
function contexto20b(itens: unknown[], banco: Banco20b, prazo?: { esgotado(): boolean }) {
  const f = clienteFalso20b(banco);
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  const c = { schema: "staging" as const, origin: null, corpo: { acao: "ler", itens }, userId: EU, comoPessoa: f.cliente, log, ...(prazo ? { prazo } : {}) };
  return { c: c as unknown as Parameters<typeof atenderLeitura>[0], ...f, log };
}
const raise = (codigo: string) => ({ data: null, error: { code: "P0001", message: codigo, details: null, hint: null } });

describe("hml-20b — o motor: os campos opcionais (página, total, laço, 1 linha, baixar, códigos de propósito)", () => {
  it("erroDaLeitura com os códigos de propósito: a mensagem conhecida volta como ela (não inesperado); sem a lista, a tabela de sempre", () => {
    for (const codigo of ERROS_DA_ROTA) {
      expect(erroDaLeitura({ code: "P0001", message: codigo }, ERROS_DA_ROTA), codigo).toEqual({ erro: codigo, inesperado: false });
      expect(erroDaLeitura({ code: "P0001", message: codigo }), codigo).toEqual(erroDoBanco({ code: "P0001", message: codigo })); // a 20a
    }
    expect(ERROS_DA_ROTA).toEqual(ERROS_DO_AVISO); // os da w14_matricula_da_rota (a 19c já os conhecia)
    expect(erroDaLeitura({ code: "P0001", message: "outra coisa" }, ERROS_DA_ROTA)).toEqual({ erro: "erro_interno", inesperado: true });
    expect(erroDaLeitura({ code: "42501", message: "sem_acesso" }, [])).toEqual({ erro: "sem_acesso", inesperado: false });
    expect(erroDaLeitura({ code: "22P02", message: "invalid input syntax" }, ERROS_DA_ROTA)).toEqual({ erro: "dados_invalidos", inesperado: false });
  });

  it("intervaloDaPagina: a página (a 1ª é 1) no tamanho, no teto de 1000 — o intervalo() da tela", () => {
    expect(intervaloDaPagina(1, 20)).toEqual([0, 19]);
    expect(intervaloDaPagina(3, 20)).toEqual([40, 59]);
    expect(intervaloDaPagina(0, 20)).toEqual([0, 19]);
    expect(intervaloDaPagina(2.7, 20)).toEqual([20, 39]);
    expect(intervaloDaPagina(2, 5000)).toEqual([1000, 1999]);
    expect(intervaloDaPagina(Number.NaN, 20)).toEqual([0, 19]);
  });

  it("extrasDaTabela: nada nas consultas da 20a (o caminho de antes); a página, a contagem, o laço (no teto) e o 1 linha nas da 20b", () => {
    const vazio = { intervalo: null, contar: false, laco: null, uma: false };
    expect(extrasDaTabela(CONSULTAS_NUTRICAO.aluno_diario_urls.fonte as FonteTabela, { ids: [D1] })).toEqual(vazio);
    expect(extrasDaTabela(CONSULTAS_NUTRICAO.consultas_do_aluno.fonte as FonteTabela, { aluno: ALUNO })).toEqual(vazio);
    expect(extrasDaTabela(CONSULTAS_NUTRICAO.pedidos_exame_do_aluno.fonte as FonteTabela, { aluno: ALUNO, pagina: 3 })).toEqual({ ...vazio, intervalo: [40, 59], contar: true });
    expect(extrasDaTabela(CONSULTAS_NUTRICAO.resultados_exame_do_aluno.fonte as FonteTabela, { aluno: ALUNO })).toEqual({ ...vazio, laco: { tamanho: 1000, leituras: 50 } });
    expect(extrasDaTabela({ tabela: "x", colunas: ["id"], teto: 1, laco: { tamanho: 9999, leituras: 999 } }, {}).laco).toEqual({ tamanho: 1000, leituras: LACO_LEITURAS_MAX });
    expect(extrasDaTabela(CONSULTAS_NUTRICAO.anexo_url.fonte as FonteTabela, { id: D1 })).toEqual({ ...vazio, uma: true });
    expect(extrasDaTabela(CONSULTAS_NUTRICAO.antropometria.fonte as FonteTabela, { id: D1 })).toEqual({ ...vazio, uma: true });
  });

  it("nomeDoDownload: só com o download declarado, o param = true e o nome (da linha que a consulta leu) em texto", () => {
    const a = CONSULTAS_NUTRICAO.anexo_url.assinar;
    expect(nomeDoDownload(a, { download: true }, { path: "p", nome: "Laudo.pdf" })).toBe("Laudo.pdf");
    expect(nomeDoDownload(a, { download: false }, { path: "p", nome: "Laudo.pdf" })).toBeNull();
    expect(nomeDoDownload(a, {}, { path: "p", nome: "Laudo.pdf" })).toBeNull();
    expect(nomeDoDownload(a, { download: true }, { path: "p", nome: "  " })).toBeNull();
    expect(nomeDoDownload(a, { download: true }, { path: "p", nome: 3 })).toBeNull();
    expect(nomeDoDownload({ download: undefined }, { download: true }, { nome: "x" })).toBeNull();
  });
});

describe("hml-20b — o catálogo do Painel › Aluno (forma, dono, colunas = as do tipo, códigos de propósito)", () => {
  it("as consultas da 20b — o conjunto do contrato (só acrescentou: 20a + 20b = o catálogo)", () => {
    expect(CONSULTAS_DA_NUTRICAO.slice(3)).toEqual([...CONSULTAS_20B]);
    expect(CONSULTAS_DA_NUTRICAO).toHaveLength(3 + CONSULTAS_20B.length);
  });

  it("as colunas de cada tabela = as do Row do tipo gerado (o select('*') de hoje, escrito coluna a coluna); o PDF e o profiles, os recortes", () => {
    for (const [tabela, colunas] of Object.entries(COLUNAS_DO_PAINEL)) {
      if (tabela === "antropometrias_pdf" || tabela === "profiles") continue;
      expect([...colunas].sort(), tabela).toEqual(colunasDoTipo(tabela));
    }
    // o PDF lia estas 12 (painel/aluno/dados/pdf.ts) e o profissional, nome + dados profissionais (profissional.ts)
    expect(COLUNAS_DO_PAINEL.antropometrias_pdf).toEqual([
      "id", "data", "peso", "altura", "sexo", "idade", "circunferencias", "dobras", "protocolo", "resultados", "nutricionista_id", "created_at",
    ]);
    for (const col of COLUNAS_DO_PAINEL.antropometrias_pdf) expect(colunasDoTipo("antropometrias"), col).toContain(col);
    expect(COLUNAS_DO_PAINEL.profiles).toEqual(["nome", "dados_profissionais"]);
    for (const col of COLUNAS_DO_PAINEL.profiles) expect(colunasDoTipo("profiles"), col).toContain(col);
  });

  it("'minha' = SÓ o profissional (o id = quem chama); os modelos/catálogos o RLS decide (a lib não filtrava por dono)", () => {
    const comDono = CONSULTAS_20B.filter((q) => (CONSULTAS_NUTRICAO[q] as ConsultaLeitura).dono);
    expect(comDono).toEqual(["profissional"]);
    expect(CONSULTAS_NUTRICAO.profissional.dono).toBe("id");
    for (const { q } of LISTAS_DA_CONTA) {
      const c = CONSULTAS_NUTRICAO[q as keyof typeof CONSULTAS_NUTRICAO] as ConsultaLeitura;
      expect(c.params, q).toEqual({});
      expect(c.dono, q).toBeUndefined();
      expect((c.fonte as FonteTabela).filtros, q).toBeUndefined();
    }
  });

  it("as RPCs: os args montados aqui e os códigos de propósito da w14_matricula_da_rota (aluno_perfil, aluno_evolucao, aluno_anotacoes)", () => {
    expect(CONSULTAS_NUTRICAO.aluno_perfil.fonte).toEqual({ rpc: "aluno_perfil", args: { p_aluno: "aluno" }, erros: ERROS_DO_AVISO });
    expect(CONSULTAS_NUTRICAO.aluno_evolucao_painel.fonte).toEqual({ rpc: "aluno_evolucao", args: { p_aluno: "aluno" }, erros: ERROS_DO_AVISO });
    expect(CONSULTAS_NUTRICAO.aluno_evolucao_painel.assinar).toEqual({ bucket: "evolucao", coluna: "path", lista: "fotos", validade: 3600 });
    expect(CONSULTAS_NUTRICAO.anotacoes.fonte).toEqual({ rpc: "aluno_anotacoes", args: { p_aluno: "aluno", p_limite: "limite", p_offset: "offset" }, erros: ERROS_DO_AVISO });
    expect(CONSULTAS_NUTRICAO.anotacoes.params).toEqual({
      aluno: { tipo: "uuid", obrigatorio: true }, limite: { tipo: "inteiro", min: 1, max: ANOTACOES_LIMITE_MAX, obrigatorio: true },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX },
    });
    expect(CONSULTAS_NUTRICAO.anotacoes_todas.fonte).toEqual({ rpc: "aluno_anotacoes", args: { p_aluno: "aluno" }, erros: ERROS_DO_AVISO });
    // a exames_do_aluno é INVOKER, sem a w14 (não levanta código): a tabela de sempre
    expect(CONSULTAS_NUTRICAO.exames_do_aluno.fonte).toEqual({ rpc: "exames_do_aluno", args: { p_aluno: "aluno", p_exame: "exame", p_offset: "offset", p_limite: "limite" } });
    expect(CONSULTAS_NUTRICAO.exames_do_aluno.params).toEqual({
      aluno: { tipo: "uuid", obrigatorio: true }, exame: { tipo: "texto", max: EXAME_NOME_MAX },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true }, limite: { tipo: "inteiro", min: 1, max: EXAMES_LIMITE_MAX, obrigatorio: true },
    });
    expect([ANOTACOES_LIMITE_MAX, EXAMES_LIMITE_MAX, EXAME_NOME_MAX, INT4_MAX]).toEqual([500, 100, 500, 2_147_483_647]);
  });

  it("as pesadas vão sozinhas (resultados em laço, a URL por clique); o resto, no lote da tela", () => {
    expect(CONSULTAS_20B.filter((q) => (CONSULTAS_NUTRICAO[q] as ConsultaLeitura).sozinha === true)).toEqual(["resultados_exame_do_aluno", "anexo_url"]);
  });

  it("anexo_url: relê id/path/nome pelo id (só as vivas, 1 linha) e assina no anexos do ambiente — 60 s baixar com o nome, 120 s ver", () => {
    expect(CONSULTAS_NUTRICAO.anexo_url.params).toEqual({ id: { tipo: "uuid", obrigatorio: true }, download: { tipo: "booleano" } });
    expect(CONSULTAS_NUTRICAO.anexo_url.fonte).toEqual({
      tabela: "anexos", colunas: ["id", "path", "nome"], teto: 1, filtros: [{ param: "id", coluna: "id", op: "eq" }], vivas: true, uma: true,
    });
    expect(CONSULTAS_NUTRICAO.anexo_url.assinar).toEqual({ bucket: "anexos", coluna: "path", validade: 120, download: { param: "download", nome: "nome", validade: 60 } });
    expect([VALIDADE_ANEXO_BAIXAR_S, VALIDADE_ANEXO_VER_S]).toEqual([60, 120]);
    expect(bucketDaLeitura("anexos", "staging")).toBe("anexos-staging");
    expect(bucketDaLeitura("anexos", "public")).toBe("anexos");
    for (const s of ["public", "staging"] as const) expect(bucketDaLeitura("anexos", s)).toBe(bucketDosAnexos(s));
    expect(BUCKETS_DE_LEITURA).toEqual(["diario", "evolucao", "anexos"]);
  });

  it("a página dos pedidos (20, com o total), o laço dos resultados (1000 × 50) e o 1 linha do Editar; os tetos", () => {
    expect(CONSULTAS_NUTRICAO.pedidos_exame_do_aluno.params).toEqual({ aluno: { tipo: "uuid", obrigatorio: true }, pagina: { tipo: "inteiro", min: 1, max: INT4_MAX, obrigatorio: true } });
    expect(CONSULTAS_NUTRICAO.pedidos_exame_do_aluno.fonte).toMatchObject({ pagina: { param: "pagina", tamanho: 20 }, contar: true, ordem: [{ coluna: "data", asc: false }, { coluna: "created_at", asc: false }, { coluna: "id", asc: false }] });
    expect(CONSULTAS_NUTRICAO.resultados_exame_do_aluno.fonte).toMatchObject({ laco: { tamanho: 1000, leituras: 50 }, ordem: [{ coluna: "data", asc: false }, { coluna: "exame", asc: true }, { coluna: "id", asc: true }] });
    expect([POR_PAGINA_LEITURA, RESULTADOS_POR_LEITURA, MAX_LEITURAS_RESULTADOS, TETO_LISTA]).toEqual([20, 1000, 50, 1000]);
    // o Editar da Avaliação lia pelo id SEM o filtro das vivas (.select("*").eq("id", …).maybeSingle()) — igual
    expect(CONSULTAS_NUTRICAO.antropometria.fonte).toEqual({
      tabela: "antropometrias", colunas: COLUNAS_DO_PAINEL.antropometrias, teto: 1, filtros: [{ param: "id", coluna: "id", op: "eq" }], uma: true,
    });
    expect(CONSULTAS_NUTRICAO.antropometrias_pdf.params).toEqual({ paciente: { tipo: "uuid", obrigatorio: true } });
    expect(CONSULTAS_NUTRICAO.antropometrias_pdf.fonte).toMatchObject({ filtros: [{ param: "paciente", coluna: "paciente_id", op: "eq" }], vivas: true, ordem: [{ coluna: "data", asc: true }] });
  });
});

describe("hml-20b — cada consulta nova no módulo (como a pessoa, com o RLS simulado): positivo e negativo", () => {
  it.each(LISTAS_DO_ALUNO.map((l) => [l.q, l] as const))("%s: as colunas do tipo, paciente_id = o aluno, as vivas, a ordem da lib, teto 1000; o corpo não vira filtro", async (_q, l) => {
    const linhas = [{ id: D1 }, { id: D2 }];
    const { c, consultas, rpcs } = contexto20b([{ q: l.q, aluno: ALUNO, nutricionista_id: OUTRA, user_id: OUTRA, paciente_id: OUTRA, deleted_at: "x", colunas: "*" }], {
      tabela: () => ({ data: linhas, error: null }),
    });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, linhas }]);
    expect(rpcs).toEqual([]);
    expect(consultas).toEqual([{
      tabela: l.tabela, colunas: COLUNAS_DO_PAINEL[l.tabela as keyof typeof COLUNAS_DO_PAINEL].join(", "), contar: false,
      filtros: [["eq", "paciente_id", ALUNO], ["is", "deleted_at", null]], ordem: l.ordem, limite: 1000, range: null,
    }]);
    expect(consultas[0].colunas).not.toContain("*");
  });

  it.each(LISTAS_DO_ALUNO.map((l) => l.q))("%s: aluno ruim ou faltando → dados_invalidos (nada roda)", async (q) => {
    const { c, consultas } = contexto20b([{ q, aluno: "abc" }, { q }, { q, aluno: 5 }], {});
    expect(itensDa(await atenderLeitura(c))).toEqual(Array(3).fill({ ok: false, erro: "dados_invalidos" }));
    expect(consultas).toEqual([]);
  });

  it("N1 (como hoje): outra conta — o RLS devolve vazio → lista vazia, nunca uma linha do aluno", async () => {
    const { c } = contexto20b(LISTAS_DO_ALUNO.map((l) => ({ q: l.q, aluno: ALUNO })), { tabela: () => ({ data: [], error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual(Array(LISTAS_DO_ALUNO.length).fill({ ok: true, linhas: [] }));
  });

  it.each(LISTAS_DA_CONTA.map((l) => [l.q, l] as const))("%s: o RLS decide (sem filtro de dono nem do corpo), as vivas e a ordem da lib", async (_q, l) => {
    const { c, consultas } = contexto20b([{ q: l.q, nutricionista_id: OUTRA, user_id: OUTRA, aluno: ALUNO }], { tabela: () => ({ data: [{ id: D1 }], error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, linhas: [{ id: D1 }] }]);
    expect(consultas).toEqual([{
      tabela: l.tabela, colunas: COLUNAS_DO_PAINEL[l.tabela as keyof typeof COLUNAS_DO_PAINEL].join(", "), contar: false,
      filtros: [["is", "deleted_at", null]], ordem: l.ordem, limite: 1000, range: null,
    }]);
  });

  it("profissional: o profiles de QUEM CHAMA (id = o user do token), nome + dados profissionais, 1 linha; o id do corpo é ignorado", async () => {
    const { c, consultas } = contexto20b([{ q: "profissional", id: OUTRA, user_id: OUTRA, nutricionista_id: OUTRA }], {
      tabela: () => ({ data: [{ nome: "Camila", dados_profissionais: { crn: "1" } }], error: null }),
    });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, linhas: [{ nome: "Camila", dados_profissionais: { crn: "1" } }] }]);
    expect(consultas).toEqual([{ tabela: "profiles", colunas: "nome, dados_profissionais", contar: false, filtros: [["eq", "id", EU]], ordem: [], limite: 1, range: null }]);
  });

  it("aluno_perfil: a aluno_perfil(p_aluno) como a pessoa; o código de propósito volta como ele (aviso, não excecao); o resto, erro_interno", async () => {
    const perfil = { ok: true, paciente_id: D1, nome: "Aluna" };
    const ok = contexto20b([{ q: "aluno_perfil", aluno: ALUNO, p_aluno: OUTRA }], { rpc: () => ({ data: perfil, error: null }) });
    expect(itensDa(await atenderLeitura(ok.c))).toEqual([{ ok: true, valor: perfil }]);
    expect(ok.rpcs).toEqual([{ nome: "aluno_perfil", args: { p_aluno: ALUNO } }]);
    for (const codigo of ERROS_DO_AVISO) {
      const r = contexto20b([{ q: "aluno_perfil", aluno: ALUNO }], { rpc: () => raise(codigo) });
      expect(itensDa(await atenderLeitura(r.c)), codigo).toEqual([{ ok: false, erro: codigo }]);
      expect(r.log.excecao, codigo).not.toHaveBeenCalled();
      expect(r.log.aviso).toHaveBeenCalledWith(expect.objectContaining({ codigo, acao: "aluno_perfil", pg: "P0001" }));
    }
    const ruim = contexto20b([{ q: "aluno_perfil", aluno: ALUNO }], { rpc: () => raise("division_by_zero qualquer") });
    expect(itensDa(await atenderLeitura(ruim.c))).toEqual([{ ok: false, erro: "erro_interno" }]);
    expect(ruim.log.excecao).toHaveBeenCalledTimes(1);
  });

  it("aluno_evolucao_painel: a aluno_evolucao(p_aluno) + as URLs das fotos na MESMA ida — só os caminhos que a RPC devolveu (N8), evolucao do ambiente, 1 h", async () => {
    const valor = { paciente_id: D1, objetivo: null, antropometrias: [{ id: "a1" }], fotos: [{ id: "f1", path: `${EU}/${D1}/x.jpg` }] };
    const { c, rpcs, assinaturas } = contexto20b([{ q: "aluno_evolucao_painel", aluno: ALUNO, path: "outra/pasta/z.jpg", caminhos: ["outra/pasta/z.jpg"] }], {
      rpc: () => ({ data: valor, error: null }),
      assinar: (bucket, caminhos) => assinadas(bucket, caminhos, ["outra/pasta/z.jpg"]),
    });
    const [item] = itensDa(await atenderLeitura(c));
    expect(rpcs).toEqual([{ nome: "aluno_evolucao", args: { p_aluno: ALUNO } }]);
    expect(assinaturas).toEqual([{ bucket: "evolucao-staging", caminhos: [`${EU}/${D1}/x.jpg`], validade: 3600 }]);
    const p = `${EU}/${D1}/x.jpg`;
    expect(item).toEqual({ ok: true, valor: { ...valor, fotos: [{ id: "f1", path: p, url: `${PREFIXO_ASSINADA}evolucao-staging/${p}?token=t-${p.length}` }] } });
    // N1: outra conta → a w14 levanta sem_acesso → o código, e nada é assinado
    const n1 = contexto20b([{ q: "aluno_evolucao_painel", aluno: ALUNO }], { rpc: () => raise("sem_acesso") });
    expect(itensDa(await atenderLeitura(n1.c))).toEqual([{ ok: false, erro: "sem_acesso" }]);
    expect(n1.assinaturas).toEqual([]);
  });

  it("anotacoes: as últimas N (card), a página (limite + offset) e todas (anotacoes_todas, o PDF) — os args de hoje; os negativos", async () => {
    const valor = { ok: true, paciente_id: D1, total: 0, clinico: true, anotacoes: [] };
    const { c, rpcs } = contexto20b([
      { q: "anotacoes", aluno: ALUNO, limite: 3 },
      { q: "anotacoes", aluno: ALUNO, limite: 20, offset: 40 },
      { q: "anotacoes_todas", aluno: ALUNO, limite: 3, offset: 0, p_limite: 9 },
      { q: "anotacoes", aluno: ALUNO }, // sem limite → dados_invalidos (todas = anotacoes_todas)
      { q: "anotacoes", aluno: ALUNO, limite: 0 },
      { q: "anotacoes", aluno: ALUNO, limite: ANOTACOES_LIMITE_MAX + 1 },
      { q: "anotacoes", aluno: ALUNO, limite: 20, offset: -1 },
      { q: "anotacoes", aluno: ALUNO, limite: 2.5 },
    ], { rpc: () => ({ data: valor, error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual([
      { ok: true, valor }, { ok: true, valor }, { ok: true, valor },
      ...Array(5).fill({ ok: false, erro: "dados_invalidos" }),
    ]);
    expect(rpcs).toEqual([
      { nome: "aluno_anotacoes", args: { p_aluno: ALUNO, p_limite: 3 } },
      { nome: "aluno_anotacoes", args: { p_aluno: ALUNO, p_limite: 20, p_offset: 40 } },
      { nome: "aluno_anotacoes", args: { p_aluno: ALUNO } },
    ]);
  });

  it("exames_do_aluno: os args de hoje (o p_exame só quando há filtro); texto acima do teto e limite fora da faixa → dados_invalidos", async () => {
    const valor = { ok: true, total_datas: 0, datas: [] };
    const { c, rpcs } = contexto20b([
      { q: "exames_do_aluno", aluno: ALUNO, offset: 20, limite: 20 },
      { q: "exames_do_aluno", aluno: ALUNO, exame: "HDL", offset: 0, limite: 20 },
      { q: "exames_do_aluno", aluno: ALUNO, exame: "x".repeat(EXAME_NOME_MAX + 1), offset: 0, limite: 20 },
      { q: "exames_do_aluno", aluno: ALUNO, offset: 0, limite: EXAMES_LIMITE_MAX + 1 },
      { q: "exames_do_aluno", aluno: ALUNO, limite: 20 },
    ], { rpc: () => ({ data: valor, error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, valor }, { ok: true, valor }, ...Array(3).fill({ ok: false, erro: "dados_invalidos" })]);
    expect(rpcs).toEqual([
      { nome: "exames_do_aluno", args: { p_aluno: ALUNO, p_offset: 20, p_limite: 20 } },
      { nome: "exames_do_aluno", args: { p_aluno: ALUNO, p_exame: "HDL", p_offset: 0, p_limite: 20 } },
    ]);
  });

  it("pedidos_exame_do_aluno: a PÁGINA com o count exato (o total), a ordem estável; sem a contagem → erro_interno; página 0 → dados_invalidos", async () => {
    const { c, consultas } = contexto20b([{ q: "pedidos_exame_do_aluno", aluno: ALUNO, pagina: 3, offset: 0 }], {
      tabela: (q) => ({ data: [{ id: "p40" }], error: null, count: q.contar ? 41 : null }),
    });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, linhas: [{ id: "p40" }], total: 41 }]);
    expect(consultas).toEqual([{
      tabela: "pedidos_exame", colunas: COLUNAS_DO_PAINEL.pedidos_exame.join(", "), contar: true, filtros: [["eq", "paciente_id", ALUNO], ["is", "deleted_at", null]],
      ordem: [["data", false], ["created_at", false], ["id", false]], limite: null, range: [40, 59],
    }]);
    const semConta = contexto20b([{ q: "pedidos_exame_do_aluno", aluno: ALUNO, pagina: 1 }], { tabela: () => ({ data: [], error: null, count: null }) });
    expect(itensDa(await atenderLeitura(semConta.c))).toEqual([{ ok: false, erro: "erro_interno" }]);
    const ruim = contexto20b([{ q: "pedidos_exame_do_aluno", aluno: ALUNO, pagina: 0 }, { q: "pedidos_exame_do_aluno", aluno: ALUNO }], {});
    expect(itensDa(await atenderLeitura(ruim.c))).toEqual(Array(2).fill({ ok: false, erro: "dados_invalidos" }));
    expect(ruim.consultas).toEqual([]);
  });

  it("resultados_exame_do_aluno: TODOS, em leituras de 1000 com a ordem estável até a última (2007 → 3 leituras; 1000 exato → 2)", async () => {
    const linhas = Array.from({ length: 2007 }, (_, i) => ({ id: `r${i}` }));
    const fatia = (q: Consulta20b) => ({ data: linhas.slice(q.range![0], q.range![1] + 1), error: null });
    const { c, consultas } = contexto20b([{ q: "resultados_exame_do_aluno", aluno: ALUNO }], { tabela: fatia });
    const [item] = itensDa(await atenderLeitura(c));
    expect(item).toEqual({ ok: true, linhas });
    expect(consultas.map((q) => q.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(consultas[0]).toMatchObject({ tabela: "resultados_exame", colunas: COLUNAS_DO_PAINEL.resultados_exame.join(", "), contar: false, limite: null,
      filtros: [["eq", "paciente_id", ALUNO], ["is", "deleted_at", null]], ordem: [["data", false], ["exame", true], ["id", true]] });
    const mil = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    const exato = contexto20b([{ q: "resultados_exame_do_aluno", aluno: ALUNO }], { tabela: (q) => ({ data: mil.slice(q.range![0], q.range![1] + 1), error: null }) });
    expect(itensDa(await atenderLeitura(exato.c))).toEqual([{ ok: true, linhas: mil }]);
    expect(exato.consultas).toHaveLength(2);
  });

  it("resultados_exame_do_aluno: passou de 50 leituras → muitas_linhas (aviso); o prazo do pedido esgotado → tempo_esgotado (sem ler mais); o erro de uma leitura → o código", async () => {
    const cheia = (q: Consulta20b) => ({ data: Array.from({ length: q.range![1] - q.range![0] + 1 }, (_, i) => ({ id: q.range![0] + i })), error: null });
    const muitas = contexto20b([{ q: "resultados_exame_do_aluno", aluno: ALUNO }], { tabela: cheia });
    expect(itensDa(await atenderLeitura(muitas.c))).toEqual([{ ok: false, erro: ERRO_MUITAS_LINHAS }]);
    expect(muitas.consultas).toHaveLength(50);
    expect(muitas.log.aviso).toHaveBeenCalledWith({ codigo: "muitas_linhas", schema: "staging", acao: "resultados_exame_do_aluno", n: 50 });
    let leituras = 0;
    const prazo = { esgotado: () => leituras >= 2 };
    const esgotou = contexto20b([{ q: "resultados_exame_do_aluno", aluno: ALUNO }], { tabela: (q) => (leituras++, cheia(q)) }, prazo);
    expect(itensDa(await atenderLeitura(esgotou.c))).toEqual([{ ok: false, erro: "tempo_esgotado" }]);
    expect(esgotou.consultas).toHaveLength(2);
    expect(esgotou.log.excecao).toHaveBeenCalledTimes(1);
    const falha = contexto20b([{ q: "resultados_exame_do_aluno", aluno: ALUNO }], {
      tabela: (q) => (q.range![0] === 0 ? cheia(q) : { data: null, error: { code: "42501", message: "permission denied" } }),
    });
    expect(itensDa(await atenderLeitura(falha.c))).toEqual([{ ok: false, erro: "sem_acesso" }]);
  });

  it("anexo_url: relê a linha pelo id COMO A PESSOA (vivas, 1) e assina SÓ o caminho dela, com o nome dela — o corpo não manda caminho nem nome (N8)", async () => {
    const linha = { id: D1, path: `${EU}/${ALUNO}/${D1}-Laudo final.pdf`, nome: "Laudo final.pdf" };
    const { c, consultas, assinaturas } = contexto20b([
      { q: "anexo_url", id: D1, download: true, path: "outra/pasta/z.pdf", nome: "outro.pdf" },
      { q: "anexo_url", id: D1, download: false },
    ], { tabela: () => ({ data: [linha], error: null }) });
    const [baixar, ver] = itensDa(await atenderLeitura(c));
    expect(consultas).toEqual(Array(2).fill({
      tabela: "anexos", colunas: "id, path, nome", contar: false, filtros: [["eq", "id", D1], ["is", "deleted_at", null]], ordem: [], limite: 1, range: null,
    }));
    expect(assinaturas).toEqual([
      { bucket: "anexos-staging", caminhos: [linha.path], validade: 60, opcoes: { download: "Laudo final.pdf" } },
      { bucket: "anexos-staging", caminhos: [linha.path], validade: 120 },
    ]);
    expect(baixar).toEqual({ ok: true, linhas: [{ ...linha, url: `${PREFIXO_ASSINADA}anexos-staging/${linha.path}?token=t1&download=Laudo%20final.pdf` }] });
    expect(ver).toEqual({ ok: true, linhas: [{ ...linha, url: `${PREFIXO_ASSINADA}anexos-staging/${linha.path}?token=t1` }] });
  });

  it("anexo_url: outra conta / já excluído (0 linha) → nao_encontrado, nada assinado; o Storage fora → url null + aviso (sem o caminho); id ruim → dados_invalidos", async () => {
    const vazio = contexto20b([{ q: "anexo_url", id: D1, download: true }], { tabela: () => ({ data: [], error: null }) });
    expect(itensDa(await atenderLeitura(vazio.c))).toEqual([{ ok: false, erro: "nao_encontrado" }]);
    expect(vazio.assinaturas).toEqual([]);
    const linha = { id: D1, path: "n/p/a.pdf", nome: "a.pdf" };
    const fora = contexto20b([{ q: "anexo_url", id: D1 }], { tabela: () => ({ data: [linha], error: null }), assinarUma: () => ({ data: null, error: { status: 400, message: "Object not found" } }) });
    expect(itensDa(await atenderLeitura(fora.c))).toEqual([{ ok: true, linhas: [{ ...linha, url: null }] }]);
    expect(fora.log.aviso).toHaveBeenCalledWith({ codigo: "assinar_falhou", schema: "staging", acao: "anexo_url", status: 400, n: 1 });
    const ruim = contexto20b([{ q: "anexo_url", id: "../x" }, { q: "anexo_url", id: D1, download: "sim" }], {});
    expect(itensDa(await atenderLeitura(ruim.c))).toEqual(Array(2).fill({ ok: false, erro: "dados_invalidos" }));
    expect(ruim.consultas).toEqual([]);
  });

  it("antropometria (Avaliação › Editar): 1 pelo id, as colunas do tipo, sem o filtro das vivas (como a tela lia); 0 linha → nao_encontrado", async () => {
    const a = { id: D1, peso: 70 };
    const { c, consultas } = contexto20b([{ q: "antropometria", id: D1, paciente_id: OUTRA }], { tabela: () => ({ data: [a], error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, linhas: [a] }]);
    expect(consultas).toEqual([{ tabela: "antropometrias", colunas: COLUNAS_DO_PAINEL.antropometrias.join(", "), contar: false, filtros: [["eq", "id", D1]], ordem: [], limite: 1, range: null }]);
    const n1 = contexto20b([{ q: "antropometria", id: D1 }], { tabela: () => ({ data: [], error: null }) });
    expect(itensDa(await atenderLeitura(n1.c))).toEqual([{ ok: false, erro: "nao_encontrado" }]);
  });

  it("antropometrias_pdf: as 12 colunas do PDF, o paciente do corpo, as vivas, da mais antiga para a mais nova", async () => {
    const { c, consultas } = contexto20b([{ q: "antropometrias_pdf", paciente: ALUNO, aluno: OUTRA }], { tabela: () => ({ data: [], error: null }) });
    expect(itensDa(await atenderLeitura(c))).toEqual([{ ok: true, linhas: [] }]);
    expect(consultas).toEqual([{
      tabela: "antropometrias", colunas: "id, data, peso, altura, sexo, idade, circunferencias, dobras, protocolo, resultados, nutricionista_id, created_at", contar: false,
      filtros: [["eq", "paciente_id", ALUNO], ["is", "deleted_at", null]], ordem: [["data", true]], limite: 1000, range: null,
    }]);
  });

  it("a tela inteira numa ida: o Resumo/casca + uma seção = 1 lote; os iguais (o profissional 2×) rodam 1 vez", async () => {
    const { c, rpcs, consultas } = contexto20b([
      { q: "aluno_perfil", aluno: ALUNO }, { q: "aluno_evolucao_painel", aluno: ALUNO }, { q: "anotacoes", aluno: ALUNO, limite: 3 },
      { q: "documentos_do_aluno", aluno: ALUNO }, { q: "modelos_documento" }, { q: "profissional" }, { q: "profissional" },
    ], { rpc: () => ({ data: { ok: true, fotos: [] }, error: null }), tabela: () => ({ data: [], error: null }) });
    const itens = itensDa(await atenderLeitura(c));
    expect(itens.every((i) => i.ok === true)).toBe(true);
    expect(rpcs.map((r) => r.nome)).toEqual(["aluno_perfil", "aluno_evolucao", "aluno_anotacoes"]);
    expect(consultas.map((q) => q.tabela)).toEqual(["documentos", "modelos_documento", "profiles"]);
  });

  it("o log das consultas novas nunca leva params, linhas, caminhos nem nomes de arquivo", async () => {
    const linha = { id: D1, path: "n/p/segredo-laudo.pdf", nome: "segredo-laudo.pdf" };
    const { c, log } = contexto20b([
      { q: "anexo_url", id: D1, download: true }, { q: "exames_do_aluno", aluno: ALUNO, exame: "Glicemia secreta", offset: 0, limite: 20 },
      { q: "aluno_perfil", aluno: ALUNO }, { q: "resultados_exame_do_aluno", aluno: ALUNO },
    ], {
      tabela: (q) => (q.tabela === "anexos" ? { data: [linha], error: null } : { data: null, error: { code: "", message: `falhou ${ALUNO}` } }),
      rpc: (nome) => (nome === "aluno_perfil" ? raise("sem_acesso") : { data: { segredo: "dado de saúde" }, error: null }),
      assinarUma: () => ({ data: null, error: { status: 500, message: `não achou ${linha.path}` } }),
    });
    await atenderLeitura(c);
    const texto = JSON.stringify([log.info.mock.calls, log.aviso.mock.calls]);
    for (const proibido of [ALUNO, D1, linha.path, linha.nome, "Glicemia secreta", "dado de saúde"]) expect(texto, proibido).not.toContain(proibido);
    const permitidos = new Set(["codigo", "schema", "acao", "n", "ms", "resultado", "status", "pg"]);
    for (const [campos] of [...log.info.mock.calls, ...log.aviso.mock.calls]) for (const k of Object.keys(campos)) expect(permitidos.has(k), k).toBe(true);
  });
});

describe("hml-20b — o módulo lê como a pessoa (fonte): a página, o laço e a URL de 1 arquivo só do que a consulta leu", () => {
  const fonte = readFileSync(resolve(RAIZ, "supabase-principal/functions/nutricao/leituras.ts"), "utf-8");
  it("o count pelo select, o .range pela página/laço, o createSignedUrl só do caminho lido (caminhosParaAssinar da linha) e o nome pelo nomeDoDownload", () => {
    expect(fonte).toMatch(/select\(plano\.colunas, \{ count: "exact" \}\)/);
    expect(fonte).toMatch(/montar\(\)\.range\(extras\.intervalo\[0\], extras\.intervalo\[1\]\)/);
    expect(fonte).toMatch(/const \[caminho\] = caminhosParaAssinar\(\[linha\], a\.coluna\);/);
    expect(fonte).toMatch(/const nome = nomeDoDownload\(a, item\.params, linha\);/);
    expect(fonte).toMatch(/c\.comoPessoa\.storage\.from\(bucket\)\.createSignedUrl\(caminho, validade, /);
    expect(fonte).not.toMatch(/SERVICE_ROLE|service_role|createClient\(/);
  });
});
