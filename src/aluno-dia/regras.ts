// Physiq W-A P2 — regras PURAS do front das rotinas e da dieta livre (as partes P3, P5 e P6 importam daqui): as datas de São Paulo, as rotinas
// de UM dia (as do dia da semana, vivas, na ordem da tela, com o ✓ daquele dia) e o DIA APLICADO sobre o plano (os itens que ele tirou ficam
// riscados, os que ele pôs entram, as refeições extras; os totais "comido × plano": o anel conta o que ele comeu — as refeições com ✓, com o que
// tirou e pôs, e as extras com "Já comi" — contra o plano do dia; spec §2.2-10, §4.4). Sem rede; testado em regras.test.ts.
import { hojeSP, refeicoesDoDia, somarDias } from "@/nutricao/app/dia";
import { macrosDoItem, somarMacros, type Totais } from "@/nutricao/app/dietaUtil";
import { diaDaSemana } from "@/nutricao/app/metasUtil";
import type { Macros } from "@/nutricao/app/numeros";
import { refeicaoMarcavel } from "@/nutricao/app/refeicaoConcluidaUtil";
import type { ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import type { ExtraDoDia, ItemDoDia, MeuDia, Rotina, RotinaFeita } from "./tipos";

export { hojeSP };
/** Ontem em São Paulo (yyyy-mm-dd). */
export const ontemSP = (agora: Date = new Date()): string => somarDias(hojeSP(agora), -1);
/** O dia da semana ISO (1 = segunda … 7 = domingo) — o das rotinas e das metas. */
export const diaDaSemanaISO = (dia: string): number => diaDaSemana(dia);
/** O banco só grava hoje ou ontem de SP (rotina_marcar e a dieta livre): a tela desliga os botões fora disso. */
export const diaGravavel = (dia: string, agora: Date = new Date()): boolean => dia === hojeSP(agora) || dia === ontemSP(agora);

export interface RotinaDoDia extends Rotina {
  feita: boolean;
  feita_em: string | null;
}

/** A ordem da tela = a do banco (minhas_rotinas): o horário (sem horário por último), a ordem, a criação. */
function ordemDaTela(a: Rotina, b: Rotina): number {
  return (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99") || a.ordem - b.ordem || a.criada_em.localeCompare(b.criada_em);
}

/** As rotinas que valem no dia (vivas, com o dia da semana marcado), na ordem da tela, com o ✓ daquele dia. */
export function rotinasDoDia(rotinas: readonly Rotina[], feitas: readonly RotinaFeita[], dia: string): RotinaDoDia[] {
  const dow = diaDaSemana(dia);
  const doDia = new Map(feitas.filter((f) => f.dia === dia).map((f) => [f.rotina_id, f.feita_em]));
  return rotinas
    .filter((r) => !r.arquivada_em && r.dias_semana.includes(dow))
    .map((r) => ({ ...r, feita: doDia.has(r.id), feita_em: doDia.get(r.id) ?? null }))
    .sort(ordemDaTela);
}

export interface ItemDoPlanoNoDia {
  item: ItemDaRefeicao;
  /** o "tirei hoje" daquele item (riscado), ou null */
  tirado: ItemDoDia | null;
}
export interface RefeicaoNoDia {
  refeicao: RefeicaoDoPlano;
  itens: ItemDoPlanoNoDia[];
  adicionados: ItemDoDia[];
  concluida: boolean;
}
export interface ExtraNoDia {
  extra: ExtraDoDia;
  adicionados: ItemDoDia[];
  concluida: boolean;
}
export interface DiaAplicado {
  refeicoes: RefeicaoNoDia[];
  extras: ExtraNoDia[];
  totais: { plano: Totais; comido: Totais };
}

/** Os macros do RETRATO de um item do dia (a quantidade já calculada no banco). */
export const macrosDoRetrato = (i: Pick<ItemDoDia, "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g">): Macros => ({
  energia_kcal: Number(i.energia_kcal) || 0,
  proteina_g: Number(i.proteina_g) || 0,
  carboidrato_g: Number(i.carboidrato_g) || 0,
  lipidio_g: Number(i.lipidio_g) || 0,
  fibra_g: Number(i.fibra_g) || 0,
  sodio_mg: null,
});

/**
 * O dia aplicado sobre o plano: as refeições do plano que valem no dia (refeicoesDoDia), cada item com o "tirado" daquele dia, o que ele pôs em
 * cada refeição, as extras (com o que ele pôs nelas) e os totais. `concluidas` = as refeições do plano com ✓ no dia. O plano = as refeições com
 * alimento (o que dá para marcar — a regra de hoje); o comido = nas refeições com ✓, os itens que ele NÃO tirou + os que pôs; nas extras com
 * "Já comi", o que ele pôs. Item tirado que já saiu do plano (item_refeicao_id nulo) não conta; item de outro dia não entra.
 */
export function diaAplicado(
  plano: Pick<PlanoAlimentar, "refeicoes"> | null,
  meuDia: Pick<MeuDia, "dia" | "extras" | "itens">,
  concluidas: ReadonlySet<string>,
): DiaAplicado {
  const dia = meuDia.dia;
  const vivos = meuDia.itens.filter((i) => i.dia === dia);
  const tiradoPorItem = new Map(vivos.filter((i) => i.tipo === "tirado" && i.item_refeicao_id).map((i) => [i.item_refeicao_id as string, i]));
  const refeicoes: RefeicaoNoDia[] = refeicoesDoDia(plano, dia).map((r) => ({
    refeicao: r,
    itens: r.itens.map((item) => ({ item, tirado: tiradoPorItem.get(item.id) ?? null })),
    adicionados: vivos.filter((i) => i.tipo === "adicionado" && i.refeicao_id === r.id),
    concluida: concluidas.has(r.id),
  }));
  const extras: ExtraNoDia[] = meuDia.extras.map((e) => ({
    extra: e,
    adicionados: vivos.filter((i) => i.tipo === "adicionado" && i.extra_id === e.id),
    concluida: !!e.concluida_em,
  }));
  const planoDoDia = somarMacros(refeicoes.filter((r) => refeicaoMarcavel(r.refeicao)).flatMap((r) => r.refeicao.itens.map(macrosDoItem)));
  const comido = somarMacros([
    ...refeicoes.filter((r) => r.concluida).flatMap((r) => [
      ...r.itens.filter((x) => !x.tirado).map((x) => macrosDoItem(x.item)),
      ...r.adicionados.map(macrosDoRetrato),
    ]),
    ...extras.filter((e) => e.concluida).flatMap((e) => e.adicionados.map(macrosDoRetrato)),
  ]);
  return { refeicoes, extras, totais: { plano: planoDoDia, comido } };
}
