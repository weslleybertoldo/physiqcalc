import { useState, useEffect, useRef, useCallback } from "react";
import { Timer, X, Play, Pause, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const DEFAULT_SECONDS = 120;

// RestTimer: standalone floating rest timer (accessible from any page via the floating button)
// Does NOT persist — different from TimerDescanso which is tied to series completion
const RestTimer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS);
  const [running, setRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const playBeep = useCallback(() => {
    try {
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      const playTone = (freq: number, delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.4);
      };
      playTone(880, 0);
      playTone(1100, 0.5);
    } catch {}
  }, []);

  // Start/stop interval — only depends on `running`, not `seconds`
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          setIsFinished(true);
          playBeep();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, playBeep]);

  const reset = (newSeconds = DEFAULT_SECONDS) => {
    setRunning(false);
    setIsFinished(false);
    setSeconds(newSeconds);
  };

  const toggle = () => {
    if (isFinished) { reset(); return; }
    setRunning((r) => !r);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = ((DEFAULT_SECONDS - seconds) / DEFAULT_SECONDS) * 100;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95"
        title="Timer de descanso"
      >
        <Timer size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-64 rounded-xl border border-border bg-card shadow-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-heading text-xs uppercase tracking-wider text-muted-foreground">⏱ Descanso</span>
        <button type="button" onClick={() => { setIsOpen(false); reset(); }} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="text-center">
        <p className={`font-heading text-4xl tabular-nums ${isFinished ? "text-primary animate-pulse" : "text-foreground"}`}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </p>
        {isFinished && <p className="text-xs text-primary font-heading mt-1 uppercase tracking-wider">Descanso concluído! 💪</p>}
      </div>

      <Progress value={progress} className="h-2" />

      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Reiniciar">
          <RotateCcw size={18} />
        </button>
        <button
          type="button" onClick={toggle}
          className={`p-3 rounded-full text-primary-foreground transition-colors ${running ? "bg-muted-foreground hover:bg-muted-foreground/80" : "bg-primary hover:bg-primary/90"}`}
          title={running ? "Pausar" : "Iniciar"}
        >
          {running ? <Pause size={20} /> : <Play size={20} />}
        </button>
        {[60, 90, 120, 180].map((t) => (
          <button
            key={t} type="button"
            onClick={() => reset(t)}
            className={`text-[10px] font-heading px-2 py-1 rounded transition-colors ${seconds === t && !running ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t >= 60 ? `${t / 60}m` : `${t}s`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default RestTimer;
