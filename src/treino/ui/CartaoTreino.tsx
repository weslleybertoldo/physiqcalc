import { useState, type ReactNode } from "react";
import { CheckCircle2, ListChecks, MapPin, MoreHorizontal, Play, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";

/**
 * Card do treino (tela 2, `.wk` com a borda de luz): nome, "TREINO A", exercícios · séries · academia, "2 de 5 exercícios
 * feitos", a % e a barra. Foto de fundo pelo grupo muscular (P29), bem suave para não brigar com o texto. Embaixo, só quando
 * cabe: "Começar treino" (antes de começar) ou o selo de concluído com "Compartilhar".
 */
export function CartaoTreino({
  nome,
  chip,
  exercicios,
  series,
  feitos,
  academia,
  foto,
  concluido,
  podeComecar,
  aoComecar,
  aoAcademia,
  aoOpcoes,
  rodape,
  observacao,
}: {
  nome: string;
  chip: string;
  exercicios: number;
  series: number;
  feitos: number;
  academia: string | null;
  foto: string;
  concluido: boolean;
  podeComecar: boolean;
  aoComecar: () => void;
  aoAcademia: () => void;
  aoOpcoes: () => void;
  rodape?: ReactNode;
  observacao?: string | null;
}) {
  const pct = exercicios > 0 ? Math.round((feitos / exercicios) * 100) : 0;
  const [semFoto, setSemFoto] = useState(false);
  return (
    <section data-cartao-treino={nome} data-treino-concluido={concluido ? "1" : "0"} className="pq-cartao pq-brilho relative overflow-hidden px-4 pb-4 pt-[15px]">
      {!semFoto && (
        <img src={foto} alt="" aria-hidden onError={() => setSemFoto(true)} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16]" />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(24,24,30,.35), rgba(14,14,18,.1) 70%)" }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 font-body text-[19px] font-bold normal-case leading-tight tracking-[-0.02em] text-texto" data-treino-nome>{nome}</h2>
          <div className="flex flex-none items-center gap-1">
            <Chip tom="t" data-treino-chip>{chip}</Chip>
            <button type="button" onClick={aoOpcoes} aria-label="Opções do treino" data-treino-opcoes
              className="flex h-7 w-7 items-center justify-center rounded-[10px] text-texto-2 hover:bg-superficie hover:text-texto">
              <MoreHorizontal aria-hidden className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-texto-2">
          <span className="inline-flex items-center gap-[5px]" data-treino-exercicios>
            <ListChecks aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            {exercicios} {exercicios === 1 ? "exercício" : "exercícios"}
          </span>
          <span className="inline-flex items-center gap-[5px]" data-treino-series>
            <Repeat aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            {series} {series === 1 ? "série" : "séries"}
          </span>
          <button type="button" onClick={aoAcademia} data-treino-academia className="inline-flex min-w-0 items-center gap-[5px] hover:text-texto">
            <MapPin aria-hidden className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
            <span className="truncate">{academia ?? "Escolher academia"}</span>
          </button>
        </div>
        {observacao && <p className="mt-2 text-[12.5px] leading-relaxed text-suave" data-treino-observacao>{observacao}</p>}
        <div className="mt-3 flex items-center justify-between text-[12px]">
          <span className="text-texto-2" data-treino-feitos>
            {feitos} de {exercicios} {exercicios === 1 ? "exercício feito" : "exercícios feitos"}
          </span>
          <span className="font-semibold text-violeta-3 tabular-nums" data-treino-pct>{pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded bg-superficie-2">
          <i
            className="block h-full rounded"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--p-violeta-2), var(--p-violeta-4))", boxShadow: pct ? "0 0 10px rgba(139,92,246,.8)" : "none" }}
          />
        </div>
        {concluido ? (
          <div className="mt-3.5 flex items-center justify-between gap-2" data-treino-feito>
            <Chip tom="n" icone={CheckCircle2}>TREINO CONCLUÍDO</Chip>
            {rodape}
          </div>
        ) : podeComecar ? (
          <button type="button" onClick={aoComecar} data-comecar-treino className={cn("pq-botao pq-botao-w mt-3.5 w-full")}>
            <Play aria-hidden /> Começar treino
          </button>
        ) : (
          rodape
        )}
      </div>
    </section>
  );
}
