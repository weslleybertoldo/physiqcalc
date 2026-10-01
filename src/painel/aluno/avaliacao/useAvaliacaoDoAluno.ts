import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErroFonte } from "@/evolucao/fontes";
import { montarSerie } from "@/evolucao/serie";
import type { Serie } from "@/evolucao/tipos";
import { usePerfilAluno } from "../dados/usePerfilAluno";
import type { PerfilAluno } from "../dados/tipos";
import { carregarPrincipalDoPainel, carregarTreinoDoPainel, type PrincipalDoPainel, type TreinoDoPainel } from "./fontes";

export const chaveAvaliacao = (alunoId: string) => ["aluno-avaliacao", alunoId] as const;

export type FalhaParte = "sem-conexao" | "erro" | null;

export interface DadosAvaliacao {
  treino: TreinoDoPainel | null;
  principal: PrincipalDoPainel | null;
  falhas: { treino: FalhaParte; principal: FalhaParte };
}

const semRede = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** As 2 partes em paralelo; uma que falha não derruba a outra (a tela avisa só daquela). */
async function carregar(alunoId: string, p: Pick<PerfilAluno, "modulos">): Promise<DadosAvaliacao> {
  const querTreino = p.modulos.includes("treino");
  const [t, pr] = await Promise.allSettled([
    querTreino ? carregarTreinoDoPainel(alunoId) : Promise.resolve(null),
    carregarPrincipalDoPainel(alunoId),
  ]);
  const motivo = (e: unknown): FalhaParte => (semRede() || (e instanceof ErroFonte && e.message === "sem_internet") ? "sem-conexao" : "erro");
  if (t.status === "rejected") console.warn("[avaliacao] Banco do Treino:", t.reason);
  if (pr.status === "rejected") console.warn("[avaliacao] banco principal:", pr.reason);
  if (t.status === "rejected" && pr.status === "rejected") throw pr.reason instanceof Error ? pr.reason : new Error("erro_interno");
  return {
    treino: t.status === "fulfilled" ? t.value : null,
    principal: pr.status === "fulfilled" ? pr.value : null,
    falhas: { treino: t.status === "rejected" ? motivo(t.reason) : null, principal: pr.status === "rejected" ? motivo(pr.reason) : null },
  };
}

export interface EstadoAvaliacao {
  perfil: PerfilAluno | undefined;
  carregando: boolean;
  erro: unknown;
  dados: DadosAvaliacao | undefined;
  /** a MESMA série da aba Evolução do aluno (W10): avaliações e fotos dos 2 bancos, em ordem de data e com o autor */
  serie: Serie | null;
  recarregar: () => Promise<void>;
}

/**
 * A avaliação do aluno no painel (W17): a aba Avaliação, o card Evolução do Resumo e os números Peso e Gordura do cabeçalho
 * dividem esta consulta (o que o painel mostra = o que a aba Evolução do aluno mostra — lição da W10).
 */
export function useAvaliacaoDoAluno(alunoId: string): EstadoAvaliacao {
  const perfilQ = usePerfilAluno(alunoId);
  const p = perfilQ.data;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: chaveAvaliacao(alunoId),
    queryFn: () => carregar(alunoId, p!),
    enabled: !!alunoId && !!p,
    staleTime: 30_000,
    retry: (n, e) => !/sem_acesso|aluno_inexistente|sem_login/.test(e instanceof Error ? e.message : "") && n < 1,
    networkMode: "online",
  });
  const personal = p?.personal ? { id: p.personal.id, nome: p.personal.nome } : null;
  const serie = useMemo(
    () => (q.data ? montarSerie({ treino: q.data.treino?.parte ?? null, principal: q.data.principal, personal }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- personal muda junto com o perfil
    [q.data, personal?.id, personal?.nome],
  );
  const recarregar = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: chaveAvaliacao(alunoId) });
  }, [qc, alunoId]);
  return {
    perfil: p,
    carregando: perfilQ.isLoading || (!!p && q.isLoading),
    erro: perfilQ.error ?? q.error,
    dados: q.data,
    serie,
    recarregar,
  };
}
