import { cn } from "@/lib/utils";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { semanaDoDia } from "../dia";

/**
 * Calendário da Dieta (ícone da tela 3; NF3): os 7 dias da semana — hoje em destaque — para ver o plano de outro dia quando ele
 * varia por dia da semana. Dia sem refeição fica apagado. O ✓ é só de hoje (a regra de hoje).
 */
export function SheetDia({
  aberto,
  aoMudar,
  hoje,
  selecionado,
  varia,
  refeicoesNoDia,
  aoEscolher,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  hoje: string;
  selecionado: string;
  varia: boolean;
  /** quantas refeições o plano tem em cada dia (yyyy-mm-dd → n) */
  refeicoesNoDia: (dia: string) => number;
  aoEscolher: (dia: string) => void;
}) {
  const semana = semanaDoDia(hoje);
  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Ver outro dia"
      descricao={varia ? "O seu plano muda conforme o dia da semana." : "O seu plano é o mesmo todos os dias."}
    >
      <div className="flex justify-between gap-1 pb-2" role="list" aria-label="Dias da semana" data-folha-dias>
        {semana.map((d) => {
          const eHoje = d.dia === hoje;
          const escolhido = d.dia === selecionado;
          const n = refeicoesNoDia(d.dia);
          return (
            <button
              key={d.dia}
              type="button"
              role="listitem"
              aria-current={eHoje ? "date" : undefined}
              aria-pressed={escolhido}
              onClick={() => aoEscolher(d.dia)}
              data-dia={d.dia}
              data-dia-refeicoes={n}
              className={cn(
                "flex h-[66px] w-[44px] flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-semibold transition-colors",
                eHoje ? "border-transparent" : "border-linha bg-superficie text-texto-2",
                !eHoje && n === 0 && "opacity-55",
                escolhido && !eHoje && "ring-1 ring-verde-2",
              )}
              style={eHoje ? { background: "var(--p-botao-w-fundo)", color: "var(--p-botao-w-texto)", boxShadow: "var(--p-botao-w-sombra)" } : undefined}
            >
              {d.rotulo}
              <b className={cn("text-base font-semibold tabular-nums", !eHoje && "text-forte")}>{d.numero}</b>
              <span className="text-[9.5px] font-medium opacity-80">{n === 0 ? "—" : `${n} ref.`}</span>
            </button>
          );
        })}
      </div>
    </PainelDeslizante>
  );
}
