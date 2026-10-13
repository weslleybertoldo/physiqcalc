import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConta } from "@/nucleo/conta";
import { codigoDoTreino, lerTreinos } from "@/treino/servidor";
import { GrupoBusca, ItemBusca } from "@/ui/premium/Busca";
import { MAX_RESULTADOS, useTermoComEspera } from "./_comum";
import { ErroNaBusca } from "./_ErroNaBusca";

interface TreinoAchado {
  id: string;
  nome: string;
  professor_id: string | null;
}

/** "%" e "_" digitados são texto, não curinga do ilike. */
const literal = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Busca global (Ctrl K — NF10, W25): os TREINOS-MODELO que você vê no Painel › Treinos (os seus + os globais do Physiq — o mesmo
 * escopo da aba Meus treinos, W23), no Banco do Treino com a sua sessão do Treino. Só para conta com o módulo Treino e quem tem a
 * sessão do Treino (personal, dono, master). Cada resultado abre o treino em Treinos › Meus treinos.
 * hml-17 (H-39): a busca falhou → a linha "Não deu para buscar treinos agora" (tocar refaz), nunca o grupo sumindo calado.
 * hml-21d (H-43 · jeito 2): a leitura pela função treinos (busca_treinos: o mesmo ilike do literal, o "global ou meu" com o usuário do
 * token no servidor, por nome, os 6 primeiros) — a mesma chave, o mesmo erro.
 */
export default function BuscaTreinos({ termo, fechar }: { termo: string; fechar: () => void }) {
  const { conta } = useConta();
  const { user } = useAuth();
  const navigate = useNavigate();
  const q = useTermoComEspera(termo);
  const meuId = user?.id ?? "";
  const ligado = Boolean(q && meuId && conta?.modulos.includes("treino"));
  const r = useQuery({
    queryKey: ["busca-global", "treinos", meuId, q],
    queryFn: async () => {
      try {
        const { linhas } = await lerTreinos("busca_treinos", { termo: literal(q) });
        return (linhas ?? []).slice(0, MAX_RESULTADOS) as TreinoAchado[];
      } catch (e) {
        console.warn("[busca] treinos:", codigoDoTreino(e));
        throw new Error("Não deu para buscar os treinos agora.");
      }
    },
    enabled: ligado,
    staleTime: 30_000,
    retry: 0,
  });
  if (ligado && r.isError && !r.data) return <ErroNaBusca titulo="Treinos" oque="treinos" termo={termo} tentar={() => void r.refetch()} />;
  const itens = ligado ? r.data ?? [] : [];
  if (!itens.length) return null;
  return (
    <GrupoBusca titulo="Treinos">
      {itens.map((t) => (
        <ItemBusca
          key={t.id}
          icone={Dumbbell}
          rotulo={t.nome}
          detalhe={t.professor_id ? "seu treino" : "global do Physiq"}
          palavras={[termo, t.id]}
          aoEscolher={() => {
            fechar();
            navigate(`/painel/treinos?aba=treinos&treino=${encodeURIComponent(t.id)}`);
          }}
        />
      ))}
    </GrupoBusca>
  );
}
