import { useState } from "react";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import ModalCriarGrupoPessoal, { type GrupoParaEditar } from "./ModalCriarGrupoPessoal";

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
  const db = usePowerSync();
  const [showCriar, setShowCriar] = useState(false);
  const [grupoEditando, setGrupoEditando] = useState<GrupoParaEditar | null>(null);

  const handleDeleteGrupoPessoal = async (id: string, nome: string) => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o grupo "${nome}"?\n\nEssa ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      // Remove exercícios do grupo primeiro
      await db.execute(
        "DELETE FROM tb_grupos_exercicios_usuario WHERE grupo_usuario_id = ? AND user_id = ?",
        [id, userId]
      );
      // Remove o grupo
      await db.execute(
        "DELETE FROM tb_grupos_treino_usuario WHERE id = ? AND user_id = ?",
        [id, userId]
      );
      toast.success("Grupo removido");
      onRefresh();
    } catch (e) {
      console.error("[AlterarGrupo] Erro ao remover grupo:", e);
      toast.error("Erro ao remover grupo. Tente novamente.");
    }
  };

  const handleEditGrupo = (g: Grupo) => {
    setGrupoEditando({ id: g.id, nome: g.nome });
    setShowCriar(true);
  };

  const handleCriarNovo = () => {
    setGrupoEditando(null);
    setShowCriar(true);
  };

  const handleModalConcluido = () => {
    setShowCriar(false);
    setGrupoEditando(null);
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
                    onClick={() => handleEditGrupo(g)}
                    className="p-2 text-muted-foreground hover:text-primary transition-colors"
                    title="Editar grupo"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGrupoPessoal(g.id, g.nome)}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    title="Apagar grupo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={handleCriarNovo}
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
        onOpenChange={(v) => { setShowCriar(v); if (!v) setGrupoEditando(null); }}
        onCreated={handleModalConcluido}
        editGrupo={grupoEditando}
      />
    </>
  );
};

export default ModalAlterarGrupo;
