/**
 * Editor do treino do aluno (W15 — tela 8, lado esquerdo; spec 4.5 › Treino): o que a função admin-semana-treinos do Banco do
 * Treino devolve (ação `get`, com os campos novos da W15) e o modelo de tela montado a partir dela (regras.ts).
 */
import type { LinhaPrescricao } from "@/treino/prescricao";
import type { SeriePadraoRow } from "@/lib/seriesPadrao";

export type TipoTreino = "catalogo" | "pessoal";

/** Treino que o aluno recebe: do catálogo (o professor deu) ou pessoal (o aluno criou no app). */
export interface GrupoDisponivel {
  id: string;
  nome: string;
  tipo: TipoTreino;
  /** null = global do master (catálogo); ausente no pessoal */
  professor_id?: string | null;
  /** quantos alunos recebem este treino (catálogo) */
  alunos?: number;
  em_pasta?: boolean;
  /** a lista de exercícios muda direto (só deste aluno); false = vira cópia só dele antes */
  lista_direta?: boolean;
}

export interface ExercicioDoTreino {
  exercicio_id: string | null;
  exercicio_usuario_id: string | null;
  nome: string;
  ordem: number;
  grupo_muscular?: string | null;
  subgrupo?: string | null;
  imagem_url?: string | null;
  tipo?: string | null;
  padrao_movimento?: string | null;
  equipamento?: string | null;
}

export type LinhaSeriesAluno = SeriePadraoRow & LinhaPrescricao;

export interface ConfigTreinoAluno {
  series_padrao_qtd: number | null;
  series_modo: "padrao" | "personalizada" | string | null;
  series_travadas: boolean | null;
  tempo_descanso_segundos: number | null;
  /** NF7 — "Troca do treino · novo ciclo" (yyyy-mm-dd) */
  proxima_troca_treino: string | null;
  proxima_avaliacao?: string | null;
}

export interface LinhaSemana {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  extra?: boolean | number | null;
  extra_atrelado_grupo_id?: string | null;
  extra_atrelado_grupo_usuario_id?: string | null;
}

export interface ConfigDia {
  dia_semana: string;
  alternado: boolean | number | null;
  alternado_inicio: string | null;
}

export interface DadosEditor {
  semana: LinhaSemana[];
  gruposDisponiveis: GrupoDisponivel[];
  diasConfig: ConfigDia[];
  seriesPadrao: LinhaSeriesAluno[];
  exerciciosPorTreino: Record<string, ExercicioDoTreino[]>;
  config: ConfigTreinoAluno | null;
  /** o dono da conta sem papel de personal só lê (spec 4.1) */
  podeEditar: boolean;
  professorDoAluno: string | null;
}

/** Semana atual do aluno para o "N de M na semana" (ação semanaAtual). */
export interface SemanaAtual {
  overrides: { data_treino: string; slot_idx: number | null; grupo_id: string | null; grupo_usuario_id: string | null }[];
  concluidos: { data_treino: string; slot_idx: number | null }[];
}

// ───────────────────────── modelo de tela ─────────────────────────

export interface ExercicioEditor {
  /** "ex:<id>" (biblioteca) · "exu:<id>" (exercício próprio do aluno) */
  chave: string;
  exercicio_id: string | null;
  exercicio_usuario_id: string | null;
  nome: string;
  /** "Peito · peitoral médio (esternal)" */
  subtitulo: string;
  grupoMuscular: string;
  imagem_url: string | null;
  corrida: boolean;
  series: number;
  /** o nº de séries é deste exercício (senão é o geral do treino ou o padrão do aluno) */
  seriesProprias: boolean;
  reps: string | null;
  /** descanso prescrito (o do exercício ou o geral do treino); null = vale o padrão do aluno */
  descanso: number | null;
  carga: number | null;
}

export interface TreinoEditor {
  /** "catalogo:<id>" · "pessoal:<id>" (a chave do app — seriesPadrao.chaveTreino) */
  chave: string;
  id: string;
  tipo: TipoTreino;
  nome: string;
  letra: string | null;
  /** "A · Peito e tríceps" */
  rotulo: string;
  listaDireta: boolean;
  global: boolean;
  alunos: number;
  emPasta: boolean;
  exercicios: ExercicioEditor[];
  observacao: string | null;
  totalSeries: number;
  minutos: number | null;
}

/** Campos que o professor mexe num exercício (séries, repetições, descanso, carga — NF1). */
export interface PrescricaoEditavel {
  series: number;
  reps: string | null;
  descanso: number | null;
  carga: number | null;
}

/** Exercício da biblioteca (Adicionar exercício da biblioteca — 81 com GIF). */
export interface ExercicioBiblioteca {
  id: string;
  nome: string;
  grupo_muscular: string;
  subgrupo: string | null;
  imagem_url: string | null;
  tipo: string | null;
  professor_id: string | null;
  padrao_movimento: string | null;
  equipamento: string | null;
  variacao: string | null;
}

export interface ModeloTreino {
  id: string;
  nome: string;
  global: boolean;
  meu: boolean;
  exercicios: number;
  pastas: string[];
  ja_tem: boolean;
}
