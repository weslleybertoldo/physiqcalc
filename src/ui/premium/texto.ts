/**
 * Iniciais do nome (até 2 letras) para quando não há foto. Só LETRAS (W25): "Conta Teste W24 (prova)" vira "CP", não "C(" —
 * parênteses, números e símbolos não viram inicial; palavra sem nenhuma letra é ignorada.
 */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).map((p) => p.replace(/[^\p{L}]/gu, "")).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

/** "agora", "5 min", "2 h", "3 d" ou a data — tempo desde o aviso. */
export function tempoDesde(iso: string, agora = Date.now()): string {
  const ms = agora - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
