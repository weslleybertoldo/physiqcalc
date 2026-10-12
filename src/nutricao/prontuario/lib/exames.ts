// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/exames.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { deslocamento, POR_PAGINA, type Pagina } from "@/lib/paginacao";
import type { Database } from "@/nutricao/editor/lib/banco";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import { type RegistroExameCatalogo, type RegistroPedido, type RegistroResultado } from "@/nutricao/prontuario/lib/examesUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `exames_catalogo`, `pedidos_exame` e `resultados_exame` (RLS: a nutricionista só vê os dela; master vê tudo;
// criar pedido/resultado exige enxergar o paciente). Exclusão é SOFT nas três (deleted_at → Lixeira, W32). O pedido guarda os
// NOMES dos exames (text[]) e o resultado guarda unidade + referência COPIADAS do catálogo na hora do lançamento — mudar ou
// excluir o item do catálogo depois não mexe no histórico (padrão das W15–W17). O banco mexe em `pacientes.updated_at` a cada
// pedido/resultado (trigger). `exames` chega como lista de textos pelo PostgREST; a tela lê com `lerExames` (tolerante).
// hml-19a (H-41 · H-81 · jeito 2): as gravações vão pela função nutricao (os resultados da mesma data: 1 chamada com o lote); o
// catálogo padrão do 1º acesso nasce no servidor (padroes_garantir: 1 chamada, 1 vez só). Mesmas assinaturas.
// hml-20b (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa —
// exames_catalogo (o RLS decide, como antes), pedidos_exame_do_aluno (a PÁGINA de 20 com o total: o .range e o count exato agora no
// servidor), exames_do_aluno (a MESMA RPC, os mesmos args) e resultados_exame_do_aluno (TODOS: o laço de 1000 em 1000, até 50, foi para
// o servidor, num lote só dele — `sozinha` — para não segurar a tela). Mesmos tipos; o erro é ErroLeitura (frase fixa do código).

export type ExameCatalogo = Database["public"]["Tables"]["exames_catalogo"]["Row"];
type ExameCatalogoUpdate = Database["public"]["Tables"]["exames_catalogo"]["Update"];
export type PedidoExame = Database["public"]["Tables"]["pedidos_exame"]["Row"];
type PedidoExameUpdate = Database["public"]["Tables"]["pedidos_exame"]["Update"];
export type ResultadoExame = Database["public"]["Tables"]["resultados_exame"]["Row"];
type ResultadoExameUpdate = Database["public"]["Tables"]["resultados_exame"]["Update"];

// ---- Catálogo ----
export async function listarCatalogoExames(): Promise<ExameCatalogo[]> {
  const r = await lerNutricao("exames_catalogo");
  return (r.linhas ?? []) as ExameCatalogo[];
}

/**
 * Lista o catálogo; sem nenhum item próprio, o servidor cria os 12 padrão favoritos — 1º acesso à seção. hml-19a (H-81): 1 chamada
 * à função (padroes_garantir), que grava 1 vez só (trava por pessoa) e devolve o catálogo (a mesma ordem do listar).
 */
export async function garantirCatalogoExames(nutricionistaId: string): Promise<ExameCatalogo[]> {
  const r = await acaoNutricao<{ lista: ExameCatalogo[] }>("padroes_garantir", { secao: "exame" });
  return Array.isArray(r.lista) ? r.lista : [];
}

export async function criarExameCatalogo(nutricionistaId: string, r: RegistroExameCatalogo): Promise<ExameCatalogo> {
  const res = await acaoNutricao<{ linha: ExameCatalogo }>("exame_catalogo_criar", {
    nome: r.nome, unidade: r.unidade, ref_min: r.ref_min, ref_max: r.ref_max, referencia_texto: r.referencia_texto, favorito: r.favorito,
  });
  return res.linha;
}

export async function atualizarExameCatalogo(id: string, patch: Partial<RegistroExameCatalogo>): Promise<ExameCatalogo> {
  const dados: ExameCatalogoUpdate = {};
  if (patch.nome !== undefined) dados.nome = patch.nome;
  if (patch.unidade !== undefined) dados.unidade = patch.unidade;
  if (patch.ref_min !== undefined) dados.ref_min = patch.ref_min;
  if (patch.ref_max !== undefined) dados.ref_max = patch.ref_max;
  if (patch.referencia_texto !== undefined) dados.referencia_texto = patch.referencia_texto;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const r = await acaoNutricao<{ linha: ExameCatalogo }>("exame_catalogo_editar", { id, ...dados });
  return r.linha;
}

/** Soft delete — pedidos e resultados já guardam a própria cópia e não dependem do catálogo. 0 linha → nao_encontrado. */
export async function excluirExameCatalogo(id: string): Promise<void> {
  await acaoNutricao("exame_catalogo_excluir", { id });
}

// ---- Pedidos do paciente ----
/**
 * Uma página (20) dos pedidos vivos do paciente, mais recente primeiro (data, criado por último, id), e o total.
 * hml-14d (B21 · D32): antes vinham todos sem `range` (cortados calados em 1000). Erro do banco lança.
 * hml-20b: consulta pedidos_exame_do_aluno { aluno, pagina } — o .range da página e o count exato no servidor (a página como o
 * intervalo() da tela: inteira, a 1ª é 1). Sem o total, recusa (como o paginar).
 */
export async function paginaPedidosDoPaciente(pacienteId: string, pagina: number): Promise<Pagina<PedidoExame>> {
  const p = Number.isFinite(pagina) ? Math.max(1, Math.floor(pagina)) : 1;
  const r = await lerNutricao("pedidos_exame_do_aluno", { aluno: pacienteId, pagina: p });
  if (typeof r.total !== "number") throw new ErroLeitura("erro_interno");
  return { itens: (r.linhas ?? []) as PedidoExame[], total: r.total };
}

export async function criarPedido(nutricionistaId: string, pacienteId: string, r: RegistroPedido): Promise<PedidoExame> {
  const res = await acaoNutricao<{ linha: PedidoExame }>("pedido_exame_criar", { paciente_id: pacienteId, data: r.data, exames: r.exames, observacao: r.observacao });
  return res.linha;
}

/** Data, exames e/ou observação. */
export async function atualizarPedido(id: string, patch: Partial<RegistroPedido>): Promise<PedidoExame> {
  const dados: PedidoExameUpdate = {};
  if (patch.data !== undefined) dados.data = patch.data;
  if (patch.exames !== undefined) dados.exames = patch.exames;
  if (patch.observacao !== undefined) dados.observacao = patch.observacao;
  const r = await acaoNutricao<{ linha: PedidoExame }>("pedido_exame_editar", { id, ...dados });
  return r.linha;
}

/** Soft delete (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirPedido(id: string): Promise<void> {
  await acaoNutricao("pedido_exame_excluir", { id });
}

// ---- Resultados do paciente ----
/** O texto de quando passa do teto do laço (as 50 leituras de 1000 — hoje no servidor; a frase de antes). */
export const MSG_RESULTADOS_DEMAIS = "Resultados de exame demais para ler de uma vez.";

/**
 * TODOS os resultados vivos do paciente (a Avaliação integrada cruza todos; a tela de Exames lê por página — paginaDeExames).
 * hml-14d (B21 · D32): em leituras de 1000 com ordem estável (data, exame, id) até a última — antes era 1 leitura sem `range`, que o
 * PostgREST cortava calada em 1000. Erro do banco lança.
 * hml-20b: consulta resultados_exame_do_aluno — o MESMO laço (1000 por leitura, a mesma ordem, até 50) agora no servidor, dentro do
 * prazo do pedido, num lote só dele (`sozinha`); passou das 50 → a frase de antes.
 */
export async function listarResultadosDoPaciente(pacienteId: string): Promise<ResultadoExame[]> {
  try {
    const r = await lerNutricao("resultados_exame_do_aluno", { aluno: pacienteId }, { sozinha: true });
    return (r.linhas ?? []) as ResultadoExame[];
  } catch (e) {
    if (e instanceof ErroLeitura && e.codigo === "muitas_linhas") throw new ErroLeitura(e.codigo, e.extra, MSG_RESULTADOS_DEMAIS);
    throw e;
  }
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
  // hml-20b: a MESMA RPC pela nutricao (consulta exames_do_aluno) — os args de hoje (o p_exame só com o filtro: sem ele, o padrão null)
  const filtro = exame.trim();
  const { valor } = await lerNutricao("exames_do_aluno", {
    aluno: pacienteId, ...(filtro ? { exame: filtro } : {}), offset: deslocamento(pagina), limite: POR_PAGINA,
  });
  const r = (valor ?? {}) as Record<string, unknown>;
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

/** Lançamento em LOTE: 1 chamada com todas as linhas da mesma data (cada uma já com unidade/referência copiadas). */
export async function criarResultados(nutricionistaId: string, pacienteId: string, data: string, linhas: RegistroResultado[]): Promise<ResultadoExame[]> {
  if (!linhas.length) return [];
  const r = await acaoNutricao<{ linhas: ResultadoExame[] }>("resultados_exame_criar", {
    paciente_id: pacienteId,
    data,
    linhas: linhas.map((l) => ({
      exame: l.exame, valor: l.valor, valor_texto: l.valor_texto, unidade: l.unidade, ref_min: l.ref_min, ref_max: l.ref_max,
      referencia_texto: l.referencia_texto,
    })),
  });
  return Array.isArray(r.linhas) ? r.linhas : [];
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
  const r = await acaoNutricao<{ linha: ResultadoExame }>("resultado_exame_editar", { id, ...dados });
  return r.linha;
}

/** Soft delete (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirResultado(id: string): Promise<void> {
  await acaoNutricao("resultado_exame_excluir", { id });
}

/** Nome da nutricionista e CRN/telefone/endereço (assinatura do PDF) — a fonte única (hml-20b: o profiles de quem chama, pela função). */
export { dadosProfissionais, nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
