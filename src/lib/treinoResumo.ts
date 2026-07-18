// Modelo comum de "treino concluído" usado pelo histórico e pela imagem de
// compartilhamento. Constrói a partir de uma linha de `treino_historico`
// (formato novo do exercicios_concluidos, retrocompatível com o antigo).

export interface SerieResumo {
  numero_serie: number;
  peso: number;
  reps: number;
}

export interface ExercicioResumo {
  exercicio_id: string;
  nome: string;
  series_concluidas: number;
  series: SerieResumo[];
  volume: number; // Σ(peso × reps) do exercício
  mediaPesoRep: number | null; // Σ(peso×reps) / Σ(reps) do exercício
}

export interface TreinoResumo {
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  academia_nome: string | null;
  exercicios: ExercicioResumo[];
  volumeTotal: number; // Σ volumes
  totalReps: number;
  mediaPesoRep: number | null; // Σ(peso×reps) geral / Σ(reps) geral
}

/** Linha crua de exercicios_concluidos (após parse). Campos novos são opcionais
 *  para conviver com registros antigos que só tinham nome/series_concluidas. */
interface ExercicioCru {
  exercicio_id?: string;
  nome?: string;
  series_concluidas?: number;
  academia_nome?: string | null;
  volume?: number;
  series?: Array<{ numero_serie?: number; peso?: number; reps?: number }>;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function construirResumoExercicios(exerciciosCrus: ExercicioCru[]): {
  exercicios: ExercicioResumo[];
  academia_nome: string | null;
  volumeTotal: number;
  totalReps: number;
  mediaPesoRep: number | null;
} {
  let academia_nome: string | null = null;
  let volumeTotal = 0;
  let totalReps = 0;
  let totalPesoXReps = 0;

  const exercicios: ExercicioResumo[] = exerciciosCrus.map((ex) => {
    if (!academia_nome && ex.academia_nome) academia_nome = ex.academia_nome;

    const series: SerieResumo[] = Array.isArray(ex.series)
      ? ex.series.map((s, i) => ({
          numero_serie: num(s?.numero_serie) || i + 1,
          peso: num(s?.peso),
          reps: num(s?.reps),
        }))
      : [];

    let volEx = 0;
    let repsEx = 0;
    let pesoXRepsEx = 0;
    series.forEach((s) => {
      volEx += s.peso * s.reps;
      repsEx += s.reps;
      pesoXRepsEx += s.peso * s.reps;
    });
    // Se não há detalhamento de séries (registro antigo), usa volume salvo se houver.
    if (series.length === 0 && ex.volume) volEx = num(ex.volume);

    volumeTotal += volEx;
    totalReps += repsEx;
    totalPesoXReps += pesoXRepsEx;

    return {
      exercicio_id: ex.exercicio_id || "",
      nome: ex.nome || "Exercício",
      series_concluidas: num(ex.series_concluidas) || series.length,
      series,
      volume: volEx,
      mediaPesoRep: repsEx > 0 ? pesoXRepsEx / repsEx : null,
    };
  });

  return {
    exercicios,
    academia_nome,
    volumeTotal,
    totalReps,
    mediaPesoRep: totalReps > 0 ? totalPesoXReps / totalReps : null,
  };
}

export interface HistoricoRow {
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: ExercicioCru[] | null;
}

export function buildTreinoResumo(row: HistoricoRow): TreinoResumo {
  const crus = Array.isArray(row.exercicios_concluidos) ? row.exercicios_concluidos : [];
  const { exercicios, academia_nome, volumeTotal, totalReps, mediaPesoRep } =
    construirResumoExercicios(crus);
  return {
    nome_treino: row.nome_treino,
    iniciado_em: row.iniciado_em,
    concluido_em: row.concluido_em,
    duracao_segundos: row.duracao_segundos,
    academia_nome,
    exercicios,
    volumeTotal,
    totalReps,
    mediaPesoRep,
  };
}

export function formatDuracao(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}
