// Physiq W20 — o evento nas visões (porta do ChipEvento do PhysiqNutri no visual premium): fundo = status (7), borda esquerda =
// confirmação (3), ponto = cor do calendário, letra do tipo (T/N) quando a consulta é de treino ou de nutrição (NF12).
// `stopPropagation`: o chip mora numa célula clicável (clicar na célula = novo agendamento ali).
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ESTILO_CONFIRMACAO, ESTILO_STATUS } from "@/agenda/regras";
import { faixaHora, formatarHora, nomeDoEvento, type EventoPainel } from "./visao";

interface Props {
  ev: EventoPainel;
  onAbrir: (ev: EventoPainel) => void;
  compacto?: boolean;
  estilo?: CSSProperties;
  className?: string;
}

export default function ChipEvento({ ev, onAbrir, compacto, estilo, className }: Props) {
  const st = ESTILO_STATUS[ev.status];
  const cf = ESTILO_CONFIRMACAO[ev.confirmacao];
  const { nome } = nomeDoEvento(ev);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAbrir(ev);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "w-full overflow-hidden rounded-[7px] border-l-[3px] px-1.5 py-[3px] text-left font-body text-[11px] font-medium leading-tight transition hover:brightness-125",
        st.fundo, st.texto, cf.borda, className,
      )}
      style={estilo}
      title={`${nome} · ${faixaHora(ev)} · ${st.rotulo}`}
      data-evento={ev.id}
      data-status={ev.status}
      data-confirmacao={ev.confirmacao}
      data-modulo={ev.modulo}
      data-calendario-evento={ev.calendarioId}
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle" style={{ background: ev.cor }} aria-hidden="true" />
      {!ev.diaInteiro && <span className={cn("mr-1 tabular-nums opacity-80", compacto && "hidden sm:inline")}>{formatarHora(ev.inicio)}</span>}
      {ev.modulo !== "geral" && (
        <span className={cn("mr-1 rounded-[4px] px-[3px] text-[9px] font-bold", ev.modulo === "treino" ? "bg-[rgba(139,92,246,.28)] text-violeta-3" : "bg-[rgba(16,185,129,.24)] text-verde-3")}>
          {ev.modulo === "treino" ? "T" : "N"}
        </span>
      )}
      <span className={cn(compacto ? "truncate" : "line-clamp-2")}>{nome}</span>
    </button>
  );
}
