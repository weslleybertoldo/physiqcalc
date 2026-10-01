// Physiq W16 — o plano por dia da semana no editor (NF3, tela 8: Seg … Dom e "Copiar pra semana toda"). Cada refeição guarda os
// dias em que vale (refeicoes.dias_semana: 1 = segunda … 7 = domingo; vazio = todos os dias, como sempre foi). O app do aluno
// (W11) mostra só as refeições do dia; o site antigo do Nutri ignora os dias e mostra todas (até a W28). Regras puras.
import { diaDaSemana, normalizarDias, DIAS_SEMANA, TODOS_OS_DIAS } from "@/nutricao/app/metasUtil";
import { hojeSP } from "@/nutricao/app/dia";

export { DIAS_SEMANA, normalizarDias };

/** O dia da semana (1–7) de hoje em São Paulo — a aba que o editor abre. */
export const diaDeHoje = (agora: Date = new Date()): number => diaDaSemana(hojeSP(agora));

/** A refeição vale neste dia da semana (1–7)? Sem dias = todos os dias. */
export function valeNoDiaDaSemana(r: { dias_semana?: unknown }, dia: number): boolean {
  const dias = normalizarDias(r.dias_semana);
  return dias.length === 0 || dias.includes(dia);
}

/** As refeições que valem no dia da semana (mantém a ordem recebida). */
export const refeicoesDoDiaDaSemana = <T extends { dias_semana?: unknown }>(lista: T[], dia: number): T[] => lista.filter((r) => valeNoDiaDaSemana(r, dia));

/** O plano muda de um dia para outro? (alguma refeição com dias marcados) */
export const variaPorDia = (lista: { dias_semana?: unknown }[]): boolean => lista.some((r) => normalizarDias(r.dias_semana).length > 0);

/** Dias marcados para gravar: todos os 7 marcados = vazio (todos os dias, o padrão). */
export function diasParaBanco(dias: unknown): number[] {
  const n = normalizarDias(dias);
  return n.length === TODOS_OS_DIAS.length ? [] : n;
}

/** "todos os dias" · "seg, qua e sex" · "só sábado" */
export function textoDiasRefeicao(dias: unknown): string {
  const n = normalizarDias(dias);
  if (n.length === 0 || n.length === 7) return "todos os dias";
  const nomes = n.map((d) => DIAS_SEMANA.find((x) => x.n === d)?.curto.toLowerCase() ?? String(d));
  if (nomes.length === 1) return `só ${DIAS_SEMANA.find((x) => x.n === n[0])?.nome.split("-")[0].toLowerCase() ?? nomes[0]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export type PlanoCopiaSemana = {
  /** refeições do dia escolhido que passam a valer todos os dias (dias_semana = []) */
  paraTodosOsDias: string[];
  /** refeições só de outros dias, que saem do plano (senão o dia escolhido deixaria de ser o da semana toda) */
  paraApagar: string[];
  /** já estava igual todos os dias: nada a fazer */
  nadaAFazer: boolean;
};

/**
 * "Copiar pra semana toda" (tela 8): o que está no dia escolhido vira o plano de todos os dias — as refeições desse dia passam a
 * valer sempre e as que eram só de outros dias saem. Sem dias marcados em nenhuma refeição, não há nada a fazer.
 */
export function copiarDiaParaSemana(lista: { id: string; dias_semana?: unknown }[], dia: number): PlanoCopiaSemana {
  const doDia = lista.filter((r) => valeNoDiaDaSemana(r, dia));
  const paraTodosOsDias = doDia.filter((r) => normalizarDias(r.dias_semana).length > 0).map((r) => r.id);
  const paraApagar = lista.filter((r) => !valeNoDiaDaSemana(r, dia)).map((r) => r.id);
  return { paraTodosOsDias, paraApagar, nadaAFazer: paraTodosOsDias.length === 0 && paraApagar.length === 0 };
}

/** Os dias de uma refeição nova criada com uma aba de dia aberta: sem variação no plano, todos; com variação, só aquele dia. */
export const diasDaRefeicaoNova = (lista: { dias_semana?: unknown }[], diaAberto: number): number[] => (variaPorDia(lista) ? [diaAberto] : []);
