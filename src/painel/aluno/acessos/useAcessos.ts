// Physiq W-A P4 — as consultas e as gravações da aba Acessos (React Query), pela porta da P2 (src/acessos/api.ts: a função acessos no
// principal e a treino-acessos no Treino — nunca o banco direto, src/aluno-dia/semBancoDireto.test.ts). Salva na hora, linha por linha
// (spec §2.2-5): o nível muda na tela já (otimista); a função recusou → volta e mostra a frase do código; deu certo → "Salvo", a aba com a
// volta do servidor e o perfil do aluno relido (o card "Link do diário" e o "Mensagens automáticas" leem os ajustes de lá — spec §5.3).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErroAcessos, lerAcessos, lerSeries, salvarAcesso, salvarSeries } from "@/acessos/api";
import type { AcessosDoAluno, ChaveDeAcesso, NivelDasSeries, SeriesDoAluno } from "@/acessos/tipos";
import { chavePerfilAluno } from "../dados/usePerfilAluno";
import { TEXTOS, comNivel } from "./regras";

export const chaveAcessos = (alunoId: string) => ["acessos-aluno", alunoId] as const;
export const chaveSeries = (alunoId: string) => ["acessos-series", alunoId] as const;

/** Repetir 1 vez só o que pode passar sozinho (a rede); quem não pode, o aluno que não existe, antes do 1º acesso… não repetem. */
const SEM_REPETIR = new Set(["sem_acesso", "aluno_inexistente", "sem_login", "sem_treino", "sem_modulo", "dados_invalidos", "sem_internet"]);
const repetir = (n: number, e: unknown) => n < 1 && !(e instanceof ErroAcessos && SEM_REPETIR.has(e.codigo));
const frase = (e: unknown) => (e instanceof ErroAcessos ? e.message : TEXTOS.erroPadrao);

/** As linhas da aba (a função acessos, `acao: "ler"`). */
export function useAcessosDoAluno(alunoId: string) {
  return useQuery<AcessosDoAluno>({
    queryKey: chaveAcessos(alunoId),
    queryFn: () => lerAcessos(alunoId),
    enabled: !!alunoId,
    staleTime: 20_000,
    retry: repetir,
    networkMode: "online",
  });
}

/** A linha das séries (a treino-acessos, `acao: "ler"`) — só para aluno com o módulo Treino (spec §4.1: carrega à parte). */
export function useSeriesDoAluno(alunoId: string, comTreino: boolean) {
  return useQuery<SeriesDoAluno>({
    queryKey: chaveSeries(alunoId),
    queryFn: () => lerSeries(alunoId),
    enabled: !!alunoId && comTreino,
    staleTime: 20_000,
    retry: repetir,
    networkMode: "online",
  });
}

/** Muda uma das 4 linhas da função acessos (acesso_app · diario_alimentar · acesso_link · dieta). */
export function useMudarAcesso(alunoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chave, valor }: { chave: ChaveDeAcesso; valor: string }) => salvarAcesso(alunoId, chave, valor),
    onMutate: async ({ chave, valor }) => {
      await qc.cancelQueries({ queryKey: chaveAcessos(alunoId) });
      const antes = qc.getQueryData<AcessosDoAluno>(chaveAcessos(alunoId));
      if (antes) qc.setQueryData<AcessosDoAluno>(chaveAcessos(alunoId), comNivel(antes, chave, valor));
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData<AcessosDoAluno>(chaveAcessos(alunoId), ctx.antes);
      toast.error(frase(e));
    },
    onSuccess: (novo) => {
      qc.setQueryData<AcessosDoAluno>(chaveAcessos(alunoId), novo);
      toast.success(TEXTOS.salvo);
      void qc.invalidateQueries({ queryKey: chavePerfilAluno(alunoId) });
    },
  });
}

/** Muda o cadeado das séries (a treino-acessos); depois relê a aba (o "Mudado por" das séries vem do histórico do principal). */
export function useMudarSeries(alunoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (valor: NivelDasSeries) => salvarSeries(alunoId, valor),
    onMutate: async (valor) => {
      await qc.cancelQueries({ queryKey: chaveSeries(alunoId) });
      const antes = qc.getQueryData<SeriesDoAluno>(chaveSeries(alunoId));
      if (antes) qc.setQueryData<SeriesDoAluno>(chaveSeries(alunoId), { ...antes, series: valor });
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData<SeriesDoAluno>(chaveSeries(alunoId), ctx.antes);
      toast.error(frase(e));
    },
    onSuccess: (r) => {
      qc.setQueryData<SeriesDoAluno>(chaveSeries(alunoId), (a) => (a ? { ...a, series: r.series } : a));
      toast.success(TEXTOS.salvo);
      void qc.invalidateQueries({ queryKey: chaveAcessos(alunoId) });
    },
  });
}
