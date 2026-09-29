import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { principal } from "@/integrations/principal/client";

/**
 * Login com Google no BANCO PRINCIPAL (Physiq W3 — login único, spec 7.4). O cliente do principal usa PKCE: a volta do
 * Google traz `?code=` e só ele (que guardou o code_verifier no aparelho) troca pela sessão.
 * - Site/PWA: redireciona para o Google e volta em /entrar (o cliente troca o código sozinho ao abrir).
 * - APK: abre o Google no Chrome (@capacitor/browser) e volta pelo deep link com.bertoldo.physiqcalc://login-callback
 *   (o mesmo de hoje, spec 4.2); o app troca o `?code=` pela sessão.
 * A sessão do Banco do Treino vem depois, pela troca de token (src/nucleo/trocaToken.ts).
 */
const isNative = Capacitor.isNativePlatform();
const REDIRECT_SCHEME = "com.bertoldo.physiqcalc";
export const REDIRECT_URL_APK = `${REDIRECT_SCHEME}://login-callback`;

/** Endereço de volta do Google no site (precisa estar nas Redirect URLs do Auth do principal). */
export function voltaDoGoogleNoSite(origem: string = window.location.origin): string {
  return `${origem}/entrar`;
}

// o mesmo retorno pode chegar 2 vezes (listener do login + listener global): o código só vale 1 vez
const retornosProcessados = new Set<string>();

/** Trata o deep link de volta do login no APK: `?code=` (PKCE) ou `#access_token=` (fluxo implícito antigo). */
export async function processarRetornoDoLogin(url: string): Promise<{ error?: string }> {
  if (!url.startsWith(REDIRECT_SCHEME)) return { error: "url_desconhecida" };
  const [, depoisDoEsquema = ""] = url.split("://");
  const query = depoisDoEsquema.includes("?") ? depoisDoEsquema.split("?")[1].split("#")[0] : "";
  const hash = depoisDoEsquema.includes("#") ? depoisDoEsquema.split("#")[1] : "";
  const pq = new URLSearchParams(query);
  const ph = new URLSearchParams(hash);
  const erro = pq.get("error_description") || pq.get("error") || ph.get("error_description") || ph.get("error");
  if (erro) return { error: erro };
  const code = pq.get("code");
  if (code) {
    if (retornosProcessados.has(code)) return {};
    retornosProcessados.add(code);
    const { error } = await principal.auth.exchangeCodeForSession(code);
    return error ? { error: error.message } : {};
  }
  const accessToken = ph.get("access_token") || pq.get("access_token");
  const refreshToken = ph.get("refresh_token") || pq.get("refresh_token");
  if (accessToken && refreshToken) {
    if (retornosProcessados.has(accessToken)) return {};
    retornosProcessados.add(accessToken);
    const { error } = await principal.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    return error ? { error: error.message } : {};
  }
  return { error: "Resposta de login inválida" };
}

/**
 * Inicia o login com Google.
 * - No APK: abre browser externo, captura o redirect via deep link
 * - No PWA: usa o fluxo normal de redirect do Supabase
 */
export async function signInWithGoogle(): Promise<{ error?: string }> {
  if (!isNative) {
    const { error } = await principal.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: voltaDoGoogleNoSite() },
    });
    return error ? { error: error.message } : {};
  }

  try {
    // 1. URL do OAuth sem redirecionar (o code_verifier fica guardado no aparelho)
    const { data, error } = await principal.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_URL_APK, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { error: error?.message || "Erro ao iniciar login" };

    // 2. escuta o deep link ANTES de abrir o browser
    let handle: ReturnType<typeof App.addListener> | null = null;
    const resultado = new Promise<{ error?: string }>((resolve) => {
      const timeout = setTimeout(() => resolve({ error: "Login cancelado ou expirado" }), 120000);
      handle = App.addListener("appUrlOpen", async (event: { url: string }) => {
        if (!event.url.startsWith(REDIRECT_SCHEME)) return;
        clearTimeout(timeout);
        const r = await processarRetornoDoLogin(event.url);
        try {
          await Browser.close();
        } catch {
          /* o Chrome já fechou */
        }
        resolve(r);
      });
    });

    // 3. abre o Google no Chrome e espera a volta
    await Browser.open({ url: data.url, windowName: "_self" });
    const r = await resultado;
    try {
      if (handle) (await handle).remove();
    } catch {
      /* listener já removido ou app fechando */
    }
    return r;
  } catch {
    return { error: "Erro ao abrir login do Google" };
  }
}

/** Listener global de deep links (APK): pega a volta do login mesmo quando o app foi reaberto pelo link. */
let deepLinkListenerRegistered = false;

export function setupDeepLinkListener() {
  if (!isNative || deepLinkListenerRegistered) return;
  deepLinkListenerRegistered = true;
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(REDIRECT_SCHEME) || !/[?#&](code|access_token)=/.test(url)) return;
    await processarRetornoDoLogin(url);
    try {
      await Browser.close();
    } catch {
      /* noop */
    }
  });
}
