/**
 * Volume semanal de treino por bloco muscular.
 *
 * Séries por exercício = último treino registrado (fallback 3, o padrão do app).
 * Músculo primário conta 1 série; secundários (após a "/") contam 0,5 cada
 * (volume indireto). Faixas por bloco = volume landmarks MEV/MRV
 * (Renaissance Periodization / Israetel); cardio e "outros" não têm faixa.
 */
import {
  BLOCOS_MUSCULARES,
  type BlocoMuscular,
  blocoDoGrupoMuscular,
  blocoDeMusculo,
} from "./gruposMusculares";

export const SERIES_PADRAO = 3;

export interface LandmarkVolume {
  /** MEV — mínimo de séries/semana pra crescer */
  mev: number;
  /** MRV — máximo recuperável de séries/semana (o "limite") */
  mrv: number;
}

/** Landmarks semanais por bloco (RP/Israetel, população treinada média) */
export const LANDMARKS: Record<string, LandmarkVolume> = {
  peito: { mev: 10, mrv: 22 },
  costas: { mev: 10, mrv: 25 },
  ombro: { mev: 8, mrv: 26 },
  biceps: { mev: 8, mrv: 26 },
  triceps: { mev: 6, mrv: 18 },
  quadriceps: { mev: 8, mrv: 20 },
  posterior: { mev: 6, mrv: 20 },
  gluteo: { mev: 4, mrv: 16 },
  panturrilha: { mev: 8, mrv: 20 },
  abdomen: { mev: 0, mrv: 25 },
};

export type StatusVolume = "abaixo" | "produtivo" | "perto" | "limite" | "neutro";

export function statusVolume(blocoKey: string, total: number): StatusVolume {
  const lm = LANDMARKS[blocoKey];
  if (!lm) return "neutro";
  if (total >= lm.mrv) return "limite";
  if (total >= lm.mrv * 0.85) return "perto";
  if (total < lm.mev) return "abaixo";
  return "produtivo";
}

/** Blocos secundários (trechos após a "/"), sem repetir o primário */
export function blocosSecundarios(grupoMuscular: string): string[] {
  const partes = (grupoMuscular || "").split("/").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return [];
  const primario = blocoDoGrupoMuscular(grupoMuscular);
  const vistos = new Set<string>([primario]);
  const out: string[] = [];
  for (const parte of partes.slice(1)) {
    const key = blocoDeMusculo(parte);
    if (key && !vistos.has(key)) {
      vistos.add(key);
      out.push(key);
    }
  }
  return out;
}

export interface ExercicioVolume {
  id: string;
  isPessoal: boolean;
  nome: string;
  grupo_muscular: string;
  tipo: string | null;
  seriesUltimo: number | null;
}

export interface GrupoVolume {
  nome: string;
  exercicios: ExercicioVolume[];
}

export interface SemanaRowVolume {
  dia_semana: string;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
}

export interface DetalheExercicio {
  nome: string;
  /** séries por sessão (último treino ou padrão) */
  series: number;
  seriesEhPadrao: boolean;
  /** quantas vezes o exercício aparece na semana */
  vezes: number;
  /** 1 = primário, 0.5 = secundário */
  fator: number;
  subtotal: number;
}

export interface VolumeBloco {
  bloco: BlocoMuscular;
  total: number;
  status: StatusVolume;
  landmark: LandmarkVolume | null;
  detalhes: DetalheExercicio[];
}

const keyOfRow = (r: SemanaRowVolume) =>
  r.grupo_usuario_id ? `pessoal:${r.grupo_usuario_id}` : `catalogo:${r.grupo_id}`;

interface Ocorrencia {
  id: string;
  isPessoal: boolean;
  nome: string;
  grupo_muscular: string;
  series: number;
  seriesEhPadrao: boolean;
}

/** Agrega ocorrências de exercícios em blocos musculares (primário 1, secundário 0,5) */
function agregarOcorrencias(ocorrencias: Ocorrencia[]): VolumeBloco[] {
  // por bloco -> por exercício (id+fator) -> detalhe acumulado
  const acc = new Map<string, Map<string, DetalheExercicio>>();

  for (const ex of ocorrencias) {
    const alvos: { blocoKey: string; fator: number }[] = [
      { blocoKey: blocoDoGrupoMuscular(ex.grupo_muscular), fator: 1 },
      ...blocosSecundarios(ex.grupo_muscular).map((b) => ({ blocoKey: b, fator: 0.5 })),
    ];
    for (const { blocoKey, fator } of alvos) {
      const porEx = acc.get(blocoKey) ?? new Map<string, DetalheExercicio>();
      acc.set(blocoKey, porEx);
      const exKey = `${ex.isPessoal ? "p" : "c"}:${ex.id}:${fator}`;
      const atual = porEx.get(exKey);
      if (atual) {
        atual.vezes += 1;
        atual.subtotal = atual.series * atual.fator * atual.vezes;
      } else {
        porEx.set(exKey, {
          nome: ex.nome,
          series: ex.series,
          seriesEhPadrao: ex.seriesEhPadrao,
          vezes: 1,
          fator,
          subtotal: ex.series * fator,
        });
      }
    }
  }

  return BLOCOS_MUSCULARES.filter((b) => acc.has(b.key)).map((bloco) => {
    const detalhes = [...(acc.get(bloco.key) as Map<string, DetalheExercicio>).values()]
      .sort((a, b) => b.subtotal - a.subtotal || a.nome.localeCompare(b.nome));
    const total = detalhes.reduce((s, d) => s + d.subtotal, 0);
    return {
      bloco,
      total,
      status: statusVolume(bloco.key, total),
      landmark: LANDMARKS[bloco.key] ?? null,
      detalhes,
    };
  });
}

/** Soma o volume semanal PROGRAMADO por bloco (semana recorrente + exercícios dos grupos) */
export function calcularVolumeSemanal(
  semana: SemanaRowVolume[],
  grupos: Record<string, GrupoVolume>,
): VolumeBloco[] {
  const ocorrencias: Ocorrencia[] = [];
  for (const row of semana) {
    const grupo = grupos[keyOfRow(row)];
    if (!grupo) continue;
    for (const ex of grupo.exercicios) {
      ocorrencias.push({
        id: ex.id,
        isPessoal: ex.isPessoal,
        nome: ex.nome,
        grupo_muscular: ex.grupo_muscular,
        series: ex.seriesUltimo ?? SERIES_PADRAO,
        seriesEhPadrao: ex.seriesUltimo == null,
      });
    }
  }
  return agregarOcorrencias(ocorrencias);
}

export interface ExercicioPraticado {
  id: string;
  isPessoal: boolean;
  nome: string;
  grupo_muscular: string;
  /** séries CONCLUÍDAS no período (já somadas por exercício) */
  series: number;
}

/** Volume PRATICADO por bloco (séries concluídas reais de um período) */
export function calcularVolumePraticado(exercicios: ExercicioPraticado[]): VolumeBloco[] {
  return agregarOcorrencias(
    exercicios.map((e) => ({ ...e, seriesEhPadrao: false })),
  );
}

/** "7,5" sem casa decimal desnecessária */
export const formatarSeries = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
