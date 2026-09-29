import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { acaoFinanceiro, buscarFinanceiroDoAluno, ErroFinanceiro } from "../api";
import { mensagemErroFinanceiro } from "../regras";

export const chaveFinanceiroDoAluno = (alunoId: string) => ["financeiro-aluno", alunoId] as const;

/**
 * O Financeiro de um aluno no painel (prof_aluno da pagamentos-aluno): a aba Financeiro, o card do Resumo e o KPI do
 * cabeçalho dividem a mesma consulta. `agir` roda uma ação e recarrega tudo (e as listas antigas do Calc, que leem a mesma coisa).
 */
export function useFinanceiroDoAluno(alunoId: string, ativo = true) {
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: chaveFinanceiroDoAluno(alunoId),
    queryFn: () => buscarFinanceiroDoAluno(alunoId),
    enabled: ativo && !!alunoId,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof ErroFinanceiro && ["sem_permissao", "aluno_inexistente", "aluno_invalido"].includes(e.codigo)) && n < 1,
    networkMode: "online",
  });

  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: chaveFinanceiroDoAluno(alunoId) });
    await qc.invalidateQueries({ queryKey: ["financeiro-resumo-conta"] });
    await qc.invalidateQueries({ queryKey: ["financeiro-lancamentos", alunoId] });
  };

  const agir = async <T = Record<string, unknown>>(acao: string, corpo: Record<string, unknown>, ok?: string): Promise<T | null> => {
    try {
      const r = await acaoFinanceiro<T>(acao, corpo);
      if (ok) toast.success(ok);
      await recarregar();
      return r;
    } catch (e) {
      toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null));
      return null;
    }
  };

  return { ...consulta, recarregar, agir };
}
