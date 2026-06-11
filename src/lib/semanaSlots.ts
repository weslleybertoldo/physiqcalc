export interface SemanaConfigLike {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
}

/** Todos os treinos recorrentes de um dia da semana, ordenados por slot_idx. */
export function selectSemanaConfigsForDia<T extends SemanaConfigLike>(
  semanaConfig: T[],
  diaSemana: string,
): T[] {
  return semanaConfig
    .filter((s) => s.dia_semana === diaSemana)
    .sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0));
}
