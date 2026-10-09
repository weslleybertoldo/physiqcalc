// @vitest-environment node
// (o jsdom do Vitest não tem AbortSignal.timeout nem AbortSignal.any; o Node 22 e o Deno têm)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ORCAMENTO_MS,
  TEMPO_MS,
  buscarComTempo,
  prazo,
  tempoEsgotado,
} from "../../supabase-principal/functions/_shared/tempo";
import { ListaGrandeDemais, MAX_ROWS, emLotes, todasAsPaginas } from "../../supabase-principal/functions/_shared/paginas";

// hml-14 (H-32, D2 e D9) — os 2 ajudantes comuns das funções: tempo de cada chamada para fora e listas além do corte de 1000.
const raiz = resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(resolve(raiz, rel), "utf-8");

describe("as cópias dos 2 projetos são iguais (o deploy só leva o _shared do próprio projeto)", () => {
  for (const arquivo of ["tempo.ts", "paginas.ts"]) {
    it(arquivo, () => {
      expect(ler(`supabase/functions/_shared/${arquivo}`)).toBe(ler(`supabase-principal/functions/_shared/${arquivo}`));
    });
  }

  it("sem import de URL nem o global Deno (o Vitest importa)", () => {
    for (const arquivo of ["tempo.ts", "paginas.ts"]) {
      const fonte = ler(`supabase-principal/functions/_shared/${arquivo}`);
      expect(fonte).not.toMatch(/from\s+["']https?:/);
      expect(fonte).not.toMatch(/\bDeno\./);
    }
  });

  it("o aviso de erro usa o tempoEsgotado do ajudante (sem cópia própria)", () => {
    const fonte = ler("supabase-principal/functions/_shared/erro-avisar-regras.ts");
    expect(fonte).toMatch(/import \{ tempoEsgotado \} from "\.\/tempo\.ts";/);
    expect(fonte).not.toMatch(/function tempoEsgotado/);
  });
});

/** fetch falso que nunca responde: só rejeita quando o sinal aborta (como o fetch de verdade). */
function fetchPendurado(): typeof fetch {
  return ((_entrada: unknown, init?: RequestInit) =>
    new Promise<Response>((_ok, falha) => {
      const sinal = init?.signal;
      if (!sinal) return;
      if (sinal.aborted) return falha(sinal.reason);
      sinal.addEventListener("abort", () => falha(sinal.reason), { once: true });
    })) as typeof fetch;
}

describe("buscarComTempo", () => {
  it("destino que nunca responde → TimeoutError no tempo pedido", async () => {
    const inicio = Date.now();
    const erro = await buscarComTempo("https://exemplo.invalid/x", {}, 30, fetchPendurado()).catch((e) => e);
    const levou = Date.now() - inicio;
    expect(tempoEsgotado(erro)).toBe(true);
    expect((erro as { name?: string }).name).toBe("TimeoutError");
    expect(levou).toBeGreaterThanOrEqual(20);
    expect(levou).toBeLessThan(2_000);
  });

  it("o signal de quem chama também aborta (AbortError)", async () => {
    const controle = new AbortController();
    const pedido = buscarComTempo("https://exemplo.invalid/x", { signal: controle.signal }, 60_000, fetchPendurado());
    controle.abort();
    const erro = await pedido.catch((e) => e);
    expect(tempoEsgotado(erro)).toBe(true);
    expect((erro as { name?: string }).name).toBe("AbortError");
  });

  it("resposta a tempo passa igual, com o mesmo init e um sinal", async () => {
    const base = vi.fn(async (_e: unknown, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok", { status: 201 });
    });
    const r = await buscarComTempo("https://exemplo.invalid/x", { method: "POST" }, 1_000, base as unknown as typeof fetch);
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("ok");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("erro de rede não é tempo esgotado", () => {
    expect(tempoEsgotado(new TypeError("fetch failed"))).toBe(false);
    expect(tempoEsgotado(null)).toBe(false);
    expect(tempoEsgotado("TimeoutError")).toBe(false);
  });
});

describe("prazo", () => {
  it("conta o que falta e esgota no fim (relógio falso)", () => {
    let agora = 1_000;
    const p = prazo(20_000, () => agora);
    expect(p.restante()).toBe(20_000);
    expect(p.esgotado()).toBe(false);
    agora += 18_500;
    expect(p.restante()).toBe(1_500);
    agora += 2_000;
    expect(p.restante()).toBe(0);
    expect(p.esgotado()).toBe(true);
  });
});

describe("os tempos ficam acima do que as funções levam hoje e abaixo de quem espera (spec D3)", () => {
  it("por chamada", () => {
    expect(TEMPO_MS.treino).toBeGreaterThan(12_700); // vincular-professor: máximo medido 12,7 s
    expect(TEMPO_MS.espelhoNucleo).toBeGreaterThan(11_100);
    expect(TEMPO_MS.exclusao).toBeGreaterThan(10_000);
    expect(TEMPO_MS.mp).toBeLessThan(ORCAMENTO_MS.usuario);
  });

  it("por pedido", () => {
    expect(ORCAMENTO_MS.usuario).toBeLessThan(25_000); // o front passa a esperar 25 s por função (D5)
    expect(ORCAMENTO_MS.servidor).toBeLessThanOrEqual(25_000);
    expect(ORCAMENTO_MS.loteEspelho).toBeLessThan(150_000); // limite da plataforma
  });
});

describe("todasAsPaginas", () => {
  /** Banco falso com `total` linhas numeradas; guarda os ranges pedidos. */
  function banco(total: number, erroNaPagina?: number) {
    const pedidos: Array<[number, number]> = [];
    const montar = (de: number, ate: number) => {
      pedidos.push([de, ate]);
      if (erroNaPagina !== undefined && de / MAX_ROWS === erroNaPagina) {
        return Promise.resolve({ data: null, error: { message: "banco fora", code: "57014" } });
      }
      const fim = Math.min(ate, total - 1);
      const data = de > fim ? [] : Array.from({ length: fim - de + 1 }, (_, i) => de + i);
      return Promise.resolve({ data, error: null });
    };
    return { montar, pedidos };
  }

  it("2500 linhas → 3 páginas de 1000, todas as linhas, na ordem", async () => {
    const b = banco(2_500);
    const linhas = await todasAsPaginas(b.montar);
    expect(linhas).toHaveLength(2_500);
    expect(linhas[0]).toBe(0);
    expect(linhas[2_499]).toBe(2_499);
    expect(b.pedidos).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999],
    ]);
  });

  it("exatamente 1000 → pede a 2ª página, vem vazia e para", async () => {
    const b = banco(1_000);
    expect(await todasAsPaginas(b.montar)).toHaveLength(1_000);
    expect(b.pedidos).toHaveLength(2);
  });

  it("lista vazia e data nula viram []", async () => {
    expect(await todasAsPaginas(banco(0).montar)).toEqual([]);
    expect(await todasAsPaginas(() => Promise.resolve({ data: null, error: null }))).toEqual([]);
  });

  it("erro do banco no meio → lança o erro (nada de lista pela metade)", async () => {
    await expect(todasAsPaginas(banco(2_500, 1).montar)).rejects.toMatchObject({ message: "banco fora" });
  });

  it("passou do teto → ListaGrandeDemais (lista_grande_demais)", async () => {
    const erro = await todasAsPaginas(banco(10_000).montar, { porPagina: 100, maxPaginas: 3 }).catch((e) => e);
    expect(erro).toBeInstanceOf(ListaGrandeDemais);
    expect((erro as Error).message).toBe("lista_grande_demais");
  });

  it("porPagina acima de 1000 vale 1000 (o PostgREST cortaria calado)", async () => {
    const b = banco(1_500);
    await todasAsPaginas(b.montar, { porPagina: 5_000 });
    expect(b.pedidos[0]).toEqual([0, 999]);
  });
});

describe("emLotes", () => {
  it("lotes de 150, em série, resultados juntos e na ordem", async () => {
    const ids = Array.from({ length: 401 }, (_, i) => i);
    const lotes: number[][] = [];
    const r = await emLotes(ids, 150, async (lote) => {
      lotes.push(lote);
      return lote.map((x) => x * 2);
    });
    expect(lotes.map((l) => l.length)).toEqual([150, 150, 101]);
    expect(r).toHaveLength(401);
    expect(r[400]).toBe(800);
  });

  it("sem ids → não chama", async () => {
    const fn = vi.fn(async () => [1]);
    expect(await emLotes([], 150, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("erro de um lote → lança", async () => {
    await expect(
      emLotes([1, 2, 3], 2, async (lote) => {
        if (lote[0] === 3) throw new Error("lote falhou");
        return lote;
      }),
    ).rejects.toThrow("lote falhou");
  });
});
