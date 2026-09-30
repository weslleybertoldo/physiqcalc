import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { principalConfigurado } from "@/integrations/principal/client";
import { useSessao } from "@/nucleo/sessao";
import type { Situacao } from "@/nucleo/situacao";
import { useOnline } from "@/ui/premium/useOnline";
import { guardarCache, lerCache } from "./cache";
import { carregarPrincipal, carregarTreino } from "./fontes";
import { montarSerie } from "./serie";
import type { ParteTreino, PartePrincipal, Serie } from "./tipos";

export type FalhaParte = "sem-conexao" | "erro";
export type FaseEvolucao = "carregando" | "pronto" | "sem-conexao" | "erro";

export interface EstadoEvolucao {
  fase: FaseEvolucao;
  serie: Serie | null;
  /** algo na tela veio do aparelho (a última abertura), não da rede agora */
  deCache: boolean;
  salvoEm: string | null;
  falhas: { treino: FalhaParte | null; principal: FalhaParte | null };
  recarregar: () => void;
}

interface Interno {
  fase: FaseEvolucao;
  treino: ParteTreino | null;
  principal: PartePrincipal | null;
  deCache: boolean;
  salvoEm: string | null;
  falhas: EstadoEvolucao["falhas"];
}

const INICIAL: Interno = { fase: "carregando", treino: null, principal: null, deCache: false, salvoEm: null, falhas: { treino: null, principal: null } };

const semRede = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** O personal responsável pelo treino (autor das avaliações e fotos do Treino): a matrícula ativa com o módulo Treino. */
export function personalDaSituacao(s: Situacao | null | undefined): { id: string | null; nome: string | null } | null {
  const ms = s?.matriculas ?? [];
  const m = ms.find((x) => x.ativo && x.modulos.includes("treino") && x.personal) ?? ms.find((x) => x.personal);
  return m?.personal ? { id: m.personal.id, nome: m.personal.nome } : null;
}

/**
 * A Evolução do aluno logado (W10): busca as 2 partes em paralelo (Treino pelo REST, principal pela minha_evolucao()),
 * mostra o que já foi aberto enquanto chega (e sem internet), guarda no aparelho e busca de novo quando a internet volta.
 * Uma parte que falha não derruba a outra: a tela avisa só daquela.
 */
export function useEvolucaoDoAluno(): EstadoEvolucao {
  const { usuario, situacao } = useSessao();
  const { user } = useAuth();
  const online = useOnline();
  const uid = usuario?.id ?? null;
  const treinoId = user?.id ?? null;
  const querPrincipal = !!uid && principalConfigurado;
  const [e, setE] = useState<Interno>(INICIAL);
  const geracao = useRef(0);

  const carregar = useCallback(async () => {
    if (!uid) return;
    const g = ++geracao.current;
    const cache = await lerCache(uid);
    if (g !== geracao.current) return;
    if (cache) {
      setE((s) => (s.fase === "carregando" ? { ...s, fase: "pronto", treino: cache.treino, principal: cache.principal, deCache: true, salvoEm: cache.salvoEm } : s));
    }
    if (semRede()) {
      setE({
        fase: cache ? "pronto" : "sem-conexao",
        treino: cache?.treino ?? null,
        principal: cache?.principal ?? null,
        deCache: !!cache,
        salvoEm: cache?.salvoEm ?? null,
        falhas: { treino: treinoId ? "sem-conexao" : null, principal: querPrincipal ? "sem-conexao" : null },
      });
      return;
    }
    const [t, p] = await Promise.allSettled([
      treinoId ? carregarTreino(treinoId) : Promise.resolve(null),
      querPrincipal ? carregarPrincipal() : Promise.resolve(null),
    ]);
    if (g !== geracao.current) return;
    const motivo: FalhaParte = semRede() ? "sem-conexao" : "erro";
    if (t.status === "rejected") console.warn("[evolucao] Banco do Treino:", t.reason);
    if (p.status === "rejected") console.warn("[evolucao] banco principal:", p.reason);
    const treino = t.status === "fulfilled" ? t.value : cache?.treino ?? null;
    const principal = p.status === "fulfilled" ? p.value : cache?.principal ?? null;
    const falhouTudo = t.status === "rejected" && p.status === "rejected";
    setE({
      fase: falhouTudo && !cache ? (motivo === "sem-conexao" ? "sem-conexao" : "erro") : "pronto",
      treino,
      principal,
      deCache: (t.status === "rejected" && !!cache?.treino) || (p.status === "rejected" && !!cache?.principal),
      salvoEm: t.status === "fulfilled" || p.status === "fulfilled" ? new Date().toISOString() : cache?.salvoEm ?? null,
      falhas: { treino: t.status === "rejected" ? motivo : null, principal: p.status === "rejected" ? motivo : null },
    });
    if (t.status === "fulfilled" || p.status === "fulfilled") void guardarCache(uid, { treino, principal });
  }, [uid, treinoId, querPrincipal]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // a internet voltou e a tela está com o que já tinha sido aberto (ou sem nada): busca de novo
  const precisaAtualizar = e.deCache || e.fase === "sem-conexao" || !!e.falhas.treino || !!e.falhas.principal;
  useEffect(() => {
    if (online && precisaAtualizar) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a rede muda
  }, [online]);

  const personal = useMemo(() => personalDaSituacao(situacao), [situacao]);
  const serie = useMemo(
    () => (e.fase === "carregando" || (e.fase !== "pronto" && !e.treino && !e.principal) ? null : montarSerie({ treino: e.treino, principal: e.principal, personal })),
    [e.fase, e.treino, e.principal, personal],
  );

  return {
    fase: e.fase,
    serie,
    deCache: e.deCache,
    salvoEm: e.salvoEm,
    falhas: e.falhas,
    recarregar: () => void carregar(),
  };
}
