// Physiq W20 — novo/editar calendário (porta do CalendarioDialog do PhysiqNutri no visual premium): nome, cor, faixa de horário da
// visão semana, "padrão" (sugerido no novo agendamento) e — pedido dele — a DURAÇÃO DO SLOT desta agenda ("por padrão e por agenda":
// vazio = a duração padrão das regras da agenda). W2: a TAG PADRÃO (a que vem marcada no novo agendamento deste calendário; vazio =
// pelo papel, como antes).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { DURACOES_SLOT, rotuloArea, tagsDe, textoSlotsPorDia, type RegrasAgenda, type TagAgenda } from "@/agenda/regras";
import { atualizarCalendario, criarCalendario, excluirCalendario, type Calendario } from "./dados";
import { CORES_CALENDARIO, hhmm, horaValida, minutosDoDia } from "./visao";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  calendario?: Calendario | null;
  /** os outros calendários DO MESMO dono (para tirar o "padrão" deles e saber se este pode ser excluído) */
  outros: Calendario[];
  uid: string;
  contaId: string | null;
  regras: RegrasAgenda;
  /** W2: as tags que a agenda leu (o campo mostra só as SUAS) */
  tags: TagAgenda[];
  onSalvo: () => void;
}

interface Form {
  nome: string;
  cor: string;
  faixa_inicio: string;
  faixa_fim: string;
  padrao: boolean;
  slot: string; // "" = padrão da agenda
  tag: string; // "" = sem tag padrão (pelo papel)
}

export default function CalendarioDialog({ open, onOpenChange, calendario, outros, uid, contaId, regras, tags, onSalvo }: Props) {
  const editando = !!calendario;
  const [f, setF] = useState<Form>({ nome: "", cor: CORES_CALENDARIO[1], faixa_inicio: "07:00", faixa_fim: "20:00", padrao: false, slot: "", tag: "" });
  const minhasTags = tagsDe(tags, calendario?.nutricionista_id ?? uid);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmar(false);
    setErros({});
    setF(calendario
      ? { nome: calendario.nome, cor: calendario.cor, faixa_inicio: hhmm(calendario.faixa_inicio), faixa_fim: hhmm(calendario.faixa_fim), padrao: calendario.padrao, slot: calendario.slot_minutos ? String(calendario.slot_minutos) : "", tag: calendario.tag_padrao_id ?? "" }
      : { nome: "", cor: CORES_CALENDARIO[(outros.length + 1) % CORES_CALENDARIO.length], faixa_inicio: "07:00", faixa_fim: "20:00", padrao: outros.length === 0, slot: "", tag: "" });
  }, [open, calendario, outros.length]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    const e: Record<string, string> = {};
    if (!f.nome.trim()) e.nome = "Dê um nome ao calendário";
    if (f.nome.trim().length > 60) e.nome = "Nome muito longo";
    if (!horaValida(f.faixa_inicio)) e.faixa_inicio = "Hora inválida";
    if (!horaValida(f.faixa_fim)) e.faixa_fim = "Hora inválida";
    else if (minutosDoDia(f.faixa_fim) <= minutosDoDia(f.faixa_inicio)) e.faixa_fim = "O fim tem que ser depois do início";
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    try {
      const tagValida = minhasTags.some((t) => t.id === f.tag);
      const dados = { nome: f.nome.trim(), cor: f.cor, faixa_inicio: f.faixa_inicio, faixa_fim: f.faixa_fim, padrao: f.padrao, slot_minutos: f.slot ? Number(f.slot) : null,
        // só manda a tag padrão quando a lista das tags chegou (sem ela, não apaga a que o calendário tinha)
        ...(minhasTags.length ? { tag_padrao_id: tagValida ? f.tag : null } : {}) };
      if (calendario) await atualizarCalendario(calendario.id, dados);
      else await criarCalendario(uid, contaId, dados);
      if (f.padrao) await Promise.all(outros.filter((c) => c.padrao).map((c) => atualizarCalendario(c.id, { padrao: false })));
      toast.success(calendario ? "Calendário atualizado" : "Calendário criado");
      onSalvo();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o calendário");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!calendario) return;
    setExcluindo(true);
    try {
      await excluirCalendario(calendario.id);
      toast.success("Calendário excluído");
      setConfirmar(false);
      onSalvo();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir");
    } finally {
      setExcluindo(false);
    }
  };

  const slotEfetivo = f.slot ? Number(f.slot) : regras.slot_minutos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "sm:max-w-md")} data-modal-calendario={editando ? "editar" : "novo"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>{editando ? "Editar calendário" : "Novo calendário"}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>Nome, cor, a tag padrão, a faixa da visão semana e a duração do slot desta agenda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-form-calendario>
          <Campo rotulo="Nome *" erro={erros.nome}>
            <input className={INPUT} value={f.nome} placeholder="ex.: Consultório centro" onChange={(e) => set("nome", e.target.value)} data-campo-nome-calendario />
          </Campo>
          <Campo rotulo="Cor">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do calendário">
              {CORES_CALENDARIO.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.cor === c} onClick={() => set("cor", c)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 transition", f.cor === c ? "border-texto" : "border-transparent")}
                  style={{ background: c }} data-cor={c} aria-label={c}>
                  {f.cor === c && <Check className="h-4 w-4 text-[#09090B]" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Tag padrão" dica="A tag que já vem marcada quando você agenda neste calendário (dá para trocar na hora).">
            <select className={SELECT} value={minhasTags.some((t) => t.id === f.tag) ? f.tag : ""} onChange={(e) => set("tag", e.target.value)}
              disabled={!minhasTags.length} data-campo-tag-padrao>
              <option value="">Nenhuma (pelo seu papel e pelo aluno)</option>
              {minhasTags.map((t) => <option key={t.id} value={t.id}>{t.base ? t.nome : `${t.nome} · ${rotuloArea(t.area)}`}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Duração do slot desta agenda" dica={`${textoSlotsPorDia(regras, slotEfetivo)} no horário de atendimento (${regras.atende_inicio}–${regras.atende_fim}).`}>
            <select className={SELECT} value={f.slot} onChange={(e) => set("slot", e.target.value)} data-campo-slot-calendario>
              <option value="">Padrão da agenda ({regras.slot_minutos} min)</option>
              {DURACOES_SLOT.map((d) => <option key={d} value={String(d)}>{d} min</option>)}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Visão semana — de" erro={erros.faixa_inicio}>
              <input type="time" step={1800} className={INPUT} value={f.faixa_inicio} onChange={(e) => set("faixa_inicio", e.target.value)} data-campo-faixa-inicio />
            </Campo>
            <Campo rotulo="até" erro={erros.faixa_fim}>
              <input type="time" step={1800} className={INPUT} value={f.faixa_fim} onChange={(e) => set("faixa_fim", e.target.value)} data-campo-faixa-fim />
            </Campo>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-texto">
            <input type="checkbox" className="h-4 w-4 accent-[#8B5CF6]" checked={f.padrao} onChange={(e) => set("padrao", e.target.checked)} data-campo-padrao />
            Calendário padrão (sugerido nos novos agendamentos e onde o aluno marca)
          </label>
          <div className="flex items-center justify-between gap-2 pt-1">
            {editando && outros.length > 0 ? (
              <button type="button" className={BTN_PERIGO} onClick={() => setConfirmar(true)} data-btn-excluir-calendario>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Excluir
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)}>Cancelar</button>
              <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()} data-btn-salvar-calendario>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>

        <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
          <AlertDialogContent className={JANELA}>
            <AlertDialogHeader>
              <AlertDialogTitle className={TITULO_JANELA}>Excluir o calendário "{calendario?.nome}"?</AlertDialogTitle>
              <AlertDialogDescription className={DESCRICAO_JANELA}>Os agendamentos dele saem da agenda junto (vão para a lixeira).</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-calendario>
                {excluindo ? "Excluindo…" : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
