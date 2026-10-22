/**
 * Série por TEMPO (decisão do Weslley, 21/10/2026): a Prancha e a Prancha Lateral são isometria — a carga é o tempo segurando —,
 * então a série delas registra só o tempo (`tb_treino_series.tempo_segundos`; peso e repetições ficam nulos). O cronômetro da
 * série conta pra BAIXO a partir da meta do profissional (as "repetições" da prescrição, em segundos) e apita no fim; sem meta,
 * conta pra CIMA (iniciar → segurar → parar). O aluno corrige o tempo na mão.
 *
 * Só as 2 pranchas, pelos ids: o movimento `prancha` também pega o Escalador, que é dinâmico e continua por repetições.
 */
export const PRANCHA_ID = "217d3ff2-62d0-5df4-90f8-600677209cf2";
export const PRANCHA_LATERAL_ID = "88f946d5-46f3-5c84-8fdc-f114d9ed805a";
export const EXERCICIOS_POR_TEMPO: ReadonlySet<string> = new Set([PRANCHA_ID, PRANCHA_LATERAL_ID]);

/** A série deste exercício é por tempo? (o id do catálogo global) */
export function ehPorTempo(exercicioId: string | null | undefined): boolean {
  return !!exercicioId && EXERCICIOS_POR_TEMPO.has(exercicioId);
}

/** Maior tempo aceito numa série ou meta (10 min). */
export const TEMPO_MAX_SEGUNDOS = 600;

/**
 * Segundos de um texto: "30", "30 s", "30s", "45 seg", "45 segundos", "1:30", "1 min", "1 min 30", "1 min 30 s"; numa faixa
 * ("30-45") vale o 1º número. Vazio, zero, acima de 10 min ou fora desses formatos → null.
 */
export function lerSegundos(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").trim().toLowerCase().replace(",", ".");
  if (!t) return null;
  let seg: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(t))) seg = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d{1,3})\s*(?:s|seg|segs|segundos?)?(?:\s*(?:-|–|a|até)\s*\d{1,3}\s*(?:s|seg|segs|segundos?)?)?$/.exec(t))) seg = Number(m[1]);
  else if ((m = /^(\d{1,2})\s*(?:m|min|minutos?)(?:\s*(\d{1,2})\s*(?:s|seg|segundos?)?)?$/.exec(t))) seg = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  if (seg === null || !Number.isFinite(seg) || seg < 1 || seg > TEMPO_MAX_SEGUNDOS) return null;
  return seg;
}

/** A meta da série em segundos: as "repetições" da prescrição do profissional lidas como segundos (vazio = sem meta). */
export function metaSegundos(repsAlvo: string | null | undefined): number | null {
  return lerSegundos(repsAlvo);
}

/** "30 s" · "90 s" · "2 min" · "2 min 30 s" (o mesmo texto do descanso, `formatarDescanso`); sem tempo → "—". */
export function formatarSegundos(segundos: number | null | undefined): string {
  if (!segundos || segundos <= 0) return "—";
  const s = Math.round(segundos);
  if (s < 120) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** O relógio da série: "00:30" (minutos:segundos). */
export function relogio(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** O que o cronômetro da série mostra e grava num instante `agora` (ms), a partir do início (relógio real, como o descanso). */
export function estadoDoCronometro(o: { inicio: number; meta: number | null; agora?: number }): {
  /** o número da tela: o que falta (com meta) ou o que passou (sem meta) */
  mostrado: number;
  /** o tempo segurado até agora (é o que a série grava) */
  segurado: number;
  /** a meta acabou (com meta) */
  acabou: boolean;
} {
  const decorrido = Math.max(0, Math.floor(((o.agora ?? Date.now()) - o.inicio) / 1000));
  if (o.meta && o.meta > 0) {
    const segurado = Math.min(decorrido, o.meta);
    return { mostrado: o.meta - segurado, segurado, acabou: decorrido >= o.meta };
  }
  const segurado = Math.min(decorrido, TEMPO_MAX_SEGUNDOS);
  return { mostrado: segurado, segurado, acabou: false };
}

/** A série resumida (histórico, relatório, imagem do treino): "45 s" na série por tempo; "60 kg × 10" na de peso. */
export function textoDaSerie(s: { peso?: number | null; reps?: number | null; tempo_segundos?: number | null }): string {
  if (s.tempo_segundos && s.tempo_segundos > 0) return formatarSegundos(s.tempo_segundos);
  return `${String(Number(s.peso ?? 0)).replace(".", ",")} kg × ${Number(s.reps ?? 0)}`;
}
