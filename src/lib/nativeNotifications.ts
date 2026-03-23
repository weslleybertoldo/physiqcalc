import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import CountdownNotification from "./countdownNotification";

const isNative = Capacitor.isNativePlatform();
const TIMER_FINISHED_ID = 1002;

/**
 * Pede permissão para notificações
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) {
    if ("Notification" in window && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      return result === "granted";
    }
    return Notification.permission === "granted";
  }

  const { display } = await LocalNotifications.requestPermissions();
  return display === "granted";
}

/**
 * Inicia o timer de descanso:
 * - Cronômetro nativo do Android (atualiza a cada 1s sem JS)
 * - Notificação agendada para quando o tempo acabar (com som)
 */
export async function startTimerNotifications(
  exercicioNome: string,
  segundosRestantes: number
): Promise<void> {
  if (!isNative) return;

  await cancelTimerNotification();

  // 1. Cronômetro nativo — atualiza sozinho a cada segundo, sem JS
  try {
    await CountdownNotification.startCountdown({
      durationSeconds: segundosRestantes,
      title: "⏱ Descanso",
      body: exercicioNome,
    });
  } catch (e) {
    console.warn("[Timer] startCountdown:", e);
  }

  // 2. Agenda notificação de FIM com som
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: TIMER_FINISHED_ID,
        title: "Hora de treinar! 💪",
        body: `Descanso concluído: ${exercicioNome}`,
        smallIcon: "ic_launcher",
        sound: "default",
        schedule: {
          at: new Date(Date.now() + segundosRestantes * 1000),
          allowWhileIdle: true,
        },
      }],
    });
  } catch (e) {
    console.warn("[Timer] schedule end:", e);
  }
}

/**
 * Chamada quando o timer termina no foreground
 */
export async function showTimerFinishedNotification(
  exercicioNome: string
): Promise<void> {
  if (!isNative) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("PhysiqCalc — Hora de treinar! 💪", {
          body: `Descanso concluído: ${exercicioNome}`,
          icon: "/icon-192.png",
          tag: "descanso-concluido",
        });
      } catch {}
    }
    return;
  }

  // Remove o cronômetro
  try {
    await CountdownNotification.stopCountdown();
  } catch {}
}

/**
 * Remove todas as notificações do timer
 */
export async function cancelTimerNotification(): Promise<void> {
  if (!isNative) return;

  try {
    await CountdownNotification.stopCountdown();
  } catch {}

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: TIMER_FINISHED_ID }],
    });
  } catch {}
}
