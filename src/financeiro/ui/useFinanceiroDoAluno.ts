import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { paginaValida, type Pagina } from "@/lib/paginacao";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
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
    // as páginas das cobranças ("Ver todas") moram debaixo da mesma chave
    await qc.invalidateQueries({ queryKey: chaveFinanceiroDoAluno(alunoId) });
    await qc.invalidateQueries({ queryKey: ["financeiro-resumo-conta"] });
    // hml-14d: confirmar/registrar pode lançar a entrada — as páginas e os totais dos lançamentos são do id da matrícula (a rota pode
    // ser o do Treino): todos
    await qc.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
    await qc.invalidateQueries({ queryKey: ["financeiro-totais-aluno"] });
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

/**
 * hml-14d (B21 · D31 · P7): uma lista do Financeiro do aluno (cobranças, lançamentos, recibos) em páginas de 20 do banco, com o total —
 * o "Ver todos (N)" dos cartões. Na aba Financeiro a página fica no endereço (`?pagina_<lista>=`, `chave`); no painel "Cobrança" da
 * aba Mensalidades (`compacto`: uma folha) fica no estado da folha (fechar volta à 1). A página além do fim (a lista encolheu) vai
 * para a última. Erro do banco: `q.isError` (a tela mostra o erro, nunca a lista vazia).
 */
export function usePaginaDoAluno<T>({ chave, compacto, queryKey, ler, ativo = true }: {
  chave: string;
  compacto: boolean;
  queryKey: QueryKey;
  ler: (pagina: number) => Promise<Pagina<T>>;
  ativo?: boolean;
}) {
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const naUrl = usePaginaNaUrl({ chave, total: compacto ? null : totalLido });
  const [local, setLocal] = useState(1);
  const pagina = compacto ? (totalLido === null ? local : paginaValida(local, totalLido)) : naUrl.pagina;
  const irPara = compacto ? setLocal : naUrl.irPara;
  const q = useQuery({
    queryKey: [...queryKey, pagina],
    queryFn: () => ler(pagina),
    enabled: ativo,
    // a página anterior segura o cartão enquanto a nova chega — só da MESMA lista (outro aluno não)
    placeholderData: (anterior, consulta) => (consulta && JSON.stringify(consulta.queryKey.slice(0, -1)) === JSON.stringify(queryKey) ? anterior : undefined),
    staleTime: 30_000,
    retry: 1,
    networkMode: "online",
  });
  const totalDaResposta = q.data && !q.isPlaceholderData ? q.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  return { q, pagina, irPara, total: q.data?.total ?? null };
}
