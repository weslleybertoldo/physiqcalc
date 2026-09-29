/**
 * Lembrete de treino (C22 — Perfil › Lembrete de treino). MESMA chave, formato e notificação de hoje (WorkoutReminder da
 * TreinosPage antiga, que continua lendo daqui até a W8): localStorage "physiq_workout_reminder" = { hour, minute, enabled };
 * no APK, a notificação diária id 2001 "Physiq — Hora do treino!" (LocalNotifications); no site, a TreinosPage confere a hora
 * a cada minuto enquanto está aberta (igual a hoje).
 *
 * O que muda: ao ligar ou mudar a hora aqui no Perfil, o APK já agenda a notificação (antes só a TreinosPage agendava — e
 * cancelava ao sair dela). Quando a TreinosPage abre, ela reagenda com o nome do treino do dia, como sempre.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { LembreteTreino } from "./regras";

export const LEMBRETE_CHAVE = "physiq_workout_reminder";
export const LEMBRETE_NOTIF_ID = 2001;
export const LEMBRETE_TITULO = "Physiq — Hora do treino!";
export const LEMBRETE_TEXTO = "Hora do seu treino de hoje.";
/** O padrão da TreinosPage quando nada foi guardado (7:00, desligado). */
export const LEMBRETE_PADRAO: LembreteTreino = { hour: 7, minute: 0, enabled: false };

const nativo = () => Capacitor.isNativePlatform();

export function lerLembrete(): LembreteTreino {
  try {
    const v = localStorage.getItem(LEMBRETE_CHAVE);
    if (!v) return { ...LEMBRETE_PADRAO };
    const l = JSON.parse(v) as Partial<LembreteTreino>;
    const hour = Number.isInteger(l.hour) && (l.hour as number) >= 0 && (l.hour as number) <= 23 ? (l.hour as number) : LEMBRETE_PADRAO.hour;
    const minute = Number.isInteger(l.minute) && (l.minute as number) >= 0 && (l.minute as number) <= 59 ? (l.minute as number) : LEMBRETE_PADRAO.minute;
    return { hour, minute, enabled: l.enabled === true };
  } catch {
    return { ...LEMBRETE_PADRAO };
  }
}

export function gravarLembrete(l: LembreteTreino): void {
  try {
    localStorage.setItem(LEMBRETE_CHAVE, JSON.stringify({ hour: l.hour, minute: l.minute, enabled: l.enabled }));
  } catch {
    /* sem armazenamento (modo privado): vale só nesta abertura */
  }
}

/** Pede a permissão de notificação (APK: LocalNotifications; site: Notification). */
export async function pedirPermissaoLembrete(): Promise<boolean> {
  try {
    if (nativo()) {
      const { display } = await LocalNotifications.requestPermissions();
      return display === "granted";
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      return (await Notification.requestPermission()) === "granted";
    }
  } catch {
    /* sem suporte */
  }
  return false;
}

/** A permissão já foi negada (mostra o aviso "Notificações bloqueadas"). */
export async function permissaoNegada(): Promise<boolean> {
  try {
    if (nativo()) {
      const { display } = await LocalNotifications.checkPermissions();
      return display === "denied";
    }
    if (typeof window !== "undefined" && "Notification" in window) return Notification.permission === "denied";
  } catch {
    /* sem suporte */
  }
  return false;
}

/** APK: agenda (ou reagenda) a notificação diária na hora escolhida; desligado = cancela. No site não faz nada. */
export async function aplicarLembreteNoAparelho(l: LembreteTreino): Promise<void> {
  if (!nativo()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: LEMBRETE_NOTIF_ID }] });
    if (!l.enabled) return;
    const agora = new Date();
    const alvo = new Date();
    alvo.setHours(l.hour, l.minute, 0, 0);
    if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
    await LocalNotifications.schedule({
      notifications: [{
        id: LEMBRETE_NOTIF_ID,
        title: LEMBRETE_TITULO,
        body: LEMBRETE_TEXTO,
        smallIcon: "ic_launcher",
        sound: "default",
        schedule: { at: alvo, every: "day", allowWhileIdle: true },
      }],
    });
  } catch (e) {
    console.warn("[Lembrete] agendar:", e);
  }
}
