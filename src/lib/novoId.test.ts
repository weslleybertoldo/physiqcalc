import { afterEach, describe, expect, it, vi } from "vitest";
import { arquivosDoApp, lerDoApp, semComentarios } from "@/test/fonte";
import { novoId } from "./novoId";

// T4 (27/10/2026): "crypto.randomUUID is not a function" no WebView antigo (Chrome < 92; visto 23/10 no celular de teste do Google, Android
// 11 com o Chrome 90). O id novo do app sai de uma função só: o randomUUID quando existe; senão o UUID v4 montado com o getRandomValues.

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CRYPTO = globalThis.crypto;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** O crypto de um navegador sem o randomUUID: só o getRandomValues (o de verdade, do Node). */
function semRandomUUID() {
  const getRandomValues = vi.fn((a: Uint8Array) => CRYPTO.getRandomValues(a));
  vi.stubGlobal("crypto", { getRandomValues });
  return getRandomValues;
}

describe("novoId: o UUID v4 do app, com ou sem o crypto.randomUUID", () => {
  it("com o randomUUID (o navegador novo): usa ele", () => {
    const randomUUID = vi.fn(() => "0b9c6f1e-2a3b-4c5d-8e9f-001122334455");
    vi.stubGlobal("crypto", { randomUUID, getRandomValues: vi.fn() });
    expect(novoId()).toBe("0b9c6f1e-2a3b-4c5d-8e9f-001122334455");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("SEM o randomUUID (WebView/Chrome < 92): sai UUID v4 válido e único, do getRandomValues — nunca do Math.random", () => {
    const getRandomValues = semRandomUUID();
    const aleatorio = vi.spyOn(Math, "random");
    const ids = Array.from({ length: 2000 }, () => novoId());
    for (const id of ids) expect(id).toMatch(V4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getRandomValues).toHaveBeenCalledTimes(ids.length);
    expect(aleatorio).not.toHaveBeenCalled();
  });

  it("o randomUUID que existe mas não é função (propriedade estranha) também cai no getRandomValues", () => {
    vi.stubGlobal("crypto", { randomUUID: "não é função", getRandomValues: (a: Uint8Array) => CRYPTO.getRandomValues(a) });
    expect(novoId()).toMatch(V4);
  });

  it("os bits do v4 e da variante saem certos mesmo com bytes extremos (tudo 0 e tudo 255)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(0) });
    expect(novoId()).toBe("00000000-0000-4000-8000-000000000000");
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(255) });
    expect(novoId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});

describe("guarda: nenhum crypto.randomUUID no código do app fora do lib/novoId.ts", () => {
  it("todo id novo do app sai do novoId()", () => {
    const usos = arquivosDoApp()
      .filter((c) => c.replace(/\\/g, "/") !== "lib/novoId.ts")
      .filter((c) => /randomUUID/.test(semComentarios(lerDoApp(c))));
    expect(usos).toEqual([]);
  });
});
