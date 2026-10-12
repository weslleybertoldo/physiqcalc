// Physiq W19 — acesso a dados do Painel › Financeiro no banco principal (a porta de src/lib/financeiro.ts e src/lib/recibos.ts do
// PhysiqNutri, main ca9f66f, para a CONTA ATIVA). Quem vê o quê (spec 4.1, P6) é a RLS de hoje: cada profissional os seus; o dono
// da conta, os da conta inteira (políticas "dono da conta"). O filtro daqui só RECORTA a conta ativa: as linhas da conta + as do
// próprio profissional sem conta (as antigas: o site do Nutri — fora do ar desde 02/10 — e a semente do Financeiro do aluno até a
// hml-19d gravavam sem conta_id) — o master não vê as de todo mundo.
// Exclusão é SOFT (deleted_at → Lixeira). O número do recibo vem do gatilho do banco (sequencial por profissional, nunca volta).
// hml-14b (B21 · D14): Lançamentos e Recibos chegam por PÁGINA (20) do banco, com o total, os totais e a busca calculados lá
// (financeiro_lancamentos, financeiro_resumo_periodo e financeiro_recibos — a migration 20261009010000, com as mesmas regras e o
// mesmo "quem vê o quê" de antes); o Resumo e o Dashboard recebem o recebido já somado por dia.
// hml-19d (H-41 · jeito 2): as GRAVAÇÕES (movimentações, categorias, modelos, recibos e as sementes do 1º acesso) saem do navegador e vão
// pela função financeiro (src/financeiro/gravar.ts), com as MESMAS assinaturas e a mesma volta (o select de hoje mora no servidor:
// _shared/financeiro-gravar-regras.ts VOLTA_*). As leituras seguem aqui. O recibo emitido e o excluído viram 1 chamada (antes, 2 a 3
// pedidos sem transação); o erro chega com o texto fixo do código (o nome repetido da categoria segue com a frase de hoje).
// hml-20d (H-42 · jeito 2, etapa 2, parte 4): as LEITURAS também saem do navegador e vão pela função financeiro (ação `ler`, em lote:
// src/financeiro/ler.ts — as comuns do Financeiro e as da aba aberta numa chamada só), com as MESMAS assinaturas e os mesmos tipos de
// volta: as 3 RPCs da conta (fin_resumo_periodo, fin_lancamentos, fin_recibos — os 4 códigos de propósito com as frases de hoje e o resto
// "Não deu para carregar o financeiro."), as categorias, os modelos, o último nº, o nome e as cobranças do Resumo (o laço de 1000 até 20
// agora no servidor, num item só; passou de 20 → a frase de hoje). O erro das leituras de tabela chega com o texto fixo do código.
import { POR_PAGINA, deslocamento, type Pagina } from "@/lib/paginacao";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";
import { garantirPadroesFinanceiro, gravarFinanceiro } from "@/financeiro/gravar";
import { ErroLeitura, lerFinanceiro, type ConsultaDoFinanceiro } from "@/financeiro/ler";
import { TEXTO_FILTRO_MAX } from "../../../supabase-principal/functions/_shared/financeiro-leituras";
import { ordenarCategorias, type RegistroMovimentacao, type Totais } from "./financeiroUtil";
import { aplicarTags, ordenarModelosRecibo, type DadosTags } from "@/financeiro/recibos";
import type { CobrancaDoDia, EntradaDoDia, RecebidoDoPeriodo } from "./resumo";
import type { RegistroRecibo } from "./recibosUtil";

// ───────────────────────── as RPCs do Financeiro (hml-14b) — pela função financeiro (hml-20d) ─────────────────────────

const ERROS_RPC: Record<string, string> = {
  sem_login: "Sua sessão expirou. Entre de novo.",
  sem_acesso: "Você não faz mais parte desta conta.",
  conta_inexistente: "Conta não encontrada.",
  periodo_invalido: "Período inválido.",
};
const ERRO_DO_FINANCEIRO = "Não deu para carregar o financeiro.";

/** O erro de uma RPC do Financeiro com a frase de hoje: os 4 códigos de propósito → ERROS_RPC; o resto → "Não deu para carregar o financeiro." */
const erroDaRpc = (codigo: string, extra: Record<string, unknown> = {}): ErroLeitura => new ErroLeitura(codigo, extra, ERROS_RPC[codigo] ?? ERRO_DO_FINANCEIRO);

/** Erro (do servidor ou da RPC) ou `{ ok: false }` → lança (a tela mostra o erro — nunca uma lista vazia no lugar dele). */
async function rpcFinanceiro<T>(q: ConsultaDoFinanceiro, params: Record<string, unknown>): Promise<T> {
  let valor: unknown;
  try {
    valor = (await lerFinanceiro(q, params)).valor;
  } catch (e) {
    throw e instanceof ErroLeitura ? erroDaRpc(e.codigo, e.extra) : erroDaRpc("erro_interno");
  }
  const r = valor as ({ ok?: boolean; erro?: string } & T) | null;
  if (!r || r.ok !== true) throw erroDaRpc(typeof r?.erro === "string" ? r.erro : "erro_interno");
  return r;
}

/** Os textos dos filtros no teto do servidor (TEXTO_FILTRO_MAX: a tela corta antes de mandar — nunca vira "fora do formato"). */
const noTeto = (v: string): string => v.slice(0, TEXTO_FILTRO_MAX);

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
  if (f.tipo) saida.tipo = noTeto(f.tipo);
  if (f.categoria) saida.categoria = noTeto(f.categoria);
  if (f.metodo) saida.metodo = noTeto(f.metodo);
  if (f.q.trim()) saida.q = noTeto(f.q.trim());
  return saida;
};

/**
 * Uma página das movimentações do período (datas yyyy-MM-dd inclusivas) com os filtros, a mais recente primeiro (data, criação),
 * com categoria e aluno, e o total com os filtros — financeiro_lancamentos (filtro, busca sem acento, ordem e contagem no banco).
 */
export async function listarLancamentos(contaId: string, de: string, ate: string, filtros: FiltrosLancamentos, pagina: number,
  porPagina = POR_PAGINA): Promise<Pagina<Transacao>> {
  const r = await rpcFinanceiro<{ total: number; itens: Transacao[] | null }>("fin_lancamentos", {
    conta: contaId, de, ate, filtros: filtrosParaBanco(filtros), offset: deslocamento(pagina, porPagina), limite: porPagina,
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
  return paraTotais(await rpcFinanceiro<RespostaResumo>("fin_resumo_periodo", { conta: contaId, de, ate, filtros: filtrosParaBanco(filtros) }));
}

export type ResumoDoPeriodo = TotaisDoPeriodo & RecebidoDoPeriodo;

/** O Resumo e o Dashboard: os totais do período + o recebido por dia (entradas por dia e categoria, cobranças pagas sem lançamento). */
export async function resumoDoPeriodo(contaId: string, de: string, ate: string): Promise<ResumoDoPeriodo> {
  const r = await rpcFinanceiro<RespostaResumo>("fin_resumo_periodo", { conta: contaId, de, ate, filtros: { resumo: true } });
  return { ...paraTotais(r), entradasPorDia: r.entradas_por_dia ?? [], cobrancasPorDia: r.cobrancas_por_dia ?? [] };
}

const colunas = (r: RegistroMovimentacao) => ({
  tipo: r.tipo, descricao: r.descricao, valor: r.valor, data: r.data, categoria_id: r.categoria_id, metodo: r.metodo, paciente_id: r.paciente_id,
  observacao: r.observacao,
});

/** A movimentação nova (o dono é quem chama, no servidor — o `uid` fica só por compatibilidade), com a categoria e o aluno de volta. */
export async function criarTransacao(uid: string, contaId: string, r: RegistroMovimentacao): Promise<Transacao> {
  const { linha } = await gravarFinanceiro<{ linha: Transacao }>("transacao_criar", { ...colunas(r), conta_id: contaId });
  return linha;
}

export async function atualizarTransacao(id: string, r: RegistroMovimentacao): Promise<Transacao> {
  const { linha } = await gravarFinanceiro<{ linha: Transacao }>("transacao_editar", { id, ...colunas(r) });
  return linha;
}

/** Estornar (true) tira a movimentação dos totais sem apagar; desfazer (false) volta. */
export async function marcarEstorno(id: string, estornada: boolean): Promise<Transacao> {
  const { linha } = await gravarFinanceiro<{ linha: Transacao }>("transacao_estornar", { id, estornada });
  return linha;
}

/** Soft delete (Lixeira; 0 linha → nao_encontrado — antes dizia "excluída" calado). */
export async function excluirTransacao(id: string): Promise<void> {
  await gravarFinanceiro("transacao_excluir", { id });
}

// ───────────────────────── categorias (de cada profissional) ─────────────────────────

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  nutricionista_id: string;
}

/** As minhas categorias vivas (fin_categorias: o dono é quem chama, no servidor — o `uid` fica só por compatibilidade). */
export async function listarCategorias(uid: string): Promise<CategoriaFinanceira[]> {
  const { linhas } = await lerFinanceiro("fin_categorias");
  return ordenarCategorias((linhas ?? []) as CategoriaFinanceira[]);
}

/**
 * Lista as categorias; sem nenhuma, a função semeia as 6 padrão (1º acesso — financeiro › padroes_garantir: 1 chamada, com a conta e com
 * trava no servidor; junto, o "Recibo padrão" se faltar). A semente que falha não derruba a tela: relê, como antes.
 */
export async function garantirCategorias(uid: string, contaId: string | null): Promise<CategoriaFinanceira[]> {
  const lista = await listarCategorias(uid);
  if (lista.length) return lista;
  try {
    const r = await garantirPadroesFinanceiro(contaId);
    return ordenarCategorias(r.categorias.map(({ id, nome, nutricionista_id }) => ({ id, nome, nutricionista_id })));
  } catch {
    return listarCategorias(uid);
  }
}

/** O nome repetido (sem caixa) entre as vivas → "Já existe uma categoria com esse nome" (o código nome_repetido da função). */
export async function criarCategoria(uid: string, contaId: string | null, nome: string): Promise<CategoriaFinanceira> {
  const { linha } = await gravarFinanceiro<{ linha: CategoriaFinanceira }>("categoria_criar", { conta_id: contaId, nome: nome.trim() });
  return linha;
}

export async function renomearCategoria(id: string, nome: string): Promise<CategoriaFinanceira> {
  const { linha } = await gravarFinanceiro<{ linha: CategoriaFinanceira }>("categoria_renomear", { id, nome: nome.trim() });
  return linha;
}

/** Soft delete — as movimentações antigas continuam com a categoria (pelo id). */
export async function excluirCategoria(id: string): Promise<void> {
  await gravarFinanceiro("categoria_excluir", { id });
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

/** Uma página de recibos + o total e a SOMA dos valores de todos os que passam na busca. */
export interface PaginaRecibos extends Pagina<Recibo> {
  soma: number;
}

/**
 * Recibos vivos da conta ativa, o mais recente primeiro (data, número), por página — financeiro_recibos: a busca (aluno, descrição,
 * número com 4 dígitos, descrição da entrada de origem; sem acento, todas as palavras), o total e a soma saem do banco.
 */
export async function listarRecibos(contaId: string, busca: string, pagina: number, porPagina = POR_PAGINA): Promise<PaginaRecibos> {
  const r = await rpcFinanceiro<{ total: number; soma: number | string; itens: Recibo[] | null }>("fin_recibos", {
    conta: contaId, filtros: busca.trim() ? { q: noTeto(busca.trim()) } : {}, offset: deslocamento(pagina, porPagina), limite: porPagina,
  });
  return { itens: r.itens ?? [], total: numero(r.total), soma: numero(r.soma) };
}

/** Quantos recibos com a data no período (o "Recibos no mês" do Dashboard): a mesma função da lista, só o total. */
export async function contarRecibos(contaId: string, de: string, ate: string): Promise<number> {
  const r = await rpcFinanceiro<{ total: number }>("fin_recibos", { conta: contaId, filtros: { de, ate }, offset: 0, limite: 0 });
  return numero(r.total);
}

/**
 * Maior número já emitido pelo profissional (inclusive os da lixeira — número não volta); 0 sem recibo. A prévia mostra o próximo.
 * hml-20d: fin_ultimo_recibo (o dono é quem chama, no servidor; sem o filtro das vivas, como hoje).
 */
export async function ultimoNumeroRecibo(uid: string): Promise<number> {
  const { linhas } = await lerFinanceiro("fin_ultimo_recibo");
  return ((linhas ?? []) as { numero: number }[])[0]?.numero ?? 0;
}

/** Os meus modelos vivos (fin_modelos_recibo: o dono é quem chama, no servidor), o favorito primeiro. */
export async function listarModelosRecibo(uid: string): Promise<ModeloRecibo[]> {
  const { linhas } = await lerFinanceiro("fin_modelos_recibo");
  return ordenarModelosRecibo((linhas ?? []) as ModeloRecibo[]);
}

/**
 * Lista os modelos; sem nenhum, a função semeia o "Recibo padrão" favorito (financeiro › padroes_garantir — o texto pelo papel da pessoa
 * NA conta, escolhido no servidor: o do Nutri para a nutricionista, o mesmo do padraoDoRecibo da tela; o `conteudoPadrao` fica só por
 * compatibilidade). 1 chamada, com a conta e com trava; junto, as 6 categorias se faltarem.
 */
export async function garantirModelosRecibo(uid: string, contaId: string | null, _conteudoPadrao: string): Promise<ModeloRecibo[]> {
  const lista = await listarModelosRecibo(uid);
  if (lista.length) return lista;
  const r = await garantirPadroesFinanceiro(contaId);
  return ordenarModelosRecibo(r.modelos.map(({ id, nutricionista_id, titulo, conteudo, favorito }) => ({ id, nutricionista_id, titulo, conteudo, favorito })));
}

export type DadosModeloRecibo = { titulo: string; conteudo: string; favorito: boolean };

export async function criarModeloRecibo(uid: string, contaId: string | null, d: DadosModeloRecibo): Promise<ModeloRecibo> {
  const { linha } = await gravarFinanceiro<{ linha: ModeloRecibo }>("modelo_recibo_criar", {
    conta_id: contaId, titulo: d.titulo.trim(), conteudo: d.conteudo, favorito: d.favorito,
  });
  return linha;
}

export async function atualizarModeloRecibo(id: string, patch: Partial<DadosModeloRecibo>): Promise<ModeloRecibo> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.conteudo !== undefined) dados.conteudo = patch.conteudo;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { linha } = await gravarFinanceiro<{ linha: ModeloRecibo }>("modelo_recibo_editar", { id, ...dados });
  return linha;
}

/** Soft delete — os recibos já emitidos guardam o texto final e não dependem do modelo. */
export async function excluirModeloRecibo(id: string): Promise<void> {
  await gravarFinanceiro("modelo_recibo_excluir", { id });
}

/**
 * Emite o recibo numa chamada só (financeiro › recibo_emitir; antes, 2 a 3 pedidos sem transação): o número vem do gatilho; quando nasce de
 * uma movimentação, ela passa a apontar para ele (transacoes.recibo_id); o texto é o de hoje (as tags aplicadas e o normalizarConteudo do
 * formParaRegistro) com a MARCA no lugar do número — o servidor põe o número REAL, e o texto salvo sai igual ao que a tela montava com
 * o número certo. Um texto que não vem do modelo (outro caminho) vai como está.
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
  const doModelo = normalizarConteudo(aplicarTags(p.conteudoModelo, { ...p.dadosTags, numero: p.numeroPrevisto }));
  const texto = p.registro.texto === doModelo ? normalizarConteudo(aplicarTags(p.conteudoModelo, p.dadosTags, { numeroNoServidor: true })) : p.registro.texto;
  const { linha } = await gravarFinanceiro<{ linha: Recibo }>("recibo_emitir", {
    conta_id: p.contaId, paciente_id: p.pacienteId, transacao_id: p.transacaoId, modelo_id: p.registro.modelo_id, valor: p.registro.valor,
    data: p.registro.data, descricao: p.registro.descricao, texto,
  });
  return linha;
}

/** Soft delete; a movimentação de origem volta a ficar sem recibo (pode ganhar outro) — juntos (financeiro › recibo_excluir; antes, 2 pedidos). */
export async function excluirRecibo(id: string): Promise<void> {
  await gravarFinanceiro("recibo_excluir", { id });
}

// ───────────────────────── o aluno do recibo, nomes e cobranças (o resumo) ─────────────────────────

/** O aluno de um recibo (o da entrada, o da aba do aluno ou o escolhido no SeletorDeAluno — hml-14b: não há mais a lista de 1000). */
export interface AlunoResumido {
  id: string;
  nome: string;
  apelido: string | null;
  cpf: string | null;
}

/** Nome do profissional como o site antigo assina (profiles.nome) — fin_profissional (quem chama, no servidor); o erro → null, como hoje. */
export async function nomeDoProfissional(uid: string): Promise<string | null> {
  try {
    const { linhas } = await lerFinanceiro("fin_profissional");
    return ((linhas ?? []) as { nome: string | null }[])[0]?.nome || null;
  } catch {
    return null;
  }
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

/** A frase de hoje quando as cobranças passam do teto de leituras (o laço agora é no servidor: muitas_linhas). */
const ERRO_COBRANCAS_DEMAIS = "Cobranças em aberto demais para o resumo.";

/**
 * Cobranças da conta para o Resumo (o "a receber" e a rosca do mês): as em aberto/aguardando (qualquer data) + as que vencem no
 * mês (`mesDe`–`mesAte`, qualquer situação). As PAGAS de antes não vêm mais: o recebido chega somado do banco (resumoDoPeriodo).
 * hml-14b (D18): em leituras de 1000 com ordem estável até a última — o `.limit(5000)` de antes virava 1000 calados.
 * hml-20d: fin_cobrancas_resumo — o recorte da conta ativa (com quem chama, no servidor: o `uid` fica só por compatibilidade), o "em
 * aberto OU no mês" e as leituras de 1000 até 20 NO SERVIDOR, num item só; passou de 20 → a frase de hoje.
 */
export async function listarCobrancasDoResumo(contaId: string, uid: string, mesDe: string, mesAte: string): Promise<CobrancaResumo[]> {
  try {
    const { linhas } = await lerFinanceiro("fin_cobrancas_resumo", { conta: contaId, de: mesDe, ate: mesAte });
    return (linhas ?? []) as CobrancaResumo[];
  } catch (e) {
    if (e instanceof ErroLeitura && e.codigo === "muitas_linhas") throw new ErroLeitura(e.codigo, e.extra, ERRO_COBRANCAS_DEMAIS);
    throw e;
  }
}
