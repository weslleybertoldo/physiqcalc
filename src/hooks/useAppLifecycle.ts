import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { syncPendingOperations, getPendingCount } from "@/lib/offlineSync";

export function useAppLifecycle(onResume?: () => void) {
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    // Web: sincroniza ao voltar do background via visibilitychange
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        if (getPendingCount() > 0) {
          syncPendingOperations();
        }
        onResumeRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    if (!Capacitor.isNativePlatform()) {
      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }

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

        // Sincroniza dados pendentes ao voltar do background
        if (navigator.onLine && getPendingCount() > 0) {
          syncPendingOperations();
        }

        onResumeRef.current?.();
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
      document.removeEventListener("visibilitychange", handleVisibility);
      stateListener.then((l) => l.remove());
      backListener.then((l) => l.remove());
    };
  }, []);
}
