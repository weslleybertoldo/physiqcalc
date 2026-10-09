import { afterEach, describe, expect, it, vi } from "vitest";
import { arquivoDoBoneco, TEMPO_BONECO_MS } from "./boneco";

// hml-14d (H-32, D37): o arquivo do boneco (~2,5 MB) chega em até 30 s, contando o corpo. Antes, um fetch pendurado ficava
// guardado no módulo e toda ficha seguinte esperava para sempre.
const pendurado = (_url: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError"))));

/** A resposta cujos cabeçalhos chegam na hora e o corpo só termina quando o sinal aborta. */
const corpoPendurado = (_url: RequestInfo | URL, init?: RequestInit) =>
  Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError")))),
  } as unknown as Response);

const chegou = (bytes: number) => Promise.resolve(new Response(new ArrayBuffer(bytes), { status: 200 }));

/** Como a promessa estava depois de cada passo do relógio falso ("esperando", o nome do erro ou o tamanho do arquivo). */
async function depoisDe(promessa: Promise<ArrayBuffer>, passos: number[]) {
  let fim: unknown = "esperando";
  promessa.then(
    (a) => (fim = a.byteLength),
    (e: Error) => (fim = e.name || e.message),
  );
  const vistos: unknown[] = [];
  for (const passo of passos) {
    await vi.advanceTimersByTimeAsync(passo);
    vistos.push(fim);
  }
  return vistos;
}

describe("hml-14d (D37): o boneco 3D baixa em até 30 s e, se não chegar, a próxima ficha tenta de novo", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("servidor que não responde: desiste aos 30 s, limpa o guardado e a próxima ficha baixa de novo", async () => {
    expect(TEMPO_BONECO_MS).toBe(30_000);
    vi.useFakeTimers();
    const f = vi.fn(pendurado);
    vi.stubGlobal("fetch", f);
    const url = "https://cdn.teste/boneco-a.glb";
    expect(await depoisDe(arquivoDoBoneco(url), [29_999, 1])).toEqual(["esperando", "AbortError"]);
    f.mockImplementation(() => chegou(8));
    await expect(arquivoDoBoneco(url)).resolves.toHaveProperty("byteLength", 8);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("o corpo que pendura também conta: aos 30 s desiste (o relógio vale até ler o arquivo)", async () => {
    vi.useFakeTimers();
    const f = vi.fn(corpoPendurado);
    vi.stubGlobal("fetch", f);
    const url = "https://cdn.teste/boneco-b.glb";
    expect(await depoisDe(arquivoDoBoneco(url), [29_999, 1])).toEqual(["esperando", "AbortError"]);
    f.mockImplementation(() => chegou(4));
    await expect(arquivoDoBoneco(url)).resolves.toHaveProperty("byteLength", 4);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("deu certo: a ficha seguinte usa o arquivo guardado (1 download só)", async () => {
    const f = vi.fn(() => chegou(16));
    vi.stubGlobal("fetch", f);
    const url = "https://cdn.teste/boneco-c.glb";
    const a = await arquivoDoBoneco(url);
    const b = await arquivoDoBoneco(url);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("HTTP de erro: rejeita e a próxima ficha tenta de novo", async () => {
    const f = vi.fn(() => Promise.resolve(new Response("x", { status: 503 })));
    vi.stubGlobal("fetch", f);
    const url = "https://cdn.teste/boneco-d.glb";
    await expect(arquivoDoBoneco(url)).rejects.toThrow("boneco 3D: HTTP 503");
    f.mockImplementation(() => chegou(2));
    await expect(arquivoDoBoneco(url)).resolves.toHaveProperty("byteLength", 2);
  });
});
