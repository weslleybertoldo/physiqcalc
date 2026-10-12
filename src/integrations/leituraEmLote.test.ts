// Physiq hml-20a (H-42 · jeito 2, etapa 2 · decisão 4) — o lote automático das leituras no navegador (src/integrations/leituraEmLote.ts).
// Positivo: 3 leituras na mesma volta → 1 chamada com 3 itens, cada uma com a sua resposta; `sozinha` vai num lote só dela; 17 → 2 lotes.
// Negativo: o item { ok: false } rejeita só ele; a chamada que falha rejeita todas com o código; sem rede → sem_internet sem chamar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JANELA_MS, MAX_ITENS_POR_LOTE, criarLeitor, type RespostaDaFuncao } from "./leituraEmLote";

class ErroDeTeste extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(`frase:${codigo}`);
  }
}

type Corpo = { acao: string; itens: Array<Record<string, unknown>> };

/** A função falsa: responde cada item pela q (ok com o valor "v:<q>"; q "falha" → { ok: false, erro: "sem_acesso" }). */
function funcaoFalsa(resposta?: (corpo: Corpo) => RespostaDaFuncao | Promise<RespostaDaFuncao>) {
  return vi.fn(async (_funcao: string, corpo: Record<string, unknown>): Promise<RespostaDaFuncao> => {
    const c = corpo as unknown as Corpo;
    if (resposta) return await resposta(c);
    return {
      data: { ok: true, itens: c.itens.map((i) => (i.q === "falha" ? { ok: false, erro: "sem_acesso" } : { ok: true, valor: `v:${String(i.q)}`, total: 1 })) },
      error: null,
    };
  });
}

const leitor = (invocar: ReturnType<typeof funcaoFalsa>) =>
  criarLeitor({ funcao: "nutricao", invocar, erro: (codigo, extra) => new ErroDeTeste(codigo, extra) });

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => vi.useRealTimers());

describe("hml-20a — o lote automático (1 chamada por volta)", () => {
  it("3 leituras na mesma volta → 1 chamada à função com os 3 itens na ordem (a q por último), cada uma com a sua resposta", async () => {
    const invocar = funcaoFalsa();
    const ler = leitor(invocar);
    const p = Promise.all([ler("a", { dia: "2026-10-11" }), ler("b"), ler("c", { ids: ["x"], q: "tentou_trocar" })]);
    expect(invocar).not.toHaveBeenCalled(); // espera a janela
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    expect(await p).toEqual([{ valor: "v:a", total: 1 }, { valor: "v:b", total: 1 }, { valor: "v:c", total: 1 }]);
    expect(invocar).toHaveBeenCalledTimes(1);
    expect(invocar.mock.calls[0]).toEqual(["nutricao", { acao: "ler", itens: [{ dia: "2026-10-11", q: "a" }, { q: "b" }, { ids: ["x"], q: "c" }] }]);
  });

  it("leituras em voltas diferentes (depois da janela) → chamadas diferentes", async () => {
    const invocar = funcaoFalsa();
    const ler = leitor(invocar);
    const a = ler("a");
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    const b = ler("b");
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    await Promise.all([a, b]);
    expect(invocar).toHaveBeenCalledTimes(2);
  });

  it("`sozinha` vai num lote só dela (as pesadas não seguram a tela); as outras seguem juntas", async () => {
    const invocar = funcaoFalsa();
    const ler = leitor(invocar);
    const p = Promise.all([ler("a"), ler("pesada", {}, { sozinha: true }), ler("b")]);
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    await p;
    const lotes = invocar.mock.calls.map(([, c]) => (c as unknown as Corpo).itens.map((i) => i.q));
    expect(lotes).toEqual([["pesada"], ["a", "b"]]);
  });

  it("17 leituras → 2 lotes (16 + 1): o servidor recusaria 17 com lote_grande", async () => {
    const invocar = funcaoFalsa();
    const ler = leitor(invocar);
    const p = Promise.all(Array.from({ length: 17 }, (_, i) => ler(`q${i}`)));
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    const r = await p;
    expect(MAX_ITENS_POR_LOTE).toBe(16);
    expect(invocar.mock.calls.map(([, c]) => (c as unknown as Corpo).itens.length)).toEqual([16, 1]);
    expect(r.map((x) => x.valor)).toEqual(Array.from({ length: 17 }, (_, i) => `v:q${i}`));
  });
});

describe("hml-20a — os erros (por item e da chamada)", () => {
  it("o item { ok: false, erro } rejeita SÓ aquela leitura, com o código (as outras do lote resolvem)", async () => {
    const ler = leitor(funcaoFalsa());
    const ok1 = ler("a");
    const ruim = ler("falha").catch((e) => e);
    const ok2 = ler("b");
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    expect(await ok1).toEqual({ valor: "v:a", total: 1 });
    expect(await ok2).toEqual({ valor: "v:b", total: 1 });
    const e = await ruim;
    expect(e).toBeInstanceOf(ErroDeTeste);
    expect(e).toMatchObject({ codigo: "sem_acesso", message: "frase:sem_acesso" });
  });

  it("a chamada que falha rejeita TODAS com o mesmo código: a porta recusou (o { erro } do corpo), rede, 5xx sem corpo, resposta torta", async () => {
    const casos: Array<[string, () => RespostaDaFuncao | Promise<RespostaDaFuncao>]> = [
      ["muitas_acoes", () => ({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "muitas_acoes" }), { status: 429 }) } })],
      ["sem_login", () => ({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "sem_login" }), { status: 401 }) } })],
      ["lote_grande", () => ({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "lote_grande" }), { status: 400 }) } })],
      ["rede", () => ({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } })],
      ["erro_interno", () => ({ data: null, error: { name: "FunctionsHttpError", context: new Response("<html>502</html>", { status: 502 }) } })],
      ["erro_interno", () => ({ data: { ok: true }, error: null })],
      ["erro_interno", () => ({ data: null, error: null })],
    ];
    for (const [codigo, resposta] of casos) {
      const ler = leitor(funcaoFalsa(resposta));
      const p = Promise.allSettled([ler("a"), ler("b")]);
      await vi.advanceTimersByTimeAsync(JANELA_MS);
      const r = await p;
      expect(r.map((x) => (x.status === "rejected" ? (x.reason as ErroDeTeste).codigo : "ok")), codigo).toEqual([codigo, codigo]);
    }
  });

  it("revisão: o PRAZO (o AbortError/TimeoutError do relógio do fetch, dentro do FunctionsFetchError) → tempo_esgotado; a rede caída → rede", async () => {
    const casos: Array<[string, unknown]> = [
      ["tempo_esgotado", new DOMException("The operation was aborted.", "AbortError")],
      ["tempo_esgotado", Object.assign(new Error("signal timed out"), { name: "TimeoutError" })],
      ["rede", new TypeError("Failed to fetch")],
    ];
    for (const [codigo, causa] of casos) {
      const ler = leitor(funcaoFalsa(() => ({ data: null, error: { name: "FunctionsFetchError", context: causa } })));
      const p = ler("a").catch((e) => e);
      await vi.advanceTimersByTimeAsync(JANELA_MS);
      expect(await p, codigo).toMatchObject({ codigo });
    }
    // a invocação que lança o próprio AbortError (sem passar pelo supabase-js) também é o prazo
    const invocar = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const p = criarLeitor({ funcao: "nutricao", invocar, erro: (c) => new ErroDeTeste(c) })("a").catch((e) => e);
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    expect(await p).toMatchObject({ codigo: "tempo_esgotado" });
  });

  it("a invocação que lança (não devia: o supabase-js devolve o erro) → rede para todas", async () => {
    const invocar = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const ler = criarLeitor({ funcao: "nutricao", invocar, erro: (c) => new ErroDeTeste(c) });
    const p = ler("a").catch((e) => e);
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    expect(await p).toMatchObject({ codigo: "rede" });
  });

  it("a resposta com menos itens que o pedido: os que faltam rejeitam com erro_interno", async () => {
    const ler = leitor(funcaoFalsa(() => ({ data: { ok: true, itens: [{ ok: true, linhas: [] }] }, error: null })));
    const p = Promise.allSettled([ler("a"), ler("b")]);
    await vi.advanceTimersByTimeAsync(JANELA_MS);
    const [a, b] = await p;
    expect(a).toEqual({ status: "fulfilled", value: { linhas: [] } });
    expect(b.status === "rejected" && (b.reason as ErroDeTeste).codigo).toBe("erro_interno");
  });

  it("sem rede (navigator.onLine === false) → sem_internet NA HORA, sem chamar a função", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const invocar = funcaoFalsa();
    const ler = leitor(invocar);
    await expect(ler("a")).rejects.toMatchObject({ codigo: "sem_internet" });
    await vi.advanceTimersByTimeAsync(JANELA_MS * 10);
    expect(invocar).not.toHaveBeenCalled();
  });
});
