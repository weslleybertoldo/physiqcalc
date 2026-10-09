// Physiq hml-14b (B19 · D16) — o que o SeletorDeAluno (e os diálogos que o usam) precisam do banco: a busca com espera que
// descarta resposta velha e o aluno já escolhido lido pelo id (no cache do React Query: quem escolhe na busca já guarda).
// `comCpf` = o campo do Recibo (imprime o CPF): só ele pede o CPF ao banco; o aluno com e sem CPF ficam em chaves separadas do cache.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { alunoDoSeletorPorId, buscarAlunosDoSeletor } from "./api";
import { ESPERA_SELETOR, LIMITE_SELETOR, termoDoSeletor, type AlunoDoSeletor, type SituacaoSeletor } from "./regras";

export const chaveAlunoDoSeletor = (contaId: string | null | undefined, id: string | null | undefined, comCpf = false) =>
  ["seletor-aluno", contaId ?? "", id ?? "", comCpf ? "com-cpf" : "sem-cpf"] as const;

/** O aluno escolhido, lido pelo id (só da conta). `data` null = não achou (removido, de outra conta ou sem acesso). */
export function useAlunoDoSeletor(contaId: string | null | undefined, id: string | null | undefined, comCpf = false) {
  return useQuery({
    queryKey: chaveAlunoDoSeletor(contaId, id, comCpf),
    queryFn: () => alunoDoSeletorPorId(contaId as string, id as string, comCpf),
    enabled: Boolean(contaId && id),
    staleTime: 60_000,
    retry: 1,
  });
}

/** Guarda no cache o aluno que veio da busca: o useAlunoDoSeletor de quem usa já o recebe, sem ir ao banco de novo. */
export function useGuardarAlunoDoSeletor() {
  const qc = useQueryClient();
  return useCallback(
    (contaId: string | null | undefined, a: AlunoDoSeletor, comCpf = false) => qc.setQueryData(chaveAlunoDoSeletor(contaId, a.id, comCpf), a),
    [qc],
  );
}

export interface ResultadoDaBusca {
  contaId: string;
  /** o termo que o banco respondeu (já normalizado) */
  termo: string;
  itens: AlunoDoSeletor[];
  /** quantos alunos o filtro tem no banco (o "20 de N") */
  total: number;
}

/**
 * A busca do seletor: espera `espera` ms depois da última tecla (ao abrir a lista, sai na hora), pede ao banco os 20
 * primeiros e o total e DESCARTA resposta velha — cada pedido leva um número e só o último muda a tela (digitar rápido nunca
 * deixa o resultado de um termo antigo por cima do novo).
 */
export function useBuscaDeAlunos({
  contaId,
  termo,
  situacao,
  ligada,
  espera = ESPERA_SELETOR,
  comCpf = false,
}: {
  contaId: string | null | undefined;
  termo: string;
  situacao: SituacaoSeletor;
  /** a lista está à vista (fechada não busca) */
  ligada: boolean;
  espera?: number;
  /** só o Recibo: o CPF (e o apelido) vêm na busca */
  comCpf?: boolean;
}) {
  const [resultado, setResultado] = useState<ResultadoDaBusca | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [buscando, setBuscando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const pedido = useRef(0);
  const ligadaAntes = useRef(false);
  const q = termoDoSeletor(termo);

  useEffect(() => {
    // a lista acabou de abrir: busca na hora; digitando: espera a pessoa parar
    const acabouDeAbrir = ligada && !ligadaAntes.current;
    ligadaAntes.current = ligada;
    if (!ligada || !contaId) return;
    const meu = ++pedido.current;
    setBuscando(true);
    const atraso = acabouDeAbrir ? 0 : espera;
    const t = setTimeout(() => {
      setErro(null);
      buscarAlunosDoSeletor(contaId, q, situacao, LIMITE_SELETOR, comCpf).then(
        (r) => {
          if (meu !== pedido.current) return; // resposta velha: já saiu um pedido depois deste
          setResultado({ contaId, termo: q, itens: r.itens, total: r.total });
          setErro(null);
          setBuscando(false);
        },
        (e: unknown) => {
          if (meu !== pedido.current) return;
          setErro(e);
          setBuscando(false);
        },
      );
    }, atraso);
    return () => clearTimeout(t);
  }, [contaId, q, situacao, ligada, espera, tentativa, comCpf]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return { resultado: resultado && resultado.contaId === contaId ? resultado : null, erro, buscando, tentarDeNovo };
}
