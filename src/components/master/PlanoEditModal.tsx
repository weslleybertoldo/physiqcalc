import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { fmtBRL, masterPlanos, type PlanoProfessor } from "@/lib/saasApi";
import { BTN_NEUTRO, BTN_PRIMARIO, Campo, DIALOG_CONTENT, INPUT, mensagemErro, numOuNull } from "@/components/master/masterUi";

interface ResultadoUpdate { plano: PlanoProfessor; assinaturasAtualizadas: number; assinaturasFalhas: number; avisados: number }

interface Props {
  /** plano a editar · "novo" = criar · null = fechado */
  plano: PlanoProfessor | "novo" | null;
  onClose: () => void;
  onSalvo: () => void;
}

// Editar/criar plano de professor (master-planos `update` / `create`).
export default function PlanoEditModal({ plano, onClose, onSalvo }: Props) {
  const aberto = plano !== null;
  const novo = plano === "novo";
  const p = novo || plano === null ? null : plano;

  const [nome, setNome] = useState("");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("");
  const [mensal, setMensal] = useState("");
  const [anual, setAnual] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<ResultadoUpdate | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setResultado(null);
    if (p) {
      setNome(p.nome);
      setMin(String(p.min_alunos ?? 0));
      setMax(p.max_alunos == null ? "" : String(p.max_alunos));
      setMensal(String(Number(p.valor_mensal)));
      setAnual(p.valor_anual == null ? "" : String(Number(p.valor_anual)));
      setAtivo(!!p.ativo);
    } else {
      setNome(""); setMin("1"); setMax(""); setMensal(""); setAnual(""); setAtivo(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano]);

  const mensalNum = numOuNull(mensal);
  const anualNum = numOuNull(anual);
  const minNum = numOuNull(min);
  const maxNum = max.trim() === "" ? null : numOuNull(max);
  const anualAuto = mensalNum != null ? Number((mensalNum * 10).toFixed(2)) : null;
  const valorMudou = !!p && mensalNum != null && Number(p.valor_mensal) !== mensalNum;

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do plano."); return; }
    if (mensalNum == null || mensalNum < 0) { toast.error("Informe um valor mensal válido."); return; }
    if (minNum == null || minNum < 0) { toast.error("Mínimo de alunos inválido."); return; }
    if (max.trim() !== "" && (maxNum == null || maxNum < 1)) { toast.error("Máximo de alunos inválido (vazio = ilimitado)."); return; }
    if (maxNum != null && minNum > maxNum) { toast.error("O mínimo não pode ser maior que o máximo."); return; }
    if (anual.trim() !== "" && (anualNum == null || anualNum < 0)) { toast.error("Valor anual inválido (vazio = 10× automático)."); return; }
    setBusy(true);
    try {
      const payload = {
        nome: nome.trim(), min_alunos: Math.round(minNum), max_alunos: maxNum == null ? null : Math.round(maxNum),
        valor_mensal: mensalNum, valor_anual: anual.trim() === "" ? null : anualNum, ativo,
      };
      if (novo) {
        await masterPlanos("create", payload);
        toast.success("Plano criado.");
        onSalvo();
        onClose();
      } else {
        const r = await masterPlanos<ResultadoUpdate>("update", { id: p!.id, ...payload });
        onSalvo();
        toast.success("Plano salvo.");
        if (valorMudou) setResultado(r); else onClose();
      }
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-md`} data-dialog-plano={novo ? "novo" : p?.id}>
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">{novo ? "Novo plano" : `Editar ${p?.nome ?? "plano"}`}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {novo ? "Plano novo já aparece pros professores se estiver ativo." : `${p?.professores ?? 0} professor(es) neste plano.`}
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4" data-resultado-plano>
            <div className="border border-primary/40 bg-primary/5 p-4 text-sm font-body space-y-1">
              <p className="text-foreground">Valor mensal alterado — reflexo nos professores:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>• Assinaturas no cartão atualizadas: <span className="text-foreground">{resultado.assinaturasAtualizadas}</span></li>
                <li>• Assinaturas que falharam (marcadas pra recriar): <span className={resultado.assinaturasFalhas > 0 ? "text-destructive" : "text-foreground"}>{resultado.assinaturasFalhas}</span></li>
                <li>• Professores avisados no app: <span className="text-foreground">{resultado.avisados}</span></li>
              </ul>
              <p className="text-[11px] text-muted-foreground pt-1">O valor novo vale a partir do próximo ciclo de cada professor (o ciclo atual fica congelado).</p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={BTN_PRIMARIO}>Fechar</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Campo rotulo="Nome">
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} className={INPUT} placeholder="Ex.: Studio" autoFocus data-input-nome />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Mín. alunos">
                <input type="number" inputMode="numeric" min={0} value={min} onChange={(e) => setMin(e.target.value)} className={INPUT} data-input-min />
              </Campo>
              <Campo rotulo="Máx. alunos" dica="Vazio = ilimitado">
                <input type="number" inputMode="numeric" min={1} value={max} onChange={(e) => setMax(e.target.value)} className={INPUT} placeholder="∞" data-input-max />
              </Campo>
              <Campo rotulo="Mensal (R$)">
                <input type="text" inputMode="decimal" value={mensal} onChange={(e) => setMensal(e.target.value)} className={INPUT} placeholder="79,90" data-input-mensal />
              </Campo>
              <Campo rotulo="Anual (R$)" dica={anual.trim() === "" ? `Vazio = 10× automático${anualAuto != null ? ` = ${fmtBRL(anualAuto)}` : ""}` : anualAuto != null ? `(10× seria ${fmtBRL(anualAuto)})` : undefined}>
                <input type="text" inputMode="decimal" value={anual} onChange={(e) => setAnual(e.target.value)} className={INPUT} placeholder={anualAuto != null ? String(anualAuto) : "automático"} data-input-anual />
              </Campo>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground font-body">{ativo ? "Plano ativo" : "Plano desativado"}</p>
                <p className="text-[10px] text-muted-foreground font-body">Desativado não aparece pra novos professores; quem já está nele continua.</p>
              </div>
              <Switch checked={ativo} onCheckedChange={setAtivo} data-switch-ativo />
            </div>
            {!novo && (
              <p className={`text-[11px] font-body border p-2.5 ${valorMudou ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`} data-previa>
                {p?.professores ?? 0} professor(es) neste plano · o nome muda na hora; o valor novo vale a partir do próximo ciclo de cada professor; assinaturas no cartão são atualizadas e eles recebem aviso.
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={onClose} className={BTN_NEUTRO}>Cancelar</button>
              <button type="button" onClick={() => void salvar()} disabled={busy} className={BTN_PRIMARIO} data-btn-salvar-plano>
                {busy ? "Salvando..." : novo ? "Criar plano" : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
