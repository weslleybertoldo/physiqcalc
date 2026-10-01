// Physiq W20 — "Travar horários" (pedido dele 01/10) + o "Bloquear datas" do site antigo, num lugar só:
//   · Recorrente — os mesmos horários todo dia (ou nos dias marcados), até você liberar (ex.: 13:00–14:00, almoço) → agenda_travas;
//   · Avulsa — só aqueles horários daquele dia; nos outros dias não há trava → bloqueios_agenda (o site antigo também mostra);
//   · Dias inteiros — feriado, férias, congresso → bloqueios_agenda (o "Bloquear datas" de hoje).
// O aluno nunca marca nem reagenda num horário travado ou bloqueado (o banco confere).
import { useEffect, useState } from "react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { DIAS_CURTOS, minutosDe, type RegrasAgenda } from "@/agenda/regras";
import { criarBloqueio, criarTrava, type Calendario } from "./dados";
import { chaveDia, combinarDataHora, dataValida, horaValida } from "./visao";

export type ModoTrava = "recorrente" | "avulsa" | "dias";

const MODOS: { valor: ModoTrava; rotulo: string; explica: string }[] = [
  { valor: "recorrente", rotulo: "Recorrente", explica: "Os mesmos horários todo dia, até você liberar (ex.: almoço)." },
  { valor: "avulsa", rotulo: "Avulsa", explica: "Só estes horários deste dia. Nos outros dias, nada muda." },
  { valor: "dias", rotulo: "Dias inteiros", explica: "Feriado, férias, congresso: os dias ficam fechados." },
];

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  modoInicial?: ModoTrava;
  calendarios: Calendario[];
  uid: string;
  contaId: string | null;
  regras: RegrasAgenda;
  dataInicial?: Date;
  onSalvo: () => void;
}

interface Form {
  modo: ModoTrava;
  calendarioId: string;
  dias: number[];
  das: string;
  as: string;
  data: string;
  ate: string;
  motivo: string;
}

export default function TravaDialog({ open, onOpenChange, modoInicial = "recorrente", calendarios, uid, contaId, regras, dataInicial, onSalvo }: Props) {
  const meus = calendarios.filter((c) => c.nutricionista_id === uid);
  const [f, setF] = useState<Form>({ modo: modoInicial, calendarioId: "", dias: [0, 1, 2, 3, 4, 5, 6], das: "12:00", as: "13:00", data: chaveDia(new Date()), ate: chaveDia(new Date()), motivo: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = chaveDia(dataInicial ?? new Date());
    setErro(null);
    setF({ modo: modoInicial, calendarioId: "", dias: [...regras.dias], das: "12:00", as: "13:00", data: d, ate: d, motivo: "" });
  }, [open, modoInicial, dataInicial, regras.dias]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const alternarDia = (d: number) => set("dias", f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort((a, b) => a - b));

  const salvar = async () => {
    if (f.modo !== "dias" && (!horaValida(f.das) || !horaValida(f.as))) return setErro("Hora inválida");
    if (f.modo !== "dias" && minutosDe(f.as) <= minutosDe(f.das)) return setErro("O fim tem que ser depois do início");
    if (f.modo === "recorrente" && f.dias.length === 0) return setErro("Marque pelo menos um dia");
    if (f.modo !== "recorrente" && !dataValida(f.data)) return setErro("Data inválida");
    if (f.modo === "dias" && (!dataValida(f.ate) || f.ate < f.data)) return setErro("O fim tem que ser no mesmo dia ou depois");
    if (f.motivo.trim().length > 120) return setErro("Motivo muito longo");
    setErro(null);
    setSalvando(true);
    try {
      const motivo = f.motivo.trim() || null;
      const calendario = f.calendarioId || null;
      if (f.modo === "recorrente") {
        await criarTrava({ profissional_id: uid, conta_id: contaId, calendario_id: calendario, dias: f.dias, hora_inicio: f.das, hora_fim: f.as, motivo });
        toast.success("Horários travados");
      } else if (f.modo === "avulsa") {
        await criarBloqueio({ nutricionista_id: uid, conta_id: contaId, calendario_id: calendario, inicio: combinarDataHora(f.data, f.das).toISOString(), fim: combinarDataHora(f.data, f.as).toISOString(), motivo });
        toast.success("Horários travados neste dia");
      } else {
        await criarBloqueio({ nutricionista_id: uid, conta_id: contaId, calendario_id: calendario, inicio: combinarDataHora(f.data, "00:00").toISOString(), fim: addDays(combinarDataHora(f.ate, "00:00"), 1).toISOString(), motivo });
        toast.success("Datas bloqueadas");
      }
      onSalvo();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível travar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "sm:max-w-lg")} data-modal-trava={f.modo}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Travar horários</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>O aluno não marca nem reagenda nos horários travados. Você ainda pode encaixar alguém, com o aviso.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-form-trava>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tipo de trava">
            {MODOS.map((m) => (
              <button key={m.valor} type="button" role="radio" aria-checked={f.modo === m.valor} onClick={() => set("modo", m.valor)}
                className={cn("h-10 rounded-xl border text-[12.5px] font-semibold transition-colors",
                  f.modo === m.valor ? "border-violeta-2/60 bg-[rgba(139,92,246,.16)] text-texto" : "border-linha-2 bg-[rgba(255,255,255,.03)] text-texto-3 hover:text-texto")}
                data-modo-trava={m.valor}>
                {m.rotulo}
              </button>
            ))}
          </div>
          <p className="-mt-2 text-[12px] text-texto-3">{MODOS.find((m) => m.valor === f.modo)?.explica}</p>

          <Campo rotulo="Calendário">
            <select className={SELECT} value={f.calendarioId} onChange={(e) => set("calendarioId", e.target.value)} data-campo-trava-calendario>
              <option value="">Todos os meus calendários</option>
              {meus.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>

          {f.modo === "recorrente" && (
            <Campo rotulo="Nos dias">
              <div className="grid grid-cols-7 gap-1.5" data-campo-trava-dias={f.dias.join(",")}>
                {DIAS_CURTOS.map((d, i) => (
                  <button key={d} type="button" aria-pressed={f.dias.includes(i)} onClick={() => alternarDia(i)}
                    className={cn("h-9 rounded-xl border text-[12px] font-semibold capitalize transition-colors",
                      f.dias.includes(i) ? "border-violeta-2/60 bg-[rgba(139,92,246,.16)] text-texto" : "border-linha-2 text-texto-4")}
                    data-trava-dia={i}>
                    {d}
                  </button>
                ))}
              </div>
            </Campo>
          )}

          {f.modo !== "recorrente" && (
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={f.modo === "dias" ? "De" : "Dia"}>
                <input type="date" className={INPUT} value={f.data} onChange={(e) => set("data", e.target.value)} data-campo-trava-data />
              </Campo>
              {f.modo === "dias" && (
                <Campo rotulo="Até">
                  <input type="date" className={INPUT} value={f.ate} onChange={(e) => set("ate", e.target.value)} data-campo-trava-ate />
                </Campo>
              )}
            </div>
          )}

          {f.modo !== "dias" && (
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Das" dica={`Slots de ${regras.slot_minutos} min`}>
                <input type="time" step={300} className={INPUT} value={f.das} onChange={(e) => set("das", e.target.value)} data-campo-trava-das />
              </Campo>
              <Campo rotulo="Às">
                <input type="time" step={300} className={INPUT} value={f.as} onChange={(e) => set("as", e.target.value)} data-campo-trava-as />
              </Campo>
            </div>
          )}

          <Campo rotulo="Motivo">
            <input className={INPUT} value={f.motivo} maxLength={120} placeholder={f.modo === "dias" ? "ex.: Feriado" : "ex.: Almoço"} onChange={(e) => set("motivo", e.target.value)} data-campo-trava-motivo />
          </Campo>

          {erro && <p className="text-[12px] text-rosa-3" role="alert">{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)}>Cancelar</button>
            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()} data-btn-salvar-trava>{salvando ? "Salvando…" : "Travar"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
