// Physiq W26 — regras PURAS da Ferramentas › Modelos (N-15; porte do src/lib/favoritosUtil.ts do PhysiqNutri, main 294887a — a tela
// "Meus favoritos"). A tela é AGREGADORA: nada é gravado aqui e não há tabela nova — as colunas `favorito` (e `receitas.favorita`) já
// existem nas tabelas de cada tela dona (o ★ dos modelos da W16/W18/W19/W24), que continua sendo a fonte (editar, PDF, duplicar e
// excluir ficam lá). Mais a aba Treinos (spec 4.6): os treinos das pastas do Painel › Treinos (W23). Este módulo normaliza cada linha
// num `ModeloItem`, ordena (ordem das abas → título sem acento → id), filtra (aba + busca por palavras sem acento), conta e monta os
// textos.
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";
import { rotuloTipo as rotuloTipoDocumento } from "@/nutricao/prontuario/lib/documentosUtil";
import { textoReferencia } from "@/nutricao/prontuario/lib/examesUtil";
import { ATALHOS_DIAS, DIAS_SEMANA, atalhoDosDias, normalizarDias } from "@/nutricao/editor/lib/metasUtil";
import { textoTopicos, topicosDoTexto } from "@/nutricao/editor/lib/orientacoesUtil";
import { textoPorcoes } from "@/nutricao/editor/lib/receitasUtil";
import { rotuloCategoria } from "@/nutricao/editor/lib/suplementosUtil";

export type TipoModelo =
  | "treino"
  | "anamnese"
  | "plano"
  | "orientacao"
  | "recibo"
  | "documento"
  | "meta"
  | "manipulado"
  | "exame"
  | "questionario"
  | "produto"
  | "receita";
export type AbaModelo = TipoModelo | "todos";
/** De qual módulo a aba depende (spec 4.6: "cada aba conforme o módulo"); recibo é do Financeiro (os dois). */
export type ModuloModelo = "treino" | "nutricao" | "ambos";

export interface InfoTipoModelo {
  chave: TipoModelo;
  rotulo: string;
  rotuloPlural: string;
  modulo: ModuloModelo;
  /** onde editar, PDF, duplicar e excluir continuam (para os itens sem rota própria) */
  onde: string;
}

/** Ordem das abas e da lista "Todos": Treinos primeiro (W23) e depois os tipos do site antigo do Nutri, na ordem dele. */
export const TIPOS_MODELO: InfoTipoModelo[] = [
  { chave: "treino", rotulo: "Treino", rotuloPlural: "Treinos", modulo: "treino", onde: "Treinos › Meus treinos" },
  { chave: "anamnese", rotulo: "Anamnese", rotuloPlural: "Anamneses", modulo: "nutricao", onde: "Prontuário do aluno › Anamnese › Modelos" },
  { chave: "plano", rotulo: "Plano alimentar", rotuloPlural: "Planos alimentares", modulo: "nutricao", onde: "Dieta do aluno › Planejamento" },
  { chave: "orientacao", rotulo: "Orientação", rotuloPlural: "Orientações", modulo: "nutricao", onde: "Dieta do aluno › Orientações › Modelos" },
  { chave: "recibo", rotulo: "Recibo", rotuloPlural: "Recibos", modulo: "ambos", onde: "Financeiro › Recibos › Modelos" },
  { chave: "documento", rotulo: "Documento", rotuloPlural: "Documentos", modulo: "nutricao", onde: "Prontuário do aluno › Documentos › Modelos" },
  { chave: "meta", rotulo: "Meta", rotuloPlural: "Metas", modulo: "nutricao", onde: "Dieta do aluno › Metas › Modelos" },
  { chave: "manipulado", rotulo: "Manipulado", rotuloPlural: "Manipulados", modulo: "nutricao", onde: "Dieta do aluno › Manipulados › Modelos" },
  { chave: "exame", rotulo: "Exame", rotuloPlural: "Exames", modulo: "nutricao", onde: "Prontuário do aluno › Exames › Catálogo" },
  { chave: "questionario", rotulo: "Questionário", rotuloPlural: "Questionários", modulo: "nutricao", onde: "Prontuário do aluno › Questionários" },
  { chave: "produto", rotulo: "Produto", rotuloPlural: "Produtos", modulo: "nutricao", onde: "Dieta do aluno › Suplementos › Meus produtos" },
  { chave: "receita", rotulo: "Receita", rotuloPlural: "Receitas", modulo: "nutricao", onde: "Dietas › Receitas" },
];

export const CHAVES_TIPO: TipoModelo[] = TIPOS_MODELO.map((t) => t.chave);
export const ehTipoModelo = (v: unknown): v is TipoModelo => typeof v === "string" && (CHAVES_TIPO as string[]).includes(v);
export const infoTipo = (t: TipoModelo): InfoTipoModelo => TIPOS_MODELO.find((x) => x.chave === t) ?? TIPOS_MODELO[0];
const indiceTipo = (t: TipoModelo): number => CHAVES_TIPO.indexOf(t);

export interface ModeloItem {
  tipo: TipoModelo;
  id: string;
  titulo: string;
  resumo: string;
  atualizado_em: string | null;
  paciente_id: string | null;
  /** abre a tela dona (treino, plano, receita e recibo têm rota; os outros vivem em janelas das seções do aluno → null) */
  rota: string | null;
  /** ★ pode ser tirado daqui (os treinos não têm ★: a aba mostra os treinos das pastas) */
  desfavoritavel: boolean;
}

type Base = { id: string; updated_at: string | null };
export type FonteAnamnese = Base & { titulo: string; perguntas: unknown };
export type FontePlano = Base & { titulo: string; paciente_id: string; paciente_nome: string | null; kcal: number | null; refeicoes: number };
export type FonteOrientacao = Base & { titulo: string; conteudo: string };
export type FonteRecibo = Base & { titulo: string; conteudo: string };
export type FonteDocumento = Base & { titulo: string; tipo: string };
export type FonteMeta = Base & { titulo: string; dias_semana: unknown };
export type FonteManipulado = Base & { titulo: string; ativos: unknown };
export type FonteExame = Base & { nome: string; unidade: string; ref_min: number | null; ref_max: number | null; referencia_texto: string };
export type FonteQuestionario = Base & { titulo: string; perguntas: unknown };
export type FonteProduto = Base & { nome: string; marca: string; categoria: string };
export type FonteReceita = Base & { nome: string; porcoes: number; kcal_porcao: number | null; ingredientes: number };
/** Um treino de pasta (W23): o nome do treino, a pasta e o número de exercícios. */
export type FonteTreino = { id: string; nome: string; pasta_id: string; pasta_nome: string; exercicios: number; global: boolean };

/** O que cada tela dona devolve, JÁ filtrado por ★. Chave ausente = a fonte não carregou (o erro vai em `erros`). */
export type FontesModelos = {
  treinos?: FonteTreino[];
  anamneses?: FonteAnamnese[];
  planos?: FontePlano[];
  orientacoes?: FonteOrientacao[];
  recibos?: FonteRecibo[];
  documentos?: FonteDocumento[];
  metas?: FonteMeta[];
  manipulados?: FonteManipulado[];
  exames?: FonteExame[];
  questionarios?: FonteQuestionario[];
  produtos?: FonteProduto[];
  receitas?: FonteReceita[];
};

// ---- textos ----
const plural = (n: number, um: string, varios: string): string => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
export const textoPerguntas = (n: number): string => (n === 0 ? "sem perguntas" : plural(n, "pergunta", "perguntas"));
export const textoAtivos = (n: number): string => (n === 0 ? "sem ativos" : plural(n, "ativo", "ativos"));
export const textoRefeicoes = (n: number): string => (n === 0 ? "sem refeições" : plural(n, "refeição", "refeições"));
export const textoIngredientes = (n: number): string => (n === 0 ? "sem ingredientes" : plural(n, "ingrediente", "ingredientes"));
export const textoExercicios = (n: number): string => (n === 0 ? "sem exercícios" : plural(n, "exercício", "exercícios"));
/** 1850 → '1.850' (sem depender do ICU do ambiente). */
export const fmtInteiro = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** 167.5 → '167,5' · 200 → '200'. */
export const fmtKcal1 = (n: number): string => n.toFixed(1).replace(/\.0$/, "").replace(".", ",");
const tamanho = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
const juntar = (partes: (string | null | undefined)[]): string => partes.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");

/** Dias da meta: atalho quando bate ('Todos os dias' · 'Seg a Sex' · 'Fim de semana'); senão os dias curtos ('Seg, Qua, Sex'). */
export function textoDias(dias: unknown): string {
  const d = normalizarDias(dias);
  if (d.length === 0) return "sem dias";
  const atalho = atalhoDosDias(d);
  const rotulo = atalho ? ATALHOS_DIAS.find((a) => a.atalho === atalho)?.rotulo : undefined;
  return rotulo ?? d.map((n) => DIAS_SEMANA.find((x) => x.n === n)?.curto ?? String(n)).join(", ");
}

/** Recibo: o texto do modelo com as tags `*|NOME_PACIENTE|*` viradas em `[nome paciente]`, numa linha só, até `max` caracteres. */
export function trechoDoModelo(conteudo: string | null | undefined, max = 80): string {
  const texto = (conteudo ?? "")
    .replace(/\*\|([A-Z_]+)\|\*/g, (_m, tag: string) => `[${tag.toLowerCase().replace(/_/g, " ")}]`)
    .replace(/\s+/g, " ")
    .trim();
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

export const resumoPlano = (p: FontePlano): string =>
  juntar([p.paciente_nome ?? "Aluno", p.kcal !== null && p.kcal > 0 ? `${fmtInteiro(p.kcal)} kcal` : null, textoRefeicoes(p.refeicoes)]);
export const resumoReceita = (r: FonteReceita): string =>
  juntar([textoPorcoes(r.porcoes), r.kcal_porcao === null ? null : `${fmtKcal1(r.kcal_porcao)} kcal/porção`, textoIngredientes(r.ingredientes)]);
export const resumoProduto = (p: FonteProduto): string => juntar([p.marca, rotuloCategoria(p.categoria)]);
export const resumoExame = (e: FonteExame): string => juntar([e.unidade, textoReferencia(e.ref_min, e.ref_max, e.referencia_texto)]);
export const resumoTreino = (t: FonteTreino): string => juntar([`Pasta ${t.pasta_nome}`, textoExercicios(t.exercicios), t.global ? "do catálogo (só leitura)" : null]);

// ---- rotas (as telas donas no Physiq) ----
export const rotaTreino = (pastaId: string, treinoId: string): string => `/painel/treinos?pasta=${encodeURIComponent(pastaId)}&treino=${encodeURIComponent(treinoId)}`;
export const rotaPlano = (pacienteId: string): string => `/painel/alunos/${pacienteId}/dieta`;
export const rotaReceita = (nome: string): string => `/painel/dietas?aba=receitas&q=${encodeURIComponent(nome)}`;
export const ROTA_RECIBOS = "/painel/financeiro?aba=recibos";

// ---- montar ----
const item = (
  tipo: TipoModelo,
  id: string,
  titulo: string,
  resumo: string,
  atualizado_em: string | null,
  paciente_id: string | null = null,
  rota: string | null = null,
  desfavoritavel = true,
): ModeloItem => ({ tipo, id, titulo, resumo, atualizado_em, paciente_id, rota, desfavoritavel });

/** Normaliza as listas das donas em `ModeloItem` e devolve já na ordem da tela. */
export function montarModelos(f: FontesModelos): ModeloItem[] {
  const lista: ModeloItem[] = [
    // um treino em 2 pastas aparece 1 vez (na 1ª pasta, por nome)
    ...dedupTreinos(f.treinos ?? []).map((t) => item("treino", t.id, t.nome, resumoTreino(t), null, null, rotaTreino(t.pasta_id, t.id), false)),
    ...(f.anamneses ?? []).map((m) => item("anamnese", m.id, m.titulo, textoPerguntas(tamanho(m.perguntas)), m.updated_at)),
    ...(f.planos ?? []).map((p) => item("plano", p.id, p.titulo, resumoPlano(p), p.updated_at, p.paciente_id, rotaPlano(p.paciente_id))),
    ...(f.orientacoes ?? []).map((m) => item("orientacao", m.id, m.titulo, textoTopicos(topicosDoTexto(m.conteudo)), m.updated_at)),
    ...(f.recibos ?? []).map((m) => item("recibo", m.id, m.titulo, trechoDoModelo(m.conteudo), m.updated_at, null, ROTA_RECIBOS)),
    ...(f.documentos ?? []).map((m) => item("documento", m.id, m.titulo, rotuloTipoDocumento(m.tipo), m.updated_at)),
    ...(f.metas ?? []).map((m) => item("meta", m.id, m.titulo, textoDias(m.dias_semana), m.updated_at)),
    ...(f.manipulados ?? []).map((m) => item("manipulado", m.id, m.titulo, textoAtivos(tamanho(m.ativos)), m.updated_at)),
    ...(f.exames ?? []).map((e) => item("exame", e.id, e.nome, resumoExame(e), e.updated_at)),
    ...(f.questionarios ?? []).map((q) => item("questionario", q.id, q.titulo, textoPerguntas(tamanho(q.perguntas)), q.updated_at)),
    ...(f.produtos ?? []).map((p) => item("produto", p.id, p.nome, resumoProduto(p), p.updated_at)),
    ...(f.receitas ?? []).map((r) => item("receita", r.id, r.nome, resumoReceita(r), r.updated_at, null, rotaReceita(r.nome))),
  ];
  return ordenarModelos(lista);
}

function dedupTreinos(l: FonteTreino[]): FonteTreino[] {
  const vistos = new Map<string, FonteTreino>();
  for (const t of [...l].sort((a, b) => comparar(chaveOrdem(a.pasta_nome), chaveOrdem(b.pasta_nome)) || comparar(a.pasta_id, b.pasta_id))) {
    if (!vistos.has(t.id)) vistos.set(t.id, t);
  }
  return [...vistos.values()];
}

// ---- ordenar · filtrar · contar ----
export const chaveOrdem = (s: string): string => semAcento(s).toLowerCase().trim();
const comparar = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Ordem das abas → título sem acento (comparação por código) → id. */
export function ordenarModelos(l: ModeloItem[]): ModeloItem[] {
  return [...l].sort((a, b) => indiceTipo(a.tipo) - indiceTipo(b.tipo) || comparar(chaveOrdem(a.titulo), chaveOrdem(b.titulo)) || comparar(a.id, b.id));
}

export const chaveDoItem = (i: Pick<ModeloItem, "tipo" | "id">): string => `${i.tipo}:${i.id}`;

/** Busca por palavras sem acento no título e no resumo (todas as palavras precisam aparecer). */
export function casaComBusca(i: ModeloItem, busca: string): boolean {
  const termos = semAcento(busca).toLowerCase().split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const alvo = semAcento(`${i.titulo} ${i.resumo}`).toLowerCase();
  return termos.every((t) => alvo.includes(t));
}

export function filtrarModelos(l: ModeloItem[], busca: string, aba: AbaModelo): ModeloItem[] {
  return l.filter((i) => (aba === "todos" || i.tipo === aba) && casaComBusca(i, busca));
}

export type ContagemPorTipo = Record<TipoModelo, number>;
export function contarPorTipo(l: ModeloItem[]): ContagemPorTipo {
  const c = Object.fromEntries(CHAVES_TIPO.map((t) => [t, 0])) as ContagemPorTipo;
  for (const i of l) c[i.tipo] += 1;
  return c;
}

export const tiposComItens = (c: ContagemPorTipo): TipoModelo[] => CHAVES_TIPO.filter((t) => c[t] > 0);
/** 'Todos' primeiro e só os tipos com itens (como o "Meus favoritos" do Nutri). */
export const abasVisiveis = (c: ContagemPorTipo): AbaModelo[] => ["todos", ...tiposComItens(c)];

/** 'Nenhum modelo' · '1 modelo em 1 tipo' · '12 modelos em 5 tipos'. */
export function textoContagem(total: number, tipos: number): string {
  if (total === 0) return "Nenhum modelo";
  return `${plural(total, "modelo", "modelos")} em ${plural(tipos, "tipo", "tipos")}`;
}

/** Aba da URL quando é um tipo válido COM itens; senão 'Todos'. */
export function abaInicial(c: ContagemPorTipo, tipoDaURL: string | null | undefined): AbaModelo {
  return ehTipoModelo(tipoDaURL) && c[tipoDaURL] > 0 ? tipoDaURL : "todos";
}

/** Quais fontes a pessoa tem (cada aba conforme o módulo da conta e o papel — spec 4.6 e 4.1). */
export function fontesDaPessoa(o: { modulos: readonly string[]; papeis: readonly string[]; master: boolean }): Set<TipoModelo> {
  const personal = o.master || (o.modulos.includes("treino") && o.papeis.includes("personal"));
  const nutri = o.master || (o.modulos.includes("nutricao") && o.papeis.includes("nutricionista"));
  return new Set(TIPOS_MODELO.filter((t) => (t.modulo === "treino" ? personal : t.modulo === "nutricao" ? nutri : true)).map((t) => t.chave));
}

/** timestamptz → 'atualizado em dd/MM/yyyy' no fuso do aparelho (nunca fatiar a ISO). */
export function formatarAtualizado(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `atualizado em ${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}
