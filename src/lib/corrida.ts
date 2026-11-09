// Helpers de corrida — parsing/format tempo, distancia, pace
// Extraido de TreinoDoDia/ModalHistorico pra dedup + testabilidade

export function parseTempo(input: string): number | null {
  const parts = input.trim().split(":").map(Number);
  if (parts.some(isNaN) || parts.length < 2) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function formatTempo(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatPace(paceSegundos: number): string {
  const m = Math.floor(paceSegundos / 60);
  const s = paceSegundos % 60;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function calcularPace(tempoSegundos: number, distanciaKm: number): number {
  if (!distanciaKm || distanciaKm <= 0) return 0;
  return Math.round(tempoSegundos / distanciaKm);
}

/** "2,2 km" — vírgula e até 2 casas, como o campo mostra no celular. */
export function formatKm(km: number): string {
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`;
}

type SerieDeCorrida = { tempo_segundos?: number | null; distancia_km?: number | null; pace_segundos_km?: number | null };

/**
 * A série de corrida feita em 2 pedaços — "19:00 · 2,2 km" e "pace 8:38 /km" (a linha da série no celular mostra um embaixo do outro;
 * numa linha só o pace era cortado em 390 px). Só o que existe (só o tempo, só os km); nada → "—". O pace só com tempo E km.
 * Nunca "0 kg × 0" (09/11/2026: a corrida sem tempo caía no texto da musculação).
 */
export function partesDaCorrida(s: SerieDeCorrida): { principal: string; pace: string } {
  const tempo = s.tempo_segundos && s.tempo_segundos > 0 ? s.tempo_segundos : 0;
  const km = s.distancia_km && s.distancia_km > 0 ? s.distancia_km : 0;
  const pace = tempo && km ? (s.pace_segundos_km && s.pace_segundos_km > 0 ? s.pace_segundos_km : calcularPace(tempo, km)) : 0;
  const principal = [tempo ? formatTempo(tempo) : "", km ? formatKm(km) : ""].filter(Boolean).join(" · ");
  return { principal: principal || "—", pace: pace ? `pace ${formatPace(pace)}` : "" };
}

/** A série de corrida feita numa linha: "19:00 · 2,2 km · pace 8:38 /km". */
export function resumoDaCorrida(s: SerieDeCorrida): string {
  const p = partesDaCorrida(s);
  return p.pace ? `${p.principal} · ${p.pace}` : p.principal;
}
