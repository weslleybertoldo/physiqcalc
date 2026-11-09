/** As contas da roleta do tempo (src/treino/ui/RoletaTempo.tsx), à parte para o componente ficar só com componentes. */

/** Altura de cada número da roleta (px): a coluna mostra 5 e o do meio é o escolhido. */
export const ALTURA_ITEM = 44;

export interface PartesDoTempo {
  h: number;
  m: number;
  s: number;
}

/** Segundos → horas, minutos e segundos (sem horas, os minutos passam de 59: a Prancha vai a 10 min). */
export function partesDoTempo(segundos: number | null | undefined, comHoras: boolean): PartesDoTempo {
  const t = Math.max(0, Math.round(segundos ?? 0));
  if (!comHoras) return { h: 0, m: Math.floor(t / 60), s: t % 60 };
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

export function segundosDasPartes(p: PartesDoTempo): number {
  return p.h * 3600 + p.m * 60 + p.s;
}

/** O número que fica no meio da coluna para uma posição de rolagem (encaixa no mais perto, dentro de 0…max). */
export function itemNaPosicao(scrollTop: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(scrollTop / ALTURA_ITEM)));
}
