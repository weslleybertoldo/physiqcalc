// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/metasUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";

// Regras PURAS da prescrição de metas (W16): dias da semana (ISO — 1 = segunda … 7 = domingo), atalhos, texto dos dias,
// normalização, validação, ordenação/filtro/contagem, 5 modelos padrão, modelos ★, formulário ⇄ registro e nome do PDF.
// Nada de rede aqui; testado no vitest. A tela e o acesso ficam em `pages/paciente/secoes/Metas.tsx`, `components/metas/*`
// e `lib/metas.ts`; o PDF em `lib/metasPdf.ts`. Mesmo desenho dos documentos (W15): o modelo é o ponto de partida e a meta
// prescrita guarda a PRÓPRIA cópia de título/descrição/dias (mudar o modelo depois não mexe nela).

export type DiaSemana = { n: number; curto: string; nome: string };
export const DIAS_SEMANA: DiaSemana[] = [
  { n: 1, curto: "Seg", nome: "Segunda-feira" },
  { n: 2, curto: "Ter", nome: "Terça-feira" },
  { n: 3, curto: "Qua", nome: "Quarta-feira" },
  { n: 4, curto: "Qui", nome: "Quinta-feira" },
  { n: 5, curto: "Sex", nome: "Sexta-feira" },
  { n: 6, curto: "Sáb", nome: "Sábado" },
  { n: 7, curto: "Dom", nome: "Domingo" },
];
export const TODOS_OS_DIAS: number[] = [1, 2, 3, 4, 5, 6, 7];
export const SEG_A_SEX: number[] = [1, 2, 3, 4, 5];
export const FIM_DE_SEMANA: number[] = [6, 7];

export type AtalhoDias = "todos" | "semana" | "fim";
export const ATALHOS_DIAS: { atalho: AtalhoDias; rotulo: string; dias: number[] }[] = [
  { atalho: "todos", rotulo: "Todos os dias", dias: TODOS_OS_DIAS },
  { atalho: "semana", rotulo: "Seg a Sex", dias: SEG_A_SEX },
  { atalho: "fim", rotulo: "Fim de semana", dias: FIM_DE_SEMANA },
];

export const TITULO_META_MIN = 2;
export const TITULO_META_MAX = 120;
export const DESCRICAO_META_MAX = 1000;

// ---- Dias da semana ----
/** Únicos, inteiros de 1 a 7, em ordem. Qualquer coisa que não seja lista vira []. */
export function normalizarDias(dias: unknown): number[] {
  const lista = Array.isArray(dias) ? dias : [];
  const vistos = new Set<number>();
  for (const d of lista) {
    const n = Math.trunc(Number(d));
    if (Number.isInteger(n) && n >= 1 && n <= 7) vistos.add(n);
  }
  return [...vistos].sort((a, b) => a - b);
}
export const mesmosDias = (a: unknown, b: unknown): boolean => normalizarDias(a).join(",") === normalizarDias(b).join(",");
export const diaInfo = (n: number): DiaSemana | undefined => DIAS_SEMANA.find((d) => d.n === n);
/** "1,3,5" — pro `data-meta-dias` da tela. */
export const diasParaAttr = (dias: unknown): string => normalizarDias(dias).join(",");
/** Liga/desliga um dia e devolve a lista normalizada. */
export const alternarDia = (dias: unknown, n: number): number[] => {
  const d = normalizarDias(dias);
  return d.includes(n) ? d.filter((x) => x !== n) : normalizarDias([...d, n]);
};
/** Atalho que bate exatamente com os dias (pra marcar o botão); nenhum → null. */
export const atalhoDosDias = (dias: unknown): AtalhoDias | null => ATALHOS_DIAS.find((a) => mesmosDias(a.dias, dias))?.atalho ?? null;

/** 'Todos os dias' / 'Seg a Sex' / 'Fim de semana' / 'Seg, Qua e Sex' / 'Ter' / nenhum → 'Nenhum dia'. */
export function textoDias(dias: unknown): string {
  const d = normalizarDias(dias);
  if (d.length === 0) return "Nenhum dia";
  const atalho = ATALHOS_DIAS.find((a) => mesmosDias(a.dias, d));
  if (atalho) return atalho.rotulo;
  const curtos = d.map((n) => diaInfo(n)?.curto ?? String(n));
  if (curtos.length === 1) return curtos[0];
  return `${curtos.slice(0, -1).join(", ")} e ${curtos[curtos.length - 1]}`;
}

// ---- Validação ----
const validarCampos = (titulo: string, descricao: string, dias: unknown, alvo: string): string | null => {
  const t = (titulo ?? "").trim();
  if (t.length < TITULO_META_MIN) return `Dê um título ${alvo} (pelo menos ${TITULO_META_MIN} letras)`;
  if (t.length > TITULO_META_MAX) return "Título muito longo";
  if ((descricao ?? "").length > DESCRICAO_META_MAX) return "Descrição muito longa";
  if (normalizarDias(dias).length === 0) return "Marque pelo menos 1 dia da semana";
  return null;
};
/** Erro da meta (título 2–120, descrição ≤ 1000, ≥ 1 dia) ou null. */
export const validarMeta = (titulo: string, descricao: string, dias: unknown): string | null => validarCampos(titulo, descricao, dias, "à meta");
/** Mesmas regras pro modelo. */
export const validarModeloMeta = (titulo: string, descricao: string, dias: unknown): string | null => validarCampos(titulo, descricao, dias, "ao modelo");

// ---- Ordenação, filtro, contagem ----
/** Ativas primeiro; dentro de cada grupo, a mais recente primeiro. */
export const ordenarMetas = <T extends { ativa: boolean; created_at: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.created_at.localeCompare(a.created_at));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirMeta = <T extends { id: string; ativa: boolean; created_at: string }>(lista: T[], m: T): T[] => ordenarMetas([...lista.filter((x) => x.id !== m.id), m]);
/** Sem "mostrar pausadas" só as ativas aparecem. */
export const filtrarMetas = <T extends { ativa: boolean }>(lista: T[], mostrarInativas: boolean): T[] => (mostrarInativas ? lista : lista.filter((m) => m.ativa));
export const contarAtivas = (lista: { ativa: boolean }[]): number => lista.filter((m) => m.ativa).length;
/** 'Nenhuma meta' / '1 meta · 1 ativa' / '3 metas · 2 ativas' / '2 metas · nenhuma ativa'. */
export function textoContagemMetas(total: number, ativas: number): string {
  if (total === 0) return "Nenhuma meta";
  const t = total === 1 ? "1 meta" : `${total} metas`;
  const a = ativas === 0 ? "nenhuma ativa" : ativas === 1 ? "1 ativa" : `${ativas} ativas`;
  return `${t} · ${a}`;
}
export const textoPausadas = (n: number): string => (n === 0 ? "nenhuma pausada" : n === 1 ? "1 pausada" : `${n} pausadas`);

// ---- Modelos padrão (texto próprio do PhysiqNutri, não copiado de nenhuma referência) ----
export type ModeloPadraoMeta = { titulo: string; descricao: string; dias_semana: number[] };
export const MODELOS_PADRAO: ModeloPadraoMeta[] = [
  {
    titulo: "Beber 2 litros de água",
    descricao: "Distribua ao longo do dia: um copo grande ao acordar, um em cada refeição e uma garrafa de 500 ml nos intervalos.",
    dias_semana: TODOS_OS_DIAS,
  },
  {
    titulo: "Caminhar 30 minutos",
    descricao: "Em ritmo confortável, de preferência ao ar livre. Pode dividir em duas caminhadas de 15 minutos.",
    dias_semana: [1, 3, 5],
  },
  {
    titulo: "Dormir de 7 a 8 horas",
    descricao: "Deite e levante em horários parecidos todos os dias e evite telas na última hora antes de dormir.",
    dias_semana: TODOS_OS_DIAS,
  },
  {
    titulo: "Comer 3 porções de frutas",
    descricao: "Uma porção é uma fruta média ou uma fatia grande. Varie as cores ao longo da semana.",
    dias_semana: TODOS_OS_DIAS,
  },
  {
    titulo: "Sem refrigerante e doces",
    descricao: "Troque por água com gás, chá sem açúcar e frutas. No fim de semana, com moderação.",
    dias_semana: SEG_A_SEX,
  },
];

// ---- Modelos ----
/** Favoritos primeiro; dentro de cada grupo, ordem alfabética do título. */
export const ordenarModelosMeta = <T extends { favorito: boolean; titulo: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, "pt-BR"));
/** Modelo pré-selecionado na meta nova: o 1º favorito (sem favorito, o 1º da lista); nenhum → null. */
export const modeloInicial = <T extends { favorito: boolean; titulo: string }>(lista: T[]): T | null => ordenarModelosMeta(lista)[0] ?? null;

// ---- Formulário ⇄ registro ----
/** O que a nutricionista preenche no modal da meta. `ativa` só aparece na edição; `salvarComoModelo` só na nova. */
export type FormMeta = { modeloId: string; titulo: string; descricao: string; dias: number[]; ativa: boolean; salvarComoModelo: boolean };
/** Colunas da meta que o formulário controla (paciente/nutricionista vêm do contexto). */
export type RegistroMeta = { modelo_id: string | null; titulo: string; descricao: string; dias_semana: number[]; ativa: boolean };
type ModeloBase = { id: string; titulo: string; descricao: string | null; dias_semana: number[] | null };

/** Quebras de linha normalizadas, espaços no fim das linhas e nas pontas fora. */
export const normalizarDescricao = (s: string | null | undefined): string =>
  (s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
export const normalizarTitulo = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ").slice(0, TITULO_META_MAX);

/** Meta nova: com modelo, copia título/descrição/dias; em branco, todos os dias. Sempre ativa. */
export function formInicialMeta(modelo: ModeloBase | null | undefined): FormMeta {
  return {
    modeloId: modelo?.id ?? "",
    titulo: modelo?.titulo ?? "",
    descricao: modelo?.descricao ?? "",
    dias: modelo ? normalizarDias(modelo.dias_semana) : [...TODOS_OS_DIAS],
    ativa: true,
    salvarComoModelo: false,
  };
}
/** Edição: o que está gravado na meta. */
export function metaParaForm(meta: { titulo: string; descricao: string | null; dias_semana: number[] | null; ativa: boolean }): FormMeta {
  return { modeloId: "", titulo: meta.titulo, descricao: meta.descricao ?? "", dias: normalizarDias(meta.dias_semana), ativa: !!meta.ativa, salvarComoModelo: false };
}
export function formParaRegistroMeta(f: FormMeta): RegistroMeta {
  return {
    modelo_id: f.modeloId || null,
    titulo: normalizarTitulo(f.titulo),
    descricao: normalizarDescricao(f.descricao).slice(0, DESCRICAO_META_MAX),
    dias_semana: normalizarDias(f.dias),
    ativa: !!f.ativa,
  };
}

// ---- Datas ----
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" (parseISO — `new Date` deslocaria o dia pelo fuso). */
export const formatarDataMeta = (data: string | null | undefined): string => {
  const d = parseISO(data ?? "");
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
};
/** "desde 19/09/2026" (vazio sem data válida). */
export const textoInicio = (inicio: string | null | undefined): string => {
  const d = parseISO(inicio ?? "");
  return isValid(d) ? `desde ${format(d, "dd/MM/yyyy")}` : "";
};

// ---- Nome do PDF ----
/** `metas-<paciente sem acento>-<yyyyMMdd>.pdf` */
export function nomeArquivoPDFMetas(paciente: string, hoje: Date = new Date()): string {
  const s = semAcento(paciente ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "paciente";
  return `metas-${s}-${format(hoje, "yyyyMMdd")}.pdf`;
}
