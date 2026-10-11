// Physiq W1 — abrir a página da InfinitePay: APK por cima do app (Browser); site numa aba reservada NO TOQUE (o navegador bloqueia janela
// aberta depois de um await) ou, bloqueada, na mesma aba; nada fora do domínio da InfinitePay.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ nativo: false, abrir: vi.fn(), fechar: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: (...a: unknown[]) => h.abrir(...a), close: () => h.fechar() } }));

import { abrirLinkExterno, abrirPagina, fecharPagina, reservarAba } from "./abrirPagamento";

const URL_IP = "https://checkout.infinitepay.com.br/fulano?lenc=x";

beforeEach(() => {
  h.nativo = false;
  h.abrir.mockReset();
  h.fechar.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe("abrir a página da InfinitePay", () => {
  it("site: reserva a aba no toque (sem opener) e leva ao link quando ele chega", async () => {
    const janela = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    const aba = reservarAba();
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(janela.opener).toBeNull();
    expect(await abrirPagina(URL_IP, aba)).toBe("aba");
    expect(janela.location.href).toBe(URL_IP);
  });
  it("site com a aba bloqueada: a mesma aba (a volta traz o aluno a Pagamentos com a conferência)", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const ir = vi.fn();
    expect(reservarAba()).toBeNull();
    expect(await abrirPagina(URL_IP, null, ir)).toBe("mesma_aba");
    expect(ir).toHaveBeenCalledWith(URL_IP);
  });
  it("APK: por cima do app (Browser), sem aba; fecharPagina fecha o Browser", async () => {
    h.nativo = true;
    const open = vi.spyOn(window, "open");
    expect(reservarAba()).toBeNull();
    expect(await abrirPagina(URL_IP, null)).toBe("app");
    expect(h.abrir).toHaveBeenCalledWith({ url: URL_IP });
    expect(open).not.toHaveBeenCalled();
    await fecharPagina();
    expect(h.fechar).toHaveBeenCalled();
  });
  it("nada fora da InfinitePay (a página e o recibo)", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const fechar = vi.fn();
    expect(await abrirPagina("https://golpe.com/x", { ir: vi.fn(), fechar })).toBe("recusado");
    expect(fechar).toHaveBeenCalled();
    await abrirLinkExterno("https://golpe.com/r");
    expect(open).not.toHaveBeenCalled();
    await abrirLinkExterno("https://recibo.infinitepay.io/r");
    expect(open).toHaveBeenCalledWith("https://recibo.infinitepay.io/r", "_blank", "noopener,noreferrer");
  });
});
