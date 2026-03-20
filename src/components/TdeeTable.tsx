import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TdeeTableProps {
  tmb: number | null;
  selectedFactor?: number | null;
  onSelectFactor?: (factor: number) => void;
}

const levels = [
  {
    label: "Sedentário",
    factor: 1.2,
    tip: "Não pratica atividade física. Trabalho de escritório ou atividades do dia a dia com mínimo de movimento corporal.",
  },
  {
    label: "Levemente ativo",
    factor: 1.375,
    tip: "Pratica exercícios leves 1 a 3 vezes por semana, como caminhadas, yoga ou treinos curtos de baixa intensidade.",
  },
  {
    label: "Moderadamente ativo",
    factor: 1.55,
    tip: "Treina de 3 a 5 vezes por semana com intensidade moderada. Perfil típico de quem frequenta academia regularmente.",
  },
  {
    label: "Muito ativo",
    factor: 1.725,
    tip: "Treina de 6 a 7 vezes por semana com alta intensidade, ou tem trabalho físico pesado além dos treinos.",
  },
  {
    label: "Atleta / dupla sessão",
    factor: 1.9,
    tip: "Treino duas vezes ao dia ou atleta de alto rendimento em período de preparação intensa para competição.",
  },
];

export { levels };

const TdeeTable = ({ tmb, selectedFactor, onSelectFactor }: TdeeTableProps) => {
  if (!tmb) return null;

  return (
    <div className="mt-8 space-y-3">
      <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">
        TDEE — Gasto Energético Diário
      </h3>
      {onSelectFactor && (
        <p className="text-xs text-muted-foreground font-body">
          Clique em um nível para usar na aba de Macronutrientes.
        </p>
      )}
      <div className="space-y-0">
        {levels.map((l) => {
          const isSelected = selectedFactor === l.factor;
          return (
            <Tooltip key={l.label}>
              <TooltipTrigger asChild>
                <div
                  onClick={() => onSelectFactor?.(l.factor)}
                  className={`flex items-center justify-between py-3 px-2 border-b border-muted-foreground/30 transition-colors duration-200 hover:bg-muted/20 ${
                    onSelectFactor ? "cursor-pointer" : "cursor-help"
                  } ${isSelected ? "bg-primary/10 border-primary/50" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {onSelectFactor && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-200 ${
                          isSelected ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                    )}
                    <span className="font-body text-sm text-foreground/80">{l.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-heading text-lg ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {Math.round(tmb * l.factor)}
                    </span>
                    <span className="text-xs text-muted-foreground">kcal</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs bg-[hsl(0,0%,10%)] border border-primary/40 text-foreground text-xs font-body leading-relaxed px-4 py-3 rounded-md shadow-lg animate-fade-in"
              >
                {l.tip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default TdeeTable;
