import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";

export type EscopoRemocao = "dia" | "definitiva";

interface Props {
  userId: string;
  /** Exercício que aparece na tela */
  exercicio: { id: string; nome: string; emoji: string };
  /**
   * Id do exercício na programação do grupo. Difere de exercicio.id quando o item
   * exibido já é fruto de uma troca — a remoção sempre mira o original programado.
   */
  origemId: string;
  grupoId: string;
  grupoNome: string;
  /** Grupo pessoal: remoção definitiva tira o exercício do grupo de verdade */
  grupoPessoal: boolean;
  slotIdx: number;
  dateKey: string;
  dateLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemovido: () => void;
}

/**
 * Remover exercício do treino em 2 passos: escolhe o escopo (só neste dia /
 * definitivo) e depois confirma ("Confirma?").
 *
 * Persistência (mesmo modelo da troca de exercício):
 *  - neste dia → linha em exercicio_substituicao_usuario com data_treino e SEM exercício novo
 *  - definitivo, grupo pessoal → DELETE em tb_grupos_exercicios_usuario (igual editar o grupo)
 *  - definitivo, grupo do treinador → linha com data_treino NULL e SEM exercício novo
 */
const ModalRemoverExercicio = ({
  userId, exercicio, origemId, grupoId, grupoNome, grupoPessoal, slotIdx, dateKey, dateLabel,
  open, onOpenChange, onRemovido,
}: Props) => {
  const db = usePowerSync();
  const [escopo, setEscopo] = useState<EscopoRemocao | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setEscopo(null); setSaving(false); }
  }, [open, exercicio.id]);

  const descricaoConfirma = () => {
    if (escopo === "dia") {
      return <>"{exercicio.nome}" sai só do treino de <span className="text-foreground">{dateLabel}</span>. A programação do grupo fica como está.</>;
    }
    if (grupoPessoal) {
      return <>"{exercicio.nome}" sai do grupo <span className="text-foreground">{grupoNome}</span> (igual editar o grupo) e não aparece mais nos próximos treinos.</>;
    }
    return <>"{exercicio.nome}" não aparece mais nos próximos treinos de <span className="text-foreground">{grupoNome}</span>. O grupo do treinador não muda — a remoção é só sua e dá pra restaurar depois.</>;
  };

  const handleConfirmar = async () => {
    if (!escopo) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (escopo === "definitiva" && grupoPessoal) {
        // Grupo pessoal: tira do grupo de verdade
        const linhas = await db.getAll(
          `SELECT id FROM tb_grupos_exercicios_usuario
           WHERE user_id = ? AND grupo_usuario_id = ?
             AND (exercicio_id = ? OR exercicio_usuario_id = ?)`,
          [userId, grupoId, origemId, origemId]
        );
        if (((linhas as { id: string }[]) || []).length === 0) {
          throw new Error("exercício não encontrado no grupo");
        }
        for (const linha of (linhas as { id: string }[])) {
          await db.execute(
            `DELETE FROM tb_grupos_exercicios_usuario WHERE id = ? AND user_id = ?`,
            [linha.id, userId]
          );
        }
        // trocas/remoções pendentes desse exercício neste grupo perdem sentido
        await db.execute(
          `DELETE FROM exercicio_substituicao_usuario
           WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?`,
          [userId, grupoId, origemId]
        );
      } else if (escopo === "definitiva") {
        // Grupo do treinador: remoção definitiva SÓ do usuário. Substitui qualquer
        // troca/remoção anterior desse exercício neste slot (a definitiva passa a valer).
        await db.execute(
          `DELETE FROM exercicio_substituicao_usuario
           WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ?`,
          [userId, grupoId, slotIdx, origemId]
        );
        await db.execute(
          `INSERT INTO exercicio_substituicao_usuario
             (id, user_id, grupo_id, slot_idx, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id, data_treino, created_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
          [userId, grupoId, slotIdx, origemId, now, now]
        );
      } else {
        // Só neste dia: uma troca do dia existente vira remoção do dia
        const existentes = await db.getAll(
          `SELECT id FROM exercicio_substituicao_usuario
           WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ?
             AND data_treino = ?`,
          [userId, grupoId, slotIdx, origemId, dateKey]
        );
        const existente = ((existentes as { id: string }[]) || [])[0];
        if (existente) {
          await db.execute(
            `UPDATE exercicio_substituicao_usuario
             SET exercicio_novo_id = NULL, exercicio_novo_usuario_id = NULL, updated_at = ?
             WHERE id = ? AND user_id = ?`,
            [now, existente.id, userId]
          );
        } else {
          await db.execute(
            `INSERT INTO exercicio_substituicao_usuario
               (id, user_id, grupo_id, slot_idx, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id, data_treino, created_at, updated_at)
             VALUES (uuid(), ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
            [userId, grupoId, slotIdx, origemId, dateKey, now, now]
          );
        }
      }

      toast.success(
        escopo === "dia"
          ? `Removido só em ${dateLabel}: ${exercicio.nome}`
          : `Removido definitivamente: ${exercicio.nome}`
      );
      setSaving(false);
      onOpenChange(false);
      onRemovido();
    } catch (e) {
      console.error("[RemoverExercicio] Erro ao remover:", e);
      toast.error("Erro ao remover o exercício. Tente novamente.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-sm" data-modal-remover-exercicio>
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">✕ Remover exercício</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-body text-muted-foreground mb-3">
          <span className="text-foreground">{exercicio.emoji} {exercicio.nome}</span>
          <span className="text-muted-foreground/70"> · {grupoNome}</span>
        </p>

        {escopo === null ? (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-1.5">
              Remover neste dia ou definitivo?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEscopo("dia")}
                data-remover-opcao="dia"
                className="border border-muted-foreground/30 hover:border-primary/60 p-3 text-left transition-colors"
              >
                <span className="block text-xs font-heading text-foreground">Remover neste dia</span>
                <span className="block text-[10px] font-body text-muted-foreground">{dateLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setEscopo("definitiva")}
                data-remover-opcao="definitiva"
                className="border border-muted-foreground/30 hover:border-destructive/60 p-3 text-left transition-colors"
              >
                <span className="block text-xs font-heading text-foreground">Remover definitivo</span>
                <span className="block text-[10px] font-body text-muted-foreground">
                  {grupoPessoal ? `sai do grupo ${grupoNome}` : "Vale para os próximos treinos"}
                </span>
              </button>
            </div>
          </>
        ) : (
          <div data-remover-confirma>
            <p className="font-heading text-sm text-foreground mb-1">Confirma?</p>
            <p className="text-xs font-body text-muted-foreground mb-4">{descricaoConfirma()}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEscopo(null)}
                disabled={saving}
                className="py-3 border border-muted-foreground/30 text-muted-foreground hover:text-foreground font-heading text-xs uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmar}
                disabled={saving}
                data-remover-confirmar
                className="py-3 bg-destructive text-destructive-foreground font-heading text-xs uppercase tracking-widest hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Removendo..." : escopo === "dia" ? "Sim, remover hoje" : "Sim, remover"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ModalRemoverExercicio;
