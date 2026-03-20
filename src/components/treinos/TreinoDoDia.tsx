import React, { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Minus, Clock, CheckCircle2, Check, Undo2, MessageSquare, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ModalExercicio from "./ModalExercicio";
import ModalHistorico from "./ModalHistorico";
import ModalComentario, { carregarComentario } from "./ModalComentario";
import { toast } from "sonner";
import type { SerieComMemoria } from "@/pages/TreinosPage";

interface Exercicio {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string;
  tipo?: string;
}

interface GrupoExercicio {
  exercicio_id: string;
  ordem: number;
  tb_exercicios: Exercicio;
}

interface Props {
  userId: string;
  dateKey: string;
  dateLabel: string;
  grupoNome: string;
  grupoId: string;
  exercicios: GrupoExercicio[];
  series: SerieComMemoria[];
  concluido: boolean;
  onRefresh: () => void;
  onAlterarGrupo: () => void;
  onSerieConcluida: (exercicioNome: string, numeroSerie: number, exercicioId: string) => void;
  onSeriesUpdate: React.Dispatch<React.SetStateAction<SerieComMemoria[]>>;
}

// ── Corrida helpers ──────────────────────────────────────────────────────────
function parseTempo(input: string): number | null {
  const parts = input.trim().split(":").map(Number);
  if (parts.some(isNaN) || parts.length < 2) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatTempo(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatPace(paceSegundos: number): string {
  const m = Math.floor(paceSegundos / 60);
  const s = paceSegundos % 60;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function calcularPace(tempoSegundos: number, distanciaKm: number): number {
  if (!distanciaKm || distanciaKm <= 0) return 0;
  return Math.round(tempoSegundos / distanciaKm);
}
// ─────────────────────────────────────────────────────────────────────────────

const TreinoDoDia = ({
  userId, dateKey, dateLabel, grupoNome, grupoId, exercicios,
  series, concluido, onRefresh, onAlterarGrupo, onSerieConcluida, onSeriesUpdate,
}: Props) => {
  const [infoExercicio, setInfoExercicio] = useState<Exercicio | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [historicoNome, setHistoricoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [sortedItems, setSortedItems] = useState<GrupoExercicio[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Carrega ordem personalizada do usuário
  useEffect(() => {
    const loadOrder = async () => {
      const defaultSorted = [...exercicios].sort((a, b) => a.ordem - b.ordem);
      const { data: ordemUsuario } = await supabase
        .from("exercicio_ordem_usuario")
        .select("exercicio_id, posicao")
        .eq("user_id", userId)
        .eq("grupo_id", grupoId);

      if (!ordemUsuario || ordemUsuario.length === 0) {
        setSortedItems(defaultSorted);
        return;
      }

      const mapaOrdem = Object.fromEntries(ordemUsuario.map(o => [o.exercicio_id, o.posicao]));
      const sorted = [...defaultSorted].sort((a, b) => {
        const posA = mapaOrdem[a.exercicio_id] ?? 999;
        const posB = mapaOrdem[b.exercicio_id] ?? 999;
        return posA - posB;
      });
      setSortedItems(sorted);
    };
    loadOrder();
  }, [exercicios, userId, grupoId]);

  const handleDrop = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const from = sortedItems.findIndex(e => e.exercicio_id === draggingId);
    const to = sortedItems.findIndex(e => e.exercicio_id === targetId);
    if (from === -1 || to === -1) return;
    const novaOrdem = [...sortedItems];
    novaOrdem.splice(from, 1);
    novaOrdem.splice(to, 0, sortedItems[from]);
    setSortedItems(novaOrdem);
    setDraggingId(null);
    const upserts = novaOrdem.map((ex, posicao) => ({
      user_id: userId,
      grupo_id: grupoId,
      exercicio_id: ex.exercicio_id,
      posicao,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("exercicio_ordem_usuario").upsert(upserts, { onConflict: "user_id,grupo_id,exercicio_id" });
  };

  const handleResetOrder = async () => {
    await supabase.from("exercicio_ordem_usuario").delete().eq("user_id", userId).eq("grupo_id", grupoId);
    setSortedItems([...exercicios].sort((a, b) => a.ordem - b.ordem));
    toast.success("Ordem resetada para o padrão.");
  };

  const getSeriesForExercicio = useCallback(
    (exId: string) => series.filter(s => s.exercicio_id === exId).sort((a, b) => a.numero_serie - b.numero_serie),
    [series]
  );

  const handleSaveSerie = async (
    exercicioId: string, numeroSerie: number, peso: number, reps: number,
    tempoSegundos?: number, distanciaKm?: number
  ) => {
    const pace = tempoSegundos && distanciaKm ? calcularPace(tempoSegundos, distanciaKm) : undefined;
    await supabase.from("tb_treino_series").upsert(
      {
        user_id: userId,
        exercicio_id: exercicioId,
        data_treino: dateKey,
        numero_serie: numeroSerie,
        peso: tempoSegundos ? null : peso,
        reps: tempoSegundos ? null : reps,
        tempo_segundos: tempoSegundos ?? null,
        distancia_km: distanciaKm ?? null,
        pace_segundos_km: pace ?? null,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,exercicio_id,data_treino,numero_serie" }
    );
    onSeriesUpdate(prev => prev.map(s =>
      s.exercicio_id === exercicioId && s.numero_serie === numeroSerie
        ? { ...s, peso, reps, tempo_segundos: tempoSegundos, distancia_km: distanciaKm, pace_segundos_km: pace, salva: true }
        : s
    ));
  };

  const handleConcluirSerie = async (
    exercicioId: string, exercicioNome: string, numeroSerie: number, peso: number, reps: number,
    tempoSegundos?: number, distanciaKm?: number
  ) => {
    const pace = tempoSegundos && distanciaKm ? calcularPace(tempoSegundos, distanciaKm) : undefined;

    // Salva todas as séries não salvas do mesmo exercício antes de concluir
    // Isso evita que as séries com memória do último treino sumam ao recarregar
    const seriesNaoSalvas = series.filter(
      s => s.exercicio_id === exercicioId && !s.salva && s.numero_serie !== numeroSerie
    );
    if (seriesNaoSalvas.length > 0) {
      await supabase.from("tb_treino_series").upsert(
        seriesNaoSalvas.map(s => ({
          user_id: userId,
          exercicio_id: s.exercicio_id,
          data_treino: dateKey,
          numero_serie: s.numero_serie,
          peso: s.peso ?? 0,
          reps: s.reps ?? 10,
          concluida: false,
          updated_at: new Date().toISOString(),
        })) as any[],
        { onConflict: "user_id,exercicio_id,data_treino,numero_serie" }
      );
      onSeriesUpdate(prev => prev.map(s =>
        s.exercicio_id === exercicioId && !s.salva && s.numero_serie !== numeroSerie
          ? { ...s, salva: true }
          : s
      ));
    }

    await supabase.from("tb_treino_series").upsert(
      {
        user_id: userId,
        exercicio_id: exercicioId,
        data_treino: dateKey,
        numero_serie: numeroSerie,
        peso: tempoSegundos ? null : peso,
        reps: tempoSegundos ? null : reps,
        tempo_segundos: tempoSegundos ?? null,
        distancia_km: distanciaKm ?? null,
        pace_segundos_km: pace ?? null,
        concluida: true,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,exercicio_id,data_treino,numero_serie" }
    );
    onSeriesUpdate(prev => prev.map(s =>
      s.exercicio_id === exercicioId && s.numero_serie === numeroSerie
        ? { ...s, peso, reps, tempo_segundos: tempoSegundos, distancia_km: distanciaKm, pace_segundos_km: pace, concluida: true, salva: true }
        : s
    ));
    onSerieConcluida(exercicioNome, numeroSerie, exercicioId);
  };

  const handleDesfazerSerie = async (exercicioId: string, numeroSerie: number) => {
    await supabase.from("tb_treino_series")
      .update({ concluida: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("exercicio_id", exercicioId)
      .eq("data_treino", dateKey).eq("numero_serie", numeroSerie);
    onSeriesUpdate(prev => prev.map(s =>
      s.exercicio_id === exercicioId && s.numero_serie === numeroSerie ? { ...s, concluida: false } : s
    ));
  };

  const handleAddSerie = async (exercicioId: string) => {
    const existing = getSeriesForExercicio(exercicioId);
    const last = existing[existing.length - 1];
    const novoNum = existing.length > 0 ? Math.max(...existing.map(s => s.numero_serie)) + 1 : 1;
    const peso = last?.peso ?? 0;
    const reps = last?.reps ?? 10;
    await supabase.from("tb_treino_series").insert({
      user_id: userId, exercicio_id: exercicioId, data_treino: dateKey,
      numero_serie: novoNum, peso, reps,
    });
    onSeriesUpdate(prev => [...prev, { exercicio_id: exercicioId, numero_serie: novoNum, peso, reps, concluida: false, salva: true }]);
  };

  const handleRemoveSerie = async (exercicioId: string, numeroSerie: number, isSalva: boolean) => {
    if (isSalva) {
      await supabase.from("tb_treino_series").delete()
        .eq("user_id", userId).eq("exercicio_id", exercicioId)
        .eq("data_treino", dateKey).eq("numero_serie", numeroSerie);
    }
    onSeriesUpdate(prev =>
      prev.filter(s => !(s.exercicio_id === exercicioId && s.numero_serie === numeroSerie))
        .map(s => s.exercicio_id === exercicioId && s.numero_serie > numeroSerie
          ? { ...s, numero_serie: s.numero_serie - 1 } : s)
    );
  };

  const handleConcluir = async () => {
    setSaving(true);
    if (concluido) {
      await supabase.from("tb_treino_concluido").delete().eq("user_id", userId).eq("data_treino", dateKey);
    } else {
      await supabase.from("tb_treino_concluido").upsert(
        { user_id: userId, data_treino: dateKey, concluido: true },
        { onConflict: "user_id,data_treino" }
      );
      toast.success("Treino concluído! 💪");
    }
    setSaving(false);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl text-foreground">TREINO DO DIA — {dateLabel}</h2>
          <p className="text-sm text-primary font-heading mt-1">{grupoNome}</p>
        </div>
        <div className="flex items-center gap-3">
<button type="button" onClick={onAlterarGrupo}
            className="text-xs text-muted-foreground hover:text-primary font-heading uppercase tracking-wider transition-colors">
            🔄 Alterar
          </button>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <p className="text-muted-foreground font-body text-sm">Nenhum exercício neste grupo.</p>
      ) : (
        <div className="space-y-8">
          {sortedItems.map(ge => {
            const ex = ge.tb_exercicios;
            const exSeries = getSeriesForExercicio(ex.id);
            const tipoCorrida = (ex as any).tipo === "corrida";
            return (
              <ExercicioCard
                key={ex.id}
                exercicio={ex}
                series={exSeries}
                userId={userId}
                dateKey={dateKey}
                tipoCorrida={tipoCorrida}
                isDragging={draggingId === ex.id}
                onDragStart={() => setDraggingId(ex.id)}
                onDrop={() => handleDrop(ex.id)}
                onDragEnd={() => setDraggingId(null)}
                onSetInfoExercicio={setInfoExercicio}
                onSetHistorico={(id, nome) => { setHistoricoId(id); setHistoricoNome(nome); }}
                onSaveSerie={handleSaveSerie}
                onRemoveSerie={handleRemoveSerie}
                onConcluirSerie={handleConcluirSerie}
                onDesfazerSerie={handleDesfazerSerie}
                onAddSerie={handleAddSerie}
              />
            );
          })}
        </div>
      )}

      <button type="button" onClick={handleConcluir} disabled={saving}
        className={`w-full py-4 font-heading text-sm uppercase tracking-widest transition-colors ${
          concluido
            ? "bg-classify-green/20 text-classify-green border border-classify-green/50"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}>
        <CheckCircle2 size={16} className="inline mr-2" />
        {concluido ? "Treino concluído ✓" : "Marcar treino como concluído"}
      </button>

      <ModalExercicio exercicio={infoExercicio} open={!!infoExercicio} onOpenChange={o => !o && setInfoExercicio(null)} />
      <ModalHistorico exercicioId={historicoId} exercicioNome={historicoNome} userId={userId}
        open={!!historicoId} onOpenChange={o => !o && setHistoricoId(null)} />
    </div>
  );
};

// ── ExercicioCard ─────────────────────────────────────────────────────────────
const ExercicioCard = ({
  exercicio: ex, series: exSeries, userId, dateKey, tipoCorrida,
  isDragging, onDragStart, onDrop, onDragEnd,
  onSetInfoExercicio, onSetHistorico,
  onSaveSerie, onRemoveSerie, onConcluirSerie, onDesfazerSerie, onAddSerie,
}: {
  exercicio: Exercicio;
  series: SerieComMemoria[];
  userId: string;
  dateKey: string;
  tipoCorrida: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onSetInfoExercicio: (ex: Exercicio) => void;
  onSetHistorico: (id: string, nome: string) => void;
  onSaveSerie: (exId: string, num: number, peso: number, reps: number, tempo?: number, dist?: number) => void;
  onRemoveSerie: (exId: string, num: number, salva: boolean) => void;
  onConcluirSerie: (exId: string, nome: string, num: number, peso: number, reps: number, tempo?: number, dist?: number) => void;
  onDesfazerSerie: (exId: string, num: number) => void;
  onAddSerie: (exId: string) => void;
}) => {
  const [comentarioAberto, setComentarioAberto] = useState(false);
  const [temComentario, setTemComentario] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      onDragStart();
      if (navigator.vibrate) navigator.vibrate(50);
    }, 2000);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    onDragEnd();
  };

  useEffect(() => {
    carregarComentario(userId, ex.id, false).then(c => setTemComentario(c.trim().length > 0));
  }, [ex.id, userId]);

  return (
    <div
      className={`result-card border-muted-foreground/30 relative transition-opacity ${isDragging ? "opacity-40 border-primary" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-primary touch-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <GripVertical size={16} />
          </div>
          <button type="button" onClick={() => onSetInfoExercicio(ex)}
            className="font-heading text-sm text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <span>{ex.emoji}</span> {ex.nome}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setComentarioAberto(true)} title="Anotações"
            className={`text-xs font-body flex items-center gap-1 transition-colors ${temComentario ? "text-primary" : "text-muted-foreground hover:text-primary"}`}>
            <MessageSquare size={12} />
            {temComentario && <span className="text-primary">•</span>}
          </button>
          <button type="button" onClick={() => onSetHistorico(ex.id, ex.nome)}
            className="text-xs text-muted-foreground hover:text-primary font-body flex items-center gap-1 transition-colors">
            <Clock size={12} /> Histórico
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {exSeries.map(s => (
          <SerieRow
            key={`${ex.id}-${s.numero_serie}`}
            serie={s}
            tipoCorrida={tipoCorrida}
            onSave={(peso, reps, tempo, dist) => onSaveSerie(ex.id, s.numero_serie, peso, reps, tempo, dist)}
            onRemove={() => onRemoveSerie(ex.id, s.numero_serie, s.salva)}
            onConcluir={(peso, reps, tempo, dist) => onConcluirSerie(ex.id, ex.nome, s.numero_serie, peso, reps, tempo, dist)}
            onDesfazer={() => onDesfazerSerie(ex.id, s.numero_serie)}
          />
        ))}
      </div>

      <button type="button" onClick={() => onAddSerie(ex.id)}
        className="mt-3 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-heading uppercase tracking-wider transition-colors">
        <Plus size={14} /> Adicionar série
      </button>

      {comentarioAberto && (
        <ModalComentario exercicioNome={ex.nome} exercicioId={ex.id} ehPessoal={false} userId={userId}
          onFechar={() => {
            setComentarioAberto(false);
            carregarComentario(userId, ex.id, false).then(c => setTemComentario(c.trim().length > 0));
          }} />
      )}
    </div>
  );
};

// ── SerieRow ─────────────────────────────────────────────────────────────────
const SerieRow = React.memo(function SerieRow({
  serie, tipoCorrida, onSave, onRemove, onConcluir, onDesfazer,
}: {
  serie: SerieComMemoria;
  tipoCorrida: boolean;
  onSave: (peso: number, reps: number, tempo?: number, dist?: number) => void;
  onRemove: () => void;
  onConcluir: (peso: number, reps: number, tempo?: number, dist?: number) => void;
  onDesfazer: () => void;
}) {
  const [peso, setPeso] = useState(serie.peso > 0 ? String(serie.peso) : "");
  const [reps, setReps] = useState(serie.reps > 0 ? String(serie.reps) : "");
  const [tempo, setTempo] = useState(serie.tempo_segundos ? formatTempo(serie.tempo_segundos) : "");
  const [distancia, setDistancia] = useState(serie.distancia_km ? String(serie.distancia_km) : "");
  const concluindoRef = useRef(false);
  const isConcluida = serie.concluida === true;

  useEffect(() => {
    if (!tipoCorrida) {
      // Sincroniza peso/reps apenas se:
      // 1. A série ainda não foi concluída (não apaga após OK)
      // 2. Tem um valor real do histórico (peso > 0)
      // Isso garante que o último peso fica nos campos até o usuário editar
      if (!serie.concluida && serie.peso > 0) {
        setPeso(String(serie.peso));
      }
      if (!serie.concluida && serie.reps > 0) {
        setReps(String(serie.reps));
      }
    } else {
      setTempo(serie.tempo_segundos ? formatTempo(serie.tempo_segundos) : "");
      setDistancia(serie.distancia_km ? String(serie.distancia_km) : "");
    }
  }, [serie.peso, serie.reps, serie.tempo_segundos, serie.distancia_km, serie.concluida, tipoCorrida]);

  const pacePreview = (() => {
    const t = parseTempo(tempo);
    const d = parseFloat(distancia);
    if (t && d > 0) return formatPace(calcularPace(t, d));
    return null;
  })();

  if (isConcluida) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-classify-green/10 border border-classify-green/20">
        <span className="text-xs text-classify-green font-heading w-8">✅ S{serie.numero_serie}</span>
        {tipoCorrida && serie.tempo_segundos ? (
          <span className="text-sm text-foreground/70 font-heading">
            {formatTempo(serie.tempo_segundos)} · {serie.distancia_km}km
            {serie.pace_segundos_km ? <span className="text-xs text-primary ml-2">⚡ {formatPace(serie.pace_segundos_km)}</span> : null}
          </span>
        ) : (
          <span className="text-sm text-foreground/70 font-heading">{serie.peso} kg × {serie.reps} reps</span>
        )}
        <button type="button" onClick={onDesfazer}
          className="ml-auto p-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 font-heading">
          <Undo2 size={12} /> Refazer
        </button>
      </div>
    );
  }

  // ── CORRIDA ──
  if (tipoCorrida) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-heading w-8">S{serie.numero_serie}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground font-heading">Tempo (MM:SS)</span>
          <input type="text" value={tempo} onChange={e => setTempo(e.target.value)}
            onBlur={() => { const t = parseTempo(tempo); const d = parseFloat(distancia); if (t) onSave(0, 0, t, d || undefined); }}
            className="w-20 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-1 outline-none focus:border-primary transition-colors"
            placeholder="00:00" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground font-heading">Dist (km)</span>
          <input type="number" value={distancia} onChange={e => setDistancia(e.target.value)}
            onBlur={() => { const t = parseTempo(tempo); const d = parseFloat(distancia); if (t || d) onSave(0, 0, t || undefined, d || undefined); }}
            className="w-16 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-1 outline-none focus:border-primary transition-colors"
            placeholder="0.0" step="0.1" min="0" />
        </div>
        {pacePreview && <span className="text-xs text-primary font-heading">⚡ {pacePreview}</span>}
        <button type="button"
          onClick={() => { const t = parseTempo(tempo); const d = parseFloat(distancia); onConcluir(0, 0, t || undefined, d || undefined); }}
          className="ml-auto px-2 py-1 text-xs font-heading uppercase tracking-wider text-classify-green border border-classify-green/50 bg-classify-green/10 hover:bg-classify-green/20 transition-colors flex items-center gap-1 rounded">
          <Check size={12} /> OK
        </button>
        <button type="button" onClick={onRemove} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
          <Minus size={14} />
        </button>
      </div>
    );
  }

  // ── MUSCULAÇÃO ──
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-heading w-8">S{serie.numero_serie}</span>
      <input type="number" value={peso} onChange={e => setPeso(e.target.value)}
        onBlur={() => { if (!concluindoRef.current) onSave(parseFloat(peso) || 0, parseInt(reps) || 0); }}
        className="w-12 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-1 outline-none focus:border-primary transition-colors"
        placeholder="kg" />
      <span className="text-muted-foreground text-xs">kg</span>
      <span className="text-muted-foreground text-xs">×</span>
      <input type="number" value={reps} onChange={e => setReps(e.target.value)}
        onBlur={() => { if (!concluindoRef.current) onSave(parseFloat(peso) || 0, parseInt(reps) || 0); }}
        className="w-11 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-1 outline-none focus:border-primary transition-colors"
        placeholder="reps" />
      <span className="text-muted-foreground text-xs">reps</span>
      {!serie.salva && <span className="text-[10px] text-yellow-500/60 font-heading">↑ último</span>}
      <button type="button"
        onMouseDown={() => { concluindoRef.current = true; }}
        onClick={() => { onConcluir(parseFloat(peso) || 0, parseInt(reps) || 0); concluindoRef.current = false; }}
        className="ml-auto px-2 py-1 text-xs font-heading uppercase tracking-wider text-classify-green border border-classify-green/50 bg-classify-green/10 hover:bg-classify-green/20 transition-colors flex items-center gap-1 rounded">
        <Check size={12} /> OK
      </button>
      <button type="button" onClick={onRemove} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
        <Minus size={14} />
      </button>
    </div>
  );
});

export default TreinoDoDia;
