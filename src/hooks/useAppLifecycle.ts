import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";

export function useAppLifecycle() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const stateListener = CapApp.addListener("appStateChange", async ({ isActive }) => {
      if (isActive) {
        // App voltou ao foreground — reativa auto-refresh do token
        supabase.auth.startAutoRefresh();
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
  }, []);
}
