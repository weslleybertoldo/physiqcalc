import type { QueryClient } from "@tanstack/react-query";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { listarAlunos } from "./api";
import { FILTROS_PADRAO, SITUACOES, type FiltrosAlunos, type SituacaoFiltro } from "./regras";

/**
 * hml-18b (H-54, F) — a consulta da lista de Painel › Alunos num lugar só: a página e a PRÉ-BUSCA (src/painel/preBusca.ts) usam a
 * MESMA chave, a mesma função e o mesmo staleTime (20 s, o de antes). A pré-busca roda depois que a pré-carga baixa o pedaço da página
 * (no ocioso): o toque em "Alunos" já acha a 1ª página no cache — a tela não espera a lista (Painel → Alunos).
 */
export function filtrosDaUrl(sp: URLSearchParams): FiltrosAlunos {
  const sit = sp.get("situacao") as SituacaoFiltro | null;
  return {
    ...FILTROS_PADRAO,
    situacao: sit && SITUACOES.some((s) => s.valor === sit) ? sit : FILTROS_PADRAO.situacao,
    responsavel: sp.get("responsavel") ?? "",
    // hml-14b (D15): a busca também fica no endereço (abrir um aluno e voltar mantém a busca e a página)
    q: (sp.get("q") ?? "").trim(),
  };
}

export function consultaListaAlunos(contaId: string | undefined, filtros: FiltrosAlunos, pagina: number) {
  return {
    queryKey: ["alunos", contaId, filtros, pagina] as const,
    queryFn: () => listarAlunos(contaId as string, filtros, deslocamento(pagina), POR_PAGINA),
    staleTime: 20_000,
    retry: 1,
  };
}

/** A 1ª dobra de Alunos (o endereço sem filtro: os ativos, página 1) — no cache antes do toque. */
export function preBuscarAlunos(qc: QueryClient, contaId: string): Promise<void> {
  return qc.prefetchQuery(consultaListaAlunos(contaId, filtrosDaUrl(new URLSearchParams()), 1));
}
