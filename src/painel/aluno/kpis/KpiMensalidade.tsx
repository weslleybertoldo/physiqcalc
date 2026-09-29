import { Clock, TrendingUp, TriangleAlert } from "lucide-react";
import { dataBR, estadoDaMensalidade, reaisCurto } from "@/financeiro/regras";
import { useFinanceiroDoAluno } from "@/financeiro/ui/useFinanceiroDoAluno";
import { KpiCompacto } from "@/ui/premium/Kpi";

/**
 * Número "Mensalidade" do cabeçalho do aluno (tela 7: "R$ 249 · vence em 19/07"). Só para quem mexe na mensalidade (o dono da
 * conta — P6); sem mensalidade, "sem cobrança".
 */
export default function KpiMensalidade({ alunoId }: { alunoId: string }) {
  const f = useFinanceiroDoAluno(alunoId);
  const d = f.data;
  if (!d || !d.permissoes.mensalidade) return null;
  const m = d.mensalidade;
  if (!m) return <KpiCompacto rotulo="Mensalidade" valor="—" detalhe="sem cobrança" tomDetalhe="neutro" />;
  const aguardando = d.cobrancas.some((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao");
  const e = estadoDaMensalidade({ valor: m.valor, pausada: m.pausada, pago_ate: m.pago_ate, desde: m.desde, aguardando });
  const detalhe =
    e.situacao === "pausada" ? { t: "cobrança parada", tom: "neutro" as const, i: undefined }
      : e.situacao === "aguardando" ? { t: "comprovante p/ conferir", tom: "ambar" as const, i: Clock }
        : e.situacao === "em_dia" ? { t: `pago até ${dataBR(e.vence)}`, tom: "verde" as const, i: TrendingUp }
          : e.situacao === "vence_em_breve" ? { t: `vence em ${dataBR(e.vence)}`, tom: "ambar" as const, i: Clock }
            : e.situacao === "vencida" ? { t: `venceu em ${dataBR(e.vence)}`, tom: "rosa" as const, i: TriangleAlert }
              : { t: "pendente", tom: "rosa" as const, i: TriangleAlert };
  return (
    <span data-kpi-mensalidade={e.situacao}>
      <KpiCompacto rotulo="Mensalidade" valor={reaisCurto(m.valor)} detalhe={detalhe.t} icone={detalhe.i} tomDetalhe={detalhe.tom} />
    </span>
  );
}
