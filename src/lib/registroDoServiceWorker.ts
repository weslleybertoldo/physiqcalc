// Physiq T4 (27/10/2026) — o service worker do SITE, registrado pelo próprio app (main.tsx).
// Antes, o vite-plugin-pwa punha no index.html o registerSW.js, que chamava navigator.serviceWorker.register("/sw.js") SEM catch: o
// robô do Google que recusa o service worker (a Google Play abrindo /privacidade e /excluir-conta) virava "promessa sem catch ·
// Rejected" no grupo, e no app nativo o WebView recusava o sw.js de https://localhost/. Agora (vite.config.ts: injectRegister: null):
//   - site (navegador): o registro do vite-plugin-pwa (virtual:pwa-register → workbox-window), no mesmo momento de antes (o load da
//     página), com onRegisterError (fica no console, sem aviso: recusar o service worker não é erro do app) e sem recarregar a página
//     quando um service worker novo assume (igual ao registerSW.js de antes, que não recarregava). O sw.js e o precache são os mesmos.
//   - app nativo (Capacitor: o APK do site e a versão da loja): NÃO registra — os arquivos já são locais. No build do app
//     (VITE_APP_NATIVO=1) o Rollup corta o registro inteiro do bundle (a mesma condição do Rotas.tsx); o Capacitor.isNativePlatform()
//     cobre o build feito à mão (npm run build + npx cap sync).
// Testes: src/lib/registroDoServiceWorker.test.ts (inclusive a cadeia de verdade do plugin + workbox-window com o registro recusado).
import { Capacitor } from "@capacitor/core";
import type { RegisterSWOptions } from "virtual:pwa-register";

type ModuloDoRegistro = { registerSW: (opcoes?: RegisterSWOptions) => unknown };

export interface DepsDoRegistro {
  /** Carrega o registro do vite-plugin-pwa. null no build do app (o import nem entra no bundle). */
  carregar: (() => Promise<ModuloDoRegistro>) | null;
  /** Roda dentro do Capacitor? */
  nativo: () => boolean;
  /** O navegador tem service worker? */
  temServiceWorker: () => boolean;
  /** Para onde vai o registro que falhou (o console, em nível debug). */
  avisarNoConsole: (texto: string) => void;
}

export type ResultadoDoRegistro = "pedido" | "app_nativo" | "sem_suporte" | "falhou";

const DO_APP: DepsDoRegistro = {
  carregar: import.meta.env.VITE_APP_NATIVO === "1" ? null : () => import("virtual:pwa-register"),
  nativo: () => Capacitor.isNativePlatform(),
  temServiceWorker: () => typeof navigator !== "undefined" && "serviceWorker" in navigator,
  avisarNoConsole: (texto) => console.debug("[SW]", texto),
};

/** O texto curto do erro para o console (sem pilha). */
function textoCurto(e: unknown): string {
  try {
    const t = e instanceof Error ? `${e.name}: ${e.message}` : String((e as { message?: unknown })?.message ?? e);
    return t.slice(0, 160);
  } catch {
    return "?";
  }
}

function ehNativo(deps: DepsDoRegistro): boolean {
  try {
    return deps.nativo();
  } catch {
    return false; // sem a ponte do Capacitor: navegador
  }
}

/**
 * Pede o registro do service worker (só no site). Nunca lança e nunca deixa promessa solta: o registro recusado (o robô, o modo
 * privado) e o pedaço que não carregou ficam no console. Devolve o que fez — para o teste.
 */
export async function registrarServiceWorker(deps: DepsDoRegistro = DO_APP): Promise<ResultadoDoRegistro> {
  if (!deps.carregar || ehNativo(deps)) return "app_nativo";
  try {
    if (!deps.temServiceWorker()) return "sem_suporte";
    const { registerSW } = await deps.carregar();
    registerSW({
      // o registerSW.js de antes não recarregava a página quando o service worker novo assumia: fica igual
      onNeedReload: () => undefined,
      onRegisterError: (e: unknown) => deps.avisarNoConsole(`registro recusado: ${textoCurto(e)}`),
    });
    return "pedido";
  } catch (e) {
    deps.avisarNoConsole(`registro não carregou: ${textoCurto(e)}`);
    return "falhou";
  }
}
