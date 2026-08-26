import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import CountdownNotification from "./countdownNotification";

const isNative = Capacitor.isNativePlatform();
const TIMER_FINISHED_ID = 1002;
const ALERT_CHANNEL_ID = "timer-alerts-v1";
let channelCreated = false;

// "Ainda está treinando?" — marcos (em minutos) de treino em andamento que geram aviso
export const MARCOS_TREINO_LONGO_MIN = [90, 120, 180] as const;
const TREINO_LONGO_ID_BASE = 1100; // ids 1101/1102/1103 (um por marco)
const idMarco = (min: number) => TREINO_LONGO_ID_BASE + MARCOS_TREINO_LONGO_MIN.indexOf(min as 90 | 120 | 180) + 1;

export function formatMarcoTreinoLongo(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const textoAvisoTreinoLongo = (grupoNome: string, min: number) => ({
  title: "Ainda está treinando? ⏱️",
  body: `${grupoNome} · ${formatMarcoTreinoLongo(min)} em andamento. Se já terminou, conclua o treino.`,
});

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

/**
 * Treino iniciado: agenda no Android as notificações "Ainda está treinando?" para
 * 1h30, 2h e 3h a partir do início (disparam mesmo com o app fechado/em background).
 * Marcos já passados (ex.: reagendar após reload) não são agendados.
 */
export async function agendarAvisosTreinoLongo(startedAt: number, grupoNome: string): Promise<void> {
  if (!isNative) return;
  await cancelarAvisosTreinoLongo();
  await ensureAlertChannel();
  const agora = Date.now();
  const notifications = MARCOS_TREINO_LONGO_MIN
    .map((min) => ({ min, at: new Date(startedAt + min * 60_000) }))
    .filter(({ at }) => at.getTime() > agora)
    .map(({ min, at }) => ({
      id: idMarco(min),
      ...textoAvisoTreinoLongo(grupoNome, min),
      smallIcon: "ic_launcher",
      channelId: ALERT_CHANNEL_ID,
      sound: "default",
      schedule: { at, allowWhileIdle: true },
    }));
  if (notifications.length === 0) return;
  try {
    await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.warn("[TreinoLongo] schedule:", e);
  }
}

/** Treino concluído (ou reiniciado): cancela os avisos agendados */
export async function cancelarAvisosTreinoLongo(): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({
      notifications: MARCOS_TREINO_LONGO_MIN.map((min) => ({ id: idMarco(min) })),
    });
  } catch {}
}

/** Web/PWA: notificação do navegador ao cruzar um marco (no Android o agendamento nativo cuida) */
export function avisarTreinoLongoWeb(grupoNome: string, min: number): void {
  if (isNative) return;
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const { title, body } = textoAvisoTreinoLongo(grupoNome, min);
      new Notification(`PhysiqCalc — ${title}`, { body, icon: "/icon-192.png", tag: `treino-longo-${min}` });
    } catch {}
  }
}
