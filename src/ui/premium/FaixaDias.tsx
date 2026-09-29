import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** feito = treinou (violeta + ✓) · hoje = destaque branco · treino = tem treino marcado (ponto) · livre = sem treino (apagado) */
export type EstadoDia = "feito" | "hoje" | "treino" | "livre";

export interface Dia {
  chave: string;
  rotulo: string; // "Seg"
  numero: string | number; // 13
  estado: EstadoDia;
}

/** Faixa Seg–Dom da tela 2 (`.days7`): 7 dias de 44 × 62, raio 16. */
export function FaixaDias({ dias, selecionado, aoEscolher, className }: { dias: Dia[]; selecionado?: string; aoEscolher?: (chave: string) => void; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-1", className)} role="list" aria-label="Dias da semana">
      {dias.map((d) => {
        const hoje = d.estado === "hoje";
        return (
          <button
            key={d.chave}
            type="button"
            role="listitem"
            aria-current={hoje ? "date" : undefined}
            aria-pressed={selecionado === d.chave || undefined}
            onClick={() => aoEscolher?.(d.chave)}
            className={cn(
              "flex h-[62px] w-[44px] flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-semibold transition-colors",
              d.estado === "feito" && "border-violeta/30 bg-violeta/12 text-texto-2",
              hoje && "border-transparent text-texto-4",
              d.estado === "treino" && "border-linha bg-superficie text-texto-2",
              d.estado === "livre" && "border-linha bg-superficie text-texto-2 opacity-55",
              selecionado === d.chave && !hoje && "ring-1 ring-violeta-2",
            )}
            style={hoje ? { background: "var(--p-botao-w-fundo)", boxShadow: "var(--p-botao-w-sombra)" } : undefined}
          >
            {d.rotulo}
            <b className={cn("text-base font-semibold tabular-nums", hoje ? "text-[var(--p-botao-w-texto)]" : "text-forte")}>{d.numero}</b>
            {d.estado === "feito" ? (
              <Check aria-label="feito" className="h-[13px] w-[13px] text-violeta-2" strokeWidth={2.6} />
            ) : d.estado === "treino" ? (
              <i className="h-[5px] w-[5px] rounded-full bg-violeta" />
            ) : hoje ? (
              <i className="h-[5px] w-[5px] rounded-full" style={{ background: "var(--p-botao-w-texto)" }} />
            ) : (
              <i className="h-[5px]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
