// Physiq W20 — "Novo agendamento" / "Editar agendamento" (porta do AgendamentoDialog do PhysiqNutri no visual premium) + o pedido dele:
// o profissional escolhe N slots seguidos (a duração do slot vem do calendário ou do padrão da agenda), vê os horários do dia como o
// banco calcula (livre · ocupado · travado · bloqueado) e o tipo nasce pelo papel de quem agenda (NF12). Conflito, bloqueio, trava e
// "fora do atendimento" só AVISAM (o profissional pode encaixar); o aluno não marca nesses. Ao salvar uma consulta futura de um
// aluno com login, o banco avisa no sino e (com "Avisar o aluno") sai o e-mail.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Lock, Minus, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TEXTAREA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import {
  ESTILO_STATUS, STATUS_ORDEM, SUGESTOES_TITULO, TIPOS, confirmacaoDe, duracaoTexto, ehStatus, quandoConsulta, statusDe, tipoDe, tipoPadrao,
  tituloPadrao, type RegrasAgenda, type StatusAgenda, type TipoAgendamento, type TravaRecorrente,
} from "@/agenda/regras";
import { Avatar } from "@/ui/premium/Avatar";
import {
  atualizarAgendamento, avisarPorEmail, criarAgendamento, horariosDoDia, type Agendamento, type AlunoAgenda, type Calendario, type NovoAgendamento,
  type SlotDoDia,
} from "./dados";
import type { ContextoAgenda } from "./useAgenda";
import {
  bloqueiosEmConflito, chaveDia, combinarDataHora, conflitos, dataValida, faixaHora, foraDoAtendimento, formatarHora, horaValida, travasEmConflito,
  type BloqueioPainel, type EventoPainel,
} from "./visao";

export interface FormAgendamento {
  pacienteId: string | null;
  titulo: string;
  calendarioId: string;
  data: string;
  hora: string;
  /** minutos (N slots) */
  duracao: number;
  diaInteiro: boolean;
  modulo: TipoAgendamento;
  status: StatusAgenda;
  observacao: string;
  avisar: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  agendamento?: Agendamento | null;
  inicial?: Partial<FormAgendamento>;
  calendarios: Calendario[];
  alunos: AlunoAgenda[];
  eventos: EventoPainel[];
  bloqueios: BloqueioPainel[];
  travas: TravaRecorrente[];
  regras: RegrasAgenda;
  ctx: ContextoAgenda;
  onSalvo: (a: Agendamento, modo: "criado" | "editado") => void;
  onExcluir?: (a: Agendamento) => Promise<void> | void;
}

const ROTULO_ESTADO: Record<SlotDoDia["estado"], string> = { livre: "livre", ocupado: "ocupado", travado: "travado", bloqueado: "bloqueado", passado: "passou" };

function duracaoRotulo(min: number, slot: number): string {
  const d = duracaoTexto(new Date(0).toISOString(), new Date(min * 60000).toISOString());
  if (slot > 0 && min % slot === 0) {
    const n = min / slot;
    return `${n} ${n === 1 ? "slot" : "slots"} · ${d}`;
  }
  return d;
}

export default function AgendamentoDialog({ open, onOpenChange, agendamento, inicial, calendarios, alunos, eventos, bloqueios, travas, regras, ctx, onSalvo, onExcluir }: Props) {
  const editando = !!agendamento;
  const [f, setF] = useState<FormAgendamento | null>(null);
  const [tipoMexido, setTipoMexido] = useState(false);
  const [tituloMexido, setTituloMexido] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const calPadrao = useMemo(() => calendarios.find((c) => c.nutricionista_id === ctx.uid && c.padrao) ?? calendarios.find((c) => c.nutricionista_id === ctx.uid) ?? calendarios[0], [calendarios, ctx.uid]);

  useEffect(() => {
    if (!open) return;
    setErros({});
    setConfirmarExclusao(false);
    setBuscaAberta(false);
    if (agendamento) {
      const ini = new Date(agendamento.inicio);
      const fim = new Date(agendamento.fim);
      setTipoMexido(true);
      setTituloMexido(true);
      setF({
        pacienteId: agendamento.paciente_id,
        titulo: agendamento.titulo,
        calendarioId: agendamento.calendario_id,
        data: chaveDia(ini),
        hora: formatarHora(ini),
        duracao: agendamento.dia_inteiro ? 60 : Math.max(Math.round((fim.getTime() - ini.getTime()) / 60000), 5),
        diaInteiro: agendamento.dia_inteiro,
        modulo: tipoDe(agendamento.modulo),
        status: statusDe(agendamento.status),
        observacao: agendamento.observacao ?? "",
        avisar: false,
      });
      return;
    }
    const cal = calendarios.find((c) => c.id === inicial?.calendarioId) ?? calPadrao;
    const slot = cal?.slot_minutos ?? regras.slot_minutos;
    const aluno = alunos.find((a) => a.id === inicial?.pacienteId) ?? null;
    const dono = cal?.nutricionista_id ?? ctx.uid;
    const papeisDono = ctx.pessoas.get(dono)?.papeis ?? ctx.papeis;
    const tipo = tipoPadrao(papeisDono, dono, aluno, ctx.modulos);
    setTipoMexido(false);
    setTituloMexido(false);
    setF({
      pacienteId: aluno?.id ?? null,
      titulo: tituloPadrao(tipo),
      calendarioId: cal?.id ?? "",
      data: inicial?.data ?? chaveDia(new Date()),
      hora: inicial?.hora ?? regras.atende_inicio,
      duracao: inicial?.duracao ?? slot,
      diaInteiro: false,
      modulo: tipo,
      status: "agendado",
      observacao: "",
      avisar: true,
    });
  }, [open, agendamento]); // eslint-disable-line react-hooks/exhaustive-deps -- reabrir zera o formulário; o resto vem com ele aberto

  const cal = calendarios.find((c) => c.id === f?.calendarioId) ?? null;
  const donoCal = cal?.nutricionista_id ?? ctx.uid;
  const slotCal = cal?.slot_minutos ?? regras.slot_minutos;
  const aluno = f?.pacienteId ? alunos.find((a) => a.id === f.pacienteId) ?? null : null;

  const horarios = useQuery({
    queryKey: ["agenda-painel", "horarios", f?.calendarioId, f?.data, f?.duracao, agendamento?.id ?? null],
    queryFn: () => horariosDoDia(f!.calendarioId, f!.data, f!.duracao, agendamento?.id ?? null),
    enabled: open && !!f && !!f.calendarioId && dataValida(f.data) && !f.diaInteiro,
    staleTime: 10_000,
  });
  const regrasCal = horarios.data?.regras ?? regras;

  const set = <K extends keyof FormAgendamento>(k: K, v: FormAgendamento[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  const recalcularTipo = (pacienteId: string | null, calendarioId: string) => {
    if (tipoMexido || !f) return;
    const c = calendarios.find((x) => x.id === calendarioId);
    const dono = c?.nutricionista_id ?? ctx.uid;
    const novo = tipoPadrao(ctx.pessoas.get(dono)?.papeis ?? ctx.papeis, dono, alunos.find((a) => a.id === pacienteId) ?? null, ctx.modulos);
    setF((x) => (x ? { ...x, modulo: novo, titulo: tituloMexido ? x.titulo : tituloPadrao(novo) } : x));
  };

  const escolherAluno = (a: AlunoAgenda | null) => {
    set("pacienteId", a?.id ?? null);
    recalcularTipo(a?.id ?? null, f?.calendarioId ?? "");
    setBuscaAberta(false);
  };

  const previa = useMemo(() => {
    if (!f || !dataValida(f.data) || (!f.diaInteiro && !horaValida(f.hora)) || !f.calendarioId) return null;
    const inicio = combinarDataHora(f.data, f.diaInteiro ? "00:00" : f.hora);
    const fim = f.diaInteiro ? combinarDataHora(f.data, "00:00") : new Date(inicio.getTime() + f.duracao * 60000);
    if (f.diaInteiro) fim.setDate(fim.getDate() + 1);
    if (fim <= inicio) return null;
    const c = { inicio, fim, calendarioId: f.calendarioId, profissionalId: donoCal, id: agendamento?.id };
    return {
      inicio,
      fim,
      conflitos: conflitos(c, eventos),
      bloqueios: bloqueiosEmConflito(c, bloqueios),
      travas: f.diaInteiro ? [] : travasEmConflito(c, travas),
      fora: f.diaInteiro ? null : foraDoAtendimento(inicio, fim, regrasCal),
      passado: fim.getTime() <= Date.now(),
    };
  }, [f, eventos, bloqueios, travas, regrasCal, donoCal, agendamento?.id]);

  if (!f) return null;

  const validar = (): boolean => {
    const e: Record<string, string> = {};
    if (!f.titulo.trim()) e.titulo = "Informe o título ou escolha um aluno";
    if (f.titulo.trim().length > 120) e.titulo = "Título muito longo";
    if (!f.calendarioId) e.calendarioId = "Escolha um calendário";
    if (!dataValida(f.data)) e.data = "Data inválida";
    if (!f.diaInteiro && !horaValida(f.hora)) e.hora = "Hora inválida";
    if (!f.diaInteiro && (f.duracao < 5 || f.duracao > 24 * 60)) e.duracao = "Duração inválida";
    if (f.observacao.length > 2000) e.observacao = "Observação muito longa";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar() || !previa || !cal) return;
    setSalvando(true);
    try {
      const registro: NovoAgendamento = {
        nutricionista_id: cal.nutricionista_id,
        calendario_id: cal.id,
        paciente_id: f.pacienteId,
        titulo: f.titulo.trim(),
        inicio: previa.inicio.toISOString(),
        fim: previa.fim.toISOString(),
        dia_inteiro: f.diaInteiro,
        status: f.status,
        confirmacao: confirmacaoDe(f.status),
        observacao: f.observacao.trim() || null,
        modulo: f.modulo,
        conta_id: ctx.contaId || cal.conta_id || null,
      };
      let salvo: Agendamento;
      if (agendamento) {
        // editar não troca o dono nem a conta (a não ser que a consulta mude para o calendário de outro profissional)
        const patch: Partial<NovoAgendamento> = { ...registro };
        if (cal.nutricionista_id === agendamento.nutricionista_id) delete patch.nutricionista_id;
        if (agendamento.conta_id) delete patch.conta_id;
        salvo = await atualizarAgendamento(agendamento.id, patch);
        toast.success("Agendamento atualizado");
      } else {
        salvo = await criarAgendamento(registro);
        toast.success("Agendamento criado");
      }
      onSalvo(salvo, agendamento ? "editado" : "criado");
      onOpenChange(false);
      // o aviso por e-mail (o sino o banco já deu): consulta futura, viva, de aluno com login
      const futura = !f.diaInteiro && previa.inicio.getTime() > Date.now() && !(f.status === "desmarcado" || f.status === "paciente_desmarcou" || f.status === "nao_compareceu");
      if (f.avisar && futura && aluno?.user_id) {
        void avisarPorEmail(salvo.id).then((r) => {
          if (r.enviado) toast.success(`${aluno.nome.split(" ")[0]} foi avisado no app e por e-mail${r.teste ? " (caixa de teste)" : ""}`);
          else if (r.motivo === "repetido") toast(`${aluno.nome.split(" ")[0]} foi avisado no app (o e-mail já saiu há pouco)`);
          else if (r.motivo === "sem_email") toast(`${aluno.nome.split(" ")[0]} foi avisado no app (sem e-mail no cadastro)`);
          else if (r.motivo !== "nada_novo") toast(`${aluno.nome.split(" ")[0]} foi avisado no app; o e-mail não saiu agora`);
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o agendamento");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!agendamento || !onExcluir) return;
    setExcluindo(true);
    try {
      await onExcluir(agendamento);
      setConfirmarExclusao(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
    } finally {
      setExcluindo(false);
    }
  };

  const slots = (horarios.data?.slots ?? []).filter((s) => s.estado !== "passado");
  const selecionado = (s: SlotDoDia) => formatarHora(new Date(s.inicio)) === f.hora;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "max-h-[92vh] overflow-y-auto sm:max-w-2xl")} data-modal-agendamento={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            {editando
              ? "Mude data, horário ou status. Desmarcar é um status: o registro continua no histórico."
              : "Escolha o aluno (ou dê um título), o dia, o horário e quantos slots a consulta ocupa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" data-form-agendamento>
          {editando && agendamento && (agendamento.reagendamentos > 0 || agendamento.origem === "aluno" || agendamento.aluno_respondeu_em) && (
            <p className="rounded-xl border border-linha-2 bg-[rgba(255,255,255,.03)] px-3 py-2 text-[12px] text-texto-2" data-historico-aluno>
              {agendamento.origem === "aluno" ? "Marcada pelo aluno no app. " : ""}
              {agendamento.reagendamentos > 0 ? `Reagendada pelo aluno ${agendamento.reagendamentos === 1 ? "1 vez" : `${agendamento.reagendamentos} vezes`}. ` : ""}
              {agendamento.aluno_respondeu_em ? `Última resposta do aluno: ${quandoConsulta(agendamento.aluno_respondeu_em)}.` : ""}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[3fr_2fr]">
            <Campo rotulo="Aluno">
              <Popover open={buscaAberta} onOpenChange={setBuscaAberta}>
                <PopoverTrigger asChild>
                  <button type="button" role="combobox" aria-expanded={buscaAberta} className={cn(SELECT, "flex items-center gap-2 text-left")} data-campo-paciente={f.pacienteId ?? "nenhum"}>
                    {aluno && <Avatar src={aluno.foto_url} nome={aluno.nome} tamanho={22} />}
                    <span className={cn("min-w-0 flex-1 truncate", !aluno && "text-texto-3")}>{aluno ? aluno.nome : f.pacienteId ? "Aluno selecionado" : "Sem aluno (compromisso avulso)"}</span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] border-linha-2 bg-tela p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar aluno…" data-busca-paciente />
                    <CommandList className="max-h-60">
                      <CommandEmpty>Nenhum aluno com esse nome.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__nenhum__ sem aluno" onSelect={() => escolherAluno(null)} data-opcao-paciente="nenhum">
                          <Check className={cn("mr-2 h-4 w-4", f.pacienteId ? "opacity-0" : "opacity-100")} aria-hidden="true" />
                          Sem aluno
                        </CommandItem>
                        {alunos.map((p) => (
                          <CommandItem key={p.id} value={`${p.nome} ${p.apelido ?? ""} ${p.id}`} onSelect={() => escolherAluno(p)} data-opcao-paciente={p.id}>
                            <Check className={cn("mr-2 h-4 w-4", f.pacienteId === p.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                            <span className="truncate">{p.nome}</span>
                            {!p.user_id && <span className="ml-auto pl-2 text-[11px] text-texto-4">sem login</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Campo>
            <Campo rotulo="Tipo">
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tipo do agendamento" data-campo-tipo={f.modulo}>
                {TIPOS.map((t) => (
                  <button key={t.valor} type="button" role="radio" aria-checked={f.modulo === t.valor}
                    onClick={() => {
                      setTipoMexido(true);
                      setF((x) => (x ? { ...x, modulo: t.valor, titulo: tituloMexido ? x.titulo : tituloPadrao(t.valor) } : x));
                    }}
                    className={cn("h-10 rounded-xl border text-[12.5px] font-semibold transition-colors",
                      f.modulo === t.valor
                        ? t.valor === "treino" ? "border-violeta-2/60 bg-[rgba(139,92,246,.16)] text-violeta-3" : t.valor === "nutricao" ? "border-verde/50 bg-[rgba(16,185,129,.12)] text-verde-3" : "border-linha-2 bg-superficie-2 text-texto"
                        : "border-linha-2 bg-[rgba(255,255,255,.03)] text-texto-3 hover:text-texto")}
                    data-tipo-btn={t.valor}>
                    {t.rotulo}
                  </button>
                ))}
              </div>
            </Campo>
          </div>

          <Campo rotulo="Título *" erro={erros.titulo}>
            <input className={INPUT} value={f.titulo} maxLength={120} placeholder="ex.: Retorno" data-campo-titulo
              onChange={(e) => {
                setTituloMexido(true);
                set("titulo", e.target.value);
              }} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SUGESTOES_TITULO[f.modulo].map((s) => (
                <button key={s} type="button" onClick={() => {
                  setTituloMexido(true);
                  set("titulo", s);
                }} className="rounded-full border border-linha-2 px-2.5 py-0.5 text-[11.5px] text-texto-2 transition-colors hover:text-texto" data-sugestao-titulo={s}>{s}</button>
              ))}
            </div>
          </Campo>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Data *" erro={erros.data}>
              <input type="date" className={INPUT} value={f.data} onChange={(e) => set("data", e.target.value)} data-campo-data />
            </Campo>
            <Campo rotulo="Calendário *" erro={erros.calendarioId}>
              <select className={SELECT} value={f.calendarioId} data-campo-calendario
                onChange={(e) => {
                  const novo = e.target.value;
                  const c = calendarios.find((x) => x.id === novo);
                  setF((x) => (x ? { ...x, calendarioId: novo, duracao: editando ? x.duracao : c?.slot_minutos ?? regras.slot_minutos } : x));
                  recalcularTipo(f.pacienteId, novo);
                }}>
                {calendarios.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}{c.nutricionista_id !== ctx.uid ? ` · ${ctx.pessoas.get(c.nutricionista_id)?.nome ?? "equipe"}` : ""}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Status">
              <select className={SELECT} value={f.status} onChange={(e) => set("status", ehStatus(e.target.value) ? e.target.value : "agendado")} data-campo-status>
                {STATUS_ORDEM.map((s) => <option key={s} value={s}>{ESTILO_STATUS[s].rotulo}</option>)}
              </select>
            </Campo>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-texto">
            <input type="checkbox" className="h-4 w-4 accent-[#8B5CF6]" checked={f.diaInteiro} onChange={(e) => set("diaInteiro", e.target.checked)} data-campo-dia-inteiro />
            Dia inteiro (sem horário — ex.: um evento, não uma consulta)
          </label>

          {!f.diaInteiro && (
            <div className="space-y-2.5 rounded-2xl border border-linha bg-[rgba(255,255,255,.02)] p-3" data-bloco-horario>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
                <Campo rotulo="Hora *" erro={erros.hora}>
                  <input type="time" step={300} className={INPUT} value={f.hora} onChange={(e) => set("hora", e.target.value)} data-campo-hora />
                </Campo>
                <Campo rotulo={`Duração (slot de ${slotCal} min)`} erro={erros.duracao}>
                  <div className="flex h-10 items-center gap-2" data-campo-slots={f.duracao % slotCal === 0 ? f.duracao / slotCal : ""}>
                    <button type="button" className="pq-ibtn" style={{ width: 36, height: 36, borderRadius: 11 }} aria-label="Menos um slot" disabled={f.duracao <= slotCal}
                      onClick={() => set("duracao", Math.max(slotCal, Math.ceil(f.duracao / slotCal) * slotCal - slotCal))} data-slots-menos>
                      <Minus aria-hidden />
                    </button>
                    <span className="min-w-[120px] text-center text-[13.5px] font-semibold tabular-nums text-texto" data-duracao-rotulo>{duracaoRotulo(f.duracao, slotCal)}</span>
                    <button type="button" className="pq-ibtn" style={{ width: 36, height: 36, borderRadius: 11 }} aria-label="Mais um slot" disabled={f.duracao + slotCal > 12 * 60}
                      onClick={() => set("duracao", Math.floor(f.duracao / slotCal) * slotCal + slotCal)} data-slots-mais>
                      <Plus aria-hidden />
                    </button>
                  </div>
                </Campo>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-texto-2">Horários do dia</span>
                  <span className="text-[11px] text-texto-3">{regrasCal.atende_inicio}–{regrasCal.atende_fim} · slots de {slotCal} min</span>
                </div>
                {horarios.isLoading ? (
                  <p className="text-[12px] text-texto-3">Carregando os horários…</p>
                ) : horarios.isError ? (
                  <p className="text-[12px] text-rosa-3">Não deu para carregar os horários agora.</p>
                ) : slots.length === 0 ? (
                  <p className="text-[12px] text-texto-3" data-sem-horarios>Nenhum slot neste dia (fora dos dias de atendimento ou o horário já passou). Pode digitar a hora acima.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5" data-grade-horarios>
                    {slots.map((s) => {
                      const sel = selecionado(s);
                      const livre = s.estado === "livre";
                      return (
                        <button key={s.inicio} type="button" onClick={() => set("hora", formatarHora(new Date(s.inicio)))}
                          className={cn("inline-flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-[12.5px] font-semibold tabular-nums transition-colors",
                            sel ? "border-violeta-2 bg-[rgba(139,92,246,.22)] text-texto" : livre ? "border-linha-2 bg-[rgba(255,255,255,.04)] text-texto hover:border-violeta-2/60"
                              : "border-transparent bg-[rgba(255,255,255,.02)] text-texto-4 line-through decoration-texto-4/60")}
                          title={`${formatarHora(new Date(s.inicio))} · ${ROTULO_ESTADO[s.estado]}`} data-horario={formatarHora(new Date(s.inicio))} data-horario-estado={s.estado}>
                          {s.estado === "travado" && <Lock aria-hidden className="h-3 w-3" />}
                          {formatarHora(new Date(s.inicio))}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <Campo rotulo="Observação (só você vê)" erro={erros.observacao}>
            <textarea className={TEXTAREA} rows={2} value={f.observacao} placeholder="Opcional" onChange={(e) => set("observacao", e.target.value)} data-campo-observacao />
          </Campo>

          {aluno && !editando && (
            <label className="flex cursor-pointer items-start gap-2 text-[13px] text-texto" data-campo-avisar>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#8B5CF6]" checked={f.avisar} onChange={(e) => set("avisar", e.target.checked)} disabled={!aluno.user_id} />
              <span>
                Avisar {aluno.nome.split(" ")[0]} no app e por e-mail para confirmar, reagendar ou desistir
                {!aluno.user_id && <span className="block text-[11.5px] text-texto-3">Sem acesso ao app ainda: o aviso sai quando ele tiver login.</span>}
              </span>
            </label>
          )}

          {previa && (
            <div className="space-y-1 text-[12px]" data-previa-horario>
              <p className="text-texto-2">{faixaHora({ inicio: previa.inicio, fim: previa.fim, diaInteiro: f.diaInteiro })} · {quandoConsulta(previa.inicio.toISOString()).split(" às ")[0]}</p>
              {previa.conflitos.length > 0 && (
                <p className="text-ambar-3" role="status" data-aviso-conflito>Conflito: {previa.conflitos.map((c) => `${c.aluno ?? c.titulo} (${faixaHora(c)})`).join(", ")}</p>
              )}
              {previa.bloqueios.length > 0 && (
                <p className="text-ambar-3" role="status" data-aviso-bloqueio>Horário bloqueado: {previa.bloqueios.map((b) => b.motivo ?? "bloqueado").join(", ")}</p>
              )}
              {previa.travas.length > 0 && (
                <p className="text-ambar-3" role="status" data-aviso-trava>Horário travado: {previa.travas.map((t) => t.motivo ?? `${t.hora_inicio}–${t.hora_fim}`).join(", ")}</p>
              )}
              {previa.fora && (
                <p className="text-ambar-3" role="status" data-aviso-fora>{previa.fora === "dia" ? "Dia sem atendimento" : `Fora do horário de atendimento (${regrasCal.atende_inicio}–${regrasCal.atende_fim})`}: o aluno não marca aqui, mas você pode encaixar.</p>
              )}
              {previa.passado && <p className="text-texto-3" data-aviso-passado>Horário que já passou: o aluno não é avisado.</p>}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {editando && onExcluir ? (
              <button type="button" className={BTN_PERIGO} onClick={() => setConfirmarExclusao(true)} data-btn-excluir-agendamento>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Excluir
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)}>Cancelar</button>
              <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()} data-btn-salvar-agendamento>
                {salvando ? "Salvando…" : editando ? "Salvar" : "Agendar"}
              </button>
            </div>
          </div>
        </div>

        <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
          <AlertDialogContent className={JANELA}>
            <AlertDialogHeader>
              <AlertDialogTitle className={TITULO_JANELA}>Excluir este agendamento?</AlertDialogTitle>
              <AlertDialogDescription className={DESCRICAO_JANELA}>
                Ele sai da agenda e vai para a lixeira. Se a consulta foi desmarcada, prefira o status "Desmarcado por você" para manter o histórico.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir>
                {excluindo ? "Excluindo…" : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
