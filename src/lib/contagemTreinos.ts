/**
 * Regra ÚNICA de contagem de treinos: conta DIAS distintos com pelo menos 1
 * treino concluído — não sessões/slots. Dois treinos no mesmo dia = 1.
 * Usada no card "Treinos na semana", "Treinos no mês" e no relatório admin.
 */
export function diasTreinados(items: Iterable<{ data_treino: string }>): Set<string> {
  const dias = new Set<string>();
  for (const it of items) {
    if (it?.data_treino) dias.add(it.data_treino);
  }
  return dias;
}

export function contarDiasTreinados(items: Iterable<{ data_treino: string }>): number {
  return diasTreinados(items).size;
}

/** Converte chave local "YYYY-MM-DD|slot" (estado otimista do TreinosPage) em {data_treino}. */
export function chaveParaConcluido(chave: string): { data_treino: string } {
  return { data_treino: chave.split('|')[0] };
}
