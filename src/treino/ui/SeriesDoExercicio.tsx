import { memo, useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Undo2 } from "lucide-react";
import { calcularPace, formatPace, formatTempo, parseTempo } from "@/lib/corrida";
import { cn } from "@/lib/utils";
import type { SerieComMemoria } from "../tipos";

const CLASSE_CAMPO =
  "h-10 min-w-0 rounded-xl border border-linha-2 bg-superficie px-2 text-center text-[15px] font-semibold tabular-nums text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-violeta-2";

/**
 * As séries do exercício aberto (C64): peso × repetições (musculação) ou tempo, distância e pace (corrida). OK conclui a
 * série (liga o cronômetro e o descanso); Refazer desfaz; − tira e "Adicionar série" soma (menos com o cadeado do
 * profissional). Série que ainda não foi gravada hoje mostra "do último treino".
 */
export function SeriesDoExercicio({
  exercicioId,
  nome,
  series,
  corrida,
  podeEditar,
  aoSalvar,
  aoConcluir,
  aoDesfazer,
  aoRemover,
  aoAdicionar,
}: {
  exercicioId: string;
  nome: string;
  series: SerieComMemoria[];
  corrida: boolean;
  podeEditar: boolean;
  aoSalvar: (num: number, peso: number, reps: number, tempo?: number, dist?: number) => void;
  aoConcluir: (num: number, peso: number, reps: number, tempo?: number, dist?: number) => void;
  aoDesfazer: (num: number) => void;
  aoRemover: (num: number, salva: boolean) => void;
  aoAdicionar: () => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-series-de={exercicioId}>
      {series.map((s) => (
        <LinhaSerie
          key={`${exercicioId}-${s.numero_serie}`}
          serie={s}
          nome={nome}
          corrida={corrida}
          aoSalvar={(p, r, t, d) => aoSalvar(s.numero_serie, p, r, t, d)}
          aoConcluir={(p, r, t, d) => aoConcluir(s.numero_serie, p, r, t, d)}
          aoDesfazer={() => aoDesfazer(s.numero_serie)}
          aoRemover={podeEditar ? () => aoRemover(s.numero_serie, s.salva) : undefined}
        />
      ))}
      {podeEditar ? (
        <button type="button" onClick={aoAdicionar} data-adicionar-serie
          className="mt-0.5 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-linha-2 text-[12.5px] font-semibold text-violeta-3 hover:bg-violeta/10">
          <Plus aria-hidden className="h-4 w-4" /> Adicionar série
        </button>
      ) : (
        <p className="text-[11.5px] text-texto-3" data-series-travadas>O número de séries é definido pelo seu profissional.</p>
      )}
    </div>
  );
}

const LinhaSerie = memo(function LinhaSerie({
  serie,
  nome,
  corrida,
  aoSalvar,
  aoConcluir,
  aoDesfazer,
  aoRemover,
}: {
  serie: SerieComMemoria;
  nome: string;
  corrida: boolean;
  aoSalvar: (peso: number, reps: number, tempo?: number, dist?: number) => void;
  aoConcluir: (peso: number, reps: number, tempo?: number, dist?: number) => void;
  aoDesfazer: () => void;
  /** ausente = cadeado do profissional */
  aoRemover?: () => void;
}) {
  const [peso, setPeso] = useState(serie.peso > 0 ? String(serie.peso) : "");
  const [reps, setReps] = useState(serie.reps > 0 ? String(serie.reps) : "");
  const [tempo, setTempo] = useState(serie.tempo_segundos ? formatTempo(serie.tempo_segundos) : "");
  const [dist, setDist] = useState(serie.distancia_km ? String(serie.distancia_km) : "");
  const feita = !!serie.concluida;
  const iniciou = useRef(false);

  // 1ª vez sempre sincroniza; depois só quando a série foi gravada (não passa por cima do que a pessoa digita). Peso 0 vira
  // campo vazio (a troca de academia zera séries sem referência).
  useEffect(() => {
    if (!corrida) {
      if (!serie.concluida && (!iniciou.current || serie.salva)) setPeso(serie.peso > 0 ? String(serie.peso) : "");
      if (!serie.concluida && serie.reps > 0 && (!iniciou.current || serie.salva)) setReps(String(serie.reps));
      iniciou.current = true;
    } else {
      setTempo(serie.tempo_segundos ? formatTempo(serie.tempo_segundos) : "");
      setDist(serie.distancia_km ? String(serie.distancia_km) : "");
    }
  }, [serie.peso, serie.reps, serie.tempo_segundos, serie.distancia_km, serie.concluida, serie.salva, corrida]);

  const rotulo = (
    <span className={cn("w-7 flex-none text-[12px] font-semibold tabular-nums", feita ? "text-verde-2" : "text-texto-3")}>S{serie.numero_serie}</span>
  );

  if (feita) {
    return (
      <div data-serie={serie.numero_serie} data-serie-feita className="flex h-11 items-center gap-2 rounded-xl border border-verde/25 bg-verde/10 px-3">
        <Check aria-hidden className="h-3.5 w-3.5 flex-none text-verde-2" strokeWidth={3} />
        {rotulo}
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tabular-nums text-forte">
          {corrida && serie.tempo_segundos
            ? `${formatTempo(serie.tempo_segundos)} · ${serie.distancia_km ?? 0} km${serie.pace_segundos_km ? ` · pace ${formatPace(serie.pace_segundos_km)}` : ""}`
            : `${serie.peso} kg × ${serie.reps}`}
        </span>
        <button type="button" onClick={aoDesfazer} data-serie-refazer className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-texto-2 hover:text-texto">
          <Undo2 aria-hidden className="h-3.5 w-3.5" /> Refazer
        </button>
      </div>
    );
  }

  if (corrida) {
    const t = parseTempo(tempo);
    const d = parseFloat(dist);
    const pace = t && d > 0 ? formatPace(calcularPace(t, d)) : null;
    return (
      <div data-serie={serie.numero_serie} className="flex items-center gap-2">
        {rotulo}
        <label className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[10.5px] font-medium text-texto-3">Tempo</span>
          <input type="text" inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="00:00"
            onBlur={() => { const tt = parseTempo(tempo); const dd = parseFloat(dist); if (tt) aoSalvar(0, 0, tt, dd || undefined); }}
            aria-label={`Tempo da série ${serie.numero_serie} de ${nome} (MM:SS)`} className={CLASSE_CAMPO} />
        </label>
        <label className="flex w-[74px] flex-none flex-col gap-0.5">
          <span className="text-[10.5px] font-medium text-texto-3">Km</span>
          <input type="number" inputMode="decimal" step="0.1" min="0" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="0,0"
            onBlur={() => { const tt = parseTempo(tempo); const dd = parseFloat(dist); if (tt || dd) aoSalvar(0, 0, tt || undefined, dd || undefined); }}
            aria-label={`Distância da série ${serie.numero_serie} de ${nome} (km)`} className={CLASSE_CAMPO} />
        </label>
        <div className="flex flex-none flex-col items-end gap-0.5">
          <span className="text-[10.5px] font-medium text-violeta-3">{pace ? `pace ${pace}` : " "}</span>
          <div className="flex items-center gap-1">
            <BotaoOk aoTocar={() => aoConcluir(0, 0, parseTempo(tempo) || undefined, parseFloat(dist) || undefined)} />
            {aoRemover && <BotaoMenos aoTocar={aoRemover} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-serie={serie.numero_serie} className="flex items-center gap-2">
      {rotulo}
      <label className="relative flex min-w-0 flex-1">
        <input type="number" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="0"
          onBlur={() => aoSalvar(parseFloat(peso) || 0, parseInt(reps) || 0)}
          aria-label={`Peso da série ${serie.numero_serie} de ${nome} (kg)`} className={cn(CLASSE_CAMPO, "w-full pr-7")} />
        <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-texto-3">kg</span>
      </label>
      <span aria-hidden className="flex-none text-[13px] text-texto-3">×</span>
      <label className="relative flex w-[74px] flex-none">
        <input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="reps"
          onBlur={() => aoSalvar(parseFloat(peso) || 0, parseInt(reps) || 0)}
          aria-label={`Repetições da série ${serie.numero_serie} de ${nome}`} className={cn(CLASSE_CAMPO, "w-full")} />
      </label>
      <BotaoOk aoTocar={() => aoConcluir(parseFloat(peso) || 0, parseInt(reps) || 0)} />
      {aoRemover && <BotaoMenos aoTocar={aoRemover} />}
      {!serie.salva && <span className="sr-only">do último treino</span>}
    </div>
  );
});

function BotaoOk({ aoTocar }: { aoTocar: () => void }) {
  return (
    <button type="button" onClick={aoTocar} data-serie-ok
      className="flex h-10 flex-none items-center gap-1 rounded-xl border border-verde/40 bg-verde/12 px-3 text-[13px] font-bold text-verde-2 hover:bg-verde/20">
      <Check aria-hidden className="h-4 w-4" strokeWidth={2.6} /> OK
    </button>
  );
}

function BotaoMenos({ aoTocar }: { aoTocar: () => void }) {
  return (
    <button type="button" onClick={aoTocar} aria-label="Tirar série" title="Tirar série" data-serie-tirar
      className="flex h-10 w-8 flex-none items-center justify-center rounded-xl text-texto-3 hover:text-rosa-3">
      <Minus aria-hidden className="h-4 w-4" />
    </button>
  );
}
