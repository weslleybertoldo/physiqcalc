import { Activity, Flame, Minus, Scale, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Cartao } from "@/ui/premium/Cartao";
import { num, variacaoAbs } from "../formato";
import type { Kpi } from "../serie";
import { COR_DO_TOM } from "./tons";

const ICONES: LucideIcon[] = [Scale, Flame, Activity];

/** Seta da variação (tela 4: ↘ desceu · ↗ subiu · — igual). */
export function SetaVariacao({ delta, className }: { delta: number | null; className?: string }) {
  const Icone = delta === null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return <Icone aria-hidden className={cn("h-[13px] w-[13px] flex-none", className)} strokeWidth={2.4} />;
}

/** Os 3 cards do topo da tela 4 (Peso, Gordura, Músculo): o valor mais recente e a variação do período. */
export function CardsMetricas({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-3 gap-[9px]" data-evolucao-kpis>
      {kpis.map((k, i) => (
        <CardMetrica key={k.metrica} kpi={k} icone={ICONES[i] ?? Activity} />
      ))}
    </div>
  );
}

export function CardMetrica({ kpi, icone: Icone }: { kpi: Kpi; icone: LucideIcon }) {
  return (
    <Cartao className="flex h-[98px] min-w-0 flex-col px-3 py-[11px]" data-kpi-evolucao={kpi.metrica} data-kpi-valor={kpi.valor ?? ""}>
      <div className="flex items-center gap-1.5 truncate text-[11.5px] font-medium text-texto-2">
        <Icone aria-hidden className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
        <span className="truncate">{kpi.titulo}</span>
      </div>
      <b className="mt-auto truncate text-[19px] font-bold tabular-nums tracking-[-0.02em] text-texto">
        {num(kpi.valor, kpi.casas)}
        {kpi.valor !== null && <small className="ml-1 text-[12px] font-semibold text-texto-2">{kpi.unidade}</small>}
      </b>
      <div className={cn("mt-[3px] flex items-center gap-[3px] text-[11.5px] font-semibold tabular-nums", COR_DO_TOM[kpi.tom])} data-kpi-variacao={kpi.variacao ?? ""}>
        {kpi.variacao === null ? (
          <span className="font-medium text-texto-3">{kpi.valor === null ? "sem dado" : "sem variação"}</span>
        ) : (
          <>
            <SetaVariacao delta={kpi.variacao} />
            {variacaoAbs(kpi.variacao, kpi.casas)} {kpi.unidadeVariacao}
          </>
        )}
      </div>
    </Cartao>
  );
}
