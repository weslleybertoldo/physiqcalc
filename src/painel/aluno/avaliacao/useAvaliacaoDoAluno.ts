import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ErroFonte } from "@/evolucao/fontes";
import { montarSerie } from "@/evolucao/serie";
import type { Serie } from "@/evolucao/tipos";
import { buscarPerfilAluno } from "../dados/api";
import { chavePerfilAluno, usePerfilAluno } from "../dados/usePerfilAluno";
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

/**
 * As 2 partes em paralelo; uma que falha não derruba a outra (a tela avisa só daquela).
 * hml-20b (a decisão da sessão principal, 12/10 — o TEMPO da Avaliação, 0,50 × 0,91 s): a parte do PRINCIPAL não depende do perfil e
 * sai JÁ, no mesmo lote `ler` do aluno_perfil da casca (1 ida; antes eram 2 voltas em série, cada uma ~0,2 s mais cara pela função);
 * só a do TREINO espera o perfil (o `modulos` dele decide se ela entra). O perfil que falha derruba a série junto (como antes: sem
 * perfil, sem série) — a parte do principal que já saiu fica sem uso.
 */
async function carregar(alunoId: string, perfil: Promise<Pick<PerfilAluno, "modulos">>): Promise<DadosAvaliacao> {
  const principal = carregarPrincipalDoPainel(alunoId);
  principal.catch(() => undefined); // o erro dela é lido no allSettled; isto só evita o "não tratado" enquanto o perfil não chega
  const p = await perfil;
  const querTreino = p.modulos.includes("treino");
  const [t, pr] = await Promise.allSettled([querTreino ? carregarTreinoDoPainel(alunoId) : Promise.resolve(null), principal]);
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

/**
 * hml-20b: o carregar com o MESMO perfil da casca (a consulta do usePerfilAluno, chavePerfilAluno): o dado que já está lá ou o pedido dela
 * em andamento — o React Query devolve a MESMA promessa (nunca um aluno_perfil a mais). A consulta do perfil parada em erro, sem dado
 * (a série tentando de novo): falha já, sem pedir nada (nem a parte do principal).
 */
function carregarComOPerfil(qc: QueryClient, alunoId: string): Promise<DadosAvaliacao> {
  const chave = chavePerfilAluno(alunoId);
  const estado = qc.getQueryState<PerfilAluno>(chave);
  if (estado?.status === "error" && estado.data === undefined && estado.fetchStatus === "idle") return Promise.reject(estado.error);
  return carregar(alunoId, qc.ensureQueryData({ queryKey: chave, queryFn: () => buscarPerfilAluno(alunoId) }));
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
  // hml-20b: a consulta não espera mais o perfil para COMEÇAR (era enabled: !!p) — a parte do principal vai no lote do aluno_perfil e a do
  // Treino espera o perfil dentro do carregar. Sem perfil (a consulta dele falhou e não tem dado) ela não corre, como antes; quando o
  // perfil volta, o enabled volta e ela corre de novo.
  const semPerfil = perfilQ.isError && !p;
  const q = useQuery({
    queryKey: chaveAvaliacao(alunoId),
    queryFn: () => carregarComOPerfil(qc, alunoId),
    enabled: !!alunoId && !semPerfil,
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
