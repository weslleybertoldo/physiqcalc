// Physiq W20 — visão LISTA (porta da VisaoLista do PhysiqNutri): as consultas do mês por dia (só os dias com consulta), no padrão
// da "Agenda de hoje" da tela 6 (hora, foto, aluno, título, chip TREINO/NUTRI) + o status. Vazio = estado vazio com a ação.
import { addDays, eachDayOfInterval, isSameDay } from "date-fns";
import { CalendarPlus, CalendarX2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTILO_CONFIRMACAO, ESTILO_STATUS, infoTipo } from "@/agenda/regras";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoVazio } from "@/ui/premium/Estados";
import { agruparPorDia, chaveDia, faixaHora, intervaloVisao, nomeDoDiaLongo, nomeDoEvento, type EventoPainel } from "./visao";

interface Props {
  ancora: Date;
  eventos: EventoPainel[];
  hoje?: Date;
  onAbrir: (ev: EventoPainel) => void;
  onNovo: (dia: Date) => void;
}

export default function VisaoLista({ ancora, eventos, hoje = new Date(), onAbrir, onNovo }: Props) {
  const { inicio, fim } = intervaloVisao(ancora, "lista");
  const dias = eachDayOfInterval({ start: inicio, end: addDays(fim, -1) });
  const grupos = agruparPorDia(eventos.filter((e) => e.inicio < fim && e.fim > inicio), dias);

  if (!grupos.length) {
    return (
      <div data-visao="lista" data-lista-vazia>
        <EstadoVazio icone={CalendarX2} titulo="Nenhum agendamento neste mês" texto="Marque a próxima consulta: ela aparece aqui, no mês e na semana."
          acao={<Botao variante="g" tamanho="sm" icone={CalendarPlus} onClick={() => onNovo(hoje)} data-btn-novo-na-lista>Novo agendamento</Botao>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-visao="lista">
      {grupos.map(({ dia, eventos: evs }) => {
        const ehHoje = isSameDay(dia, hoje);
        return (
          <section key={chaveDia(dia)} className="pq-cartao px-[18px] py-3.5" data-lista-dia={chaveDia(dia)}>
            <header className="mb-1.5 flex items-center gap-2">
              <h3 className={cn("font-body text-[14px] font-semibold normal-case tracking-[-0.01em]", ehHoje ? "text-violeta-3" : "text-texto")}>{nomeDoDiaLongo(dia)}</h3>
              {ehHoje && <Chip tom="t" className="h-[20px] text-[10px]">HOJE</Chip>}
              <span className="ml-auto text-[12px] text-texto-3">{evs.length} agendamento{evs.length === 1 ? "" : "s"}</span>
            </header>
            <ul className="divide-y divide-linha-3">
              {evs.map((ev) => {
                const st = ESTILO_STATUS[ev.status];
                const { nome, sub } = nomeDoEvento(ev);
                const tipo = infoTipo(ev.modulo);
                return (
                  <li key={ev.id}>
                    <button type="button" onClick={() => onAbrir(ev)}
                      className={cn("grid w-full grid-cols-[96px_40px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] py-2.5 pl-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,.025)]", ESTILO_CONFIRMACAO[ev.confirmacao].borda)}
                      data-evento={ev.id} data-status={ev.status}>
                      <span className="text-[13px] font-semibold tabular-nums text-texto">{faixaHora(ev)}</span>
                      <Avatar src={ev.foto} nome={nome} tamanho={36} />
                      <span className="min-w-0">
                        <b className={cn("block truncate text-[13.5px] font-semibold text-texto", (ev.status === "desmarcado" || ev.status === "paciente_desmarcou") && "text-texto-3 line-through")}>{nome}</b>
                        <span className="block truncate text-[12px] text-texto-3">
                          {[sub, ev.observacao].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn("hidden items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-semibold sm:inline-flex", st.fundo, st.texto.replace("line-through", ""))} data-status-rotulo>
                          <span className={cn("h-1.5 w-1.5 rounded-full", st.ponto)} aria-hidden="true" /> {st.rotulo}
                        </span>
                        {ev.modulo !== "geral" && <Chip tom={tipo.tom} className="h-[22px] text-[10.5px]">{tipo.chip}</Chip>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
