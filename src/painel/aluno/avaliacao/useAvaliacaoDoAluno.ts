import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ErroFonte } from "@/evolucao/fontes";
import { montarSerie } from "@/evolucao/serie";
import type { Serie } from "@/evolucao/tipos";
import { ESPERA_NOVA_TENTATIVA_MS } from "@/integrations/consultas";
import { buscarPerfilAluno } from "../dados/api";
import { chavePerfilAluno, usePerfilAluno } from "../dados/usePerfilAluno";
import type { PerfilAluno } from "../dados/tipos";
import { carregarPrincipalDoPainel, carregarTreinoDoPainel, type PrincipalDoPainel, type TreinoDoPainel } from "./fontes";

export const chaveAvaliacao = (alunoId: string) => ["aluno-avaliacao", alunoId] as const;
/** hml-26 (H-128): a nova tentativa da parte que falhou, por leitura da série (o dataUpdatedAt dela) — fora do prefixo da chaveAvaliacao. */
export const chaveParteDeNovo = (alunoId: string, leitura: number) => ["aluno-avaliacao-de-novo", alunoId, leitura] as const;

export type FalhaParte = "sem-conexao" | "erro" | null;

export interface DadosAvaliacao {
  treino: TreinoDoPainel | null;
  principal: PrincipalDoPainel | null;
  falhas: { treino: FalhaParte; principal: FalhaParte };
}

/** hml-26 (H-128 · decisão 2 da sessão principal): quantas vezes a parte que falhou é buscada de novo, sozinha (1 s entre elas). */
export const NOVAS_TENTATIVAS_DA_PARTE = 3;

/** hml-26 (H-128): as partes que voltaram na nova tentativa — só as que tinham falhado (sem a chave = a parte não foi buscada de novo). */
export type PartesDeNovo = Partial<Pick<DadosAvaliacao, "treino" | "principal">>;

/**
 * hml-26 (H-128): a série está INCOMPLETA — uma parte (a do Treino ou a do principal) não veio, ou nenhuma (a consulta em erro, sem
 * dado). Pura e AQUI, onde as 2 partes se juntam e a série é montada: só o `carregar` sabe qual parte falhou (o `falhas`); o montarSerie
 * (src/evolucao/serie.ts, o mesmo do app do aluno) recebe `null` tanto para "o aluno não tem a parte" quanto para "a parte falhou". Com a
 * série incompleta, os números do cabeçalho não saem de metade dela.
 */
export function serieParcial(dados: DadosAvaliacao | undefined, erro: unknown): boolean {
  if (dados) return dados.falhas.treino !== null || dados.falhas.principal !== null;
  return erro !== null && erro !== undefined;
}

/**
 * hml-26 (H-128): a parte que voltou na nova tentativa entra no lugar da que falhou (e a falha dela sai); a que já tinha vindo fica. Nada
 * que tinha falhado voltou: o mesmo objeto.
 */
export function juntarParteDeNovo(dados: DadosAvaliacao, deNovo: PartesDeNovo | undefined): DadosAvaliacao {
  const treino = !!deNovo && "treino" in deNovo && dados.falhas.treino !== null;
  const principal = !!deNovo && "principal" in deNovo && dados.falhas.principal !== null;
  if (!treino && !principal) return dados;
  return {
    treino: treino ? (deNovo?.treino ?? null) : dados.treino,
    principal: principal ? (deNovo?.principal ?? null) : dados.principal,
    falhas: { treino: treino ? null : dados.falhas.treino, principal: principal ? null : dados.falhas.principal },
  };
}

const semRede = () => typeof navigator !== "undefined" && navigator.onLine === false;
/** O erro que não adianta pedir de novo (quem chama não vê o aluno, o aluno não existe, a sessão acabou). */
const semNovaTentativa = (e: unknown) => /sem_acesso|aluno_inexistente|sem_login/.test(e instanceof Error ? e.message : "");

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

/**
 * hml-26 (H-128 · decisão 2): busca de novo SÓ a parte que falhou — a do Treino pela treino-leitura, a do principal pela nutricao (num
 * lote só dela); a que veio fica. Falhou de novo → a consulta tenta outra vez (até NOVAS_TENTATIVAS_DA_PARTE).
 */
async function buscarParteDeNovo(alunoId: string, falhas: DadosAvaliacao["falhas"]): Promise<PartesDeNovo> {
  const [treino, principal] = await Promise.all([
    falhas.treino !== null ? carregarTreinoDoPainel(alunoId) : undefined,
    falhas.principal !== null ? carregarPrincipalDoPainel(alunoId) : undefined,
  ]);
  return { ...(falhas.treino !== null ? { treino } : {}), ...(falhas.principal !== null ? { principal } : {}) };
}

export interface EstadoAvaliacao {
  perfil: PerfilAluno | undefined;
  carregando: boolean;
  erro: unknown;
  /** as 2 partes (com a que voltou na nova tentativa no lugar da que tinha falhado — hml-26) */
  dados: DadosAvaliacao | undefined;
  /** a MESMA série da aba Evolução do aluno (W10): avaliações e fotos dos 2 bancos, em ordem de data e com o autor */
  serie: Serie | null;
  /** hml-26 (H-128): a série está incompleta (serieParcial) — os números do cabeçalho mostram "—" + "dado parcial" */
  parcial: boolean;
  recarregar: () => Promise<void>;
}

/**
 * A avaliação do aluno no painel (W17): a aba Avaliação, o card Evolução do Resumo e os números Peso e Gordura do cabeçalho
 * dividem esta consulta (o que o painel mostra = o que a aba Evolução do aluno mostra — lição da W10).
 * hml-26 (H-128): uma parte que falhou é buscada de novo sozinha (a consulta da chaveParteDeNovo); voltou → entra no `dados` e na série.
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
    retry: (n, e) => !semNovaTentativa(e) && n < 1,
    networkMode: "online",
  });
  // hml-26 (H-128 · decisão 2): a parte que falhou é buscada de novo sozinha — 1 consulta por leitura da série (a chave leva o dataUpdatedAt:
  // a leitura nova começa do zero), até 3 vezes com 1 s entre elas, sem laço; depois a falha fica até a próxima abertura (a consulta em erro
  // tenta de novo quando alguém a abre — o retryOnMount) ou o foco (em erro, sem dado, ela é sempre "velha"). Voltou → fica (staleTime).
  const falhas = q.data?.falhas;
  const deNovo = useQuery({
    queryKey: chaveParteDeNovo(alunoId, q.dataUpdatedAt),
    queryFn: () => buscarParteDeNovo(alunoId, falhas ?? { treino: null, principal: null }),
    enabled: !!falhas && (falhas.treino !== null || falhas.principal !== null),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: (n, e) => !semNovaTentativa(e) && n < NOVAS_TENTATIVAS_DA_PARTE - 1,
    retryDelay: ESPERA_NOVA_TENTATIVA_MS,
    refetchOnWindowFocus: true,
    networkMode: "online",
  });
  const dados = useMemo(() => (q.data ? juntarParteDeNovo(q.data, deNovo.data) : undefined), [q.data, deNovo.data]);
  const personal = p?.personal ? { id: p.personal.id, nome: p.personal.nome } : null;
  const serie = useMemo(
    () => (dados ? montarSerie({ treino: dados.treino?.parte ?? null, principal: dados.principal, personal }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- personal muda junto com o perfil
    [dados, personal?.id, personal?.nome],
  );
  const recarregar = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: chaveAvaliacao(alunoId) });
  }, [qc, alunoId]);
  return {
    perfil: p,
    carregando: perfilQ.isLoading || (!!p && q.isLoading),
    erro: perfilQ.error ?? q.error,
    dados,
    serie,
    parcial: serieParcial(dados, q.error),
    recarregar,
  };
}
