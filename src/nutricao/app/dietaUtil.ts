// Physiq W11 — regras puras do plano alimentar do lado do aluno, portadas do PhysiqNutri (src/lib/dietaUtil.ts, W9 do Nutri):
// gramas do item (direto ou por medida caseira), macros pela regra de 3 a partir dos 100 g, totais por refeição e do plano,
// % das kcal por macro (4/4/9), comparação com a meta calórica, substitutos, ordenação e os textos. O editor (formulário ⇄
// registro) fica para a W16. Acrescentado aqui: o nome curto do alimento na linha da refeição (tela 3). Sem rede; testado.
import { format } from "date-fns";
import { MACROS_VAZIOS, arred, fmtKcal, fmtNum, fmtQtd, macrosPorGramas, numero, slugNome, type Macros } from "./numeros";
import type { ItemDaRefeicao, MedidaDoAlimento } from "./tipos";

export { arred, fmtKcal, fmtNum, fmtQtd, numero };
export type { Macros };

// ---- Método ----
export const METODOS: { valor: string; rotulo: string }[] = [{ valor: "alimentos", rotulo: "Alimentos" }];
export const rotuloMetodo = (m: string | null | undefined): string => METODOS.find((x) => x.valor === m)?.rotulo ?? (m ?? "");

/** Até ±5 % da meta conta como "dentro da meta". */
export const TOLERANCIA_ALVO_PCT = 5;
export const MAX_SUBSTITUTOS = 6;

// ---- Horário ----
/** "07:00:00" (time do banco) ou "07:00" → "07:00"; vazio/inválido → "". */
export const fmtHorario = (h: string | null | undefined): string => {
  const m = /^(\d{2}):(\d{2})/.exec((h ?? "").trim());
  return m ? `${m[1]}:${m[2]}` : "";
};

// ---- Item: gramas e macros ----
export type ItemCalc = Pick<ItemDaRefeicao, "quantidade_g" | "medida_caseira_id" | "quantidade_medida" | "alimento">;

/** Medida caseira escolhida no item, se ainda existir no alimento. */
export function medidaDoItem(i: ItemCalc): MedidaDoAlimento | null {
  if (!i.medida_caseira_id || !i.alimento?.medidas_caseiras) return null;
  return i.alimento.medidas_caseiras.find((m) => m.id === i.medida_caseira_id) ?? null;
}
/** 2 × "1 fatia (25 g)" = 50 g. */
export const gramasDaMedida = (quantidadeMedida: number, gramasMedida: number): number => arred(quantidadeMedida * gramasMedida, 2);

/** Gramas do item: pela medida caseira (quantidade × gramas da medida) quando houver; senão a `quantidade_g` gravada. */
export function gramasDoItem(i: ItemCalc): number {
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && Number(i.quantidade_medida) > 0) return gramasDaMedida(Number(i.quantidade_medida), Number(m.gramas));
  const g = Number(i.quantidade_g);
  return Number.isFinite(g) && g > 0 ? arred(g, 2) : 0;
}
/** "100 g" · "2 × 1 fatia (25 g) = 50 g" */
export function descricaoQuantidade(i: ItemCalc): string {
  const g = gramasDoItem(i);
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && Number(i.quantidade_medida) > 0) {
    return `${fmtQtd(Number(i.quantidade_medida))} × ${m.descricao} (${fmtQtd(Number(m.gramas))} g) = ${fmtQtd(g)} g`;
  }
  return `${fmtQtd(g)} g`;
}
/** "3 × 1 unidade" · "150 g" — a quantidade curta (sem a conta) para a linha do alimento no app. */
export function quantidadeCurta(i: ItemCalc): string {
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && Number(i.quantidade_medida) > 0) return `${fmtQtd(Number(i.quantidade_medida))} × ${m.descricao}`;
  return `${fmtQtd(gramasDoItem(i))} g`;
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
  if (alvo === null || alvo === undefined || !Number.isFinite(Number(alvo)) || Number(alvo) <= 0) return null;
  return { diferenca: arred(kcal - Number(alvo), 2), pct: arred((kcal / Number(alvo)) * 100, 1) };
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

// ---- Textos ----
export const formatarDataPlano = (iso: string): string => format(new Date(iso), "dd/MM/yyyy");
/** "02/07" (o "atualizado em" do cartão do plano, tela 3). */
export const diaMesCurto = (iso: string): string => format(new Date(iso), "dd/MM");
export const textoRefeicoes = (n: number): string => (n === 1 ? "1 refeição" : `${n} refeições`);
export const textoItens = (n: number): string => (n === 0 ? "sem alimentos" : n === 1 ? "1 alimento" : `${n} alimentos`);
/** "Alimentos · 1.850 kcal · P 120 g · C 200 g · L 60 g · 6 refeições" (sem itens: "Alimentos · sem alimentos · 6 refeições"). */
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
export const nomeArquivoPDFDieta = (paciente: string, d: Date): string => `plano-alimentar-${slugNome(paciente)}-${format(d, "yyyy-MM-dd")}.pdf`;

// ---- Nome curto do alimento (a linha da refeição da tela 3: "07:00 · Ovo · Aveia · Whey protein") ----
/** Qualificadores que fazem parte do nome no dia a dia ("Arroz integral", "Batata doce", "Leite desnatado"). */
const QUALIFICADORES = new Set([
  "integral", "doce", "desnatado", "desnatada", "semidesnatado", "light", "diet", "zero", "francês", "frances", "preto", "preta",
  "carioca", "branco", "branca", "vermelho", "vermelha", "natural", "grego", "minas", "cottage", "ricota", "mozarela", "parmesão",
]);

/**
 * "Ovo, de galinha, inteiro, cozido/10minutos" → "Ovo" · "Arroz, integral, cozido" → "Arroz integral" · "Pão, trigo, forma,
 * integral" → "Pão integral" · "Whey protein" → "Whey protein". A 1ª parte do nome da TACO + o 1º qualificador conhecido.
 */
export function nomeCurto(nome: string | null | undefined): string {
  const partes = (nome ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return "Alimento";
  const base = partes[0];
  const qualificador = partes.slice(1).find((p) => QUALIFICADORES.has(p.toLowerCase()));
  return qualificador ? `${base} ${qualificador.toLowerCase()}` : base;
}

/** "Ovo · Aveia · Whey protein" (até `max` nomes; o resto vira "+N"). */
export function resumoDaRefeicao(itens: Pick<ItemDaRefeicao, "alimento">[], max = 3): string {
  const nomes: string[] = [];
  for (const i of itens) {
    const n = nomeCurto(i.alimento?.nome);
    if (!nomes.includes(n)) nomes.push(n);
  }
  return nomes.length <= max ? nomes.join(" · ") : `${nomes.slice(0, max).join(" · ")} · +${nomes.length - max}`;
}
