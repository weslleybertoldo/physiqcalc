// Physiq W20 — visão LISTA (porta da VisaoLista do PhysiqNutri): as consultas do mês por dia (só os dias com consulta), no padrão
// da "Agenda de hoje" da tela 6 (hora, foto, aluno, título, a TAG — W2: o chip TREINO/NUTRI virou a pílula da tag na cor dela) + o
// status. Vazio = estado vazio com a ação. hml-14b (D18): o mês é uma JANELA de datas (fica fora da paginação) lida até 1000 — quando
// chega ao teto (`noLimite`), o aviso diz que pode ter agendamento de fora.
import { addDays, eachDayOfInterval, isSameDay } from "date-fns";
import { CalendarPlus, CalendarX2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTILO_CONFIRMACAO, ESTILO_STATUS } from "@/agenda/regras";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoVazio } from "@/ui/premium/Estados";
import { AVISO_LIMITE_AGENDA } from "./dados";
import PilulaTag from "./PilulaTag";
import { agruparPorDia, chaveDia, faixaHora, intervaloVisao, nomeDoDiaLongo, nomeDoEvento, type EventoPainel } from "./visao";

interface Props {
  ancora: Date;
  eventos: EventoPainel[];
  hoje?: Date;
  onAbrir: (ev: EventoPainel) => void;
  onNovo: (dia: Date) => void;
  /** a leitura da janela veio com 1000 (o teto — `janelaNoLimite(d.agendamentosQ.data)`): mostra o aviso */
  noLimite?: boolean;
}

function AvisoLimite() {
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.08)] px-3 py-2 text-[12.5px] text-ambar-3"
      data-aviso-limite-agenda>
      <TriangleAlert aria-hidden className="h-4 w-4 flex-none" /> {AVISO_LIMITE_AGENDA}
    </p>
  );
}

export default function VisaoLista({ ancora, eventos, hoje = new Date(), onAbrir, onNovo, noLimite = false }: Props) {
  const { inicio, fim } = intervaloVisao(ancora, "lista");
  const dias = eachDayOfInterval({ start: inicio, end: addDays(fim, -1) });
  const grupos = agruparPorDia(eventos.filter((e) => e.inicio < fim && e.fim > inicio), dias);

  if (!grupos.length) {
    return (
      <div className="flex flex-col gap-3" data-visao="lista" data-lista-vazia>
        {noLimite && <AvisoLimite />}
        <EstadoVazio icone={CalendarX2} titulo="Nenhum agendamento neste mês" texto="Marque a próxima consulta: ela aparece aqui, no mês e na semana."
          acao={<Botao variante="g" tamanho="sm" icone={CalendarPlus} onClick={() => onNovo(hoje)} data-btn-novo-na-lista>Novo agendamento</Botao>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-visao="lista">
      {noLimite && <AvisoLimite />}
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
                return (
                  <li key={ev.id}>
                    <button type="button" onClick={() => onAbrir(ev)}
                      className={cn("grid w-full grid-cols-[96px_40px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] py-2.5 pl-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,.025)]", ESTILO_CONFIRMACAO[ev.confirmacao].borda)}
                      data-evento={ev.id} data-status={ev.status} data-tag-evento={ev.tag?.id ?? ""}>
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
                        {ev.tag && <PilulaTag tag={ev.tag} tamanho="chip" className="max-w-[140px]" />}
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
