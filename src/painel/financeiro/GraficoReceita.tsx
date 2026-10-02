// Physiq W19 — o cartão "Receita" da tela 6 (N-9 "Receita por mês"): título com o chip da variação, 30D · 6M · Ano, "Recebido em
// <mês>" e "Previsto até o fim do mês", e a área verde com os meses embaixo e o ponto de hoje. O recebido junta os lançamentos e as
// cobranças pagas sem lançamento (resumo.ts). Peça do Financeiro que o Dashboard (W25) pode usar igual.
import { useMemo, useState, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area } from "@/ui/premium/Area";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoVazio } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";
import { fmtBRL } from "./financeiroUtil";
import { PERIODOS_GRAFICO, nomeDoMesLongo, serieReceita, type PeriodoGrafico, type Recebimento } from "./resumo";

export default function GraficoReceita({ recs, hoje, recebidoMes, previstoMes, extra, className }: {
  recs: Recebimento[];
  hoje: string;
  recebidoMes: number;
  previstoMes: number;
  /** H4: um número a mais na linha do "Recebido · Previsto" (o Dashboard põe os "Recibos no mês"); o Financeiro não passa */
  extra?: ReactNode;
  className?: string;
}) {
  const [periodo, setPeriodo] = useState<PeriodoGrafico>("6m");
  const s = useMemo(() => serieReceita(recs, hoje, periodo), [recs, hoje, periodo]);
  const temDados = s.pontos.some((v) => v > 0);
  const subiu = (s.variacao ?? 0) >= 0;
  return (
    <Cartao brilho className={`flex flex-col px-[22px] pb-3 pt-[18px] ${className ?? ""}`} data-cartao-receita data-periodo-grafico={periodo} data-receita-total={s.total.toFixed(2)}>
      <CabecalhoCartao
        titulo="Receita"
        extra={s.textoVariacao ? (
          <Chip tom={subiu ? "n" : "r"} icone={subiu ? TrendingUp : TrendingDown} data-receita-variacao={s.variacao}>{s.textoVariacao}</Chip>
        ) : undefined}
        acao={<Segmentado<PeriodoGrafico> opcoes={PERIODOS_GRAFICO} valor={periodo} aoMudar={(p) => setPeriodo(p)} rotulo="Período da receita" />}
      />
      <div className="mt-1 flex flex-wrap gap-x-10 gap-y-2">
        <div>
          <div className="text-[12.5px] text-texto-2">Recebido em {nomeDoMesLongo(hoje)}</div>
          <b className="text-[26px] font-bold tabular-nums tracking-[-0.03em] text-texto" data-receita-recebido-mes={recebidoMes.toFixed(2)}>{fmtBRL(recebidoMes)}</b>
        </div>
        <div>
          <div className="text-[12.5px] text-texto-2">Previsto até o fim do mês</div>
          <b className="text-[26px] font-bold tabular-nums tracking-[-0.03em] text-texto-2" data-receita-previsto={previstoMes.toFixed(2)}>{fmtBRL(previstoMes)}</b>
        </div>
        {extra}
      </div>
      <div className="mt-3 min-h-[180px] flex-1" data-grafico-receita={s.pontos.length}>
        {temDados ? (
          <Area valores={s.pontos} rotulos={s.rotulos} largura={640} altura={228} min={0} grade={4} pontoFinal responsivo cor="var(--p-verde-2)" rotulo="Receita por mês" />
        ) : (
          <EstadoVazio className="my-6" titulo="Nenhuma entrada no período" texto="As entradas dos lançamentos e as mensalidades pagas aparecem aqui." />
        )}
      </div>
    </Cartao>
  );
}
