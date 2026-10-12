// Physiq W16 — os ✓ das refeições que o aluno marcou (refeicoes_concluidas, falha F3). A nutricionista responsável, o dono da
// conta e o personal responsável leem pela política "ver pela conta" (supabase-principal/migrations/20260924010000 e a W2);
// quem grava é só o aluno, pela função paciente_marcar_refeicao (W11).
// hml-20c (H-42 · jeito 2, etapa 2): a leitura vai pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa — a consulta
// refeicoes_concluidas (as 2 colunas de hoje, o período, a mesma ordem); o erro chega como ErroLeitura com a frase fixa do código.
import { lerNutricao } from "@/nutricao/leitura";
import type { Concluida } from "./adesao";

/** Os ✓ do aluno entre dois dias (yyyy-mm-dd, inclusive). */
export async function listarConcluidas(pacienteId: string, de: string, ate: string): Promise<Concluida[]> {
  const r = await lerNutricao("refeicoes_concluidas", { aluno: pacienteId, de, ate });
  return ((r.linhas ?? []) as { refeicao_id: string; data: string }[]).map((c) => ({ refeicao_id: c.refeicao_id, data: String(c.data).slice(0, 10) }));
}
