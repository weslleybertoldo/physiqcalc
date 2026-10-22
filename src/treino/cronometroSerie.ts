/**
 * O cronômetro da série por tempo (Prancha e Prancha Lateral) guardado no aparelho: vale também se a linha sair da tela (o
 * exercício fechado, outra aba, o app recarregado) — o início fica salvo, como o descanso, e o tempo é sempre o relógio real desde
 * o início, nunca um contador que perde passos em segundo plano. Um cronômetro de série por vez.
 */
export const LS_CRONOMETRO_SERIE = "physiq_cronometro_serie";

export interface CronometroSalvo {
  chave: string;
  inicio: number;
  meta: number | null;
}

export function chaveDaSerie(exercicioId: string, slotIdx: number | undefined, numero: number): string {
  return `${exercicioId}|${slotIdx ?? 0}|${numero}`;
}

/** Cronômetro esquecido (a série foi concluída por outro caminho, o app ficou fechado): passou disto, não retoma. */
const VALIDADE_MS = 15 * 60_000;

export function lerCronometroSerie(agora = Date.now()): CronometroSalvo | null {
  try {
    const raw = localStorage.getItem(LS_CRONOMETRO_SERIE);
    const c = raw ? (JSON.parse(raw) as CronometroSalvo) : null;
    if (!c || typeof c.inicio !== "number" || agora - c.inicio > VALIDADE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export function salvarCronometroSerie(c: CronometroSalvo | null): void {
  try {
    if (c) localStorage.setItem(LS_CRONOMETRO_SERIE, JSON.stringify(c));
    else localStorage.removeItem(LS_CRONOMETRO_SERIE);
  } catch {
    /* sem armazenamento: o cronômetro vale só enquanto a linha estiver na tela */
  }
}
