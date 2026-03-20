import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ModalCriarGrupoPessoal from "./ModalCriarGrupoPessoal";

interface Grupo {
  id: string;
  nome: string;
}

interface Props {
  gruposGlobais: Grupo[];
  gruposPessoais: Grupo[];
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (grupoId: string | null, isPessoal: boolean) => void;
  onRefresh: () => void;
}

const ModalAlterarGrupo = ({ gruposGlobais, gruposPessoais, userId, open, onOpenChange, onSelect, onRefresh }: Props) => {
  const [showCriar, setShowCriar] = useState(false);

  const handleDeleteGrupoPessoal = async (id: string) => {
    await supabase.from("tb_grupos_treino_usuario").delete().eq("id", id).eq("user_id", userId);
    toast.success("Grupo removido");
    onRefresh();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-background border-muted-foreground/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">🔄 Alterar Grupo</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground font-body mb-4">
            Válido somente para este dia — não altera a programação padrão.
          </p>

          {/* Opção: Sem treino hoje */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => { onSelect(null, false); onOpenChange(false); }}
              className="w-full text-left px-4 py-3 border border-dashed border-destructive/40 hover:border-destructive hover:bg-destructive/5 transition-colors font-heading text-sm text-muted-foreground flex items-center gap-2"
            >
              <X size={14} className="text-destructive" />
              Sem treino hoje (dia de descanso)
            </button>
          </div>

          {/* Global groups */}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">
            Grupos do Treinador
          </p>
          <div className="space-y-2 mb-4">
            {gruposGlobais.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { onSelect(g.id, false); onOpenChange(false); }}
                className="w-full text-left px-4 py-3 border border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-colors font-heading text-sm text-foreground"
              >
                {g.nome}
              </button>
            ))}
          </div>

          {/* Personal groups */}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">
            Meus Grupos
          </p>
          <div className="space-y-2 mb-4">
            {gruposPessoais.length === 0 ? (
              <p className="text-xs text-muted-foreground font-body">Nenhum grupo pessoal criado.</p>
            ) : (
              gruposPessoais.map((g) => (
                <div key={g.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { onSelect(g.id, true); onOpenChange(false); }}
                    className="flex-1 text-left px-4 py-3 border border-primary/30 hover:border-primary hover:bg-primary/5 transition-colors font-heading text-sm text-foreground"
                  >
                    {g.nome}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGrupoPessoal(g.id)}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => setShowCriar(true)}
              className="w-full text-left px-4 py-3 border border-dashed border-primary/50 hover:bg-primary/5 transition-colors font-heading text-xs text-primary uppercase tracking-wider"
            >
              <Plus size={14} className="inline mr-1" /> Criar novo grupo
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ModalCriarGrupoPessoal
        userId={userId}
        open={showCriar}
        onOpenChange={setShowCriar}
        onCreated={() => { setShowCriar(false); onRefresh(); }}
      />
    </>
  );
};

export default ModalAlterarGrupo;
