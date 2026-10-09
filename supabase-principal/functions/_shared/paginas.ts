// hml-14 (H-32): listas lidas pelas funções sem o corte calado do PostgREST (max_rows = 1000 nos 2 projetos: todo `.limit(N)`
// acima disso e toda leitura sem `range` param em 1000 sem aviso).
// Cópia IGUAL em supabase-principal/functions/_shared/paginas.ts e supabase/functions/_shared/paginas.ts (o
// src/lib/tempoFuncoes.test.ts confere as 2 byte a byte). Sem import de URL: o Vitest importa este arquivo.

/** O `max_rows` do PostgREST nos 2 projetos (medido na hml-14: GET /v1/projects/<ref>/postgrest). */
export const MAX_ROWS = 1000;

/** Uma página do supabase-js: a consulta de quem chama com `.range(de, ate)` — e com `.order()` estável, senão linhas pulam. */
export type MontarPagina<T> = (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>;

/** Passou do teto de páginas: lança em vez de devolver a lista pela metade (o catch da função responde 500 e avisa). */
export class ListaGrandeDemais extends Error {
  constructor() {
    super("lista_grande_demais");
    this.name = "ListaGrandeDemais";
  }
}

/**
 * Lê todas as páginas: `range` em laço até vir uma página curta. Erro do banco → lança o próprio erro (nada de lista pela
 * metade); passou de `maxPaginas` → lança `ListaGrandeDemais`.
 */
export async function todasAsPaginas<T>(
  montar: MontarPagina<T>,
  opcoes: { porPagina?: number; maxPaginas?: number } = {},
): Promise<T[]> {
  const porPagina = Math.max(1, Math.min(Math.floor(opcoes.porPagina ?? MAX_ROWS), MAX_ROWS));
  const maxPaginas = Math.max(1, Math.floor(opcoes.maxPaginas ?? 50));
  const tudo: T[] = [];
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * porPagina;
    const { data, error } = await montar(de, de + porPagina - 1);
    if (error) throw error;
    const linhas = data ?? [];
    tudo.push(...linhas);
    if (linhas.length < porPagina) return tudo;
  }
  throw new ListaGrandeDemais();
}

/** Roda `fn` em lotes de `tamanho` ids, em série, e junta os resultados (o `.in()` com centenas de uuid estoura a URL). */
export async function emLotes<I, R>(ids: readonly I[], tamanho: number, fn: (lote: I[]) => Promise<R[]>): Promise<R[]> {
  const n = Math.max(1, Math.floor(tamanho));
  const saida: R[] = [];
  for (let i = 0; i < ids.length; i += n) saida.push(...(await fn(ids.slice(i, i + n))));
  return saida;
}
