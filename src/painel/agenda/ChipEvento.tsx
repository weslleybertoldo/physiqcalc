// Physiq W20 — o evento nas visões (porta do ChipEvento do PhysiqNutri no visual premium): fundo = status (7), borda esquerda =
// confirmação (3), ponto = cor do calendário. W2: a letra do tipo (T/N) virou a pílula da TAG na cor dela — o nome (na visão mês só
// a inicial; na semana, a inicial quando o chip é estreito, para o nome do aluno continuar cabendo; o nome inteiro fica no title).
// `stopPropagation`: o chip mora numa célula clicável (clicar na célula = novo agendamento ali).
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ESTILO_CONFIRMACAO, ESTILO_STATUS } from "@/agenda/regras";
import PilulaTag from "./PilulaTag";
import { faixaHora, formatarHora, nomeDoEvento, type EventoPainel } from "./visao";

interface Props {
  ev: EventoPainel;
  onAbrir: (ev: EventoPainel) => void;
  compacto?: boolean;
  /** W2: só a inicial da tag (visão mês) */
  inicialDaTag?: boolean;
  estilo?: CSSProperties;
  className?: string;
}

export default function ChipEvento({ ev, onAbrir, compacto, inicialDaTag, estilo, className }: Props) {
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
        "@container w-full overflow-hidden rounded-[7px] border-l-[3px] px-1.5 py-[3px] text-left font-body text-[11px] font-medium leading-tight transition hover:brightness-125",
        st.fundo, st.texto, cf.borda, className,
      )}
      style={estilo}
      title={`${nome} · ${faixaHora(ev)} · ${ev.tag?.nome ? `${ev.tag.nome} · ` : ""}${st.rotulo}`}
      data-evento={ev.id}
      data-status={ev.status}
      data-confirmacao={ev.confirmacao}
      data-modulo={ev.modulo}
      data-tag-evento={ev.tag?.id ?? ""}
      data-calendario-evento={ev.calendarioId}
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle" style={{ background: ev.cor }} aria-hidden="true" />
      {!ev.diaInteiro && <span className={cn("mr-1 tabular-nums opacity-80", compacto && "hidden sm:inline")}>{formatarHora(ev.inicio)}</span>}
      {ev.tag && <PilulaTag tag={ev.tag} inicial={inicialDaTag} adaptavel={!inicialDaTag} className={cn("mr-1", !inicialDaTag && "max-w-[55%]")} />}
      <span className={cn(compacto ? "truncate" : "line-clamp-2")}>{nome}</span>
    </button>
  );
}
