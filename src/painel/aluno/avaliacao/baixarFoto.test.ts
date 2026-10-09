import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ nativo: false, writeFile: vi.fn(), share: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Cache: "CACHE" }, Filesystem: { writeFile: (...a: unknown[]) => h.writeFile(...a) } }));
vi.mock("@capacitor/share", () => ({ Share: { share: (...a: unknown[]) => h.share(...a) } }));
import { baixarFoto, extensaoDoCaminho, nomeArquivoFoto, TEMPO_FOTO_MS, textoDaFoto, urlDeDownload } from "./baixarFoto";

describe("H5 — N-34: Ver e Baixar a foto de progresso no painel", () => {
  it("o nome do arquivo do Nutri (aluno-posição-data.ext), sem acento", () => {
    expect(nomeArquivoFoto("Rafael Moura", "Frente", "2026-09-30", "a/b/c-fisico1.jpg")).toBe("rafael-moura-frente-2026-09-30.jpg");
    expect(nomeArquivoFoto("Ana Lúcia Ávila", "Lado D", "2026-09", "x.PNG")).toBe("ana-lucia-avila-lado-d-2026-09.png");
    expect(nomeArquivoFoto("", "Costas", "2026-10-01", null)).toBe("aluno-costas-2026-10-01.jpg");
  });
  it("a extensão pelo caminho do Storage", () => {
    expect(extensaoDoCaminho("u/p/1-x.webp")).toBe("webp");
    expect(extensaoDoCaminho("u/p/1-x.jpeg?token=1")).toBe("jpg");
    expect(extensaoDoCaminho("u/p/sem-ext")).toBe("jpg");
  });
  it("a URL assinada ganha o pedido de download (o Storage manda baixar)", () => {
    const u = urlDeDownload("https://api-principal.physiqcalc.com.br/storage/v1/object/sign/evolucao/a.jpg?token=abc", "rafael-moura-frente-2026-09-30.jpg");
    expect(u).toContain("token=abc");
    expect(new URL(u).searchParams.get("download")).toBe("rafael-moura-frente-2026-09-30.jpg");
  });
  it("o título da foto: a data (a do personal é do mês)", () => {
    expect(textoDaFoto({ posicao: "frente", data: "2026-09-30", mensal: false })).toBe("Frente · 30/09/2026");
    expect(textoDaFoto({ posicao: "costas", data: "2026-09-01", mensal: true })).toBe("Costas · 09/2026");
  });
});

describe("hml-14 (H-32, D5): no APK a foto baixa em até 30 s, contando o arquivo inteiro", () => {
  const URL_FOTO = "https://api-principal.physiqcalc.com.br/storage/v1/object/sign/evolucao/a.jpg?token=abc";
  const NAO_ABRIU = "A foto não abriu. Feche e abra de novo.";
  const abortou = (init?: RequestInit) =>
    new Promise<never>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError"))));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    h.nativo = false;
    h.writeFile.mockReset();
    h.share.mockReset();
  });
  /** Chama o baixarFoto no APK e diz como terminou depois de `ms` (com o relógio falso). */
  async function noApkDepoisDe(fetchFalso: (url: RequestInfo | URL, init?: RequestInit) => Promise<unknown>, ms: number[]) {
    h.nativo = true;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(fetchFalso));
    let fim: unknown = "esperando";
    void baixarFoto(URL_FOTO, "ana-frente-2026-09-30.jpg").then((r) => (fim = r), (e: Error) => (fim = e.message));
    const vistos: unknown[] = [];
    for (const passo of ms) {
      await vi.advanceTimersByTimeAsync(passo);
      vistos.push(fim);
    }
    return vistos;
  }

  it("o Storage que não responde: largado aos 30 s com a frase de quando a foto não abre", async () => {
    expect(TEMPO_FOTO_MS).toBe(30_000);
    expect(await noApkDepoisDe((_u, init) => abortou(init), [29_999, 1])).toEqual(["esperando", NAO_ABRIU]);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("o arquivo que trava no meio (cabeçalhos chegaram) também para aos 30 s — o relógio vale até ler a foto", async () => {
    const cabecalhosNaHora = async (_u: RequestInfo | URL, init?: RequestInit) => ({ ok: true, status: 200, blob: () => abortou(init) });
    expect(await noApkDepoisDe(cabecalhosNaHora, [29_999, 1])).toEqual(["esperando", NAO_ABRIU]);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("sem internet: a mesma frase (antes saía o \"Failed to fetch\" do navegador)", async () => {
    h.nativo = true;
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(baixarFoto(URL_FOTO, "x.jpg")).rejects.toThrow(NAO_ABRIU);
  });

  it("a foto que chega vai para o cache e abre o compartilhar, como antes", async () => {
    h.nativo = true;
    h.writeFile.mockResolvedValue({ uri: "file:///cache/ana-frente-2026-09-30.jpg" });
    h.share.mockResolvedValue(undefined);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(["abc"], { type: "image/jpeg" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await baixarFoto(URL_FOTO, "ana-frente-2026-09-30.jpg")).toBe("compartilhado");
    expect(h.writeFile).toHaveBeenCalledWith({ path: "ana-frente-2026-09-30.jpg", data: "YWJj", directory: "CACHE" });
    expect(h.share).toHaveBeenCalledWith({ title: "ana-frente-2026-09-30.jpg", files: ["file:///cache/ana-frente-2026-09-30.jpg"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
