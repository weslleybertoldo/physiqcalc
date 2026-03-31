import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import CountdownNotification from "./countdownNotification";

const isNative = Capacitor.isNativePlatform();
const TIMER_FINISHED_ID = 1002;
const ALERT_CHANNEL_ID = "timer-alerts-v1";
let channelCreated = false;

/**
 * Cria canal de notificação com som (IMPORTANCE_HIGH)
 */
async function ensureAlertChannel() {
  if (channelCreated || !isNative) return;
  try {
    await LocalNotifications.createChannel({
      id: ALERT_CHANNEL_ID,
      name: "Alertas de Timer",
      description: "Notificação com som quando o descanso termina",
      importance: 5,
      sound: "default",
      vibration: true,
      visibility: 1,
    });
    channelCreated = true;
  } catch (e) {
    console.warn("[Timer] create channel:", e);
  }
}

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
  await ensureAlertChannel();
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

  // Foreground Service: cronômetro nativo + alarme sonoro em background
  // O service cuida de tudo: notificação com cronômetro, som e vibração quando acaba
  try {
    await CountdownNotification.startCountdown({
      durationSeconds: segundosRestantes,
      title: "⏱ Descanso",
      body: exercicioNome,
    });
  } catch (e) {
    console.warn("[Timer] startCountdown:", e);
    // Fallback: agenda notificação com LocalNotifications
    await ensureAlertChannel();
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: TIMER_FINISHED_ID,
          title: "Hora de treinar! 💪",
          body: `Descanso concluído: ${exercicioNome}`,
          smallIcon: "ic_launcher",
          channelId: ALERT_CHANNEL_ID,
          sound: "default",
          schedule: {
            at: new Date(Date.now() + segundosRestantes * 1000),
            allowWhileIdle: true,
          },
        }],
      });
    } catch (e2) {
      console.warn("[Timer] schedule fallback:", e2);
    }
  }
}

/**
 * Chamada quando o timer termina no foreground
 * NÃO remove o cronômetro — ele continua contando em negativo
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
  // Cronômetro continua rodando (mostra tempo negativo = tempo excedido)
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
