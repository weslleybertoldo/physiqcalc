// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/acompanhamentoUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { arred, fmtNum, serieEvolucao, type PontoEvolucao } from "@/nutricao/editor/lib/antropometriaUtil";
import { gastoAtividades, ordenarCalculos, type Atividade } from "@/nutricao/editor/lib/energeticoUtil";
import { ehDataISO, hojeISO } from "@/nutricao/editor/lib/evolucaoUtil";

// Regras PURAS do Acompanhamento (W23): intervalo de datas, plano ativo e kcal por macro (W9), kcal das atividades (W7),
// últimos pesos (W6), água e sintomas dos registros diários (tabela nova `registros_diarios`) e o formulário do dia.
// Nada de rede aqui; testado no vitest. REUSA `dietaUtil`/`antropometriaUtil`/`energeticoUtil`/`evolucaoUtil`.
// A tela fica em `pages/paciente/secoes/Acompanhamento.tsx`, o acesso em `lib/acompanhamento.ts`.

export { ehDataISO, hojeISO };

const instante = (iso: string): number => new Date(iso).getTime();

// ---- Sintomas ----
export type OpcaoSintoma = { chave: string; rotulo: string };
/** Catálogo fixo (chips do modal). Sintoma digitado fora dele vira chave livre normalizada. */
export const SINTOMAS: OpcaoSintoma[] = [
  { chave: "azia", rotulo: "Azia" },
  { chave: "nausea", rotulo: "Náusea" },
  { chave: "dor_de_cabeca", rotulo: "Dor de cabeça" },
  { chave: "inchaco", rotulo: "Inchaço" },
  { chave: "constipacao", rotulo: "Constipação" },
  { chave: "diarreia", rotulo: "Diarreia" },
  { chave: "gases", rotulo: "Gases" },
  { chave: "fome_excessiva", rotulo: "Fome excessiva" },
  { chave: "cansaco", rotulo: "Cansaço" },
  { chave: "insonia", rotulo: "Insônia" },
  { chave: "ansiedade", rotulo: "Ansiedade" },
  { chave: "dor_abdominal", rotulo: "Dor abdominal" },
];
export const SINTOMA_MAX = 40;
export const SINTOMAS_MAX = 12;
export const ehSintomaCatalogo = (chave: string): boolean => SINTOMAS.some((s) => s.chave === chave);

/** Rótulo do catálogo; chave livre → o próprio texto legível ('dor_nas_costas' → 'Dor nas costas'). */
export function rotuloSintoma(chave: string): string {
  const s = SINTOMAS.find((x) => x.chave === chave);
  if (s) return s.rotulo;
  const t = (chave ?? "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** Chave de um sintoma digitado: sem acento, minúsculo, só letras/dígitos separados por '_' ('Dor de cabeça' → 'dor_de_cabeca'). */
export function normalizarSintomaLivre(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SINTOMA_MAX)
    .replace(/_+$/g, "");
}

/** Lê o jsonb `sintomas`: strings únicas, sem espaços nas pontas, ≤ 40 chars, no máximo 12. */
export function lerSintomas(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const saida: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim().slice(0, SINTOMA_MAX);
    if (t && !saida.includes(t)) saida.push(t);
    if (saida.length >= SINTOMAS_MAX) break;
  }
  return saida;
}

export const sintomasLivres = (lista: string[]): string[] => lista.filter((s) => !ehSintomaCatalogo(s));
export const textoSintomas = (chaves: string[]): string => chaves.map(rotuloSintoma).join(", ");

// ---- Intervalo de datas ----
export type Intervalo = { de: string; ate: string };
export const PRESETS_INTERVALO = [7, 15, 30];
export const INTERVALO_MAX_DIAS = 366;

export const somarDias = (s: string, n: number): string => format(addDays(parseISO(s), n), "yyyy-MM-dd");
/** Dias do intervalo, inclusivo ('2026-09-13' → '2026-09-19' = 7). */
export const nDias = (de: string, ate: string): number => differenceInCalendarDays(parseISO(ate), parseISO(de)) + 1;
/** Últimos N dias terminando hoje (N = 7 → hoje − 6 … hoje). */
export const intervaloPreset = (hoje: string, n: number): Intervalo => ({ de: somarDias(hoje, -(n - 1)), ate: hoje });
export const intervaloPadrao = (hoje: string): Intervalo => intervaloPreset(hoje, 7);

/** null = intervalo válido; senão a mensagem pra nutricionista. */
export function validarIntervalo(de: string, ate: string, hoje: string): string | null {
  if (!ehDataISO(de) || !ehDataISO(ate)) return "Escolha as duas datas";
  if (de > ate) return "A data inicial não pode ser depois da final";
  if (ate > hoje) return "A data final não pode ser futura";
  if (nDias(de, ate) > INTERVALO_MAX_DIAS) return "Intervalo de até 1 ano";
  return null;
}

export function diasDoIntervalo(de: string, ate: string): string[] {
  const n = nDias(de, ate);
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => somarDias(de, i));
}
export const noIntervalo = (data: string, de: string, ate: string): boolean => data >= de && data <= ate;

/** `?de=&ate=` da URL; ausente ou inválido → padrão (últimos 7 dias). */
export function intervaloDaURL(params: URLSearchParams, hoje: string): Intervalo {
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  return validarIntervalo(de, ate, hoje) ? intervaloPadrao(hoje) : { de, ate };
}
export const intervaloParaURL = (i: Intervalo): string => `?de=${i.de}&ate=${i.ate}`;
/** Preset (7/15/30) que bate com o intervalo, ou null (intervalo personalizado). */
export const presetAtivo = (i: Intervalo, hoje: string): number | null =>
  PRESETS_INTERVALO.find((n) => {
    const p = intervaloPreset(hoje, n);
    return p.de === i.de && p.ate === i.ate;
  }) ?? null;
export const textoDias = (n: number): string => (n === 1 ? "em 1 dia" : `em ${n} dias`);
export const formatarDataCurta = (d: string): string => format(parseISO(d), "dd/MM/yyyy");

// ---- Plano alimentar ativo (W9) ----
type PlanoBase = { favorito: boolean; created_at: string; deleted_at: string | null };
/** Plano ATIVO = favorito mais recente; sem favorito, o mais recente vivo; null sem plano. */
export function planoAtivo<T extends PlanoBase>(planos: T[]): T | null {
  const vivos = planos.filter((p) => !p.deleted_at).sort((a, b) => instante(b.created_at) - instante(a.created_at));
  return vivos.find((p) => p.favorito) ?? vivos[0] ?? null;
}

export type ChaveMacro = "proteina" | "carboidrato" | "lipidio";
export const MACROS: { chave: ChaveMacro; rotulo: string; kcalPorGrama: number; cor: string }[] = [
  { chave: "proteina", rotulo: "Proteínas", kcalPorGrama: 4, cor: "#22D3EE" },
  { chave: "carboidrato", rotulo: "Carboidratos", kcalPorGrama: 4, cor: "#10B981" },
  { chave: "lipidio", rotulo: "Lipídios", kcalPorGrama: 9, cor: "#F59E0B" },
];
type Gramas = { proteina_g: number; carboidrato_g: number; lipidio_g: number };
/** kcal de cada macro pelos fatores de Atwater (4 · 4 · 9). */
export const kcalPorMacro = (t: Gramas): Record<ChaveMacro, number> => ({
  proteina: arred(t.proteina_g * 4, 1),
  carboidrato: arred(t.carboidrato_g * 4, 1),
  lipidio: arred(t.lipidio_g * 9, 1),
});
export type PontoNutriente = { chave: ChaveMacro; rotulo: string; kcal: number; pct: number; cor: string };
/** Fatias do donut 'Nutrientes' (% pela soma das 3 kcal); vazio quando a soma é 0. */
export function serieNutrientes(t: Gramas): PontoNutriente[] {
  const k = kcalPorMacro(t);
  const soma = k.proteina + k.carboidrato + k.lipidio;
  if (soma <= 0) return [];
  return MACROS.map((m) => ({ chave: m.chave, rotulo: m.rotulo, kcal: k[m.chave], pct: Math.round((k[m.chave] / soma) * 100), cor: m.cor }));
}

// ---- Atividade física (W7) ----
/** Cálculo energético mais recente (vivo). */
export function calculoMaisRecente<T extends { data: string; created_at: string; deleted_at: string | null }>(lista: T[]): T | null {
  return ordenarCalculos(lista.filter((c) => !c.deleted_at))[0] ?? null;
}
/** kcal/dia das atividades do cálculo (Σ MET × peso × min/60); sem peso ou sem atividades → 0. */
export const kcalAtividadesDia = (atividades: Atividade[], peso: number | null): number => gastoAtividades(atividades, peso) ?? 0;
/** kcal no intervalo = kcal/dia × nº de dias (inteiro). */
export const kcalAtividadesIntervalo = (kcalDia: number, dias: number): number => Math.round(kcalDia * Math.max(0, dias));

// ---- Peso (W6) ----
export const PRESETS_PESO = [10, 20, 30];
/** Últimas n avaliações vivas COM peso, da mais antiga pra mais recente (série do GraficoEvolucao). */
export function ultimosPesos<T extends { data: string; peso: number | null; resultados: unknown; deleted_at?: string | null }>(lista: T[], n: number): PontoEvolucao[] {
  const comPeso = lista.filter((a) => !a.deleted_at && a.peso !== null && a.peso !== undefined);
  const serie = serieEvolucao(comPeso);
  return serie.slice(Math.max(0, serie.length - Math.max(1, n)));
}
export type VariacaoPeso = { primeiro: number; ultimo: number; diferenca: number };
export function variacaoPeso(serie: { peso: number | null }[]): VariacaoPeso | null {
  const pesos = serie.map((p) => p.peso).filter((p): p is number => p !== null && p !== undefined);
  if (!pesos.length) return null;
  const primeiro = pesos[0];
  const ultimo = pesos[pesos.length - 1];
  return { primeiro, ultimo, diferenca: arred(ultimo - primeiro, 1) };
}
/** '+1,5' · '−3,0' · '0,0' (1 casa). */
export const fmtVariacao = (n: number): string => (n > 0 ? `+${fmtNum(n, 1)}` : n < 0 ? `−${fmtNum(Math.abs(n), 1)}` : fmtNum(0, 1));

// ---- Água ----
export const AGUA_MAX = 30000;
export const AGUA_PASSO = 50;
export const AGUA_ATALHOS = [250, 500];
export type PontoAgua = { data: string; rotulo: string; ml: number };
/** 1 ponto por dia do intervalo (0 nos dias sem registro). */
export function serieAgua<T extends { data: string; agua_ml: number }>(registros: T[], de: string, ate: string): PontoAgua[] {
  const porDia = new Map<string, number>();
  for (const r of registros) porDia.set(r.data, (porDia.get(r.data) ?? 0) + (r.agua_ml || 0));
  return diasDoIntervalo(de, ate).map((d) => ({ data: d, rotulo: format(parseISO(d), "dd/MM"), ml: porDia.get(d) ?? 0 }));
}
/** Média (ml, inteiro) só dos dias com registro; 0 sem nenhum. */
export function mediaAgua(registros: { agua_ml: number }[]): number {
  if (!registros.length) return 0;
  return Math.round(registros.reduce((s, r) => s + (r.agua_ml || 0), 0) / registros.length);
}
/** '750 ml' · '1,5 L' (a partir de 1000 ml; até 2 casas, sem zeros à direita). */
export function fmtAgua(ml: number): string {
  const v = Math.max(0, Math.round(ml || 0));
  if (v < 1000) return `${v} ml`;
  const l = v / 1000;
  const s = Number.isInteger(l) ? String(l) : l.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${s.replace(".", ",")} L`;
}

// ---- Sintomas mais frequentes ----
export type SintomaFrequente = { chave: string; rotulo: string; n: number };
/** Contagem por sintoma nos registros (desc; empate alfabético pelo rótulo), top 5. */
export function sintomasFrequentes(registros: { sintomas: unknown }[], top = 5): SintomaFrequente[] {
  const cont = new Map<string, number>();
  for (const r of registros) for (const s of lerSintomas(r.sintomas)) cont.set(s, (cont.get(s) ?? 0) + 1);
  return [...cont.entries()]
    .map(([chave, n]) => ({ chave, rotulo: rotuloSintoma(chave), n }))
    .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .slice(0, top);
}

// ---- Registros do dia ----
export const OBSERVACAO_REGISTRO_MAX = 300;
export type FormRegistro = { data: string; agua_ml: string; sintomas: string[]; sintomaLivre: string; observacao: string };
export type RegistroParaBanco = { data: string; agua_ml: number; sintomas: string[]; observacao: string | null };
type RegistroLido = { data: string; agua_ml: number; sintomas: unknown; observacao: string | null };

export const formInicialRegistro = (hoje: string): FormRegistro => ({ data: hoje, agua_ml: "", sintomas: [], sintomaLivre: "", observacao: "" });
export const formDoRegistro = (r: RegistroLido): FormRegistro => ({
  data: r.data,
  agua_ml: r.agua_ml ? String(r.agua_ml) : "",
  sintomas: lerSintomas(r.sintomas),
  sintomaLivre: "",
  observacao: r.observacao ?? "",
});

const aguaDoForm = (s: string): number => (s.trim() === "" ? 0 : Number(s));

/** null = pode salvar; senão a mensagem. `hoje` por parâmetro (testável). */
export function validarRegistro(f: FormRegistro, hoje: string): string | null {
  if (!ehDataISO(f.data)) return "Escolha a data";
  if (f.data > hoje) return "A data não pode ser futura";
  const agua = aguaDoForm(f.agua_ml);
  if (!Number.isInteger(agua) || agua < 0 || agua > AGUA_MAX) return `Água em ml, número inteiro de 0 a ${AGUA_MAX}`;
  if (f.sintomas.length > SINTOMAS_MAX) return `No máximo ${SINTOMAS_MAX} sintomas`;
  if (f.observacao.length > OBSERVACAO_REGISTRO_MAX) return `Observação com até ${OBSERVACAO_REGISTRO_MAX} caracteres`;
  return null;
}
export function registroParaBanco(f: FormRegistro): RegistroParaBanco {
  const obs = f.observacao.trim().replace(/\s+/g, " ");
  return { data: f.data, agua_ml: Math.round(aguaDoForm(f.agua_ml)), sintomas: lerSintomas(f.sintomas), observacao: obs || null };
}
/** Botões rápidos do modal: soma ml ao valor atual (teto 30000). */
export const somarAgua = (atual: string, extra: number): string => String(Math.min(AGUA_MAX, Math.max(0, (Number(atual) || 0) + extra)));
/** Liga/desliga um sintoma na lista do form (respeita o máximo). */
export function alternarSintoma(lista: string[], chave: string): string[] {
  if (lista.includes(chave)) return lista.filter((s) => s !== chave);
  if (lista.length >= SINTOMAS_MAX) return lista;
  return [...lista, chave];
}
/** 'Outro sintoma' → normaliza e entra na lista (se bater com o catálogo, liga o chip do catálogo). chave null = nada entrou. */
export function adicionarSintomaLivre(lista: string[], texto: string): { lista: string[]; chave: string | null } {
  const chave = normalizarSintomaLivre(texto);
  if (!chave) return { lista, chave: null };
  if (lista.includes(chave)) return { lista, chave };
  if (lista.length >= SINTOMAS_MAX) return { lista, chave: null };
  return { lista: [...lista, chave], chave };
}

export const registroDoDia = <T extends { data: string }>(registros: T[], data: string): T | null => registros.find((r) => r.data === data) ?? null;
/** Dia mais recente primeiro (empate → criado por último primeiro). */
export const ordenarRegistros = <T extends { data: string; created_at: string }>(l: T[]): T[] =>
  [...l].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : instante(b.created_at) - instante(a.created_at)));
/** Entra/substitui na lista (mesmo id ou mesmo dia — o upsert devolve a linha viva do dia). */
export const inserirRegistro = <T extends { id: string; data: string; created_at: string }>(lista: T[], r: T): T[] =>
  ordenarRegistros([...lista.filter((x) => x.id !== r.id && x.data !== r.data), r]);
export function textoContagemRegistros(n: number): string {
  if (n === 0) return "Nenhum registro no período";
  if (n === 1) return "1 dia registrado";
  return `${n} dias registrados`;
}
export const formatarDataRegistro = (d: string): string => format(parseISO(d), "dd/MM/yyyy");
/** Linha da lista: '19/09/2026 · 1,5 L · Azia, Inchaço' (sem sintomas → 'sem sintomas'). */
export function textoRegistro(r: RegistroLido): string {
  const sintomas = lerSintomas(r.sintomas);
  return `${formatarDataRegistro(r.data)} · ${fmtAgua(r.agua_ml)} · ${sintomas.length ? textoSintomas(sintomas) : "sem sintomas"}`;
}
