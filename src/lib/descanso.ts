/**
 * Timer de descanso: o tempo restante é SEMPRE derivado do instante de início
 * (`startedAt` + `duracao`) — nunca de um contador local que decrementa a cada tick.
 *
 * Em background o WebView congela/estrangula o `setInterval`: um contador local
 * perde ticks e, ao voltar, mostra mais tempo do que realmente falta (o toque da
 * notificação nativa dispara na hora certa, mas a tela "continua contando").
 * Derivando do timestamp, qualquer tick — inclusive o primeiro ao voltar — corrige
 * a tela na hora.
 */

export interface EstadoDescanso {
  startedAt: number;
  duracao: number;
  isPaused: boolean;
  pausedRemaining: number;
}

/** Segundos restantes do descanso em `agora` (ms). Pausado = valor congelado ao pausar. */
export function restanteDescanso(state: EstadoDescanso, agora: number = Date.now()): number {
  if (state.isPaused) return Math.max(0, state.pausedRemaining);
  const decorrido = Math.floor((agora - state.startedAt) / 1000);
  return Math.max(0, state.duracao - decorrido);
}

/** `startedAt` que faz o descanso ter exatamente `restante` segundos em `agora` (ajustes -15s, editar tempo, despausar). */
export function startedAtPara(duracao: number, restante: number, agora: number = Date.now()): number {
  return agora - (duracao - restante) * 1000;
}
