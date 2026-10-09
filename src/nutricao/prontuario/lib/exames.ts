// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/exames.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { deslocamento, intervalo, paginar, POR_PAGINA, type Pagina, type RespostaComContagem } from "@/lib/paginacao";
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { CATALOGO_PADRAO, ordenarCatalogo, type RegistroExameCatalogo, type RegistroPedido, type RegistroResultado } from "@/nutricao/prontuario/lib/examesUtil";

// Acesso às tabelas `exames_catalogo`, `pedidos_exame` e `resultados_exame` (RLS: a nutricionista só vê os dela; master vê tudo;
// criar pedido/resultado exige enxergar o paciente). Exclusão é SOFT nas três (deleted_at → Lixeira, W32). O pedido guarda os
// NOMES dos exames (text[]) e o resultado guarda unidade + referência COPIADAS do catálogo na hora do lançamento — mudar ou
// excluir o item do catálogo depois não mexe no histórico (padrão das W15–W17). O banco mexe em `pacientes.updated_at` a cada
// pedido/resultado (trigger). `exames` chega como lista de textos pelo PostgREST; a tela lê com `lerExames` (tolerante).

export type ExameCatalogo = Database["public"]["Tables"]["exames_catalogo"]["Row"];
type ExameCatalogoUpdate = Database["public"]["Tables"]["exames_catalogo"]["Update"];
export type PedidoExame = Database["public"]["Tables"]["pedidos_exame"]["Row"];
type PedidoExameUpdate = Database["public"]["Tables"]["pedidos_exame"]["Update"];
export type ResultadoExame = Database["public"]["Tables"]["resultados_exame"]["Row"];
type ResultadoExameUpdate = Database["public"]["Tables"]["resultados_exame"]["Update"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Catálogo ----
export async function listarCatalogoExames(): Promise<ExameCatalogo[]> {
  const { data, error } = await supabase
    .from("exames_catalogo")
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("nome", { ascending: true });
  falhou(error);
  return (data ?? []) as ExameCatalogo[];
}

/** Lista o catálogo; sem nenhum item, cria os 12 padrão favoritos — 1º acesso à seção (padrão `garantirModelos` das W10–W17). */
export async function garantirCatalogoExames(nutricionistaId: string): Promise<ExameCatalogo[]> {
  const lista = await listarCatalogoExames();
  if (lista.length) return lista;
  const { data, error } = await supabase
    .from("exames_catalogo")
    .insert(CATALOGO_PADRAO.map((e) => ({
      nutricionista_id: nutricionistaId,
      nome: e.nome,
      unidade: e.unidade,
      ref_min: e.ref_min,
      ref_max: e.ref_max,
      referencia_texto: e.referencia_texto,
      favorito: true,
    })))
    .select("*");
  falhou(error);
  return ordenarCatalogo((data ?? []) as ExameCatalogo[]);
}

export async function criarExameCatalogo(nutricionistaId: string, r: RegistroExameCatalogo): Promise<ExameCatalogo> {
  const { data, error } = await supabase
    .from("exames_catalogo")
    .insert({
      nutricionista_id: nutricionistaId,
      nome: r.nome,
      unidade: r.unidade,
      ref_min: r.ref_min,
      ref_max: r.ref_max,
      referencia_texto: r.referencia_texto,
      favorito: r.favorito,
    })
    .select("*")
    .single();
  falhou(error);
  return data as ExameCatalogo;
}

export async function atualizarExameCatalogo(id: string, patch: Partial<RegistroExameCatalogo>): Promise<ExameCatalogo> {
  const dados: ExameCatalogoUpdate = {};
  if (patch.nome !== undefined) dados.nome = patch.nome;
  if (patch.unidade !== undefined) dados.unidade = patch.unidade;
  if (patch.ref_min !== undefined) dados.ref_min = patch.ref_min;
  if (patch.ref_max !== undefined) dados.ref_max = patch.ref_max;
  if (patch.referencia_texto !== undefined) dados.referencia_texto = patch.referencia_texto;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await supabase.from("exames_catalogo").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as ExameCatalogo;
}

/** Soft delete — pedidos e resultados já guardam a própria cópia e não dependem do catálogo. */
export async function excluirExameCatalogo(id: string): Promise<void> {
  const { error } = await supabase.from("exames_catalogo").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ---- Pedidos do paciente ----
/**
 * Uma página (20) dos pedidos vivos do paciente, mais recente primeiro (data, criado por último, id), e o total.
 * hml-14d (B21 · D32): antes vinham todos sem `range` (cortados calados em 1000). Erro do banco lança.
 */
export function paginaPedidosDoPaciente(pacienteId: string, pagina: number): Promise<Pagina<PedidoExame>> {
  return paginar<PedidoExame>(
    (de, ate) =>
      supabase
        .from("pedidos_exame")
        .select("*", { count: "exact" })
        .eq("paciente_id", pacienteId)
        .is("deleted_at", null)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(de, ate) as unknown as PromiseLike<RespostaComContagem<PedidoExame>>,
    pagina,
  );
}

export async function criarPedido(nutricionistaId: string, pacienteId: string, r: RegistroPedido): Promise<PedidoExame> {
  const { data, error } = await supabase
    .from("pedidos_exame")
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, data: r.data, exames: r.exames, observacao: r.observacao })
    .select("*")
    .single();
  falhou(error);
  return data as PedidoExame;
}

/** Data, exames e/ou observação. */
export async function atualizarPedido(id: string, patch: Partial<RegistroPedido>): Promise<PedidoExame> {
  const dados: PedidoExameUpdate = {};
  if (patch.data !== undefined) dados.data = patch.data;
  if (patch.exames !== undefined) dados.exames = patch.exames;
  if (patch.observacao !== undefined) dados.observacao = patch.observacao;
  const { data, error } = await supabase.from("pedidos_exame").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as PedidoExame;
}

/** Soft delete (Lixeira, W32). */
export async function excluirPedido(id: string): Promise<void> {
  const { error } = await supabase.from("pedidos_exame").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ---- Resultados do paciente ----
/** hml-14d (D32): leituras de 1000 (o teto do PostgREST) até a última — e um limite de segurança. */
const RESULTADOS_POR_LEITURA = 1000;
const MAX_LEITURAS_RESULTADOS = 50;

/**
 * TODOS os resultados vivos do paciente (a Avaliação integrada cruza todos; a tela de Exames lê por página — paginaDeExames).
 * hml-14d (B21 · D32): em leituras de 1000 com ordem estável (data, exame, id) até a última — antes era 1 leitura sem `range`, que o
 * PostgREST cortava calada em 1000. Erro do banco lança.
 */
export async function listarResultadosDoPaciente(pacienteId: string): Promise<ResultadoExame[]> {
  const saida: ResultadoExame[] = [];
  for (let leitura = 1; leitura <= MAX_LEITURAS_RESULTADOS; leitura += 1) {
    const [de, ate] = intervalo(leitura, RESULTADOS_POR_LEITURA);
    const { data, error } = await supabase
      .from("resultados_exame")
      .select("*")
      .eq("paciente_id", pacienteId)
      .is("deleted_at", null)
      .order("data", { ascending: false })
      .order("exame", { ascending: true })
      .order("id", { ascending: true })
      .range(de, ate);
    falhou(error);
    const linhas = (data ?? []) as ResultadoExame[];
    saida.push(...linhas);
    if (linhas.length < RESULTADOS_POR_LEITURA) return saida;
  }
  throw new Error("Resultados de exame demais para ler de uma vez.");
}

/** Uma página dos resultados do paciente POR DATA (exames_do_aluno). */
export interface PaginaDeExames {
  /** quantas datas (com o filtro "Ver evolução de") — a paginação é de 20 datas */
  totalDatas: number;
  /** os números do topo, do aluno inteiro (sem o filtro) */
  totalResultados: number;
  foraReferencia: number;
  /** os nomes para o filtro (1 por nome sem caixa/acento), em ordem alfabética */
  exames: string[];
  /** as datas da página, a mais recente primeiro, cada uma com TODOS os resultados dela (o dia nunca é partido) */
  datas: Array<{ data: string; resultados: ResultadoExame[] }>;
}

/**
 * hml-14d (B21 · D32): os resultados por data — 20 DATAS por página com o dia inteiro em cada uma, o total de datas e os números do
 * topo (total de resultados, fora da referência, os nomes do filtro) somados no banco com a regra do examesUtil (RPC exames_do_aluno,
 * pela RLS de quem chama). `exame` = o "Ver evolução de" ('' = todos). Antes a tela lia todos (sem `range`) e agrupava aqui.
 */
export async function paginaDeExames(pacienteId: string, exame: string, pagina: number): Promise<PaginaDeExames> {
  const { data, error } = await supabase.rpc("exames_do_aluno" as never, {
    p_aluno: pacienteId, p_exame: exame.trim() || null, p_offset: deslocamento(pagina), p_limite: POR_PAGINA,
  } as never);
  falhou(error);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) throw new Error("Não foi possível carregar os exames");
  const datas = Array.isArray(r.datas) ? (r.datas as Array<{ data: string; resultados?: unknown }>) : [];
  return {
    totalDatas: Number(r.total_datas) || 0,
    totalResultados: Number(r.total_resultados) || 0,
    foraReferencia: Number(r.fora_referencia) || 0,
    exames: (Array.isArray(r.exames) ? (r.exames as unknown[]) : []).filter((x): x is string => typeof x === "string").sort((a, b) => a.localeCompare(b, "pt-BR")),
    datas: datas.map((d) => ({ data: String(d.data), resultados: Array.isArray(d.resultados) ? (d.resultados as ResultadoExame[]) : [] })),
  };
}

/** Lançamento em LOTE: 1 insert com todas as linhas da mesma data (cada uma já com unidade/referência copiadas). */
export async function criarResultados(nutricionistaId: string, pacienteId: string, data: string, linhas: RegistroResultado[]): Promise<ResultadoExame[]> {
  if (!linhas.length) return [];
  const { data: criados, error } = await supabase
    .from("resultados_exame")
    .insert(linhas.map((l) => ({
      nutricionista_id: nutricionistaId,
      paciente_id: pacienteId,
      data,
      exame: l.exame,
      valor: l.valor,
      valor_texto: l.valor_texto,
      unidade: l.unidade,
      ref_min: l.ref_min,
      ref_max: l.ref_max,
      referencia_texto: l.referencia_texto,
    })))
    .select("*");
  falhou(error);
  return (criados ?? []) as ResultadoExame[];
}

export type PatchResultado = Partial<RegistroResultado & { data: string; observacao: string }>;

/** Edição de 1 resultado: exame/valor/texto/unidade/referência, data e observação. */
export async function atualizarResultado(id: string, patch: PatchResultado): Promise<ResultadoExame> {
  const dados: ResultadoExameUpdate = {};
  if (patch.exame !== undefined) dados.exame = patch.exame;
  if (patch.valor !== undefined) dados.valor = patch.valor;
  if (patch.valor_texto !== undefined) dados.valor_texto = patch.valor_texto;
  if (patch.unidade !== undefined) dados.unidade = patch.unidade;
  if (patch.ref_min !== undefined) dados.ref_min = patch.ref_min;
  if (patch.ref_max !== undefined) dados.ref_max = patch.ref_max;
  if (patch.referencia_texto !== undefined) dados.referencia_texto = patch.referencia_texto;
  if (patch.data !== undefined) dados.data = patch.data;
  if (patch.observacao !== undefined) dados.observacao = patch.observacao;
  const { data, error } = await supabase.from("resultados_exame").update(dados).eq("id", id).select("*").single();
  falhou(error);
  return data as ResultadoExame;
}

/** Soft delete (Lixeira, W32). */
export async function excluirResultado(id: string): Promise<void> {
  const { error } = await supabase.from("resultados_exame").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Nome da nutricionista (assinatura do PDF) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";
/** CRN/telefone/endereço no PDF quando já existirem (W15; preenchidos na W35). */
export { dadosProfissionais } from "@/nutricao/prontuario/lib/documentos";
