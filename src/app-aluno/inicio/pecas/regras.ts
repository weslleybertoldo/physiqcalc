/**
 * Início do app do aluno (W12 — spec 4.3, tela 1) — regras PURAS dos cards, testadas em regras.test.ts. Cada número do Início
 * sai da MESMA conta da aba que o card abre (lição da W10: o número do card tem que bater com a tela que ele abre):
 *   · "N de M na semana" = os dias com treino feito da faixa Seg–Dom da aba Treino ("· N feitos") sobre os dias com treino;
 *   · as kcal e as refeições da Dieta de hoje = o plano atual, as refeições que valem hoje e os ✓ (as funções da aba Dieta);
 *   · o peso = o card "Peso" da Evolução no período em que ela abre (6M, ou 1A quando o 6M tem menos de 2 pesagens).
 */
import { fracao, planoAtivo, refeicoesDoDia, resumoDoDia, type ResumoDoDia } from "@/nutricao/app/dia";
import { metasDoDia } from "@/nutricao/app/metasUtil";
import type { DadosDieta, Meta, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import type { Periodo } from "@/evolucao/tipos";
import { areaDaConsulta, type AgendamentoAluno } from "@/app-aluno/perfil/pecas/regras";

/** O que a foto da consulta precisa de "Meus profissionais" (meu_perfil_aluno — W7). */
export interface ProfissionalDoAlunoMinimo {
  papel: string;
  nome: string | null;
  foto_url?: string | null;
}

// ───────────────────────── saudação ─────────────────────────

/** "Bom dia" (5 h–11 h) · "Boa tarde" (12 h–17 h) · "Boa noite" (18 h–4 h), pela hora do aparelho. */
export function saudacao(agora: Date = new Date()): "Bom dia" | "Boa tarde" | "Boa noite" {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Diego Almeida" → "Diego"; e-mail vira a parte antes do @; vazio → "". */
export function primeiroNome(nome: string | null | undefined): string {
  const t = (nome ?? "").trim();
  if (!t) return "";
  const base = t.includes("@") && !t.includes(" ") ? t.split("@")[0] : t;
  const primeiro = base.split(/\s+/)[0] ?? "";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

// ───────────────────────── treino de hoje ─────────────────────────

/** O que o resumo da semana precisa de cada dia da faixa Seg–Dom da aba Treino (`useTreinoDoDia().dias`). */
export interface DiaDaSemana {
  treinos: { concluido: boolean }[];
  feito: boolean;
  algumFeito?: boolean;
}

/**
 * C15 — "3 de 5 na semana": N = dias com treino concluído (a MESMA regra do "· N feitos" da faixa da aba Treino — conta DIAS,
 * dois treinos no mesmo dia = 1), M = dias da semana com treino marcado (ou já feito). As barrinhas: M, com N acesas.
 */
export function resumoDaSemana(dias: readonly DiaDaSemana[]): { feitos: number; total: number } {
  const feitoNoDia = (d: DiaDaSemana) => d.feito || !!d.algumFeito;
  const feitos = dias.filter(feitoNoDia).length;
  const total = dias.filter((d) => d.treinos.length > 0 || feitoNoDia(d)).length;
  return { feitos, total: Math.max(total, feitos) };
}

/** Tempo de uma série (execução) e da troca de aparelho entre exercícios, na estimativa do "~55 min". */
export const SEGUNDOS_POR_SERIE = 45;
export const SEGUNDOS_TROCA_EXERCICIO = 60;

/**
 * Duração estimada do treino (tela 1: "~55 min"): cada série leva ~45 s, o descanso do exercício (o prescrito — NF1 — ou o
 * padrão do aluno) vale entre as séries, e cada troca de exercício ~1 min. Arredonda para 5 min (mínimo 5).
 */
export function estimarDuracaoMin(exercicios: readonly { series: number; descansoSeg: number }[]): number | null {
  const comSeries = exercicios.filter((e) => e.series > 0);
  if (comSeries.length === 0) return null;
  let seg = 0;
  comSeries.forEach((e, i) => {
    const ultimoDoTreino = i === comSeries.length - 1;
    const descansos = ultimoDoTreino ? e.series - 1 : e.series;
    seg += e.series * SEGUNDOS_POR_SERIE + Math.max(0, descansos) * Math.max(0, e.descansoSeg) + SEGUNDOS_TROCA_EXERCICIO;
  });
  return Math.max(5, Math.round(seg / 60 / 5) * 5);
}

/** O chip da aba Treino ("TREINO A" · "MEU TREINO" · "TREINO EXTRA") na linha do card: "Treino A" · "Meu treino" · "Treino extra". */
export function rotuloDoTreino(chip: string): string {
  const t = chip.trim();
  const letra = /^TREINO ([A-Z])$/.exec(t);
  if (letra) return `Treino ${letra[1]}`;
  const minusc = t.toLowerCase();
  return minusc.charAt(0).toUpperCase() + minusc.slice(1);
}

// ───────────────────────── dieta de hoje ─────────────────────────

export interface DietaDeHoje {
  plano: PlanoAlimentar | null;
  refeicoes: RefeicaoDoPlano[];
  resumo: ResumoDoDia;
  /** kcal das refeições com ✓ / kcal das refeições com alimento do dia (a barra e o %) */
  fracaoKcal: number;
  /** 0–100, arredondado */
  pct: number;
}

/**
 * A Dieta de hoje do card = a do topo da aba Dieta (tela 3) no dia de hoje: o plano atual (favorito mais recente), as
 * refeições que valem hoje (NF3), os ✓ de hoje e as kcal marcadas contra as do dia (NF5).
 */
export function dietaDeHoje(dados: Pick<DadosDieta, "planos" | "refeicoes_concluidas"> | null | undefined, hoje: string): DietaDeHoje {
  const plano = planoAtivo(dados?.planos ?? []);
  const refeicoes = refeicoesDoDia(plano, hoje);
  const resumo = resumoDoDia(refeicoes, new Set(plano ? dados?.refeicoes_concluidas ?? [] : []));
  const fracaoKcal = fracao(resumo.marcado.energia_kcal, resumo.total.energia_kcal);
  return { plano, refeicoes, resumo, fracaoKcal, pct: Math.round(fracaoKcal * 100) };
}

/** As metas do card: as que valem hoje (a MESMA lista "Hoje" da folha das metas da aba Dieta), na ordem da nutricionista. */
export function metasDeHoje(metas: readonly Meta[], marcadas: readonly string[], hoje: string): { metas: (Meta & { feita: boolean })[]; feitas: number } {
  const feitas = new Set(marcadas);
  const lista = metasDoDia([...metas], hoje).map((m) => ({ ...m, feita: feitas.has(m.id) }));
  return { metas: lista, feitas: lista.filter((m) => m.feita).length };
}

// ───────────────────────── próxima consulta ─────────────────────────

/**
 * Chip "Em 2 dias": a cor da ÁREA da consulta (H1 — verde nutrição, violeta treino: as cores dos módulos, spec 4.9; ciano geral). O
 * papel só decide quando a consulta não traz a área (antes ele vencia: o personal que também é a nutri pintava de violeta a nutrição).
 */
export function tomDaConsulta(a: Pick<AgendamentoAluno, "modulo" | "papel">): "n" | "t" | "c" {
  const area = areaDaConsulta(a);
  return area === "nutricao" ? "n" : area === "treino" ? "t" : "c";
}

/** A foto do profissional da consulta: o de "Meus profissionais" com o mesmo papel (e o mesmo nome, se houver mais de um). */
export function profissionalDaConsulta<T extends ProfissionalDoAlunoMinimo>(
  profissionais: readonly T[] | null | undefined,
  a: Pick<AgendamentoAluno, "papel" | "profissional">,
): T | null {
  const lista = profissionais ?? [];
  const mesmoPapel = lista.filter((p) => !a.papel || p.papel === a.papel);
  const nome = (a.profissional ?? "").trim().toLowerCase();
  return mesmoPapel.find((p) => (p.nome ?? "").trim().toLowerCase() === nome) ?? (mesmoPapel.length === 1 ? mesmoPapel[0] : null);
}

// ───────────────────────── peso ─────────────────────────

/** "em 3 meses" · "em 6 meses" · "em 1 ano" — o período em que a aba Evolução abre (o do card). */
export function textoDoPeriodo(p: Periodo): string {
  if (p === "3m") return "em 3 meses";
  if (p === "6m") return "em 6 meses";
  if (p === "1a") return "em 1 ano";
  return "desde a 1ª avaliação";
}
