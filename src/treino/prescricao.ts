/**
 * NF1 — prescrição opcional do profissional (colunas da W2 em `tb_series_padrao_usuario`): repetições-alvo, descanso por
 * exercício e carga sugerida. A aba Treino (W8) MOSTRA; quem edita é a W15 (e os treinos prontos da W7b já gravam
 * reps e descanso). Vazio = como hoje: peso e repetições vêm do histórico e o descanso é o padrão do aluno.
 *
 * Linha do exercício da tela 2: "4 × 10 · 60 s · 60 kg" (séries × repetições · descanso · carga).
 */
import { chaveExercicio, chaveSeries, chaveTreino } from "@/lib/seriesPadrao";

export interface LinhaPrescricao {
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  exercicio_id?: string | null;
  exercicio_usuario_id?: string | null;
  reps_alvo?: string | null;
  descanso_segundos?: number | string | null;
  carga_sugerida_kg?: number | string | null;
  observacao?: string | null;
}

export interface Prescricao {
  /** "10" ou "8-12" */
  reps: string | null;
  descanso: number | null;
  carga: number | null;
}

export interface PrescricaoTreino {
  /** NF2: observação do treino para o aluno (linha geral, sem exercício) */
  observacao: string | null;
}

const VAZIA: Prescricao = { reps: null, descanso: null, carga: null };

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return v === null || v === undefined ? null : String(v);
  const t = v.trim();
  return t ? t : null;
}

function daLinha(l: LinhaPrescricao): Prescricao {
  return { reps: texto(l.reps_alvo), descanso: numero(l.descanso_segundos), carga: numero(l.carga_sugerida_kg) };
}

/** Linhas → mapa (treino | treino + exercício) → prescrição (só as que têm algum campo). */
export function mapaPrescricao(linhas: LinhaPrescricao[] | null | undefined): Map<string, Prescricao & PrescricaoTreino> {
  const mapa = new Map<string, Prescricao & PrescricaoTreino>();
  for (const l of linhas || []) {
    const treino = chaveTreino(l.grupo_id, l.grupo_usuario_id);
    if (!treino) continue;
    const p = daLinha(l);
    const obs = texto(l.observacao);
    if (!p.reps && !p.descanso && !p.carga && !obs) continue;
    mapa.set(chaveSeries(treino, chaveExercicio(l.exercicio_id, l.exercicio_usuario_id)), { ...p, observacao: obs });
  }
  return mapa;
}

/** Prescrição de um exercício: a linha dele > a linha geral do treino > nada (campo a campo). */
export function prescricaoDoExercicio(
  mapa: Map<string, Prescricao & PrescricaoTreino>,
  treino: string | null | undefined,
  exercicioId?: string | null,
  exercicioUsuarioId?: string | null,
): Prescricao {
  if (!treino) return VAZIA;
  const geral = mapa.get(treino);
  const ex = chaveExercicio(exercicioId, exercicioUsuarioId);
  const propria = ex ? mapa.get(chaveSeries(treino, ex)) : undefined;
  return {
    reps: propria?.reps ?? geral?.reps ?? null,
    descanso: propria?.descanso ?? geral?.descanso ?? null,
    carga: propria?.carga ?? geral?.carga ?? null,
  };
}

/** Observação do treino para o aluno (NF2). */
export function observacaoDoTreino(mapa: Map<string, Prescricao & PrescricaoTreino>, treino: string | null | undefined): string | null {
  return treino ? mapa.get(treino)?.observacao ?? null : null;
}

/** Repetições para uma série nova sem histórico: o 1º número de "8-12" (ou 10, como hoje). */
export function repsIniciais(reps: string | null | undefined): number {
  const m = /\d+/.exec(reps ?? "");
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 10;
}

/** "60 s" · "90 s" · "2 min" · "2 min 30 s" */
export function formatarDescanso(segundos: number | null | undefined): string | null {
  if (!segundos || segundos <= 0) return null;
  const s = Math.round(segundos);
  if (s < 120) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** "60 kg" · "22,5 kg" */
export function formatarCarga(kg: number | null | undefined): string | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg) || kg <= 0) return null;
  const arred = Math.round(kg * 10) / 10;
  return `${String(arred).replace(".", ",")} kg`;
}

export interface SerieParaLinha {
  peso?: number | null;
  reps?: number | null;
  tempo_segundos?: number | null;
  distancia_km?: number | null;
  concluida?: boolean;
}

/** Repetições que aparecem na linha: a prescrição; senão as da 1ª série do dia (histórico); senão nada. */
export function repsDaLinha(p: Prescricao, series: SerieParaLinha[]): string | null {
  if (p.reps) return p.reps;
  const comReps = series.map((s) => Number(s.reps) || 0).filter((r) => r > 0);
  if (comReps.length === 0) return null;
  const min = Math.min(...comReps);
  const max = Math.max(...comReps);
  return min === max ? String(min) : `${min}-${max}`;
}

/** Carga da linha: a prescrita; senão a maior das séries do dia (o peso de trabalho). */
export function cargaDaLinha(p: Prescricao, series: SerieParaLinha[]): number | null {
  if (p.carga) return p.carga;
  const pesos = series.map((s) => Number(s.peso) || 0).filter((x) => x > 0);
  return pesos.length ? Math.max(...pesos) : null;
}

/**
 * Linha do exercício ("4 × 10 · 60 s"): séries × repetições · descanso. A carga vai à parte (no fim da linha quando o
 * exercício está feito — "4 × 10 · 60 s · 60 kg" — e no chip da direita enquanto não está, como na tela 2).
 * Corrida: "3 séries · 2 min".
 */
export function linhaDoExercicio(opts: {
  prescricao: Prescricao;
  series: SerieParaLinha[];
  descansoPadrao: number | null;
  corrida?: boolean;
}): string {
  const n = opts.series.length;
  const descanso = formatarDescanso(opts.prescricao.descanso ?? opts.descansoPadrao);
  if (opts.corrida) {
    return [n ? `${n} ${n === 1 ? "série" : "séries"}` : null, descanso].filter(Boolean).join(" · ");
  }
  const reps = repsDaLinha(opts.prescricao, opts.series);
  const partes = [n ? (reps ? `${n} × ${reps}` : `${n} ${n === 1 ? "série" : "séries"}`) : null, descanso];
  return partes.filter(Boolean).join(" · ");
}
