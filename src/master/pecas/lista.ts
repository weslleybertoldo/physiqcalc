/**
 * hml-14d (B21 · D28) — a página de uma lista do painel master: a página no endereço (`?pagina=`, usePaginaNaUrl — abrir uma conta
 * e fechar mantém a página; filtro novo volta à 1), o pedido ao banco com a página anterior na tela enquanto a nova chega
 * (keepPreviousData) e o total lido só de uma resposta de verdade (não da página anterior que fica na tela) — o molde da
 * Pré-consulta › Respostas da hml-14b. E a busca que espera a pessoa parar de digitar antes de ir ao banco.
 */
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";

export function usePaginaDoMaster<T extends { total: number }>({ chave, filtro, queryKey, buscar, ligado = true }: {
  /** a chave do endereço (padrão `pagina`) */
  chave?: string;
  /** tudo que filtra a lista (mudou → página 1) */
  filtro: unknown;
  /** a chave do react-query SEM a página (a página entra no fim) */
  queryKey: QueryKey;
  buscar: (pagina: number) => Promise<T>;
  ligado?: boolean;
}) {
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ chave, filtro, total: totalLido });
  const q = useQuery({
    queryKey: [...queryKey, pagina],
    queryFn: () => buscar(pagina),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled: ligado,
  });
  const totalDaResposta = q.data && !q.isPlaceholderData ? q.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  return { q, pagina, irPara, total: q.data?.total ?? 0 };
}

/** O valor `ms` depois que parou de mudar — a busca vai ao banco quando a pessoa para de digitar, não a cada letra. */
export function useAtrasado<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
