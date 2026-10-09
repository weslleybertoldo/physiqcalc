import { afterEach, describe, expect, it, vi } from "vitest";
import { RELEASES_API, TEMPO_RELEASE_MS, ultimoApk } from "./apkRelease";

const resposta = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

describe("ultimoApk", () => {
  it("devolve versão sem o v e a URL do .apk", async () => {
    const f = vi.fn().mockResolvedValue(
      resposta({ tag_name: "v2.119", assets: [{ name: "PhysiqCalc-v2.119.apk", browser_download_url: "https://gh/x.apk" }] }),
    );
    await expect(ultimoApk(f as unknown as typeof fetch)).resolves.toEqual({ version: "2.119", url: "https://gh/x.apk" });
    expect(f).toHaveBeenCalledWith(RELEASES_API, { cache: "no-store" });
  });

  it("null sem asset .apk", async () => {
    const f = vi.fn().mockResolvedValue(resposta({ tag_name: "v2.119", assets: [{ name: "notas.txt", browser_download_url: "x" }] }));
    await expect(ultimoApk(f as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("null quando a API falha (rate limit / 404)", async () => {
    const f = vi.fn().mockResolvedValue(resposta({}, false));
    await expect(ultimoApk(f as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("null quando o fetch lança (sem rede)", async () => {
    const f = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(ultimoApk(f as unknown as typeof fetch)).resolves.toBeNull();
  });
});

describe("hml-14d (H-32, D37): sem fetcher, o GitHub responde em até 8 s ou a consulta desiste", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("o GitHub que não responde: null aos 8 s (1 pedido só, com o cache de sempre)", async () => {
    expect(TEMPO_RELEASE_MS).toBe(8_000);
    vi.useFakeTimers();
    const f = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError")))),
    );
    vi.stubGlobal("fetch", f);
    let fim: unknown = "esperando";
    void ultimoApk().then((r) => (fim = r));
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fim).toBe("esperando");
    await vi.advanceTimersByTimeAsync(1);
    expect(fim).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe(RELEASES_API);
    expect(f.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("o GitHub que responde a tempo: a versão de sempre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta({ tag_name: "v3.82", assets: [{ name: "PhysiqCalc-v3.82.apk", browser_download_url: "https://gh/y.apk" }] })),
    );
    await expect(ultimoApk()).resolves.toEqual({ version: "3.82", url: "https://gh/y.apk" });
  });
});
