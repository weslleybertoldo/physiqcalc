import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";

const isNative = Capacitor.isNativePlatform();
const REDIRECT_SCHEME = "com.bertoldo.physiqcalc";
const REDIRECT_URL = `${REDIRECT_SCHEME}://login-callback`;

/**
 * Inicia o login com Google.
 * - No APK: abre browser externo, captura o redirect via deep link
 * - No PWA: usa o fluxo normal de redirect do Supabase
 */
export async function signInWithGoogle(): Promise<{ error?: string }> {
  if (!isNative) {
    // PWA — fluxo normal
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    return {};
  }

  // APK — fluxo com deep link
  try {
    // 1. Pega a URL do OAuth sem redirecionar automaticamente
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      return { error: error?.message || "Erro ao iniciar login" };
    }

    // 2. Configura listener para capturar o deep link ANTES de abrir o browser
    const sessionPromise = new Promise<{ error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ error: "Login cancelado ou expirado" });
      }, 120000); // 2 min timeout

      const handleUrl = async (event: { url: string }) => {
        if (!event.url.startsWith(REDIRECT_SCHEME)) return;

        clearTimeout(timeout);

        try {
          // Extrai os tokens da URL de callback
          // URL format: com.bertoldo.physiqcalc://login-callback#access_token=...&refresh_token=...
          const url = event.url;
          const hashPart = url.includes("#") ? url.split("#")[1] : url.split("?")[1];

          if (!hashPart) {
            resolve({ error: "Resposta de login inválida" });
            return;
          }

          const params = new URLSearchParams(hashPart);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              resolve({ error: sessionError.message });
            } else {
              // Força buscar user completo (com user_metadata, avatar_url, etc)
              const { data: { user } } = await supabase.auth.getUser();

              // Salva foto e nome do Google no perfil
              if (user) {
                const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
                const fullName = user.user_metadata?.full_name || user.user_metadata?.name;
                if (avatarUrl) {
                  await supabase
                    .from("physiq_profiles")
                    .update({
                      foto_url: avatarUrl,
                      ...(fullName ? { nome: fullName } : {}),
                    })
                    .eq("id", user.id);
                }
              }

              resolve({});
            }
          } else {
            // Pode ter retornado com error
            const errorDesc = params.get("error_description") || params.get("error");
            resolve({ error: errorDesc || "Tokens não recebidos" });
          }
        } catch (e) {
          resolve({ error: "Erro ao processar login" });
        }

        // Fecha o browser
        try {
          await Browser.close();
        } catch {}
      };

      // Escuta o deep link
      App.addListener("appUrlOpen", handleUrl);

      // Limpa o listener após resolução
      sessionPromise.then(() => {
        App.removeAllListeners();
      });
    });

    // 3. Abre o browser com a URL do OAuth
    await Browser.open({ url: data.url, windowName: "_self" });

    // 4. Espera o resultado
    return await sessionPromise;
  } catch (e) {
    return { error: "Erro ao abrir login do Google" };
  }
}

/**
 * Inicializa listener de deep links para o app (deve ser chamado uma vez no boot)
 */
export function setupDeepLinkListener() {
  if (!isNative) return;

  App.addListener("appUrlOpen", async ({ url }) => {
    // Se receber um deep link com tokens (ex: após OAuth), processa
    if (url.startsWith(REDIRECT_SCHEME) && url.includes("access_token")) {
      const hashPart = url.includes("#") ? url.split("#")[1] : url.split("?")[1];
      if (!hashPart) return;

      const params = new URLSearchParams(hashPart);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        try {
          await Browser.close();
        } catch {}
      }
    }
  });
}
