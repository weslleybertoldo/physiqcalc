export interface SemanaConfigLike {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  /** linha de treino EXTRA do alternado (0/1 no SQLite, boolean no Postgres) */
  extra?: number | boolean | null;
  extra_atrelado_grupo_id?: string | null;
  extra_atrelado_grupo_usuario_id?: string | null;
}

export interface DiaAlternadoConfig {
  dia_semana: string;
  alternado: number | boolean | null;
  /** segunda-feira (yyyy-mm-dd) da semana em que o alternado foi ativado */
  alternado_inicio: string | null;
}

const ehExtra = (s: SemanaConfigLike): boolean => !!s.extra;

/** Todos os treinos recorrentes de um dia da semana, ordenados por slot_idx. */
export function selectSemanaConfigsForDia<T extends SemanaConfigLike>(
  semanaConfig: T[],
  diaSemana: string,
): T[] {
  return semanaConfig
    .filter((s) => s.dia_semana === diaSemana)
    .sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0));
}

/** Segunda-feira (yyyy-mm-dd) da semana de uma data yyyy-mm-dd — aritmética UTC pura (sem fuso) */
export function segundaDaSemana(dataISO: string): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Índice da rotação (0..n-1) para uma data, dado o início e o tamanho da rotação */
export function indiceRotacao(dataISO: string, inicioISO: string, n: number): number {
  if (n <= 0) return 0;
  const seg = Date.parse(`${segundaDaSemana(dataISO)}T00:00:00Z`);
  const ini = Date.parse(`${segundaDaSemana(inicioISO)}T00:00:00Z`);
  const semanas = Math.round((seg - ini) / (7 * 24 * 60 * 60 * 1000));
  return ((semanas % n) + n) % n;
}

/**
 * Treinos efetivos de um dia/data considerando o "Treino alternado".
 * - alternado OFF (ou sem âncora): retorna os treinos da rotação (extras ficam de fora).
 * - alternado ON: retorna o treino da semana atual da rotação + extras aplicáveis
 *   (extra atrelado a um treino aparece só nas semanas dele; sem atrelamento — ou
 *   atrelado a treino que saiu da rotação — aparece toda semana).
 */
export function resolverTreinosDoDia<T extends SemanaConfigLike>(
  semanaConfig: T[],
  diaSemana: string,
  dataISO: string,
  config?: DiaAlternadoConfig | null,
): T[] {
  const rows = selectSemanaConfigsForDia(semanaConfig, diaSemana);
  const rotativos = rows.filter((r) => !ehExtra(r));
  const extras = rows.filter(ehExtra);

  const ativo = !!config?.alternado && !!config?.alternado_inicio;
  if (!ativo || rotativos.length === 0) return rotativos;

  const idx = indiceRotacao(dataISO, config!.alternado_inicio as string, rotativos.length);
  const escolhido = rotativos[idx];

  const atreladoA = (e: T, r: T): boolean =>
    (e.extra_atrelado_grupo_id != null && e.extra_atrelado_grupo_id === r.grupo_id) ||
    (e.extra_atrelado_grupo_usuario_id != null && e.extra_atrelado_grupo_usuario_id === r.grupo_usuario_id);

  const extrasDaSemana = extras.filter((e) => {
    const temAtrelamento = e.extra_atrelado_grupo_id != null || e.extra_atrelado_grupo_usuario_id != null;
    if (!temAtrelamento) return true;
    const aindaNaRotacao = rotativos.some((r) => atreladoA(e, r));
    if (!aindaNaRotacao) return true; // treino atrelado saiu da rotação → vale pra todas
    return atreladoA(e, escolhido);
  });

  return [escolhido, ...extrasDaSemana];
}
