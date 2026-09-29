import { createContext, useContext } from "react";

/** Aluno aberto no perfil do painel (/painel/alunos/:id). Abas, cards e KPIs registrados leem daqui. */
export interface AlunoAtual {
  alunoId: string;
}

export const AlunoCtx = createContext<AlunoAtual | null>(null);

export function useAlunoAtual(): AlunoAtual {
  const ctx = useContext(AlunoCtx);
  if (!ctx) throw new Error("useAlunoAtual fora do perfil do aluno");
  return ctx;
}
