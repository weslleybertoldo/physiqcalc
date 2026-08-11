import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  agruparPorBloco,
  combinaBusca,
  getBloco,
  type BlocoMuscular,
} from "@/lib/gruposMusculares";

export interface ExercicioSelecionavel {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  isPessoal?: boolean;
}

interface Props<T extends ExercicioSelecionavel> {
  exercicios: T[];
  /** Renderiza a linha do exercício (checkbox/radio + ações), decidido pelo pai */
  renderItem: (ex: T, ctx: { mostrarGrupo: boolean }) => ReactNode;
  /** Quantos dos exercícios do bloco estão selecionados (badge "x escolhidos") */
  contarSelecionados?: (exercicios: T[]) => number;
  /** Rótulo do contador dentro do bloco aberto (default: "x de y selecionados") */
  labelContagem?: (selecionados: number, total: number) => string;
  /** Sufixo no card do bloco quando há selecionados (default: "· N escolhidos") */
  labelBadge?: (selecionados: number) => string;
  /** Avisa o pai qual bloco está aberto (null = lista de grupos) */
  onBlocoChange?: (bloco: BlocoMuscular | null) => void;
  /** Muda para resetar a navegação (ex. id do modal reaberto) */
  resetKey?: string | number;
  alturaLista?: string;
}

/**
 * Navegação em 2 níveis por grupo muscular + busca (lupa) nos dois níveis:
 * nível 1 = blocos musculares; nível 2 = exercícios do bloco.
 * A busca no nível 1 procura em todos os exercícios; dentro do bloco, só nele.
 */
const SeletorExerciciosPorGrupo = <T extends ExercicioSelecionavel>({
  exercicios,
  renderItem,
  contarSelecionados,
  labelContagem = (sel, total) => `${sel} de ${total} selecionados`,
  labelBadge = (sel) => `· ${sel} escolhido${sel > 1 ? "s" : ""}`,
  onBlocoChange,
  resetKey,
  alturaLista = "max-h-64",
}: Props<T>) => {
  const [blocoAberto, setBlocoAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    setBlocoAberto(null);
    setBusca("");
  }, [resetKey]);

  const blocos = useMemo(() => agruparPorBloco(exercicios), [exercicios]);

  const exerciciosDoBloco = useMemo(
    () => (blocoAberto ? blocos.find((b) => b.bloco.key === blocoAberto)?.exercicios ?? [] : []),
    [blocos, blocoAberto]
  );

  const resultadosBusca = useMemo(() => {
    if (!busca.trim()) return [];
    const base = blocoAberto ? exerciciosDoBloco : exercicios;
    return base.filter((ex) => combinaBusca(ex, busca));
  }, [busca, blocoAberto, exerciciosDoBloco, exercicios]);

  const abrirBloco = (key: string) => {
    setBlocoAberto(key);
    setBusca("");
    onBlocoChange?.(getBloco(key));
  };

  const voltarParaBlocos = () => {
    setBlocoAberto(null);
    setBusca("");
    onBlocoChange?.(null);
  };

  const blocoAtual = blocoAberto ? getBloco(blocoAberto) : null;
  const buscando = !!busca.trim();

  return (
    <>
      <div className="flex items-center gap-2 border-b border-muted-foreground mb-3 focus-within:border-primary">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={blocoAtual ? `Buscar em ${blocoAtual.nome}...` : "Buscar exercício..."}
          className="flex-1 bg-transparent text-foreground font-body text-sm py-1.5 outline-none placeholder:text-muted-foreground"
        />
        {buscando && (
          <button type="button" onClick={() => setBusca("")} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        )}
      </div>

      {buscando ? (
        <div className={`mb-4 overflow-y-auto ${alturaLista}`}>
          {resultadosBusca.length === 0 ? (
            <p className="text-xs text-muted-foreground font-body py-2">Nenhum exercício encontrado.</p>
          ) : (
            resultadosBusca.map((ex) => renderItem(ex, { mostrarGrupo: !blocoAberto }))
          )}
        </div>
      ) : blocoAtual ? (
        <>
          <button
            type="button"
            onClick={voltarParaBlocos}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-heading uppercase tracking-wider mb-2"
          >
            <ChevronLeft size={14} /> Grupos musculares
          </button>
          <p className="text-sm font-heading text-foreground mb-2">
            {blocoAtual.emoji} {blocoAtual.nome}
            {contarSelecionados && (
              <span className="text-[10px] text-muted-foreground font-body ml-2">
                {labelContagem(contarSelecionados(exerciciosDoBloco), exerciciosDoBloco.length)}
              </span>
            )}
          </p>
          <div className={`mb-4 overflow-y-auto ${alturaLista}`}>
            {exerciciosDoBloco.length === 0 ? (
              <p className="text-xs text-muted-foreground font-body py-2">Nenhum exercício neste grupo.</p>
            ) : (
              exerciciosDoBloco.map((ex) => renderItem(ex, { mostrarGrupo: false }))
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">
            Grupos musculares
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {blocos.map(({ bloco, exercicios: exs }) => {
              const sel = contarSelecionados?.(exs) ?? 0;
              return (
                <button
                  key={bloco.key}
                  type="button"
                  onClick={() => abrirBloco(bloco.key)}
                  className={`flex items-center gap-2 border p-2.5 text-left transition-colors ${
                    sel > 0 ? "border-primary/60 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60"
                  }`}
                >
                  <span className="text-lg shrink-0">{bloco.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-heading text-foreground truncate">{bloco.nome}</span>
                    <span className="block text-[10px] font-body text-muted-foreground">
                      {exs.length} ex.{sel > 0 ? ` ${labelBadge(sel)}` : ""}
                    </span>
                  </span>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};

export default SeletorExerciciosPorGrupo;
