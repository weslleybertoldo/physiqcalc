import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { ForegroundService } from "@capawesome-team/capacitor-android-foreground-service";

const isNative = Capacitor.isNativePlatform();

const TIMER_ONGOING_ID = 1001;
const TIMER_FINISHED_ID = 1002;

let fgInterval: ReturnType<typeof setInterval> | null = null;
let fgEndTime = 0;
let fgExercicioNome = "";
let fgAvailable = true;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Pede todas as permissões necessárias para notificações
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

  try {
    await ForegroundService.requestPermissions();
  } catch (e) {
    console.warn("[Notifications] FG permission failed:", e);
    fgAvailable = false;
  }

  return display === "granted";
}

/**
 * Inicia o timer com Foreground Service + fallback para LocalNotifications
 */
export async function startTimerNotifications(
  exercicioNome: string,
  segundosRestantes: number
): Promise<void> {
  if (!isNative) return;

  await cancelTimerNotification();

  fgEndTime = Date.now() + segundosRestantes * 1000;
  fgExercicioNome = exercicioNome;

  // Tenta Foreground Service
  if (fgAvailable) {
    try {
      await ForegroundService.startForegroundService({
        id: TIMER_ONGOING_ID,
        title: `⏱ Descanso — ${formatCountdown(segundosRestantes)}`,
        body: exercicioNome,
        smallIcon: "ic_launcher",
        silent: true,
      });

      fgInterval = setInterval(async () => {
        const remaining = Math.max(0, Math.round((fgEndTime - Date.now()) / 1000));

        if (remaining <= 0) {
          if (fgInterval) clearInterval(fgInterval);
          fgInterval = null;

          try { await ForegroundService.stopForegroundService(); } catch (e) {
            console.warn("[Timer] stop FG:", e);
          }

          try {
            await LocalNotifications.schedule({
              notifications: [{
                id: TIMER_FINISHED_ID,
                title: "Hora de treinar! 💪",
                body: `Descanso concluído: ${fgExercicioNome}`,
                smallIcon: "ic_launcher",
                sound: "default",
              }],
            });
          } catch (e) {
            console.warn("[Timer] schedule end notif:", e);
          }
          return;
        }

        try {
          await ForegroundService.updateForegroundService({
            id: TIMER_ONGOING_ID,
            title: `⏱ Descanso — ${formatCountdown(remaining)}`,
            body: fgExercicioNome,
            smallIcon: "ic_launcher",
            silent: true,
          });
        } catch (e) {
          console.warn("[Timer] update FG:", e);
        }
      }, 1000);

      console.log("[Timer] ForegroundService started");
    } catch (e) {
      console.warn("[Timer] FG start failed:", e);
      fgAvailable = false;
    }
  }

  // Sempre agenda notificação de fim (backup)
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: TIMER_FINISHED_ID,
        title: "Hora de treinar! 💪",
        body: `Descanso concluído: ${exercicioNome}`,
        smallIcon: "ic_launcher",
        sound: "default",
        schedule: {
          at: new Date(fgEndTime),
          allowWhileIdle: true,
        },
      }],
    });
  } catch (e) {
    console.warn("[Timer] schedule backup:", e);
  }

  // Fallback se FG não funcionou: notificação estática
  if (!fgAvailable || !fgInterval) {
    const endTime = new Date(fgEndTime);
    const endStr = `${String(endTime.getHours()).padStart(2, "0")}:${String(endTime.getMinutes()).padStart(2, "0")}`;
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: TIMER_ONGOING_ID,
          title: `⏱ Descanso — ${formatCountdown(segundosRestantes)}`,
          body: `${exercicioNome} — Termina às ${endStr}`,
          smallIcon: "ic_launcher",
          ongoing: true,
          autoCancel: false,
        }],
      });
    } catch (e) {
      console.warn("[Timer] fallback notif:", e);
    }
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
      } catch (e) {
        console.warn("[Timer] browser notif:", e);
      }
    }
    return;
  }

  if (fgAvailable) {
    try { await ForegroundService.stopForegroundService(); } catch (e) {
      console.warn("[Timer] stop FG on finish:", e);
    }
  }
}

/**
 * Remove todas as notificações e para o foreground service
 */
export async function cancelTimerNotification(): Promise<void> {
  if (fgInterval) {
    clearInterval(fgInterval);
    fgInterval = null;
  }

  if (!isNative) return;

  if (fgAvailable) {
    try { await ForegroundService.stopForegroundService(); } catch (e) {
      console.warn("[Timer] stop FG on cancel:", e);
    }
  }

  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: TIMER_ONGOING_ID },
        { id: TIMER_FINISHED_ID },
      ],
    });
  } catch (e) {
    console.warn("[Timer] cancel notifs:", e);
  }
}
