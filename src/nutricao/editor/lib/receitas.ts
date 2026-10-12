// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/receitas.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { POR_PAGINA, deslocamento, type Pagina } from "@/lib/paginacao";
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";
import type { Alimento, MedidaCaseira } from "@/nutricao/editor/lib/alimentos";
import { ordenarMedidas, palavrasBusca } from "@/nutricao/editor/lib/alimentosUtil";
import { criarItensEmLote, type Item } from "@/nutricao/editor/lib/planos";
import { escalarIngredientes, medidaInteira, ordenarGrupos, ordenarIngredientes, ordenarReceitas, type RegistroIngrediente, type RegistroReceita } from "@/nutricao/editor/lib/receitasUtil";

// Acesso às tabelas `grupos_receita`, `receitas` → `ingredientes_receita` (RLS: a nutricionista só vê as dela; ingredientes seguem a
// receita; master vê tudo). Exclusão de RECEITA e GRUPO é SOFT (deleted_at → Lixeira, W32); ingredientes saem de verdade (editar
// apaga e regrava). O ingrediente traz o alimento (W8) aninhado com as medidas caseiras — é dele que saem as kcal. O atalho 'Da
// receita' do plano (W9) insere os ingredientes escalados como itens da refeição, em lote, com `receita_id`.
// hml-19b (H-41 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e as
// mesmas assinaturas. A receita e os ingredientes vão juntos (1 chamada, tudo ou nada — antes 2 a 4 pedidos, e o desfazer à mão no
// erro); excluir o grupo também (as receitas dele ficam sem grupo no mesmo passo). O dono é sempre quem chama (o duplicar não leva mais
// o id da autora). As frases de antes ficam ("Já existe um grupo com esse nome", "Grupo não encontrado", "Receita não encontrada").
// hml-20c (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa — os
// grupos (grupos_receita: com o uid, só os de quem está logado — o dono é o do token), a página (receitas_pagina: a RPC hml-14b E as
// receitas da página pelos ids NA MESMA IDA — eram 2 em série), os nomes para a cópia (receita_nome: as suas) e todas (receitas_todas,
// num lote só dela). A receita com os ingredientes e o alimento de cada um, colunas do tipo (nenhum "*"). Saiu o buscarReceita (0
// chamador — código morto de leitura, decisão 21).

export { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
export { dadosProfissionais } from "@/nutricao/editor/lib/profissional";

export type GrupoReceita = Database["public"]["Tables"]["grupos_receita"]["Row"];
export type ReceitaRow = Database["public"]["Tables"]["receitas"]["Row"];
export type IngredienteRow = Database["public"]["Tables"]["ingredientes_receita"]["Row"];
export type AlimentoDoIngrediente = Pick<Alimento, "id" | "nome" | "fonte" | "grupo" | "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g" | "sodio_mg"> & {
  medidas_caseiras: MedidaCaseira[];
};
export type Ingrediente = IngredienteRow & { alimento: AlimentoDoIngrediente | null };
export type Receita = ReceitaRow & { ingredientes: Ingrediente[] };

/** O índice único parcial (nutricionista, lower(nome)) devolve conflito — vira a mensagem da tela; 0 linha = o grupo não está mais aí. */
const FRASES_GRUPO = { conflito: "Já existe um grupo com esse nome", nao_encontrado: "Grupo não encontrado" };
const FRASES_RECEITA = { nao_encontrado: "Receita não encontrada" };

type AlimentoBruto = Omit<AlimentoDoIngrediente, "medidas_caseiras"> & { medidas_caseiras: MedidaCaseira[] | null };
type IngredienteBruto = IngredienteRow & { alimento?: AlimentoBruto | null };
type ReceitaBruta = ReceitaRow & { ingredientes?: IngredienteBruto[] | null };

const montarIngrediente = (i: IngredienteBruto): Ingrediente => ({
  ...i,
  alimento: i.alimento ? { ...i.alimento, medidas_caseiras: ordenarMedidas(i.alimento.medidas_caseiras ?? []) } : null,
});
const montarReceita = (r: ReceitaBruta): Receita => ({ ...r, ingredientes: ordenarIngredientes((r.ingredientes ?? []).map(montarIngrediente)) });

// ---- Grupos ----
/** Os grupos vivos; com `nutricionistaId`, só os dela (hml-14b: o painel separa no banco — a RLS do master lê os de todos). hml-20c: o
 *  "só os dela" é do servidor, pelo dono do token (quem chama sempre manda o próprio uid). */
export async function listarGrupos(nutricionistaId?: string): Promise<GrupoReceita[]> {
  const r = await lerNutricao("grupos_receita", nutricionistaId ? { meus: true } : {});
  return ordenarGrupos((r.linhas ?? []) as GrupoReceita[]);
}

export async function criarGrupo(nutricionistaId: string, nome: string): Promise<GrupoReceita> {
  const r = await acaoNutricao<{ linha: GrupoReceita }>("grupo_receita_criar", { nome: nome.trim() }).catch((e) => comFraseDoCodigo(e, FRASES_GRUPO));
  return r.linha;
}

export async function renomearGrupo(id: string, nome: string): Promise<GrupoReceita> {
  const r = await acaoNutricao<{ linha: GrupoReceita }>("grupo_receita_editar", { id, nome: nome.trim() }).catch((e) => comFraseDoCodigo(e, FRASES_GRUPO));
  return r.linha;
}

/** Soft: o grupo vai pra lixeira e as receitas VIVAS dele ficam sem grupo — juntos, numa chamada. */
export async function excluirGrupo(id: string): Promise<void> {
  await acaoNutricao("grupo_receita_excluir", { id }).catch((e) => comFraseDoCodigo(e, FRASES_GRUPO));
}

// ---- Receitas ----
/** O que filtra a lista do painel (hml-14b): busca por palavras no nome, grupo ('' todos · FILTRO_SEM_GRUPO · id) e favoritas. */
export interface FiltrosReceitas {
  q: string;
  grupo: string;
  favoritas: boolean;
}
/** A página das SUAS receitas + os números do cabeçalho e dos grupos — tudo do banco. */
export interface PaginaReceitas extends Pagina<Receita> {
  totalGeral: number;
  favoritas: number;
  /** receitas vivas por grupo (o número de cada grupo na janela Grupos) */
  porGrupo: Record<string, number>;
}

const contagem = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
/** A resposta da receitas_da_nutricionista (null = formato inesperado: a tela mostra o erro, nunca a lista vazia no lugar). */
export function lerPaginaReceitas(bruto: unknown): { ids: string[]; total: number; totalGeral: number; favoritas: number; porGrupo: Record<string, number> } | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const total = contagem(b.total);
  const totalGeral = contagem(b.total_geral);
  const favoritas = contagem(b.favoritas);
  if (b.ok !== true || !Array.isArray(b.ids) || total === null || totalGeral === null || favoritas === null) return null;
  const porGrupo: Record<string, number> = {};
  for (const [g, n] of Object.entries(b.por_grupo && typeof b.por_grupo === "object" ? (b.por_grupo as Record<string, unknown>) : {})) {
    const v = contagem(n);
    if (v !== null) porGrupo[g] = v;
  }
  return { ids: b.ids.filter((x): x is string => typeof x === "string"), total, totalGeral, favoritas, porGrupo };
}

/**
 * hml-14b (B21): UMA página (20) das SUAS receitas — também para o master: o banco separa as dele ANTES de cortar (receitas_da_
 * nutricionista, com a RLS de quem chama) —, com a busca sem acento, o grupo e as favoritas no banco; depois lê as receitas da página
 * (com os ingredientes) pelos ids, na ordem do banco: favoritas primeiro, depois o nome.
 */
export async function listarReceitasPagina(f: FiltrosReceitas, pagina: number): Promise<PaginaReceitas> {
  const filtros: Record<string, string> = {};
  const q = palavrasBusca(f.q).join(" ");
  if (q) filtros.q = q;
  if (f.grupo) filtros.grupo = f.grupo;
  if (f.favoritas) filtros.favoritas = "true";
  // hml-20c: a RPC e as receitas da página pelos ids NA MESMA IDA (o servidor relê os ids que a RPC devolveu, como a pessoa)
  const lido = await lerNutricao("receitas_pagina", { filtros, offset: deslocamento(pagina), limite: POR_PAGINA });
  const r = lerPaginaReceitas(lido.valor);
  if (!r) throw new Error("A lista de receitas voltou num formato inesperado.");
  const numeros = { total: r.total, totalGeral: r.totalGeral, favoritas: r.favoritas, porGrupo: r.porGrupo };
  if (!r.ids.length) return { itens: [], ...numeros };
  const porId = new Map(((lido.linhas ?? []) as unknown as ReceitaBruta[]).map((x) => [x.id, montarReceita(x)]));
  // a que saiu entre as 2 leituras (excluída agora) fica de fora
  return { itens: r.ids.flatMap((id) => porId.get(id) ?? []), ...numeros };
}

/**
 * Os nomes das suas receitas vivas que começam como a receita (sem o "(cópia N)") — o Duplicar escolhe o "(cópia N)" livre sem ler
 * a lista inteira (a mesma base do nomeCopia).
 */
export async function nomesParaCopia(nutricionistaId: string, nome: string): Promise<string[]> {
  const base = nome.replace(/\s*\(cópia(?: \d+)?\)\s*$/i, "").trim() || nome.trim();
  // hml-20c: o servidor escapa o \ % _ e põe o % do "começa com" (o mesmo de antes) e filtra pelo dono do TOKEN (o nutricionistaId que
  // quem chama manda é o próprio uid — fica na assinatura, como nas outras libs)
  const r = await lerNutricao("receita_nome", { base });
  return ((r.linhas ?? []) as { nome: string }[]).map((x) => x.nome);
}

/** Todas as receitas vivas da nutricionista, com ingredientes e alimentos (a lista mostra kcal/porção e macros) — num lote só dela. */
export async function listarReceitas(): Promise<Receita[]> {
  const r = await lerNutricao("receitas_todas", {}, { sozinha: true });
  return ordenarReceitas(((r.linhas ?? []) as unknown as ReceitaBruta[]).map(montarReceita));
}

const colunasReceita = (r: RegistroReceita) => ({
  nome: r.nome,
  grupo_id: r.grupo_id,
  porcoes: r.porcoes,
  rendimento_g: r.rendimento_g,
  tempo_preparo_min: r.tempo_preparo_min,
  modo_preparo: r.modo_preparo,
  observacao: r.observacao,
  favorita: r.favorita,
});
/** Os ingredientes na ordem da lista (o servidor grava a ordem = a posição, a regra de hoje). */
const colunasIngredientes = (ingredientes: RegistroIngrediente[]) =>
  ingredientes.map((i, k) => ({
    alimento_id: i.alimento_id,
    quantidade_g: i.quantidade_g,
    medida_caseira_id: i.medida_caseira_id,
    quantidade_medida: i.quantidade_medida,
    ordem: k,
    observacao: i.observacao,
  }));

/** A receita nova com os ingredientes: 1 chamada, tudo ou nada; volta a receita montada (com os ingredientes e o alimento de cada um). */
export async function criarReceita(nutricionistaId: string, r: RegistroReceita, ingredientes: RegistroIngrediente[]): Promise<Receita> {
  const { linha } = await acaoNutricao<{ linha: ReceitaBruta }>("receita_salvar", { receita: colunasReceita(r), ingredientes: colunasIngredientes(ingredientes) });
  return montarReceita(linha);
}

/** Atualiza a receita e REGRAVA os ingredientes (apaga os antigos, insere os novos) — juntos, numa chamada. */
export async function atualizarReceita(id: string, r: RegistroReceita, ingredientes: RegistroIngrediente[]): Promise<Receita> {
  const { linha } = await acaoNutricao<{ linha: ReceitaBruta }>("receita_salvar", { id, receita: colunasReceita(r), ingredientes: colunasIngredientes(ingredientes) })
    .catch((e) => comFraseDoCodigo(e, FRASES_RECEITA));
  return montarReceita(linha);
}

export async function alternarFavorita(id: string, favorita: boolean): Promise<Receita> {
  const { linha } = await acaoNutricao<{ linha: ReceitaBruta }>("receita_editar", { id, favorita }).catch((e) => comFraseDoCodigo(e, FRASES_RECEITA));
  return montarReceita(linha);
}

/** Cópia própria (nunca favorita) com os mesmos dados e ingredientes — a cópia é de quem chama (o servidor põe o dono). */
export async function duplicarReceita(r: Receita, nomeNovo: string): Promise<Receita> {
  return criarReceita(
    r.nutricionista_id,
    {
      nome: nomeNovo,
      grupo_id: r.grupo_id,
      porcoes: Number(r.porcoes),
      rendimento_g: r.rendimento_g === null ? null : Number(r.rendimento_g),
      tempo_preparo_min: r.tempo_preparo_min,
      modo_preparo: r.modo_preparo ?? "",
      observacao: r.observacao ?? "",
      favorita: false,
    },
    r.ingredientes.map((i, k) => ({
      alimento_id: i.alimento_id,
      quantidade_g: Number(i.quantidade_g),
      medida_caseira_id: i.medida_caseira_id,
      quantidade_medida: i.quantidade_medida === null ? null : Number(i.quantidade_medida),
      ordem: k,
      observacao: i.observacao ?? "",
    })),
  );
}

/** Soft (Lixeira). Os itens do plano que vieram dela continuam (o `receita_id` só documenta). */
export async function excluirReceita(id: string): Promise<void> {
  await acaoNutricao("receita_excluir", { id }).catch((e) => comFraseDoCodigo(e, FRASES_RECEITA));
}

// ---- Integração com o plano (W9) ----
/**
 * Os INGREDIENTES da receita, escalados pro nº de porções, entram como itens da refeição — 1 insert em lote, `receita_id` em todos,
 * ordem no fim. A medida caseira só vai junto quando a quantidade escalada fica inteira; senão só as gramas.
 */
export async function inserirItensDeReceita(refeicaoId: string, receita: Receita, porcoes: number, ordemInicial: number): Promise<Item[]> {
  const escalados = escalarIngredientes(receita.ingredientes.filter((i) => !!i.alimento), porcoes, Number(receita.porcoes));
  const linhas = escalados.map((i, k) => {
    const comMedida = !!i.medida_caseira_id && medidaInteira(i.quantidade_medida);
    return {
      refeicao_id: refeicaoId,
      alimento_id: i.alimento_id,
      receita_id: receita.id,
      ordem: ordemInicial + k,
      quantidade_g: i.quantidade_g,
      medida_caseira_id: comMedida ? i.medida_caseira_id : null,
      quantidade_medida: comMedida ? i.quantidade_medida : null,
      observacao: i.observacao?.trim() ? i.observacao.trim() : null,
    };
  });
  if (!linhas.length) throw new Error("A receita não tem ingredientes");
  return criarItensEmLote(linhas);
}
