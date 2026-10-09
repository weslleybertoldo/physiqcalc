// Physiq hml-14b (H-73 · B21 · D19) — leitura do Histórico do exercício no SQLite do aparelho, POR DIA.
// Antes: `ORDER BY data_treino DESC LIMIT 50` séries, sem "ver mais": o aluno com 60 séries perdia as mais antigas e o corte
// podia partir um dia ao meio. Agora: 20 dias por vez (o dia vem inteiro), o total de dias e a próxima página a partir do dia
// mais antigo já mostrado (série nova feita com o histórico aberto não empurra nem repete dia).

export const DIAS_POR_PAGINA = 20;

export interface RegistroHistorico {
  data_treino: string;
  numero_serie: number;
  peso: number | null;
  reps: number | null;
  tempo_segundos: number | null;
  distancia_km: number | null;
  pace_segundos_km: number | null;
  academia_nome: string | null;
}

export interface DiaDoHistorico {
  dia: string;
  series: RegistroHistorico[];
}

/** O que o histórico usa do banco local do PowerSync (o `usePowerSync()`; nos testes, um banco falso). */
export interface BancoLocal {
  getAll<T>(sql: string, parametros?: unknown[]): Promise<T[]>;
}

// As séries que contam: do aluno, com OK, deste exercício (do catálogo ou criado por ele) e com carga ou tempo.
const FILTRO =
  "user_id = ? AND concluida = 1 AND (exercicio_id = ? OR exercicio_usuario_id = ?) AND (peso > 0 OR tempo_segundos > 0)";

/** Uma página do histórico: os `DIAS_POR_PAGINA` dias mais novos antes de `antesDe` (sem ele, os mais novos), cada um com
 * todas as séries, e o total de dias do exercício. */
export async function lerPaginaDoHistorico(
  db: BancoLocal,
  userId: string,
  exercicioId: string,
  antesDe?: string,
): Promise<{ dias: DiaDoHistorico[]; totalDias: number }> {
  const base = [userId, exercicioId, exercicioId];
  const [contagem] = await db.getAll<{ total: number }>(
    `SELECT COUNT(DISTINCT data_treino) AS total FROM tb_treino_series WHERE ${FILTRO}`,
    base,
  );
  const totalDias = Number(contagem?.total ?? 0);
  const datas = await db.getAll<{ data_treino: string }>(
    antesDe
      ? `SELECT DISTINCT data_treino FROM tb_treino_series WHERE ${FILTRO} AND data_treino < ? ORDER BY data_treino DESC LIMIT ?`
      : `SELECT DISTINCT data_treino FROM tb_treino_series WHERE ${FILTRO} ORDER BY data_treino DESC LIMIT ?`,
    antesDe ? [...base, antesDe, DIAS_POR_PAGINA] : [...base, DIAS_POR_PAGINA],
  );
  if (datas.length === 0) return { dias: [], totalDias };
  const registros = await db.getAll<RegistroHistorico>(
    `SELECT data_treino, numero_serie, peso, reps, tempo_segundos, distancia_km, pace_segundos_km, academia_nome
     FROM tb_treino_series
     WHERE ${FILTRO} AND data_treino IN (${datas.map(() => "?").join(", ")})
     ORDER BY data_treino DESC, numero_serie`,
    [...base, ...datas.map((d) => d.data_treino)],
  );
  return { dias: agruparPorDia(registros), totalDias };
}

/** Agrupa as séries por dia (mais novo primeiro) e, dentro do dia, pela ordem da série. */
export function agruparPorDia(registros: RegistroHistorico[]): DiaDoHistorico[] {
  const porDia = new Map<string, RegistroHistorico[]>();
  for (const r of registros) {
    const lista = porDia.get(r.data_treino);
    if (lista) lista.push(r);
    else porDia.set(r.data_treino, [r]);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dia, series]) => ({ dia, series: [...series].sort((a, b) => a.numero_serie - b.numero_serie) }));
}
