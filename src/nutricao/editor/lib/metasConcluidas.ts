// Physiq H5 (N-40) — a nutricionista vê os ✓ que o aluno marca nas METAS do dia (NF4: "o aluno marca; a nutri vê"). Quem grava é só
// o aluno, pela função aluno_marcar_meta (W11); a leitura é a política "metas_concluidas: responsavel le" da W2 (a nutricionista
// responsável e o dono da conta). Aqui: a consulta e as regras PURAS da linha "Últimos 7 dias" de cada meta.
// hml-20c (H-42 · jeito 2, etapa 2): a consulta vai pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa — a
// metas_concluidas (as 2 colunas de hoje, o período, a mesma ordem); o erro chega como ErroLeitura com a frase fixa do código.
import { useQuery } from "@tanstack/react-query";
import { diaDaSemana } from "@/nutricao/app/metasUtil";
import { lerNutricao } from "@/nutricao/leitura";
import { normalizarDias } from "./metasUtil";

export interface MetaConcluida {
  meta_id: string;
  /** yyyy-mm-dd */
  data: string;
}

/** Os ✓ das metas do aluno entre dois dias (yyyy-mm-dd, inclusive). */
export async function listarMetasConcluidas(pacienteId: string, de: string, ate: string): Promise<MetaConcluida[]> {
  const r = await lerNutricao("metas_concluidas", { aluno: pacienteId, de, ate });
  return ((r.linhas ?? []) as { meta_id: string; data: string }[]).map((c) => ({ meta_id: c.meta_id, data: String(c.data).slice(0, 10) }));
}

export const chaveMetasConcluidas = (pacienteId: string, de: string, ate: string) => ["metas-concluidas", pacienteId, de, ate] as const;

export function useMetasConcluidas(pacienteId: string | null, de: string, ate: string) {
  return useQuery({
    queryKey: chaveMetasConcluidas(pacienteId ?? "", de, ate),
    queryFn: () => listarMetasConcluidas(pacienteId!, de, ate),
    enabled: !!pacienteId && !!de && !!ate,
    staleTime: 30_000,
    networkMode: "online",
  });
}

export interface DiaDaMeta {
  dia: string;
  /** a meta valia no dia (dia da semana marcado e já tinha começado) — pausar hoje não apaga o que valeu */
  vale: boolean;
  /** o aluno marcou ✓ no dia */
  feita: boolean;
}

/** Cada dia do período para uma meta: se valia e se o aluno marcou (um ✓ num dia que não valia também aparece). */
export function diasDaMeta(m: { id: string; dias_semana: unknown; inicio?: string | null }, concluidas: readonly MetaConcluida[], dias: readonly string[]): DiaDaMeta[] {
  const semana = normalizarDias(m.dias_semana);
  const inicio = m.inicio ? m.inicio.slice(0, 10) : null;
  const marcados = new Set(concluidas.filter((c) => c.meta_id === m.id).map((c) => c.data));
  return dias.map((dia) => ({
    dia,
    vale: semana.includes(diaDaSemana(dia)) && (!inicio || inicio <= dia),
    feita: marcados.has(dia),
  }));
}

/** "3 de 5 dias" — os dias marcados entre os que a meta valia. */
export function resumoDaMeta(dias: readonly DiaDaMeta[]): { feitas: number; devidas: number; texto: string } {
  const devidas = dias.filter((d) => d.vale).length;
  const feitas = dias.filter((d) => d.vale && d.feita).length;
  const texto = devidas === 0 ? "nenhum dia da meta no período" : `${feitas} de ${devidas} ${devidas === 1 ? "dia" : "dias"}`;
  return { feitas, devidas, texto };
}
