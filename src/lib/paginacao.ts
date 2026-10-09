// Physiq hml-14b (B21 · D13) — paginação das listas da tela: 20 por página, "1–20 de 41", a página vinda do banco.
// Pedido dele (08/10/2026): "a lista tem 1000 linhas. Aparece somente 20 em cada página. 20-1000 pag 1". Filtro, ordem e
// busca SEMPRE no banco; a tela só mostra a página que chegou e o total.

export const POR_PAGINA = 20;

/** Uma página de uma lista e o total da lista inteira (com o filtro). */
export interface Pagina<T> {
  itens: T[];
  total: number;
}

const inteiroMinimo = (n: number, minimo: number) => (Number.isFinite(n) ? Math.max(minimo, Math.floor(n)) : minimo);

/** `[de, ate]` da página (a 1ª é 1) para o `.range(de, ate)` do supabase-js. */
export function intervalo(pagina: number, porPagina = POR_PAGINA): [number, number] {
  const de = (inteiroMinimo(pagina, 1) - 1) * porPagina;
  return [de, de + porPagina - 1];
}

/** O deslocamento (`p_offset` das RPCs) da página. */
export function deslocamento(pagina: number, porPagina = POR_PAGINA): number {
  return intervalo(pagina, porPagina)[0];
}

/** A última página (1 quando a lista está vazia). */
export function ultimaPagina(total: number, porPagina = POR_PAGINA): number {
  return Math.max(1, Math.ceil(inteiroMinimo(total, 0) / porPagina));
}

/** A página dentro de `[1, última]`. */
export function paginaValida(pagina: number, total: number, porPagina = POR_PAGINA): number {
  return Math.min(inteiroMinimo(pagina, 1), ultimaPagina(total, porPagina));
}

/** "1–20 de 41" (a página fora do total cai na última; lista vazia = "0 de 0"). */
export function rotulo(pagina: number, total: number, porPagina = POR_PAGINA): string {
  const n = inteiroMinimo(total, 0);
  if (n === 0) return "0 de 0";
  const de = deslocamento(paginaValida(pagina, n, porPagina), porPagina);
  return `${de + 1}–${Math.min(de + porPagina, n)} de ${n}`;
}

/** O que a consulta do supabase-js devolve com `{ count: "exact" }`. */
export interface RespostaComContagem<T> {
  data: T[] | null;
  error: unknown;
  count: number | null;
}

/**
 * Lê uma página de uma tabela ou view pelo supabase-js. `montar(de, ate)` devolve a consulta com
 * `.select(colunas, { count: "exact" })`, os filtros, uma ordem ESTÁVEL (com desempate, ex. `id`) e `.range(de, ate)`.
 * Erro do banco → lança (a tela mostra o erro; nunca uma lista vazia no lugar do erro).
 */
export async function paginar<T>(
  montar: (de: number, ate: number) => PromiseLike<RespostaComContagem<T>>,
  pagina: number,
  porPagina = POR_PAGINA,
): Promise<Pagina<T>> {
  const [de, ate] = intervalo(pagina, porPagina);
  const { data, error, count } = await montar(de, ate);
  if (error) throw error;
  if (count == null) throw new Error("paginar: a consulta precisa de { count: \"exact\" } no select");
  return { itens: data ?? [], total: count };
}
