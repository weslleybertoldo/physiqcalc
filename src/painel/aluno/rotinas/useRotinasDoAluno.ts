// Physiq W-A P6 — as rotinas do aluno da rota no React Query (o card "Rotinas" do Resumo, o "Ver tudo" e o "Dia a dia" da Dieta dividem a MESMA
// consulta): aluno-dia { acao: "ler", q: "aluno_rotinas", aluno, de, ate } — as do aluno e as de profissional que quem chama vê, com as
// apagadas, o ✓ dos últimos 14 dias e o histórico (rotinas_do_aluno, wa2). Pela porta da P2 (src/aluno-dia/api.ts — nunca o banco direto). A
// chave leva a janela: virou o dia, a consulta é outra. Depois de criar, mudar ou apagar pela folha da P3, relê (o servidor é a verdade).
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ErroAlunoDia, lerRotinasDoAluno } from "@/aluno-dia/api";
import type { RotinasDoAluno } from "@/aluno-dia/tipos";
import { janelaDoPainel } from "./regras";

export const chaveRotinasDoAluno = (alunoId: string) => ["painel-rotinas", alunoId] as const;

/** Repetir 1 vez só o que pode passar sozinho (a rede); quem não pode, o aluno que não existe, sem internet… não repetem. */
const SEM_REPETIR = new Set(["sem_acesso", "aluno_inexistente", "sem_login", "dados_invalidos", "sem_internet"]);
export const repetirLeitura = (n: number, e: unknown): boolean => n < 1 && !(e instanceof ErroAlunoDia && SEM_REPETIR.has(e.codigo));

export function useRotinasDoAluno(alunoId: string) {
  const { de, ate } = janelaDoPainel();
  return useQuery<RotinasDoAluno>({
    queryKey: [...chaveRotinasDoAluno(alunoId), de, ate],
    queryFn: () => lerRotinasDoAluno(alunoId, de, ate),
    enabled: !!alunoId,
    staleTime: 30_000,
    retry: repetirLeitura,
    networkMode: "online",
  });
}

/** Relê as rotinas deste aluno (todas as janelas). */
export const atualizarRotinasDoAluno = (qc: QueryClient, alunoId: string): Promise<void> =>
  qc.invalidateQueries({ queryKey: chaveRotinasDoAluno(alunoId) });
