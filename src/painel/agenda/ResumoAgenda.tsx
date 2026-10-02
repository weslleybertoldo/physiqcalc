// Physiq W20 — o topo do Painel › Agenda no padrão da tela 6: os 4 números (Consultas hoje "3 de treino · 4 de nutrição", Esta
// semana, A confirmar, Confirmação), "Consultas por semana" (N-9 do Dashboard do Nutri: agendadas × confirmadas, 8 semanas) e a
// "Agenda de hoje" (hora, foto, aluno, título e — W2 — a TAG da consulta na cor dela; os números seguem pela área/modulo).
import { useMemo } from "react";
import { CalendarCheck, CalendarClock, CalendarDays, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTILO_STATUS, aguardandoAluno, consultasPorSemana, hojeSP, infoTipo, numerosDaAgenda, textoHojePorTipo } from "@/agenda/regras";
import PilulaTag from "./PilulaTag";
import { Avatar } from "@/ui/premium/Avatar";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { Kpi } from "@/ui/premium/Kpi";
import { formatarHora, nomeDoEvento, type EventoPainel } from "./visao";

const paraResumo = (e: EventoPainel) => ({
  id: e.id, inicio: e.inicio.toISOString(), fim: e.fim.toISOString(), status: e.status, confirmacao: e.confirmacao, modulo: e.modulo,
  paciente_id: e.pacienteId, dia_inteiro: e.diaInteiro,
});

export default function ResumoAgenda({ eventos, carregando, aoAbrir, aoVerHoje }: {
  eventos: EventoPainel[];
  carregando: boolean;
  aoAbrir: (ev: EventoPainel) => void;
  aoVerHoje: () => void;
}) {
  const hoje = hojeSP();
  const calc = useMemo(() => {
    const lista = eventos.map(paraResumo);
    return { n: numerosDaAgenda(lista, hoje), semanas: consultasPorSemana(lista, hoje) };
  }, [eventos, hoje]);
  const doDia = useMemo(
    () => eventos.filter((e) => !e.diaInteiro && hojeSP(e.inicio) === hoje && e.status !== "desmarcado" && e.status !== "paciente_desmarcou")
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime()),
    [eventos, hoje],
  );

  if (carregando) {
    return (
      <div className="flex flex-col gap-3.5" data-resumo-agenda="carregando">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Cartao key={i} className="h-[132px] p-4"><Esqueleto className="h-full w-full" /></Cartao>)}</div>
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"><Cartao className="h-[330px] p-5"><Esqueleto className="h-full w-full" /></Cartao><Cartao className="h-[330px] p-5"><Esqueleto className="h-full w-full" /></Cartao></div>
      </div>
    );
  }
  const { n, semanas } = calc;
  const max = Math.max(1, ...semanas.map((s) => s.agendadas));
  const semanal = semanas.map((s) => s.agendadas);
  const taxa = semanas.map((s) => (s.agendadas ? Math.round((s.confirmadas / s.agendadas) * 100) : 0));

  return (
    <div className="flex flex-col gap-3.5" data-resumo-agenda data-hoje={n.hoje} data-semana={n.semana} data-a-confirmar={n.aConfirmar}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-kpis-agenda>
        <Kpi icone={CalendarDays} titulo="Consultas hoje" tom="ciano" valor={n.hoje} serie={n.porDia} detalhe={<span data-hoje-por-tipo>{textoHojePorTipo(n)}</span>} />
        <Kpi icone={CalendarClock} titulo="Esta semana" tom="violeta" valor={n.semana} serie={semanal}
          detalhe={<span>{n.semanaConfirmadas} {n.semanaConfirmadas === 1 ? "confirmada" : "confirmadas"}</span>} />
        <Kpi icone={Hourglass} titulo="A confirmar" tom="ambar" valor={n.aConfirmar} detalhe={<span>esperando o aluno</span>} />
        <Kpi icone={CalendarCheck} titulo="Confirmação" tom="verde" valor={n.taxaConfirmacao === null ? "—" : `${n.taxaConfirmacao}%`} serie={taxa}
          detalhe={<span>nas últimas 8 semanas</span>} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Cartao className="flex flex-col px-[22px] pb-4 pt-[18px]" data-cartao-consultas-semana>
          <CabecalhoCartao titulo="Consultas por semana"
            extra={<Chip tom="g" className="h-[22px] text-[10.5px]">ÚLTIMAS 8 SEMANAS</Chip>}
            acao={
              <span className="flex items-center gap-3 text-[11.5px] text-texto-2">
                <span className="flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-violeta-2" />Agendadas</span>
                <span className="flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-verde-2" />Confirmadas</span>
              </span>
            } />
          {/* W25 (herdado da W20): sem nenhuma consulta nas 8 semanas, o gráfico vira o estado vazio com texto (não um quadro em branco) */}
          {semanas.every((s) => s.agendadas === 0) ? (
            <div className="mt-2 flex h-[236px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-linha-2 px-6 text-center"
              data-consultas-semana-vazio>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-linha bg-superficie text-texto-2">
                <CalendarDays aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <b className="text-[14px] font-semibold text-texto">Nenhuma consulta nas últimas 8 semanas</b>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-texto-3">
                Quando você marcar consultas, as barras de agendadas e confirmadas de cada semana aparecem aqui. Clique num horário da semana para marcar.
              </p>
            </div>
          ) : (
          <div className="mt-2 flex h-[236px] items-end gap-3 border-b border-linha-3 pb-1" data-grafico-semanas>
            {semanas.map((s, i) => {
              const atual = i === semanas.length - 1;
              return (
                <div key={s.chave} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" data-semana-barra={s.chave} data-agendadas={s.agendadas} data-confirmadas={s.confirmadas}>
                  <span className={cn("text-[11px] font-semibold tabular-nums", atual ? "text-texto" : "text-texto-3")}>{s.agendadas || ""}</span>
                  <div className="flex h-[200px] w-full items-end justify-center gap-1">
                    <div className="w-[38%] max-w-[22px] rounded-t-[6px]"
                      style={{ height: `${(s.agendadas / max) * 100}%`, minHeight: s.agendadas ? 4 : 0, background: "linear-gradient(180deg,var(--p-violeta-2),rgba(139,92,246,.35))", boxShadow: atual ? "0 0 18px rgba(167,139,250,.45)" : undefined }} />
                    <div className="w-[38%] max-w-[22px] rounded-t-[6px]"
                      style={{ height: `${(s.confirmadas / max) * 100}%`, minHeight: s.confirmadas ? 4 : 0, background: "linear-gradient(180deg,var(--p-verde-2),rgba(16,185,129,.3))" }} />
                  </div>
                </div>
              );
            })}
          </div>
          )}
          <div className="mt-2 flex gap-3">
            {semanas.map((s, i) => (
              <span key={s.chave} className={cn("min-w-0 flex-1 truncate text-center text-[11px] tabular-nums", i === semanas.length - 1 ? "font-semibold text-texto-2" : "text-texto-4")}>{s.rotulo}</span>
            ))}
          </div>
        </Cartao>

        <Cartao className="flex flex-col px-[22px] pb-3 pt-[18px]" data-cartao-agenda-hoje data-agenda-hoje={doDia.length}>
          <CabecalhoCartao titulo="Agenda de hoje"
            acao={<button type="button" onClick={aoVerHoje} className="text-[12.5px] font-semibold text-violeta-3" data-ver-hoje>Ver o dia</button>} />
          {doDia.length === 0 ? (
            <p className="py-3 text-[12.5px] leading-relaxed text-texto-3" data-agenda-hoje-vazia>Nenhuma consulta hoje. Clique num horário da semana para marcar.</p>
          ) : (
            <div className="divide-y divide-linha-3">
              {doDia.slice(0, 6).map((ev) => {
                const { nome, sub } = nomeDoEvento(ev);
                const tipo = infoTipo(ev.modulo);
                const espera = aguardandoAluno(ev.status) && !!ev.pacienteId;
                return (
                  <button key={ev.id} type="button" onClick={() => aoAbrir(ev)} className="flex min-h-[62px] w-full items-center gap-3 py-2 text-left" data-hoje-evento={ev.id}>
                    <b className="w-[46px] flex-none text-[14px] font-semibold tabular-nums text-texto">{formatarHora(ev.inicio)}</b>
                    <Avatar src={ev.foto} nome={nome} tamanho={36} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-texto">{nome}</b>
                      <span className="block truncate text-[12px] text-texto-3">
                        {sub ?? ev.tag?.nome ?? tipo.rotulo}
                        {espera && <span className="text-ambar-3"> · a confirmar</span>}
                        {ev.status === "paciente_confirmou" && <span className="text-verde-3"> · {ESTILO_STATUS.paciente_confirmou.rotulo.toLowerCase()}</span>}
                      </span>
                    </span>
                    {ev.tag ? <PilulaTag tag={ev.tag} tamanho="chip" className="h-[24px] max-w-[120px] flex-none text-[11px]" />
                      : <Chip tom={ev.modulo === "geral" ? "g" : tipo.tom} className="h-[24px] flex-none text-[11px]">{ev.modulo === "geral" ? "GERAL" : tipo.chip}</Chip>}
                  </button>
                );
              })}
              {doDia.length > 6 && <p className="pt-2 text-[12px] text-texto-3">+{doDia.length - 6} no dia</p>}
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}
