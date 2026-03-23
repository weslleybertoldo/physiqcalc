import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const isNative = Capacitor.isNativePlatform();

// IDs fixos para as notificações do timer
const TIMER_ONGOING_ID = 1001;
const TIMER_FINISHED_ID = 1002;

/**
 * Pede permissão para enviar notificações (necessário no Android 13+)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) {
    // PWA — usa Notification API do browser
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
 * Mostra notificação persistente com a contagem regressiva
 */
export async function showTimerNotification(
  exercicioNome: string,
  segundosRestantes: number
): Promise<void> {
  if (!isNative) return;

  const mins = Math.floor(segundosRestantes / 60);
  const secs = segundosRestantes % 60;
  const tempo = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TIMER_ONGOING_ID,
          title: `⏱ Descanso — ${tempo}`,
          body: `${exercicioNome} — Restam ${tempo}`,
          ongoing: true, // Não pode ser deslizada para dispensar
          autoCancel: false,
          smallIcon: "ic_launcher",
          largeIcon: "ic_launcher",
        },
      ],
    });
  } catch {
    // Silencioso — pode falhar se permissão negada
  }
}

/**
 * Mostra notificação de timer finalizado (com som)
 */
export async function showTimerFinishedNotification(
  exercicioNome: string
): Promise<void> {
  if (!isNative) {
    // PWA — usa Notification API do browser
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

  try {
    // Remove a notificação de contagem
    await cancelTimerNotification();

    // Mostra notificação de finalizado
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TIMER_FINISHED_ID,
          title: "Hora de treinar! 💪",
          body: `Descanso concluído: ${exercicioNome}`,
          smallIcon: "ic_launcher",
          largeIcon: "ic_launcher",
          sound: "default",
        },
      ],
    });
  } catch {}
}

/**
 * Remove todas as notificações do timer
 */
export async function cancelTimerNotification(): Promise<void> {
  if (!isNative) return;

  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: TIMER_ONGOING_ID },
        { id: TIMER_FINISHED_ID },
      ],
    });
  } catch {}
}

/**
 * Agenda uma notificação para quando o timer acabar (funciona em background)
 */
export async function scheduleTimerEndNotification(
  exercicioNome: string,
  segundosRestantes: number
): Promise<void> {
  if (!isNative) return;

  try {
    // Cancela qualquer agendamento anterior
    await LocalNotifications.cancel({
      notifications: [{ id: TIMER_FINISHED_ID }],
    });

    // Agenda notificação para daqui a X segundos
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TIMER_FINISHED_ID,
          title: "Hora de treinar! 💪",
          body: `Descanso concluído: ${exercicioNome}`,
          smallIcon: "ic_launcher",
          largeIcon: "ic_launcher",
          sound: "default",
          schedule: {
            at: new Date(Date.now() + segundosRestantes * 1000),
            allowWhileIdle: true,
          },
        },
      ],
    });
  } catch {}
}
