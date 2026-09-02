import { useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SeletorExerciciosPorGrupo, {
  type ExercicioSelecionavel,
} from "@/components/treinos/SeletorExerciciosPorGrupo";
import { nomeDoBloco } from "@/lib/gruposMusculares";

export interface GrupoTreinoAdmin {
  id: string;
  nome: string;
}

interface ConteudoProps {
  grupo: GrupoTreinoAdmin;
  /** Catálogo completo de exercícios (biblioteca) */
  exercicios: ExercicioSelecionavel[];
  /** Ids dos exercícios que já estão no treino, na ordem do treino */
  idsNoTreino: string[];
  /** Liga/desliga o exercício no treino — o pai persiste (cada marcação salva na hora) */
  onToggle: (exercicioId: string) => Promise<void> | void;
}

/**
 * Conteúdo do popup "Exercícios do treino" (sem o Dialog) — mesma navegação em 2 níveis
 * por grupo muscular do "Trocar exercício", com checkbox por exercício.
 * Exportado separado pra teste unitário sem o portal do Radix.
 */
export const ConteudoExerciciosGrupo = ({ grupo, exercicios, idsNoTreino, onToggle }: ConteudoProps) => {
  // ids com gravação em andamento — evita clique duplo virar 2 inserts
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const noTreino = useMemo(() => new Set(idsNoTreino), [idsNoTreino]);

  // chips na ordem do treino; ignora id sem exercício no catálogo (excluído da biblioteca)
  const exerciciosNoTreino = useMemo(() => {
    const porId = new Map(exercicios.map((e) => [e.id, e] as const));
    return idsNoTreino
      .map((id) => porId.get(id))
      .filter((e): e is ExercicioSelecionavel => !!e);
  }, [idsNoTreino, exercicios]);

  const toggle = async (id: string) => {
    if (pendentes.has(id)) return;
    setPendentes((p) => new Set(p).add(id));
    try {
      await onToggle(id);
    } finally {
      setPendentes((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  };

  /** Remoção pelo chip — pede confirmação (clique fácil de errar) */
  const removerPeloChip = (ex: ExercicioSelecionavel) => {
    if (!window.confirm(`Remover "${ex.nome}" deste treino?`)) return;
    void toggle(ex.id);
  };

  const contarNoTreino = (exs: ExercicioSelecionavel[]) => exs.filter((e) => noTreino.has(e.id)).length;

  const renderItem = (ex: ExercicioSelecionavel, { mostrarGrupo }: { mostrarGrupo: boolean }): ReactNode => {
    const marcado = noTreino.has(ex.id);
    const salvando = pendentes.has(ex.id);
    return (
      <label
        key={ex.id}
        className={`flex items-center gap-2 py-1.5 ${salvando ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
        data-admin-ex-opcao={ex.id}
        data-no-treino={marcado ? "1" : undefined}
      >
        <input
          type="checkbox"
          checked={marcado}
          disabled={salvando}
          onChange={() => void toggle(ex.id)}
          className="accent-primary shrink-0"
        />
        <span className="text-sm font-body text-foreground truncate">
          {ex.emoji} {ex.nome}
        </span>
        {mostrarGrupo && (
          <span className="text-[10px] text-muted-foreground font-body ml-auto shrink-0">
            {nomeDoBloco(ex.grupo_muscular)}
          </span>
        )}
      </label>
    );
  };

  const total = exerciciosNoTreino.length;

  return (
    <>
      <p className="text-xs font-body text-muted-foreground mb-3">
        <span className="text-foreground">{grupo.nome}</span>
        {" · "}
        {total === 0
          ? "nenhum exercício ainda — marque abaixo para montar o treino."
          : `${total} exercício${total > 1 ? "s" : ""} · cada marcação salva na hora.`}
      </p>

      {total > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-1.5">
            No treino ({total})
          </p>
          <div className="flex flex-wrap gap-1.5" data-admin-chips-treino>
            {exerciciosNoTreino.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => removerPeloChip(ex)}
                disabled={pendentes.has(ex.id)}
                title="Remover do treino"
                className="flex items-center gap-1 border border-primary/40 text-primary px-1.5 py-0.5 text-[11px] font-body hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {ex.emoji} {ex.nome}
                <X size={10} />
              </button>
            ))}
          </div>
        </div>
      )}

      <SeletorExerciciosPorGrupo
        exercicios={exercicios}
        renderItem={renderItem}
        contarSelecionados={contarNoTreino}
        labelContagem={(sel, tot) => `${sel} de ${tot} no treino`}
        labelBadge={(sel) => `· ${sel} no treino`}
        resetKey={grupo.id}
      />
    </>
  );
};

interface Props extends Omit<ConteudoProps, "grupo"> {
  /** Treino em edição — null fecha o popup */
  grupo: GrupoTreinoAdmin | null;
  onOpenChange: (open: boolean) => void;
}

/** Popup do lápis do treino (admin › Grupos): escolhe os exercícios do treino por grupo muscular */
const ModalExerciciosGrupoAdmin = ({ grupo, onOpenChange, ...rest }: Props) => (
  <Dialog open={!!grupo} onOpenChange={onOpenChange}>
    <DialogContent className="bg-background border-muted-foreground/30 max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-heading text-foreground">✏️ Exercícios do treino</DialogTitle>
      </DialogHeader>

      {grupo && (
        <>
          <ConteudoExerciciosGrupo grupo={grupo} {...rest} />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full py-3 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            Concluir
          </button>
        </>
      )}
    </DialogContent>
  </Dialog>
);

export default ModalExerciciosGrupoAdmin;
