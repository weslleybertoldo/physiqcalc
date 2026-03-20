import { CheckCircle2 } from "lucide-react";

interface DiaInfo {
  dateKey: string;
  dateLabel: string;
  diaSemana: string;
  grupoNome: string | null;
  exercicios: { nome: string; emoji: string }[];
  concluido: boolean;
  isToday: boolean;
}

interface Props {
  dias: DiaInfo[];
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
}

const TabelaSemanal = ({ dias, selectedDate, onSelectDate }: Props) => {
  return (
    <div className="grid grid-cols-7 gap-1">
      {dias.map((dia) => {
        const isSelected = dia.dateKey === selectedDate;
        const maxVisible = 3;
        const visible = dia.exercicios.slice(0, maxVisible);
        const remaining = dia.exercicios.length - maxVisible;

        return (
          <button
            key={dia.dateKey}
            type="button"
            onClick={() => onSelectDate(dia.dateKey)}
            className={`flex flex-col items-center p-1.5 sm:p-2 border transition-colors min-h-[100px] sm:min-h-[120px] ${
              isSelected
                ? "border-primary bg-primary/5"
                : dia.isToday
                ? "border-primary/50"
                : "border-muted-foreground/20"
            } ${dia.concluido ? "bg-classify-green/5" : ""}`}
          >
            <p className={`text-[10px] sm:text-xs font-heading ${dia.isToday ? "text-primary" : "text-muted-foreground"}`}>
              {dia.diaSemana}
            </p>
            <p className={`text-xs sm:text-sm font-heading ${dia.isToday ? "text-primary" : "text-foreground"}`}>
              {dia.dateLabel}
            </p>

            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 mt-1 w-full">
              {dia.grupoNome ? (
                <>
                  <p className="text-[8px] sm:text-[10px] text-primary font-heading truncate w-full text-center">
                    {dia.grupoNome}
                  </p>
                  {visible.map((ex, i) => (
                    <span key={i} className="text-[9px] sm:text-[10px] text-muted-foreground font-body truncate w-full text-center">
                      {ex.emoji} {ex.nome}
                    </span>
                  ))}
                  {remaining > 0 && (
                    <span className="text-[8px] text-muted-foreground/60 font-body">+{remaining} mais</span>
                  )}
                </>
              ) : (
                <span className="text-[9px] text-muted-foreground/40 font-body">—</span>
              )}
            </div>

            {dia.concluido && (
              <CheckCircle2 size={12} className="text-classify-green mt-1" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TabelaSemanal;
