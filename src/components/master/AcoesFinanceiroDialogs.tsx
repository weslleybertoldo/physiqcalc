import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtData, masterFinanceiro } from "@/lib/saasApi";
import {
  BTN_NEUTRO, BTN_PERIGO, BTN_PRIMARIO, Campo, DIALOG_CONTENT, INPUT, TEXTAREA, addDiasISO, hojeISO, mensagemErro,
} from "@/components/master/masterUi";

// Diálogos das ações do Financeiro que pedem um dado a mais (data / mensagem).
// Usados na linha compacta da lista E dentro do modal do professor.

export interface AlvoAcao {
  id: string;
  nome: string;
  acessoLiberadoAte?: string | null;
}

interface Props {
  /** professor alvo (null = fechado) */
  alvo: AlvoAcao | null;
  onClose: () => void;
  /** depois da edge responder ok (recarregar lista/detalhe) */
  onFeito: () => void;
}

function Rodape({ onClose, onOk, busy, rotulo, perigo }: { onClose: () => void; onOk: () => void; busy: boolean; rotulo: string; perigo?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" onClick={onClose} className={BTN_NEUTRO}>Cancelar</button>
      <button type="button" onClick={onOk} disabled={busy} className={perigo ? BTN_PERIGO : BTN_PRIMARIO} data-btn-ok>
        {busy ? "Aguarde..." : rotulo}
      </button>
    </div>
  );
}

const Titulo = ({ children }: { children: React.ReactNode }) => (
  <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">{children}</DialogTitle>
);

/** master-financeiro `liberar-acesso-ate { userId, ate, motivo? }` */
export function LiberarAcessoDialog({ alvo, onClose, onFeito }: Props) {
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const hoje = hojeISO();

  useEffect(() => {
    if (!alvo) return;
    setAte(alvo.acessoLiberadoAte && alvo.acessoLiberadoAte >= hoje ? alvo.acessoLiberadoAte : addDiasISO(hoje, 7));
    setMotivo("");
  }, [alvo, hoje]);

  const salvar = async () => {
    if (!alvo) return;
    if (!ate || ate < hoje) { toast.error("Escolha uma data de hoje em diante."); return; }
    setBusy(true);
    try {
      await masterFinanceiro("liberar-acesso-ate", { userId: alvo.id, ate, ...(motivo.trim() ? { motivo: motivo.trim().slice(0, 200) } : {}) });
      toast.success(`Acesso de ${alvo.nome} liberado até ${fmtData(ate)}.`);
      onFeito();
      onClose();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-sm`} data-dialog-liberar-acesso>
        <DialogHeader className="text-left">
          <Titulo>Liberar acesso</Titulo>
          <DialogDescription className="font-body text-xs">
            {alvo?.nome} volta a usar o painel até a data escolhida, mesmo com a mensalidade em atraso. A cobrança continua.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <Campo rotulo="Liberar até">
            <input type="date" value={ate} min={hoje} onChange={(e) => setAte(e.target.value)} className={INPUT} data-input-ate />
          </Campo>
          <Campo rotulo="Motivo (opcional)" dica="Fica registrado nos avisos do professor.">
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={200} className={TEXTAREA} placeholder="Ex.: combinou pagar dia 20" />
          </Campo>
        </div>
        <Rodape onClose={onClose} onOk={() => void salvar()} busy={busy} rotulo="Liberar" />
      </DialogContent>
    </Dialog>
  );
}

/** master-financeiro `bloquear-alunos { userId, msg? }` */
export function BloquearAlunosDialog({ alvo, onClose, onFeito }: Props) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (alvo) setMsg(""); }, [alvo]);

  const bloquear = async () => {
    if (!alvo) return;
    setBusy(true);
    try {
      await masterFinanceiro("bloquear-alunos", { userId: alvo.id, ...(msg.trim() ? { msg: msg.trim().slice(0, 300) } : {}) });
      toast.success(`Alunos de ${alvo.nome} bloqueados.`);
      onFeito();
      onClose();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-sm`} data-dialog-bloquear-alunos>
        <DialogHeader className="text-left">
          <Titulo>Bloquear alunos de {alvo?.nome}?</Titulo>
          <DialogDescription className="font-body text-xs">
            Os alunos dele passam a ver a tela "Acesso pausado" até você desbloquear. Use quando o professor está travado e não responde.
          </DialogDescription>
        </DialogHeader>
        <Campo rotulo="Mensagem pros alunos (opcional)" dica="Até 300 caracteres. Sem mensagem, vai o texto padrão.">
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={300} className={TEXTAREA} placeholder="Ex.: Seu professor está com pendência no PhysiqCalc. Fale com ele." data-input-msg />
        </Campo>
        <Rodape onClose={onClose} onOk={() => void bloquear()} busy={busy} rotulo="Bloquear alunos" perigo />
      </DialogContent>
    </Dialog>
  );
}

/** master-financeiro `reenviar-aviso { userId, mensagem? }` */
export function ReenviarAvisoDialog({ alvo, onClose, onFeito }: Props) {
  const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (alvo) setMensagem(""); }, [alvo]);

  const enviar = async () => {
    if (!alvo) return;
    setBusy(true);
    try {
      await masterFinanceiro("reenviar-aviso", { userId: alvo.id, ...(mensagem.trim() ? { mensagem: mensagem.trim().slice(0, 300) } : {}) });
      toast.success(`Aviso registrado no app de ${alvo.nome}.`);
      onFeito();
      onClose();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-sm`} data-dialog-reenviar-aviso>
        <DialogHeader className="text-left">
          <Titulo>Reenviar aviso</Titulo>
          <DialogDescription className="font-body text-xs">
            Aparece no app de {alvo?.nome} (canal manual). Não envia e-mail nem WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <Campo rotulo="Mensagem (opcional)" dica='Vazio = "Sua mensalidade está pendente. Regularize em Planos para não perder o acesso."'>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} maxLength={300} className={TEXTAREA} data-input-mensagem />
        </Campo>
        <Rodape onClose={onClose} onOk={() => void enviar()} busy={busy} rotulo="Enviar aviso" />
      </DialogContent>
    </Dialog>
  );
}
