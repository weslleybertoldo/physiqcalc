import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Apple } from "lucide-react";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { GrupoBusca, ItemBusca } from "@/ui/premium/Busca";
import { MAX_RESULTADOS, useTermoComEspera } from "./_comum";

/**
 * Busca global (Ctrl K — NF10, W25): os ALIMENTOS da TACO e os seus (a MESMA consulta de Dietas › Alimentos — listarAlimentosDoPainel,
 * W24 —, carregada só na hora da busca para a casca continuar leve). Só para conta com o módulo Nutrição. Cada resultado abre
 * Dietas › Alimentos.
 */
export default function BuscaAlimentos({ termo, fechar }: { termo: string; fechar: () => void }) {
  const { conta } = useConta();
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const q = useTermoComEspera(termo);
  const uid = usuario?.id ?? "";
  const ligado = Boolean(q && uid && conta?.modulos.includes("nutricao"));
  const r = useQuery({
    queryKey: ["busca-global", "alimentos", uid, q],
    queryFn: async () => {
      const [{ listarAlimentosDoPainel }, { FILTROS_PADRAO }] = await Promise.all([
        import("@/painel/dietas/alimentosPainel"),
        import("@/nutricao/editor/lib/alimentosUtil"),
      ]);
      return (await listarAlimentosDoPainel({ ...FILTROS_PADRAO, q }, uid, 0, MAX_RESULTADOS)).itens;
    },
    enabled: ligado,
    staleTime: 60_000,
    retry: 0,
  });
  const itens = ligado ? r.data ?? [] : [];
  if (!itens.length) return null;
  return (
    <GrupoBusca titulo="Alimentos">
      {itens.map((a) => (
        <ItemBusca
          key={a.id}
          icone={Apple}
          rotulo={a.nome}
          detalhe={a.fonte === "taco" ? "TACO" : a.marca ? `seu · ${a.marca}` : "seu alimento"}
          palavras={[termo, a.id]}
          aoEscolher={() => {
            fechar();
            navigate("/painel/dietas?aba=alimentos");
          }}
        />
      ))}
    </GrupoBusca>
  );
}
