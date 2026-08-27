/**
 * Séries "do treino" = séries de exercícios que AINDA estão na lista do dia.
 *
 * Trocar ou remover um exercício no meio do treino tira ele da lista, mas as séries
 * padrão dele (criadas em memória, nunca salvas) continuavam no estado como órfãs —
 * sempre `concluida: false`. Efeitos: o cronômetro nunca perguntava "Treino foi
 * concluído?" e a conclusão gravava peso 0 na academia pro exercício que saiu.
 */

export interface SerieComExercicio {
  exercicio_id: string;
  exercicio_usuario_id?: string | null;
  slot_idx?: number | null;
}

export interface ExercicioDoDia {
  exercicio_id: string;
  exercicio_usuario_id?: string | null;
  slot_idx: number;
}

const chave = (exId: string, slotIdx: number | null | undefined) => `${exId}|${slotIdx ?? 0}`;

/** Conjunto "exercício|slot" dos exercícios que estão no treino do dia (catálogo e pessoal). */
export function chavesExerciciosAtivos(exercicios: ExercicioDoDia[]): Set<string> {
  const out = new Set<string>();
  for (const ex of exercicios) {
    out.add(chave(ex.exercicio_id, ex.slot_idx));
    if (ex.exercicio_usuario_id) out.add(chave(ex.exercicio_usuario_id, ex.slot_idx));
  }
  return out;
}

/** A série pertence a um exercício que continua no treino? */
export function serieDeExercicioAtivo(serie: SerieComExercicio, ativos: Set<string>): boolean {
  return (
    ativos.has(chave(serie.exercicio_id, serie.slot_idx)) ||
    (!!serie.exercicio_usuario_id && ativos.has(chave(serie.exercicio_usuario_id, serie.slot_idx)))
  );
}

/**
 * Só as séries de exercícios presentes no mapa do treino (WorkoutTimer recebe as séries
 * do slot e o mapa id → exercício do mesmo slot).
 */
export function seriesDoTreino<T extends { exercicio_id: string }>(
  series: T[],
  exerciciosMap: Record<string, unknown>,
): T[] {
  return series.filter((s) => Object.prototype.hasOwnProperty.call(exerciciosMap, s.exercicio_id));
}
