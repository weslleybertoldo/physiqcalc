import { BLOCO_OUTROS, blocoDoGrupoMuscular } from "@/lib/gruposMusculares";
import { fotoDoTreino } from "@/ui/premium/fotos";
import type { DiaSlot } from "./tipos";

/** Blocos sem foto própria: valem como "Outros" (o nome do treino decide). */
const SEM_FOTO = new Set([BLOCO_OUTROS, "alongamento"]);

/**
 * Foto de fundo do treino (P29): o bloco muscular que mais aparece nos exercícios do treino; sem bloco conhecido (ou um sem foto,
 * como alongamento e mobilidade), o nome do treino ("Peito e Tríceps"); sem nada, a foto geral. A MESMA foto no card do treino
 * (aba Treino, W8) e no "Treino de hoje" do Início (W12).
 */
export function fotoDoSlot(slot: Pick<DiaSlot, "exercicios" | "grupo">): string {
  const conta = new Map<string, number>();
  for (const e of slot.exercicios) {
    const b = blocoDoGrupoMuscular(e.tb_exercicios.grupo_muscular || "");
    conta.set(b, (conta.get(b) ?? 0) + 1);
  }
  const principal = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return fotoDoTreino(principal && !SEM_FOTO.has(principal) ? principal : slot.grupo?.nome);
}
