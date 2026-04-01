import React, { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Minus, Clock, CheckCircle2, Check, Undo2, MessageSquare, GripVertical } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { setCacheData, getCacheData, offlineUpsert, offlineDelete, offlineUpdate } from "@/lib/offlineSync";
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
  const db = usePowerSync();
  const [infoExercicio, setInfoExercicio] = useState<Exercicio | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [historicoNome, setHistoricoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [sortedItems, setSortedItems] = useState<GrupoExercicio[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Refs para touch drag
  const sortedItemsRef = useRef<GrupoExercicio[]>([]);
  const draggingIdRef = useRef<string | null>(null);
  const lastSwapIdRef = useRef<string | null>(null);
  const throttleRef = useRef(false);
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Sincroniza ref com state (para usar dentro de event listeners)
  useEffect(() => { sortedItemsRef.current = sortedItems; }, [sortedItems]);

  // Carrega ordem personalizada do usuário (com cache offline)
  useEffect(() => {
    const loadOrder = async () => {
      const defaultSorted = [...exercicios].sort((a, b) => a.ordem - b.ordem);
      const cacheKey = `ordem_${userId}_${grupoId}`;

      try {
        const ordemUsuario = await db.getAll(
          "SELECT exercicio_id, posicao FROM exercicio_ordem_usuario WHERE user_id = ? AND grupo_id = ?",
          [userId, grupoId]
        );

        if (!ordemUsuario || ordemUsuario.length === 0) {
          setSortedItems(defaultSorted);
          return;
        }

        // Salva no cache para uso offline
        setCacheData(cacheKey, ordemUsuario);

        const mapaOrdem = Object.fromEntries(ordemUsuario.map(o => [o.exercicio_id, o.posicao]));
        const sorted = [...defaultSorted].sort((a, b) => {
          const posA = mapaOrdem[a.exercicio_id] ?? 999;
          const posB = mapaOrdem[b.exercicio_id] ?? 999;
          return posA - posB;
        });
        setSortedItems(sorted);
      } catch {
        // Offline: tenta carregar do cache
        const cached = getCacheData<{ exercicio_id: string; posicao: number }[]>(cacheKey);
        if (cached && cached.length > 0) {
          const mapaOrdem = Object.fromEntries(cached.map(o => [o.exercicio_id, o.posicao]));
          const sorted = [...defaultSorted].sort((a, b) => {
            const posA = mapaOrdem[a.exercicio_id] ?? 999;
            const posB = mapaOrdem[b.exercicio_id] ?? 999;
            return posA - posB;
          });
          setSortedItems(sorted);
        } else {
          setSortedItems(defaultSorted);
        }
      }
    };
    loadOrder();
  }, [exercicios, userId, grupoId]);

  const saveOrder = async (novaOrdem: GrupoExercicio[]) => {
    const cacheKey = `ordem_${userId}_${grupoId}`;
    const upserts = novaOrdem.map((ex, posicao) => ({
      user_id: userId,
      grupo_id: grupoId,
      exercicio_id: ex.exercicio_id,
      posicao,
      updated_at: new Date().toISOString(),
    }));

    // Salva no cache imediatamente
    setCacheData(cacheKey, upserts.map(u => ({ exercicio_id: u.exercicio_id, posicao: u.posicao })));

    // Escreve via Supabase (com fallback offline)
    for (const u of upserts) {
      const id = crypto.randomUUID();
      await offlineUpsert("exercicio_ordem_usuario", {
        id,
        user_id: u.user_id,
        grupo_id: u.grupo_id,
        exercicio_id: u.exercicio_id,
        posicao: u.posicao,
        updated_at: u.updated_at,
      }, "user_id,grupo_id,exercicio_id");
    }
  };

  // Captura os bounding rects de todos os cards antes de iniciar o drag
  const captureCardRects = () => {
    if (!listContainerRef.current) return;
    const cards = listContainerRef.current.querySelectorAll<HTMLElement>("[data-exercicio-id]");
    cardRectsRef.current = new Map();
    cards.forEach(card => {
      const id = card.dataset.exercicioId!;
      cardRectsRef.current.set(id, card.getBoundingClientRect());
    });
  };

  // Encontra qual card está sob o ponto Y atual
  const findCardAtY = (clientY: number): string | null => {
    let closest: string | null = null;
    let closestDist = Infinity;
    cardRectsRef.current.forEach((rect, id) => {
      if (id === draggingIdRef.current) return;
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        closest = id;
      }
    });
    return closest;
  };

  const handleTouchDragStart = (exercicioId: string) => {
    draggingIdRef.current = exercicioId;
    lastSwapIdRef.current = null;
    throttleRef.current = false;
    setDraggingId(exercicioId);
    captureCardRects();
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleTouchDragMove = (clientY: number) => {
    // Throttle: ignora eventos por 200ms após cada troca (evita piscar)
    if (throttleRef.current) return;

    const targetId = findCardAtY(clientY);
    if (!targetId || targetId === draggingIdRef.current) return;
    // Só troca se o alvo mudou (evita trocar repetidamente com o mesmo card)
    if (targetId === lastSwapIdRef.current) return;

    lastSwapIdRef.current = targetId;
    setDragOverId(targetId);

    const items = sortedItemsRef.current;
    const from = items.findIndex(e => e.exercicio_id === draggingIdRef.current);
    const to = items.findIndex(e => e.exercicio_id === targetId);
    if (from === -1 || to === -1) return;

    const novaOrdem = [...items];
    novaOrdem.splice(from, 1);
    novaOrdem.splice(to, 0, items[from]);
    setSortedItems(novaOrdem);
    if (navigator.vibrate) navigator.vibrate(15);

    // Throttle de 200ms antes de permitir próxima troca
    throttleRef.current = true;
    setTimeout(() => {
      throttleRef.current = false;
      requestAnimationFrame(captureCardRects);
    }, 200);
  };

  const handleTouchDragEnd = async () => {
    const finalOrder = sortedItemsRef.current;
    draggingIdRef.current = null;
    lastSwapIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
    await saveOrder(finalOrder);
  };

  // Mouse drag handlers (desktop)
  const handleDragOver = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setDragOverId(targetId);
    const from = sortedItems.findIndex(e => e.exercicio_id === draggingId);
    const to = sortedItems.findIndex(e => e.exercicio_id === targetId);
    if (from === -1 || to === -1) return;
    const novaOrdem = [...sortedItems];
    novaOrdem.splice(from, 1);
    novaOrdem.splice(to, 0, sortedItems[from]);
    setSortedItems(novaOrdem);
  };

  const handleDrop = async () => {
    if (!draggingId) return;
    setDraggingId(null);
    setDragOverId(null);
    await saveOrder(sortedItems);
  };

  const handleResetOrder = async () => {
    try {
      await offlineDelete("exercicio_ordem_usuario", { user_id: userId, grupo_id: grupoId });
      setSortedItems([...exercicios].sort((a, b) => a.ordem - b.ordem));
      toast.success("Ordem resetada para o padrão.");
    } catch (e: any) {
      toast.error("Erro ao resetar ordem: " + (e?.message || "erro desconhecido"));
    }
  };

  const getSeriesForExercicio = useCallback(
    (exId: string) => series.filter(s => s.exercicio_id === exId || s.exercicio_usuario_id === exId).sort((a, b) => a.numero_serie - b.numero_serie),
    [series]
  );

  // Atualiza o cache local após salvar (evita que reload traga dados antigos)
  const updateSeriesCache = useCallback((updatedSeries: SerieComMemoria[]) => {
    const cacheKey = `series_${userId}_${dateKey}`;
    setCacheData(cacheKey, updatedSeries);
  }, [userId, dateKey]);

  // Monta o objeto de série correto: usa exercicio_usuario_id para exercícios pessoais
  const buildSerieData = (exercicioId: string, base: Record<string, any>) => {
    const serieInfo = series.find(s => s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId);
    const exUsuarioId = serieInfo?.exercicio_usuario_id;

    if (exUsuarioId) {
      // Exercício pessoal: usa exercicio_usuario_id e deixa exercicio_id null
      return { ...base, exercicio_id: null, exercicio_usuario_id: exUsuarioId };
    }
    // Exercício padrão: usa exercicio_id normalmente
    return { ...base, exercicio_id: exercicioId };
  };

  // Helper: encontra ou gera id para uma série no SQLite
  const findOrCreateSerieId = async (exercicioId: string, exUsuarioId: string | undefined, numSerie: number): Promise<string> => {
    const field = exUsuarioId ? "exercicio_usuario_id" : "exercicio_id";
    const val = exUsuarioId || exercicioId;
    const rows = await db.getAll(
      `SELECT id FROM tb_treino_series WHERE user_id = ? AND ${field} = ? AND data_treino = ? AND numero_serie = ?`,
      [userId, val, dateKey, numSerie]
    );
    if (rows && rows.length > 0) return (rows[0] as any).id;
    return crypto.randomUUID();
  };

  // Helper: upsert de série via Supabase (com fallback offline)
  const upsertSerie = async (exercicioId: string, data: Record<string, any>) => {
    const exUsuarioId = data.exercicio_usuario_id || null;
    const exIdVal = data.exercicio_id || null;
    const id = await findOrCreateSerieId(exercicioId, exUsuarioId, data.numero_serie);
    const conflictKey = exUsuarioId
      ? "user_id,exercicio_usuario_id,data_treino,numero_serie"
      : "user_id,exercicio_id,data_treino,numero_serie";
    await offlineUpsert("tb_treino_series", {
      id,
      user_id: data.user_id,
      exercicio_id: exIdVal,
      exercicio_usuario_id: exUsuarioId,
      data_treino: data.data_treino,
      numero_serie: data.numero_serie,
      peso: data.peso ?? null,
      reps: data.reps ?? null,
      tempo_segundos: data.tempo_segundos ?? null,
      distancia_km: data.distancia_km ?? null,
      pace_segundos_km: data.pace_segundos_km ?? null,
      concluida: data.concluida ?? null,
      updated_at: data.updated_at ?? new Date().toISOString(),
    }, conflictKey);
  };

  const handleSaveSerie = async (
    exercicioId: string, numeroSerie: number, peso: number, reps: number,
    tempoSegundos?: number, distanciaKm?: number
  ) => {
    const pace = tempoSegundos && distanciaKm ? calcularPace(tempoSegundos, distanciaKm) : undefined;
    const data = buildSerieData(exercicioId, {
      user_id: userId,
      data_treino: dateKey,
      numero_serie: numeroSerie,
      peso: tempoSegundos ? null : peso,
      reps: tempoSegundos ? null : reps,
      tempo_segundos: tempoSegundos ?? null,
      distancia_km: distanciaKm ?? null,
      pace_segundos_km: pace ?? null,
      updated_at: new Date().toISOString(),
    });
    await upsertSerie(exercicioId, data);
    onSeriesUpdate(prev => {
      const updated = prev.map(s =>
        (s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && s.numero_serie === numeroSerie
          ? { ...s, peso, reps, tempo_segundos: tempoSegundos, distancia_km: distanciaKm, pace_segundos_km: pace, salva: true }
          : s
      );
      updateSeriesCache(updated);
      return updated;
    });
  };

  const handleConcluirSerie = async (
    exercicioId: string, exercicioNome: string, numeroSerie: number, peso: number, reps: number,
    tempoSegundos?: number, distanciaKm?: number
  ) => {
    const pace = tempoSegundos && distanciaKm ? calcularPace(tempoSegundos, distanciaKm) : undefined;
    const now = new Date().toISOString();

    // Salva TODAS as séries não salvas do mesmo exercício ANTES de concluir
    const naoSalvas = series
      .filter(s => (s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && !s.salva && s.numero_serie !== numeroSerie);
    for (const s of naoSalvas) {
      const data = buildSerieData(exercicioId, {
        user_id: userId,
        data_treino: dateKey,
        numero_serie: s.numero_serie,
        peso: s.peso ?? 0,
        reps: s.reps ?? 10,
        concluida: false,
        updated_at: now,
      });
      await upsertSerie(exercicioId, data);
    }

    // Salva a série concluída
    const data = buildSerieData(exercicioId, {
      user_id: userId,
      data_treino: dateKey,
      numero_serie: numeroSerie,
      peso: tempoSegundos ? null : peso,
      reps: tempoSegundos ? null : reps,
      tempo_segundos: tempoSegundos ?? null,
      distancia_km: distanciaKm ?? null,
      pace_segundos_km: pace ?? null,
      concluida: true,
      updated_at: now,
    });
    await upsertSerie(exercicioId, data);
    onSeriesUpdate(prev => {
      const updated = prev.map(s => {
        if ((s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && s.numero_serie === numeroSerie) {
          return { ...s, peso, reps, tempo_segundos: tempoSegundos, distancia_km: distanciaKm, pace_segundos_km: pace, concluida: true, salva: true };
        }
        if ((s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && !s.salva) {
          return { ...s, salva: true };
        }
        return s;
      });
      updateSeriesCache(updated);
      return updated;
    });
    onSerieConcluida(exercicioNome, numeroSerie, exercicioId);
  };

  const handleDesfazerSerie = async (exercicioId: string, numeroSerie: number) => {
    const naoSalvas = series
      .filter(s => (s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && !s.salva);
    for (const s of naoSalvas) {
      // Pula séries que nunca foram editadas (peso indefinido ou 0 sem reps alterados)
      if ((s.peso === undefined || s.peso === 0) && (s.reps === undefined || s.reps === 10)) continue;
      const data = buildSerieData(exercicioId, {
        user_id: userId,
        data_treino: dateKey,
        numero_serie: s.numero_serie,
        peso: s.peso ?? 0,
        reps: s.reps ?? 10,
        concluida: false,
        updated_at: new Date().toISOString(),
      });
      await upsertSerie(exercicioId, data);
    }

    const serieInfo = series.find(s => s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId);
    const field = serieInfo?.exercicio_usuario_id ? "exercicio_usuario_id" : "exercicio_id";
    const val = serieInfo?.exercicio_usuario_id || exercicioId;
    await offlineUpdate("tb_treino_series", {
      concluida: false,
      updated_at: new Date().toISOString(),
    }, {
      user_id: userId,
      [field]: val,
      data_treino: dateKey,
      numero_serie: numeroSerie,
    });
    onSeriesUpdate(prev => prev.map(s => {
      if ((s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && s.numero_serie === numeroSerie) {
        return { ...s, concluida: false };
      }
      // Marca as séries do histórico como salvas (agora existem no banco)
      if ((s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && !s.salva) {
        return { ...s, salva: true };
      }
      return s;
    }));
  };

  const handleAddSerie = async (exercicioId: string) => {
    const existing = getSeriesForExercicio(exercicioId);
    const last = existing[existing.length - 1];
    const novoNum = existing.length > 0 ? Math.max(...existing.map(s => s.numero_serie)) + 1 : 1;
    const peso = last?.peso ?? 0;
    const reps = last?.reps ?? 10;
    const serieInfo = series.find(s => s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId);
    const exUsuarioId = serieInfo?.exercicio_usuario_id;
    const data = buildSerieData(exercicioId, {
      user_id: userId, data_treino: dateKey,
      numero_serie: novoNum, peso, reps,
      updated_at: new Date().toISOString(),
    });
    await upsertSerie(exercicioId, data);
    onSeriesUpdate(prev => [...prev, { exercicio_id: exercicioId, exercicio_usuario_id: exUsuarioId, numero_serie: novoNum, peso, reps, concluida: false, salva: true }]);
  };

  const handleRemoveSerie = async (exercicioId: string, numeroSerie: number, isSalva: boolean) => {
    if (isSalva) {
      const serieInfo = series.find(s => s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId);
      const field = serieInfo?.exercicio_usuario_id ? "exercicio_usuario_id" : "exercicio_id";
      const val = serieInfo?.exercicio_usuario_id || exercicioId;
      await offlineDelete("tb_treino_series", {
        user_id: userId,
        [field]: val,
        data_treino: dateKey,
        numero_serie: numeroSerie,
      });
    }
    // Renumera localmente e atualiza no banco
    onSeriesUpdate(prev => {
      const updated = prev
        .filter(s => !((s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && s.numero_serie === numeroSerie))
        .map(s => (s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && s.numero_serie > numeroSerie
          ? { ...s, numero_serie: s.numero_serie - 1 } : s);

      // Atualiza numero_serie no banco para séries renumeradas
      const renumeradas = updated.filter(
        s => (s.exercicio_id === exercicioId || s.exercicio_usuario_id === exercicioId) && s.salva && s.numero_serie >= numeroSerie
      );
      for (const s of renumeradas) {
        const data = buildSerieData(exercicioId, {
          user_id: userId,
          data_treino: dateKey,
          numero_serie: s.numero_serie,
          peso: s.peso ?? 0,
          reps: s.reps ?? 10,
          concluida: s.concluida ?? false,
          updated_at: new Date().toISOString(),
        });
        upsertSerie(exercicioId, data);
      }

      return updated;
    });
  };

  const handleConcluir = async () => {
    setSaving(true);
    if (concluido) {
      await offlineDelete("tb_treino_concluido", { user_id: userId, data_treino: dateKey });
    } else {
      const id = crypto.randomUUID();
      await offlineUpsert("tb_treino_concluido", {
        id,
        user_id: userId,
        data_treino: dateKey,
        grupo_id: grupoId,
        grupo_usuario_id: null,
        created_at: new Date().toISOString(),
      }, "user_id,data_treino");
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
        <div className="space-y-8" ref={listContainerRef}>
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
                db={db}
                tipoCorrida={tipoCorrida}
                isDragging={draggingId === ex.id}
                isDragOver={dragOverId === ex.id}
                onDragStart={() => { setDraggingId(ex.id); captureCardRects(); if (navigator.vibrate) navigator.vibrate(30); }}
                onDragOver={() => handleDragOver(ex.id)}
                onDrop={handleDrop}
                onDragEnd={handleDrop}
                onTouchDragStart={() => handleTouchDragStart(ex.id)}
                onTouchDragMove={handleTouchDragMove}
                onTouchDragEnd={handleTouchDragEnd}
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
  exercicio: ex, series: exSeries, userId, dateKey, db, tipoCorrida,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  onTouchDragStart, onTouchDragMove, onTouchDragEnd,
  onSetInfoExercicio, onSetHistorico,
  onSaveSerie, onRemoveSerie, onConcluirSerie, onDesfazerSerie, onAddSerie,
}: {
  exercicio: Exercicio;
  series: SerieComMemoria[];
  userId: string;
  dateKey: string;
  db: any;
  tipoCorrida: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onTouchDragStart: () => void;
  onTouchDragMove: (clientY: number) => void;
  onTouchDragEnd: () => void;
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
  const comentarioCarregadoRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragActiveRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    dragActiveRef.current = false;
    // Inicia long press: 3 segundos para ativar o drag
    longPressTimer.current = setTimeout(() => {
      dragActiveRef.current = true;
      onTouchDragStart();
      if (navigator.vibrate) navigator.vibrate(100);
    }, 3000);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!dragActiveRef.current) {
      // Se moveu antes dos 3s, cancela o long press
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      return;
    }
    const touch = e.touches[0];
    onTouchDragMove(touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (dragActiveRef.current) {
      dragActiveRef.current = false;
      onTouchDragEnd();
    }
  };

  // Cleanup do longPressTimer no unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (comentarioCarregadoRef.current) return;
    comentarioCarregadoRef.current = true;
    carregarComentario(userId, ex.id, false, db).then(c => setTemComentario(c.trim().length > 0));
  }, [ex.id, userId, db]);

  return (
    <div
      data-exercicio-id={ex.id}
      className={`result-card border-muted-foreground/30 relative transition-all ${isDragging ? "opacity-40 border-primary scale-95" : ""} ${isDragOver && !isDragging ? "border-primary/60 bg-primary/5" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-primary touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
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
            carregarComentario(userId, ex.id, false, db).then(c => setTemComentario(c.trim().length > 0));
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
  const isConcluida = serie.concluida === true;

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!tipoCorrida) {
      // Na primeira renderização, sempre sincroniza com os dados da série
      // Nas seguintes, só sincroniza se a série foi salva (evita sobrescrever edição do usuário)
      if (!serie.concluida && serie.peso > 0 && (!initializedRef.current || serie.salva)) {
        setPeso(String(serie.peso));
      }
      if (!serie.concluida && serie.reps > 0 && (!initializedRef.current || serie.salva)) {
        setReps(String(serie.reps));
      }
      initializedRef.current = true;
    } else {
      setTempo(serie.tempo_segundos ? formatTempo(serie.tempo_segundos) : "");
      setDistancia(serie.distancia_km ? String(serie.distancia_km) : "");
    }
  }, [serie.peso, serie.reps, serie.tempo_segundos, serie.distancia_km, serie.concluida, serie.salva, tipoCorrida]);

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
        onBlur={e => { e.preventDefault(); onSave(parseFloat(peso) || 0, parseInt(reps) || 0); }}
        className="w-12 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-1 outline-none focus:border-primary transition-colors"
        placeholder="kg" />
      <span className="text-muted-foreground text-xs">kg</span>
      <span className="text-muted-foreground text-xs">×</span>
      <input type="number" value={reps} onChange={e => setReps(e.target.value)}
        onBlur={e => { e.preventDefault(); onSave(parseFloat(peso) || 0, parseInt(reps) || 0); }}
        className="w-11 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-1 outline-none focus:border-primary transition-colors"
        placeholder="reps" />
      <span className="text-muted-foreground text-xs">reps</span>
      {!serie.salva && <span className="text-[10px] text-yellow-500/60 font-heading">↑ último</span>}
      <button type="button" onClick={() => onConcluir(parseFloat(peso) || 0, parseInt(reps) || 0)}
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
