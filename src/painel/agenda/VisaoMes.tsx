// Physiq W20 — visão MÊS (porta da VisaoMes do PhysiqNutri no visual premium): grade de 6 semanas (domingo primeiro). Clique no
// dia = novo agendamento nele; clique no chip = abrir. Dia bloqueado fica hachurado; dia sem atendimento, apagado.
import { format, isSameDay, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { DIAS_CURTOS, type RegrasAgenda } from "@/agenda/regras";
import ChipEvento from "./ChipEvento";
import { bloqueiosDoDia, chaveDia, diasDaGrade, eventosDoDia, type BloqueioPainel, type EventoPainel } from "./visao";

interface Props {
  ancora: Date;
  eventos: EventoPainel[];
  bloqueios: BloqueioPainel[];
  regras: RegrasAgenda;
  hoje?: Date;
  onNovo: (dia: Date) => void;
  onAbrir: (ev: EventoPainel) => void;
}

const HACHURA = "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(255,255,255,.06)_6px,rgba(255,255,255,.06)_7px)]";
const MAX_CHIPS = 3;

export default function VisaoMes({ ancora, eventos, bloqueios, regras, hoje = new Date(), onNovo, onAbrir }: Props) {
  const dias = diasDaGrade(ancora);
  return (
    <div className="pq-cartao overflow-hidden p-0" data-visao="mes">
      <div className="grid grid-cols-7 border-b border-linha">
        {DIAS_CURTOS.map((d, i) => (
          <div key={d} className={cn("px-2 py-2.5 text-center text-[12px] font-semibold", regras.dias.includes(i) ? "text-texto-2" : "text-texto-4")}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => {
          const doMes = isSameMonth(dia, ancora);
          const ehHoje = isSameDay(dia, hoje);
          const evs = eventosDoDia(eventos, dia);
          const bls = bloqueiosDoDia(bloqueios, dia);
          const visiveis = evs.slice(0, MAX_CHIPS);
          const extra = evs.length - visiveis.length;
          const atende = regras.dias.includes(dia.getDay());
          return (
            <div
              key={chaveDia(dia)}
              role="button"
              tabIndex={0}
              onClick={() => onNovo(dia)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) onNovo(dia);
              }}
              className={cn(
                "min-h-[104px] cursor-pointer border-b border-r border-linha-3 p-1.5 text-left transition-colors hover:bg-[rgba(167,139,250,.06)] focus:outline-none focus-visible:ring-1 focus-visible:ring-violeta-2",
                !doMes && "opacity-45",
                !atende && "bg-[rgba(0,0,0,.22)]",
                i % 7 === 6 && "border-r-0",
                i >= 35 && "border-b-0",
                bls.length > 0 && HACHURA,
              )}
              data-dia={chaveDia(dia)}
              data-fora-do-mes={doMes ? undefined : "1"}
              aria-label={`${format(dia, "dd/MM")}: ${evs.length} agendamento(s)`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums",
                  ehHoje ? "bg-[var(--p-botao-w-fundo)] text-[var(--p-botao-w-texto)]" : "text-texto-2")} data-hoje={ehHoje ? "1" : undefined}>
                  {format(dia, "d")}
                </span>
                {bls.length > 0 && (
                  <span className="truncate text-[9.5px] font-semibold uppercase tracking-wide text-texto-4" title={bls.map((b) => b.motivo ?? "Bloqueado").join(", ")} data-bloqueio={bls[0].id}>
                    {bls[0].motivo ?? "bloqueado"}
                  </span>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {visiveis.map((ev) => (
                  <li key={ev.id}><ChipEvento ev={ev} onAbrir={onAbrir} compacto inicialDaTag /></li>
                ))}
                {extra > 0 && <li className="px-1 text-[10px] text-texto-3" data-mais={extra}>+{extra} mais</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
