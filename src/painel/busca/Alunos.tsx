import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { User } from "lucide-react";
import { useConta } from "@/nucleo/conta";
import { listarAlunos } from "@/painel/alunos/api";
import { FILTROS_PADRAO, rotaDoAluno } from "@/painel/alunos/regras";
import { GrupoBusca, ItemBusca } from "@/ui/premium/Busca";
import { MAX_RESULTADOS, useTermoComEspera } from "./_comum";
import { ErroNaBusca } from "./_ErroNaBusca";

/**
 * Busca global (Ctrl K — NF10, W25): os ALUNOS da conta ativa que você vê (a mesma busca da página Alunos — nome, e-mail, telefone,
 * tag — com a regra P1 da lista; ativos e desativados). Cada resultado abre o perfil do aluno.
 * hml-17 (H-39): a busca falhou → a linha "Não deu para buscar alunos agora" (tocar refaz), nunca o grupo sumindo calado.
 */
export default function BuscaAlunos({ termo, fechar }: { termo: string; fechar: () => void }) {
  const { conta } = useConta();
  const navigate = useNavigate();
  const q = useTermoComEspera(termo);
  const contaId = conta?.id ?? "";
  const r = useQuery({
    queryKey: ["busca-global", "alunos", contaId, q],
    queryFn: () => listarAlunos(contaId, { ...FILTROS_PADRAO, q, situacao: "todos" }, 0, MAX_RESULTADOS),
    enabled: Boolean(contaId && q),
    staleTime: 30_000,
    retry: 0,
  });
  if (q && contaId && r.isError && !r.data) return <ErroNaBusca titulo="Alunos" oque="alunos" termo={termo} tentar={() => void r.refetch()} />;
  const itens = q ? r.data?.itens ?? [] : [];
  if (!itens.length) return null;
  return (
    <GrupoBusca titulo="Alunos">
      {itens.map((a) => (
        <ItemBusca
          key={a.id}
          icone={User}
          rotulo={a.nome}
          detalhe={!a.ativo ? "desativado" : a.modulos.map((m) => (m === "treino" ? "Treino" : "Nutrição")).join(" · ") || undefined}
          palavras={[termo, a.email ?? "", a.telefone ?? "", ...a.tags, a.id]}
          aoEscolher={() => {
            fechar();
            navigate(rotaDoAluno(a));
          }}
        />
      ))}
    </GrupoBusca>
  );
}
