// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/examesUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";

// Regras PURAS dos exames laboratoriais (W18): catálogo (12 exames padrão de texto próprio), números pt-BR, situação do
// resultado frente à referência, agrupamento por data, pedidos (lista de nomes), validação, formulário ⇄ registro, datas
// e nome do PDF. Nada de rede aqui; testado no vitest. Tela/acesso/PDF em `pages/paciente/secoes/Exames.tsx`,
// `components/exames/*`, `lib/exames.ts` e `lib/examesPdf.ts`. O pedido e o resultado guardam a PRÓPRIA cópia do que
// vem do catálogo (nome, unidade, referência) — mudar o catálogo depois não mexe no histórico (padrão das W15–W17).

export const NOME_EXAME_MAX = 120;
export const UNIDADE_MAX = 20;
export const VALOR_TEXTO_MAX = 80;
export const REFERENCIA_TEXTO_MAX = 80;
export const OBSERVACAO_EXAME_MAX = 1000;
export const EXAMES_POR_PEDIDO_MAX = 60;
export const LINHAS_RESULTADO_MAX = 60;
/** Valor do select do editor quando o exame não está no catálogo ("Outro…"). */
export const OUTRO_EXAME = "__outro__";

export type Situacao = "abaixo" | "normal" | "acima" | "sem_referencia";
export const SITUACOES: Situacao[] = ["abaixo", "normal", "acima", "sem_referencia"];

/** Texto de 1 linha: espaços repetidos viram 1, pontas fora; número vira texto; nulo vira "". */
const texto1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const ehNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ---- Números pt-BR ----
/** '5,6' → 5.6 · '110' → 110 · ' 0.4 ' → 0.4 · número já pronto passa; lixo ('abc', '1,2,3', '') → null. */
export function normalizarNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = texto1(v).replace(",", ".");
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Número em pt-BR com vírgula, até 2 casas (110 → '110'; 5.6 → '5,6'; 12.345 → '12,35'); nulo → '—'. */
export function formatarValor(n: number | null | undefined): string {
  if (!ehNum(n)) return "—";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

// ---- Situação e referência ----
/** Compara o valor com a faixa: abaixo de ref_min, acima de ref_max, senão normal; sem valor ou sem faixa → sem_referencia. */
export function situacaoResultado(valor: number | null | undefined, refMin: number | null | undefined, refMax: number | null | undefined): Situacao {
  if (!ehNum(valor)) return "sem_referencia";
  const temMin = ehNum(refMin);
  const temMax = ehNum(refMax);
  if (!temMin && !temMax) return "sem_referencia";
  if (temMin && valor < refMin) return "abaixo";
  if (temMax && valor > refMax) return "acima";
  return "normal";
}
const TEXTO_SITUACAO: Record<Situacao, string> = {
  abaixo: "Abaixo da referência",
  normal: "Dentro da referência",
  acima: "Acima da referência",
  sem_referencia: "Sem referência",
};
const TEXTO_SITUACAO_CURTO: Record<Situacao, string> = { abaixo: "Abaixo", normal: "Normal", acima: "Acima", sem_referencia: "Sem ref." };
export const textoSituacao = (s: Situacao): string => TEXTO_SITUACAO[s] ?? TEXTO_SITUACAO.sem_referencia;
export const textoSituacaoCurto = (s: Situacao): string => TEXTO_SITUACAO_CURTO[s] ?? TEXTO_SITUACAO_CURTO.sem_referencia;
/** '70–99' · '≤ 5,6' · '≥ 40' · 'negativo' (texto) · '—' (nada). */
export function textoReferencia(refMin: number | null | undefined, refMax: number | null | undefined, referenciaTexto: string | null | undefined): string {
  const temMin = ehNum(refMin);
  const temMax = ehNum(refMax);
  if (temMin && temMax) return `${formatarValor(refMin)}–${formatarValor(refMax)}`;
  if (temMax) return `≤ ${formatarValor(refMax)}`;
  if (temMin) return `≥ ${formatarValor(refMin)}`;
  return texto1(referenciaTexto) || "—";
}
/** Valor pra mostrar: número pt-BR ou o texto ('negativo'); nada → '—'. */
export function textoValor(valor: number | null | undefined, valorTexto: string | null | undefined): string {
  if (ehNum(valor)) return formatarValor(valor);
  return texto1(valorTexto) || "—";
}
/** Situação de um resultado gravado (valor em texto → sem referência). */
export const situacaoDoResultado = (r: { valor: number | null; ref_min: number | null; ref_max: number | null }): Situacao => situacaoResultado(r.valor, r.ref_min, r.ref_max);

// ---- Catálogo padrão (texto próprio do PhysiqNutri; faixas usuais de laboratório, editáveis por ela) ----
export type ExamePadrao = { nome: string; unidade: string; ref_min: number | null; ref_max: number | null; referencia_texto: string };
export const CATALOGO_PADRAO: ExamePadrao[] = [
  { nome: "Glicemia de jejum", unidade: "mg/dL", ref_min: 70, ref_max: 99, referencia_texto: "" },
  { nome: "Hemoglobina glicada", unidade: "%", ref_min: null, ref_max: 5.6, referencia_texto: "" },
  { nome: "Colesterol total", unidade: "mg/dL", ref_min: null, ref_max: 190, referencia_texto: "" },
  { nome: "HDL", unidade: "mg/dL", ref_min: 40, ref_max: null, referencia_texto: "" },
  { nome: "LDL", unidade: "mg/dL", ref_min: null, ref_max: 130, referencia_texto: "" },
  { nome: "Triglicerídeos", unidade: "mg/dL", ref_min: null, ref_max: 150, referencia_texto: "" },
  { nome: "TSH", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "" },
  { nome: "Vitamina D (25-OH)", unidade: "ng/mL", ref_min: 30, ref_max: 100, referencia_texto: "" },
  { nome: "Vitamina B12", unidade: "pg/mL", ref_min: 200, ref_max: 900, referencia_texto: "" },
  { nome: "Ferritina", unidade: "ng/mL", ref_min: 30, ref_max: 300, referencia_texto: "" },
  { nome: "Hemoglobina", unidade: "g/dL", ref_min: 12, ref_max: 16, referencia_texto: "" },
  { nome: "Creatinina", unidade: "mg/dL", ref_min: 0.6, ref_max: 1.2, referencia_texto: "" },
];
/** Favoritos primeiro; dentro de cada grupo, ordem alfabética do nome. */
export const ordenarCatalogo = <T extends { favorito: boolean; nome: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nome.localeCompare(b.nome, "pt-BR"));
export const normalizarNome = (s: unknown): string => texto1(s).slice(0, NOME_EXAME_MAX);
export const normalizarUnidade = (s: unknown): string => texto1(s).slice(0, UNIDADE_MAX);
/** Quebras de linha normalizadas, espaços no fim das linhas e nas pontas fora. */
export const normalizarTexto = (s: string | null | undefined): string =>
  (s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

// ---- Exames do pedido (lista de nomes) ----
/** Lê o text[] com tolerância: só textos não vazios contam. Lixo → []. */
export const lerExames = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map(texto1).filter(Boolean) : []);
const chave = (s: string): string => semAcento(s).toLowerCase();
/** Pra gravar: 1 linha cada, sem repetição (sem caixa/acento), no máximo 60. */
export function normalizarExames(lista: unknown): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const nome of lerExames(lista)) {
    const n = nome.slice(0, NOME_EXAME_MAX);
    const k = chave(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(n);
    if (saida.length >= EXAMES_POR_PEDIDO_MAX) break;
  }
  return saida;
}
export const temExame = (lista: string[], nome: string): boolean => lista.some((x) => chave(x) === chave(texto1(nome)));
/** Liga/desliga um exame na lista do pedido (mantém a ordem de escolha). */
export const alternarExame = (lista: string[], nome: string): string[] => (temExame(lista, nome) ? tirarExame(lista, nome) : normalizarExames([...lista, nome]));
export const acrescentarExame = (lista: string[], nome: string): string[] => normalizarExames([...lista, nome]);
export const tirarExame = (lista: string[], nome: string): string[] => lista.filter((x) => chave(x) !== chave(texto1(nome)));
/** 'Nenhum exame' / '1 exame' / '3 exames'. */
export const textoContagemExames = (n: number): string => (n === 0 ? "Nenhum exame" : n === 1 ? "1 exame" : `${n} exames`);

// ---- Pedidos ----
/** Pedido mais recente primeiro (data desc); empate → o criado por último primeiro. */
export const ordenarPedidos = <T extends { data: string; created_at: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirPedido = <T extends { id: string; data: string; created_at: string }>(lista: T[], p: T): T[] => ordenarPedidos([...lista.filter((x) => x.id !== p.id), p]);
/** 'Nenhum pedido' / '1 pedido' / '3 pedidos'. */
export const textoContagemPedidos = (n: number): string => (n === 0 ? "Nenhum pedido" : n === 1 ? "1 pedido" : `${n} pedidos`);

// ---- Resultados ----
export type GrupoData<T> = { data: string; itens: T[] };
/** Grupos por `data`, mais recente primeiro; dentro do grupo, ordem alfabética do exame (empate → criado por último primeiro). */
export function agruparResultadosPorData<T extends { data: string; exame: string; created_at: string }>(lista: T[]): GrupoData<T>[] {
  const mapa = new Map<string, T[]>();
  for (const r of lista) {
    const itens = mapa.get(r.data) ?? [];
    itens.push(r);
    mapa.set(r.data, itens);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, itens]) => ({ data, itens: [...itens].sort((a, b) => a.exame.localeCompare(b.exame, "pt-BR") || b.created_at.localeCompare(a.created_at)) }));
}
/** Filtro por exame ('' = todos); compara sem caixa/acento. */
export const filtrarPorExame = <T extends { exame: string }>(lista: T[], exame: string): T[] => {
  const k = chave(texto1(exame));
  return k ? lista.filter((r) => chave(r.exame) === k) : lista;
};
/** Nomes que já têm resultado (únicos, alfabéticos) — opções do filtro. */
export function nomesComResultado<T extends { exame: string }>(lista: T[]): string[] {
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const r of lista) {
    const k = chave(r.exame);
    if (vistos.has(k)) continue;
    vistos.add(k);
    nomes.push(r.exame);
  }
  return nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
}
/** Substitui (pelo id) ou acrescenta cada um dos novos. */
export const inserirResultados = <T extends { id: string }>(lista: T[], novos: T[]): T[] => {
  const ids = new Set(novos.map((n) => n.id));
  return [...lista.filter((x) => !ids.has(x.id)), ...novos];
};
/** 'Nenhum resultado' / '1 resultado' / '3 resultados'. */
export const textoContagemResultados = (n: number): string => (n === 0 ? "Nenhum resultado" : n === 1 ? "1 resultado" : `${n} resultados`);
/** Quantos resultados estão fora da referência (abaixo ou acima). */
export const contarForaDaReferencia = <T extends { valor: number | null; ref_min: number | null; ref_max: number | null }>(lista: T[]): number =>
  lista.filter((r) => {
    const s = situacaoDoResultado(r);
    return s === "abaixo" || s === "acima";
  }).length;

// ---- Datas ----
export const dataValida = (s: string | null | undefined): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") && isValid(parseISO(s ?? ""));
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" (parseISO — `new Date` deslocaria o dia pelo fuso). */
export const formatarDataExame = (data: string | null | undefined): string => {
  const d = parseISO(data ?? "");
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
};
export const hojeISO = (d: Date = new Date()): string => format(d, "yyyy-MM-dd");
/** "19/09/2026 · 3 exames" (linha do pedido e título do grupo de resultados). */
export const textoResumoData = (data: string, n: number): string => `${formatarDataExame(data)} · ${textoContagemExames(n)}`;

// ---- Validação ----
/** Erro do pedido (data válida, 1–60 exames com nome de até 120, observação ≤ 1000) ou null. */
export function validarPedido(data: string, exames: unknown, observacao: string): string | null {
  if (!dataValida(data)) return "Informe a data do pedido";
  const lista = lerExames(exames);
  if (lista.length === 0) return "Escolha pelo menos 1 exame";
  if (lista.length > EXAMES_POR_PEDIDO_MAX) return `No máximo ${EXAMES_POR_PEDIDO_MAX} exames por pedido`;
  if (lista.some((e) => e.length > NOME_EXAME_MAX)) return "Nome de exame muito longo";
  if ((observacao ?? "").length > OBSERVACAO_EXAME_MAX) return "Observação muito longa";
  return null;
}
/** Erro de 1 linha de resultado (exame 1–120; valor = número com vírgula/ponto OU texto ≤ 80; unidade ≤ 20) ou null. */
export function validarLinhaResultado(exame: string, valor: string, unidade: string): string | null {
  const nome = texto1(exame);
  if (!nome) return "Escolha o exame";
  if (nome.length > NOME_EXAME_MAX) return "Nome do exame muito longo";
  const v = texto1(valor);
  if (!v) return "Informe o valor (número ou texto, ex.: 5,6 ou negativo)";
  if (normalizarNumero(v) === null && v.length > VALOR_TEXTO_MAX) return "Valor muito longo";
  if (texto1(unidade).length > UNIDADE_MAX) return "Unidade muito longa";
  return null;
}
/** Erro do exame do catálogo (nome 1–120, unidade ≤ 20, referências numéricas válidas com mín ≤ máx, texto ≤ 80) ou null. */
export function validarExameCatalogo(nome: string, unidade: string, refMin: string, refMax: string, referenciaTexto: string): string | null {
  const n = texto1(nome);
  if (!n) return "Dê um nome ao exame";
  if (n.length > NOME_EXAME_MAX) return "Nome muito longo";
  if (texto1(unidade).length > UNIDADE_MAX) return "Unidade muito longa";
  const min = texto1(refMin);
  const max = texto1(refMax);
  const nMin = normalizarNumero(min);
  const nMax = normalizarNumero(max);
  if (min && nMin === null) return "Referência mínima inválida (use números, ex.: 0,4)";
  if (max && nMax === null) return "Referência máxima inválida (use números, ex.: 4)";
  if (nMin !== null && nMax !== null && nMin > nMax) return "A referência mínima não pode passar da máxima";
  if (texto1(referenciaTexto).length > REFERENCIA_TEXTO_MAX) return "Texto da referência muito longo";
  return null;
}

// ---- Formulário ⇄ registro: pedido ----
export type FormPedido = { data: string; exames: string[]; observacao: string };
export type RegistroPedido = { data: string; exames: string[]; observacao: string };
export const formInicialPedido = (hoje: Date = new Date()): FormPedido => ({ data: hojeISO(hoje), exames: [], observacao: "" });
export const pedidoParaForm = (p: { data: string; exames: unknown; observacao: string | null }): FormPedido => ({ data: p.data, exames: lerExames(p.exames), observacao: p.observacao ?? "" });
export const formParaRegistroPedido = (f: FormPedido): RegistroPedido => ({
  data: f.data,
  exames: normalizarExames(f.exames),
  observacao: normalizarTexto(f.observacao).slice(0, OBSERVACAO_EXAME_MAX),
});

// ---- Formulário ⇄ registro: resultado (linha do editor) ----
/** `outro` = ela escolheu "Outro…" no select (o nome vai num input livre); não vai pro banco. */
export type FormLinhaResultado = { exame: string; valor: string; unidade: string; refMin: number | null; refMax: number | null; referenciaTexto: string; outro?: boolean };
export type RegistroResultado = { exame: string; valor: number | null; valor_texto: string; unidade: string; ref_min: number | null; ref_max: number | null; referencia_texto: string };
type ItemCatalogo = { nome: string; unidade: string | null; ref_min: number | null; ref_max: number | null; referencia_texto: string | null };
export const linhaVazia = (): FormLinhaResultado => ({ exame: "", valor: "", unidade: "", refMin: null, refMax: null, referenciaTexto: "" });
/** Linha preenchida pelo catálogo (unidade e referência copiadas; o valor fica pra ela digitar). */
export const linhaDoCatalogo = (item: ItemCatalogo, valor = ""): FormLinhaResultado => ({
  exame: item.nome,
  valor,
  unidade: item.unidade ?? "",
  refMin: ehNum(item.ref_min) ? item.ref_min : null,
  refMax: ehNum(item.ref_max) ? item.ref_max : null,
  referenciaTexto: item.referencia_texto ?? "",
});
/** Acrescenta 1 linha vazia (até 60). */
export const adicionarLinha = (lista: FormLinhaResultado[]): FormLinhaResultado[] => (lista.length >= LINHAS_RESULTADO_MAX ? lista : [...lista, linhaVazia()]);
/** Mexe numa linha sem tocar nas outras. */
export const atualizarLinha = (lista: FormLinhaResultado[], i: number, patch: Partial<FormLinhaResultado>): FormLinhaResultado[] => lista.map((l, k) => (k === i ? { ...l, ...patch } : l));
/** Tira uma linha; o editor nunca fica sem linha (sobra 1 vazia). */
export const removerLinha = (lista: FormLinhaResultado[], i: number): FormLinhaResultado[] => {
  const resto = lista.filter((_, k) => k !== i);
  return resto.length ? resto : [linhaVazia()];
};
/** Número → `valor`; texto → `valor_texto` (um dos dois). */
export function formParaRegistroResultado(l: FormLinhaResultado): RegistroResultado {
  const n = normalizarNumero(l.valor);
  return {
    exame: normalizarNome(l.exame),
    valor: n,
    valor_texto: n === null ? texto1(l.valor).slice(0, VALOR_TEXTO_MAX) : "",
    unidade: normalizarUnidade(l.unidade),
    ref_min: ehNum(l.refMin) ? l.refMin : null,
    ref_max: ehNum(l.refMax) ? l.refMax : null,
    referencia_texto: texto1(l.referenciaTexto).slice(0, REFERENCIA_TEXTO_MAX),
  };
}
/** Edição: o que está gravado no resultado. */
export const resultadoParaForm = (r: { exame: string; valor: number | null; valor_texto: string | null; unidade: string | null; ref_min: number | null; ref_max: number | null; referencia_texto: string | null }): FormLinhaResultado => ({
  exame: r.exame,
  valor: ehNum(r.valor) ? formatarValor(r.valor) : (r.valor_texto ?? ""),
  unidade: r.unidade ?? "",
  refMin: ehNum(r.ref_min) ? r.ref_min : null,
  refMax: ehNum(r.ref_max) ? r.ref_max : null,
  referenciaTexto: r.referencia_texto ?? "",
});
/** Prévia da situação enquanto digita (texto → sem referência). */
export const situacaoDaLinha = (l: FormLinhaResultado): Situacao => situacaoResultado(normalizarNumero(l.valor), l.refMin, l.refMax);
/** Valor do select do editor: o nome (quando está no catálogo) ou "Outro…". */
export const opcaoDoSelect = (exame: string, catalogo: { nome: string }[]): string => (exame && catalogo.some((c) => c.nome === exame) ? exame : OUTRO_EXAME);

// ---- Formulário ⇄ registro: exame do catálogo ----
export type FormExameCatalogo = { nome: string; unidade: string; refMin: string; refMax: string; referenciaTexto: string; favorito: boolean };
export type RegistroExameCatalogo = { nome: string; unidade: string; ref_min: number | null; ref_max: number | null; referencia_texto: string; favorito: boolean };
export const formExameVazio = (): FormExameCatalogo => ({ nome: "", unidade: "", refMin: "", refMax: "", referenciaTexto: "", favorito: false });
export const exameCatalogoParaForm = (e: ItemCatalogo & { favorito: boolean }): FormExameCatalogo => ({
  nome: e.nome,
  unidade: e.unidade ?? "",
  refMin: ehNum(e.ref_min) ? formatarValor(e.ref_min) : "",
  refMax: ehNum(e.ref_max) ? formatarValor(e.ref_max) : "",
  referenciaTexto: e.referencia_texto ?? "",
  favorito: !!e.favorito,
});
export const formParaRegistroExameCatalogo = (f: FormExameCatalogo): RegistroExameCatalogo => ({
  nome: normalizarNome(f.nome),
  unidade: normalizarUnidade(f.unidade),
  ref_min: normalizarNumero(f.refMin),
  ref_max: normalizarNumero(f.refMax),
  referencia_texto: texto1(f.referenciaTexto).slice(0, REFERENCIA_TEXTO_MAX),
  favorito: !!f.favorito,
});

// ---- Nome do PDF ----
const slug = (s: string, max: number, padrao: string): string =>
  semAcento(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || padrao;
const carimbo = (data: string | Date): string => {
  const d = typeof data === "string" ? parseISO(data) : data;
  return format(isValid(d) ? d : new Date(), "yyyyMMdd");
};
/** `pedido-exames-<paciente>-<yyyyMMdd>.pdf` (data = data do pedido). */
export const nomeArquivoPDFPedido = (paciente: string, data: string | Date): string => `pedido-exames-${slug(paciente, 40, "paciente")}-${carimbo(data)}.pdf`;
