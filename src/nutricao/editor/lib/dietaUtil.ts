// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/dietaUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format } from "date-fns";
import { MACROS_VAZIOS, fmtQtd, macrosPorGramas, type Macros } from "@/nutricao/editor/lib/alimentosUtil";
import { arred, fmtNum, numero } from "@/nutricao/editor/lib/antropometriaUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import { diasParaBanco, normalizarDias } from "@/nutricao/editor/lib/semanaPlano";

// Regras puras do planejamento alimentar (W9): refeições padrão, gramas do item (direto ou por medida caseira),
// macros do item pela regra de 3 a partir dos 100 g (reaproveita alimentosUtil), totais por refeição e do plano,
// % das kcal por macro (4/4/9), comparação com a meta calórica, substitutos equivalentes em kcal, ordenação e a
// conversão formulário ⇄ registro. Nada de rede aqui; testado no vitest.

export { arred, fmtKcal, fmtNum, fmtQtd, numero };
export type { Macros };

// ---- Método ----
export type Metodo = "alimentos";
export const METODOS: { valor: Metodo; rotulo: string }[] = [{ valor: "alimentos", rotulo: "Alimentos" }];
export const rotuloMetodo = (m: string | null | undefined): string => METODOS.find((x) => x.valor === m)?.rotulo ?? (m ?? "");

// ---- Limites ----
export const TITULO_MAX = 120;
export const NOME_REFEICAO_MAX = 60;
export const OBSERVACAO_MAX = 4000;
export const OBSERVACAO_ITEM_MAX = 300;
export const MAX_SUBSTITUTOS = 6;
/** Até ±5 % da meta conta como "dentro da meta". */
export const TOLERANCIA_ALVO_PCT = 5;

// ---- Refeições padrão (um plano novo nasce com elas) ----
export type RefeicaoPadrao = { nome: string; horario: string };
export const REFEICOES_PADRAO: RefeicaoPadrao[] = [
  { nome: "Café da manhã", horario: "07:00" },
  { nome: "Lanche da manhã", horario: "10:00" },
  { nome: "Almoço", horario: "12:30" },
  { nome: "Lanche da tarde", horario: "16:00" },
  { nome: "Jantar", horario: "19:30" },
  { nome: "Ceia", horario: "22:00" },
];

// ---- Horário ----
/** "07:00:00" (time do banco) ou "07:00" → "07:00"; vazio/inválido → "". */
export const fmtHorario = (h: string | null | undefined): string => {
  const m = /^(\d{2}):(\d{2})/.exec((h ?? "").trim());
  return m ? `${m[1]}:${m[2]}` : "";
};
export const horarioValido = (v: string): boolean => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** Horário do formulário → banco ("" ou inválido → null). */
export const horarioParaBanco = (v: string): string | null => (v && horarioValido(v) ? v : null);

// ---- Item: gramas e macros ----
export type MedidaDoAlimento = { id: string; descricao: string; gramas: number; ordem: number };
/** O que o cálculo precisa do alimento (W8): macros por 100 g + medidas caseiras. */
export type AlimentoDoItem = Macros & { id: string; nome: string; fonte: string; medidas_caseiras?: MedidaDoAlimento[] | null };
export type ItemCalc = {
  quantidade_g: number;
  medida_caseira_id: string | null;
  quantidade_medida: number | null;
  alimento: AlimentoDoItem | null;
};

/** Medida caseira escolhida no item, se ainda existir no alimento. */
export function medidaDoItem(i: ItemCalc): MedidaDoAlimento | null {
  if (!i.medida_caseira_id || !i.alimento?.medidas_caseiras) return null;
  return i.alimento.medidas_caseiras.find((m) => m.id === i.medida_caseira_id) ?? null;
}
/** 2 × "1 fatia (25 g)" = 50 g. */
export const gramasDaMedida = (quantidadeMedida: number, gramasMedida: number): number => arred(quantidadeMedida * gramasMedida, 2);
export const temMedidas = (a: AlimentoDoItem | null | undefined): boolean => !!a?.medidas_caseiras?.length;

/** Gramas do item: pela medida caseira (quantidade × gramas da medida) quando houver; senão a `quantidade_g` gravada. */
export function gramasDoItem(i: ItemCalc): number {
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && i.quantidade_medida > 0) return gramasDaMedida(i.quantidade_medida, m.gramas);
  const g = Number(i.quantidade_g);
  return Number.isFinite(g) && g > 0 ? arred(g, 2) : 0;
}
/** "100 g" · "2 × 1 fatia (25 g) = 50 g" */
export function descricaoQuantidade(i: ItemCalc): string {
  const g = gramasDoItem(i);
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && i.quantidade_medida > 0) return `${fmtQtd(i.quantidade_medida)} × ${m.descricao} (${fmtQtd(m.gramas)} g) = ${fmtQtd(g)} g`;
  return `${fmtQtd(g)} g`;
}
/** Macros do item (regra de 3 a partir dos 100 g do alimento). Sem alimento → vazios. */
export const macrosDoItem = (i: ItemCalc): Macros => (i.alimento ? macrosPorGramas(i.alimento, gramasDoItem(i)) : { ...MACROS_VAZIOS });

// ---- Totais ----
export type Totais = { energia_kcal: number; proteina_g: number; carboidrato_g: number; lipidio_g: number; fibra_g: number; sodio_mg: number; itens: number };
export const TOTAIS_ZERO: Totais = { energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0, sodio_mg: 0, itens: 0 };

/** Soma dos macros (valor ausente conta 0); `itens` = quantas linhas entraram. */
export function somarMacros(lista: Macros[]): Totais {
  const t = { ...TOTAIS_ZERO };
  for (const m of lista) {
    t.energia_kcal += m.energia_kcal ?? 0;
    t.proteina_g += m.proteina_g ?? 0;
    t.carboidrato_g += m.carboidrato_g ?? 0;
    t.lipidio_g += m.lipidio_g ?? 0;
    t.fibra_g += m.fibra_g ?? 0;
    t.sodio_mg += m.sodio_mg ?? 0;
    t.itens += 1;
  }
  return {
    energia_kcal: arred(t.energia_kcal, 2),
    proteina_g: arred(t.proteina_g, 2),
    carboidrato_g: arred(t.carboidrato_g, 2),
    lipidio_g: arred(t.lipidio_g, 2),
    fibra_g: arred(t.fibra_g, 2),
    sodio_mg: arred(t.sodio_mg, 2),
    itens: t.itens,
  };
}
export const totaisDosItens = (itens: ItemCalc[]): Totais => somarMacros(itens.map(macrosDoItem));
export const totaisDoPlano = (refeicoes: { itens: ItemCalc[] }[]): Totais => somarMacros(refeicoes.flatMap((r) => r.itens.map(macrosDoItem)));

/** % das kcal vindas de cada macro (4 kcal/g proteína e carboidrato, 9 kcal/g lipídio). Sem macros → null. */
export type Percentuais = { proteina: number; carboidrato: number; lipidio: number };
export function percentuaisMacros(t: { proteina_g: number; carboidrato_g: number; lipidio_g: number }): Percentuais | null {
  const base = 4 * t.proteina_g + 4 * t.carboidrato_g + 9 * t.lipidio_g;
  if (base <= 0) return null;
  return {
    proteina: arred(((4 * t.proteina_g) / base) * 100, 1),
    carboidrato: arred(((4 * t.carboidrato_g) / base) * 100, 1),
    lipidio: arred(((9 * t.lipidio_g) / base) * 100, 1),
  };
}

// ---- Meta calórica ----
export type Comparacao = { diferenca: number; pct: number };
/** Diferença (kcal − meta) e % da meta atingido. Sem meta → null. */
export function compararComAlvo(kcal: number, alvo: number | null | undefined): Comparacao | null {
  if (alvo === null || alvo === undefined || !Number.isFinite(alvo) || alvo <= 0) return null;
  return { diferenca: arred(kcal - alvo, 2), pct: arred((kcal / alvo) * 100, 1) };
}
export type SituacaoAlvo = "sem_alvo" | "no_alvo" | "abaixo" | "acima";
export function situacaoAlvo(c: Comparacao | null): SituacaoAlvo {
  if (!c) return "sem_alvo";
  if (Math.abs(c.pct - 100) <= TOLERANCIA_ALVO_PCT) return "no_alvo";
  return c.pct < 100 ? "abaixo" : "acima";
}
export const ROTULO_SITUACAO: Record<SituacaoAlvo, string> = {
  sem_alvo: "sem meta definida",
  no_alvo: "dentro da meta",
  abaixo: "abaixo da meta",
  acima: "acima da meta",
};
/** "+120" · "-503" · "0" */
export const fmtDiferenca = (n: number): string => (n > 0 ? `+${fmtKcal(n)}` : fmtKcal(n));
/** "1.850 de 2.353 kcal (79 %)"; sem meta → "1.850 kcal". */
export function textoAlvo(kcal: number, alvo: number | null | undefined): string {
  const c = compararComAlvo(kcal, alvo);
  if (!c) return `${fmtKcal(kcal)} kcal`;
  return `${fmtKcal(kcal)} de ${fmtKcal(alvo)} kcal (${fmtNum(c.pct, 0)} %)`;
}

// ---- Substitutos (jsonb do item: [{alimento_id, nome, quantidade_g}]) ----
export type Substituto = { alimento_id: string; nome: string; quantidade_g: number };
export function lerSubstitutos(v: unknown): Substituto[] {
  if (!Array.isArray(v)) return [];
  const saida: Substituto[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const q = numero(typeof o.quantidade_g === "number" || typeof o.quantidade_g === "string" ? o.quantidade_g : null);
    if (typeof o.alimento_id === "string" && o.alimento_id && q !== null && q > 0) {
      saida.push({ alimento_id: o.alimento_id, nome: typeof o.nome === "string" ? o.nome : "", quantidade_g: arred(q, 2) });
    }
  }
  return saida;
}
/** Gramas do alimento B que dão as mesmas kcal do item (kcal do item ÷ kcal por 100 g de B × 100), 1 casa. Sem kcal → null. */
export function gramasEquivalentes(kcalItem: number | null, kcal100B: number | null): number | null {
  if (kcalItem === null || kcal100B === null || !Number.isFinite(kcalItem) || !Number.isFinite(kcal100B) || kcalItem < 0 || kcal100B <= 0) return null;
  return arred((kcalItem / kcal100B) * 100, 1);
}
/** "50 g de Pão, trigo, francês" */
export const descricaoSubstituto = (s: Substituto): string => `${fmtQtd(s.quantidade_g)} g de ${s.nome || "alimento"}`;

// ---- Ordenação ----
/** Pela ordem gravada; empate → horário, depois nome. */
export function ordenarRefeicoes<T extends { ordem: number; horario: string | null; nome: string }>(l: T[]): T[] {
  return [...l].sort((a, b) => a.ordem - b.ordem || fmtHorario(a.horario).localeCompare(fmtHorario(b.horario)) || a.nome.localeCompare(b.nome, "pt-BR"));
}
export function ordenarItens<T extends { ordem: number; created_at: string }>(l: T[]): T[] {
  return [...l].sort((a, b) => a.ordem - b.ordem || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
/** Move `id` uma posição (-1 sobe, +1 desce) e devolve a numeração nova (0..n-1) de todos; null se não dá pra mover. */
export function moverNaOrdem<T extends { id: string }>(lista: T[], id: string, direcao: -1 | 1): { id: string; ordem: number }[] | null {
  const i = lista.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return null;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova.map((x, k) => ({ id: x.id, ordem: k }));
}

// ---- Textos ----
export const tituloPadrao = (d: Date = new Date()): string => `Plano alimentar ${format(d, "dd/MM/yyyy")}`;
export const formatarDataPlano = (iso: string): string => format(new Date(iso), "dd/MM/yyyy");
export function textoContagemPlanos(n: number): string {
  if (n === 0) return "Nenhum plano alimentar";
  if (n === 1) return "1 plano alimentar";
  return `${n} planos alimentares`;
}
export const textoRefeicoes = (n: number): string => (n === 1 ? "1 refeição" : `${n} refeições`);
export const textoItens = (n: number): string => (n === 0 ? "sem alimentos" : n === 1 ? "1 alimento" : `${n} alimentos`);
/** Linha da lista: "Alimentos · 1.850 kcal · P 120 g · C 200 g · L 60 g · 6 refeições" (sem itens: "Alimentos · sem alimentos · 6 refeições"). */
export function resumoPlano(metodo: string, t: Totais, nRefeicoes: number): string {
  const partes = [rotuloMetodo(metodo) || "Alimentos"];
  if (t.itens > 0) {
    partes.push(`${fmtKcal(t.energia_kcal)} kcal`, `P ${fmtQtd(arred(t.proteina_g, 1))} g`, `C ${fmtQtd(arred(t.carboidrato_g, 1))} g`, `L ${fmtQtd(arred(t.lipidio_g, 1))} g`);
  } else {
    partes.push("sem alimentos");
  }
  partes.push(textoRefeicoes(nRefeicoes));
  return partes.join(" · ");
}
/** `plano-alimentar-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export function nomeArquivoPDFDieta(paciente: string, d: Date): string {
  const slug = paciente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "paciente";
  return `plano-alimentar-${slug}-${format(d, "yyyy-MM-dd")}.pdf`;
}

// ---- Formulário ⇄ registro: plano ----
/** O que a nutricionista digita no modal do plano (kcal como texto: aceita vírgula). */
export type FormPlano = { titulo: string; kcal_alvo: string; observacao: string };
export type RegistroPlano = { titulo: string; kcal_alvo: number | null; observacao: string | null };
const textoNum = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/** Plano novo: título com a data de hoje e a meta pré-preenchida pelo VET do último cálculo energético (inteiro). */
export function formPlanoNovo(vet: number | null | undefined, agora: Date = new Date()): FormPlano {
  return { titulo: tituloPadrao(agora), kcal_alvo: vet !== null && vet !== undefined && vet > 0 ? String(Math.round(vet)) : "", observacao: "" };
}
export function formPlanoParaRegistro(f: FormPlano): RegistroPlano {
  const k = numero(f.kcal_alvo);
  return {
    titulo: (f.titulo ?? "").trim().replace(/\s+/g, " ").slice(0, TITULO_MAX),
    kcal_alvo: k !== null && k > 0 && k < 100000 ? arred(k, 2) : null,
    observacao: (f.observacao ?? "").trim().slice(0, OBSERVACAO_MAX) || null,
  };
}
export function planoParaForm(p: { titulo: string; kcal_alvo: number | null; observacao: string | null }): FormPlano {
  return { titulo: p.titulo, kcal_alvo: textoNum(p.kcal_alvo), observacao: p.observacao ?? "" };
}

// ---- Formulário ⇄ registro: refeição ----
// Physiq W16 (NF3): `dias` = os dias da semana em que a refeição vale (1–7; vazio = todos os dias). Opcional: o formulário do
// site antigo não tinha o campo e o registro só leva `dias_semana` quando o formulário o traz.
export type FormRefeicao = { nome: string; horario: string; observacao: string; dias?: number[] };
export type RegistroRefeicao = { nome: string; horario: string | null; observacao: string | null; dias_semana?: number[] };
export const formRefeicaoNova = (dias?: number[]): FormRefeicao => ({ nome: "", horario: "", observacao: "", ...(dias ? { dias } : {}) });
export function formRefeicaoParaRegistro(f: FormRefeicao): RegistroRefeicao {
  return {
    nome: (f.nome ?? "").trim().replace(/\s+/g, " ").slice(0, NOME_REFEICAO_MAX),
    horario: horarioParaBanco((f.horario ?? "").trim()),
    observacao: (f.observacao ?? "").trim().slice(0, OBSERVACAO_ITEM_MAX) || null,
    ...(f.dias !== undefined ? { dias_semana: diasParaBanco(f.dias) } : {}),
  };
}
export function refeicaoParaForm(r: { nome: string; horario: string | null; observacao: string | null; dias_semana?: unknown }): FormRefeicao {
  return { nome: r.nome, horario: fmtHorario(r.horario), observacao: r.observacao ?? "", dias: normalizarDias(r.dias_semana) };
}

// ---- Formulário ⇄ registro: item ----
export type ModoQuantidade = "gramas" | "medida";
/** O que a nutricionista digita no modal do item (números como texto: aceita vírgula). */
export type FormItem = { modo: ModoQuantidade; quantidade_g: string; medida_caseira_id: string; quantidade_medida: string; observacao: string };
export type RegistroItem = { quantidade_g: number; medida_caseira_id: string | null; quantidade_medida: number | null; observacao: string | null };

/** Item novo: por medida caseira (a 1ª, quantidade 1) quando o alimento tem medidas; senão 100 g. */
export function formItemNovo(a: AlimentoDoItem | null): FormItem {
  const medidas = a?.medidas_caseiras ?? [];
  if (medidas.length) return { modo: "medida", quantidade_g: "", medida_caseira_id: medidas[0].id, quantidade_medida: "1", observacao: "" };
  return { modo: "gramas", quantidade_g: "100", medida_caseira_id: "", quantidade_medida: "", observacao: "" };
}
export function itemParaForm(i: ItemCalc & { observacao: string | null }): FormItem {
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && i.quantidade_medida > 0) {
    return { modo: "medida", quantidade_g: textoNum(i.quantidade_g), medida_caseira_id: m.id, quantidade_medida: textoNum(i.quantidade_medida), observacao: i.observacao ?? "" };
  }
  return { modo: "gramas", quantidade_g: textoNum(i.quantidade_g), medida_caseira_id: "", quantidade_medida: "", observacao: i.observacao ?? "" };
}
/** Gramas resultantes do formulário; null = quantidade inválida (ou medida que não existe mais). */
export function gramasDoForm(f: FormItem, a: AlimentoDoItem | null): number | null {
  if (f.modo === "medida") {
    const m = (a?.medidas_caseiras ?? []).find((x) => x.id === f.medida_caseira_id);
    const q = numero(f.quantidade_medida);
    if (!m || q === null || q <= 0 || q >= 10000) return null;
    return gramasDaMedida(q, m.gramas);
  }
  const g = numero(f.quantidade_g);
  return g === null || g <= 0 || g >= 100000 ? null : arred(g, 2);
}
export function formItemParaRegistro(f: FormItem, a: AlimentoDoItem | null): RegistroItem | null {
  const g = gramasDoForm(f, a);
  if (g === null) return null;
  const observacao = (f.observacao ?? "").trim().slice(0, OBSERVACAO_ITEM_MAX) || null;
  if (f.modo === "medida") return { quantidade_g: g, medida_caseira_id: f.medida_caseira_id, quantidade_medida: arred(numero(f.quantidade_medida) ?? 0, 2), observacao };
  return { quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, observacao };
}
/** Prévia enquanto digita: gramas e macros da linha. */
export function previaItem(f: FormItem, a: AlimentoDoItem | null): { gramas: number | null; macros: Macros } {
  const g = gramasDoForm(f, a);
  return { gramas: g, macros: g !== null && a ? macrosPorGramas(a, g) : { ...MACROS_VAZIOS } };
}
/** "123,53 kcal · P 2,59 · C 25,81 · L 1 g" */
export function resumoMacrosLinha(m: Macros): string {
  if (m.energia_kcal === null && m.proteina_g === null && m.carboidrato_g === null && m.lipidio_g === null) return "sem valores nutricionais";
  return `${fmtQtd(m.energia_kcal)} kcal · P ${fmtQtd(m.proteina_g)} · C ${fmtQtd(m.carboidrato_g)} · L ${fmtQtd(m.lipidio_g)} g`;
}
