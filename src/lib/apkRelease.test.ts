import { describe, expect, it, vi } from "vitest";
import { RELEASES_API, ultimoApk } from "./apkRelease";

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
