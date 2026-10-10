import { useConta } from "@/nucleo/conta";
import { useResumoAlunos } from "@/painel/alunos/useResumoAlunos";

/**
 * Número do item "Alunos" do menu (W13; lição da W10 — número = tela): o total da página Alunos no filtro padrão "Ativos"
 * (ativos, fora da lixeira, sem bloqueio) com a regra P1 — o dono conta todos os alunos da conta; o membro, só os seus. É a mesma
 * consulta da lista (alunos_da_conta com 0 linhas). Enquanto carrega, 0 (o menu não mostra número nenhum, nem o de outra fonte).
 * hml-17 (H-53): a MESMA consulta do Dashboard e da Pré-consulta (useResumoAlunos) — 1 pedido no /painel, não 2.
 */
export default function useContadorAlunos(): number | undefined {
  const { conta } = useConta();
  const q = useResumoAlunos(conta?.id);
  if (!conta?.id) return undefined;
  return q.data?.total ?? 0;
}
