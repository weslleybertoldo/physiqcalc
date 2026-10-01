/**
 * Physiq W20c — o push no APK (Android): permissão, canal "Avisos", token do aparelho no banco principal e os eventos do FCM.
 * No site (web) nada disto roda. Sem o Firebase no APK (o google-services.json não entrou no build) também não: chamar o
 * register() sem o Firebase derruba o app — por isso o PushFirebase.disponivel() (plugin nativo do próprio app) vem antes.
 * Sem permissão ou sem Firebase, o app segue como antes: sino, e-mail e a notificação local.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type Token } from "@capacitor/push-notifications";
import { principal } from "@/integrations/principal/client";
import { CANAL_AVISOS, NOME_CANAL_AVISOS, esquecerTokenGuardado, guardarToken, tokenGuardado, tokenValido, type Permissao } from "./regras";

interface PushFirebasePlugin {
  disponivel(): Promise<{ disponivel: boolean }>;
}
const PushFirebase = registerPlugin<PushFirebasePlugin>("PushFirebase");

const versaoDoApp = (): string | null => (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null);

let disponivel: Promise<boolean> | null = null;

/** O push funciona neste aparelho? Só no APK Android com o Firebase no build. */
export function pushDisponivel(): Promise<boolean> {
  if (!disponivel) {
    disponivel = (async () => {
      if (Capacitor.getPlatform() !== "android") return false;
      if (!Capacitor.isPluginAvailable("PushNotifications") || !Capacitor.isPluginAvailable("PushFirebase")) return false;
      try {
        return (await PushFirebase.disponivel()).disponivel === true;
      } catch {
        return false;
      }
    })();
  }
  return disponivel;
}

export async function permissaoAtual(): Promise<Permissao> {
  try {
    return (await PushNotifications.checkPermissions()).receive as Permissao;
  } catch {
    return "denied";
  }
}

/** O pedido do Android (13+; no 12 ou menos já vem "granted"). */
export async function pedirPermissao(): Promise<Permissao> {
  try {
    return (await PushNotifications.requestPermissions()).receive as Permissao;
  } catch {
    return "denied";
  }
}

let canalCriado = false;

/** Cria o canal "Avisos" (importância alta) e pede o token ao FCM — ele chega pelo evento "registration". */
export async function registrar(): Promise<void> {
  if (!(await pushDisponivel())) return;
  if (!canalCriado) {
    await PushNotifications.createChannel({
      id: CANAL_AVISOS,
      name: NOME_CANAL_AVISOS,
      description: "Consultas, treino, dieta, avaliações e pagamentos",
      importance: 4,
      visibility: 1,
      vibration: true,
    }).catch(() => undefined);
    canalCriado = true;
  }
  await PushNotifications.register();
}

/** Grava o token deste aparelho no banco principal (quem está no app passa a ser o dono dele). */
export async function salvarToken(uid: string, token: string): Promise<boolean> {
  if (!uid || !tokenValido(token)) return false;
  try {
    const { data, error } = await principal.rpc("push_registrar" as never, { p_token: token, p_plataforma: "android", p_versao: versaoDoApp() } as never);
    if (error || (data as { ok?: boolean } | null)?.ok !== true) return false;
    guardarToken(uid, token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ao sair da conta: o aparelho deixa de receber os avisos desta pessoa — apaga o token no banco (antes do signOut: a função
 * precisa do login) e no FCM. No máximo 3 s (sem internet, sair não espera).
 */
export async function esquecerAparelhoPush(): Promise<void> {
  const guardado = tokenGuardado();
  esquecerTokenGuardado();
  if (!guardado) return;
  const tarefas: Promise<unknown>[] = [
    Promise.resolve(principal.rpc("push_esquecer" as never, { p_token: guardado.token } as never)).then(() => undefined, () => undefined),
  ];
  if (await pushDisponivel()) tarefas.push(PushNotifications.unregister().catch(() => undefined));
  await Promise.race([Promise.all(tarefas), new Promise((r) => setTimeout(r, 3000))]);
}

export interface OuvintesPush {
  aoToken: (token: string) => void;
  aoReceber: (n: PushNotificationSchema) => void;
  aoTocar: (a: ActionPerformed) => void;
}

let ouvintes: OuvintesPush | null = null;
let ligados = false;

/**
 * Liga os ouvintes do FCM uma vez por abertura (o toque com o app FECHADO fica guardado pelo Android até o 1º ouvinte); a
 * casca troca os handlers a cada montagem.
 */
export async function ouvir(h: OuvintesPush): Promise<void> {
  ouvintes = h;
  if (ligados || !(await pushDisponivel())) return;
  ligados = true;
  try {
    await PushNotifications.addListener("registration", (t: Token) => ouvintes?.aoToken(t.value));
    await PushNotifications.addListener("registrationError", () => undefined);
    await PushNotifications.addListener("pushNotificationReceived", (n) => ouvintes?.aoReceber(n));
    await PushNotifications.addListener("pushNotificationActionPerformed", (a) => ouvintes?.aoTocar(a));
  } catch {
    /* sem o plugin: segue sem push */
  }
}

/** Só para os testes. */
export function _zerarParaTestes(): void {
  disponivel = null;
  canalCriado = false;
  ouvintes = null;
  ligados = false;
}
