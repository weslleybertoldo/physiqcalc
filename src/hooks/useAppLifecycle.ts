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

    // O voltar do Android (hml-29, B22: a pergunta de sair na página inicial) mora no VoltarDoAndroid (src/ui/casca), dentro do
    // roteador

    return () => {
      stateListener.then((l) => l.remove());
    };
  }, []);
}
