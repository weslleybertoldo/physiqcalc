import { useQuery } from "@tanstack/react-query";
import { listarAlunos } from "./api";
import { FILTROS_PADRAO } from "./regras";

/**
 * hml-17 (H-53): o total de alunos da conta no filtro padrão (a página Alunos com 0 linhas: alunos_da_conta, regra P1) — UMA
 * consulta para quem pede o mesmo: o número do menu (src/painel/contadores/Alunos.ts), o Dashboard e o "Cadastrar aluno" da
 * Pré-consulta. Antes eram 3 chaves para o mesmo pedido (no /painel saíam 2 pedidos idênticos). A chave é a que a página Alunos e o
 * perfil do aluno já invalidam quando a lista muda.
 */
export const chaveResumoAlunos = (contaId: string) => ["alunos-contador", contaId] as const;

export function useResumoAlunos(contaId: string | null | undefined) {
  return useQuery({
    queryKey: chaveResumoAlunos(contaId ?? ""),
    queryFn: () => listarAlunos(contaId!, FILTROS_PADRAO, 0, 0),
    enabled: Boolean(contaId),
    staleTime: 60_000,
    retry: 1,
  });
}
