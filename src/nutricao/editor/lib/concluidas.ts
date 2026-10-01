// Physiq W16 — os ✓ das refeições que o aluno marcou (refeicoes_concluidas, falha F3). A nutricionista responsável, o dono da
// conta e o personal responsável leem pela política "ver pela conta" (supabase-principal/migrations/20260924010000 e a W2);
// quem grava é só o aluno, pela função paciente_marcar_refeicao (W11).
import { supabase } from "./banco";
import type { Concluida } from "./adesao";

/** Os ✓ do aluno entre dois dias (yyyy-mm-dd, inclusive). */
export async function listarConcluidas(pacienteId: string, de: string, ate: string): Promise<Concluida[]> {
  const { data, error } = await supabase
    .from("refeicoes_concluidas")
    .select("refeicao_id, data")
    .eq("paciente_id", pacienteId)
    .gte("data", de)
    .lte("data", ate)
    .order("data", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { refeicao_id: string; data: string }[]).map((c) => ({ refeicao_id: c.refeicao_id, data: String(c.data).slice(0, 10) }));
}
