import type { ReactNode } from "react";
import { Check, ChevronDown, GripVertical, History, Info, NotebookPen, Repeat, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";
import { MiniaturaGif } from "./MiniaturaGif";

export type EstadoLinha = "feito" | "atual" | "pendente";

/**
 * Linha do exercício (tela 2, `.ex`): miniatura do GIF com play, nome e "4 × 10 · 60 s · 60 kg"; ✓ verde quando todas as
 * séries têm OK; o atual (1º com série por fazer) ganha o contorno violeta, "Série 3 de 3" e os tracinhos das séries.
 * Tocar abre as séries e as ações (ficha, histórico, anotações, trocar, remover).
 */
export function LinhaExercicio({
  exercicioId,
  nome,
  imagemUrl,
  linha,
  carga,
  estado,
  feitas,
  total,
  trocado,
  aberto,
  temAnotacao,
  aoAbrir,
  aoFicha,
  aoHistorico,
  aoAnotacoes,
  aoTrocar,
  aoRemover,
  alca,
  children,
}: {
  exercicioId: string;
  nome: string;
  imagemUrl: string | null | undefined;
  /** "4 × 10 · 60 s" */
  linha: string;
  /** "60 kg" */
  carga: string | null;
  estado: EstadoLinha;
  feitas: number;
  total: number;
  trocado?: string | null;
  aberto: boolean;
  temAnotacao: boolean;
  aoAbrir: () => void;
  aoFicha: () => void;
  aoHistorico: () => void;
  aoAnotacoes: () => void;
  aoTrocar: () => void;
  aoRemover: () => void;
  /** modo "reordenar": a alça de arrastar no lugar das ações */
  alca?: ReactNode;
  children?: ReactNode;
}) {
  const feito = estado === "feito";
  const atual = estado === "atual";
  const sub = feito
    ? [linha, carga].filter(Boolean).join(" · ")
    : atual && total > 0
      ? [`Série ${Math.min(feitas + 1, total)} de ${total}`, linha].filter(Boolean).join(" · ")
      : linha;

  return (
    <article
      data-exercicio-id={exercicioId}
      data-exercicio-estado={estado}
      data-aberto={aberto ? "1" : "0"}
      className={cn("pq-cartao rounded-[18px] transition-shadow", atual && "border-violeta/55")}
      style={atual ? { boxShadow: "0 0 0 1px rgba(139,92,246,.25), 0 14px 34px -12px rgba(139,92,246,.55)" } : undefined}
    >
      <div className="flex items-center gap-3 py-2 pl-2 pr-3">
        <button type="button" onClick={aoFicha} aria-label={`Ver ${nome} (GIF e dicas)`} data-exercicio-ficha className="flex-none rounded-[14px]">
          <MiniaturaGif url={imagemUrl} nome={nome} />
        </button>
        <button type="button" onClick={aoAbrir} aria-expanded={aberto} data-exercicio-abrir className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <b className={cn("block truncate text-[14.5px] font-semibold", feito ? "text-texto-2" : "text-texto")} data-exercicio-nome>{nome}</b>
            <span className="mt-[3px] block truncate text-[12px] text-texto-2" data-exercicio-linha>{sub}</span>
            {trocado && <span className="mt-0.5 block truncate text-[11px] text-violeta-3" data-exercicio-trocado>trocado · no lugar de {trocado}</span>}
            {atual && total > 0 && (
              <span className="mt-1.5 flex gap-1" aria-hidden data-exercicio-tracos>
                {Array.from({ length: total }, (_, i) => (
                  <i key={i} className="h-1 w-5 rounded-sm" style={i < feitas ? { background: "var(--p-violeta-2)", boxShadow: "0 0 6px rgba(167,139,250,.9)" } : { background: "rgba(255,255,255,.14)" }} />
                ))}
              </span>
            )}
          </span>
          {!alca &&
            (feito ? (
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-verde/15 text-verde-2" data-exercicio-feito>
                <Check aria-label="feito" className="h-[15px] w-[15px]" strokeWidth={2.6} />
              </span>
            ) : carga ? (
              <Chip tom="g" className="flex-none tabular-nums" data-exercicio-carga>{carga}</Chip>
            ) : (
              <ChevronDown aria-hidden className={cn("h-4 w-4 flex-none text-texto-3 transition-transform", aberto && "rotate-180")} />
            ))}
        </button>
        {alca}
      </div>
      {aberto && !alca && (
        <div className="border-t border-linha-3 px-3 pb-3 pt-2.5" data-exercicio-painel>
          <div className="mb-2.5 grid grid-cols-5 gap-1.5" role="toolbar" aria-label={`Ações de ${nome}`}>
            <Acao icone={Info} rotulo="Ficha" aoTocar={aoFicha} marca="ficha" />
            <Acao icone={History} rotulo="Histórico" aoTocar={aoHistorico} marca="historico" />
            <Acao icone={NotebookPen} rotulo="Anotações" aoTocar={aoAnotacoes} marca="anotacoes" ponto={temAnotacao} />
            <Acao icone={Repeat} rotulo="Trocar" aoTocar={aoTrocar} marca="trocar" />
            <Acao icone={Trash2} rotulo="Remover" aoTocar={aoRemover} marca="remover" perigo />
          </div>
          {children}
        </div>
      )}
    </article>
  );
}

function Acao({
  icone: Icone,
  rotulo,
  aoTocar,
  marca,
  ponto,
  perigo,
}: {
  icone: typeof Info;
  rotulo: string;
  aoTocar: () => void;
  marca: string;
  ponto?: boolean;
  perigo?: boolean;
}) {
  return (
    <button type="button" onClick={aoTocar} data-acao-exercicio={marca}
      className={cn("relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-linha bg-superficie px-0.5 text-[10px] font-semibold tracking-[-0.01em]",
        perigo ? "text-rosa-3 hover:border-rosa/40" : "text-suave hover:border-linha-2 hover:text-texto")}>
      <Icone aria-hidden className="h-4 w-4" strokeWidth={1.9} />
      <span className="w-full truncate text-center">{rotulo}</span>
      {ponto && <i aria-label="tem anotação" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violeta-2" />}
    </button>
  );
}

/** Alça de arrastar do modo "reordenar". */
export function AlcaArrastar(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} aria-label="Arrastar para reordenar" role="button" tabIndex={0}
      className="flex h-9 w-9 flex-none cursor-grab touch-none items-center justify-center rounded-xl border border-linha bg-superficie text-texto-2 active:cursor-grabbing"
      data-alca-arrastar>
      <GripVertical aria-hidden className="h-4 w-4" />
    </span>
  );
}
