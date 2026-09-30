import { fmtKcal, totaisDosItens, type ItemCalc } from "./dietaUtil";

// Physiq W11 — ✓ das refeições do aluno, portado do PhysiqNutri (src/lib/refeicaoConcluidaUtil.ts, W58 — pedido dele 24/09/2026:
// "quero um botão ao lado com um check ✅. Quando clicar ele marca como concluído. E acima uma barra ... conforme for concluindo
// preenche ... só aparece um botão com ✅ as refeições que tiverem alimentos" + decisões dele: salvo no banco, a barra enche por
// KCAL, zera todo dia, tocar de novo desmarca, só no plano atual). A MESMA função do banco (paciente_marcar_refeicao) grava o ✓
// do site antigo e do Physiq. Regras PURAS (sem React nem supabase), testadas no vitest.

/** só a refeição com alimentos ganha o ✓ */
export const refeicaoMarcavel = (r: { itens: readonly unknown[] }): boolean => r.itens.length > 0;

export type ProgressoDoDia = { feitoKcal: number; totalKcal: number; pct: number; concluidas: number; marcaveis: number };

/** a barra da meta enche por KCAL: kcal das refeições concluídas ÷ kcal das refeições com alimentos. Plano só com alimentos de
 *  0 kcal (água, chá) conta por refeição, pra barra não ficar parada. */
export function progressoDoDia(refeicoes: readonly { id: string; itens: ItemCalc[] }[], concluidas: ReadonlySet<string>): ProgressoDoDia {
  let feitoKcal = 0;
  let totalKcal = 0;
  let feitas = 0;
  let marcaveis = 0;
  for (const r of refeicoes) {
    if (!refeicaoMarcavel(r)) continue;
    const kcal = totaisDosItens(r.itens).energia_kcal;
    marcaveis += 1;
    totalKcal += kcal;
    if (concluidas.has(r.id)) {
      feitas += 1;
      feitoKcal += kcal;
    }
  }
  const razao = totalKcal > 0 ? feitoKcal / totalKcal : marcaveis > 0 ? feitas / marcaveis : 0;
  return { feitoKcal, totalKcal, pct: Math.min(100, Math.max(0, Math.round(razao * 100))), concluidas: feitas, marcaveis };
}

/** todas as refeições com alimentos do dia foram concluídas */
export const metaCumprida = (p: ProgressoDoDia): boolean => p.marcaveis > 0 && p.concluidas === p.marcaveis;

/** "342 de 537 kcal" */
export const textoProgresso = (p: ProgressoDoDia): string => `${fmtKcal(p.feitoKcal)} de ${fmtKcal(p.totalKcal)} kcal`;

/** a lista de concluídas depois de tocar no ✓ da refeição (tocar de novo desmarca) */
export function alternarConcluida(concluidas: readonly string[], refeicaoId: string): { lista: string[]; concluida: boolean } {
  const marcada = concluidas.includes(refeicaoId);
  return marcada
    ? { lista: concluidas.filter((id) => id !== refeicaoId), concluida: false }
    : { lista: [...concluidas, refeicaoId], concluida: true };
}

/** erro da RPC → texto pra pessoa, sem detalhe técnico */
export function textoErroMarcar(erro: { message?: string } | null | undefined): string {
  const m = (erro?.message ?? "").toLowerCase();
  if (m.includes("sem_internet") || m.includes("failed to fetch") || m.includes("network")) return "Sem conexão. Marque de novo quando a internet voltar.";
  if (m.includes("sem_alimentos")) return "Essa refeição ainda não tem alimentos.";
  if (m.includes("data_invalida")) return "Confira a data e a hora do celular.";
  if (m.includes("sem_acesso")) return "Você não tem acesso a esta refeição.";
  return "Não foi possível salvar. Tente de novo.";
}
