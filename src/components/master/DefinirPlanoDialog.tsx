import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { masterProfessores, planoComValor } from "@/lib/saasApi";
import {
  BTN_NEUTRO, BTN_PRIMARIO, Campo, DIALOG_CONTENT, ErroCarregar, SELECT_CONTENT, SELECT_TRIGGER, mensagemErro, usePlanosMaster,
} from "@/components/master/masterUi";

/** o suficiente pra ProfessorRow e FinanceiroLinha (plano em snake ou camel) */
export interface ProfessorParaPlano {
  id: string;
  nome: string;
  alunos: number;
  plano: { id: string; nome: string; valor_mensal?: number | string; valorMensal?: number } | null;
}

interface Props {
  professor: ProfessorParaPlano | null;
  onClose: () => void;
  onSalvo: () => void;
}

const SEM_PLANO = "__sem_plano__";

// "Definir plano" / "Mudar plano" de um professor → master-professores `set-plano` (planoId | null).
export default function DefinirPlanoDialog({ professor, onClose, onSalvo }: Props) {
  const { planos, loading, erro, recarregar } = usePlanosMaster(!!professor);
  const [planoId, setPlanoId] = useState<string>(SEM_PLANO);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPlanoId(professor?.plano?.id ?? SEM_PLANO); }, [professor]);

  const escolhido = planos.find((p) => p.id === planoId) ?? null;
  const acimaDoLimite = !!(professor && escolhido && escolhido.max_alunos !== null && professor.alunos > escolhido.max_alunos);
  const mudou = (professor?.plano?.id ?? SEM_PLANO) !== planoId;

  const salvar = async () => {
    if (!professor) return;
    setBusy(true);
    try {
      await masterProfessores("set-plano", { userId: professor.id, planoId: planoId === SEM_PLANO ? null : planoId });
      toast.success(`Plano de ${professor.nome}: ${escolhido ? planoComValor(escolhido) : "sem plano"}.`);
      onSalvo();
      onClose();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!professor} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-sm`} data-dialog-definir-plano>
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">Definir plano</DialogTitle>
          <DialogDescription className="font-body text-xs">
            {professor?.nome} · hoje: <span className="text-primary">{planoComValor(professor?.plano)}</span> · {professor?.alunos ?? 0} aluno(s)
          </DialogDescription>
        </DialogHeader>

        {erro && <ErroCarregar texto={erro} onRetry={() => void recarregar()} />}

        <Campo rotulo="Plano">
          <Select value={planoId} onValueChange={setPlanoId} disabled={loading}>
            <SelectTrigger className={SELECT_TRIGGER} data-select-plano><SelectValue placeholder={loading ? "Carregando..." : "Escolha o plano"} /></SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              <SelectItem value={SEM_PLANO}>Sem plano</SelectItem>
              {planos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {planoComValor(p)} · {p.max_alunos === null ? "ilimitado" : `até ${p.max_alunos}`}{p.ativo ? "" : " (desativado)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        {acimaDoLimite && (
          <p className="text-xs text-classify-yellow font-body" data-aviso-limite>
            Atenção: {professor!.alunos} alunos, mas esse plano aceita até {escolhido!.max_alunos}. A troca não é bloqueada, mas ele fica acima do limite e não recebe alunos novos.
          </p>
        )}
        <p className="text-[10px] text-muted-foreground font-body">
          O nome muda na hora; o valor novo vale a partir do próximo ciclo dele (o ciclo atual fica congelado).
        </p>

        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onClose} className={BTN_NEUTRO}>Cancelar</button>
          <button type="button" onClick={() => void salvar()} disabled={busy || loading || !mudou} className={BTN_PRIMARIO} data-btn-salvar-plano>
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
