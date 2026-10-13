/**
 * Painel › Alunos (W13): chamadas ao BANCO PRINCIPAL. Leituras por RPC (security definer, pelo auth.uid()); as ações pela
 * função `alunos` (limite da faixa, e-mail do convite pelo Resend, espelho no Treino). A regra toda é do banco.
 * hml-21b (H-43 · jeito 2, etapa 3): as LEITURAS (a lista — e o número do menu, a Busca, o seletor e a exportação —, o aluno do seletor,
 * os convites e os pendentes) vão pela função conta, COM A SESSÃO de quem está logado (as mesmas RPCs e o mesmo select, no servidor; o
 * lote da volta junta o que a tela pede junto). As ações seguem pela função `alunos` (decisão C). O erro: o mesmo de hoje — sem internet
 * antes de chamar; o { ok: false, erro } da RPC com o código dela; o resto (o banco, a função) = erro_interno, com o código no extra.
 */
import { principal } from "@/integrations/principal/client";
import { codigoDaLeitura, lerConta, type ConsultaDaConta } from "@/conta/ler";
import type { OpcoesLeitura } from "@/integrations/leituraEmLote";
import {
  LIMITE_SELETOR, PAGINA_EXPORTACAO, alunoDaTabela, alunoDoSeletor, filtrosParaServidor, normalizarLista, termoDoSeletor, type AlunoDoSeletor,
  type FiltrosAlunos, type ListaAlunos, type ModuloAluno, type PacienteDoSeletor, type SituacaoSeletor,
} from "./regras";

export class ErroAlunos extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/** O erro de uma leitura pela conta: sem internet como hoje; o resto (o banco, a função) = erro_interno com o código no extra (a tela tem
 * a frase do erro_interno — a de hoje para qualquer erro do banco). */
function erroDaLeitura(e: unknown): ErroAlunos {
  const codigo = codigoDaLeitura(e);
  return codigo === "sem_internet" ? new ErroAlunos("sem_internet") : new ErroAlunos("erro_interno", { codigo });
}

/** A RPC de leitura pela conta (o valor como veio); o { ok: false, erro } dela → ErroAlunos com o código (como hoje). */
async function ler<T = unknown>(q: ConsultaDaConta, params: Record<string, unknown>, opcoes?: OpcoesLeitura): Promise<T> {
  if (!online()) throw new ErroAlunos("sem_internet");
  let r: unknown;
  try {
    r = (await lerConta(q, params, opcoes)).valor;
  } catch (e) {
    throw erroDaLeitura(e);
  }
  if (r && typeof r === "object" && !Array.isArray(r) && (r as Record<string, unknown>).ok === false) {
    const o = r as Record<string, unknown>;
    throw new ErroAlunos(String(o.erro ?? "erro_interno"), o);
  }
  return r as T;
}

/** As páginas pesadas (a exportação e o "selecionar todos", de 500) vão num lote só delas: não seguram a tela. */
const pesada = (limite: number): OpcoesLeitura | undefined => (limite >= PAGINA_EXPORTACAO ? { sozinha: true } : undefined);

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function funcaoAlunos<T = Record<string, unknown>>(corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAlunos("sem_internet");
  const { data, error } = await principal.functions.invoke("alunos", { body: corpo });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroAlunos(String(c?.erro ?? "erro_interno"), c ?? {});
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) throw new ErroAlunos(String(r.erro ?? "erro_interno"), r);
  return r as T;
}

// ───────────────────────── leituras ─────────────────────────

export async function listarAlunos(contaId: string, filtros: FiltrosAlunos, offset: number, limite: number): Promise<ListaAlunos> {
  const r = await ler("alunos_da_conta", { conta: contaId, filtros: filtrosParaServidor(filtros), offset, limite }, pesada(limite));
  const lista = normalizarLista(r);
  if (!lista) throw new ErroAlunos("erro_interno");
  return lista;
}

/** H4 (N-66): uma página da exportação — a mesma lista e os mesmos filtros, com as colunas do CSV (apelido, CPF, nascimento, gênero). */
export async function paginaDaExportacao(contaId: string, filtros: FiltrosAlunos, offset: number, limite: number): Promise<ListaAlunos> {
  const r = await ler("alunos_da_conta", { conta: contaId, filtros: { ...filtrosParaServidor(filtros), exportar: "true" }, offset, limite }, pesada(limite));
  const lista = normalizarLista(r);
  if (!lista) throw new ErroAlunos("erro_interno");
  return lista;
}

// ───────────────────────── seletor de aluno (hml-14b, B19 · D16) ─────────────────────────

/**
 * A busca do seletor de aluno: a MESMA lista da página Alunos (alunos_da_conta — só a conta, regra P1, fora da lixeira), com o
 * termo (nome, apelido, e-mail, tag; telefone e CPF pelos dígitos; sem acento desde a D17), só os primeiros `limite` e o total.
 * `comCpf` (só o Recibo, que imprime o CPF) pede o `exportar`: apelido e CPF vêm junto. Nos outros campos a busca pelo CPF
 * continua no banco, mas o CPF não vem para o navegador (dado pessoal mínimo). Erro do banco → lança (o seletor mostra o erro,
 * nunca "nenhum aluno").
 */
export async function buscarAlunosDoSeletor(
  contaId: string,
  termo: string,
  situacao: SituacaoSeletor,
  limite = LIMITE_SELETOR,
  comCpf = false,
): Promise<{ itens: AlunoDoSeletor[]; total: number }> {
  const q = termoDoSeletor(termo);
  const r = await ler("alunos_da_conta", { conta: contaId, filtros: { situacao, ...(q ? { q } : {}), ...(comCpf ? { exportar: "true" } : {}) }, offset: 0, limite });
  const lista = normalizarLista(r);
  if (!lista) throw new ErroAlunos("erro_interno");
  return { itens: lista.itens.map(alunoDoSeletor), total: lista.total };
}

/**
 * O aluno já escolhido (o `?aluno=` da Agenda, a consulta, a movimentação ou a resposta que já têm aluno), lido pelo id: só desta
 * conta e fora da lixeira — a RLS de pacientes confere o resto (P1). Não achou (removido, de outra conta, sem acesso) = null.
 * O CPF só vem com `comCpf` (o Recibo); nos outros campos, não (dado pessoal mínimo).
 */
export async function alunoDoSeletorPorId(contaId: string, id: string, comCpf = false): Promise<AlunoDoSeletor | null> {
  if (!online()) throw new ErroAlunos("sem_internet");
  let linhas: unknown[];
  try {
    linhas = (await lerConta("aluno_do_seletor", { conta: contaId, id, ...(comCpf ? { com_cpf: true } : {}) })).linhas ?? [];
  } catch (e) {
    throw erroDaLeitura(e);
  }
  const data = linhas[0];
  return data ? alunoDaTabela(data as PacienteDoSeletor) : null;
}

export interface ConviteAluno {
  id: string;
  email: string;
  status: "pendente" | "aceito";
  modulos: ModuloAluno[];
  enviado_em: string;
  aceito_em: string | null;
  responsavel: { id: string; nome: string | null } | null;
}

export async function listarConvites(contaId: string): Promise<ConviteAluno[]> {
  const r = await ler<ConviteAluno[]>("aluno_convites", { conta: contaId });
  return Array.isArray(r) ? r : [];
}

export interface CadastroPendente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  nascimento: string | null;
  genero: string | null;
  observacoes: string | null;
  criado_em: string;
  profissional: { id: string; nome: string | null };
}

export async function listarPendentes(contaId: string): Promise<CadastroPendente[]> {
  const r = await ler<CadastroPendente[]>("alunos_pendentes", { conta: contaId });
  return Array.isArray(r) ? r : [];
}

// ───────────────────────── ações (função alunos) ─────────────────────────

export interface DadosNovoAluno {
  nome: string;
  email?: string;
  telefone?: string;
  nascimento?: string;
  genero?: string;
  tags?: string[];
  modulos: ModuloAluno[];
  personal_id?: string | null;
  nutricionista_id?: string | null;
}

export function criarAluno(contaId: string, dados: DadosNovoAluno) {
  return funcaoAlunos<{ paciente_id: string; rota_id: string }>({ acao: "criar", conta_id: contaId, dados });
}

export interface ResultadoConviteAluno {
  convite_id: string;
  reenvio: boolean;
  email: string;
  email_enviado: boolean;
  email_teste: boolean;
  erro_email: string | null;
  link: string;
}

export function convidarAluno(contaId: string, email: string, modulos: ModuloAluno[], responsavelId: string | null) {
  return funcaoAlunos<ResultadoConviteAluno>({ acao: "convidar", conta_id: contaId, email: email.trim().toLowerCase(), modulos, responsavel_id: responsavelId });
}

export function cancelarConviteAluno(conviteId: string) {
  return funcaoAlunos({ acao: "cancelar_convite", convite_id: conviteId });
}

export function reenviarConviteAluno(conviteId: string) {
  return funcaoAlunos<ResultadoConviteAluno>({ acao: "reenviar_convite", convite_id: conviteId });
}

export type AcaoAluno = "bloquear" | "desbloquear" | "desativar" | "reativar" | "remover";

export function acaoNoAluno(acao: AcaoAluno, alunoId: string, mensagem?: string | null) {
  return funcaoAlunos<{ paciente_id: string; so_responsavel?: boolean }>({ acao, aluno_id: alunoId, ...(mensagem ? { mensagem } : {}) });
}

export function atribuirAlunos(contaId: string, alunos: string[], modulo: ModuloAluno, responsavelId: string) {
  return funcaoAlunos<{ atualizados: number }>({ acao: "atribuir", conta_id: contaId, alunos, modulo, responsavel_id: responsavelId });
}

export function decidirPendente(contaId: string, pendenteId: string, aprovar: boolean) {
  return funcaoAlunos<{ paciente_id?: string; rota_id?: string }>({ acao: aprovar ? "aprovar" : "recusar", conta_id: contaId, pendente_id: pendenteId });
}
