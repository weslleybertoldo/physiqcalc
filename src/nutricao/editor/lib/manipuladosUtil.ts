// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/manipuladosUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";

// Regras PURAS da prescrição de manipulados (W17): ativos {ativo, dose, unidade} guardados em jsonb (leitura tolerante),
// normalização, validação, ordenação/contagem, 3 modelos padrão, modelos ★, formulário ⇄ registro, datas e nomes dos PDFs.
// Nada de rede aqui; testado no vitest. A tela e o acesso ficam em `pages/paciente/secoes/Manipulados.tsx`,
// `components/manipulados/*` e `lib/manipulados.ts`; o PDF em `lib/manipuladosPdf.ts`. Mesmo desenho das metas (W16): o
// modelo é o ponto de partida e a fórmula prescrita guarda a PRÓPRIA cópia (mudar o modelo depois não mexe nela).

export const UNIDADES = ["mg", "g", "mcg", "UI", "mL", "%"] as const;
export type Unidade = (typeof UNIDADES)[number];
export type Ativo = { ativo: string; dose: string; unidade: string };

export const TITULO_FORMULA_MIN = 2;
export const TITULO_FORMULA_MAX = 120;
export const ATIVO_NOME_MAX = 120;
export const DOSE_MAX = 40;
export const POSOLOGIA_MAX = 500;
export const QUANTIDADE_MAX = 80;
export const OBSERVACAO_FORMULA_MAX = 1000;
export const ATIVOS_MAX = 30;
export const UNIDADE_PADRAO: Unidade = "mg";

export const ehUnidade = (u: unknown): u is Unidade => typeof u === "string" && (UNIDADES as readonly string[]).includes(u);
export const ativoVazio = (): Ativo => ({ ativo: "", dose: "", unidade: UNIDADE_PADRAO });

/** Texto de 1 linha: espaços repetidos viram 1, pontas fora; número vira texto; nulo vira "". */
const texto1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();

// ---- Ativos ----
/** Lê o jsonb com tolerância: só objetos contam; nome/dose viram texto de 1 linha; unidade fora da lista vira "mg". Lixo → []. */
export function lerAtivos(v: unknown): Ativo[] {
  if (!Array.isArray(v)) return [];
  const lista: Ativo[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    lista.push({ ativo: texto1(o.ativo), dose: texto1(o.dose), unidade: ehUnidade(o.unidade) ? o.unidade : UNIDADE_PADRAO });
  }
  return lista;
}
/** Pra gravar: linha sem nome cai, nome/dose no tamanho máximo, no máximo 30 ativos. */
export function normalizarAtivos(lista: unknown): Ativo[] {
  return lerAtivos(lista)
    .filter((a) => a.ativo.length > 0)
    .slice(0, ATIVOS_MAX)
    .map((a) => ({ ativo: a.ativo.slice(0, ATIVO_NOME_MAX), dose: a.dose.slice(0, DOSE_MAX), unidade: a.unidade }));
}
export const contarAtivos = (lista: unknown): number => normalizarAtivos(lista).length;
/** 'Nenhum ativo' / '1 ativo' / '3 ativos'. */
export const textoContagemAtivos = (n: number): string => (n === 0 ? "Nenhum ativo" : n === 1 ? "1 ativo" : `${n} ativos`);
/** '300 mg' · '5%' · sem dose: ''. */
export function textoDose(a: Ativo): string {
  const dose = texto1(a.dose);
  if (!dose) return "";
  const un = ehUnidade(a.unidade) ? a.unidade : UNIDADE_PADRAO;
  return un === "%" ? `${dose}%` : `${dose} ${un}`;
}
/** 'Magnésio dimalato 300 mg' · 'Vitamina C 5%' · sem dose: só o nome. */
export function textoAtivo(a: Ativo): string {
  const nome = texto1(a.ativo);
  const dose = textoDose(a);
  return dose ? `${nome} ${dose}` : nome;
}
/** Ativos com nome, juntos com ' · '. */
export const textoAtivos = (lista: unknown): string => normalizarAtivos(lista).map(textoAtivo).join(" · ");

// ---- Editor de ativos (linhas dinâmicas do modal) ----
/** Acrescenta 1 linha vazia (até 30). */
export const adicionarAtivo = (lista: Ativo[]): Ativo[] => (lista.length >= ATIVOS_MAX ? lista : [...lista, ativoVazio()]);
/** Mexe numa linha sem tocar nas outras. */
export const atualizarAtivo = (lista: Ativo[], i: number, patch: Partial<Ativo>): Ativo[] => lista.map((a, k) => (k === i ? { ...a, ...patch } : a));
/** Tira uma linha; o editor nunca fica sem linha (sobra 1 vazia). */
export const removerAtivo = (lista: Ativo[], i: number): Ativo[] => {
  const resto = lista.filter((_, k) => k !== i);
  return resto.length ? resto : [ativoVazio()];
};

// ---- Validação ----
const validarCampos = (titulo: string, ativos: unknown, posologia: string, quantidade: string, observacao: string, alvo: string): string | null => {
  const t = (titulo ?? "").trim();
  if (t.length < TITULO_FORMULA_MIN) return `Dê um título ${alvo} (pelo menos ${TITULO_FORMULA_MIN} letras)`;
  if (t.length > TITULO_FORMULA_MAX) return "Título muito longo";
  const comNome = lerAtivos(ativos).filter((a) => a.ativo.length > 0);
  if (comNome.length === 0) return "Informe pelo menos 1 ativo com nome";
  if (comNome.length > ATIVOS_MAX) return `No máximo ${ATIVOS_MAX} ativos`;
  if (comNome.some((a) => a.ativo.length > ATIVO_NOME_MAX)) return "Nome do ativo muito longo";
  if (comNome.some((a) => a.dose.length > DOSE_MAX)) return "Dose muito longa";
  if ((posologia ?? "").length > POSOLOGIA_MAX) return "Posologia muito longa";
  if ((quantidade ?? "").length > QUANTIDADE_MAX) return "Quantidade muito longa";
  if ((observacao ?? "").length > OBSERVACAO_FORMULA_MAX) return "Observação muito longa";
  return null;
};
/** Erro da fórmula (título 2–120, ≥ 1 ativo com nome, dose ≤ 40, posologia ≤ 500, quantidade ≤ 80, observação ≤ 1000) ou null. */
export const validarFormula = (titulo: string, ativos: unknown, posologia: string, quantidade: string, observacao: string): string | null =>
  validarCampos(titulo, ativos, posologia, quantidade, observacao, "à fórmula");
/** Mesmas regras pro modelo. */
export const validarModeloFormula = (titulo: string, ativos: unknown, posologia: string, quantidade: string, observacao: string): string | null =>
  validarCampos(titulo, ativos, posologia, quantidade, observacao, "ao modelo");

// ---- Ordenação e contagem ----
/** Prescrição mais recente primeiro (prescrita_em desc); empate → a criada por último primeiro. */
export const ordenarFormulas = <T extends { prescrita_em: string; created_at: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => b.prescrita_em.localeCompare(a.prescrita_em) || b.created_at.localeCompare(a.created_at));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirFormula = <T extends { id: string; prescrita_em: string; created_at: string }>(lista: T[], f: T): T[] =>
  ordenarFormulas([...lista.filter((x) => x.id !== f.id), f]);
/** 'Nenhuma fórmula' / '1 fórmula' / '3 fórmulas'. */
export const textoContagemFormulas = (n: number): string => (n === 0 ? "Nenhuma fórmula" : n === 1 ? "1 fórmula" : `${n} fórmulas`);

// ---- Modelos padrão (texto próprio do PhysiqNutri, não copiado de nenhuma referência) ----
export type ModeloPadraoFormula = { titulo: string; ativos: Ativo[]; posologia: string; quantidade: string; observacao: string };
export const MODELOS_PADRAO: ModeloPadraoFormula[] = [
  {
    titulo: "Magnésio + vitamina B6",
    ativos: [
      { ativo: "Magnésio dimalato", dose: "300", unidade: "mg" },
      { ativo: "Piridoxina (B6)", dose: "50", unidade: "mg" },
    ],
    posologia: "Tomar 1 cápsula à noite",
    quantidade: "30 cápsulas",
    observacao: "",
  },
  {
    titulo: "Vitamina D3 2000 UI",
    ativos: [{ ativo: "Colecalciferol", dose: "2000", unidade: "UI" }],
    posologia: "Tomar 1 cápsula ao dia, junto com uma refeição com gordura",
    quantidade: "60 cápsulas",
    observacao: "",
  },
  {
    titulo: "Ômega 3 concentrado",
    ativos: [
      { ativo: "EPA", dose: "600", unidade: "mg" },
      { ativo: "DHA", dose: "400", unidade: "mg" },
    ],
    posologia: "Tomar 1 cápsula 2x ao dia, após o almoço e o jantar",
    quantidade: "60 cápsulas",
    observacao: "",
  },
];

// ---- Modelos ----
/** Favoritos primeiro; dentro de cada grupo, ordem alfabética do título. */
export const ordenarModelosFormula = <T extends { favorito: boolean; titulo: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, "pt-BR"));
/** Modelo pré-selecionado na fórmula nova: o 1º favorito (sem favorito, o 1º da lista); nenhum → null. */
export const modeloInicial = <T extends { favorito: boolean; titulo: string }>(lista: T[]): T | null => ordenarModelosFormula(lista)[0] ?? null;

// ---- Formulário ⇄ registro ----
/** O que a nutricionista preenche no modal da fórmula. `salvarComoModelo` só na nova. */
export type FormFormula = { modeloId: string; titulo: string; ativos: Ativo[]; posologia: string; quantidade: string; observacao: string; salvarComoModelo: boolean };
/** Colunas da fórmula que o formulário controla (paciente/nutricionista/data vêm do contexto). */
export type RegistroFormula = { modelo_id: string | null; titulo: string; ativos: Ativo[]; posologia: string; quantidade: string; observacao: string };
type ModeloBase = { id: string; titulo: string; ativos: unknown; posologia: string | null; quantidade: string | null; observacao: string | null };

/** Quebras de linha normalizadas, espaços no fim das linhas e nas pontas fora. */
export const normalizarTexto = (s: string | null | undefined): string =>
  (s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
export const normalizarTitulo = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ").slice(0, TITULO_FORMULA_MAX);
/** Quantidade em 1 linha ("30 cápsulas"). */
export const normalizarQuantidade = (s: string | null | undefined): string => texto1(s).slice(0, QUANTIDADE_MAX);

/** Fórmula nova: com modelo, copia tudo; em branco, 1 linha de ativo vazia. */
export function formInicialFormula(modelo: ModeloBase | null | undefined): FormFormula {
  const ativos = modelo ? lerAtivos(modelo.ativos) : [];
  return {
    modeloId: modelo?.id ?? "",
    titulo: modelo?.titulo ?? "",
    ativos: ativos.length ? ativos : [ativoVazio()],
    posologia: modelo?.posologia ?? "",
    quantidade: modelo?.quantidade ?? "",
    observacao: modelo?.observacao ?? "",
    salvarComoModelo: false,
  };
}
/** Edição: o que está gravado na fórmula. */
export function formulaParaForm(f: { titulo: string; ativos: unknown; posologia: string | null; quantidade: string | null; observacao: string | null }): FormFormula {
  const ativos = lerAtivos(f.ativos);
  return {
    modeloId: "",
    titulo: f.titulo,
    ativos: ativos.length ? ativos : [ativoVazio()],
    posologia: f.posologia ?? "",
    quantidade: f.quantidade ?? "",
    observacao: f.observacao ?? "",
    salvarComoModelo: false,
  };
}
export function formParaRegistroFormula(f: FormFormula): RegistroFormula {
  return {
    modelo_id: f.modeloId || null,
    titulo: normalizarTitulo(f.titulo),
    ativos: normalizarAtivos(f.ativos),
    posologia: normalizarTexto(f.posologia).slice(0, POSOLOGIA_MAX),
    quantidade: normalizarQuantidade(f.quantidade),
    observacao: normalizarTexto(f.observacao).slice(0, OBSERVACAO_FORMULA_MAX),
  };
}

// ---- Datas ----
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" (parseISO — `new Date` deslocaria o dia pelo fuso). */
export const formatarDataFormula = (data: string | null | undefined): string => {
  const d = parseISO(data ?? "");
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
};
/** "Prescrito em 19/09/2026". */
export const textoPrescritaEm = (data: string | null | undefined): string => `Prescrito em ${formatarDataFormula(data)}`;

// ---- Nomes dos PDFs ----
const slug = (s: string, max: number, padrao: string): string =>
  semAcento(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || padrao;
const carimbo = (data: string | Date): string => {
  const d = typeof data === "string" ? parseISO(data) : data;
  return format(isValid(d) ? d : new Date(), "yyyyMMdd");
};
/** `formula-<paciente>-<título sem acento>-<yyyyMMdd>.pdf` (data = `prescrita_em`). */
export const nomeArquivoPDFFormula = (paciente: string, titulo: string, data: string | Date): string =>
  `formula-${slug(paciente, 40, "paciente")}-${slug(titulo, 40, "formula")}-${carimbo(data)}.pdf`;
/** `formulas-<paciente>-<yyyyMMdd>.pdf` (PDF global, data de hoje). */
export const nomeArquivoPDFFormulas = (paciente: string, hoje: Date = new Date()): string => `formulas-${slug(paciente, 40, "paciente")}-${format(hoje, "yyyyMMdd")}.pdf`;
