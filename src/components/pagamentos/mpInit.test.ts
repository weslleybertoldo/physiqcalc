// W2: o SDK por chave — a do vendedor (o Mercado Pago do personal: o token do cartão nasce na conta que recebe) ou a do Physiq (o padrão:
// o plano do personal e o modo de hoje). O initMercadoPago do sdk-react 1.0.7 zera a instância quando a chave muda.
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

describe("ensureMpInit por chave (W2: a chave do vendedor — o Mercado Pago do personal — ou a do Physiq)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    initMercadoPago.mockClear();
  });

  it("a do vendedor, a do Physiq (o padrão) e de volta: cada troca inicia de novo (o próximo Brick nasce com a nova); a mesma chave, não", async () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "TEST-chave-do-physiq");
    const { ensureMpInit, MP_CSP_NONCE } = await import("./mpInit");
    const opcoes = { locale: "pt-BR", deviceProfileCspNonce: MP_CSP_NONCE };
    ensureMpInit("APP_USR-chave-do-vendedor");
    ensureMpInit("APP_USR-chave-do-vendedor");
    ensureMpInit();
    ensureMpInit("TEST-chave-do-physiq");
    ensureMpInit("APP_USR-chave-do-vendedor");
    expect(initMercadoPago.mock.calls).toEqual([
      ["APP_USR-chave-do-vendedor", opcoes],
      ["TEST-chave-do-physiq", opcoes],
      ["APP_USR-chave-do-vendedor", opcoes],
    ]);
  });

  it("a chave do vendedor vale mesmo sem a do Physiq no build; sem nenhuma (nem vazia), não inicia", async () => {
    vi.stubEnv("VITE_MP_PUBLIC_KEY", "");
    const { ensureMpInit } = await import("./mpInit");
    ensureMpInit(undefined);
    ensureMpInit("");
    expect(initMercadoPago).not.toHaveBeenCalled();
    ensureMpInit("APP_USR-chave-do-vendedor");
    expect(initMercadoPago).toHaveBeenCalledTimes(1);
    expect(initMercadoPago.mock.calls[0][0]).toBe("APP_USR-chave-do-vendedor");
  });
});
