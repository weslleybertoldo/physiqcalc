// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/evolucaoUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { mimeDoArquivo, nomeSeguro, type ArquivoInfo } from "@/nutricao/editor/lib/anexosUtil";

// Regras PURAS da evolução fotográfica (W22): posições, validação da imagem (mesma lista do bucket `evolucao`) e do formulário,
// agrupamento por data (1 card com 4 slots), comparação de 2 datas lado a lado por posição e textos. Nada de rede aqui; testado
// no vitest. REUSA o `anexosUtil` da W14 (MIME pela extensão, nome seguro, tamanho legível, path do objeto). A tela fica em
// `pages/paciente/secoes/Evolucao.tsx`, o acesso (Storage + tabela) em `lib/evolucao.ts`.

export type Posicao = "frente" | "costas" | "lado_d" | "lado_e";
export type OpcaoPosicao = { valor: Posicao; rotulo: string; curto: string };
/** Ordem fixa dos 4 slots: frente, costas, lado direito, lado esquerdo. */
export const POSICOES: OpcaoPosicao[] = [
  { valor: "frente", rotulo: "Frente", curto: "Frente" },
  { valor: "costas", rotulo: "Costas", curto: "Costas" },
  { valor: "lado_d", rotulo: "Lado direito", curto: "Lado D" },
  { valor: "lado_e", rotulo: "Lado esquerdo", curto: "Lado E" },
];
export const ehPosicao = (v: unknown): v is Posicao => typeof v === "string" && POSICOES.some((p) => p.valor === v);
export const lerPosicao = (v: unknown, padrao: Posicao = "frente"): Posicao => (ehPosicao(v) ? v : padrao);
export const rotuloPosicao = (v: unknown): string => POSICOES.find((p) => p.valor === v)?.rotulo ?? "";

/** 10 MB — igual ao `file_size_limit` do bucket `evolucao`. */
export const FOTO_TAMANHO_MAX = 10 * 1024 * 1024;
export const FOTO_TAMANHO_MAX_ROTULO = "10 MB";
/** MIME aceitos (mesma lista do bucket) → extensão usada no nome do download. */
export const MIMES_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** Valor do `accept` do input de arquivo. */
export const ACCEPT_FOTO = [...Object.keys(MIMES_FOTO), ".jpg", ".jpeg", ".png", ".webp"].join(",");
export const OBSERVACAO_FOTO_MAX = 300;

/** MIME da imagem: o que o navegador informou ou, sem isso, o da extensão (W14). */
export const mimeDaFoto = (f: ArquivoInfo): string => mimeDoArquivo(f.name, f.type);

/** null = pode subir; senão a mensagem pra nutricionista (o bucket também recusa no servidor). */
export function validarImagem(f: ArquivoInfo): string | null {
  if (!(f.name ?? "").trim()) return "Arquivo sem nome";
  if (!f.size || f.size <= 0) return "Arquivo vazio";
  if (f.size > FOTO_TAMANHO_MAX) return `Imagem acima de ${FOTO_TAMANHO_MAX_ROTULO}`;
  const mime = mimeDaFoto(f);
  if (!mime || !MIMES_FOTO[mime]) return "Use uma imagem JPG, PNG ou WebP";
  return null;
}

/** Texto de 1 linha: espaços repetidos viram 1, pontas fora; nulo vira "". */
export const normalizarObservacao = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ");

/** yyyy-MM-dd válido (existe no calendário). */
export function ehDataISO(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return isValid(d) && format(d, "yyyy-MM-dd") === s;
}
/** Hoje em yyyy-MM-dd no fuso do navegador (padrão da data da foto e teto do input). */
export const hojeISO = (): string => format(new Date(), "yyyy-MM-dd");

// ---- Formulário ----
export type FormFoto = { posicao: Posicao; data: string; observacao: string };
/** Novo: posição/data sugeridas pelo slot vazio da grade (quando válidas); sem sugestão → frente, hoje. */
export const formInicialFoto = (hoje: string, posicaoSugerida?: Posicao | null, dataSugerida?: string | null): FormFoto => ({
  posicao: lerPosicao(posicaoSugerida),
  data: ehDataISO(dataSugerida) ? dataSugerida : hoje,
  observacao: "",
});
/** Editar: o que a foto já tem. */
export const formDaFoto = (f: { posicao: string; data: string; observacao: string | null }): FormFoto => ({
  posicao: lerPosicao(f.posicao),
  data: f.data,
  observacao: f.observacao ?? "",
});
/** null = pode salvar; senão a mensagem. `hoje` (yyyy-MM-dd) entra por parâmetro pra regra ficar pura. */
export function validarFoto(form: FormFoto, hoje: string): string | null {
  if (!ehPosicao(form.posicao)) return "Escolha a posição da foto";
  if (!ehDataISO(form.data)) return "Data inválida";
  if (form.data > hoje) return "A data não pode ser futura";
  if (normalizarObservacao(form.observacao).length > OBSERVACAO_FOTO_MAX) return `Observação acima de ${OBSERVACAO_FOTO_MAX} caracteres`;
  return null;
}

// ---- Lista, grade e comparação ----
export type FotoBase = { id: string; posicao: string; data: string; created_at: string };
export type PorPosicao<T> = Record<Posicao, T | null>;
export type GrupoData<T> = { data: string; porPosicao: PorPosicao<T>; extras: T[]; n: number };
export type ParComparacao<T> = { posicao: Posicao; a: T | null; b: T | null };

/** Data mais recente primeiro; na mesma data, a enviada por último primeiro. */
export const ordenarFotos = <T extends FotoBase>(lista: T[]): T[] =>
  [...lista].sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.created_at || "").localeCompare(a.created_at || ""));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirFoto = <T extends FotoBase>(lista: T[], f: T): T[] => ordenarFotos([...lista.filter((x) => x.id !== f.id), f]);
export function porPosicaoVazio<T>(): PorPosicao<T> {
  return { frente: null, costas: null, lado_d: null, lado_e: null };
}
/** 1 grupo por data (mais recente primeiro), 1 foto por posição (a enviada por último ocupa o slot); repetidas ficam em `extras`. */
export function agruparPorData<T extends FotoBase>(lista: T[]): GrupoData<T>[] {
  const grupos = new Map<string, GrupoData<T>>();
  for (const f of ordenarFotos(lista)) {
    let g = grupos.get(f.data);
    if (!g) {
      g = { data: f.data, porPosicao: porPosicaoVazio<T>(), extras: [], n: 0 };
      grupos.set(f.data, g);
    }
    const pos = lerPosicao(f.posicao);
    if (g.porPosicao[pos]) g.extras.push(f);
    else g.porPosicao[pos] = f;
    g.n += 1;
  }
  return [...grupos.values()];
}
/** Datas únicas, mais recente primeiro. */
export const datasDisponiveis = (lista: FotoBase[]): string[] => [...new Set(lista.map((f) => f.data))].sort((a, b) => b.localeCompare(a));
export function fotosDaData<T extends FotoBase>(lista: T[], data: string): PorPosicao<T> {
  return agruparPorData(lista.filter((f) => f.data === data))[0]?.porPosicao ?? porPosicaoVazio<T>();
}
/** Fotos de uma data na ordem dos slots (+ repetidas no fim) — pra anterior/próxima no visualizador. */
export function fotosOrdenadasDaData<T extends FotoBase>(lista: T[], data: string): T[] {
  const g = agruparPorData(lista.filter((f) => f.data === data))[0];
  if (!g) return [];
  const slots = POSICOES.map((p) => g.porPosicao[p.valor]).filter((f): f is T => !!f);
  return [...slots, ...g.extras];
}
export function paresComparacao<T extends FotoBase>(lista: T[], dataA: string, dataB: string): ParComparacao<T>[] {
  const a = fotosDaData(lista, dataA);
  const b = fotosDaData(lista, dataB);
  return POSICOES.map((p) => ({ posicao: p.valor, a: a[p.valor], b: b[p.valor] }));
}
/** Dias de calendário entre 2 datas (yyyy-MM-dd), inteiro ≥ 0; data inválida → 0. */
export function diasEntre(dataA: string, dataB: string): number {
  if (!ehDataISO(dataA) || !ehDataISO(dataB)) return 0;
  return Math.abs(differenceInCalendarDays(parseISO(dataB), parseISO(dataA)));
}
/** A = mais antiga, B = mais recente; 1 data só → A = B; sem fotos → null. */
export function sugerirDatasComparacao(lista: FotoBase[]): { a: string; b: string } | null {
  const datas = datasDisponiveis(lista);
  if (!datas.length) return null;
  return { a: datas[datas.length - 1], b: datas[0] };
}
/** Comparar só faz sentido com 2 datas ou mais. */
export const podeComparar = (lista: FotoBase[]): boolean => datasDisponiveis(lista).length >= 2;
export const slotsVazios = <T>(porPosicao: PorPosicao<T>): Posicao[] => POSICOES.map((p) => p.valor).filter((v) => !porPosicao[v]);

// ---- Textos ----
/** yyyy-MM-dd → dd/MM/yyyy (data-só: `parseISO`, nunca `new Date`, que deslocaria o dia pelo fuso). */
export const formatarDataFoto = (data: string | null | undefined): string => (ehDataISO(data) ? format(parseISO(data), "dd/MM/yyyy") : (data ?? ""));
export const textoContagemFotos = (n: number): string => (n === 0 ? "Nenhuma foto" : n === 1 ? "1 foto" : `${n} fotos`);
export const textoContagemDatas = (n: number): string => (n === 1 ? "1 data" : `${n} datas`);
export const textoDias = (n: number): string => (n === 1 ? "1 dia entre as datas" : `${n} dias entre as datas`);
/** 'Frente · 19/09/2026'. */
export const textoFoto = (f: { posicao: string; data: string }): string => `${rotuloPosicao(f.posicao)} · ${formatarDataFoto(f.data)}`;
/** Nome do download: "maria-silva-frente-2026-09-19.jpg". */
export function nomeArquivoFoto(paciente: string, posicao: Posicao, data: string, mime: string | null | undefined): string {
  const ext = MIMES_FOTO[(mime ?? "").toLowerCase()] ?? "jpg";
  const base = (paciente ?? "").trim() ? nomeSeguro(paciente) : "paciente";
  return `${base}-${posicao}-${data}.${ext}`;
}
