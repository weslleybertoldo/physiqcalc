// Physiq W26 — porta do PhysiqNutri (main 294887a, src/lib/impressosUtil.ts) com a marca do Physiq (como a W18/W19/W24). Só a marca
// (cabeçalho, rodapé e nome do arquivo) e os imports mudaram; o catálogo e o conteúdo são os do site antigo.
import { format } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";

// W31 — Impressos: catálogo ESTÁTICO dos materiais do consultório. O conteúdo é PRÓPRIO e gerado na hora pelo `impressosPdf.ts`
// (jsPDF + autotable), com o nome da nutricionista e a data no cabeçalho/rodapé. Sem tabela no banco: o catálogo é do sistema e
// igual pra todas. A referência ('Impressos para seu consultório') tem 7 materiais pra baixar — os nossos cobrem os mesmos temas,
// na mesma ordem. Tudo aqui é puro (testável no vitest); o PDF fica no `impressosPdf.ts`.

export type CategoriaImpresso = "avaliacao" | "consultorio" | "gestao";

export type Impresso = {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaImpresso;
  /** páginas do PDF gerado (mostrado no card; o smoke confere que o PDF tem pelo menos isso) */
  paginas: number;
};

export type InfoCategoria = { id: CategoriaImpresso; rotulo: string; descricao: string };

/** O que vai no cabeçalho e no rodapé de todos os PDFs desta tela. */
export type ContextoImpresso = { nutricionista: string; data: Date };

export const CATEGORIAS: InfoCategoria[] = [
  { id: "avaliacao", rotulo: "Avaliação", descricao: "Fichas e questionários pra usar durante a consulta" },
  { id: "consultorio", rotulo: "Consultório", descricao: "Rotinas de higiene e controle do ambiente" },
  { id: "gestao", rotulo: "Gestão e ética", descricao: "Padronização de preparações e conduta profissional" },
];

export const ID_CODIGO_ETICA = "codigo-de-etica";
/** Página oficial do Código de Ética e de Conduta do Nutricionista (Resolução CFN nº 599/2018) no site do CFN (conferida em 20/09/2026). */
export const LINK_CFN = "https://cfn.org.br/codigo-de-etica/";

/** Na ordem da referência. Os ids são os nomes dos arquivos (`physiq-<id>-<data>.pdf`). */
export const IMPRESSOS: Impresso[] = [
  {
    id: "ficha-antropometrica",
    titulo: "Ficha de avaliação antropométrica",
    descricao: "Peso, altura, IMC, circunferências e dobras cutâneas em 3 colunas de data pra acompanhar a evolução do aluno.",
    categoria: "avaliacao",
    paginas: 1,
  },
  {
    id: "rastreamento-metabolico",
    titulo: "Rastreamento metabólico",
    descricao: "Questionário de sintomas por sistema (pontuação 0 a 4), com total por sistema e total geral, pra primeira consulta e acompanhamento.",
    categoria: "avaliacao",
    paginas: 2,
  },
  {
    id: "sinais-e-sintomas",
    titulo: "Sinais e sintomas de carências nutricionais",
    descricao: "Tabela de sinais clínicos por região do corpo e as possíveis carências relacionadas, pra marcar durante o exame físico.",
    categoria: "avaliacao",
    paginas: 1,
  },
  {
    id: ID_CODIGO_ETICA,
    titulo: "Código de ética do nutricionista — resumo",
    descricao: "Resumo em linguagem simples dos princípios, deveres e vedações da Resolução CFN nº 599/2018, com o link do texto oficial.",
    categoria: "gestao",
    paginas: 1,
  },
  {
    id: "checklist-higienizacao",
    titulo: "Checklist diário de higienização",
    descricao: "Itens de limpeza do consultório por turno (manhã e tarde) e dia da semana, com responsável, visto e observações.",
    categoria: "consultorio",
    paginas: 1,
  },
  {
    id: "controle-temperatura",
    titulo: "Controle de temperatura de equipamentos",
    descricao: "Planilha mensal de leitura de refrigerador, freezer e estufa, com as faixas ideais e o registro das ações corretivas.",
    categoria: "consultorio",
    paginas: 2,
  },
  {
    id: "ficha-tecnica",
    titulo: "Ficha técnica de preparação",
    descricao: "Modelo pra padronizar receitas: ingredientes com per capita, fator de correção, medida caseira e custo, modo de preparo e valor nutricional.",
    categoria: "gestao",
    paginas: 2,
  },
];

export const ehCategoria = (v: unknown): v is CategoriaImpresso => typeof v === "string" && CATEGORIAS.some((c) => c.id === v);

export function infoCategoria(id: CategoriaImpresso): InfoCategoria {
  return CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[0];
}

/** `?cat=` da URL → categoria válida ou null (= todas). */
export function categoriaDaURL(v: string | null | undefined): CategoriaImpresso | null {
  return ehCategoria(v) ? v : null;
}

export function impressoPorId(id: string): Impresso | null {
  return IMPRESSOS.find((i) => i.id === id) ?? null;
}

/** Sem acento, minúsculas, pontuação vira espaço (mesma regra da busca de alimentos da W8, refeita no smoke em Python). */
export function normalizarBusca(q: string): string {
  return semAcento(q)
    .toLowerCase()
    .replace(/[,()"'\\%_*;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Todas as palavras da busca (até 6) têm que aparecer no título ou na descrição. Busca vazia casa com tudo. */
export function casaComBuscaImpresso(i: Impresso, q: string): boolean {
  const termos = normalizarBusca(q).split(" ").filter(Boolean).slice(0, 6);
  if (!termos.length) return true;
  const alvo = normalizarBusca(`${i.titulo} ${i.descricao}`);
  return termos.every((t) => alvo.includes(t));
}

export function filtrarImpressos(lista: Impresso[], q: string, cat: CategoriaImpresso | null = null): Impresso[] {
  return lista.filter((i) => (!cat || i.categoria === cat) && casaComBuscaImpresso(i, q));
}

export function contarPorCategoria(lista: Impresso[]): Record<CategoriaImpresso, number> {
  const out: Record<CategoriaImpresso, number> = { avaliacao: 0, consultorio: 0, gestao: 0 };
  for (const i of lista) out[i.categoria] += 1;
  return out;
}

export function categoriasComItens(lista: Impresso[]): CategoriaImpresso[] {
  const n = contarPorCategoria(lista);
  return CATEGORIAS.map((c) => c.id).filter((id) => n[id] > 0);
}

/** Grupos na ordem das categorias, só as que têm item. */
export function agruparPorCategoria(lista: Impresso[]): { categoria: InfoCategoria; itens: Impresso[] }[] {
  return CATEGORIAS.map((c) => ({ categoria: c, itens: lista.filter((i) => i.categoria === c.id) })).filter((g) => g.itens.length > 0);
}

const plural = (n: number, um: string, varios: string): string => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/** '7 impressos em 3 categorias' · '1 impresso em 1 categoria' · 'Nenhum impresso'. */
export function textoContagem(total: number, categorias: number): string {
  if (total === 0) return "Nenhum impresso";
  return `${plural(total, "impresso", "impressos")} em ${plural(categorias, "categoria", "categorias")}`;
}

export function textoPaginas(n: number): string {
  return plural(n, "página", "páginas");
}

/** `physiq-<id>-<yyyy-MM-dd>.pdf` (data local de quem gera). */
export function nomeArquivo(impresso: Impresso | string, hoje: Date): string {
  const id = typeof impresso === "string" ? impresso : impresso.id;
  return `physiq-${id}-${format(hoje, "yyyy-MM-dd")}.pdf`;
}

/** Nome do perfil (ou o que ela digitou em 'Nome no cabeçalho') + agora → contexto dos PDFs. Espaços extras somem; null vira ''. */
export function cabecalhoPadrao(nome: string | null | undefined, agora: Date = new Date()): ContextoImpresso {
  return { nutricionista: (nome ?? "").replace(/\s+/g, " ").trim(), data: agora };
}

/** Linha do rodapé: 'Physiq · <nutricionista> · dd/MM/yyyy' (sem o nome quando vazio). */
export function rodapeImpresso(ctx: ContextoImpresso): string {
  return ["Physiq", ctx.nutricionista || null, format(ctx.data, "dd/MM/yyyy")].filter(Boolean).join(" · ");
}

/** Linha do cabeçalho: 'Nutricionista: <nome>   ·   Emitido em dd/MM/yyyy' (só a data quando não há nome). */
export function textoEmitido(ctx: ContextoImpresso): string {
  const emitido = `Emitido em ${format(ctx.data, "dd/MM/yyyy")}`;
  return ctx.nutricionista ? `Nutricionista: ${ctx.nutricionista}   ·   ${emitido}` : emitido;
}
