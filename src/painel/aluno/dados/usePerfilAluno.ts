import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessao } from "@/nucleo/sessao";
import { buscarDadosTreino, buscarPerfilAluno } from "./api";
import type { PerfilAluno } from "./tipos";

export const chavePerfilAluno = (alunoId: string) => ["aluno-perfil", alunoId] as const;

/** O perfil do aluno (banco principal) — cabeçalho e cards do Resumo dividem a mesma consulta. */
export function usePerfilAluno(alunoId: string) {
  return useQuery({
    queryKey: chavePerfilAluno(alunoId),
    queryFn: () => buscarPerfilAluno(alunoId),
    enabled: !!alunoId,
    staleTime: 30_000,
    retry: (n, e) => !/sem_acesso|aluno_inexistente|sem_login/.test(e instanceof Error ? e.message : "") && n < 1,
    networkMode: "online",
  });
}

/** A sessão do Banco do Treino está pronta (o painel de quem tem Treino troca o token no login). */
export function useTreinoPronto(): boolean {
  return useSessao().treino.estado === "pronto";
}

/** Os dados do Banco do Treino do aluno (altura, peso, avaliações do Calc) — só para quem tem treino e com a sessão pronta. */
export function useTreinoDoAluno(perfil: Pick<PerfilAluno, "treino_user_id"> | undefined) {
  const pronto = useTreinoPronto();
  const id = perfil?.treino_user_id ?? null;
  return useQuery({
    queryKey: ["aluno-treino", id],
    queryFn: () => buscarDadosTreino(id!),
    enabled: !!id && pronto,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Depois de salvar: o perfil novo no lugar e as telas que mostram o aluno recarregam (lista, acesso, financeiro, cabeçalho antigo). */
export function useAtualizarAluno(alunoId: string) {
  const qc = useQueryClient();
  return useCallback(
    async (novo?: PerfilAluno) => {
      if (novo) qc.setQueryData(chavePerfilAluno(alunoId), novo);
      await Promise.all([
        qc.invalidateQueries({ queryKey: chavePerfilAluno(alunoId) }),
        qc.invalidateQueries({ queryKey: ["aluno-treino"] }),
        qc.invalidateQueries({ queryKey: ["acesso-aluno", alunoId] }),
        qc.invalidateQueries({ queryKey: ["painel-aluno", alunoId] }),
        qc.invalidateQueries({ queryKey: ["alunos"] }),
        qc.invalidateQueries({ queryKey: ["alunos-contador"] }),
      ]);
    },
    [qc, alunoId],
  );
}
