// Physiq W11 — o estado da aba Dieta: o "hoje" de São Paulo (vira sozinho à meia-noite — o ✓ zera no dia seguinte), a leitura
// pela minha_dieta(hoje) e os ✓ das refeições e das metas com atualização otimista (volta atrás se o banco recusar). Online (9A).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { principalConfigurado } from "@/integrations/principal/client";
import { useSessao } from "@/nucleo/sessao";
import { hojeSP, msAteAmanhaSP } from "./dia";
import { marcarMeta, marcarRefeicao, minhaDieta, urlsDoDiario } from "./pacienteApp";
import type { DadosDieta } from "./tipos";

/** yyyy-mm-dd de hoje em São Paulo, que muda sozinho na virada do dia (e ao voltar para o app). */
export function useHojeSP(): string {
  const [hoje, setHoje] = useState(() => hojeSP());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setHoje(hojeSP());
        agendar();
      }, msAteAmanhaSP());
    };
    // voltar para o app (o celular pode ter dormido na virada do dia): confere de novo e reagenda
    const conferir = () => {
      setHoje(hojeSP());
      agendar();
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState !== "hidden") conferir();
    };
    agendar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("focus", conferir);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("focus", conferir);
    };
  }, []);
  return hoje;
}

export const chaveDieta = (uid: string | null, dia: string) => ["dieta", uid, dia] as const;

export function useDieta() {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const hoje = useHojeSP();
  const qc = useQueryClient();
  const chave = chaveDieta(uid, hoje);

  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => minhaDieta(hoje),
    enabled: Boolean(uid) && principalConfigurado,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
    refetchOnWindowFocus: true,
  });

  // fotos do próprio diário (P29 e a lista dos 7 dias): URL assinada de 1 h
  const diario = consulta.data?.diario ?? [];
  const idsDiario = diario.map((r) => r.id).join(",");
  const fotos = useQuery({
    queryKey: ["dieta-fotos", uid, idsDiario],
    queryFn: () => urlsDoDiario(diario),
    enabled: Boolean(uid) && diario.length > 0,
    staleTime: 50 * 60_000,
    retry: 1,
    networkMode: "online",
  });

  const alterar = useCallback(
    (f: (d: DadosDieta) => DadosDieta) => {
      const antes = qc.getQueryData<DadosDieta>(chave);
      if (antes) qc.setQueryData<DadosDieta>(chave, f(antes));
      return antes;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave muda junto com uid/hoje
    [qc, uid, hoje],
  );

  const refeicao = useMutation({
    mutationFn: ({ id, concluida }: { id: string; concluida: boolean }) => marcarRefeicao(id, hoje, concluida),
    networkMode: "online",
    retry: 0,
    onMutate: async ({ id, concluida }) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = alterar((d) => ({
        ...d,
        refeicoes_concluidas: concluida ? [...d.refeicoes_concluidas.filter((x) => x !== id), id] : d.refeicoes_concluidas.filter((x) => x !== id),
      }));
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: chave }),
  });

  const meta = useMutation({
    mutationFn: ({ id, concluida }: { id: string; concluida: boolean }) => marcarMeta(id, hoje, concluida),
    networkMode: "online",
    retry: 0,
    onMutate: async ({ id, concluida }) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = alterar((d) => ({
        ...d,
        metas_concluidas: concluida ? [...d.metas_concluidas.filter((x) => x !== id), id] : d.metas_concluidas.filter((x) => x !== id),
      }));
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: chave }),
  });

  const recarregar = useCallback(() => void qc.invalidateQueries({ queryKey: ["dieta", uid] }), [qc, uid]);

  return useMemo(
    () => ({
      uid,
      hoje,
      dados: consulta.data ?? null,
      carregando: consulta.isLoading,
      erro: consulta.isError ? (consulta.error as Error) : null,
      recarregar,
      fotos: fotos.data ?? {},
      marcarRefeicao: refeicao.mutateAsync,
      salvandoRefeicao: refeicao.isPending ? refeicao.variables?.id ?? null : null,
      marcarMeta: meta.mutateAsync,
      salvandoMeta: meta.isPending ? meta.variables?.id ?? null : null,
    }),
    [uid, hoje, consulta.data, consulta.isLoading, consulta.isError, consulta.error, recarregar, fotos.data, refeicao.mutateAsync, refeicao.isPending,
      refeicao.variables, meta.mutateAsync, meta.isPending, meta.variables],
  );
}
