import type { DiaSlot, SemanaConfig } from "./tipos";

/**
 * Letra de cada treino ("Treino A", "B"…): a ordem em que aparecem na semana, de segunda a domingo; depois, os outros treinos
 * do profissional liberados para o aluno (na ordem da lista) — o que ele põe num dia fora da semana também tem letra.
 */
export function letrasDaSemana(semana: SemanaConfig[], gruposDoProfissional: { id: string }[] = []): Map<string, string> {
  const ordem = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
  const vistos: string[] = [];
  for (const d of ordem) {
    for (const c of semana.filter((s) => s.dia_semana === d).sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0))) {
      const id = c.grupo_usuario_id ?? c.grupo_id;
      if (id && !vistos.includes(id)) vistos.push(id);
    }
  }
  for (const g of gruposDoProfissional) if (!vistos.includes(g.id)) vistos.push(g.id);
  return new Map(vistos.map((id, i) => [id, String.fromCharCode(65 + (i % 26))]));
}

/** Chip do card do treino: "TREINO A" (da semana ou do profissional) · "MEU TREINO" (próprio, fora da semana) · "TREINO EXTRA". */
export function chipDoSlot(slot: DiaSlot, letras: Map<string, string>): string {
  const l = slot.grupo ? letras.get(slot.grupo.id) : undefined;
  if (l) return `TREINO ${l}`;
  return slot.grupoPessoal ? "MEU TREINO" : "TREINO EXTRA";
}
