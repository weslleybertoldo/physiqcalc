/**
 * Painel master (W27): chamadas às 3 funções do BANCO PRINCIPAL — master-contas, master-financeiro e master-planos (que conferem
 * o master: quem não é recebe 403). A regra mora no banco (master_* da migração 20261002010000_w27_master.sql). Os treinos
 * prontos (Banco do Treino) vão pelo cliente do Treino, com a sessão da troca de token (RLS: só o master escreve).
 */
import { principal } from "@/integrations/principal/client";
import type {
  Aluno,
  ContaLinha,
  DetalheConta,
  ListaAlunos,
  PaginaAlunosDoApp,
  PaginaContas,
  PaginaFinanceiro,
  PaginaIntegracoes,
  PaginaSemConta,
  PlanosMaster,
  Prato,
  VisaoGeral,
} from "./tipos";

export class ErroMaster extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

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

export type FuncaoMaster = "master-contas" | "master-financeiro" | "master-planos";

export async function chamar<T = Record<string, unknown>>(funcao: FuncaoMaster, corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroMaster("sem_internet");
  const { data, error } = await principal.functions.invoke(funcao, { body: corpo });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroMaster(String(c?.erro ?? (c?.code === "UNAUTHORIZED_NO_AUTH_HEADER" ? "sem_login" : "erro_interno")), c ?? {});
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) throw new ErroMaster(String(r.erro ?? "erro_interno"), r);
  return r as T;
}

/**
 * hml-14d (B21 · D28): as listas do master vêm em PÁGINAS de 20 do banco — o pedido leva `pagina` e a resposta traz `total`.
 * Resposta sem `total` (função ou banco de antes) = erro na tela, nunca uma lista que parece completa e não é.
 */
async function pagina<T extends { total: number }>(funcao: FuncaoMaster, corpo: Record<string, unknown>): Promise<T> {
  const r = await chamar<T>(funcao, corpo);
  if (!Number.isInteger(r.total) || r.total < 0) throw new ErroMaster("formato_inesperado");
  return r;
}

// ───────────────────────── master-contas ─────────────────────────
export const visaoGeral = () => chamar<VisaoGeral>("master-contas", { acao: "visao_geral" });
/** Contas: a página `n` com os filtros (situação, origem e a busca — sem acento, no banco). */
export const listarContas = (filtros: Record<string, unknown>, n: number) =>
  pagina<PaginaContas>("master-contas", { acao: "listar", filtros, pagina: n });
export const detalheConta = (contaId: string) => chamar<DetalheConta>("master-contas", { acao: "detalhe", conta_id: contaId });
export const acaoConta = (contaId: string, tipo: string, args: Record<string, unknown> = {}) =>
  chamar<{ conta?: ContaLinha; excluida?: boolean; efeitos?: Record<string, unknown> }>("master-contas", { acao: "acao", conta_id: contaId, tipo, args });

export interface NovaConta {
  email: string;
  nome: string;
  nome_conta: string;
  tipo: "personal" | "nutricionista" | "academico" | "outra_area";
  registro?: string;
  plano: string;
  faixa: string;
  isentar: boolean;
  motivo?: string;
  modo: "senha" | "google";
  senha?: string;
}
export const criarConta = (dados: NovaConta) =>
  chamar<{ conta_id: string; codigo_convite: string | null; login_criado: boolean; user_id: string; conta: ContaLinha }>("master-contas", { acao: "criar", ...dados });
export const tornarMaster = (userId: string) => chamar("master-contas", { acao: "tornar_master", user_id: userId });
export const integracoes = (n: number) => pagina<PaginaIntegracoes>("master-contas", { acao: "integracoes", pagina: n });
export const listarAlunos = (filtros: Record<string, unknown>, offset = 0, limite = 50) =>
  chamar<ListaAlunos>("master-contas", { acao: "alunos", filtros, offset, limite });
export const semConta = (busca: string, n: number) => pagina<PaginaSemConta>("master-contas", { acao: "sem_conta", busca: busca || null, pagina: n });
export const moverAlunos = (p: { pacientes: string[]; usuarios: string[]; conta_id: string; personal_id: string | null; nutricionista_id: string | null }) =>
  chamar<{ movidos: number; erros: Array<{ paciente_id?: string; user_id?: string; erro: string }>; assinatura_app?: { canceladas: number; falhas: number } }>(
    "master-contas", { acao: "mover", ...p });
export const bloquearAluno = (pacienteId: string, bloquear: boolean, mensagem?: string) =>
  chamar("master-contas", { acao: bloquear ? "bloquear_aluno" : "desbloquear_aluno", paciente_id: pacienteId, mensagem: mensagem ?? null });

// ───────────────────────── master-financeiro ─────────────────────────
export const financeiro = (filtro: string, n: number) => pagina<PaginaFinanceiro>("master-financeiro", { acao: "listar", filtro, pagina: n });
export const registrarPagamento = (contaId: string, valor: number, meses: number, pagoEm: string | null, descricao: string | null) =>
  chamar<{ vence_em: string; situacao: string }>("master-financeiro", { acao: "registrar_pagamento", conta_id: contaId, valor, meses, pago_em: pagoEm, descricao });
export const cancelarAssinatura = (contaId: string) => chamar("master-financeiro", { acao: "cancelar_assinatura", conta_id: contaId });
export const reenviarAviso = (contaId: string, mensagem?: string) =>
  chamar<{ titulo: string }>("master-financeiro", { acao: "reenviar_aviso", conta_id: contaId, mensagem: mensagem ?? null });

// ───────────────────────── master-planos ─────────────────────────
export const planos = () => chamar<PlanosMaster>("master-planos", { acao: "listar" });
export const salvarPreco = (p: { plano: string; faixa: string; valor_mensal: number; valor_anual: number | null; ativo: boolean }) =>
  chamar("master-planos", { acao: "salvar_preco", ...p });
export const salvarConfig = (chave: string, valor: unknown) => chamar<{ valor: unknown }>("master-planos", { acao: "salvar_config", chave, valor });
export const pratosProntos = () => chamar<{ pratos: Prato[] }>("master-planos", { acao: "pratos" });
export const salvarPrato = (prato: Record<string, unknown>) => chamar<{ id: string }>("master-planos", { acao: "prato_salvar", prato });
export const buscarAlimentos = (termo: string) =>
  chamar<{ alimentos: Array<{ id: string; nome: string; energia_kcal: number | null; proteina_g: number | null; carboidrato_g: number | null; lipidio_g: number | null }> }>(
    "master-planos", { acao: "buscar_alimentos", termo });
export const alunosDoApp = (n: number, busca: string) => pagina<PaginaAlunosDoApp>("master-planos", { acao: "alunos_app", pagina: n, busca: busca || null });

export type { Aluno };
