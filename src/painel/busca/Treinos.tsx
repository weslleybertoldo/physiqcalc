import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useConta } from "@/nucleo/conta";
import { GrupoBusca, ItemBusca } from "@/ui/premium/Busca";
import { MAX_RESULTADOS, useTermoComEspera } from "./_comum";

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
      const { data, error } = await (supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>)("tb_grupos_treino")
        .select("id, nome, professor_id")
        .or(`professor_id.is.null,professor_id.eq.${meuId}`)
        .ilike("nome", `%${literal(q)}%`)
        .order("nome")
        .limit(MAX_RESULTADOS);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TreinoAchado[];
    },
    enabled: ligado,
    staleTime: 30_000,
    retry: 0,
  });
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
