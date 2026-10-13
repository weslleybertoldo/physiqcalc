// Physiq W-A P6 — regras PURAS do "Dia a dia" da aba Dieta da ficha (spec §4.5; P7 e Q1 do Weslley: a nutri vê, e o personal também, só para
// ler, embaixo da adesão): os 14 dias, o dia escolhido montado sobre o plano (o diaAplicado da P2 — riscados os itens que ele tirou, os que ele
// pôs, o ✓, as refeições extras e o total comido × plano), o que ficou FORA do plano (a nutri tirou a refeição ou o item depois: o retrato,
// com "refeição tirada do plano"), as rotinas do dia (feitas/não) e se o aluno registrou algo. O plano é o atual (planoAtivo: o mesmo da
// adesão de 7 dias e do app). Sem rede; testado em regras.test.ts.
import { diaAplicado, macrosDoRetrato, type DiaAplicado } from "@/aluno-dia/regras";
import type { DiaDoAluno, ExtraDoDia, ItemDoDia, RotinasDoAluno } from "@/aluno-dia/tipos";
import { somarDias } from "@/nutricao/app/dia";
import { fmtKcal, fmtQtd, type Totais } from "@/nutricao/app/dietaUtil";
import { DIAS_SEMANA, diaDaSemana } from "@/nutricao/app/metasUtil";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import type { Concluida } from "@/nutricao/editor/lib/adesao";
import { JANELA_DIAS, rotinasNoDia, type RotinaNoDia } from "../rotinas/regras";

export const TEXTOS_DIA = {
  titulo: "Dia a dia",
  subtitulo: (nome: string): string =>
    `O que ${nome || "o aluno"} registrou no app nos últimos ${JANELA_DIAS} dias: o que tirou e pôs, as refeições extras, o ✓ e as rotinas.`,
  travada: "A dieta está em “Só ver” (Acessos).",
  liberada: "PODE MEXER",
  soVer: "SÓ VER",
  vazio: "Nada registrado pelo aluno nestes dias.",
  erro: "Não deu para carregar o dia a dia.",
  semInternet: "Sem conexão: o dia a dia aparece quando a internet voltar.",
  tirou: "tirou",
  pelo: "pelo aluno",
  extra: "refeição extra",
  refeicaoTirada: "refeição tirada do plano",
  marcou: "marcou ✓",
  naoMarcou: "não marcou",
  comeu: "já comeu",
  naoComeu: "não marcou “Já comi”",
  semPlano: "Sem plano alimentar: aparecem só as refeições extras, o que ficou fora do plano e as rotinas.",
  semRefeicao: "Nenhuma refeição do plano neste dia.",
  rotinas: "Rotinas do dia",
  semRotinas: "Nenhuma rotina neste dia.",
  apagada: "apagada depois",
  comido: (comido: number, plano: number): string => `${fmtKcal(comido)} de ${fmtKcal(plano)} kcal`,
  totalTitulo: "Comido × plano do dia",
} as const;

/** Os 14 dias da janela, do mais novo (hoje) para o mais antigo — a ordem dos botões (hoje à vista no celular). */
export function diasDaJanela(hoje: string): string[] {
  return Array.from({ length: JANELA_DIAS }, (_, i) => somarDias(hoje, -i));
}

/** "Hoje" · "Ontem" · "Qua 01/10" (o botão do dia). */
export function rotuloCurto(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  return `${DIAS_SEMANA.find((d) => d.n === diaDaSemana(dia))?.curto ?? ""} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export interface GrupoForaDoPlano {
  /** o nome da refeição no retrato (o item guarda o nome da refeição de quando ele pôs/tirou) */
  refeicao: string;
  itens: ItemDoDia[];
}

export interface DiaNaFicha extends DiaAplicado {
  dia: string;
  /** os itens do dia que não acham mais a refeição/o item no plano atual (a nutri tirou depois), agrupados pelo nome do retrato */
  foraDoPlano: GrupoForaDoPlano[];
  rotinas: RotinaNoDia[];
  /** o aluno registrou algo no dia: ✓ de refeição, item posto/tirado, refeição extra ou rotina feita */
  registrou: boolean;
}

type Retratos = Pick<DiaDoAluno, "extras" | "itens">;

/**
 * O dia escolhido na ficha: o diaAplicado da P2 sobre o plano atual (as refeições do dia da semana, os riscados, os postos, as extras daquele
 * dia e os totais comido × plano), o que ficou fora do plano e as rotinas que valiam no dia, com o ✓ do aluno.
 */
export function diaNaFicha(
  plano: Pick<PlanoAlimentar, "refeicoes"> | null,
  dia: string,
  retratos: Retratos | null,
  concluidas: readonly Concluida[],
  rotinas: Pick<RotinasDoAluno, "rotinas" | "feitas"> | null,
): DiaNaFicha {
  const extras: ExtraDoDia[] = (retratos?.extras ?? []).filter((e) => (e.dia ?? dia) === dia);
  const itens = (retratos?.itens ?? []).filter((i) => i.dia === dia);
  const feitas = new Set(concluidas.filter((c) => c.data === dia).map((c) => c.refeicao_id));
  const ap = diaAplicado(plano, { dia, extras, itens }, feitas);
  const refeicoesDoDia = new Set(ap.refeicoes.map((r) => r.refeicao.id));
  const extrasDoDia = new Set(extras.map((e) => e.id));
  const itensDoPlano = new Set(ap.refeicoes.flatMap((r) => r.itens.map((x) => x.item.id)));
  const fora = itens.filter((i) =>
    i.tipo === "adicionado"
      ? !(i.refeicao_id && refeicoesDoDia.has(i.refeicao_id)) && !(i.extra_id && extrasDoDia.has(i.extra_id))
      : !(i.item_refeicao_id && itensDoPlano.has(i.item_refeicao_id)),
  );
  const grupos = new Map<string, ItemDoDia[]>();
  for (const i of fora) {
    const nome = i.refeicao_nome?.trim() || "Refeição";
    grupos.set(nome, [...(grupos.get(nome) ?? []), i]);
  }
  const rotinasDoDia = rotinas ? rotinasNoDia(rotinas.rotinas, rotinas.feitas, dia) : [];
  const registrou = feitas.size > 0 || itens.length > 0 || extras.length > 0 || rotinasDoDia.some((r) => r.feita);
  return {
    ...ap,
    dia,
    foraDoPlano: [...grupos.entries()].map(([refeicao, lista]) => ({ refeicao, itens: lista })),
    rotinas: rotinasDoDia,
    registrou,
  };
}

/** Os dias da janela em que o aluno registrou algo (o ponto no botão do dia) — sem o plano: ✓, item, extra ou rotina feita. */
export function diasComRegistro(
  dias: readonly string[],
  retratos: Retratos | null,
  concluidas: readonly Concluida[],
  rotinas: Pick<RotinasDoAluno, "feitas"> | null,
): Set<string> {
  const janela = new Set(dias);
  const com = new Set<string>();
  for (const i of retratos?.itens ?? []) if (janela.has(i.dia)) com.add(i.dia);
  for (const e of retratos?.extras ?? []) if (e.dia && janela.has(e.dia)) com.add(e.dia);
  for (const c of concluidas) if (janela.has(c.data)) com.add(c.data);
  for (const f of rotinas?.feitas ?? []) if (janela.has(f.dia)) com.add(f.dia);
  return com;
}

/** A quantidade do que ele pôs: "150 g" · "2 porções" · "1 porção". */
export function quantidadeDoPosto(i: Pick<ItemDoDia, "quantidade_g" | "porcoes">): string {
  if (i.porcoes !== null && i.porcoes !== undefined) return `${fmtQtd(Number(i.porcoes))} ${Number(i.porcoes) === 1 ? "porção" : "porções"}`;
  return `${fmtQtd(Number(i.quantidade_g ?? 0))} g`;
}

/** "≈ 192 kcal · P 3,8 g · C 41,2 g · G 0,4 g" (o retrato da quantidade — o banco já calculou). */
export function macrosDoPosto(i: Pick<ItemDoDia, "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g">): string {
  const m = macrosDoRetrato(i);
  const g = (n: number | null) => `${fmtQtd(Math.round((n ?? 0) * 10) / 10)} g`;
  return `≈ ${fmtKcal(m.energia_kcal)} kcal · P ${g(m.proteina_g)} · C ${g(m.carboidrato_g)} · G ${g(m.lipidio_g)}`;
}

/** Os 3 macros do total ("P 120 g · C 180 g · G 50 g"). */
export const macrosDoTotal = (t: Pick<Totais, "proteina_g" | "carboidrato_g" | "lipidio_g">): string =>
  `P ${fmtQtd(Math.round(t.proteina_g))} g · C ${fmtQtd(Math.round(t.carboidrato_g))} g · G ${fmtQtd(Math.round(t.lipidio_g))} g`;

export type EstadoDoDiaADia = "carregando" | "sem-internet" | "erro" | "vazio" | "pronto";

/**
 * O estado da seção (o data-dia-a-dia dos E2E): o dia do aluno é a base (sem ele, o erro; sem internet, a consulta espera a rede); as rotinas,
 * o plano e os ✓ completam (enquanto chegam, "carregando" — nada pisca de "vazio" para "pronto"; se falharem, o dia sai sem eles).
 */
export function estadoDoDiaADia(
  dia: { isLoading: boolean; isError: boolean; fetchStatus?: string; data?: unknown },
  outras: readonly { isLoading: boolean }[],
  comRegistro: ReadonlySet<string>,
): EstadoDoDiaADia {
  if (dia.isLoading || outras.some((o) => o.isLoading)) return "carregando";
  if (!dia.data) return !dia.isError && dia.fetchStatus === "paused" ? "sem-internet" : "erro";
  return comRegistro.size === 0 ? "vazio" : "pronto";
}
