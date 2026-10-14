import { acaoConta, codigoDaGravacao } from "@/conta/gravar";
import type { DadosAcessoAluno } from "./regras";

/**
 * Card "Acesso do aluno" (W8b) — tudo por RPC security definer do banco principal (quem pode: o dono da conta, o profissional
 * responsável pelo aluno, a nutricionista dona do registro do site antigo e o master; os outros recebem "sem_acesso"). As RPCs
 * de criar e redefinir são as MESMAS do site antigo do Nutri — agora a senha nasce PROVISÓRIA e a conta é destravada.
 * hml-21c (H-43 · jeito 2, etapa 3): as 3 pela função conta, COM A SESSÃO de quem está logado — as MESMAS RPCs e os MESMOS argumentos, no
 * servidor: acesso_ler (a aluno_acesso: lê e confere quem pode — AÇÃO, decisão 13), acesso_criar e acesso_redefinir_senha (o Master também,
 * pela SheetSenhaAluno). O erro sai com a MENSAGEM = o CÓDIGO (hoje a RPC levantava o código no texto): o retry do card e o textoErroAcesso
 * leem o message — nunca a frase do ErroGravacaoConta. A rede que caiu = "sem_internet" (+ "network": o textoErroAcesso diz "Sem conexão…",
 * como com o "Failed to fetch" de hoje).
 */
class ErroAcesso extends Error {
  constructor(public codigo: string) {
    super(codigo === "sem_internet" ? "sem_internet (network)" : codigo);
  }
}

/** Uma ação do login do aluno pela conta; o erro com o código na mensagem. */
async function acao(nome: "acesso_ler" | "acesso_criar" | "acesso_redefinir_senha", corpo: Record<string, unknown>): Promise<unknown> {
  try {
    return (await acaoConta<{ resultado?: unknown }>(nome, corpo)).resultado;
  } catch (e) {
    throw new ErroAcesso(codigoDaGravacao(e));
  }
}

/** Dados do card pelo id da rota do painel (matrícula ou Treino). */
export async function acessoDoAluno(alunoId: string): Promise<DadosAcessoAluno> {
  return (await acao("acesso_ler", { aluno: alunoId })) as DadosAcessoAluno;
}

/** Cria o login do aluno com a senha provisória (devolve o user_id novo). */
export async function criarAcessoDoAluno(pacienteId: string, email: string, senha: string): Promise<string> {
  return String(await acao("acesso_criar", { aluno: pacienteId, email: email.trim().toLowerCase(), senha }));
}

/** Senha nova (provisória) para quem já tem login: derruba as sessões abertas e destrava a conta. */
export async function criarSenhaNovaDoAluno(pacienteId: string, senha: string): Promise<void> {
  await acao("acesso_redefinir_senha", { aluno: pacienteId, senha });
}
