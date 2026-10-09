/**
 * Painel › Alunos (W13): chamadas ao BANCO PRINCIPAL. Leituras por RPC (security definer, pelo auth.uid()); as ações pela
 * função `alunos` (limite da faixa, e-mail do convite pelo Resend, espelho no Treino). A regra toda é do banco.
 */
import { principal } from "@/integrations/principal/client";
import {
  LIMITE_SELETOR, alunoDaTabela, alunoDoSeletor, filtrosParaServidor, normalizarLista, termoDoSeletor, type AlunoDoSeletor, type FiltrosAlunos,
  type ListaAlunos, type ModuloAluno, type PacienteDoSeletor, type SituacaoSeletor,
} from "./regras";

export class ErroAlunos extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function rpc<T = unknown>(nome: string, args: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAlunos("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroAlunos("erro_interno", { detalhe: error.message });
  const r = data as unknown;
  if (r && typeof r === "object" && !Array.isArray(r) && (r as Record<string, unknown>).ok === false) {
    const o = r as Record<string, unknown>;
    throw new ErroAlunos(String(o.erro ?? "erro_interno"), o);
  }
  return r as T;
}

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
  const r = await rpc("alunos_da_conta", { p_conta: contaId, p_filtros: filtrosParaServidor(filtros), p_offset: offset, p_limite: limite });
  const lista = normalizarLista(r);
  if (!lista) throw new ErroAlunos("erro_interno");
  return lista;
}

/** H4 (N-66): uma página da exportação — a mesma lista e os mesmos filtros, com as colunas do CSV (apelido, CPF, nascimento, gênero). */
export async function paginaDaExportacao(contaId: string, filtros: FiltrosAlunos, offset: number, limite: number): Promise<ListaAlunos> {
  const r = await rpc("alunos_da_conta", {
    p_conta: contaId, p_filtros: { ...filtrosParaServidor(filtros), exportar: "true" }, p_offset: offset, p_limite: limite,
  });
  const lista = normalizarLista(r);
  if (!lista) throw new ErroAlunos("erro_interno");
  return lista;
}

// ───────────────────────── seletor de aluno (hml-14b, B19 · D16) ─────────────────────────

/**
 * A busca do seletor de aluno: a MESMA lista da página Alunos (alunos_da_conta — só a conta, regra P1, fora da lixeira), com o
 * termo (nome, apelido, e-mail, tag; telefone e CPF pelos dígitos; sem acento desde a D17), só os primeiros `limite` e o total.
 * `exportar` traz apelido e CPF (o Recibo mostra o CPF). Erro do banco → lança (o seletor mostra o erro, nunca "nenhum aluno").
 */
export async function buscarAlunosDoSeletor(
  contaId: string,
  termo: string,
  situacao: SituacaoSeletor,
  limite = LIMITE_SELETOR,
): Promise<{ itens: AlunoDoSeletor[]; total: number }> {
  const q = termoDoSeletor(termo);
  const r = await rpc("alunos_da_conta", {
    p_conta: contaId, p_filtros: { situacao, ...(q ? { q } : {}), exportar: "true" }, p_offset: 0, p_limite: limite,
  });
  const lista = normalizarLista(r);
  if (!lista) throw new ErroAlunos("erro_interno");
  return { itens: lista.itens.map(alunoDoSeletor), total: lista.total };
}

/**
 * O aluno já escolhido (o `?aluno=` da Agenda, a consulta, a movimentação ou a resposta que já têm aluno), lido pelo id: só desta
 * conta e fora da lixeira — a RLS de pacientes confere o resto (P1). Não achou (removido, de outra conta, sem acesso) = null.
 */
export async function alunoDoSeletorPorId(contaId: string, id: string): Promise<AlunoDoSeletor | null> {
  if (!online()) throw new ErroAlunos("sem_internet");
  // `as never`: o caminho no jsonb (config->>conta_excluida_em) estoura a inferência de tipos do supabase-js (TS2589)
  const { data, error } = await principal
    .from("pacientes" as never)
    .select("id, nome, apelido, email, telefone, cpf, foto_url, ativo, acesso_bloqueado_em, user_id, personal_id, nutricionista_id, conta_excluida_em:config->>conta_excluida_em")
    .eq("id", id)
    .eq("conta_id", contaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ErroAlunos("erro_interno", { detalhe: error.message });
  return data ? alunoDaTabela(data as unknown as PacienteDoSeletor) : null;
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
  const r = await rpc<ConviteAluno[]>("aluno_convites", { p_conta: contaId });
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
  const r = await rpc<CadastroPendente[]>("alunos_pendentes", { p_conta: contaId });
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
