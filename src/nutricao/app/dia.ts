// Physiq W11 — o dia da dieta (tela 3): hoje em São Paulo, as refeições do plano que valem no dia (NF3), o plano atual (a regra
// do site antigo: o favorito mais recente; sem favorito, o mais recente), os macros MARCADOS do dia (NF5), a próxima refeição
// pendente (a do botão "Feito") e a semana do calendário. Regras puras, testadas em dia.test.ts.
import { refeicaoMarcavel } from "./refeicaoConcluidaUtil";
import { diaDaSemana, DIAS_SEMANA, normalizarDias } from "./metasUtil";
import { ordenarItens, ordenarRefeicoes, totaisDosItens, type Totais } from "./dietaUtil";
import type { PlanoAlimentar, RefeicaoDoPlano } from "./tipos";

/** yyyy-mm-dd de hoje no fuso de São Paulo (o ✓ zera na virada do dia daqui, não na do aparelho em outro fuso). */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Milissegundos até a próxima meia-noite de São Paulo (+1 s de folga) — quando o ✓ do dia zera. */
export function msAteAmanhaSP(agora: Date = new Date()): number {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(agora)
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const passados = ((partes.hour ?? 0) * 3600 + (partes.minute ?? 0) * 60 + (partes.second ?? 0)) * 1000 + agora.getMilliseconds();
  return Math.max(1000, 24 * 3600 * 1000 - passados + 1000);
}

/** yyyy-mm-dd + n dias (data do calendário, sem fuso). */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** A semana (segunda → domingo) que contém o dia, com o rótulo e o número do dia. */
export function semanaDoDia(dia: string): { dia: string; n: number; rotulo: string; numero: number }[] {
  const seg = somarDias(dia, 1 - diaDaSemana(dia));
  return DIAS_SEMANA.map((d, i) => {
    const data = somarDias(seg, i);
    return { dia: data, n: d.n, rotulo: d.curto, numero: Number(data.slice(8, 10)) };
  });
}

/** "hoje" · "amanhã" · "ontem" · "quarta · 01/10" */
export function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "hoje";
  if (dia === somarDias(hoje, 1)) return "amanhã";
  if (dia === somarDias(hoje, -1)) return "ontem";
  const nome = DIAS_SEMANA.find((d) => d.n === diaDaSemana(dia))?.nome.split("-")[0].toLowerCase() ?? "";
  return `${nome} · ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Plano atual = favorito mais recente; sem favorito, o mais recente (a regra do site antigo, W23 do Nutri). */
export function planoAtivo<T extends { id: string; favorito: boolean; created_at: string }>(planos: T[]): T | null {
  if (!planos.length) return null;
  const porData = [...planos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.id.localeCompare(b.id));
  return porData.find((p) => p.favorito) ?? porData[0];
}

/** A refeição vale no dia da semana (NF3): sem dias marcados = todos os dias, como hoje. */
export function refeicaoValeNoDia(r: Pick<RefeicaoDoPlano, "dias_semana">, dia: string): boolean {
  const dias = normalizarDias(r.dias_semana);
  return dias.length === 0 || dias.includes(diaDaSemana(dia));
}

/** O plano varia por dia da semana? (alguma refeição com dias marcados) */
export const planoVariaPorDia = (p: Pick<PlanoAlimentar, "refeicoes"> | null | undefined): boolean =>
  !!p?.refeicoes.some((r) => normalizarDias(r.dias_semana).length > 0);

/** As refeições do plano no dia (NF3), na ordem, com os itens em ordem. */
export function refeicoesDoDia(p: Pick<PlanoAlimentar, "refeicoes"> | null | undefined, dia: string): RefeicaoDoPlano[] {
  if (!p) return [];
  return ordenarRefeicoes(p.refeicoes.filter((r) => refeicaoValeNoDia(r, dia))).map((r) => ({ ...r, itens: ordenarItens(r.itens) }));
}

export type ResumoDoDia = {
  /** totais das refeições com alimento do dia (o que dá pra marcar) */
  total: Totais;
  /** totais das refeições marcadas (NF5) */
  marcado: Totais;
  concluidas: number;
  marcaveis: number;
};

/** Macros marcados no dia (NF5): a soma das refeições com ✓ contra a soma das refeições com alimento do dia. */
export function resumoDoDia(refeicoes: RefeicaoDoPlano[], concluidas: ReadonlySet<string>): ResumoDoDia {
  const marcaveis = refeicoes.filter(refeicaoMarcavel);
  const feitas = marcaveis.filter((r) => concluidas.has(r.id));
  return {
    total: totaisDosItens(marcaveis.flatMap((r) => r.itens)),
    marcado: totaisDosItens(feitas.flatMap((r) => r.itens)),
    concluidas: feitas.length,
    marcaveis: marcaveis.length,
  };
}

/** A próxima refeição a marcar (a 1ª com alimento sem ✓, na ordem) — é ela que mostra o botão "Feito". */
export function proximaPendente(refeicoes: RefeicaoDoPlano[], concluidas: ReadonlySet<string>): RefeicaoDoPlano | null {
  return refeicoes.find((r) => refeicaoMarcavel(r) && !concluidas.has(r.id)) ?? null;
}

/** Fração para as barras (0 a 1; sem total = 0). */
export const fracao = (feito: number, total: number): number => (total > 0 ? Math.min(1, Math.max(0, feito / total)) : 0);
