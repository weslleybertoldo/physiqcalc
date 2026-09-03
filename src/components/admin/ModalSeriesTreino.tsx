import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SERIES_PADRAO_DEFAULT,
  SERIES_PADRAO_MAX,
  SERIES_PADRAO_MIN,
  chaveExercicio,
  clampSeries,
  type ExercicioTreino,
} from "@/lib/seriesPadrao";

interface ConteudoProps {
  nomeTreino: string;
  /** null = carregando */
  exercicios: ExercicioTreino[] | null;
  /** nº geral do treino (vale pra quem não tem número próprio) */
  geral: number;
  /** nº efetivo do exercício (próprio > geral > padrão) */
  valorDe: (ex: ExercicioTreino) => number;
  /** o exercício tem número próprio? */
  temProprio: (ex: ExercicioTreino) => boolean;
  /** −1 / +1 em um exercício — o pai persiste */
  onAlterarExercicio: (ex: ExercicioTreino, delta: 1 | -1) => void;
  /** aplica n a todos os exercícios do treino (vira o geral; apaga os números próprios) */
  onAplicarTodos: (n: number) => void;
  salvando?: boolean;
}

const btn =
  "h-8 w-8 flex items-center justify-center border border-muted-foreground/40 text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

/** Conteúdo do popup (sem o Dialog) — exportado pra teste unitário */
export const ConteudoSeriesTreino = ({
  nomeTreino, exercicios, geral, valorDe, temProprio, onAlterarExercicio, onAplicarTodos, salvando = false,
}: ConteudoProps) => {
  // rascunho do "aplicar a todos" — começa no geral e acompanha quando ele muda
  const [rascunho, setRascunho] = useState(geral);
  useEffect(() => { setRascunho(geral); }, [geral]);

  return (
    <>
      <p className="text-xs font-body text-muted-foreground mb-3">
        <span className="text-foreground">{nomeTreino}</span> · quantas séries de cada exercício aparecem no app
        quando o aluno abre este treino. Padrão {SERIES_PADRAO_DEFAULT}, de {SERIES_PADRAO_MIN} a {SERIES_PADRAO_MAX}.
      </p>

      {/* geral */}
      <div className="border border-primary/40 bg-primary/5 p-3 mb-3" data-admin-series-geral>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">
          Todos os exercícios
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setRascunho((v) => clampSeries(v - 1))} disabled={rascunho <= SERIES_PADRAO_MIN || salvando} aria-label="Menos uma série (todos)" className={btn}>
            <Minus size={16} />
          </button>
          <span className="min-w-[2ch] text-center font-heading text-2xl text-primary" data-admin-series-geral-valor>{rascunho}</span>
          <button type="button" onClick={() => setRascunho((v) => clampSeries(v + 1))} disabled={rascunho >= SERIES_PADRAO_MAX || salvando} aria-label="Mais uma série (todos)" className={btn}>
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => onAplicarTodos(rascunho)}
            disabled={salvando}
            className="ml-auto px-3 py-2 bg-primary text-primary-foreground font-heading text-[10px] uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Aplicar a todos
          </button>
        </div>
        <p className="text-[10px] font-body text-muted-foreground mt-1.5">
          Hoje o geral é {geral}. Aplicar zera os números próprios abaixo.
        </p>
      </div>

      {/* por exercício */}
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-1.5">
        Por exercício{exercicios ? ` (${exercicios.length})` : ""}
      </p>
      {exercicios === null ? (
        <p className="text-xs text-muted-foreground font-body py-2">Carregando exercícios…</p>
      ) : exercicios.length === 0 ? (
        <p className="text-xs text-muted-foreground font-body py-2">Este treino ainda não tem exercícios.</p>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto mb-3">
          {exercicios.map((ex) => {
            const n = valorDe(ex);
            const proprio = temProprio(ex);
            const chave = chaveExercicio(ex.exercicio_id, ex.exercicio_usuario_id) ?? ex.nome;
            return (
              <div key={chave} className="flex items-center gap-2 py-1" data-admin-series-exercicio={chave}>
                <span className="text-sm font-body text-foreground truncate flex-1 min-w-0">
                  {ex.emoji} {ex.nome}
                  {proprio && (
                    <span className="ml-1.5 text-[9px] uppercase tracking-wider text-primary border border-primary/40 px-1 py-0.5 font-heading">próprio</span>
                  )}
                </span>
                <button type="button" onClick={() => onAlterarExercicio(ex, -1)} disabled={n <= SERIES_PADRAO_MIN || salvando} aria-label={`Menos uma série em ${ex.nome}`} className={btn}>
                  <Minus size={14} />
                </button>
                <span className="min-w-[2ch] text-center font-heading text-lg text-foreground" data-admin-series-exercicio-valor>{n}</span>
                <button type="button" onClick={() => onAlterarExercicio(ex, 1)} disabled={n >= SERIES_PADRAO_MAX || salvando} aria-label={`Mais uma série em ${ex.nome}`} className={btn}>
                  <Plus size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {salvando && <p className="text-[10px] font-body text-muted-foreground mb-2">salvando…</p>}
    </>
  );
};

interface Props extends Omit<ConteudoProps, "nomeTreino"> {
  /** Treino em edição — null fecha o popup */
  treino: { nome: string } | null;
  onOpenChange: (open: boolean) => void;
}

/** Popup do badge "Séries" (admin › usuário › Treino Diário): séries por exercício ou geral do treino */
const ModalSeriesTreino = ({ treino, onOpenChange, ...rest }: Props) => (
  <Dialog open={!!treino} onOpenChange={onOpenChange}>
    <DialogContent className="bg-background border-muted-foreground/30 max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-heading text-foreground">🔢 Séries do treino</DialogTitle>
      </DialogHeader>
      {treino && (
        <>
          <ConteudoSeriesTreino nomeTreino={treino.nome} {...rest} />
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

export default ModalSeriesTreino;
