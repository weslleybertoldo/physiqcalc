// Physiq hml-14d (B21 · D26) — regras PURAS da admin-relatorio: a página do Histórico do mês e do histórico completo de um aluno.
// Sem Deno, sem rede e sem banco: usadas pela função (o deploy leva a pasta dela) e testadas no Vitest
// (src/lib/adminTreinoListas.test.ts).

/** O tamanho da página das listas do painel (o POR_PAGINA de src/lib/paginacao.ts). */
export const POR_PAGINA = 20;

/**
 * A página pedida no corpo: sem `pagina` (ou nula) → null, o caminho de hoje (a lista inteira, a resposta de antes); com
 * `pagina` → um inteiro ≥ 1 (o que não for número inteiro positivo vira 1).
 */
export function paginaPedida(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** A página `pagina` (a 1ª é 1) da lista e o total dela. */
export function fatiar<T>(lista: readonly T[], pagina: number, porPagina = POR_PAGINA): { itens: T[]; total: number } {
  const de = (Math.max(1, Math.floor(pagina)) - 1) * porPagina;
  return { itens: lista.slice(de, de + porPagina), total: lista.length };
}

const texto = (v: unknown) => String(v ?? "");
const compara = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A ordem do Histórico do mês (a de sempre: o dia mais novo primeiro, depois o nome da pessoa) com o desempate pela chave — sem
 * ele, 2 treinos do mesmo dia e da mesma pessoa trocavam de lugar entre 2 pedidos e a página pulava ou repetia um.
 */
export function ordemDoMes(a: { data: string; pessoa: string; chave: string }, b: { data: string; pessoa: string; chave: string }): number {
  if (a.data !== b.data) return b.data.localeCompare(a.data);
  return a.pessoa.localeCompare(b.pessoa) || compara(a.chave, b.chave);
}

/** A ordem do histórico completo de um aluno (a de sempre: o mais novo primeiro pelo início) com o desempate pelo id. */
export function ordemDoHistorico(a: { iniciado_em?: unknown; id?: unknown }, b: { iniciado_em?: unknown; id?: unknown }): number {
  return texto(b.iniciado_em).localeCompare(texto(a.iniciado_em)) || compara(texto(a.id), texto(b.id));
}
