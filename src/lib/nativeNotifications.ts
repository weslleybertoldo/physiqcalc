import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const isNative = Capacitor.isNativePlatform();

const TIMER_ONGOING_ID = 1001;
const TIMER_FINISHED_ID = 1002;

let fgInterval: ReturnType<typeof setInterval> | null = null;
let fgEndTime = 0;
let fgExercicioNome = "";
let FgServiceCache: any = null;

async function getForegroundService() {
  if (!isNative) return null;
  if (FgServiceCache) return FgServiceCache;
  try {
    const mod = await import("@capawesome-team/capacitor-android-foreground-service");
    FgServiceCache = mod.ForegroundService;
    return FgServiceCache;
  } catch (e) {
    console.warn("[Notifications] ForegroundService not available:", e);
    return null;
  }
}

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

  // Permissão de notificações locais
  const { display } = await LocalNotifications.requestPermissions();

  // Permissão do Foreground Service (Android 13+ precisa de POST_NOTIFICATIONS)
  const FgService = await getForegroundService();
  if (FgService) {
    try {
      await FgService.requestPermissions();
    } catch (e) {
      console.warn("[Notifications] FG permission request failed:", e);
    }
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

  const FgService = await getForegroundService();

  // Tenta Foreground Service primeiro
  if (FgService) {
    try {
      await FgService.startForegroundService({
        id: TIMER_ONGOING_ID,
        title: `⏱ Descanso — ${formatCountdown(segundosRestantes)}`,
        body: exercicioNome,
        smallIcon: "ic_launcher",
        silent: true,
      });

      // Atualiza a cada segundo
      fgInterval = setInterval(async () => {
        const remaining = Math.max(0, Math.round((fgEndTime - Date.now()) / 1000));

        if (remaining <= 0) {
          if (fgInterval) clearInterval(fgInterval);
          fgInterval = null;

          try { await FgService.stopForegroundService(); } catch (e) {
            console.warn("[Notifications] stop FG failed:", e);
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
            console.warn("[Notifications] schedule finished failed:", e);
          }
          return;
        }

        try {
          await FgService.updateForegroundService({
            id: TIMER_ONGOING_ID,
            title: `⏱ Descanso — ${formatCountdown(remaining)}`,
            body: fgExercicioNome,
            smallIcon: "ic_launcher",
            silent: true,
          });
        } catch (e) {
          console.warn("[Notifications] update FG failed:", e);
        }
      }, 1000);

      console.log("[Notifications] ForegroundService started OK");
    } catch (e) {
      console.warn("[Notifications] ForegroundService start failed, using fallback:", e);
      FgServiceCache = null; // Reset cache para tentar novamente depois
    }
  }

  // Sempre agenda notificação de backup para quando acabar o tempo
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
    console.warn("[Notifications] schedule backup failed:", e);
  }

  // Fallback: se ForegroundService falhou, mostra notificação estática
  if (!FgService || !fgInterval) {
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
          sound: "",
        }],
      });
      console.log("[Notifications] Fallback static notification shown");
    } catch (e) {
      console.warn("[Notifications] fallback notification failed:", e);
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
        console.warn("[Notifications] browser notification failed:", e);
      }
    }
    return;
  }

  const FgService = await getForegroundService();
  if (FgService) {
    try { await FgService.stopForegroundService(); } catch (e) {
      console.warn("[Notifications] stop FG on finish failed:", e);
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

  const FgService = await getForegroundService();
  if (FgService) {
    try { await FgService.stopForegroundService(); } catch (e) {
      console.warn("[Notifications] stop FG on cancel failed:", e);
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
    console.warn("[Notifications] cancel local notifications failed:", e);
  }
}
