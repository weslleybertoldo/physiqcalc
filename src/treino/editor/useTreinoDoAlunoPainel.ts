import { usePerfilAluno } from "@/painel/aluno/dados/usePerfilAluno";
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";
import { useTreinoDaPagina, type TreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { ErroTreinoPainel } from "./api";
import { useAlunoNoTreino } from "./useEditorTreino";

/**
 * Quem pode MUDAR o treino (spec 4.1): o master, o personal responsável e o dono que também é personal. O dono sem papel de
 * personal e a nutricionista só veem (a função do Treino confere de novo — o dono sem papel no Treino entra como leitor).
 */
export function podeEditarTreino(p: Pick<PerfilAluno, "eu" | "personal">): boolean {
  const eu = p.eu;
  if (!eu) return false;
  if (eu.master) return true;
  if (!eu.personal) return false;
  return eu.dono || p.personal?.id === eu.id;
}

export type EstadoTreinoDoAluno =
  | { tipo: "carregando" }
  | { tipo: "sem-sessao"; estado: Exclude<TreinoDaPagina, { tipo: "ok" }> }
  | { tipo: "erro"; erro: unknown; tentar: () => void }
  | { tipo: "sem-modulo" }
  | { tipo: "sem-acesso" }
  | { tipo: "sem-login"; temLogin: boolean }
  | { tipo: "ok"; treinoUserId: string; somenteLeitura: boolean; perfil: PerfilAluno }
  /** W16: quem vê o aluno mas não tem papel no Treino (a nutricionista) lê pelo principal (função treino-leitura), sem sessão do Treino */
  | { tipo: "leitura"; alunoId: string; perfil: PerfilAluno };

/**
 * O aluno do perfil no Banco do Treino (o que o editor da W15, o card Treino do Resumo e a página "Editar treino e dieta" da
 * W16 precisam): a sessão do Treino do profissional, o módulo Treino do aluno, o usuário do Treino dele e se quem abre muda.
 */
export function useTreinoDoAlunoPainel(alunoId: string): EstadoTreinoDoAluno {
  const sessao = useTreinoDaPagina();
  const perfil = usePerfilAluno(alunoId);
  const p = perfil.data;
  const temTreino = !!p && p.modulos.includes("treino");
  const aluno = useAlunoNoTreino(alunoId, p?.treino_user_id ?? null, !!p?.tem_login, sessao.tipo === "ok" && temTreino);
  if (perfil.isLoading) return { tipo: "carregando" };
  if (perfil.error || !p) return { tipo: "erro", erro: perfil.error, tentar: () => void perfil.refetch() };
  if (!temTreino) return { tipo: "sem-modulo" };
  if (sessao.tipo === "sem-papel") return { tipo: "leitura", alunoId, perfil: p };
  if (sessao.tipo !== "ok") return { tipo: "sem-sessao", estado: sessao };
  if (aluno.isLoading) return { tipo: "carregando" };
  if (aluno.error) {
    if (aluno.error instanceof ErroTreinoPainel && aluno.error.codigo === "forbidden") return { tipo: "sem-acesso" };
    return { tipo: "erro", erro: aluno.error, tentar: () => void aluno.refetch() };
  }
  if (!aluno.data) return { tipo: "sem-login", temLogin: p.tem_login };
  return { tipo: "ok", treinoUserId: aluno.data, somenteLeitura: !podeEditarTreino(p), perfil: p };
}
