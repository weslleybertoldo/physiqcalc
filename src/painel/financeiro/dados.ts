// Physiq W19 — acesso a dados do Painel › Financeiro no banco principal (a porta de src/lib/financeiro.ts e src/lib/recibos.ts do
// PhysiqNutri, main ca9f66f, para a CONTA ATIVA). Quem vê o quê (spec 4.1, P6) é a RLS de hoje: cada profissional os seus; o dono
// da conta, os da conta inteira (políticas "dono da conta"). O filtro daqui só RECORTA a conta ativa: as linhas da conta + as do
// próprio profissional sem conta (o site antigo do Nutri grava sem conta_id até a W28) — o master não vê as de todo mundo.
// Exclusão é SOFT (deleted_at → Lixeira). O número do recibo vem do gatilho do banco (sequencial por profissional, nunca volta).
// hml-14b (B21 · D14): Lançamentos e Recibos chegam por PÁGINA (20) do banco, com o total, os totais e a busca calculados lá
// (financeiro_lancamentos, financeiro_resumo_periodo e financeiro_recibos — a migration 20261009010000, com as mesmas regras e o
// mesmo "quem vê o quê" de antes); o Resumo e o Dashboard recebem o recebido já somado por dia.
import { principal } from "@/integrations/principal/client";
import { POR_PAGINA, deslocamento, intervalo, type Pagina } from "@/lib/paginacao";
import { CATEGORIAS_PADRAO, ordenarCategorias, type RegistroMovimentacao, type Totais } from "./financeiroUtil";
import { TITULO_MODELO_PADRAO, aplicarTags, ordenarModelosRecibo, type DadosTags } from "@/financeiro/recibos";
import type { CobrancaDoDia, EntradaDoDia, RecebidoDoPeriodo } from "./resumo";
import type { RegistroRecibo } from "./recibosUtil";

const falhou = (error: { message: string; code?: string } | null, amigavel?: Record<string, string>): void => {
  if (!error) return;
  throw new Error((error.code && amigavel?.[error.code]) || error.message);
};
const ERROS_CATEGORIA = { "23505": "Já existe uma categoria com esse nome" };

/** O recorte da conta ativa (PostgREST `or`): as linhas da conta + as minhas sem conta. */
export const recorteDaConta = (contaId: string, uid: string): string => `conta_id.eq.${contaId},and(conta_id.is.null,nutricionista_id.eq.${uid})`;

// ───────────────────────── as RPCs do Financeiro (hml-14b) ─────────────────────────

const ERROS_RPC: Record<string, string> = {
  sem_login: "Sua sessão expirou. Entre de novo.",
  sem_acesso: "Você não faz mais parte desta conta.",
  conta_inexistente: "Conta não encontrada.",
  periodo_invalido: "Período inválido.",
};

/** Erro do banco ou `{ ok: false }` → lança (a tela mostra o erro — nunca uma lista vazia no lugar dele). */
async function rpcFinanceiro<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await principal.rpc(nome as never, args as never);
  falhou(error as { message: string; code?: string } | null);
  const r = data as ({ ok?: boolean; erro?: string } & T) | null;
  if (!r || r.ok !== true) throw new Error(ERROS_RPC[r?.erro ?? ""] ?? "Não deu para carregar o financeiro.");
  return r;
}

const numero = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ───────────────────────── movimentações (transacoes) ─────────────────────────

export interface Transacao {
  id: string;
  nutricionista_id: string;
  conta_id: string | null;
  paciente_id: string | null;
  tipo: string;
  descricao: string;
  valor: number;
  data: string;
  metodo: string;
  observacao: string | null;
  estornada: boolean;
  recibo_id: string | null;
  categoria_id: string | null;
  created_at: string;
  categoria: { nome: string } | null;
  paciente: { nome: string; cpf?: string | null } | null;
}

const SELECT_TX =
  "id, nutricionista_id, conta_id, paciente_id, tipo, descricao, valor, data, metodo, observacao, estornada, recibo_id, categoria_id, created_at, " +
  "categoria:categorias_financeiras(nome), paciente:pacientes(nome, cpf)";

/** Os filtros de Lançamentos que vão ao banco (o período vai à parte): vazio = sem filtro. */
export interface FiltrosLancamentos {
  tipo: string;
  categoria: string;
  metodo: string;
  q: string;
}

export const SEM_FILTROS: FiltrosLancamentos = { tipo: "", categoria: "", metodo: "", q: "" };

const filtrosParaBanco = (f: FiltrosLancamentos): Record<string, string> => {
  const saida: Record<string, string> = {};
  if (f.tipo) saida.tipo = f.tipo;
  if (f.categoria) saida.categoria = f.categoria;
  if (f.metodo) saida.metodo = f.metodo;
  if (f.q.trim()) saida.q = f.q.trim();
  return saida;
};

/**
 * Uma página das movimentações do período (datas yyyy-MM-dd inclusivas) com os filtros, a mais recente primeiro (data, criação),
 * com categoria e aluno, e o total com os filtros — financeiro_lancamentos (filtro, busca sem acento, ordem e contagem no banco).
 */
export async function listarLancamentos(contaId: string, de: string, ate: string, filtros: FiltrosLancamentos, pagina: number,
  porPagina = POR_PAGINA): Promise<Pagina<Transacao>> {
  const r = await rpcFinanceiro<{ total: number; itens: Transacao[] | null }>("financeiro_lancamentos", {
    p_conta: contaId, p_de: de, p_ate: ate, p_filtros: filtrosParaBanco(filtros), p_offset: deslocamento(pagina, porPagina), p_limite: porPagina,
  });
  return { itens: r.itens ?? [], total: numero(r.total) };
}

/** Os totais do período com os filtros (estornadas fora), o total do período sem filtro e as categorias usadas nele. */
export interface TotaisDoPeriodo extends Totais {
  totalPeriodo: number;
  categorias: { id: string; nome: string }[];
}

interface RespostaResumo {
  entradas: number | string;
  saidas: number | string;
  saldo: number | string;
  n_entradas: number;
  n_saidas: number;
  n_estornadas: number;
  total: number;
  total_periodo: number;
  categorias: { id: string; nome: string }[] | null;
  entradas_por_dia?: EntradaDoDia[] | null;
  cobrancas_por_dia?: CobrancaDoDia[] | null;
}

const paraTotais = (r: RespostaResumo): TotaisDoPeriodo => ({
  entradas: numero(r.entradas), saidas: numero(r.saidas), saldo: numero(r.saldo), nEntradas: numero(r.n_entradas), nSaidas: numero(r.n_saidas),
  nEstornadas: numero(r.n_estornadas), total: numero(r.total), totalPeriodo: numero(r.total_periodo), categorias: r.categorias ?? [],
});

/** financeiro_resumo_periodo: entradas, saídas, saldo e contagens com os mesmos filtros da lista (D14). */
export async function totaisDoPeriodo(contaId: string, de: string, ate: string, filtros: FiltrosLancamentos): Promise<TotaisDoPeriodo> {
  return paraTotais(await rpcFinanceiro<RespostaResumo>("financeiro_resumo_periodo", { p_conta: contaId, p_de: de, p_ate: ate, p_filtros: filtrosParaBanco(filtros) }));
}

export type ResumoDoPeriodo = TotaisDoPeriodo & RecebidoDoPeriodo;

/** O Resumo e o Dashboard: os totais do período + o recebido por dia (entradas por dia e categoria, cobranças pagas sem lançamento). */
export async function resumoDoPeriodo(contaId: string, de: string, ate: string): Promise<ResumoDoPeriodo> {
  const r = await rpcFinanceiro<RespostaResumo>("financeiro_resumo_periodo", { p_conta: contaId, p_de: de, p_ate: ate, p_filtros: { resumo: true } });
  return { ...paraTotais(r), entradasPorDia: r.entradas_por_dia ?? [], cobrancasPorDia: r.cobrancas_por_dia ?? [] };
}

const colunas = (r: RegistroMovimentacao) => ({
  tipo: r.tipo, descricao: r.descricao, valor: r.valor, data: r.data, categoria_id: r.categoria_id, metodo: r.metodo, paciente_id: r.paciente_id,
  observacao: r.observacao,
});

export async function criarTransacao(uid: string, contaId: string, r: RegistroMovimentacao): Promise<Transacao> {
  const { data, error } = await principal.from("transacoes").insert({ ...colunas(r), nutricionista_id: uid, conta_id: contaId }).select(SELECT_TX).single();
  falhou(error);
  return data as unknown as Transacao;
}

export async function atualizarTransacao(id: string, r: RegistroMovimentacao): Promise<Transacao> {
  const { data, error } = await principal.from("transacoes").update(colunas(r)).eq("id", id).select(SELECT_TX).single();
  falhou(error);
  return data as unknown as Transacao;
}

/** Estornar (true) tira a movimentação dos totais sem apagar; desfazer (false) volta. */
export async function marcarEstorno(id: string, estornada: boolean): Promise<Transacao> {
  const { data, error } = await principal.from("transacoes").update({ estornada }).eq("id", id).select(SELECT_TX).single();
  falhou(error);
  return data as unknown as Transacao;
}

/** Soft delete (Lixeira). */
export async function excluirTransacao(id: string): Promise<void> {
  const { error } = await principal.from("transacoes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ───────────────────────── categorias (de cada profissional) ─────────────────────────

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  nutricionista_id: string;
}

export async function listarCategorias(uid: string): Promise<CategoriaFinanceira[]> {
  const { data, error } = await principal.from("categorias_financeiras").select("id, nome, nutricionista_id").eq("nutricionista_id", uid)
    .is("deleted_at", null).order("nome", { ascending: true });
  falhou(error);
  return ordenarCategorias((data ?? []) as CategoriaFinanceira[]);
}

/** Lista as categorias; sem nenhuma, cria as 6 padrão (1º acesso). Duas abas ao mesmo tempo: a 2ª bate no índice único e relê. */
export async function garantirCategorias(uid: string, contaId: string | null): Promise<CategoriaFinanceira[]> {
  const lista = await listarCategorias(uid);
  if (lista.length) return lista;
  const { data, error } = await principal.from("categorias_financeiras")
    .insert(CATEGORIAS_PADRAO.map((nome) => ({ nutricionista_id: uid, conta_id: contaId, nome }))).select("id, nome, nutricionista_id");
  if (error) return listarCategorias(uid);
  return ordenarCategorias((data ?? []) as CategoriaFinanceira[]);
}

export async function criarCategoria(uid: string, contaId: string | null, nome: string): Promise<CategoriaFinanceira> {
  const { data, error } = await principal.from("categorias_financeiras").insert({ nutricionista_id: uid, conta_id: contaId, nome: nome.trim() })
    .select("id, nome, nutricionista_id").single();
  falhou(error, ERROS_CATEGORIA);
  return data as CategoriaFinanceira;
}

export async function renomearCategoria(id: string, nome: string): Promise<CategoriaFinanceira> {
  const { data, error } = await principal.from("categorias_financeiras").update({ nome: nome.trim() }).eq("id", id).select("id, nome, nutricionista_id").single();
  falhou(error, ERROS_CATEGORIA);
  return data as CategoriaFinanceira;
}

/** Soft delete — as movimentações antigas continuam com a categoria (pelo id). */
export async function excluirCategoria(id: string): Promise<void> {
  const { error } = await principal.from("categorias_financeiras").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

// ───────────────────────── recibos e modelos ─────────────────────────

export interface ModeloRecibo {
  id: string;
  nutricionista_id: string;
  titulo: string;
  conteudo: string;
  favorito: boolean;
}

export interface Recibo {
  id: string;
  nutricionista_id: string;
  paciente_id: string;
  transacao_id: string | null;
  modelo_id: string | null;
  numero: number;
  valor: number;
  data: string;
  descricao: string;
  texto: string;
  created_at: string;
  paciente: { nome: string; cpf?: string | null } | null;
  transacao: { descricao: string; data: string } | null;
}

// duas FKs ligam recibos ↔ transacoes (recibos.transacao_id e transacoes.recibo_id): o `!recibos_transacao_id_fkey` escolhe a certa
const SELECT_RECIBO = "id, nutricionista_id, paciente_id, transacao_id, modelo_id, numero, valor, data, descricao, texto, created_at, " +
  "paciente:pacientes(nome, cpf), transacao:transacoes!recibos_transacao_id_fkey(descricao, data)";

/** Uma página de recibos + o total e a SOMA dos valores de todos os que passam na busca. */
export interface PaginaRecibos extends Pagina<Recibo> {
  soma: number;
}

/**
 * Recibos vivos da conta ativa, o mais recente primeiro (data, número), por página — financeiro_recibos: a busca (aluno, descrição,
 * número com 4 dígitos, descrição da entrada de origem; sem acento, todas as palavras), o total e a soma saem do banco.
 */
export async function listarRecibos(contaId: string, busca: string, pagina: number, porPagina = POR_PAGINA): Promise<PaginaRecibos> {
  const r = await rpcFinanceiro<{ total: number; soma: number | string; itens: Recibo[] | null }>("financeiro_recibos", {
    p_conta: contaId, p_filtros: busca.trim() ? { q: busca.trim() } : {}, p_offset: deslocamento(pagina, porPagina), p_limite: porPagina,
  });
  return { itens: r.itens ?? [], total: numero(r.total), soma: numero(r.soma) };
}

/** Quantos recibos com a data no período (o "Recibos no mês" do Dashboard): a mesma função da lista, só o total. */
export async function contarRecibos(contaId: string, de: string, ate: string): Promise<number> {
  const r = await rpcFinanceiro<{ total: number }>("financeiro_recibos", { p_conta: contaId, p_filtros: { de, ate }, p_offset: 0, p_limite: 0 });
  return numero(r.total);
}

/** Maior número já emitido pelo profissional (inclusive os da lixeira — número não volta); 0 sem recibo. A prévia mostra o próximo. */
export async function ultimoNumeroRecibo(uid: string): Promise<number> {
  const { data, error } = await principal.from("recibos").select("numero").eq("nutricionista_id", uid).order("numero", { ascending: false }).limit(1);
  falhou(error);
  return ((data ?? []) as { numero: number }[])[0]?.numero ?? 0;
}

export async function listarModelosRecibo(uid: string): Promise<ModeloRecibo[]> {
  const { data, error } = await principal.from("modelos_recibo").select("id, nutricionista_id, titulo, conteudo, favorito").eq("nutricionista_id", uid)
    .is("deleted_at", null);
  falhou(error);
  return ordenarModelosRecibo((data ?? []) as ModeloRecibo[]);
}

/** Lista os modelos; sem nenhum, cria o "Recibo padrão" favorito (o texto do papel — o do Nutri para a nutricionista). */
export async function garantirModelosRecibo(uid: string, contaId: string | null, conteudoPadrao: string): Promise<ModeloRecibo[]> {
  const lista = await listarModelosRecibo(uid);
  if (lista.length) return lista;
  return [await criarModeloRecibo(uid, contaId, { titulo: TITULO_MODELO_PADRAO, conteudo: conteudoPadrao, favorito: true })];
}

export type DadosModeloRecibo = { titulo: string; conteudo: string; favorito: boolean };

export async function criarModeloRecibo(uid: string, contaId: string | null, d: DadosModeloRecibo): Promise<ModeloRecibo> {
  const { data, error } = await principal.from("modelos_recibo")
    .insert({ nutricionista_id: uid, conta_id: contaId, titulo: d.titulo.trim(), conteudo: d.conteudo, favorito: d.favorito })
    .select("id, nutricionista_id, titulo, conteudo, favorito").single();
  falhou(error);
  return data as ModeloRecibo;
}

export async function atualizarModeloRecibo(id: string, patch: Partial<DadosModeloRecibo>): Promise<ModeloRecibo> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.conteudo !== undefined) dados.conteudo = patch.conteudo;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { data, error } = await principal.from("modelos_recibo").update(dados).eq("id", id).select("id, nutricionista_id, titulo, conteudo, favorito").single();
  falhou(error);
  return data as ModeloRecibo;
}

/** Soft delete — os recibos já emitidos guardam o texto final e não dependem do modelo. */
export async function excluirModeloRecibo(id: string): Promise<void> {
  const { error } = await principal.from("modelos_recibo").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/**
 * Emite o recibo como o site antigo: o número vem do gatilho; quando nasce de uma movimentação, ela passa a apontar para ele
 * (transacoes.recibo_id); se o número real saiu diferente do previsto e o modelo usa o número, o texto é regravado com o certo.
 */
export async function emitirRecibo(p: {
  uid: string;
  contaId: string | null;
  pacienteId: string;
  transacaoId: string | null;
  conteudoModelo: string;
  registro: RegistroRecibo;
  dadosTags: DadosTags;
  numeroPrevisto: number;
}): Promise<Recibo> {
  const { data, error } = await principal.from("recibos").insert({
    nutricionista_id: p.uid, conta_id: p.contaId, paciente_id: p.pacienteId, transacao_id: p.transacaoId, modelo_id: p.registro.modelo_id,
    valor: p.registro.valor, data: p.registro.data, descricao: p.registro.descricao, texto: p.registro.texto,
  }).select(SELECT_RECIBO).single();
  falhou(error);
  let recibo = data as unknown as Recibo;
  if (p.transacaoId) {
    const { error: e2 } = await principal.from("transacoes").update({ recibo_id: recibo.id }).eq("id", p.transacaoId);
    falhou(e2);
  }
  if (recibo.numero !== p.numeroPrevisto && p.conteudoModelo.includes("*|NUMERO_RECIBO|*")) {
    const texto = aplicarTags(p.conteudoModelo, { ...p.dadosTags, numero: recibo.numero });
    const { data: d2, error: e3 } = await principal.from("recibos").update({ texto }).eq("id", recibo.id).select(SELECT_RECIBO).single();
    falhou(e3);
    recibo = d2 as unknown as Recibo;
  }
  return recibo;
}

/** Soft delete; a movimentação de origem volta a ficar sem recibo (pode ganhar outro). */
export async function excluirRecibo(id: string): Promise<void> {
  const { error } = await principal.from("recibos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
  const { error: e2 } = await principal.from("transacoes").update({ recibo_id: null }).eq("recibo_id", id);
  falhou(e2);
}

// ───────────────────────── alunos, nomes e cobranças (o resumo) ─────────────────────────

export interface AlunoResumido {
  id: string;
  nome: string;
  apelido: string | null;
  cpf: string | null;
}

/** Alunos ativos da conta ativa (a RLS recorta: o dono vê todos; o membro, os dele). */
export async function listarAlunosDaConta(contaId: string): Promise<AlunoResumido[]> {
  const { data, error } = await principal.from("pacientes").select("id, nome, apelido, cpf").eq("conta_id", contaId).is("deleted_at", null)
    .eq("ativo", true).order("nome", { ascending: true }).limit(1000);
  falhou(error);
  return (data ?? []) as AlunoResumido[];
}

/** Nome do profissional como o site antigo assina (profiles.nome). */
export async function nomeDoProfissional(uid: string): Promise<string | null> {
  const { data, error } = await principal.from("profiles").select("nome").eq("id", uid).maybeSingle();
  if (error) return null;
  return ((data as { nome: string | null } | null)?.nome ?? null) || null;
}

export interface CobrancaResumo {
  id: string;
  paciente_id: string;
  nutricionista_id: string;
  tipo: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: string;
  forma: string | null;
  pago_em: string | null;
  transacao_id: string | null;
  reembolsado_em: string | null;
  enviado_em: string | null;
  created_at: string;
  paciente: { nome: string } | null;
}

const COBRANCAS_POR_LEITURA = 1000; // o max_rows do PostgREST
const MAX_LEITURAS_COBRANCAS = 20;

/**
 * Cobranças da conta para o Resumo (o "a receber" e a rosca do mês): as em aberto/aguardando (qualquer data) + as que vencem no
 * mês (`mesDe`–`mesAte`, qualquer situação). As PAGAS de antes não vêm mais: o recebido chega somado do banco (resumoDoPeriodo).
 * hml-14b (D18): em leituras de 1000 com ordem estável até a última — o `.limit(5000)` de antes virava 1000 calados.
 */
export async function listarCobrancasDoResumo(contaId: string, uid: string, mesDe: string, mesAte: string): Promise<CobrancaResumo[]> {
  const saida: CobrancaResumo[] = [];
  for (let leitura = 1; leitura <= MAX_LEITURAS_COBRANCAS; leitura += 1) {
    const [de, ate] = intervalo(leitura, COBRANCAS_POR_LEITURA);
    const { data, error } = await principal.from("cobrancas")
      .select("id, paciente_id, nutricionista_id, tipo, descricao, valor, vencimento, status, forma, pago_em, transacao_id, reembolsado_em, enviado_em, created_at, paciente:pacientes(nome)")
      .or(recorteDaConta(contaId, uid)).or(`status.in.(aberta,aguardando_confirmacao),and(vencimento.gte.${mesDe},vencimento.lte.${mesAte})`)
      .is("deleted_at", null).order("id").range(de, ate);
    falhou(error);
    const linhas = (data ?? []) as unknown as CobrancaResumo[];
    saida.push(...linhas);
    if (linhas.length < COBRANCAS_POR_LEITURA) return saida;
  }
  throw new Error("Cobranças em aberto demais para o resumo.");
}
