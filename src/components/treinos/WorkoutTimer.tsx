import { useState, useEffect, useRef } from "react";
import { Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { offlineUpsert } from "@/lib/offlineSync";

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
  series: { exercicio_id: string; concluida?: boolean }[];
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (ativo) {
      intervalRef.current = setInterval(() => {
        setSegundos((s) => s + 1);
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [ativo]);

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

    const exConcluidos: Record<string, { nome: string; series_concluidas: number; concluido_em: string }> = {};
    series.filter((s) => s.concluida).forEach((s) => {
      const ex = exerciciosMap[s.exercicio_id];
      if (!ex) return;
      if (!exConcluidos[s.exercicio_id]) {
        exConcluidos[s.exercicio_id] = { nome: ex.nome, series_concluidas: 0, concluido_em: agora.toISOString() };
      }
      exConcluidos[s.exercicio_id].series_concluidas++;
    });

    const exerciciosArray = Object.entries(exConcluidos).map(([id, data]) => ({ exercicio_id: id, ...data }));

    const historicoId = crypto.randomUUID();
    await offlineUpsert("treino_historico", {
      id: historicoId,
      user_id: userId,
      nome_treino: grupoNome,
      iniciado_em: iniciadoEm.toISOString(),
      concluido_em: agora.toISOString(),
      duracao_segundos: duracao,
      exercicios_concluidos: exerciciosArray,
      created_at: agora.toISOString(),
    }, "id");

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
      <div className="result-card border-classify-green/50 text-center py-6 mb-6">
        <p className="text-classify-green font-heading text-lg mb-1">🎉 Parabéns!</p>
        <p className="text-foreground font-heading text-2xl mb-2">{formatDuracao(duracaoFinal)}</p>
        <p className="text-muted-foreground font-body text-sm mb-4">Treino de {grupoNome} concluído com sucesso!</p>
        <button type="button" onClick={handleFecharParabens} className="text-xs text-muted-foreground hover:text-foreground font-heading uppercase tracking-wider transition-colors">
          Fechar
        </button>
      </div>
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
    </div>
  );
};

export default WorkoutTimer;
