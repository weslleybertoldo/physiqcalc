/**
 * Configurações › Equipe e Convite (W5): chamadas ao BANCO PRINCIPAL. A regra toda é do banco (funções security definer
 * pelo auth.uid()); o e-mail do convite sai pela função `convites` (Resend, remetente de hoje).
 */
import { principal } from "@/integrations/principal/client";
import { normalizarEquipe, type Equipe, type PapelModulo } from "./regras";

export class ErroEquipe extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function rpc<T = Record<string, unknown>>(nome: string, args: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroEquipe("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroEquipe("erro_interno", { detalhe: error.message });
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) throw new ErroEquipe(String(r.erro ?? "erro_interno"), r);
  return r as T;
}

export async function buscarEquipe(contaId: string): Promise<Equipe> {
  const r = await rpc("equipe_da_conta", { p_conta: contaId });
  const e = normalizarEquipe(r);
  if (!e) throw new ErroEquipe("erro_interno");
  return e;
}

export interface ResultadoConvite {
  convite_id: string;
  reenvio: boolean;
  email: string;
  papeis: PapelModulo[];
  email_enviado: boolean;
  email_teste: boolean;
  erro_email: string | null;
  link: string;
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

async function funcaoConvites<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroEquipe("sem_internet");
  const { data, error } = await principal.functions.invoke("convites", { body: corpo });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroEquipe(String(c?.erro ?? "erro_interno"), c ?? {});
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) throw new ErroEquipe(String(r.erro ?? "erro_interno"), r);
  return r as T;
}

/** Convida (ou reenvia, se o e-mail já tem convite pendente) e manda o e-mail. */
export function convidarMembro(contaId: string, email: string, papeis: PapelModulo[]): Promise<ResultadoConvite> {
  return funcaoConvites<ResultadoConvite>({ acao: "convidar", conta_id: contaId, email: email.trim().toLowerCase(), papeis });
}

export function cancelarConviteMembro(conviteId: string): Promise<{ ok: true }> {
  return funcaoConvites<{ ok: true }>({ acao: "cancelar", convite_id: conviteId });
}

export function alterarPapeisMembro(membroId: string, papeis: string[]): Promise<{ papeis: string[]; alunos_sem_treino: number; alunos_sem_nutricao: number }> {
  return rpc("alterar_papeis_membro", { p_membro: membroId, p_papeis: papeis });
}

export function removerMembro(membroId: string, novoPersonal: string | null, novoNutri: string | null): Promise<{ alunos_treino: number; alunos_nutricao: number }> {
  return rpc("remover_membro", { p_membro: membroId, p_novo_personal: novoPersonal, p_novo_nutri: novoNutri });
}

export async function garantirMeuCodigo(contaId: string): Promise<string> {
  const r = await rpc<{ codigo: string }>("garantir_meu_codigo", { p_conta: contaId });
  return r.codigo;
}
