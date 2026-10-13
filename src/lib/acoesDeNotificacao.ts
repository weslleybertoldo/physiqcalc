// Physiq W-A P3 — o OUVINTE ÚNICO do toque nas notificações locais (o `localNotificationActionPerformed` do @capacitor/local-notifications).
// Por quê: com o app FECHADO, o toque (ou o "Feito") abre o app e o plugin guarda o evento até alguém ouvir — e o Capacitor o entrega só
// ao 1º ouvinte que se registrar (Plugin.java: sendRetainedArgumentsForEvent, "only when the first listener for an event is added"). Com 2
// ouvintes próprios (a consulta nova da Agenda e as rotinas), quem montasse primeiro engolia o toque do outro. Aqui há 1 ouvinte nativo só;
// cada interessado diz se a ação é dele (devolve true) e a que ninguém quis fica guardada 2 min para quem montar depois (os avisos globais
// carregam sob demanda, em qualquer ordem). No site não há ouvinte nativo (só o registro de quem ouve).
import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type ActionPerformed } from "@capacitor/local-notifications";

/** Quem ouve: devolve true quando a ação é dele (o hub não a entrega a mais ninguém). */
export type OuvinteDeAcao = (e: ActionPerformed) => boolean;

export const GUARDA_DA_ACAO_MS = 2 * 60_000;
const MAX_GUARDADAS = 10;

const ouvintes = new Set<OuvinteDeAcao>();
let guardadas: { e: ActionPerformed; em: number }[] = [];
let registrado = false;

function quer(o: OuvinteDeAcao, e: ActionPerformed): boolean {
  try {
    return o(e) === true;
  } catch {
    return false;
  }
}

function chegou(e: ActionPerformed): void {
  for (const o of [...ouvintes]) if (quer(o, e)) return;
  const agora = Date.now();
  guardadas = [...guardadas.filter((g) => agora - g.em <= GUARDA_DA_ACAO_MS), { e, em: agora }].slice(-MAX_GUARDADAS);
}

/** Passa a ouvir as ações das notificações locais (as guardadas dos últimos 2 min chegam na hora). Devolve o "parar de ouvir". */
export function ouvirAcoesDeNotificacao(o: OuvinteDeAcao): () => void {
  if (!registrado && Capacitor.isNativePlatform()) {
    registrado = true;
    void LocalNotifications.addListener("localNotificationActionPerformed", chegou);
  }
  ouvintes.add(o);
  const agora = Date.now();
  guardadas = guardadas.filter((g) => agora - g.em <= GUARDA_DA_ACAO_MS && !quer(o, g.e));
  return () => {
    ouvintes.delete(o);
  };
}

/** Só os testes: volta ao começo (sem ouvintes, sem guardadas, sem o ouvinte nativo). */
export function _zerarAcoesDeNotificacao(): void {
  ouvintes.clear();
  guardadas = [];
  registrado = false;
}
