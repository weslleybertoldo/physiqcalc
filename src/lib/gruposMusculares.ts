/**
 * Taxonomia de grupos musculares.
 *
 * O campo `grupo_muscular` dos exercícios é texto livre e usa "/" para
 * primário/secundário (ex. "Dorsal / Rombóide", "Quadríceps / Glúteo").
 * Aqui derivamos o músculo PRIMÁRIO (trecho antes da "/") e o mapeamos
 * para um bloco canônico, usado na navegação em 2 níveis do modal de grupo.
 */

export interface BlocoMuscular {
  key: string;
  nome: string;
  emoji: string;
  /** Grupo da lista GRUPOS_MUSCULARES sugerido ao criar exercício dentro do bloco */
  grupoPadrao: string;
}

export const BLOCOS_MUSCULARES: BlocoMuscular[] = [
  { key: "peito", nome: "Peito", emoji: "🫁", grupoPadrao: "Peitoral" },
  { key: "costas", nome: "Costas", emoji: "🔙", grupoPadrao: "Dorsal" },
  { key: "ombro", nome: "Ombro", emoji: "🎯", grupoPadrao: "Deltóide" },
  { key: "biceps", nome: "Bíceps", emoji: "💪", grupoPadrao: "Bíceps" },
  { key: "triceps", nome: "Tríceps", emoji: "💪", grupoPadrao: "Tríceps" },
  { key: "quadriceps", nome: "Quadríceps", emoji: "🦵", grupoPadrao: "Quadríceps" },
  { key: "posterior", nome: "Posterior de coxa", emoji: "🦵", grupoPadrao: "Isquiotibiais" },
  { key: "gluteo", nome: "Glúteo", emoji: "🍑", grupoPadrao: "Glúteo" },
  { key: "panturrilha", nome: "Panturrilha", emoji: "🦵", grupoPadrao: "Panturrilha" },
  { key: "abdomen", nome: "Abdômen", emoji: "🧘", grupoPadrao: "Abdômen" },
  { key: "cardio", nome: "Cardio", emoji: "🏃", grupoPadrao: "Corrida" },
  { key: "outros", nome: "Outros", emoji: "🎽", grupoPadrao: "Peitoral" },
];

export const BLOCO_OUTROS = "outros";

/** primário normalizado (sem acento, minúsculo) -> key do bloco */
const MAPA_PRIMARIO: Record<string, string> = {
  peito: "peito",
  peitoral: "peito",
  peitorais: "peito",

  costas: "costas",
  dorsal: "costas",
  dorsais: "costas",
  "grande dorsal": "costas",
  trapezio: "costas",
  romboide: "costas",
  romboides: "costas",
  lombar: "costas",

  ombro: "ombro",
  ombros: "ombro",
  deltoide: "ombro",
  deltoides: "ombro",
  "deltoide anterior": "ombro",
  "deltoide lateral": "ombro",
  "deltoide posterior": "ombro",

  biceps: "biceps",
  braquial: "biceps",
  antebraco: "biceps",

  triceps: "triceps",

  quadriceps: "quadriceps",
  coxa: "quadriceps",
  adutores: "gluteo",
  "adutores da coxa": "gluteo",
  abdutores: "gluteo",
  "abdutores da coxa": "gluteo",

  isquiotibiais: "posterior",
  "posterior de coxa": "posterior",
  "posterior de coxas": "posterior",
  posteriores: "posterior",

  gluteo: "gluteo",
  gluteos: "gluteo",

  panturrilha: "panturrilha",
  panturrilhas: "panturrilha",
  gastrocnemio: "panturrilha",
  soleo: "panturrilha",

  abdomen: "abdomen",
  abdominal: "abdomen",
  abdominais: "abdomen",
  core: "abdomen",
  obliquos: "abdomen",

  corrida: "cardio",
  cardio: "cardio",
  aerobico: "cardio",
  esteira: "cardio",
  bike: "cardio",
  ciclismo: "cardio",
  natacao: "cardio",
  caminhada: "cardio",
};

/** Minúsculo, sem acento e sem espaços extras — para comparação e busca */
export const normalizar = (texto: string): string =>
  (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

/** Músculo primário: trecho antes da primeira "/" */
export const musculoPrimario = (grupoMuscular: string): string =>
  (grupoMuscular || "").split("/")[0].trim();

/** Bloco canônico de um valor de `grupo_muscular` (fallback: "outros") */
export const blocoDoGrupoMuscular = (grupoMuscular: string): string =>
  MAPA_PRIMARIO[normalizar(musculoPrimario(grupoMuscular))] ?? BLOCO_OUTROS;

/** Bloco de UM músculo isolado (sem "/"), ou null se não reconhecido */
export const blocoDeMusculo = (musculo: string): string | null =>
  MAPA_PRIMARIO[normalizar(musculo)] ?? null;

export const getBloco = (key: string): BlocoMuscular =>
  BLOCOS_MUSCULARES.find((b) => b.key === key) ??
  BLOCOS_MUSCULARES[BLOCOS_MUSCULARES.length - 1];

/** Agrupa exercícios por bloco, preservando a ordem de BLOCOS_MUSCULARES e omitindo blocos vazios */
export function agruparPorBloco<T extends { grupo_muscular: string }>(
  exercicios: T[],
): { bloco: BlocoMuscular; exercicios: T[] }[] {
  const mapa = new Map<string, T[]>();
  for (const ex of exercicios) {
    const key = blocoDoGrupoMuscular(ex.grupo_muscular);
    const atual = mapa.get(key);
    if (atual) atual.push(ex);
    else mapa.set(key, [ex]);
  }
  return BLOCOS_MUSCULARES.filter((b) => mapa.has(b.key)).map((bloco) => ({
    bloco,
    exercicios: mapa.get(bloco.key) as T[],
  }));
}

/** Match de busca por nome do exercício ou pelo grupo muscular cadastrado */
export const combinaBusca = (
  ex: { nome: string; grupo_muscular: string },
  termo: string,
): boolean => {
  const t = normalizar(termo);
  if (!t) return true;
  return normalizar(ex.nome).includes(t) || normalizar(ex.grupo_muscular).includes(t);
};

/** Nome do bloco muscular a partir do `grupo_muscular` cru — rótulo curto para listas */
export const nomeDoBloco = (grupoMuscular: string): string =>
  getBloco(blocoDoGrupoMuscular(grupoMuscular)).nome;
