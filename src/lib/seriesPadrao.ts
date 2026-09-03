/**
 * Nº de séries que aparecem no app, configurado pelo admin por usuário e treino —
 * geral do treino ou por exercício.
 *
 * Regra: quando um exercício não tem série salva no dia, o app monta `alvo` séries.
 * `alvo` = linha do EXERCÍCIO > linha GERAL do treino > padrão 3. Peso e reps de cada
 * número continuam vindo do último treino daquele exercício quando existir — só a
 * QUANTIDADE deixa de ser copiada do histórico (antes, 1 série feita ontem virava 1 hoje).
 */

export const SERIES_PADRAO_DEFAULT = 3;
export const SERIES_PADRAO_MIN = 1;
export const SERIES_PADRAO_MAX = 10;

export interface SeriePadraoRow {
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  /** exercício do catálogo (null junto com exercicio_usuario_id = geral do treino) */
  exercicio_id?: string | null;
  /** exercício pessoal do usuário */
  exercicio_usuario_id?: string | null;
  num_series: number | null;
}

/** Exercício de um treino, como a edge devolve pro popup do admin */
export interface ExercicioTreino {
  exercicio_id: string | null;
  exercicio_usuario_id: string | null;
  nome: string;
  emoji: string;
  ordem: number;
}

export interface SerieUltimoTreino {
  numero_serie: number;
  peso?: number | null;
  reps?: number | null;
}

export interface EstruturaSerie {
  numero_serie: number;
  /** peso do último treino nesse número (0 quando não houve) */
  pesoUltimo: number;
  reps: number;
}

/** Chave do treino, igual à usada no admin: "catalogo:<id>" (treinador) | "pessoal:<id>" */
export const chaveTreino = (grupoId: string | null | undefined, grupoUsuarioId: string | null | undefined): string | null =>
  grupoUsuarioId ? `pessoal:${grupoUsuarioId}` : grupoId ? `catalogo:${grupoId}` : null;

/** Chave do exercício: "ex:<id>" (catálogo) | "exu:<id>" (pessoal) | null (= geral do treino) */
export const chaveExercicio = (exercicioId: string | null | undefined, exercicioUsuarioId: string | null | undefined): string | null =>
  exercicioUsuarioId ? `exu:${exercicioUsuarioId}` : exercicioId ? `ex:${exercicioId}` : null;

/** Chave composta usada no mapa: treino, ou treino + exercício */
export const chaveSeries = (treino: string, exercicio: string | null): string =>
  exercicio ? `${treino}|${exercicio}` : treino;

export const clampSeries = (n: number): number => {
  const inteiro = Math.round(Number.isFinite(n) ? n : SERIES_PADRAO_DEFAULT);
  return Math.min(SERIES_PADRAO_MAX, Math.max(SERIES_PADRAO_MIN, inteiro));
};

/** Linhas da tabela → mapa chave (treino | treino+exercício) → nº de séries (dentro dos limites) */
export function mapaSeriesPadrao(rows: SeriePadraoRow[] | null | undefined): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of rows || []) {
    const treino = chaveTreino(r.grupo_id, r.grupo_usuario_id);
    if (!treino || r.num_series == null) continue;
    mapa.set(chaveSeries(treino, chaveExercicio(r.exercicio_id, r.exercicio_usuario_id)), clampSeries(r.num_series));
  }
  return mapa;
}

/**
 * Nº de séries de um exercício do treino: configurado pro exercício > geral do treino > padrão.
 * Sem exercício informado, devolve o geral do treino (ou o padrão).
 */
export function numSeriesPadrao(
  mapa: Map<string, number>,
  treino: string | null | undefined,
  exercicioId?: string | null,
  exercicioUsuarioId?: string | null,
): number {
  if (!treino) return SERIES_PADRAO_DEFAULT;
  const ex = chaveExercicio(exercicioId, exercicioUsuarioId);
  if (ex) {
    const proprio = mapa.get(chaveSeries(treino, ex));
    if (proprio) return proprio;
  }
  return mapa.get(treino) || SERIES_PADRAO_DEFAULT;
}

/** O exercício tem número próprio (diferente da regra geral do treino)? */
export const temSeriesProprias = (
  mapa: Map<string, number>,
  treino: string | null | undefined,
  exercicioId?: string | null,
  exercicioUsuarioId?: string | null,
): boolean => {
  const ex = chaveExercicio(exercicioId, exercicioUsuarioId);
  return !!treino && !!ex && mapa.has(chaveSeries(treino, ex));
};

/** Há nº configurado pro exercício (próprio) OU pro treino (geral)? false = vale o padrão 3 */
export const temSeriesConfiguradas = (
  mapa: Map<string, number>,
  treino: string | null | undefined,
  exercicioId?: string | null,
  exercicioUsuarioId?: string | null,
): boolean =>
  !!treino && (temSeriesProprias(mapa, treino, exercicioId, exercicioUsuarioId) || mapa.has(treino));

/**
 * Números de série vazias a acrescentar pra um exercício que JÁ tem séries salvas hoje chegar
 * ao alvo (o admin subiu o número): preenche as lacunas a partir do 1 (a salva pode ser só a S6,
 * com S1..S5 vazias) e nunca remove (série salva não some por redução do admin).
 */
export function numerosParaCompletar(existentes: number[], alvo: number): number[] {
  const total = clampSeries(alvo);
  const unicos = new Set(existentes);
  const saida: number[] = [];
  let candidato = 1;
  while (unicos.size + saida.length < total) {
    if (!unicos.has(candidato)) saida.push(candidato);
    candidato += 1;
  }
  return saida;
}

/**
 * Estrutura das séries de um exercício SEM série salva no dia: exatamente `alvo` séries;
 * peso/reps por número vêm do último treino quando existir (S4 sem histórico = 0 kg × 10).
 */
export function estruturaSeriesPadrao(alvo: number, ultimo: SerieUltimoTreino[] | null | undefined): EstruturaSerie[] {
  const porNumero = new Map<number, SerieUltimoTreino>();
  for (const s of ultimo || []) porNumero.set(s.numero_serie, s);
  const total = clampSeries(alvo);
  const saida: EstruturaSerie[] = [];
  for (let i = 1; i <= total; i++) {
    const u = porNumero.get(i);
    saida.push({ numero_serie: i, pesoUltimo: u?.peso ?? 0, reps: u?.reps ?? 10 });
  }
  return saida;
}
