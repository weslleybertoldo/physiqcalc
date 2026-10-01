// Physiq W20 — "Horários e regras" da agenda (pedido dele 01/10): a duração padrão do slot, o horário e os dias de atendimento (o
// aluno só marca dentro deles), quantas vezes o aluno reagenda cada consulta (padrão 1), a janela do reagendamento (3 opções) e a
// desistência pelo app. Embaixo, a mensagem que o aluno vê ao clicar em Reagendar, montada pelas mesmas regras.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import {
  DIAS_CURTOS, DURACOES_SLOT, JANELAS, hojeSP, mensagemReagendar, mesDe, minutosDe, textoSlotsPorDia, type Janela, type RegrasAgenda,
} from "@/agenda/regras";
import { salvarRegras } from "./dados";
import { horaValida } from "./visao";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  uid: string;
  regras: RegrasAgenda;
  nome: string | null;
  onSalvo: (r: RegrasAgenda) => void;
}

export default function RegrasDialog({ open, onOpenChange, uid, regras, nome, onSalvo }: Props) {
  const [r, setR] = useState<RegrasAgenda>(regras);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setR(regras);
      setErro(null);
    }
  }, [open, regras]);

  const set = <K extends keyof RegrasAgenda>(k: K, v: RegrasAgenda[K]) => setR((x) => ({ ...x, [k]: v }));
  const alternarDia = (d: number) => set("dias", r.dias.includes(d) ? r.dias.filter((x) => x !== d) : [...r.dias, d].sort((a, b) => a - b));

  const salvar = async () => {
    if (!horaValida(r.atende_inicio) || !horaValida(r.atende_fim)) return setErro("Hora inválida");
    if (minutosDe(r.atende_fim) <= minutosDe(r.atende_inicio)) return setErro("O fim do atendimento tem que ser depois do início");
    if (minutosDe(r.atende_fim) - minutosDe(r.atende_inicio) < r.slot_minutos) return setErro("O horário de atendimento é menor que 1 slot");
    setErro(null);
    setSalvando(true);
    try {
      const salvo = await salvarRegras(uid, r);
      toast.success("Regras da agenda salvas");
      onSalvo(salvo);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as regras");
    } finally {
      setSalvando(false);
    }
  };

  const hoje = hojeSP();
  const exemplo = mensagemReagendar({ regras: r, reagendamentos: 0, mesRef: mesDe(hoje), hoje, inicio: new Date().toISOString(), profissional: nome, pacote: null });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "max-h-[92vh] overflow-y-auto sm:max-w-xl")} data-modal-regras>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Horários e regras da agenda</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>Valem para os seus alunos: o app só oferece os horários livres dentro do seu atendimento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-form-regras>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Duração padrão do slot" dica={textoSlotsPorDia(r)}>
              <select className={SELECT} value={String(r.slot_minutos)} onChange={(e) => set("slot_minutos", Number(e.target.value))} data-campo-slot>
                {DURACOES_SLOT.map((d) => <option key={d} value={String(d)}>{d} min</option>)}
              </select>
            </Campo>
            <Campo rotulo="Atendimento — das">
              <input type="time" step={900} className={INPUT} value={r.atende_inicio} onChange={(e) => set("atende_inicio", e.target.value)} data-campo-atende-inicio />
            </Campo>
            <Campo rotulo="às">
              <input type="time" step={900} className={INPUT} value={r.atende_fim} onChange={(e) => set("atende_fim", e.target.value)} data-campo-atende-fim />
            </Campo>
          </div>

          <Campo rotulo="Dias de atendimento" dica="Desmarque os dias em que você não atende.">
            <div className="grid grid-cols-7 gap-1.5" data-campo-dias={r.dias.join(",")}>
              {DIAS_CURTOS.map((d, i) => {
                const ativo = r.dias.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={ativo} onClick={() => alternarDia(i)}
                    className={cn("h-10 rounded-xl border text-[12.5px] font-semibold capitalize transition-colors",
                      ativo ? "border-violeta-2/60 bg-[rgba(139,92,246,.16)] text-texto" : "border-linha-2 bg-[rgba(255,255,255,.02)] text-texto-4 line-through")}
                    data-dia-btn={i}>
                    {d}
                  </button>
                );
              })}
            </div>
          </Campo>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
            <Campo rotulo="O aluno reagenda" dica="Por consulta. 0 = só você muda a data.">
              <select className={SELECT} value={String(r.reagendamentos_max)} onChange={(e) => set("reagendamentos_max", Number(e.target.value))} data-campo-reagendamentos>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{n === 0 ? "Não reagenda" : n === 1 ? "1 vez" : `${n} vezes`}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Para quando ele pode reagendar">
              <div className="space-y-1.5" role="radiogroup" aria-label="Janela do reagendamento" data-campo-janela={r.janela_reagendamento}>
                {JANELAS.map((j) => (
                  <button key={j.valor} type="button" role="radio" aria-checked={r.janela_reagendamento === j.valor} onClick={() => set("janela_reagendamento", j.valor as Janela)}
                    className={cn("flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
                      r.janela_reagendamento === j.valor ? "border-violeta-2/60 bg-[rgba(139,92,246,.12)]" : "border-linha-2 bg-[rgba(255,255,255,.02)] hover:border-linha-3")}
                    data-janela-btn={j.valor}>
                    <span className={cn("mt-0.5 h-3.5 w-3.5 flex-none rounded-full border-2", r.janela_reagendamento === j.valor ? "border-violeta-2 bg-violeta-2" : "border-linha-2")} aria-hidden />
                    <span>
                      <b className="block text-[13px] font-semibold text-texto">{j.rotulo}{j.valor === "mes" ? " (padrão)" : ""}</b>
                      <span className="block text-[11.5px] leading-snug text-texto-3">{j.explica}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Campo>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-texto">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#8B5CF6]" checked={r.desistencia} onChange={(e) => set("desistencia", e.target.checked)} data-campo-desistencia />
            <span>
              O aluno pode desistir da consulta pelo app
              <span className="block text-[11.5px] text-texto-3">Ele confirma antes e vê o que perde (com pacote, a consulta do mês conta como usada).</span>
            </span>
          </label>

          <div className="rounded-2xl border border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.07)] px-3.5 py-3" data-exemplo-mensagem>
            <span className="text-[11.5px] font-semibold text-ambar-3">O que o aluno lê ao clicar em Reagendar</span>
            <p className="mt-1 text-[12.5px] leading-relaxed text-texto">{exemplo.texto}</p>
          </div>

          {erro && <p className="text-[12px] text-rosa-3" role="alert">{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)}>Cancelar</button>
            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()} data-btn-salvar-regras>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
