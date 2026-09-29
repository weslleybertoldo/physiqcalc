import { cn } from "@/lib/utils";

export interface OpcaoSegmentado<T extends string> {
  valor: T;
  rotulo: string;
}

/** Seletor segmentado (`.seg`: 3M · 6M · 1A da tela 4; 30D · 6M · Ano da tela 6). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  className,
  rotulo = "Período",
}: {
  opcoes: OpcaoSegmentado<T>[];
  valor: T;
  aoMudar: (v: T) => void;
  className?: string;
  rotulo?: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={cn("inline-flex rounded-xl border border-linha bg-superficie p-[3px]", className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => aoMudar(o.valor)}
            className={cn(
              "rounded-[9px] px-[11px] py-1.5 text-xs font-semibold transition-colors",
              ativo ? "text-[var(--p-botao-w-texto)]" : "text-texto-2 hover:text-texto",
            )}
            style={ativo ? { background: "var(--p-botao-w-fundo)" } : undefined}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
