import type { GrupoExercicio, SerieComMemoria } from "./tipos";

/** "Crucifixo com halteres" → "do crucifixo"; "Remada baixa" → "da remada baixa" (o texto "Depois: série 3 do crucifixo"). */
export function doExercicio(nome: string): string {
  const curto = nome.split(/\s+(?:com|na|no|em|de)\s+/i)[0].trim() || nome;
  const minusculo = curto.toLocaleLowerCase("pt-BR");
  const primeira = minusculo.split(/\s+/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "");
  const feminino = /(a|cao|sao|dade|gem)$/.test(primeira);
  return `${feminino ? "da" : "do"} ${minusculo}`;
}

/** A próxima série depois do OK em `num` do exercício `exId` (na ordem da tela): "série 3 do crucifixo". */
export function proximaSerie(ordem: GrupoExercicio[], series: SerieComMemoria[], exId: string, num: number): string | null {
  const doEx = (id: string) => series.filter((s) => s.exercicio_id === id || s.exercicio_usuario_id === id).sort((a, b) => a.numero_serie - b.numero_serie);
  const pendentes = (id: string, ignorar?: number) => doEx(id).filter((s) => !s.concluida && s.numero_serie !== ignorar);
  const i = ordem.findIndex((g) => g.tb_exercicios.id === exId);
  const atual = i >= 0 ? ordem[i] : null;
  const restoDoAtual = pendentes(exId, num);
  if (atual && restoDoAtual.length) return `série ${restoDoAtual[0].numero_serie} ${doExercicio(atual.tb_exercicios.nome)}`;
  const seguintes = i >= 0 ? [...ordem.slice(i + 1), ...ordem.slice(0, i)] : ordem;
  for (const g of seguintes) {
    const p = pendentes(g.tb_exercicios.id);
    if (p.length) return `série ${p[0].numero_serie} ${doExercicio(g.tb_exercicios.nome)}`;
  }
  return null;
}
