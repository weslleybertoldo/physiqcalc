// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/suplementosUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { format, isValid, parseISO } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";
import { fmtData, hojeISO } from "@/nutricao/editor/lib/gestacionalUtil";

// Regras puras da seção "Suplementos e produtos" (W26) — sem React, sem Supabase; cobertas por vitest.
// Catálogo da nutricionista (`produtos`) + indicações por paciente (`indicacoes_produto`), que guardam a CÓPIA do produto
// (nome/marca/apresentação/categoria) no momento da indicação: editar ou excluir o catálogo depois NÃO reescreve o histórico
// (mesmo padrão dos ativos da W17). `ordem` só vale entre as indicações ATIVAS; Encerrar/Reativar é reversível.

export { fmtData, hojeISO };

export const CATEGORIAS = [
  { valor: "suplemento", rotulo: "Suplemento" },
  { valor: "vitamina", rotulo: "Vitamina" },
  { valor: "mineral", rotulo: "Mineral" },
  { valor: "fitoterapico", rotulo: "Fitoterápico" },
  { valor: "alimento_funcional", rotulo: "Alimento funcional" },
  { valor: "outro", rotulo: "Outro" },
] as const;
export type Categoria = (typeof CATEGORIAS)[number]["valor"];
export const CATEGORIA_PADRAO: Categoria = "suplemento";
export const ehCategoria = (v: unknown): v is Categoria => typeof v === "string" && CATEGORIAS.some((c) => c.valor === v);
/** Categoria vinda do banco/formulário; desconhecida → 'outro'. */
export const lerCategoria = (v: unknown): Categoria => (ehCategoria(v) ? v : "outro");
export const rotuloCategoria = (v: unknown): string => CATEGORIAS.find((c) => c.valor === v)?.rotulo ?? "Outro";

/** Chips que preenchem o texto livre de horário/duração (ela pode digitar qualquer coisa). */
export const HORARIOS_RAPIDOS = ["jejum", "manhã", "almoço", "tarde", "jantar", "antes de dormir", "pré-treino", "pós-treino"] as const;
export const DURACOES_RAPIDAS = ["30 dias", "60 dias", "90 dias", "contínuo"] as const;

export const NOME_MAX = 120;
export const DOSE_MAX = 120;
export const TEXTO_MAX = 300;
export const LINK_MAX = 500;

/** O que a tela e o PDF precisam de um produto do catálogo (o Row do banco satisfaz). */
export type ProdutoBase = {
  id: string;
  nome: string;
  marca: string;
  categoria: string;
  apresentacao: string;
  dose_padrao: string;
  modo_uso: string;
  link: string;
  observacao: string;
  favorito: boolean;
  created_at: string;
};
/** O que a tela e o PDF precisam de uma indicação (o Row do banco satisfaz). */
export type IndicacaoBase = {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  produto_marca: string;
  produto_apresentacao: string;
  produto_categoria: string;
  dose: string;
  horario: string;
  duracao: string;
  inicio: string;
  ativa: boolean;
  ordem: number;
  observacao: string;
  created_at: string;
  updated_at: string;
};

const texto1 = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ");
const textoN = (s: string | null | undefined): string => (s ?? "").trim();
/** Sem acento, sem caixa, sem espaços nas pontas — chave de busca/ordenação. */
export const chave = (s: string | null | undefined): string => semAcento(s ?? "").toLowerCase().trim();

// ---- Chips sobre texto livre ('manhã, em jejum') ----
const partes = (texto: string): string[] => texto.split(",").map((p) => p.trim()).filter(Boolean);
export const chipAtivo = (texto: string, chip: string): boolean => partes(texto).some((p) => chave(p) === chave(chip));
/** Liga/desliga o chip dentro do texto: presente → sai; ausente → entra no fim, separado por vírgula. */
export function aplicarChip(texto: string, chip: string): string {
  const lista = partes(texto);
  const i = lista.findIndex((p) => chave(p) === chave(chip));
  if (i >= 0) lista.splice(i, 1);
  else lista.push(chip);
  return lista.join(", ");
}

// ---- Produto (catálogo da nutricionista) ----
export type FormProduto = {
  nome: string;
  marca: string;
  categoria: Categoria;
  apresentacao: string;
  dose_padrao: string;
  modo_uso: string;
  link: string;
  observacao: string;
  favorito: boolean;
};
export const formInicialProduto = (nome = ""): FormProduto => ({
  nome, marca: "", categoria: CATEGORIA_PADRAO, apresentacao: "", dose_padrao: "", modo_uso: "", link: "", observacao: "", favorito: false,
});
export const formDoProduto = (p: ProdutoBase): FormProduto => ({
  nome: p.nome ?? "",
  marca: p.marca ?? "",
  categoria: lerCategoria(p.categoria),
  apresentacao: p.apresentacao ?? "",
  dose_padrao: p.dose_padrao ?? "",
  modo_uso: p.modo_uso ?? "",
  link: p.link ?? "",
  observacao: p.observacao ?? "",
  favorito: !!p.favorito,
});
const LINK_RE = /^https?:\/\/\S+$/i;
/** Link opcional: vazio vale; preenchido tem que começar com http:// ou https:// e não ter espaço. */
export const linkValido = (link: string): boolean => link === "" || LINK_RE.test(link);

export function validarProduto(f: FormProduto): string | null {
  const nome = texto1(f.nome);
  if (!nome) return "Informe o nome do produto";
  if (nome.length > NOME_MAX) return `Nome com no máximo ${NOME_MAX} caracteres`;
  if (!ehCategoria(f.categoria)) return "Escolha uma categoria";
  const link = texto1(f.link);
  if (!linkValido(link)) return "Link inválido — comece com http:// ou https://";
  if (link.length > LINK_MAX) return `Link com no máximo ${LINK_MAX} caracteres`;
  const textos: [string, string][] = [["Marca", f.marca], ["Apresentação", f.apresentacao], ["Dose padrão", f.dose_padrao], ["Modo de uso", f.modo_uso], ["Observação", f.observacao]];
  for (const [rotulo, v] of textos) if (textoN(v).length > TEXTO_MAX) return `${rotulo} com no máximo ${TEXTO_MAX} caracteres`;
  return null;
}
export type ProdutoParaBanco = {
  nome: string;
  marca: string;
  categoria: Categoria;
  apresentacao: string;
  dose_padrao: string;
  modo_uso: string;
  link: string;
  observacao: string;
  favorito: boolean;
};
export const produtoParaBanco = (f: FormProduto): ProdutoParaBanco => ({
  nome: texto1(f.nome),
  marca: texto1(f.marca),
  categoria: lerCategoria(f.categoria),
  apresentacao: texto1(f.apresentacao),
  dose_padrao: texto1(f.dose_padrao),
  modo_uso: textoN(f.modo_uso),
  link: texto1(f.link),
  observacao: textoN(f.observacao),
  favorito: !!f.favorito,
});

/** Favoritos primeiro; depois nome sem acento/caixa. */
export const ordenarProdutos = <T extends { favorito: boolean; nome: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => (a.favorito === b.favorito ? chave(a.nome).localeCompare(chave(b.nome)) || a.nome.localeCompare(b.nome) : a.favorito ? -1 : 1));
/** Busca sem acento em nome + marca (todas as palavras) e filtro de categoria ('' = todas). Mantém a ordem recebida. */
export function filtrarProdutos<T extends { nome: string; marca: string; categoria: string }>(lista: T[], busca: string, categoria = ""): T[] {
  const palavras = chave(busca).split(/\s+/).filter(Boolean);
  return lista.filter((p) => (categoria === "" || p.categoria === categoria) && palavras.every((w) => `${chave(p.nome)} ${chave(p.marca)}`.includes(w)));
}
export const textoContagemProdutos = (n: number): string => (n === 0 ? "Nenhum produto" : n === 1 ? "1 produto" : `${n} produtos`);
/** Linha de detalhe do produto no catálogo: 'Growth · pote 1 kg · Suplemento · dose padrão 30 g'. */
export const textoProdutoCatalogo = (p: Pick<ProdutoBase, "marca" | "apresentacao" | "categoria" | "dose_padrao">): string =>
  [texto1(p.marca), texto1(p.apresentacao), rotuloCategoria(p.categoria), texto1(p.dose_padrao) ? `dose padrão ${texto1(p.dose_padrao)}` : ""].filter(Boolean).join(" · ");

// ---- Indicação (produto indicado pro paciente) ----
export type FormIndicacao = {
  /** produto do catálogo escolhido (null = nome livre ou ainda não escolhido) */
  produto: ProdutoBase | null;
  nomeLivre: string;
  dose: string;
  horario: string;
  duracao: string;
  /** `yyyy-MM-dd` */
  inicio: string;
  observacao: string;
};
export const formInicialIndicacao = (hoje: string, produto: ProdutoBase | null = null): FormIndicacao => ({
  produto, nomeLivre: "", dose: produto?.dose_padrao ?? "", horario: "", duracao: "", inicio: hoje, observacao: "",
});
/** Escolher (ou trocar) o produto: a dose vazia — ou ainda igual à dose padrão do produto anterior — passa a ser a dose padrão do novo. */
export function escolherProduto(f: FormIndicacao, produto: ProdutoBase | null): FormIndicacao {
  const doseAnterior = f.produto?.dose_padrao ?? "";
  const dose = f.dose.trim() === "" || f.dose === doseAnterior ? (produto?.dose_padrao ?? "") : f.dose;
  return { ...f, produto, nomeLivre: "", dose };
}
/** Modo editar: o produto fica TRAVADO (a cópia é o histórico) — só posologia/início/observação entram no formulário. */
export const formDaIndicacao = (i: IndicacaoBase): FormIndicacao => ({
  produto: null, nomeLivre: i.produto_nome ?? "", dose: i.dose ?? "", horario: i.horario ?? "", duracao: i.duracao ?? "", inicio: i.inicio, observacao: i.observacao ?? "",
});
const dataValida = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && isValid(parseISO(v));

export function validarIndicacao(f: FormIndicacao, hoje: string, editar = false): string | null {
  if (!editar) {
    const nome = texto1(f.nomeLivre);
    if (!f.produto && !nome) return "Escolha um produto do catálogo ou informe o nome";
    if (!f.produto && nome.length > NOME_MAX) return `Nome com no máximo ${NOME_MAX} caracteres`;
  }
  const dose = texto1(f.dose);
  if (!dose) return "Informe a dose";
  if (dose.length > DOSE_MAX) return `Dose com no máximo ${DOSE_MAX} caracteres`;
  if (!dataValida(f.inicio)) return "Informe a data de início";
  if (f.inicio > hoje) return "O início não pode ser no futuro";
  const textos: [string, string][] = [["Horário", f.horario], ["Duração", f.duracao], ["Observação", f.observacao]];
  for (const [rotulo, v] of textos) if (textoN(v).length > TEXTO_MAX) return `${rotulo} com no máximo ${TEXTO_MAX} caracteres`;
  return null;
}
export type EdicaoIndicacao = { dose: string; horario: string; duracao: string; inicio: string; observacao: string };
/** Só o que muda ao editar (o produto copiado não muda). */
export const edicaoParaBanco = (f: FormIndicacao): EdicaoIndicacao => ({
  dose: texto1(f.dose), horario: texto1(f.horario), duracao: texto1(f.duracao), inicio: f.inicio, observacao: textoN(f.observacao),
});
export type IndicacaoParaBanco = EdicaoIndicacao & {
  produto_id: string | null;
  produto_nome: string;
  produto_marca: string;
  produto_apresentacao: string;
  produto_categoria: Categoria;
};
/** Nova indicação: COPIA nome/marca/apresentação/categoria do produto escolhido; nome livre → `produto_id` null e só o nome. */
export const indicacaoParaBanco = (f: FormIndicacao): IndicacaoParaBanco => ({
  produto_id: f.produto ? f.produto.id : null,
  produto_nome: f.produto ? texto1(f.produto.nome) : texto1(f.nomeLivre),
  produto_marca: f.produto ? texto1(f.produto.marca) : "",
  produto_apresentacao: f.produto ? texto1(f.produto.apresentacao) : "",
  produto_categoria: f.produto ? lerCategoria(f.produto.categoria) : CATEGORIA_PADRAO,
  ...edicaoParaBanco(f),
});

/** Ativas primeiro; dentro do grupo, `ordem` e depois criação. */
export const ordenarIndicacoes = <T extends { ativa: boolean; ordem: number; created_at: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => (a.ativa === b.ativa ? a.ordem - b.ordem || a.created_at.localeCompare(b.created_at) : a.ativa ? -1 : 1));
/** Ativas na `ordem` da tela; encerradas da mais recente (última mexida) pra mais antiga. */
export function separarIndicacoes<T extends { ativa: boolean; ordem: number; created_at: string; updated_at: string }>(lista: T[]): { ativas: T[]; encerradas: T[] } {
  const ord = ordenarIndicacoes(lista);
  return {
    ativas: ord.filter((i) => i.ativa),
    encerradas: ord.filter((i) => !i.ativa).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.created_at.localeCompare(a.created_at)),
  };
}
/** Próxima posição entre as ativas (nova indicação e reativação entram no fim). */
export const proximaOrdem = <T extends { ordem: number }>(ativas: T[]): number => (ativas.length ? Math.max(...ativas.map((i) => i.ordem)) + 1 : 0);
const renumerar = <T extends { ordem: number }>(ativas: T[]): T[] => ativas.map((i, k) => (i.ordem === k ? i : { ...i, ordem: k }));
/** Move a indicação `id` uma posição entre as ATIVAS (-1 sobe, +1 desce) e devolve as ativas com `ordem` 0..n. Na ponta (ou id desconhecido) só renumera. */
export function moverIndicacao<T extends { id: string; ativa: boolean; ordem: number; created_at: string }>(lista: T[], id: string, direcao: -1 | 1): T[] {
  const ativas = ordenarIndicacoes(lista).filter((i) => i.ativa);
  const de = ativas.findIndex((i) => i.id === id);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= ativas.length) return renumerar(ativas);
  const nova = [...ativas];
  [nova[de], nova[para]] = [nova[para], nova[de]];
  return renumerar(nova);
}
/** Só as que mudaram de `ordem` (grava o mínimo). */
export function mudancasDeOrdem<T extends { id: string; ordem: number }>(antes: T[], depois: T[]): { id: string; ordem: number }[] {
  const mapa = new Map(antes.map((i) => [i.id, i.ordem]));
  return depois.filter((i) => mapa.get(i.id) !== i.ordem).map((i) => ({ id: i.id, ordem: i.ordem }));
}
/** Substitui (mesmo id) ou acrescenta no fim. */
export const inserirIndicacao = <T extends { id: string }>(lista: T[], i: T): T[] => (lista.some((x) => x.id === i.id) ? lista.map((x) => (x.id === i.id ? i : x)) : [...lista, i]);

// ---- Textos ----
/** 'Whey Protein · Growth · pote 1 kg' */
export const textoProduto = (i: Pick<IndicacaoBase, "produto_nome" | "produto_marca" | "produto_apresentacao">): string =>
  [i.produto_nome, i.produto_marca, i.produto_apresentacao].map(texto1).filter(Boolean).join(" · ");
/** '30 g · pós-treino · 90 dias' */
export const textoPosologia = (i: Pick<IndicacaoBase, "dose" | "horario" | "duracao">): string => [i.dose, i.horario, i.duracao].map(texto1).filter(Boolean).join(" · ");
export const textoDesde = (inicio: string | null | undefined): string => `desde ${fmtData(inicio)}`;
/** '2 produtos indicados · 1 ativo' · 'Nenhum produto indicado' */
export function textoContagemIndicacoes(ativas: number, total: number): string {
  if (total === 0) return "Nenhum produto indicado";
  const t = total === 1 ? "1 produto indicado" : `${total} produtos indicados`;
  const a = ativas === 0 ? "nenhum ativo" : ativas === 1 ? "1 ativo" : `${ativas} ativos`;
  return `${t} · ${a}`;
}
export const textoEncerradas = (n: number): string => `Encerradas (${n})`;

const slug = (s: string, max = 40): string => chave(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
/** `<paciente>-suplementacao-yyyy-MM-dd.pdf` (data = a da emissão). */
export const nomeArquivoPDFSuplementos = (paciente: string, d: Date): string => `${slug(paciente) || "paciente"}-suplementacao-${format(d, "yyyy-MM-dd")}.pdf`;
