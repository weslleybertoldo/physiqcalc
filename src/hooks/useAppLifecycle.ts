import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { fecharDialogAberto } from "@/lib/dialogAberto";
import { voltarPedeSaida } from "@/lib/voltarDoAndroid";
import { useConfirmar } from "@/ui/premium/useConfirmar";

export function useAppLifecycle() {
  // hml-29 (B22): a pergunta de sair é a confirmação do próprio app (o AlertDialog do ProvedorConfirmar, em volta das rotas)
  const confirmar = useConfirmar();

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

    // Back button handler (Android) — modal, folha ou menu aberto fecha primeiro (inclusive a própria pergunta de sair); na
    // página inicial ou sem histórico, pergunta "Deseja sair do Physiq?" (hml-29, B22: Sim fecha o app; Não fica na tela sem
    // perder nada); nas outras telas, volta na rota
    let perguntando = false;
    const backListener = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (fecharDialogAberto()) return;
      if (!voltarPedeSaida(window.location.pathname, canGoBack)) {
        window.history.back();
        return;
      }
      // o voltar repetido antes de a janela abrir não empilha uma 2ª pergunta
      if (perguntando) return;
      perguntando = true;
      confirmar({ titulo: "Deseja sair do Physiq?", rotuloConfirmar: "Sim", rotuloCancelar: "Não" })
        .then((sim) => {
          if (sim) void CapApp.exitApp();
        })
        // sem a confirmação (o provedor fica no App; não deveria acontecer), o voltar faz o que fazia antes: minimiza
        .catch(() => void CapApp.minimizeApp())
        .finally(() => {
          perguntando = false;
        });
    });

    return () => {
      stateListener.then((l) => l.remove());
      backListener.then((l) => l.remove());
    };
  }, [confirmar]);
}
