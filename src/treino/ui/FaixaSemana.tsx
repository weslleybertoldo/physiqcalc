import { useRef } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_DIA, rotuloData, rotuloDaSemana } from "../datas";

export interface DiaDaFaixa {
  chave: string;
  data: Date;
  /** nomes dos treinos do dia (vazio = sem treino) */
  treinos: { slot_idx: number; nome: string; concluido: boolean }[];
  /** todos os treinos do dia concluídos */
  feito: boolean;
  /** pelo menos um treino concluído no dia (a contagem "treinos na semana" conta DIAS assim) */
  algumFeito?: boolean;
  hoje: boolean;
}

/**
 * Faixa Seg–Dom da tela 2 (C15/C16): dia feito = violeta com ✓; hoje = branco; dia com treino = ponto violeta; sem treino =
 * apagado. O dia escolhido ganha o contorno. Em cima, a semana ("Esta semana · 13/09 – 19/09") com as setas para as outras
 * semanas e "Hoje" (também dá para arrastar a faixa para o lado).
 */
export function FaixaSemana({
  dias,
  selecionada,
  aoEscolher,
  deslocamento,
  aoMudarSemana,
  aoIrParaHoje,
}: {
  dias: DiaDaFaixa[];
  selecionada: string;
  aoEscolher: (chave: string) => void;
  deslocamento: number;
  aoMudarSemana: (novo: number) => void;
  aoIrParaHoje: () => void;
}) {
  const toqueRef = useRef<{ x: number; y: number } | null>(null);
  const inicio = dias[0]?.data;
  const fim = dias[6]?.data;
  // C15: treinos feitos na semana (dias com treino concluído, como hoje)
  const feitos = dias.filter((d) => d.feito || d.algumFeito).length;

  return (
    <section aria-label="Semana" data-faixa-semana={deslocamento}>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-texto-3" data-semana-rotulo>
          {rotuloDaSemana(deslocamento)}
          {inicio && fim ? ` · ${rotuloData(inicio)} – ${rotuloData(fim)}` : ""}
          {feitos > 0 && <span className="text-violeta-3" data-semana-feitos={feitos}>{` · ${feitos} ${feitos === 1 ? "feito" : "feitos"}`}</span>}
        </p>
        {deslocamento !== 0 && (
          <button type="button" onClick={aoIrParaHoje} className="pq-chip pq-chip-t h-7 px-2.5" data-semana-hoje>
            HOJE
          </button>
        )}
        <button type="button" aria-label="Semana anterior" onClick={() => aoMudarSemana(deslocamento - 1)} data-semana-anterior
          className="flex h-7 w-7 items-center justify-center rounded-[10px] text-texto-2 hover:bg-superficie hover:text-texto">
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Próxima semana" onClick={() => aoMudarSemana(deslocamento + 1)} data-semana-proxima
          className="flex h-7 w-7 items-center justify-center rounded-[10px] text-texto-2 hover:bg-superficie hover:text-texto">
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div
        className="flex justify-between gap-1"
        role="list"
        aria-label="Dias da semana"
        onTouchStart={(e) => (toqueRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = toqueRef.current;
          toqueRef.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) aoMudarSemana(deslocamento + (dx < 0 ? 1 : -1));
        }}
      >
        {dias.map((d) => {
          const escolhido = d.chave === selecionada;
          const comTreino = d.treinos.length > 0;
          const feito = d.feito || !!d.algumFeito;
          const estado = feito ? "feito" : d.hoje ? "hoje" : comTreino ? "treino" : "livre";
          return (
            <button
              key={d.chave}
              type="button"
              role="listitem"
              data-dia={d.chave}
              data-dia-estado={estado}
              aria-current={d.hoje ? "date" : undefined}
              aria-pressed={escolhido}
              aria-label={`${ROTULO_DIA[d.data.getDay()]} ${rotuloData(d.data)}${comTreino ? ` — ${d.treinos.map((t) => t.nome).join(", ")}` : " — sem treino"}${feito ? " (feito)" : ""}`}
              onClick={() => aoEscolher(d.chave)}
              className={cn(
                "relative flex h-[62px] w-[44px] flex-none flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-semibold transition-colors",
                d.hoje ? "border-transparent text-texto-4" : feito ? "border-violeta/30 bg-violeta/12 text-texto-2" : "border-linha bg-superficie text-texto-2",
                !d.hoje && !feito && !comTreino && "opacity-55",
                escolhido && !d.hoje && "ring-1 ring-violeta-2 ring-offset-0",
              )}
              style={d.hoje ? { background: "var(--p-botao-w-fundo)", boxShadow: "var(--p-botao-w-sombra)" } : undefined}
            >
              {ROTULO_DIA[d.data.getDay()]}
              <b className={cn("text-base font-semibold tabular-nums", d.hoje ? "text-[var(--p-botao-w-texto)]" : "text-forte")}>{d.data.getDate()}</b>
              {feito ? (
                <Check aria-hidden className={cn("h-[13px] w-[13px]", d.hoje ? "text-violeta" : "text-violeta-2")} strokeWidth={2.6} />
              ) : comTreino ? (
                <i className="h-[5px] w-[5px] rounded-full" style={{ background: d.hoje ? "var(--p-botao-w-texto)" : "var(--p-violeta)" }} />
              ) : (
                <i className="h-[5px]" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
