/**
 * Busca pelos rótulos de movimento e equipamento (hml-14d, B21 — D24/D27).
 *
 * O banco guarda só a CHAVE (`padrao_movimento = 'supino_reto'`, `equipamento = 'polia'`); quem busca digita o que vê na tela
 * ("supino", "cabo", "maquina"). Aqui saem as chaves cujos RÓTULOS (as listas fixas de `equivalencia.ts`) casam com o termo,
 * sem acento e sem maiúsculas — a tela manda a lista no `codigos` da RPC `exercicios_da_lista`, e o banco casa com
 * `padrao_movimento`/`equipamento` (além do `q` nos textos do exercício).
 */
import { normalizar } from "@/lib/gruposMusculares";
import { EQUIPAMENTOS, PADROES } from "./equivalencia";

const ROTULOS: readonly { chave: string; rotulo: string }[] = [
  ...PADROES.map((p) => ({ chave: p.chave, rotulo: normalizar(p.rotulo) })),
  ...EQUIPAMENTOS.map((e) => ({ chave: e.chave, rotulo: normalizar(e.rotulo) })),
];

/** Chaves de movimento e de equipamento cujo rótulo contém o termo (movimentos primeiro, sem repetir; termo vazio = nenhuma). */
export function codigosDaBusca(termo: string | null | undefined): string[] {
  const t = normalizar(termo ?? "");
  if (!t) return [];
  const saida: string[] = [];
  for (const { chave, rotulo } of ROTULOS) if (rotulo.includes(t) && !saida.includes(chave)) saida.push(chave);
  return saida;
}
