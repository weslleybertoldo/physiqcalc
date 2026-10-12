/**
 * Perfil do aluno no painel (W14): chamadas ao BANCO PRINCIPAL (funções security definer da migração
 * 20260930160000_w14_ajustes.sql — a regra de quem vê e quem edita mora lá) e, para quem tem treino, ao Banco do Treino
 * (admin-get-user / admin-update-user, as mesmas do "Configurar aluno" antigo: altura, peso e o cadastro de lá).
 * hml-20b (H-42 · jeito 2, etapa 2): a LEITURA do perfil (a casca: cabeçalho, KPIs e cards) vai pela função nutricao, consulta
 * aluno_perfil — a MESMA RPC lá, como a pessoa, no lote da tela (src/nutricao/leitura.ts). O erro chega como antes: o código na
 * mensagem do ErroPerfil (o sem_acesso/aluno_inexistente/sem_login que a w14_matricula_da_rota levanta, o { ok:false, erro } da RPC; a
 * rede que caiu → sem_internet, que a tela traduz como "Sem conexão…"). As gravações e o aviso da P15 seguem como estão (H-43).
 */
import { principal } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import type { AjustesAluno, ChaveAjuste, MensagensDesligadas, PerfilAluno, PerfilTreinoAluno } from "./tipos";

export class ErroPerfil extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroPerfil("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroPerfil(error.message || "erro_interno");
  const r = data as unknown;
  if (r && typeof r === "object" && !Array.isArray(r) && (r as { ok?: unknown }).ok === false) {
    throw new ErroPerfil(String((r as { erro?: unknown }).erro ?? "erro_interno"), r as Record<string, unknown>);
  }
  return r as T;
}

/** O erro de uma leitura pela função no formato do perfil: o código na mensagem; a rede que caiu → sem_internet (como antes). */
function erroDoPerfil(e: unknown): ErroPerfil {
  if (e instanceof ErroLeitura) return new ErroPerfil(e.codigo === "rede" ? "sem_internet" : e.codigo, e.extra);
  return new ErroPerfil("erro_interno");
}

/** O perfil pelo id da rota do painel (a matrícula ou o id do Treino). */
export async function buscarPerfilAluno(alunoId: string): Promise<PerfilAluno> {
  let valor: unknown;
  try {
    valor = (await lerNutricao("aluno_perfil", { aluno: alunoId })).valor;
  } catch (e) {
    throw erroDoPerfil(e);
  }
  if (valor && typeof valor === "object" && !Array.isArray(valor) && (valor as { ok?: unknown }).ok === false) {
    throw new ErroPerfil(String((valor as { erro?: unknown }).erro ?? "erro_interno"), valor as Record<string, unknown>);
  }
  const r = valor as PerfilAluno;
  return {
    ...r,
    tags: Array.isArray(r.tags) ? r.tags : [],
    modulos: (Array.isArray(r.modulos) ? r.modulos : []).filter((m) => m === "treino" || m === "nutricao"),
    conta_modulos: (Array.isArray(r.conta_modulos) ? r.conta_modulos : []).filter((m) => m === "treino" || m === "nutricao"),
  };
}

export async function salvarDadosAluno(alunoId: string, dados: Record<string, unknown>): Promise<PerfilAluno> {
  const r = await rpc<{ ok: true; perfil: PerfilAluno }>("aluno_salvar_dados", { p_aluno: alunoId, p_dados: dados });
  return r.perfil;
}

export async function salvarAjusteAluno(alunoId: string, chave: ChaveAjuste, valor: boolean): Promise<AjustesAluno> {
  const r = await rpc<{ ok: true; ajustes: AjustesAluno }>("aluno_salvar_ajustes", { p_aluno: alunoId, p_ajustes: { [chave]: valor } });
  return r.ajustes;
}

export async function gerarNovoLink(alunoId: string): Promise<string> {
  const r = await rpc<{ ok: true; link_codigo: string }>("aluno_novo_link", { p_aluno: alunoId });
  return r.link_codigo;
}

// ───────────────────────── aviso único da P15 (mensagens desligadas) ─────────────────────────

export async function buscarMensagensDesligadas(): Promise<MensagensDesligadas | null> {
  const r = await rpc<MensagensDesligadas | null>("mensagens_desligadas", {});
  if (!r) return null;
  return { ...r, alunos: Array.isArray(r.alunos) ? r.alunos : [] };
}

export async function ligarMensagensParaTodos(ids: string[]): Promise<number> {
  const r = await rpc<{ ok: true; ligados: number }>("mensagens_ligar_para_todos", { p_ids: ids });
  return Number(r.ligados) || 0;
}

export async function fecharAvisoMensagens(): Promise<void> {
  await rpc("mensagens_aviso_fechar", {});
}

// ───────────────────────── Banco do Treino (quem tem treino) ─────────────────────────

export interface DadosTreino {
  profile: PerfilTreinoAluno;
  avaliacoes: Record<string, unknown>[];
}

export async function buscarDadosTreino(treinoUserId: string): Promise<DadosTreino | null> {
  const { data, error } = await supabase.functions.invoke("admin-get-user", { body: { userId: treinoUserId } });
  if (error) throw error;
  const d = data as { profile?: PerfilTreinoAluno; avaliacoes?: Record<string, unknown>[] } | null;
  return d?.profile ? { profile: d.profile, avaliacoes: Array.isArray(d.avaliacoes) ? d.avaliacoes : [] } : null;
}

export async function salvarNoTreino(treinoUserId: string, dados: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke("admin-update-user", { body: { userId: treinoUserId, data: dados } });
  if (error) throw error;
}
