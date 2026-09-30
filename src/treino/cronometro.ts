/**
 * Cronômetro do treino (C77) — o mesmo estado guardado no aparelho de hoje (`physiq_workout_timer`), para quem atualiza o
 * app no meio de um treino não perder a contagem. OK numa série inicia o treino se nenhum estiver rodando (C65); os avisos
 * "Ainda está treinando?" de 1h30, 2h e 3h ficam agendados no Android e, no site, saem pelo tick.
 */
import { agendarAvisosTreinoLongo } from "@/lib/nativeNotifications";

export const LS_CRONOMETRO = "physiq_workout_timer";

/** Disparado quando o treino é iniciado ou encerrado fora do componente (ex.: OK numa série). */
export const EVENTO_CRONOMETRO = "physiq:workout-timer";

export interface EstadoCronometro {
  ativo: boolean;
  /** ms */
  startedAt: number;
  dateKey: string;
  grupoNome: string;
  /** marcos (min) de "Ainda está treinando?" já avisados neste treino */
  avisos?: number[];
}

export function lerCronometro(): EstadoCronometro | null {
  try {
    const raw = localStorage.getItem(LS_CRONOMETRO);
    if (!raw) return null;
    const s = JSON.parse(raw) as EstadoCronometro;
    return s && typeof s.startedAt === "number" ? s : null;
  } catch {
    return null;
  }
}

function gravar(s: EstadoCronometro): void {
  try {
    localStorage.setItem(LS_CRONOMETRO, JSON.stringify(s));
  } catch {
    /* sem armazenamento: vale só nesta abertura */
  }
}

export function avisar(): void {
  try {
    window.dispatchEvent(new Event(EVENTO_CRONOMETRO));
  } catch {
    /* sem window (teste) */
  }
}

/** Registra que o marco já foi avisado (sobrevive a recarregar). */
export function marcarAvisoTreinoLongo(min: number): void {
  const s = lerCronometro();
  if (!s) return;
  gravar({ ...s, avisos: Array.from(new Set([...(s.avisos ?? []), min])) });
}

/** Começa a contar agora (agenda os avisos de 1h30/2h/3h no Android). */
export function iniciarCronometro(dateKey: string, grupoNome: string, agora: number = Date.now()): EstadoCronometro {
  const s: EstadoCronometro = { ativo: true, startedAt: agora, dateKey, grupoNome, avisos: [] };
  gravar(s);
  void agendarAvisosTreinoLongo(agora, grupoNome);
  avisar();
  return s;
}

/** Há um treino com o cronômetro rodando (em qualquer dia)? */
export function treinoEmAndamento(): boolean {
  const s = lerCronometro();
  return !!(s && s.ativo);
}

/** Inicia o cronômetro se NENHUM estiver rodando. true = iniciou agora; false = já havia um (não faz nada). */
export function iniciarTreinoSeParado(dateKey: string, grupoNome: string): boolean {
  if (treinoEmAndamento()) return false;
  iniciarCronometro(dateKey, grupoNome);
  return true;
}

export function pararCronometro(): void {
  try {
    localStorage.removeItem(LS_CRONOMETRO);
  } catch {
    /* noop */
  }
  avisar();
}

/** Segundos desde o início (pelo relógio, nunca por contador: o WebView congela o setInterval em segundo plano). */
export function segundosDecorridos(s: Pick<EstadoCronometro, "startedAt">, agora: number = Date.now()): number {
  return Math.max(0, Math.floor((agora - s.startedAt) / 1000));
}

/** "32:10" até 1 h; "1:05:09" depois (a pílula da tela 2). */
export function formatarCronometro(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "1h05m" · "48m" (a duração do treino concluído, como hoje). */
export function formatarDuracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}m` : `${m}m`;
}
