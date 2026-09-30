import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { restanteDescanso } from "@/lib/descanso";
import {
  cancelTimerNotification,
  requestNotificationPermission,
  showTimerFinishedNotification,
  startTimerNotifications,
} from "@/lib/nativeNotifications";
import { SOM_EVENTO, VIBRACAO_FIM_DESCANSO, deveVibrar, lerSomDescanso, temSom, tocarSom } from "@/lib/somDescanso";

/** lido na hora (e não no carregamento do módulo): o teste troca a plataforma */
const nativo = () => Capacitor.isNativePlatform();

/** O MESMO estado de hoje no aparelho: o descanso sobrevive a recarregar, trocar de aba e voltar do segundo plano. */
export const LS_DESCANSO = "physiq_rest_timer";

export interface EstadoDescansoSalvo {
  ativo: boolean;
  startedAt: number;
  pausedRemaining: number;
  isPaused: boolean;
  duracao: number;
  exercicioNome: string;
  numeroSerie: number;
  /** muda só quando uma série recebe OK */
  serieId: string;
  /** W8: "série 3 do crucifixo" (a próxima série, no card do descanso) */
  depois?: string | null;
}

export function lerDescanso(): EstadoDescansoSalvo | null {
  try {
    const raw = localStorage.getItem(LS_DESCANSO);
    return raw ? (JSON.parse(raw) as EstadoDescansoSalvo) : null;
  } catch {
    return null;
  }
}

function salvar(s: EstadoDescansoSalvo): void {
  try {
    localStorage.setItem(LS_DESCANSO, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}

function limpar(): void {
  try {
    localStorage.removeItem(LS_DESCANSO);
  } catch {
    /* noop */
  }
}

/** Há um descanso correndo (ou pausado) guardado no aparelho? (abre o card de novo depois de recarregar) */
export function descansoGuardadoAtivo(): boolean {
  const s = lerDescanso();
  if (!s?.ativo) return false;
  return s.isPaused ? true : restanteDescanso(s) > 0;
}

const tituloNativo = (s: Pick<EstadoDescansoSalvo, "exercicioNome" | "numeroSerie">) => `${s.exercicioNome} — Série ${s.numeroSerie}`;

export interface OpcoesDescanso {
  ativo: boolean;
  exercicioNome: string;
  numeroSerie: number;
  duracaoSegundos: number;
  /** muda APENAS quando uma nova série é concluída — trocar de dia não reinicia o descanso */
  serieId: string;
  depois?: string | null;
  aoFechar: () => void;
  aoMudarTempo: (segundos: number) => void;
}

/**
 * O descanso (C74–C76, porte do TimerDescanso): o restante é SEMPRE derivado do início salvo (relógio real — em segundo plano
 * o WebView congela o setInterval); no APK quem conta, toca o som escolhido e vibra é o serviço nativo
 * (`TimerForegroundService`, via `startTimerNotifications`), re-armado a cada ajuste (−15 s, pausar, tempo, som trocado); no
 * site o fim toca o som (Bip, Sino, Alarme) e vibra pelo navegador. "Só vibrar" e "Silencioso" como hoje.
 */
export function useDescanso(o: OpcoesDescanso) {
  const [segundos, setSegundos] = useState(() => {
    const s = lerDescanso();
    return s?.ativo ? restanteDescanso(s) : o.duracaoSegundos;
  });
  const [pausado, setPausado] = useState(() => lerDescanso()?.isPaused ?? false);
  const [acabou, setAcabou] = useState(false);
  const [depois, setDepois] = useState<string | null>(() => lerDescanso()?.depois ?? o.depois ?? null);
  const duracaoRef = useRef(lerDescanso()?.duracao ?? o.duracaoSegundos);
  const [duracao, setDuracao] = useState(duracaoRef.current);
  const audioRef = useRef<AudioContext | null>(null);
  const avisouRef = useRef(false);
  const ultimaSerieRef = useRef<string>("");

  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  // montou com um descanso salvo (recarregou / voltou de outra aba) → retoma de onde está
  useEffect(() => {
    const s = lerDescanso();
    if (!s?.ativo) return;
    const restante = restanteDescanso(s);
    duracaoRef.current = s.duracao;
    setDuracao(s.duracao);
    ultimaSerieRef.current = s.serieId;
    setSegundos(restante);
    setPausado(s.isPaused);
    setDepois(s.depois ?? null);
    if (restante <= 0) setAcabou(true);
  }, []);

  // série nova com OK → novo descanso (só quando o serieId muda)
  const { ativo, serieId, duracaoSegundos, exercicioNome, numeroSerie } = o;
  const depoisNovo = o.depois ?? null;
  useEffect(() => {
    if (!ativo) return;
    if (serieId === ultimaSerieRef.current) return;
    ultimaSerieRef.current = serieId;
    const novo: EstadoDescansoSalvo = {
      ativo: true,
      startedAt: Date.now(),
      pausedRemaining: duracaoSegundos,
      isPaused: false,
      duracao: duracaoSegundos,
      exercicioNome,
      numeroSerie,
      serieId,
      depois: depoisNovo,
    };
    salvar(novo);
    duracaoRef.current = duracaoSegundos;
    setDuracao(duracaoSegundos);
    setSegundos(duracaoSegundos);
    setPausado(false);
    setAcabou(false);
    setDepois(depoisNovo);
    avisouRef.current = false;
    void startTimerNotifications(tituloNativo(novo), duracaoSegundos);
  }, [ativo, serieId, duracaoSegundos, exercicioNome, numeroSerie, depoisNovo]);

  const tocarFim = useCallback(async () => {
    try {
      const som = lerSomDescanso();
      if (!temSom(som)) return; // "Só vibrar" / "Silencioso"
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      tocarSom(ctx, som);
    } catch {
      /* sem áudio */
    }
  }, []);

  // no APK quem vibra é o serviço nativo; ao voltar pro app ele para — vibrar aqui de novo repetiria os 11 s
  const vibrarFim = useCallback(() => {
    if (nativo()) return;
    if (deveVibrar(lerSomDescanso()) && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(VIBRACAO_FIM_DESCANSO);
  }, []);

  // contagem
  useEffect(() => {
    if (!ativo || pausado || acabou) return;
    const tick = () => {
      const s = lerDescanso();
      const restante = s?.ativo ? restanteDescanso(s) : null;
      if (restante === null) {
        setSegundos((x) => Math.max(0, x - 1));
        return;
      }
      if (restante <= 0) {
        setSegundos(0);
        setAcabou(true);
        if (!nativo()) {
          void tocarFim();
          vibrarFim();
        }
        if (!avisouRef.current) {
          avisouRef.current = true;
          void showTimerFinishedNotification(s?.exercicioNome ?? exercicioNome);
        }
        limpar();
        return;
      }
      setSegundos(restante);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ativo, pausado, acabou, tocarFim, vibrarFim, exercicioNome]);

  // voltou ao primeiro plano: recalcula pelo relógio
  useEffect(() => {
    if (!ativo) return;
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      const s = lerDescanso();
      if (!s?.ativo) return;
      const restante = restanteDescanso(s);
      if (restante <= 0) {
        setAcabou(true);
        setSegundos(0);
        void cancelTimerNotification();
        if (!avisouRef.current) {
          avisouRef.current = true;
          void tocarFim();
          vibrarFim();
        }
        limpar();
      } else {
        setSegundos(restante);
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [ativo, tocarFim, vibrarFim]);

  // trocou o som com o descanso correndo → re-arma o serviço nativo com o som novo e o tempo que falta
  useEffect(() => {
    if (!ativo || pausado || acabou) return;
    const aoTrocarSom = () => {
      const s = lerDescanso();
      if (!s?.ativo || s.isPaused) return;
      const restante = restanteDescanso(s);
      if (restante <= 0) return;
      void startTimerNotifications(tituloNativo(s), restante);
    };
    window.addEventListener(SOM_EVENTO, aoTrocarSom);
    return () => window.removeEventListener(SOM_EVENTO, aoTrocarSom);
  }, [ativo, pausado, acabou]);

  const pausarOuContinuar = () => {
    const agoraPausado = !pausado;
    setPausado(agoraPausado);
    const s = lerDescanso();
    if (!s) return;
    if (agoraPausado) {
      salvar({ ...s, isPaused: true, pausedRemaining: segundos });
      void cancelTimerNotification();
    } else {
      salvar({ ...s, isPaused: false, startedAt: Date.now() - (s.duracao - segundos) * 1000 });
      void startTimerNotifications(tituloNativo(s), segundos);
    }
  };

  const recomecar = () => {
    const dur = duracaoRef.current;
    setSegundos(dur);
    setPausado(false);
    setAcabou(false);
    avisouRef.current = false;
    const s = lerDescanso();
    const base: EstadoDescansoSalvo = s ?? {
      ativo: true, startedAt: Date.now(), pausedRemaining: dur, isPaused: false, duracao: dur, exercicioNome, numeroSerie, serieId: ultimaSerieRef.current,
      depois,
    };
    salvar({ ...base, ativo: true, startedAt: Date.now(), isPaused: false, pausedRemaining: dur, duracao: dur });
    void startTimerNotifications(tituloNativo(base), dur);
  };

  const menos15 = () => {
    if (acabou) return; // já acabou: nada a adiantar (e o alarme não pode tocar de novo)
    const prox = Math.max(0, segundos - 15);
    setSegundos(prox);
    const s = lerDescanso();
    if (!s) return;
    if (s.isPaused) {
      salvar({ ...s, pausedRemaining: prox });
      return;
    }
    salvar({ ...s, startedAt: Date.now() - (s.duracao - prox) * 1000, pausedRemaining: prox });
    // re-arma o aviso nativo com o tempo novo — senão o APK toca/vibra no fim ANTIGO, depois da tela zerar
    void startTimerNotifications(tituloNativo(s), prox);
  };

  /** Ajuste do tempo (0,5 a 10 min) — recomeça com o tempo novo e vira o padrão desta sessão. */
  const mudarTempo = (novoSeg: number) => {
    const seg = Math.round(Math.max(30, Math.min(600, novoSeg)));
    duracaoRef.current = seg;
    setDuracao(seg);
    setSegundos(seg);
    setPausado(false);
    setAcabou(false);
    avisouRef.current = false;
    o.aoMudarTempo(seg);
    const s = lerDescanso();
    if (s) {
      salvar({ ...s, duracao: seg, pausedRemaining: seg, startedAt: Date.now(), isPaused: false });
      void startTimerNotifications(tituloNativo(s), seg);
    }
  };

  /** Pular (tela 2) = encerra o descanso agora (a próxima série já pode começar). */
  const pular = () => {
    limpar();
    void cancelTimerNotification();
    if (audioRef.current) {
      audioRef.current.close().catch(() => {});
      audioRef.current = null;
    }
    o.aoFechar();
  };

  return { segundos, pausado, acabou, duracao, depois, pausarOuContinuar, recomecar, menos15, mudarTempo, pular };
}
