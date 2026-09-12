import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { masterProfessores, planoComValor, type AlunoRow, type ProfessorRow } from "@/lib/saasApi";
import {
  BTN_NEUTRO, BTN_PRIMARIO, Campo, DIALOG_CONTENT, SELECT_CONTENT, SELECT_TRIGGER, alunosTexto, mensagemErro,
} from "@/components/master/masterUi";

interface Props {
  /** alunos a mover (null = fechado) */
  alunos: AlunoRow[] | null;
  professores: ProfessorRow[];
  onClose: () => void;
  onMovido: (movidos: number) => void;
}

const SEM_PROFESSOR = "__sem_professor__";

// Mover aluno(s) para outro professor ou para a fila "Sem professor" — SÓ o master move (decisão do Weslley).
export default function MoverAlunosDialog({ alunos, professores, onClose, onMovido }: Props) {
  const [paraId, setParaId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setParaId(""); }, [alunos]);

  const n = alunos?.length ?? 0;
  const origemUnica = alunos && alunos.length > 0 && alunos.every((a) => (a.professor_id ?? null) === (alunos[0].professor_id ?? null))
    ? (alunos[0].professor_id ?? null) : undefined;
  const ativos = professores.filter((p) => p.status === "ativo");
  const destino = ativos.find((p) => p.id === paraId) ?? null;
  const lotado = !!(destino && destino.plano?.max_alunos != null && destino.alunos + n > destino.plano.max_alunos);

  const mover = async () => {
    if (!alunos || !paraId) return;
    setBusy(true);
    try {
      const r = await masterProfessores<{ ok: boolean; movidos: number }>("move-alunos", {
        paraId: paraId === SEM_PROFESSOR ? null : paraId,
        alunoIds: alunos.map((a) => a.id),
      });
      toast.success(r.movidos === 1 ? "1 aluno movido." : `${r.movidos} alunos movidos.`);
      onMovido(r.movidos);
      onClose();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!alunos} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-sm`} data-dialog-mover-alunos>
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">
            Mover {n === 1 ? "aluno" : `${n} alunos`}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {n === 1 ? (alunos![0].nome || alunos![0].email) : alunos?.slice(0, 3).map((a) => a.nome || a.email).join(", ") + (n > 3 ? ` +${n - 3}` : "")}
          </DialogDescription>
        </DialogHeader>

        <Campo rotulo="Destino">
          <Select value={paraId} onValueChange={setParaId}>
            <SelectTrigger className={SELECT_TRIGGER} data-select-destino><SelectValue placeholder="Escolha o professor" /></SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              <SelectItem value={SEM_PROFESSOR} disabled={origemUnica === null}>— Sem professor (fila) —</SelectItem>
              {ativos.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={origemUnica === p.id}>
                  {p.nome}{p.ehMaster ? " (master)" : ""} · {alunosTexto(p.alunos, p.plano?.max_alunos)} · {planoComValor(p.plano)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        {lotado && (
          <p className="text-xs text-classify-yellow font-body" data-aviso-lotado>
            O plano de {destino!.nome} aceita até {destino!.plano!.max_alunos} alunos (hoje {destino!.alunos}). A edge vai recusar (`limite_plano_destino`) — troque o plano dele antes.
          </p>
        )}
        <p className="text-[10px] text-muted-foreground font-body">
          Só o master move alunos. Quem vai pra fila "Sem professor" continua usando o app, mas sem treinos novos até ser vinculado.
        </p>

        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onClose} className={BTN_NEUTRO}>Cancelar</button>
          <button type="button" onClick={() => void mover()} disabled={busy || !paraId} className={BTN_PRIMARIO} data-btn-confirmar-mover>
            {busy ? "Movendo..." : "Mover"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
