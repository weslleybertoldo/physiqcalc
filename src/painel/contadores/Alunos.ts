import { useQuery } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { listarAlunos } from "@/painel/alunos/api";
import { FILTROS_PADRAO } from "@/painel/alunos/regras";

/**
 * Número do item "Alunos" do menu (W13; lição da W10 — número = tela): o total da página Alunos no filtro padrão "Ativos"
 * (ativos, fora da lixeira, sem bloqueio) com a regra P1 — o dono conta todos os alunos da conta; o membro, só os seus. É a mesma
 * consulta da lista (alunos_da_conta com 0 linhas). Enquanto carrega, 0 (o menu não mostra número nenhum, nem o de outra fonte).
 */
export default function useContadorAlunos(): number | undefined {
  const { conta } = useConta();
  const q = useQuery({
    queryKey: ["alunos-contador", conta?.id],
    queryFn: async () => (await listarAlunos(conta!.id, FILTROS_PADRAO, 0, 0)).total,
    enabled: Boolean(conta?.id),
    staleTime: 60_000,
    retry: 1,
  });
  if (!conta?.id) return undefined;
  return q.data ?? 0;
}
