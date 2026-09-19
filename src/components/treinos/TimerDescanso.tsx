import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { X, Play, Pause, RotateCcw, Volume2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  requestNotificationPermission,
  startTimerNotifications,
  showTimerFinishedNotification,
  cancelTimerNotification,
} from "@/lib/nativeNotifications";
import { restanteDescanso } from "@/lib/descanso";
import { SOM_EVENTO, VIBRACAO_FIM_DESCANSO, deveVibrar, lerSomDescanso, temSom, tocarSom } from "@/lib/somDescanso";

const isNative = Capacitor.isNativePlatform();

const LS_REST_KEY = "physiq_rest_timer";

interface RestTimerState {
  ativo: boolean;
  startedAt: number;
  pausedRemaining: number;
  isPaused: boolean;
  duracao: number;
  exercicioNome: string;
  numeroSerie: number;
  // Identificador único da série — muda só quando o usuário clica OK em uma série
  serieId: string;
}

interface TimerDescansoProps {
  ativo: boolean;
  exercicioNome: string;
  numeroSerie: number;
  duracaoSegundos: number;
  // Identificador único da série concluída (ex: "exercicioId-numeroSerie-timestamp")
  // Muda APENAS quando uma nova série é concluída — NÃO muda ao trocar de dia
  serieId: string;
  onFechado: () => void;
  onTempoAlterado: (segundos: number) => void;
  /** Abre o popup "Som do descanso" (ícone 🔊 na barra) — o aluno não tem a engrenagem de Configurações */
  onAbrirSom?: () => void;
}

function lerEstadoSalvo(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(LS_REST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RestTimerState;
  } catch { return null; }
}

function salvarEstado(state: RestTimerState) {
  localStorage.setItem(LS_REST_KEY, JSON.stringify(state));
}

function limparEstado() {
  localStorage.removeItem(LS_REST_KEY);
}

// Notificações nativas são gerenciadas pelo Android (não dependem de JS em background)

const TimerDescanso = ({
  ativo, exercicioNome, numeroSerie, duracaoSegundos, serieId, onFechado, onTempoAlterado, onAbrirSom,
}: TimerDescansoProps) => {
  const calcularRestante = useCallback((state: RestTimerState): number => restanteDescanso(state), []);

  // Inicializa com o estado salvo no localStorage (persiste entre reloads)
  const [seconds, setSeconds] = useState(() => {
    const saved = lerEstadoSalvo();
    if (saved && saved.ativo) return calcularRestante(saved);
    return duracaoSegundos;
  });
  const [paused, setPaused] = useState(() => lerEstadoSalvo()?.isPaused ?? false);
  const [finished, setFinished] = useState(false);
  const [editMinutes, setEditMinutes] = useState(() => {
    const saved = lerEstadoSalvo();
    return String((saved?.duracao ?? duracaoSegundos) / 60);
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const notifiedRef = useRef(false);
  const duracaoAtualRef = useRef(duracaoSegundos);
  // Guarda o serieId da última série que disparou o timer
  const lastSerieIdRef = useRef<string>("");

  useEffect(() => { requestNotificationPermission(); }, []);

  // Ao montar: recuperar estado salvo (preserva timer após reload/troca de aba)
  useEffect(() => {
    const saved = lerEstadoSalvo();
    if (saved && saved.ativo) {
      const restante = calcularRestante(saved);
      duracaoAtualRef.current = saved.duracao;
      lastSerieIdRef.current = saved.serieId;
      setSeconds(restante);
      setPaused(saved.isPaused);
      setEditMinutes(String(saved.duracao / 60));
      if (restante <= 0) setFinished(true);
    }
  }, [calcularRestante]);

  // NOVA SÉRIE CONCLUÍDA: só reinicia quando o serieId muda E o timer está ativo
  // Trocar de dia NÃO muda o serieId → timer continua sem resetar
  useEffect(() => {
    if (!ativo) return;
    if (serieId === lastSerieIdRef.current) return; // mesmo serieId = não reinicia
    lastSerieIdRef.current = serieId;

    const newState: RestTimerState = {
      ativo: true,
      startedAt: Date.now(),
      pausedRemaining: duracaoSegundos,
      isPaused: false,
      duracao: duracaoSegundos,
      exercicioNome,
      numeroSerie,
      serieId,
    };
    salvarEstado(newState);
    duracaoAtualRef.current = duracaoSegundos;
    setSeconds(duracaoSegundos);
    setPaused(false);
    setFinished(false);
    notifiedRef.current = false;
    setEditMinutes(String(duracaoSegundos / 60));

    // Mostra notificação persistente + agenda notificação de fim com som
    startTimerNotifications(`${exercicioNome} — Série ${numeroSerie}`, duracaoSegundos);
  }, [ativo, serieId, duracaoSegundos, exercicioNome, numeroSerie]);

  // Som do fim do descanso = escolha do aluno (Configurações › Som; padrão "Bip" = os 3 toques de sempre)
  const playBeep = useCallback(async () => {
    try {
      const som = lerSomDescanso();
      if (!temSom(som)) return; // "Só vibrar" / "Silencioso"
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      // Resume context if suspended (happens after app goes to background)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      tocarSom(ctx, som);
    } catch {}
  }, []);

  // Vibração do fim do descanso — só se o som escolhido vibra ("Silencioso" não)
  const vibrarFim = useCallback(() => {
    if (deveVibrar(lerSomDescanso()) && navigator.vibrate) navigator.vibrate(VIBRACAO_FIM_DESCANSO);
  }, []);

  // Loop do timer — roda enquanto ativo, não pausado e não finalizado.
  // O restante é DERIVADO do startedAt salvo (relógio real), nunca "segundos - 1":
  // em background o WebView congela/estrangula o setInterval e um contador local
  // ficava pra trás — o toque nativo tocava na hora certa, mas a tela seguia contando.
  // (A versão antiga ainda re-ancorava o startedAt a cada tick, cristalizando o atraso.)
  useEffect(() => {
    if (!ativo || paused || finished) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const tick = () => {
      const saved = lerEstadoSalvo();
      // Sem estado salvo (estado de transição) → contador local como reserva
      const restante = saved && saved.ativo ? calcularRestante(saved) : null;
      if (restante === null) {
        setSeconds((s) => Math.max(0, s - 1));
        return;
      }
      if (restante <= 0) {
        setSeconds(0);
        setFinished(true);
        // No APK, o Foreground Service cuida do som e vibração
        // No PWA, toca beep via AudioContext + vibração do browser
        if (!isNative) {
          playBeep();
          vibrarFim();
        }
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          showTimerFinishedNotification(exercicioNome);
        }
        limparEstado();
        return;
      }
      setSeconds(restante);
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [ativo, paused, finished, playBeep, vibrarFim, exercicioNome, calcularRestante]);

  // Quando app volta ao primeiro plano, recalcula tempo real decorrido
  useEffect(() => {
    if (!ativo) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // NÃO cancela a notificação ao voltar — ela continua visível
        const saved = lerEstadoSalvo();
        if (!saved || !saved.ativo) return;
        const restante = calcularRestante(saved);
        if (restante <= 0) {
          setFinished(true);
          setSeconds(0);
          // Remove notificação do cronômetro (acabou o tempo)
          cancelTimerNotification();
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            playBeep();
            vibrarFim();
          }
          limparEstado();
        } else {
          setSeconds(restante);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ativo, calcularRestante, playBeep, vibrarFim]);

  // Trocou o som (Configurações › Som) com um descanso correndo → re-arma o serviço nativo com o som
  // novo e o tempo restante (web = no-op: startTimerNotifications sai se !isNative e lê o som na hora)
  useEffect(() => {
    if (!ativo || paused || finished) return;
    const onSomTrocado = () => {
      const saved = lerEstadoSalvo();
      if (!saved || !saved.ativo || saved.isPaused) return;
      const restante = calcularRestante(saved);
      if (restante <= 0) return;
      startTimerNotifications(`${saved.exercicioNome} — Série ${saved.numeroSerie}`, restante);
    };
    window.addEventListener(SOM_EVENTO, onSomTrocado);
    return () => window.removeEventListener(SOM_EVENTO, onSomTrocado);
  }, [ativo, paused, finished, calcularRestante]);

  const handleTogglePause = () => {
    const nowPaused = !paused;
    setPaused(nowPaused);
    const saved = lerEstadoSalvo();
    if (saved) {
      if (nowPaused) {
        salvarEstado({ ...saved, isPaused: true, pausedRemaining: seconds });
        cancelTimerNotification();
      } else {
        salvarEstado({ ...saved, isPaused: false, startedAt: Date.now() - ((saved.duracao - seconds) * 1000) });
        startTimerNotifications(`${saved.exercicioNome} — Série ${saved.numeroSerie}`, seconds);
      }
    }
  };

  const handleReset = () => {
    const dur = duracaoAtualRef.current;
    setSeconds(dur); setPaused(false); setFinished(false); notifiedRef.current = false;
    const saved = lerEstadoSalvo();
    if (saved) {
      salvarEstado({ ...saved, startedAt: Date.now(), isPaused: false, pausedRemaining: dur, duracao: dur });
      startTimerNotifications(`${saved.exercicioNome} — Série ${saved.numeroSerie}`, dur);
    }
  };

  const handleSubtract15 = () => {
    setSeconds((s) => {
      const next = Math.max(0, s - 15);
      const saved = lerEstadoSalvo();
      if (saved) {
        if (saved.isPaused) {
          salvarEstado({ ...saved, pausedRemaining: next });
        } else {
          // Recalcula startedAt para refletir os 15s subtraídos
          const newStartedAt = Date.now() - ((saved.duracao - next) * 1000);
          salvarEstado({ ...saved, startedAt: newStartedAt, pausedRemaining: next });
        }
      }
      return next;
    });
  };

  const handleChangeTime = (val: string) => {
    setEditMinutes(val);
    const m = Math.max(0.5, Math.min(10, parseFloat(val) || 2));
    const newSec = Math.round(m * 60);
    duracaoAtualRef.current = newSec;
    setSeconds(newSec);
    setPaused(false);
    setFinished(false);
    notifiedRef.current = false;
    onTempoAlterado(newSec);
    const saved = lerEstadoSalvo();
    if (saved) {
      salvarEstado({ ...saved, duracao: newSec, pausedRemaining: newSec, startedAt: Date.now(), isPaused: false });
      // Reagenda notificação com o novo tempo
      startTimerNotifications(`${saved.exercicioNome} — Série ${saved.numeroSerie}`, newSec);
    }
  };

  const handleFechar = () => {
    limparEstado();
    cancelTimerNotification();
    if (audioRef.current) {
      audioRef.current.close().catch(() => {});
      audioRef.current = null;
    }
    onFechado();
  };

  if (!ativo) return null;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = Math.min(100, ((duracaoAtualRef.current - seconds) / duracaoAtualRef.current) * 100);
  const timerColor = seconds > 60 ? "text-classify-green" : seconds > 30 ? "text-primary" : "text-destructive";
  const progressColor = seconds > 60 ? "[&>div]:bg-classify-green" : seconds > 30 ? "[&>div]:bg-primary" : "[&>div]:bg-destructive";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl px-4 py-4 safe-area-bottom">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-heading text-xs uppercase tracking-wider text-muted-foreground">⏱ Descanso</span>
          <span className="text-xs text-muted-foreground font-body truncate max-w-[180px]">
            {exercicioNome} — Série {numeroSerie}
          </span>
          <div className="flex items-center gap-1">
            {onAbrirSom && (
              <button
                type="button"
                onClick={onAbrirSom}
                data-abrir-som
                title="Som do descanso"
                aria-label="Som do descanso"
                className="p-1 text-muted-foreground hover:text-primary transition-colors"
              >
                <Volume2 size={16} />
              </button>
            )}
            <button type="button" onClick={handleFechar} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="text-center">
          <p className={`font-heading text-5xl tabular-nums ${timerColor} ${finished || (seconds <= 30 && seconds > 0) ? "animate-pulse" : ""}`}>
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </p>
          {finished && <p className="text-sm text-primary font-heading mt-1 uppercase tracking-wider">Hora de treinar! 💪</p>}
        </div>

        <Progress value={progress} className={`h-2 ${progressColor}`} />

        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={handleSubtract15} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors font-heading">
            -15s
          </button>
          <button
            type="button"
            onClick={() => finished ? handleReset() : handleTogglePause()}
            className={`p-3 rounded-full text-primary-foreground transition-colors ${paused || finished ? "bg-primary hover:bg-primary/90" : "bg-muted-foreground hover:bg-muted-foreground/80"}`}
          >
            {paused || finished ? <Play size={20} /> : <Pause size={20} />}
          </button>
          <button type="button" onClick={handleReset} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <RotateCcw size={18} />
          </button>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] text-muted-foreground font-heading">Tempo:</span>
            <input
              type="number" value={editMinutes}
              onChange={(e) => handleChangeTime(e.target.value)}
              className="w-12 bg-transparent border-b border-muted-foreground text-center text-foreground font-heading text-sm py-0.5 outline-none focus:border-primary"
              step="0.5" min="0.5" max="10"
            />
            <span className="text-[10px] text-muted-foreground font-heading">min</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimerDescanso;
