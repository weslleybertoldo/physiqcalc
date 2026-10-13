// Physiq W-A P5 — a dieta liberada no React Query (spec W-A §4.4, §5.2): o dia de HOJE (aluno-dia { acao: "ler", q: "dia" } — o meu_dia lê
// mesmo travada e diz, por matrícula, se está liberada), a biblioteca dele (q: "biblioteca") e a busca (q: "alimentos", 20 por página). As
// gravações vão uma por vez pelo useGravarNoDia: deu certo → relê o dia (e a biblioteca, quando mexeu nela); a Dieta travou no meio (409
// dieta_travada) → o toast "A sua dieta voltou a ser só para ver." e relê: a tela volta ao "só ver" (quem chama fecha a folha no `aoTravar`).
// Nada fala com o banco daqui: só a porta da aluno-dia (src/aluno-dia/api.ts; a guarda src/aluno-dia/semBancoDireto.test.ts lê esta pasta).
import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buscarAlimentosDoAluno, ErroAlunoDia, lerMeuDia, lerMinhaBiblioteca, mensagemErroAlunoDia } from "@/aluno-dia/api";
import { useSessao } from "@/nucleo/sessao";
import { LIMITES_DO_DIA } from "./regras";

export const CHAVE_DIA_LIVRE = "dieta-livre-dia";
export const CHAVE_BIBLIOTECA = "dieta-livre-biblioteca";
export const CHAVE_BUSCA = "dieta-livre-busca";

/** A frase fixa do erro (a do código da função; nunca a mensagem crua). */
export const fraseDoErro = (e: unknown): string => (e instanceof ErroAlunoDia ? e.message : mensagemErroAlunoDia(null));
/** A Dieta voltou a "Só ver" no meio (a nutri travou com a tela aberta). */
export const travou = (e: unknown): boolean => e instanceof ErroAlunoDia && e.codigo === "dieta_travada";

/** O dia de hoje dele (lê mesmo travada). `ativo` = a tela tem um plano atual para mostrar. */
export function useMeuDia(hoje: string, ativo: boolean) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useQuery({
    queryKey: [CHAVE_DIA_LIVRE, uid, hoje],
    queryFn: () => lerMeuDia(hoje),
    enabled: Boolean(uid) && ativo,
    staleTime: 30_000,
    // a nova tentativa é a do app (1, com 1 s — src/integrations/consultas.ts); sem rede, espera ela voltar
    networkMode: "online",
    refetchOnWindowFocus: true,
  });
}

/** Os alimentos e as receitas dele (só quando a folha "Meus alimentos e receitas" está aberta). */
export function useMinhaBiblioteca(ativo: boolean) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  return useQuery({
    queryKey: [CHAVE_BIBLIOTECA, uid],
    queryFn: () => lerMinhaBiblioteca(),
    enabled: Boolean(uid) && ativo,
    staleTime: 60_000,
    networkMode: "online",
  });
}

/** O termo depois de `ms` sem digitar (a busca não vai a cada letra). */
export function useAtrasado<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

/** O termo como o banco mede (aparado; espaços seguidos viram 1). */
export const termoDaBusca = (termo: string): string => termo.trim().replace(/\s+/g, " ").slice(0, LIMITES_DO_DIA.termo);

/** A busca do aluno (TACO, os dele, os dos planos dele, as receitas dele), 20 por página, a partir de 2 letras. */
export function useBuscaDoAluno(termo: string, ativo: boolean) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const t = termoDaBusca(termo);
  return useInfiniteQuery({
    queryKey: [CHAVE_BUSCA, uid, t],
    queryFn: ({ pageParam }) => buscarAlimentosDoAluno(t, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima) => (ultima.tem_mais && ultima.pagina < 50 ? ultima.pagina + 1 : undefined),
    enabled: Boolean(uid) && ativo && t.length >= LIMITES_DO_DIA.termoMinimo,
    staleTime: 60_000,
    networkMode: "online",
  });
}

export interface Gravacao {
  /** quem está gravando (o botão que gira): "tirar:<item>", "extra-nova"… */
  chave: string;
  fazer: () => Promise<unknown>;
  /** mexeu nos alimentos/receitas dele: relê a biblioteca e a busca também */
  biblioteca?: boolean;
  /** o toast de sucesso (sem = nenhum) */
  ok?: string;
}

/** Uma gravação por vez; o resultado é true/false (o erro já virou toast). `aoTravar` = a Dieta voltou a "Só ver" no meio. */
export function useGravarNoDia(aoTravar?: () => void) {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const uid = usuario?.id ?? null;
  const m = useMutation({
    mutationFn: (g: Gravacao) => g.fazer(),
    networkMode: "online",
    retry: 0,
    onSuccess: (_d, g) => {
      if (g.ok) toast.success(g.ok);
    },
    onError: (e) => {
      if (travou(e)) {
        toast.error(mensagemErroAlunoDia("dieta_travada"));
        aoTravar?.();
      } else toast.error(fraseDoErro(e));
    },
    onSettled: async (_d, _e, g) => {
      await qc.invalidateQueries({ queryKey: [CHAVE_DIA_LIVRE, uid] });
      if (g.biblioteca) {
        await qc.invalidateQueries({ queryKey: [CHAVE_BIBLIOTECA, uid] });
        void qc.invalidateQueries({ queryKey: [CHAVE_BUSCA, uid] });
      }
    },
  });
  return {
    gravar: (g: Gravacao): Promise<boolean> => m.mutateAsync(g).then(() => true, () => false),
    ocupado: m.isPending ? m.variables?.chave ?? null : null,
  };
}
