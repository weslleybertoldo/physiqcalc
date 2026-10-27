import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarServiceWorker, type DepsDoRegistro } from "./registroDoServiceWorker";

// T4 (27/10/2026): o registro do service worker sai do index.html (o registerSW.js do vite-plugin-pwa, sem catch: o robô do Google que
// recusa o service worker virava "promessa sem catch · Rejected" no grupo) e passa a ser do app — com onRegisterError e SÓ no site; no
// app nativo (o APK do site e a versão da loja) não registra.

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Opcoes = { onNeedReload?: () => void; onRegisterError?: (e: unknown) => void; immediate?: boolean };

function montar(o: Partial<DepsDoRegistro> & { registerSW?: (opcoes: Opcoes) => unknown } = {}) {
  const registerSW = vi.fn(o.registerSW ?? (() => undefined));
  const carregar = vi.fn(async () => ({ registerSW }));
  const avisarNoConsole = vi.fn();
  const deps: DepsDoRegistro = { carregar, nativo: () => false, temServiceWorker: () => true, avisarNoConsole, ...o };
  return { deps, registerSW, carregar, avisarNoConsole };
}

describe("registrarServiceWorker: o site registra pelo vite-plugin-pwa; o app nativo não", () => {
  it("site: 1 registro, com onRegisterError e sem recarregar a página quando o service worker novo assume (como o registerSW.js de antes)", async () => {
    const { deps, registerSW } = montar();
    expect(await registrarServiceWorker(deps)).toBe("pedido");
    expect(registerSW).toHaveBeenCalledTimes(1);
    const opcoes = registerSW.mock.calls[0][0] as Opcoes;
    expect(typeof opcoes.onRegisterError).toBe("function");
    expect(typeof opcoes.onNeedReload).toBe("function");
    // o mesmo momento do registerSW.js: o load da página (o immediate fica no padrão do workbox-window)
    expect(opcoes.immediate).toBeUndefined();
    // com o onNeedReload, o registro do plugin não chama o location.reload() (sem ele, recarregaria a página no meio do uso)
    expect(opcoes.onNeedReload!()).toBeUndefined();
  });

  it("o registro recusado (o robô: 'Rejected') fica só no console — não lança e não vira aviso", async () => {
    const { deps, avisarNoConsole } = montar({ registerSW: (o) => o.onRegisterError?.(new Error("Rejected")) });
    expect(await registrarServiceWorker(deps)).toBe("pedido");
    expect(avisarNoConsole).toHaveBeenCalledTimes(1);
    expect(String(avisarNoConsole.mock.calls[0][0])).toContain("Rejected");
  });

  it("app nativo (Capacitor, o build feito à mão) → não carrega nem registra", async () => {
    const { deps, carregar, registerSW } = montar({ nativo: () => true });
    expect(await registrarServiceWorker(deps)).toBe("app_nativo");
    expect(carregar).not.toHaveBeenCalled();
    expect(registerSW).not.toHaveBeenCalled();
  });

  it("build do app (VITE_APP_NATIVO=1: o import cortado, carregar = null) → não registra", async () => {
    const { deps } = montar({ carregar: null });
    expect(await registrarServiceWorker(deps)).toBe("app_nativo");
  });

  it("navegador sem service worker → não carrega", async () => {
    const { deps, carregar } = montar({ temServiceWorker: () => false });
    expect(await registrarServiceWorker(deps)).toBe("sem_suporte");
    expect(carregar).not.toHaveBeenCalled();
  });

  it("o pedaço do registro que não carrega (rede, deploy novo) → 'falhou' no console, sem lançar", async () => {
    const { deps, avisarNoConsole } = montar({ carregar: async () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")) });
    expect(await registrarServiceWorker(deps)).toBe("falhou");
    expect(avisarNoConsole).toHaveBeenCalledTimes(1);
  });

  it("a ponte do Capacitor quebrada (o isNativePlatform lança) não derruba: conta como site", async () => {
    const { deps, registerSW } = montar({
      nativo: () => {
        throw new Error("sem ponte");
      },
    });
    expect(await registrarServiceWorker(deps)).toBe("pedido");
    expect(registerSW).toHaveBeenCalledTimes(1);
  });
});

describe("a cadeia de verdade (o registro do vite-plugin-pwa + o workbox-window) com o navegador que recusa o service worker", () => {
  it("navigator.serviceWorker.register rejeita 'Rejected' → onRegisterError, e NENHUMA promessa sem catch", async () => {
    const exigir = createRequire(import.meta.url);
    const registro = join(dirname(exigir.resolve("vite-plugin-pwa/package.json")), "dist/client/build/register.js");
    expect(existsSync(registro), `o registro do vite-plugin-pwa mudou de lugar: ${registro}`).toBe(true);
    const soltas: unknown[] = [];
    const pegarSolta = (motivo: unknown) => soltas.push(motivo);
    process.on("unhandledRejection", pegarSolta);
    const register = vi.fn(() => Promise.reject(new Error("Rejected")));
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { controller: null, register, addEventListener: () => undefined } });
    try {
      if (document.readyState !== "complete") window.dispatchEvent(new Event("load"));
      let recusado: (texto: string) => void = () => undefined;
      const noConsole = new Promise<string>((ok) => (recusado = ok));
      const r = await registrarServiceWorker({
        carregar: () => import(/* @vite-ignore */ registro),
        nativo: () => false,
        temServiceWorker: () => true,
        avisarNoConsole: (texto) => recusado(texto),
      });
      expect(r).toBe("pedido");
      const texto = await Promise.race([noConsole, new Promise<string>((_, nao) => setTimeout(() => nao(new Error("o onRegisterError não veio")), 5000))]);
      expect(texto).toContain("Rejected");
      expect(register).toHaveBeenCalledTimes(1);
      await new Promise((ok) => setTimeout(ok, 50));
      expect(soltas).toEqual([]);
    } finally {
      process.off("unhandledRejection", pegarSolta);
    }
  });
});

describe("guarda: o registro é do app (main.tsx), não do index.html", () => {
  it("vite.config.ts: VitePWA com registerType autoUpdate e injectRegister: null (null mantém o skipWaiting/clientsClaim do sw.js)", () => {
    const config = readFileSync(join(RAIZ, "vite.config.ts"), "utf8");
    const pwa = config.slice(config.indexOf("VitePWA({"));
    expect(pwa).toMatch(/registerType:\s*"autoUpdate"/);
    expect(pwa).toMatch(/injectRegister:\s*null\b/);
  });

  it("main.tsx chama o registrarServiceWorker() só fora do build do app (o APK e o AAB não levam o registro)", () => {
    const main = readFileSync(join(RAIZ, "src/main.tsx"), "utf8");
    expect(main).toMatch(/import \{ registrarServiceWorker \} from "@\/lib\/registroDoServiceWorker";/);
    expect(main).toMatch(/^if \(import\.meta\.env\.VITE_APP_NATIVO !== "1"\) void registrarServiceWorker\(\);$/m);
  });

  it("o import do registro fica atrás do VITE_APP_NATIVO (o Rollup corta no APK e no AAB, o padrão do Rotas.tsx)", () => {
    const fonte = readFileSync(join(RAIZ, "src/lib/registroDoServiceWorker.ts"), "utf8");
    expect(fonte).toMatch(/import\.meta\.env\.VITE_APP_NATIVO === "1" \? null : \(\) => import\("virtual:pwa-register"\)/);
  });
});
