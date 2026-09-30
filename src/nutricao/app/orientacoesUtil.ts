import { format } from "date-fns";
import { slugNome } from "./numeros";

// Physiq W11 — orientações do lado do aluno, portadas do PhysiqNutri (src/lib/orientacoesUtil.ts, W10 do Nutri): o markdown
// SIMPLES que a nutricionista escreve (`# Título`, `## Subtítulo`, `- item`, parágrafos e `**negrito**`), os tópicos, a
// contagem, as datas e o nome do PDF. A tela (ui/Blocos.tsx) e o PDF (pdf/orientacaoPdf.ts) usam os MESMOS blocos. Testado.

export type Trecho = { texto: string; negrito: boolean };
export type Bloco =
  | { tipo: "titulo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "paragrafo"; texto: string };

const normalizarEspacos = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Converte o markdown simples em blocos, na ordem. Linhas seguidas viram um parágrafo; linha em branco separa. */
export function blocosDoMarkdown(texto: string | null | undefined): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  let lista: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) {
      blocos.push({ tipo: "paragrafo", texto: paragrafo.join(" ") });
      paragrafo = [];
    }
  };
  const fecharLista = () => {
    if (lista.length) {
      blocos.push({ tipo: "lista", itens: lista });
      lista = [];
    }
  };
  for (const bruta of (texto ?? "").split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const cabecalho = /^(#{1,6})\s+(.*)$/.exec(linha);
    if (cabecalho) {
      fecharParagrafo();
      fecharLista();
      const t = normalizarEspacos(cabecalho[2]);
      if (t) blocos.push({ tipo: cabecalho[1].length === 1 ? "titulo" : "subtitulo", texto: t });
      continue;
    }
    const item = /^[-*•]\s+(.*)$/.exec(linha);
    if (item) {
      fecharParagrafo();
      const t = normalizarEspacos(item[1]);
      if (t) lista.push(t);
      continue;
    }
    fecharLista();
    paragrafo.push(normalizarEspacos(linha));
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

/** Separa o `**negrito**` do texto corrido. `**` sem par fica literal. */
export function trechosInline(texto: string): Trecho[] {
  const saida: Trecho[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let ultimo = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    if (m.index > ultimo) saida.push({ texto: texto.slice(ultimo, m.index), negrito: false });
    saida.push({ texto: m[1], negrito: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) saida.push({ texto: texto.slice(ultimo), negrito: false });
  return saida;
}

export const textoSemMarcas = (texto: string): string => trechosInline(texto).map((t) => t.texto).join("");

/** "Tópicos" da orientação = títulos e subtítulos; sem nenhum, cada item de lista e cada parágrafo conta um. */
export function contarTopicos(blocos: Bloco[]): number {
  const cabecalhos = blocos.filter((b) => b.tipo === "titulo" || b.tipo === "subtitulo").length;
  if (cabecalhos > 0) return cabecalhos;
  return blocos.reduce((n, b) => n + (b.tipo === "lista" ? b.itens.length : 1), 0);
}

export const topicosDoTexto = (conteudo: string | null | undefined): number => contarTopicos(blocosDoMarkdown(conteudo));

export function textoTopicos(n: number): string {
  if (n === 0) return "sem conteúdo";
  if (n === 1) return "1 tópico";
  return `${n} tópicos`;
}

export const formatarDataOrientacao = (iso: string): string => format(new Date(iso), "dd/MM/yyyy");

/** Mais recente primeiro (pela criação). */
export function ordenarOrientacoes<T extends { created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma orientação";
  if (n === 1) return "1 orientação";
  return `${n} orientações`;
}

/** `orientacoes-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export const nomeArquivoPDF = (paciente: string, d: Date): string => `orientacoes-${slugNome(paciente)}-${format(d, "yyyy-MM-dd")}.pdf`;
