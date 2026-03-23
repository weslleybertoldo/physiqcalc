import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const isNative = Capacitor.isNativePlatform();

// IDs
const TIMER_ONGOING_ID = 1001;
const TIMER_FINISHED_ID = 1002;

// Referência ao interval do foreground service
let fgInterval: ReturnType<typeof setInterval> | null = null;
let fgEndTime = 0;
let fgExercicioNome = "";

// Lazy import do ForegroundService (só existe no APK)
async function getForegroundService() {
  if (!isNative) return null;
  try {
    const mod = await import("@capawesome-team/capacitor-android-foreground-service");
    return mod.ForegroundService;
  } catch {
    return null;
  }
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  return display === "granted";
}

/**
 * Inicia o timer com Foreground Service (contagem regressiva real nas notificações)
 */
export async function startTimerNotifications(
  exercicioNome: string,
  segundosRestantes: number
): Promise<void> {
  if (!isNative) return;

  // Limpa timer anterior
  await cancelTimerNotification();

  const FgService = await getForegroundService();
  if (!FgService) return;

  fgEndTime = Date.now() + segundosRestantes * 1000;
  fgExercicioNome = exercicioNome;

  try {
    // Inicia o Foreground Service com a notificação
    await FgService.startForegroundService({
      id: TIMER_ONGOING_ID,
      title: `⏱ Descanso — ${formatCountdown(segundosRestantes)}`,
      body: `${exercicioNome}`,
      smallIcon: "ic_launcher",
    });

    // Atualiza a notificação a cada segundo (roda no Foreground Service, não é suspenso)
    fgInterval = setInterval(async () => {
      const remaining = Math.max(0, Math.round((fgEndTime - Date.now()) / 1000));

      if (remaining <= 0) {
        // Timer acabou!
        if (fgInterval) clearInterval(fgInterval);
        fgInterval = null;

        // Para o foreground service
        try {
          await FgService.stopForegroundService();
        } catch {}

        // Mostra notificação de fim com som
        await LocalNotifications.schedule({
          notifications: [
            {
              id: TIMER_FINISHED_ID,
              title: "Hora de treinar! 💪",
              body: `Descanso concluído: ${fgExercicioNome}`,
              smallIcon: "ic_launcher",
              sound: "default",
            },
          ],
        });
        return;
      }

      // Atualiza contagem regressiva
      try {
        await FgService.updateForegroundService({
          id: TIMER_ONGOING_ID,
          title: `⏱ Descanso — ${formatCountdown(remaining)}`,
          body: `${fgExercicioNome}`,
          smallIcon: "ic_launcher",
        });
      } catch {}
    }, 1000);

    // Também agenda notificação de backup via LocalNotifications (caso o FG service morra)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TIMER_FINISHED_ID,
          title: "Hora de treinar! 💪",
          body: `Descanso concluído: ${exercicioNome}`,
          smallIcon: "ic_launcher",
          sound: "default",
          schedule: {
            at: new Date(fgEndTime),
            allowWhileIdle: true,
          },
        },
      ],
    });
  } catch {}
}

/**
 * Notificação de timer finalizado (quando o app está em foreground)
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

  // Para o foreground service se ainda estiver rodando
  const FgService = await getForegroundService();
  if (FgService) {
    try { await FgService.stopForegroundService(); } catch {}
  }
}

/**
 * Remove todas as notificações e para o foreground service
 */
export async function cancelTimerNotification(): Promise<void> {
  // Limpa o interval
  if (fgInterval) {
    clearInterval(fgInterval);
    fgInterval = null;
  }

  if (!isNative) return;

  // Para o foreground service
  const FgService = await getForegroundService();
  if (FgService) {
    try { await FgService.stopForegroundService(); } catch {}
  }

  // Cancela notificações locais
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: TIMER_ONGOING_ID },
        { id: TIMER_FINISHED_ID },
      ],
    });
  } catch {}
}
