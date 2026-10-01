import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { salvarArquivoTexto } from "@/app-aluno/perfil/pecas/salvarArquivo";
import { gerarICS, nomeArquivoICS, numerosDaAgenda, hojeSP } from "@/agenda/regras";
import AgendamentoDialog, { type FormAgendamento } from "@/painel/agenda/AgendamentoDialog";
import CalendarioDialog from "@/painel/agenda/CalendarioDialog";
import {
  buscarAluno, excluirAgendamento, excluirBloqueio, excluirTrava, listarAgendamentos, type Agendamento, type AlunoAgenda, type Bloqueio, type Calendario,
} from "@/painel/agenda/dados";
import PainelAgenda from "@/painel/agenda/PainelAgenda";
import RegrasDialog from "@/painel/agenda/RegrasDialog";
import ResumoAgenda from "@/painel/agenda/ResumoAgenda";
import TravaDialog from "@/painel/agenda/TravaDialog";
import { CHAVES_AGENDA, useContextoAgenda, useDadosAgenda } from "@/painel/agenda/useAgenda";
import {
  VISOES, ancoraDaURL, chaveDia, ehVisao, faixaDaSemana, formatarHora, moverAncora, paraEvento, tituloPeriodo, type EventoPainel, type Visao,
} from "@/painel/agenda/visao";
import VisaoLista from "@/painel/agenda/VisaoLista";
import VisaoMes from "@/painel/agenda/VisaoMes";
import VisaoSemana from "@/painel/agenda/VisaoSemana";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";

const CHAVE_OCULTOS = "physiq.agenda.ocultos";
const lerOcultos = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_OCULTOS) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
};

const BTN_NAV = "inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-linha-2 bg-[rgba(255,255,255,.03)] px-2.5 text-[12.5px] font-semibold text-texto-2 transition-colors hover:text-texto";

type DialogAg = { aberto: boolean; agendamento: Agendamento | null; inicial?: Partial<FormAgendamento> };

/**
 * Painel › Agenda (W20 — spec 4.4, tela 6; N-11, N-66, NF12, R7 + o pedido dele de 01/10): vários calendários, semana · mês ·
 * lista, os 7 status + a confirmação, bloqueios e travas (recorrentes e avulsas), slots com a duração da agenda, regras do
 * reagendamento/desistência para os alunos, exportar .ics e o tipo do agendamento (treino, nutrição ou geral) — para os 2 módulos
 * (o personal ganha agenda). No topo, o padrão da tela 6: Consultas hoje, a semana, "a confirmar", "Consultas por semana" (N-9) e
 * a "Agenda de hoje". Estado na URL (?visao=&data=); ?aluno=<id>&novo=1 (atalho "Agendar" do Resumo) e ?paciente=<id> (links do
 * site antigo) abrem o novo agendamento já com o aluno.
 */
export default function Agenda() {
  const ctx = useContextoAgenda();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const hoje = useMemo(() => startOfDay(new Date()), []);
  const visao: Visao = ehVisao(params.get("visao")) ? (params.get("visao") as Visao) : "semana";
  const ancora = useMemo(() => ancoraDaURL(params.get("data"), hoje), [params, hoje]);
  const [ocultos, setOcultos] = useState<Set<string>>(lerOcultos);
  const d = useDadosAgenda(ctx, visao, ancora, ocultos);

  const navegar = useCallback((novaVisao: Visao, novaAncora: Date) => {
    const next = new URLSearchParams(params);
    next.set("visao", novaVisao);
    next.set("data", chaveDia(novaAncora));
    setParams(next, { replace: true });
  }, [params, setParams]);

  const alternarCalendario = (id: string) => setOcultos((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(CHAVE_OCULTOS, JSON.stringify([...next]));
    } catch {
      /* sem armazenamento: vale só nesta abertura */
    }
    return next;
  });

  const [dialogAg, setDialogAg] = useState<DialogAg>({ aberto: false, agendamento: null });
  const [dialogCal, setDialogCal] = useState<{ aberto: boolean; calendario: Calendario | null }>({ aberto: false, calendario: null });
  const [regrasAberto, setRegrasAberto] = useState(false);
  const [travaAberta, setTravaAberta] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [alunoExtra, setAlunoExtra] = useState<AlunoAgenda | null>(null);

  const alunos = useMemo(() => (alunoExtra && !d.alunos.some((a) => a.id === alunoExtra.id) ? [alunoExtra, ...d.alunos] : d.alunos), [d.alunos, alunoExtra]);
  const minhasTravas = useMemo(() => d.travas.filter((t) => t.profissional_id === ctx.uid), [d.travas, ctx.uid]);
  const nomes = useMemo(() => new Map([...ctx.pessoas.values()].map((p) => [p.id, p.nome])), [ctx.pessoas]);
  const meuSlot = useMemo(() => {
    const meu = d.calendarios.find((c) => c.nutricionista_id === ctx.uid && c.padrao) ?? d.calendarios.find((c) => c.nutricionista_id === ctx.uid);
    return meu?.slot_minutos ?? d.regras.slot_minutos;
  }, [d.calendarios, ctx.uid, d.regras.slot_minutos]);
  const faixa = useMemo(() => faixaDaSemana(d.visiveis.length ? d.visiveis : d.calendarios, d.regras), [d.visiveis, d.calendarios, d.regras]);

  // atalho "Agendar" do Resumo do aluno (?aluno=<id>&novo=1) e os links do site antigo (?paciente=<id>)
  const alunoParam = params.get("aluno") ?? params.get("paciente");
  const novoParam = params.get("novo") === "1" || params.has("paciente");
  useEffect(() => {
    if (!alunoParam || !novoParam || !d.calendarios.length || d.alunos === undefined) return;
    let ativo = true;
    const conhecido = d.alunos.find((a) => a.id === alunoParam) ?? null;
    void (conhecido ? Promise.resolve(conhecido) : buscarAluno(alunoParam).catch(() => null)).then((a) => {
      if (!ativo) return;
      if (a && !conhecido) setAlunoExtra(a);
      setDialogAg({ aberto: true, agendamento: null, inicial: { pacienteId: a?.id ?? null } });
      const next = new URLSearchParams(params);
      next.delete("aluno");
      next.delete("paciente");
      next.delete("novo");
      setParams(next, { replace: true });
    });
    return () => {
      ativo = false;
    };
  }, [alunoParam, novoParam, d.calendarios.length, d.alunos.length]); // eslint-disable-line react-hooks/exhaustive-deps -- abre 1 vez quando os dados chegam

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: CHAVES_AGENDA.tudo });
    void qc.invalidateQueries({ queryKey: ["agenda-compromissos"] });
  };

  const linhaDoEvento = (id: string): Agendamento | undefined =>
    d.agendamentosQ.data?.find((x) => x.id === id) ?? d.estatisticasQ.data?.find((x) => x.id === id);
  const abrirEvento = (ev: EventoPainel) => {
    const a = linhaDoEvento(ev.id);
    if (a) setDialogAg({ aberto: true, agendamento: a });
  };
  const novoNoDia = (dia: Date) => setDialogAg({ aberto: true, agendamento: null, inicial: { data: chaveDia(dia) } });
  const novoNoHorario = (inicio: Date) => setDialogAg({ aberto: true, agendamento: null, inicial: { data: chaveDia(inicio), hora: formatarHora(inicio) } });

  const excluir = async (a: Agendamento) => {
    await excluirAgendamento(a.id);
    toast.success("Agendamento excluído");
    invalidar();
  };
  const removerBloqueio = async (b: Bloqueio) => {
    try {
      await excluirBloqueio(b.id);
      toast.success("Bloqueio removido");
      invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover o bloqueio");
    }
  };
  const liberarTrava = async (id: string) => {
    try {
      await excluirTrava(id);
      toast.success("Horários liberados");
      invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível liberar");
    }
  };
  const exportar = async () => {
    setExportando(true);
    try {
      const agora = new Date();
      const lista = await listarAgendamentos(addDays(agora, -30), addDays(agora, 365), ctx.uid, ctx.contaId || null);
      const cores = new Map(d.calendarios.map((c) => [c.id, c.cor]));
      const evs = lista.filter((a) => !ocultos.has(a.calendario_id)).map((a) => paraEvento(a, cores, d.mapaAlunos))
        .map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro, status: e.status, observacao: e.observacao, modulo: e.modulo, aluno: e.aluno }));
      const r = await salvarArquivoTexto(nomeArquivoICS(), gerarICS(evs), "text/calendar");
      toast.success(`${evs.length} agendamento(s) ${r === "baixado" ? "exportado(s)" : "prontos para salvar"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar");
    } finally {
      setExportando(false);
    }
  };

  const nHoje = useMemo(() => numerosDaAgenda(d.eventosEstat.map((e) => ({ id: e.id, inicio: e.inicio.toISOString(), fim: e.fim.toISOString(), status: e.status, modulo: e.modulo, dia_inteiro: e.diaInteiro })), hojeSP()).hoje, [d.eventosEstat]);
  const dataLonga = format(hoje, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const subtitulo = `${dataLonga.charAt(0).toUpperCase()}${dataLonga.slice(1)} · ${nHoje} ${nHoje === 1 ? "consulta" : "consultas"} hoje`;

  if (!ctx.pronto) {
    return (
      <div data-pagina-agenda-painel data-estado="sem-login">
        <TopoPagina titulo="Agenda" />
        <EstadoVazio icone={CalendarDays} titulo="Entre para ver a agenda" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-pagina-agenda-painel data-visao-agenda={visao} data-dono={ctx.dono ? "1" : "0"}>
      <TopoPagina titulo="Agenda" subtitulo={<span data-subtitulo-agenda data-hoje-contagem={nHoje}>{subtitulo}</span>}
        acoes={<Botao variante="w" icone={CalendarPlus} onClick={() => novoNoDia(hoje)} disabled={!d.calendarios.length} data-btn-novo-agendamento>Novo agendamento</Botao>} />

      <ResumoAgenda eventos={d.eventosEstat} carregando={d.estatisticasQ.isLoading || d.calendariosQ.isLoading} aoAbrir={abrirEvento}
        aoVerHoje={() => navegar("semana", hoje)} />

      <div className="mt-5 flex flex-col gap-3.5 xl:flex-row xl:items-start">
        <section className="min-w-0 flex-1 space-y-3" aria-label="Calendário">
          <div className="flex flex-wrap items-center justify-between gap-2" data-toolbar-agenda>
            <div className="flex items-center gap-1.5">
              <button type="button" className={BTN_NAV} onClick={() => navegar(visao, hoje)} data-btn-hoje>Hoje</button>
              <button type="button" className={BTN_NAV} onClick={() => navegar(visao, moverAncora(ancora, visao, -1))} aria-label="Período anterior" data-btn-anterior>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={BTN_NAV} onClick={() => navegar(visao, moverAncora(ancora, visao, 1))} aria-label="Próximo período" data-btn-proximo>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <h2 className="ml-1.5 font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto" data-titulo-periodo>{tituloPeriodo(ancora, visao)}</h2>
            </div>
            <Segmentado rotulo="Visão" opcoes={VISOES.map((v) => ({ valor: v.chave, rotulo: v.rotulo }))} valor={visao} aoMudar={(v) => navegar(v, ancora)} />
          </div>

          {d.erro ? (
            <EstadoErro titulo="Não deu para carregar a agenda" texto={d.erro instanceof Error ? d.erro.message : undefined}
              aoTentar={() => { void d.calendariosQ.refetch(); void d.agendamentosQ.refetch(); }} />
          ) : d.carregando ? (
            <div className="pq-cartao p-4" data-carregando-agenda><Esqueleto className="h-[420px] w-full" /></div>
          ) : visao === "mes" ? (
            <VisaoMes ancora={ancora} eventos={d.eventos} bloqueios={d.bloqueios} regras={d.regras} hoje={hoje} onNovo={novoNoDia} onAbrir={abrirEvento} />
          ) : visao === "semana" ? (
            <VisaoSemana ancora={ancora} eventos={d.eventos} bloqueios={d.bloqueios} travas={minhasTravas} regras={d.regras} slot={meuSlot} faixa={faixa}
              hoje={new Date()} onNovo={novoNoHorario} onAbrir={abrirEvento} />
          ) : (
            <VisaoLista ancora={ancora} eventos={d.eventos} hoje={hoje} onAbrir={abrirEvento} onNovo={novoNoDia} />
          )}
        </section>

        <aside className={cn("w-full shrink-0 xl:w-[290px]")} data-aside-agenda>
          <PainelAgenda uid={ctx.uid} calendarios={d.calendarios} ocultos={ocultos} nomes={nomes} regras={d.regras} regrasCarregando={d.regrasCarregando} travas={d.travas} bloqueios={d.bloqueiosFuturos}
            exportando={exportando} onAlternar={alternarCalendario}
            onNovoCalendario={() => setDialogCal({ aberto: true, calendario: null })} onEditarCalendario={(c) => setDialogCal({ aberto: true, calendario: c })}
            onEditarRegras={() => !d.regrasCarregando && setRegrasAberto(true)} onTravar={() => setTravaAberta(true)} onLiberarTrava={(t) => void liberarTrava(t.id)}
            onExcluirBloqueio={(b) => void removerBloqueio(b)} onExportar={() => void exportar()} />
        </aside>
      </div>

      <AgendamentoDialog open={dialogAg.aberto} onOpenChange={(aberto) => setDialogAg((x) => ({ ...x, aberto }))} agendamento={dialogAg.agendamento}
        inicial={dialogAg.inicial} calendarios={d.calendarios} alunos={alunos} eventos={[...d.eventos, ...d.eventosEstat.filter((e) => !d.eventos.some((x) => x.id === e.id))]}
        bloqueios={d.bloqueios} travas={d.travas} regras={d.regras} ctx={ctx} onSalvo={invalidar} onExcluir={excluir} />
      <CalendarioDialog open={dialogCal.aberto} onOpenChange={(aberto) => setDialogCal((x) => ({ ...x, aberto }))} calendario={dialogCal.calendario}
        outros={d.calendarios.filter((c) => c.nutricionista_id === ctx.uid && c.id !== dialogCal.calendario?.id)} uid={ctx.uid} contaId={ctx.contaId || null}
        regras={d.regras} onSalvo={invalidar} />
      <RegrasDialog open={regrasAberto} onOpenChange={setRegrasAberto} uid={ctx.uid} regras={d.regras} nome={ctx.pessoas.get(ctx.uid)?.nome ?? null}
        onSalvo={(r) => { qc.setQueryData(CHAVES_AGENDA.regras(ctx.uid), r); invalidar(); }} />
      <TravaDialog open={travaAberta} onOpenChange={setTravaAberta} calendarios={d.calendarios} uid={ctx.uid} contaId={ctx.contaId || null} regras={d.regras}
        dataInicial={ancora} onSalvo={invalidar} />
    </div>
  );
}
