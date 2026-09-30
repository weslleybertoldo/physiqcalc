import { principal } from "@/integrations/principal/client";
import type { DadosAcessoAluno } from "./regras";

/**
 * Card "Acesso do aluno" (W8b) — tudo por RPC security definer do banco principal (quem pode: o dono da conta, o profissional
 * responsável pelo aluno, a nutricionista dona do registro do site antigo e o master; os outros recebem "sem_acesso"). As RPCs
 * de criar e redefinir são as MESMAS do site antigo do Nutri — agora a senha nasce PROVISÓRIA e a conta é destravada.
 */
const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** Dados do card pelo id da rota do painel (matrícula ou Treino). */
export async function acessoDoAluno(alunoId: string): Promise<DadosAcessoAluno> {
  const { data, error } = await principal.rpc("aluno_acesso" as never, { p_aluno: alunoId } as never);
  falhou(error);
  return data as unknown as DadosAcessoAluno;
}

/** Cria o login do aluno com a senha provisória (devolve o user_id novo). */
export async function criarAcessoDoAluno(pacienteId: string, email: string, senha: string): Promise<string> {
  const { data, error } = await principal.rpc("paciente_criar_acesso" as never, { p_paciente_id: pacienteId, p_email: email.trim().toLowerCase(), p_senha: senha } as never);
  falhou(error);
  return String(data);
}

/** Senha nova (provisória) para quem já tem login: derruba as sessões abertas e destrava a conta. */
export async function criarSenhaNovaDoAluno(pacienteId: string, senha: string): Promise<void> {
  const { error } = await principal.rpc("paciente_redefinir_senha" as never, { p_paciente_id: pacienteId, p_senha: senha } as never);
  falhou(error);
}
