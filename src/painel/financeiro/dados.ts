// Physiq W19 — acesso a dados do Painel › Financeiro no banco principal (a porta de src/lib/financeiro.ts e src/lib/recibos.ts do
// PhysiqNutri, main ca9f66f, para a CONTA ATIVA). Quem vê o quê (spec 4.1, P6) é a RLS de hoje: cada profissional os seus; o dono
// da conta, os da conta inteira (políticas "dono da conta"). O filtro daqui só RECORTA a conta ativa: as linhas da conta + as do
// próprio profissional sem conta (o site antigo do Nutri grava sem conta_id até a W28) — o master não vê as de todo mundo.
// Exclusão é SOFT (deleted_at → Lixeira). O número do recibo vem do gatilho do banco (sequencial por profissional, nunca volta).
import { principal } from "@/integrations/principal/client";
import { CATEGORIAS_PADRAO, ordenarCategorias, type RegistroMovimentacao } from "./financeiroUtil";
import { TITULO_MODELO_PADRAO, aplicarTags, ordenarModelosRecibo, type DadosTags } from "@/financeiro/recibos";
import type { RegistroRecibo } from "./recibosUtil";

const falhou = (error: { message: string; code?: string } | null, amigavel?: Record<string, string>): void => {
  if (!error) return;
  throw new Error((error.code && amigavel?.[error.code]) || error.message);
};
const ERROS_CATEGORIA = { "23505": "Já existe uma categoria com esse nome" };
/** Até 2000 movimentações por período — o filtro por tipo/categoria/forma/texto é feito na tela (como no Nutri). */
const LIMITE_PERIODO = 2000;

/** O recorte da conta ativa (PostgREST `or`): as linhas da conta + as minhas sem conta. */
export const recorteDaConta = (contaId: string, uid: string): string => `conta_id.eq.${contaId},and(conta_id.is.null,nutricionista_id.eq.${uid})`;

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

/** Movimentações do período (datas yyyy-MM-dd inclusivas), mais recente primeiro, com categoria e aluno. */
export async function listarTransacoes(contaId: string, uid: string, de: string, ate: string): Promise<Transacao[]> {
  const { data, error } = await principal.from("transacoes").select(SELECT_TX).or(recorteDaConta(contaId, uid)).is("deleted_at", null)
    .gte("data", de).lte("data", ate).order("data", { ascending: false }).order("created_at", { ascending: false }).limit(LIMITE_PERIODO);
  falhou(error);
  return (data ?? []) as unknown as Transacao[];
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

/** Recibos vivos da conta ativa, o mais recente primeiro. */
export async function listarRecibos(contaId: string, uid: string): Promise<Recibo[]> {
  const { data, error } = await principal.from("recibos").select(SELECT_RECIBO).or(recorteDaConta(contaId, uid)).is("deleted_at", null)
    .order("data", { ascending: false }).order("numero", { ascending: false }).limit(1000);
  falhou(error);
  return (data ?? []) as unknown as Recibo[];
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

/** Cobranças da conta para o Resumo: as em aberto/aguardando (qualquer data) + as pagas desde `desdeIso`. */
export async function listarCobrancasDoResumo(contaId: string, uid: string, desdeIso: string): Promise<CobrancaResumo[]> {
  const { data, error } = await principal.from("cobrancas")
    .select("id, paciente_id, nutricionista_id, tipo, descricao, valor, vencimento, status, forma, pago_em, transacao_id, reembolsado_em, enviado_em, created_at, paciente:pacientes(nome)")
    .or(recorteDaConta(contaId, uid)).or(`status.in.(aberta,aguardando_confirmacao),pago_em.gte.${desdeIso}`).is("deleted_at", null).limit(5000);
  falhou(error);
  return (data ?? []) as unknown as CobrancaResumo[];
}
