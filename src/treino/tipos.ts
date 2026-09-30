/** Tipos da aba Treino (W8) — os mesmos formatos que a TreinosPage antiga montava a partir do SQLite do PowerSync. */

export interface GrupoTreino {
  id: string;
  nome: string;
}

export interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  tipo?: string | null;
  imagem_url?: string | null;
  subgrupo?: string | null;
  dica?: string | null;
}

/** Troca em vigor (do dia ou definitiva) — o item mostrado substitui `id`. */
export interface InfoSubstituicao {
  id: string;
  nome: string;
  escopo: "dia" | "definitiva";
  trocadoEm: string | null;
}

export interface GrupoExercicio {
  exercicio_id: string;
  /** preenchido quando é exercício pessoal do aluno */
  exercicio_usuario_id?: string;
  ordem: number;
  tb_exercicios: Exercicio;
  substituindo?: InfoSubstituicao;
}

export interface SemanaConfig {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  extra: number | null;
  extra_atrelado_grupo_id: string | null;
  extra_atrelado_grupo_usuario_id: string | null;
  tb_grupos_treino: GrupoTreino | null;
}

export interface OverrideInfo {
  id: string;
  slot_idx: number;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
}

export interface ItemRemovidoDia {
  exercicio_id: string;
  nome: string;
  escopo: "dia" | "definitiva";
}

/** Um treino do dia (o dia pode ter mais de um: slot 0, 1…). */
export interface DiaSlot {
  slot_idx: number;
  override_id?: string;
  grupo: GrupoTreino | null;
  /** grupo pessoal do aluno (não é do profissional) */
  grupoPessoal?: boolean;
  exercicios: GrupoExercicio[];
  /** exercícios do grupo removidos nesta data (para "Restaurar") */
  removidos?: ItemRemovidoDia[];
  overrideVazio: boolean;
  source: "override" | "semana" | "placeholder";
}

export interface SerieComMemoria {
  id?: string;
  exercicio_id: string;
  exercicio_usuario_id?: string;
  slot_idx?: number;
  numero_serie: number;
  peso: number;
  reps: number;
  concluida?: boolean;
  salva: boolean;
  tempo_segundos?: number;
  distancia_km?: number;
  pace_segundos_km?: number;
  academia_nome?: string | null;
}

export interface Academia {
  id: string;
  nome: string;
}
