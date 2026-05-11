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
