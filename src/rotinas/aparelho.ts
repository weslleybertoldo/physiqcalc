// Physiq W-A P3 — os lembretes das rotinas NO APARELHO (o lado com efeito; o plano é o lembretes.ts, puro). APK: a notificação local do
// @capacitor/local-notifications 8.0.2 — o canal "rotinas-v1" PRIVADO (visibility 0: a tela bloqueada não mostra o conteúdo — revisão I6), o
// botão "Feito" (registerActionTypes antes de agendar), o plano reconciliado com o que já está agendado (getPending → cancelar/agendar só a
// diferença, uma reconciliação por vez) e o "Sair" que esvazia a faixa 40000–40299 (as pendentes e as que estão na bandeja). Site: o que já
// foi avisado nesta aba (sessionStorage) e a notificação do navegador SÓ se ela já estiver permitida (spec §4.6). Sem rede: quem lê as
// rotinas é o useRotinas (a função aluno-dia). Nunca o nome de uma rotina num log.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Rotina, RotinaFeita } from "@/aluno-dia/tipos";
import { PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { ACAO_FEITO, CANAL_ROTINAS, TIPO_DE_ACAO, diferenca, naFaixa, planoDosLembretes, type LembreteNoAparelho } from "./lembretes";
import { ROTULO_FEITO } from "./textos";

export const nativo = (): boolean => Capacitor.isNativePlatform();

let preparado = false;
let fila: Promise<unknown> = Promise.resolve();

/** Uma coisa por vez no plugin (a reconciliação do Início e a da página não se cruzam). */
function naFila<T>(fazer: () => Promise<T>): Promise<T> {
  const vez = fila.then(fazer, fazer);
  fila = vez.catch(() => undefined);
  return vez;
}

async function preparar(): Promise<void> {
  if (preparado) return;
  await LocalNotifications.createChannel({
    id: CANAL_ROTINAS, name: "Rotinas e lembretes", description: "Os lembretes das suas rotinas", importance: 4, visibility: 0, vibration: true,
  });
  await LocalNotifications.registerActionTypes({ types: [{ id: TIPO_DE_ACAO, actions: [{ id: ACAO_FEITO, title: ROTULO_FEITO }] }] });
  preparado = true;
}

function paraOPlugin(l: LembreteNoAparelho) {
  return {
    id: l.id, title: l.titulo, body: l.corpo, channelId: CANAL_ROTINAS, smallIcon: "ic_launcher", actionTypeId: TIPO_DE_ACAO,
    schedule: { at: l.at, allowWhileIdle: true }, extra: { ...l.extra },
  };
}

export interface Reconciliacao {
  motivo: "ok" | "site" | "sem_permissao" | "erro";
  agendados: number;
  cancelados: number;
  /** os do plano que já estavam agendados iguais */
  mantidos: number;
}

/** Replaneja os lembretes deste aparelho para `dono` (APK; no site não faz nada). Sem a permissão de notificação: só cancela. */
export function reconciliarLembretes(rotinas: readonly Rotina[], feitas: readonly RotinaFeita[], dono: string, agora: Date = new Date()): Promise<Reconciliacao> {
  if (!nativo()) return Promise.resolve({ motivo: "site", agendados: 0, cancelados: 0, mantidos: 0 });
  return naFila(async (): Promise<Reconciliacao> => {
    try {
      const { notifications } = await LocalNotifications.getPending();
      const plano = planoDosLembretes(rotinas, feitas, dono, agora);
      const { cancelar, agendar } = diferenca(notifications, plano, { rotinas, feitas, dono, agora });
      if (cancelar.length) await LocalNotifications.cancel({ notifications: cancelar.map((id) => ({ id })) });
      const mantidos = plano.length - agendar.length;
      if ((await LocalNotifications.checkPermissions()).display !== "granted") {
        return { motivo: "sem_permissao", agendados: 0, cancelados: cancelar.length, mantidos };
      }
      if (agendar.length) {
        await preparar();
        await LocalNotifications.schedule({ notifications: agendar.map(paraOPlugin) });
      }
      return { motivo: "ok", agendados: agendar.length, cancelados: cancelar.length, mantidos };
    } catch {
      return { motivo: "erro", agendados: 0, cancelados: 0, mantidos: 0 };
    }
  });
}

/** Esvazia a faixa das rotinas neste aparelho (as pendentes e as que estão na bandeja): o "Sair", a troca de conta e a exclusão. */
export function limparLembretesDoAparelho(): Promise<number> {
  if (!nativo()) return Promise.resolve(0);
  return naFila(async () => {
    try {
      const { notifications } = await LocalNotifications.getPending();
      const ids = notifications.map((n) => n.id).filter(naFaixa);
      if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      const naBandeja = (await LocalNotifications.getDeliveredNotifications()).notifications.filter((n) => naFaixa(n.id));
      if (naBandeja.length) await LocalNotifications.removeDeliveredNotifications({ notifications: naBandeja });
      return ids.length;
    } catch {
      return 0;
    }
  });
}

// ───────────────────────── permissões ─────────────────────────
export type PermissaoDosLembretes = "ligada" | "perguntar" | "bloqueada" | "sem_suporte";
const daPermissao = (estado: string): PermissaoDosLembretes => (estado === "granted" ? "ligada" : estado === "denied" ? "bloqueada" : "perguntar");

export async function permissaoDosLembretes(): Promise<PermissaoDosLembretes> {
  try {
    if (nativo()) return daPermissao((await LocalNotifications.checkPermissions()).display);
    if (typeof window !== "undefined" && "Notification" in window) return daPermissao(Notification.permission);
  } catch {
    /* sem suporte */
  }
  return "sem_suporte";
}

/** APK: pede a permissão (no 1º lembrete ligado — spec §5.4). O site não pede: o aviso do navegador só vale se já estiver permitido. */
export async function pedirPermissaoDosLembretes(): Promise<PermissaoDosLembretes> {
  if (nativo()) {
    try {
      return daPermissao((await LocalNotifications.requestPermissions()).display);
    } catch {
      /* cai na leitura */
    }
  }
  return permissaoDosLembretes();
}

export type AlarmeExato = "ligado" | "desligado" | "sem_suporte";

/** Android 12+: "Alarmes e lembretes" (SCHEDULE_EXACT_ALARM; no 14+ não vem dado — risco 1). Desligado = o lembrete pode atrasar. */
export async function alarmeExato(): Promise<AlarmeExato> {
  if (!nativo() || Capacitor.getPlatform() !== "android") return "sem_suporte";
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted" ? "ligado" : "desligado";
  } catch {
    return "sem_suporte";
  }
}

/** Abre o ajuste "Alarmes e lembretes" do Physiq (e devolve como ficou). */
export async function abrirAjusteDoAlarmeExato(): Promise<AlarmeExato> {
  if (!nativo() || Capacitor.getPlatform() !== "android") return "sem_suporte";
  try {
    return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === "granted" ? "ligado" : "desligado";
  } catch {
    return alarmeExato();
  }
}

// ───────────────────────── o login guardado e o site ─────────────────────────
/** O login guardado neste aparelho (o do principal), lido do armazenamento — sem chamar o Auth (a guarda do navegador da hml-21). */
export function loginGuardadoNoAparelho(): string | null {
  try {
    const bruto = localStorage.getItem(PRINCIPAL_STORAGE_KEY);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as { user?: { id?: unknown }; currentSession?: { user?: { id?: unknown } } };
    const id = s?.user?.id ?? s?.currentSession?.user?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const CHAVE_DO_SITE = "physiq_rotinas_avisadas";

export function lerAvisadasNoSite(): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_DO_SITE) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function gravarAvisadasNoSite(chaves: Iterable<string>): void {
  try {
    sessionStorage.setItem(CHAVE_DO_SITE, JSON.stringify([...chaves].slice(-100)));
  } catch {
    /* sem armazenamento: avisa de novo se a aba recarregar */
  }
}

/** A notificação do navegador, SÓ se já estiver permitida (o site não pede — spec §4.6). */
export function notificarNoNavegador(tag: string, titulo: string, corpo: string): boolean {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(titulo, { body: corpo, icon: "/icon-192.png", tag });
      return true;
    }
  } catch {
    /* sem suporte */
  }
  return false;
}

/** Só os testes: esquece o canal/ação já preparados e a fila. */
export function _zerarAparelho(): void {
  preparado = false;
  fila = Promise.resolve();
}
