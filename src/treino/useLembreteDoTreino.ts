import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { LEMBRETE_NOTIF_ID, LEMBRETE_TEXTO, LEMBRETE_TITULO, lerLembrete } from "@/app-aluno/perfil/pecas/lembrete";

/** Texto do lembrete com o treino de hoje (como a TreinosPage fazia); sem treino hoje, o texto genérico do Perfil. */
export function textoDoLembrete(nomeTreinoHoje: string | null, rotuloHoje: string): string {
  return nomeTreinoHoje ? `Treino de hoje: ${nomeTreinoHoje} (${rotuloHoje})` : LEMBRETE_TEXTO;
}

/**
 * Lembrete de treino (C22) com o NOME do treino de hoje — as MESMAS chaves do Perfil (W7): a hora e o liga/desliga ficam em
 * `physiq_workout_reminder`; no APK a notificação diária é a 2001 "Physiq — Hora do treino!". Abrir a aba Treino reagenda
 * com o nome do treino (o Perfil reagenda com o texto genérico); ao sair da aba o agendamento FICA (a TreinosPage cancelava).
 * No site, com a aba aberta, confere a hora a cada minuto e mostra a notificação do navegador (igual a hoje).
 */
export function useLembreteDoTreino(nomeTreinoHoje: string | null, rotuloHoje: string, ativo: boolean): void {
  const texto = textoDoLembrete(nomeTreinoHoje, rotuloHoje);

  useEffect(() => {
    if (!ativo) return;
    const l = lerLembrete();
    if (!l.enabled) return;
    if (Capacitor.isNativePlatform()) {
      let cancelado = false;
      (async () => {
        try {
          await LocalNotifications.cancel({ notifications: [{ id: LEMBRETE_NOTIF_ID }] });
          if (cancelado) return;
          const agora = new Date();
          const alvo = new Date();
          alvo.setHours(l.hour, l.minute, 0, 0);
          if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
          await LocalNotifications.schedule({
            notifications: [{
              id: LEMBRETE_NOTIF_ID,
              title: LEMBRETE_TITULO,
              body: texto,
              smallIcon: "ic_launcher",
              sound: "default",
              schedule: { at: alvo, every: "day", allowWhileIdle: true },
            }],
          });
        } catch (e) {
          console.warn("[Lembrete] agendar com o treino de hoje:", e);
        }
      })();
      return () => {
        cancelado = true;
      };
    }
    // site: enquanto a aba está aberta
    const id = setInterval(() => {
      const agora = new Date();
      const atual = lerLembrete();
      if (!atual.enabled || agora.getHours() !== atual.hour || agora.getMinutes() !== atual.minute) return;
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(LEMBRETE_TITULO, { body: texto, icon: "/icon-192.png", tag: "lembrete-treino" });
        } catch {
          /* sem suporte */
        }
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [ativo, texto]);
}
