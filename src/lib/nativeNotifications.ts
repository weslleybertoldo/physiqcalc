import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const isNative = Capacitor.isNativePlatform();

// IDs fixos para as notificações do timer
const TIMER_ONGOING_ID = 1001;
const TIMER_FINISHED_ID = 1002;

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

/**
 * Pede permissão para enviar notificações (necessário no Android 13+)
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
 * Inicia o timer de descanso com notificações nativas:
 * 1. Mostra notificação persistente com horário de término
 * 2. Agenda notificação com som para quando o tempo acabar
 */
export async function startTimerNotifications(
  exercicioNome: string,
  segundosRestantes: number
): Promise<void> {
  if (!isNative) return;

  const endTime = new Date(Date.now() + segundosRestantes * 1000);
  const endTimeStr = formatTime(endTime);
  const mins = Math.floor(segundosRestantes / 60);
  const secs = segundosRestantes % 60;
  const duracao = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  try {
    // Cancela notificações anteriores
    await cancelTimerNotification();

    // 1. Notificação persistente mostrando quando termina (não depende de JS em background)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TIMER_ONGOING_ID,
          title: `⏱ Descanso — ${duracao}`,
          body: `${exercicioNome} — Termina às ${endTimeStr}`,
          ongoing: true,
          autoCancel: false,
          smallIcon: "ic_launcher",
          largeIcon: "ic_launcher",
          sound: "",
        },
      ],
    });

    // 2. Agenda notificação de FIM com som (executada pelo Android, não pelo JS)
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
            at: endTime,
            allowWhileIdle: true,
          },
        },
      ],
    });
  } catch {
    // Silencioso
  }
}

/**
 * Mostra notificação de timer finalizado (chamada quando o app está em foreground)
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
    // Remove a notificação ongoing
    await LocalNotifications.cancel({
      notifications: [{ id: TIMER_ONGOING_ID }],
    });
    // A notificação agendada (TIMER_FINISHED_ID) já deve ter disparado,
    // mas se o app está em foreground, garantimos que aparece
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
