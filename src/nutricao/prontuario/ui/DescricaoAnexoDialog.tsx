// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/components/anexos/DescricaoAnexoDialog.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN_PRI, BTN_SEC, Campo, INPUT } from "@/nutricao/editor/ui/estilos";
import { atualizarDescricao, type Anexo } from "@/nutricao/prontuario/lib/anexos";
import { DESCRICAO_MAX } from "@/nutricao/editor/lib/anexosUtil";

// Modal "descrição do arquivo": um texto curto pra nutricionista lembrar o que é o anexo (ex.: "exames de setembro").
interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  anexo: Anexo | null;
  onSalvo: (a: Anexo) => void;
}

export default function DescricaoAnexoDialog({ open, onOpenChange, anexo, onSalvo }: Props) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) setValor(anexo?.descricao ?? "");
  }, [open, anexo]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!anexo) return;
    setSalvando(true);
    try {
      onSalvo(await atualizarDescricao(anexo.id, valor));
      toast.success("Descrição salva");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a descrição");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-tela border-linha-2 sm:max-w-md" data-modal-descricao-anexo>
        <DialogHeader>
          <DialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Descrição do arquivo</DialogTitle>
          <DialogDescription className="font-body text-xs break-all">{anexo?.nome ?? ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4" noValidate data-form-descricao-anexo>
          <Campo rotulo="Descrição" dica={`${valor.length}/${DESCRICAO_MAX} · opcional`}>
            <input
              className={INPUT}
              value={valor}
              maxLength={DESCRICAO_MAX}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex.: exames de sangue de setembro"
              autoFocus
              data-campo-descricao-anexo
            />
          </Campo>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-descricao-anexo>Cancelar</button>
            <button type="submit" className={BTN_PRI} disabled={salvando} data-btn-salvar-descricao-anexo>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
