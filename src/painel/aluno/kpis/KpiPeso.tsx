import { useMemo } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { num } from "@/evolucao/formato";
import { hojeSP, kpisDaSerie } from "@/evolucao/serie";
import { KpiCompacto } from "@/ui/premium/Kpi";
import { DETALHE_KPI_PARCIAL, detalheDoKpi, tomDoKpi } from "../avaliacao/regras";
import { useAvaliacaoDoAluno } from "../avaliacao/useAvaliacaoDoAluno";

/**
 * Número "Peso" do cabeçalho do aluno (tela 7: "84,2 kg · ↘ 6,1 kg em 6 meses" — W17): o peso da avaliação mais recente dos 2
 * bancos e a variação dos últimos 6 meses — a mesma conta do card Peso da Evolução do aluno (W10) e da aba Avaliação. A cor segue
 * o objetivo da matrícula (emagrecer: descer é bom). Sem avaliação com peso, não aparece. hml-26 (H-128): com uma parte da série em
 * erro, "—" + "dado parcial" (nunca a conta com metade da série) até a parte voltar — ela é buscada de novo sozinha.
 */
export default function KpiPeso({ alunoId }: { alunoId: string }) {
  const { serie, parcial } = useAvaliacaoDoAluno(alunoId);
  const k = useMemo(() => (serie && !parcial ? kpisDaSerie(serie, "6m", hojeSP())[0] : null), [serie, parcial]);
  if (parcial) {
    return (
      <span data-kpi-parcial="peso">
        <KpiCompacto rotulo="Peso" valor="—" detalhe={DETALHE_KPI_PARCIAL} tomDetalhe="neutro" />
      </span>
    );
  }
  if (!k || k.valor === null) return null;
  const Icone = k.variacao === null || Math.abs(k.variacao) < 0.05 ? Minus : k.variacao > 0 ? TrendingUp : TrendingDown;
  const detalhe = detalheDoKpi(k);
  return (
    <span data-kpi-peso={k.valor} data-kpi-peso-variacao={k.variacao ?? ""}>
      <KpiCompacto rotulo="Peso" valor={`${num(k.valor, k.casas)} ${k.unidade}`} detalhe={detalhe ?? "sem variação em 6 meses"}
        icone={detalhe ? Icone : undefined} tomDetalhe={detalhe ? tomDoKpi(k) : "neutro"} />
    </span>
  );
}
