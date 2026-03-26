import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";

export function useAppLifecycle(onResume?: () => void) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const stateListener = CapApp.addListener("appStateChange", async ({ isActive }) => {
      if (isActive) {
        // App voltou ao foreground
        supabase.auth.startAutoRefresh();

        // Valida sessão (pode ter expirado durante background)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            await supabase.auth.refreshSession();
          }
        } catch {
          // Offline — não faz nada
        }

        onResume?.();
      } else {
        // App foi para background — para auto-refresh para economizar bateria
        supabase.auth.stopAutoRefresh();
      }
    });

    // Back button handler (Android) — minimiza em vez de fechar
    const backListener = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (!canGoBack) {
        CapApp.minimizeApp();
      } else {
        window.history.back();
      }
    });

    return () => {
      stateListener.then((l) => l.remove());
      backListener.then((l) => l.remove());
    };
  }, [onResume]);
}
