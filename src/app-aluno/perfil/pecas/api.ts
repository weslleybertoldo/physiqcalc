/**
 * Perfil do aluno (W7) — acesso a dados, tudo no BANCO PRINCIPAL (online — 9A):
 *   meu_perfil_aluno()        card do aluno e "Meus profissionais"
 *   minha_agenda(p_desde)     a agenda (N-53)
 *   exportar-meus-dados       o JSON dos 2 bancos (a função junta o Banco do Treino servidor → servidor)
 *   excluir-minha-conta       conferir (simular) e excluir (P19)
 */
import { principal } from "@/integrations/principal/client";
import { nomeDoArquivo, PALAVRA_CONFIRMACAO } from "../../../../supabase-principal/functions/_shared/conta-aluno-regras";
import type { AgendamentoAluno, PapelProfissional } from "./regras";

export { PALAVRA_CONFIRMACAO };

export class ErroPerfil extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

export interface ProfissionalDoAluno {
  id: string;
  papel: PapelProfissional;
  nome: string;
  foto_url: string | null;
  whatsapp: string | null;
  conta_nome: string | null;
}

export interface PerfilAluno {
  nome: string | null;
  foto_url: string | null;
  foto_propria: string | null;
  aluno_desde: string | null;
  objetivo: string | null;
  profissionais: ProfissionalDoAluno[];
}

/** O que a tela mostra antes de confirmar (e o que ficou depois): contagens por banco. */
export interface ResultadoExclusao {
  ok: boolean;
  simulacao?: boolean;
  apaga: { principal: Record<string, number>; treino: Record<string, number> | null };
  mantem: { principal: Record<string, number>; treino: Record<string, number> | null };
}

const semInternet = () => typeof navigator !== "undefined" && navigator.onLine === false;

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

async function chamar<T>(funcao: string, corpo: Record<string, unknown>): Promise<T> {
  if (semInternet()) throw new ErroPerfil("sem_internet");
  const { data, error } = await principal.functions.invoke(funcao, { body: corpo });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroPerfil(String(c?.erro ?? "erro_interno"), c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) throw new ErroPerfil(String(d.erro ?? "erro_interno"), d);
  return d as T;
}

export async function meuPerfilAluno(): Promise<PerfilAluno> {
  const { data, error } = await principal.rpc("meu_perfil_aluno" as never);
  if (error) throw new ErroPerfil("erro_interno", { mensagem: error.message });
  const d = (data ?? {}) as Partial<PerfilAluno>;
  return {
    nome: d.nome ?? null,
    foto_url: d.foto_url ?? null,
    foto_propria: d.foto_propria ?? null,
    aluno_desde: d.aluno_desde ?? null,
    objetivo: d.objetivo ?? null,
    profissionais: Array.isArray(d.profissionais) ? (d.profissionais as ProfissionalDoAluno[]) : [],
  };
}

export async function minhaAgenda(desde: Date): Promise<AgendamentoAluno[]> {
  const { data, error } = await principal.rpc("minha_agenda" as never, { p_desde: desde.toISOString() } as never);
  if (error) throw new ErroPerfil("erro_interno", { mensagem: error.message });
  return Array.isArray(data) ? (data as AgendamentoAluno[]) : [];
}

/** O arquivo pronto para salvar (nome + texto). */
export async function exportarMeusDados(hoje: string): Promise<{ nome: string; texto: string; tamanho: number }> {
  const dados = await chamar<Record<string, unknown>>("exportar-meus-dados", {});
  const texto = JSON.stringify(dados, null, 2);
  return { nome: nomeDoArquivo(hoje), texto, tamanho: texto.length };
}

export const conferirExclusao = () => chamar<ResultadoExclusao>("excluir-minha-conta", { simular: true });

export const excluirMinhaConta = (confirmacao: string) => chamar<ResultadoExclusao>("excluir-minha-conta", { confirmacao });

/** Códigos das funções → frase para a pessoa. */
export const MENSAGEM_ERRO_CONTA: Record<string, string> = {
  sem_internet: "Sem internet agora. Conecte-se e tente de novo.",
  confirmacao_invalida: `Digite ${PALAVRA_CONFIRMACAO} para confirmar.`,
  // W2 da loja: o profissional exclui no painel (antes: "não é excluída pelo app do aluno")
  profissional: "Como você também usa o painel de profissional, a exclusão é feita no painel, em Configurações › Excluir minha conta: lá você confere o que acontece com os seus alunos e a equipe e baixa os prontuários antes.",
  assinatura_ativa: "Você tem uma cobrança automática ligada no cartão. Cancele em Perfil › Pagamentos antes de excluir a conta.",
  treino_indisponivel: "Não foi possível falar com o banco do treino agora. Nada foi apagado — tente de novo em alguns minutos.",
  rate_limited: "Muitas tentativas. Tente de novo em alguns minutos.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste podem fazer isso aqui.",
  invalid_token: "Sua sessão expirou. Saia e entre de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroConta(e: unknown): string {
  const codigo = e instanceof ErroPerfil ? e.codigo : "erro_interno";
  return MENSAGEM_ERRO_CONTA[codigo] ?? MENSAGEM_ERRO_CONTA.erro_interno;
}
