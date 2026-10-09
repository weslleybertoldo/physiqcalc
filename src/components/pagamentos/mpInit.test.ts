import { afterEach, describe, expect, it, vi } from "vitest";

const { initMercadoPago } = vi.hoisted(() => ({ initMercadoPago: vi.fn() }));
vi.mock("@mercadopago/sdk-react", () => ({ initMercadoPago }));

describe("ensureMpInit (hml-15: o nonce da CSP para o antifraude do Mercado Pago)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    initMercadoPago.mockClear();
  });

  it("passa o MP_CSP_NONCE ao SDK (deviceProfileCspNonce) junto do locale, uma vez só", async () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "TEST-chave-publica");
    const { ensureMpInit, MP_CSP_NONCE } = await import("./mpInit");
    ensureMpInit();
    ensureMpInit();
    expect(initMercadoPago).toHaveBeenCalledTimes(1);
    expect(initMercadoPago).toHaveBeenCalledWith("TEST-chave-publica", { locale: "pt-BR", deviceProfileCspNonce: MP_CSP_NONCE });
  });

  it("o nonce é base64 com 22+ caracteres, sem espaço (o SDK recusa nonce com espaço ou vazio)", async () => {
    const { MP_CSP_NONCE } = await import("./mpInit");
    expect(MP_CSP_NONCE).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
  });

  it("sem a chave pública não inicia o SDK", async () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "");
    const { ensureMpInit } = await import("./mpInit");
    ensureMpInit();
    expect(initMercadoPago).not.toHaveBeenCalled();
  });
});
