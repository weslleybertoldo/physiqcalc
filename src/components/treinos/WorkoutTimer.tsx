import { useState, useEffect, useRef } from "react";
import { Play, CheckCircle2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { usePowerSync } from "@powersync/react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CompartilharTreinoModal from "./CompartilharTreinoModal";
import { buildTreinoResumo, type TreinoResumo } from "@/lib/treinoResumo";

// Persistência do timer de treino no localStorage
const LS_WORKOUT_KEY = "physiq_workout_timer";

interface WorkoutTimerState {
  ativo: boolean;
  startedAt: number; // timestamp ms
  dateKey: string;
  grupoNome: string;
}

function lerWorkoutSalvo(): WorkoutTimerState | null {
  try {
    const raw = localStorage.getItem(LS_WORKOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkoutTimerState;
  } catch { return null; }
}

interface Props {
  userId: string;
  grupoNome: string;
  dateKey: string;
  series: {
    exercicio_id: string;
    concluida?: boolean;
    numero_serie?: number;
    peso?: number;
    reps?: number;
    academia_nome?: string | null;
  }[];
  exerciciosMap: Record<string, { nome: string; emoji: string }>;
  onTreinoConcluido?: () => void;
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDuracao(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

const WorkoutTimer = ({ userId, grupoNome, dateKey, series, exerciciosMap, onTreinoConcluido }: Props) => {
  const db = usePowerSync();
  // Inicializa segundos a partir do LS se tiver treino em andamento para o mesmo dia
  const [ativo, setAtivo] = useState(() => {
    const saved = lerWorkoutSalvo();
    return !!(saved && saved.ativo && saved.dateKey === dateKey);
  });

  const [segundos, setSegundos] = useState(() => {
    const saved = lerWorkoutSalvo();
    if (saved && saved.ativo && saved.dateKey === dateKey) {
      return Math.floor((Date.now() - saved.startedAt) / 1000);
    }
    return 0;
  });

  const [iniciadoEm, setIniciadoEm] = useState<Date | null>(() => {
    const saved = lerWorkoutSalvo();
    if (saved && saved.ativo && saved.dateKey === dateKey) {
      return new Date(saved.startedAt);
    }
    return null;
  });

  const [concluido, setConcluido] = useState(false);
  const [duracaoFinal, setDuracaoFinal] = useState(0);
  const [resumoConcluido, setResumoConcluido] = useState<TreinoResumo | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Todas as séries concluídas com o timer rodando → pergunta se finaliza o treino.
  // Pergunta 1x por transição (Não = continua contando; refaz/conclui de novo → pergunta de novo).
  const [confirmFim, setConfirmFim] = useState(false);
  const todasConcluidasRef = useRef(false);
  const todasConcluidas = series.length > 0 && series.every((s) => s.concluida);
  useEffect(() => {
    if (ativo && todasConcluidas && !todasConcluidasRef.current) setConfirmFim(true);
    todasConcluidasRef.current = todasConcluidas;
  }, [ativo, todasConcluidas]);

  // Ao mudar de dia, verificar se o treino salvo é para o mesmo dia
  useEffect(() => {
    const saved = lerWorkoutSalvo();
    if (saved && saved.ativo && saved.dateKey === dateKey) {
      const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
      setAtivo(true);
      setSegundos(elapsed);
      setIniciadoEm(new Date(saved.startedAt));
    } else if (!saved || saved.dateKey !== dateKey) {
      // Outro dia selecionado — não mostrar timer ativo
      setAtivo(false);
      setSegundos(0);
      setIniciadoEm(null);
    }
  }, [dateKey]);

  // Tick recalcula pelo timestamp de início (não incrementa +1): em background o
  // WebView suspende timers JS e ticks se perdem — ao voltar, o valor corrige na hora.
  useEffect(() => {
    if (ativo && iniciadoEm) {
      const tick = () =>
        setSegundos(Math.max(0, Math.floor((Date.now() - iniciadoEm.getTime()) / 1000)));
      tick();
      intervalRef.current = setInterval(tick, 1000);
      document.addEventListener("visibilitychange", tick);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        document.removeEventListener("visibilitychange", tick);
      };
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [ativo, iniciadoEm]);

  const handleIniciar = () => {
    const agora = Date.now();
    localStorage.setItem(LS_WORKOUT_KEY, JSON.stringify({
      ativo: true,
      startedAt: agora,
      dateKey,
      grupoNome,
    } as WorkoutTimerState));
    setAtivo(true);
    setSegundos(0);
    setIniciadoEm(new Date(agora));
    setConcluido(false);
  };

  const handleConcluir = async () => {
    if (!iniciadoEm) return;
    setAtivo(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    localStorage.removeItem(LS_WORKOUT_KEY);

    const agora = new Date();
    const duracao = Math.round((agora.getTime() - iniciadoEm.getTime()) / 1000);

    // Guarda também peso/reps por série e a academia, pro detalhe e imagem do treino.
    const academiaTreino = series.find((s) => s.academia_nome)?.academia_nome ?? null;
    const exConcluidos: Record<string, {
      nome: string;
      series_concluidas: number;
      concluido_em: string;
      academia_nome: string | null;
      series: { numero_serie: number; peso: number; reps: number }[];
    }> = {};
    series.filter((s) => s.concluida).forEach((s) => {
      const exKey = s.exercicio_id;
      const ex = exerciciosMap[exKey];
      // Fallback: se exercício não está no map, usa nome genérico em vez de dropar silenciosamente
      const nome = ex?.nome || `Exercício ${exKey.slice(0, 6)}`;
      if (!exConcluidos[exKey]) {
        exConcluidos[exKey] = { nome, series_concluidas: 0, concluido_em: agora.toISOString(), academia_nome: academiaTreino, series: [] };
      }
      exConcluidos[exKey].series_concluidas++;
      exConcluidos[exKey].series.push({
        numero_serie: s.numero_serie ?? exConcluidos[exKey].series.length + 1,
        peso: s.peso ?? 0,
        reps: s.reps ?? 0,
      });
    });

    const exerciciosArray = Object.entries(exConcluidos).map(([id, data]) => ({ exercicio_id: id, ...data }));

    await db.execute(
      `INSERT INTO treino_historico (id, user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos, exercicios_concluidos, created_at)
       VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
      [userId, grupoNome, iniciadoEm.toISOString(), agora.toISOString(), duracao, JSON.stringify(exerciciosArray), agora.toISOString()]
    );

    setResumoConcluido(buildTreinoResumo({
      nome_treino: grupoNome,
      iniciado_em: iniciadoEm.toISOString(),
      concluido_em: agora.toISOString(),
      duracao_segundos: duracao,
      exercicios_concluidos: exerciciosArray,
    }));
    setDuracaoFinal(duracao);
    setConcluido(true);
    toast.success(`Treino concluído em ${formatDuracao(duracao)}! 💪🔥`);
    onTreinoConcluido?.();
  };

  const handleFecharParabens = () => {
    setConcluido(false);
    setIniciadoEm(null);
    setSegundos(0);
  };

  if (concluido) {
    return (
      <>
        <div className="result-card border-classify-green/50 text-center py-6 mb-6">
          <p className="text-classify-green font-heading text-lg mb-1">🎆 Treino finalizado!</p>
          <p className="text-foreground font-heading text-2xl mb-2">{formatDuracao(duracaoFinal)}</p>
          <p className="text-muted-foreground font-body text-sm mb-4">Treino de {grupoNome} concluído com sucesso!</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setCompartilhando(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider transition-colors hover:bg-primary/90"
            >
              <Share2 size={14} /> Compartilhar treino
            </button>
            <button type="button" onClick={handleFecharParabens} className="text-xs text-muted-foreground hover:text-foreground font-heading uppercase tracking-wider transition-colors">
              Fechar
            </button>
          </div>
        </div>
        {compartilhando && resumoConcluido && (
          <CompartilharTreinoModal resumo={resumoConcluido} onClose={() => setCompartilhando(false)} />
        )}
      </>
    );
  }

  if (!ativo) {
    return (
      <button
        type="button"
        onClick={handleIniciar}
        className="w-full py-4 mb-6 bg-classify-green/20 border border-classify-green/50 text-classify-green font-heading text-sm uppercase tracking-widest transition-colors hover:bg-classify-green/30 flex items-center justify-center gap-2"
      >
        <Play size={16} /> INICIAR TREINO
      </button>
    );
  }

  return (
    <div className="result-card border-classify-green/50 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-classify-green opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-classify-green"></span>
          </span>
          <div>
            <p className="text-xs text-classify-green font-heading uppercase tracking-wider">Treino em andamento</p>
            <p className="text-muted-foreground font-body text-xs">{grupoNome}</p>
          </div>
        </div>
        <p className="font-heading text-2xl text-foreground tabular-nums">{formatTimer(segundos)}</p>
      </div>
      <button
        type="button"
        onClick={handleConcluir}
        className="w-full mt-4 py-3 bg-classify-green text-background font-heading text-xs uppercase tracking-widest transition-colors hover:bg-classify-green/90 flex items-center justify-center gap-2"
      >
        <CheckCircle2 size={14} /> TREINO CONCLUÍDO
      </button>

      <AlertDialog open={confirmFim} onOpenChange={setConfirmFim}>
        <AlertDialogContent className="bg-background border-muted-foreground/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Treino foi concluído?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as séries de {grupoNome} foram concluídas. Finalizar a contagem em {formatTimer(segundos)}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não, continuar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmFim(false); void handleConcluir(); }}>
              Sim, finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkoutTimer;
