import { useMemo } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { num } from "@/evolucao/formato";
import { hojeSP, kpisDaSerie } from "@/evolucao/serie";
import { KpiCompacto } from "@/ui/premium/Kpi";
import { detalheDoKpi, tomDoKpi } from "../avaliacao/regras";
import { useAvaliacaoDoAluno } from "../avaliacao/useAvaliacaoDoAluno";

/**
 * Número "Gordura" do cabeçalho do aluno (tela 7: "17,8% · ↘ 4,6 pontos" — W17): o % de gordura da avaliação mais recente dos 2
 * bancos (dobras, bioimpedância ou antropometria) e a variação em pontos nos últimos 6 meses (descer é bom). Sem % de gordura, não
 * aparece.
 */
export default function KpiGordura({ alunoId }: { alunoId: string }) {
  const { serie } = useAvaliacaoDoAluno(alunoId);
  const k = useMemo(() => (serie ? kpisDaSerie(serie, "6m", hojeSP())[1] : null), [serie]);
  if (!k || k.valor === null) return null;
  const Icone = k.variacao === null || Math.abs(k.variacao) < 0.05 ? Minus : k.variacao > 0 ? TrendingUp : TrendingDown;
  const detalhe = detalheDoKpi(k);
  return (
    <span data-kpi-gordura={k.valor} data-kpi-gordura-variacao={k.variacao ?? ""}>
      <KpiCompacto rotulo="Gordura" valor={`${num(k.valor, k.casas)}%`} detalhe={detalhe ?? "sem variação em 6 meses"}
        icone={detalhe ? Icone : undefined} tomDetalhe={detalhe ? tomDoKpi(k) : "neutro"} />
    </span>
  );
}
