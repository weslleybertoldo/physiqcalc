// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/anexosUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";

// Regras PURAS dos anexos (W14): tipos/tamanho aceitos (mesma lista do bucket `anexos`), tamanho legível, nome seguro e
// path do objeto no Storage, ordenação/contagem e descrição. Nada de rede aqui; testado no vitest. A tela fica em
// `pages/paciente/secoes/Anexos.tsx`, o acesso (Storage + tabela) em `lib/anexos.ts`.

/** 20 MB — igual ao `file_size_limit` do bucket. */
export const TAMANHO_MAX = 20 * 1024 * 1024;
export const TAMANHO_MAX_ROTULO = "20 MB";
export const DESCRICAO_MAX = 200;
export const NOME_MAX = 200;

export type TipoAnexo = "pdf" | "imagem" | "documento" | "planilha" | "texto" | "outro";

/** MIME aceitos (mesma lista do bucket) → tipo pra ícone/rótulo. */
export const MIMES_PERMITIDOS: Record<string, TipoAnexo> = {
  "application/pdf": "pdf",
  "image/jpeg": "imagem",
  "image/png": "imagem",
  "image/webp": "imagem",
  "image/heic": "imagem",
  "image/heif": "imagem",
  "application/msword": "documento",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "documento",
  "application/vnd.ms-excel": "planilha",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "planilha",
  "text/plain": "texto",
};

/** Extensão → MIME, pra quando o navegador não informa `file.type` (ex.: .heic em alguns sistemas). */
export const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};
export const EXTENSOES_PERMITIDAS = Object.keys(MIME_POR_EXTENSAO);
/** Valor do `accept` do input de arquivo. */
export const ACCEPT_INPUT = [...Object.keys(MIMES_PERMITIDOS), ...EXTENSOES_PERMITIDAS.map((e) => `.${e}`)].join(",");

export const ROTULO_TIPO: Record<TipoAnexo, string> = {
  pdf: "PDF",
  imagem: "Imagem",
  documento: "Documento",
  planilha: "Planilha",
  texto: "Texto",
  outro: "Arquivo",
};

/** "laudo.PDF" → "pdf"; "a.tar.gz" → "gz"; sem extensão → "". */
export function extensao(nome: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec((nome ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

/** MIME do arquivo: o que o navegador informou ou, sem isso, o da extensão. Vazio quando não dá pra saber. */
export const mimeDoArquivo = (nome: string, tipo: string | null | undefined): string =>
  (tipo ?? "").trim().toLowerCase() || MIME_POR_EXTENSAO[extensao(nome)] || "";

export function tipoPorMime(mime: string | null | undefined): TipoAnexo {
  const m = (mime ?? "").toLowerCase();
  return MIMES_PERMITIDOS[m] ?? (m.startsWith("image/") ? "imagem" : "outro");
}
export const rotuloTipo = (mime: string | null | undefined): string => ROTULO_TIPO[tipoPorMime(mime)];
/** Imagem que o navegador desenha (HEIC/HEIF não abrem no <img>). */
export const ehImagem = (mime: string | null | undefined): boolean => {
  const m = (mime ?? "").toLowerCase();
  return tipoPorMime(m) === "imagem" && m !== "image/heic" && m !== "image/heif";
};
export const ehPdf = (mime: string | null | undefined): boolean => tipoPorMime(mime) === "pdf";
/** Abre no modal "Ver" (imagem ou PDF); o resto só baixa. */
export const podeVisualizar = (mime: string | null | undefined): boolean => ehImagem(mime) || ehPdf(mime);

/** 0 → "0 B"; 512 → "512 B"; 1536 → "1,5 KB"; 2411724 → "2,3 MB" (1 decimal a partir de KB, vírgula pt-BR). */
export function formatarTamanho(bytes: number | null | undefined): string {
  const b = Math.max(0, Math.trunc(Number(bytes) || 0));
  if (b < 1024) return `${b} B`;
  const unidades = ["KB", "MB", "GB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1).replace(".", ",")} ${unidades[i]}`;
}

export type ArquivoInfo = { name: string; size: number; type: string };

/** null = pode subir; senão a mensagem pra nutricionista (o bucket também recusa no servidor). */
export function validarArquivo(f: ArquivoInfo): string | null {
  if (!(f.name ?? "").trim()) return "Arquivo sem nome";
  if (!f.size || f.size <= 0) return "Arquivo vazio";
  if (f.size > TAMANHO_MAX) return `Arquivo acima de ${TAMANHO_MAX_ROTULO}`;
  const mime = mimeDoArquivo(f.name, f.type);
  if (!mime || !MIMES_PERMITIDOS[mime]) return "Tipo de arquivo não permitido (use PDF, imagem, Word, Excel ou texto)";
  return null;
}

/** "Exame de Sangue (Setembro).PDF" → "exame-de-sangue-setembro.pdf" (sem acento/espaço, minúsculo, extensão mantida). */
export function nomeSeguro(nome: string): string {
  const limpo = semAcento((nome ?? "").trim()).toLowerCase();
  const ext = extensao(limpo);
  const semExt = ext ? limpo.slice(0, -(ext.length + 1)) : limpo;
  const base = semExt.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "arquivo";
  return ext ? `${base}.${ext}` : base;
}

/** Path do objeto no bucket: `<nutricionista>/<paciente>/<uuid>-<nome-seguro>` — a 1ª pasta é a dona (policies do Storage). */
export function montarPath(nutricionistaId: string, pacienteId: string, nome: string, uuid: string = crypto.randomUUID()): string {
  return `${nutricionistaId}/${pacienteId}/${uuid}-${nomeSeguro(nome)}`;
}

// ---- Lista ----
/** Mais recente primeiro. */
export const ordenarAnexos = <T extends { created_at: string }>(lista: T[]): T[] => [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at));
/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirAnexo = <T extends { id: string; created_at: string }>(lista: T[], a: T): T[] => ordenarAnexos([...lista.filter((x) => x.id !== a.id), a]);
export function textoContagemAnexos(n: number): string {
  if (n === 0) return "Nenhum anexo";
  if (n === 1) return "1 anexo";
  return `${n} anexos`;
}
export const totalBytes = (lista: { tamanho: number | null }[]): number => lista.reduce((s, a) => s + (Number(a.tamanho) || 0), 0);
/** timestamptz → "dd/MM/yyyy HH:mm" no fuso do navegador. */
export function formatarDataHoraAnexo(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "dd/MM/yyyy HH:mm");
}
export const normalizarDescricao = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ").slice(0, DESCRICAO_MAX);
