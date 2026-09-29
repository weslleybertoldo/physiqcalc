import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Cartao } from "./Cartao";
import { Sparkline } from "./Area";

/** Cores dos KPIs da tela 6: violeta (alunos), verde (receita), ciano (consultas), âmbar (adesão). */
export type TomKpi = "violeta" | "verde" | "ciano" | "ambar";

const TOM: Record<TomKpi, { fundo: string; texto: string; linha: string }> = {
  violeta: { fundo: "var(--p-chip-t-fundo)", texto: "var(--p-chip-t-texto)", linha: "var(--p-violeta-2)" },
  verde: { fundo: "var(--p-chip-n-fundo)", texto: "var(--p-chip-n-texto)", linha: "var(--p-verde-2)" },
  ciano: { fundo: "var(--p-chip-c-fundo)", texto: "var(--p-chip-c-texto)", linha: "var(--p-ciano)" },
  ambar: { fundo: "var(--p-chip-a-fundo)", texto: "var(--p-chip-a-texto)", linha: "var(--p-ambar-2)" },
};

/** Cartão de número (`.kpi`): ícone colorido, título, valor grande, detalhe e mini gráfico à direita. */
export function Kpi({
  icone: Icone,
  titulo,
  valor,
  detalhe,
  tom = "violeta",
  serie,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: TomKpi;
  serie?: number[];
  className?: string;
}) {
  const t = TOM[tom];
  return (
    <Cartao className={cn("h-[132px] overflow-hidden px-4 pb-3 pt-4", className)} data-kpi={titulo}>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-texto-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: t.fundo, color: t.texto }}>
          <Icone aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.75} />
        </span>
        {titulo}
      </div>
      <div className="mt-3 text-[30px] font-bold tabular-nums tracking-[-0.035em] text-texto">{valor}</div>
      {detalhe && <div className="mt-1 flex items-center gap-1.5 text-xs text-texto-2">{detalhe}</div>}
      {serie && serie.length > 1 && (
        <div className="absolute right-3.5 top-[50px]">
          <Sparkline valores={serie} cor={t.linha} />
        </div>
      )}
    </Cartao>
  );
}

/** Número pequeno do cabeçalho do aluno (`.hs` da tela 7): rótulo, valor e tendência. */
export function KpiCompacto({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tomDetalhe = "verde",
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: LucideIcon;
  tomDetalhe?: "verde" | "ambar" | "rosa" | "neutro";
}) {
  const cor = { verde: "text-verde-2", ambar: "text-ambar-3", rosa: "text-rosa-3", neutro: "text-texto-2" }[tomDetalhe];
  return (
    <div className="min-w-[138px] rounded-2xl border border-linha bg-superficie-3 px-3.5 py-[11px]" data-kpi-compacto={rotulo}>
      <div className="text-[11.5px] font-medium text-texto-2">{rotulo}</div>
      <b className="mt-[3px] block text-[19px] font-bold tabular-nums tracking-[-0.02em] text-texto">{valor}</b>
      {detalhe && (
        <div className={cn("mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold", cor)}>
          {Icone && <Icone aria-hidden className="h-[13px] w-[13px]" strokeWidth={2.4} />}
          {detalhe}
        </div>
      )}
    </div>
  );
}
