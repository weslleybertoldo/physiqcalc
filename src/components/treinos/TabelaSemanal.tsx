import { CheckCircle2 } from "lucide-react";

interface TreinoSlot {
  slot_idx: number;
  grupoNome: string;
  concluido: boolean;
}

interface DiaInfo {
  dateKey: string;
  dateLabel: string;
  diaSemana: string;
  treinos: TreinoSlot[];
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
        const visible = dia.treinos.slice(0, maxVisible);
        const remaining = dia.treinos.length - maxVisible;

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
              {dia.treinos.length > 0 ? (
                <>
                  {visible.map((t) => (
                    <span
                      key={t.slot_idx}
                      className={`text-[9px] sm:text-[10px] font-heading truncate w-full text-center ${
                        t.concluido ? "text-classify-green" : "text-primary"
                      }`}
                    >
                      {t.grupoNome}
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
