// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/orientacoesUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format } from "date-fns";

// Regras puras das orientações nutricionais (W10) — modelos (texto reaproveitável) e orientações do paciente
// (título + conteúdo em markdown SIMPLES). Nada de rede aqui; testado no vitest.
//
// Markdown aceito: `# Título`, `## Subtítulo` (### ou mais fundo também vira subtítulo), `- item` (ou `* item`) de
// lista, parágrafos (linhas seguidas viram um parágrafo só), linha em branco separa os blocos e `**negrito**` dentro
// do texto. A tela (Blocos.tsx) e o PDF (orientacaoPdf.ts) renderizam os MESMOS blocos.

export const TITULO_MAX = 120;
export const CONTEUDO_MAX = 20000;

export const TITULO_MODELO_PADRAO = "Orientações gerais (padrão)";
/** Texto próprio do PhysiqNutri (não copiado de nenhuma referência): 8 tópicos do dia a dia. */
export const CONTEUDO_MODELO_PADRAO = [
  "## Hidratação",
  "Beba água ao longo de todo o dia, sem esperar a sede: deixe uma garrafa por perto e dê preferência à água pura. Sucos, refrigerantes e bebidas adoçadas não substituem a água.",
  "",
  "## Mastigação e ritmo das refeições",
  "Sente-se para comer, sem pressa e longe de telas. Mastigue bem cada porção e faça pausas entre as garfadas — a sensação de saciedade leva alguns minutos para chegar.",
  "",
  "## Horários",
  "Procure fazer as refeições em horários parecidos todos os dias e evite ficar mais de 4 horas sem comer. Pular refeições costuma aumentar a fome e a vontade de beliscar depois.",
  "",
  "## Vegetais e frutas",
  "- Inclua verduras e legumes no almoço e no jantar, ocupando pelo menos metade do prato.",
  "- Varie as cores ao longo da semana: cada cor traz nutrientes diferentes.",
  "- Prefira a fruta inteira ao suco.",
  "",
  "## Ultraprocessados",
  "Reduza embutidos, salgadinhos, biscoitos recheados, refrigerantes e refeições prontas. Quando for consumir, leia o rótulo e prefira listas de ingredientes curtas.",
  "",
  "## Sono",
  "Dormir bem faz parte do tratamento: tente manter de 7 a 9 horas por noite, com horários regulares. Evite refeições muito pesadas e cafeína perto da hora de dormir.",
  "",
  "## Atividade física",
  "Movimente-se todos os dias, mesmo que em caminhadas curtas. Combine com a nutricionista a alimentação em torno dos treinos.",
  "",
  "## Registro do diário alimentar",
  "Anote (ou fotografe) o que comer e beber, com horário, e leve o registro para a próxima consulta. **Não existe registro errado**: ele serve para ajustarmos o plano juntos.",
].join("\n");

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

export const ehVazio = (conteudo: string | null | undefined): boolean => blocosDoMarkdown(conteudo).length === 0;

export const tituloPadrao = (d: Date = new Date()): string => `Orientações ${format(d, "dd/MM/yyyy")}`;

export const formatarDataOrientacao = (iso: string): string => format(new Date(iso), "dd/MM/yyyy");

/** Normaliza o texto digitado: quebras `\n`, sem espaço no fim das linhas, no máximo uma linha em branco seguida. */
export function normalizarConteudo(texto: string | null | undefined): string {
  return (texto ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela criação). */
export function ordenarOrientacoes<T extends { created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.created_at) - instante(a.created_at));
}

export const inserirOrdenada = <T extends { id: string; created_at: string }>(lista: T[], o: T): T[] =>
  ordenarOrientacoes([...lista.filter((x) => x.id !== o.id), o]);

/** Favoritos primeiro; dentro de cada grupo, ordem alfabética do título. */
export function ordenarModelos<T extends { favorito: boolean; titulo: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma orientação";
  if (n === 1) return "1 orientação";
  return `${n} orientações`;
}

/** `orientacoes-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export function nomeArquivoPDF(paciente: string, d: Date): string {
  const slug = paciente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "paciente";
  return `orientacoes-${slug}-${format(d, "yyyy-MM-dd")}.pdf`;
}

/** O que a nutricionista digita no modal. */
export type FormOrientacao = { titulo: string; conteudo: string; salvarComoModelo: boolean };
/** Como vai/vem do banco. */
export type RegistroOrientacao = { titulo: string; conteudo: string };

export function formParaRegistro(f: FormOrientacao, d: Date = new Date()): RegistroOrientacao {
  return { titulo: normalizarEspacos(f.titulo ?? "") || tituloPadrao(d), conteudo: normalizarConteudo(f.conteudo) };
}

export function registroParaForm(r: RegistroOrientacao): FormOrientacao {
  return { titulo: r.titulo, conteudo: r.conteudo ?? "", salvarComoModelo: false };
}
