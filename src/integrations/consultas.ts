// Physiq hml-17 (H-53) — a configuração do React Query do app (saiu do src/App.tsx para o Vitest conferir).
// Consultas: 1 nova tentativa com 1 s de espera (eram 3, com 1 + 2 + 4 s). Com o fetch dos 2 clientes repetindo a leitura 1 vez
// (TENTATIVAS_LEITURA, src/integrations/repeticao.ts), uma consulta de leitura com a API fora faz no máximo 2 × 2 = 4 pedidos e
// avisa em ~3 s (eram 12 pedidos e ~19 s: o painel fazia 129 pedidos em 40 s e os cards do Dashboard só avisavam em ~21 s). As
// telas que precisam de outra regra continuam com o próprio `retry`. Mutações não repetem (hml-06, H-20).
import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

/** Espera fixa antes da nova tentativa da consulta. */
export const ESPERA_NOVA_TENTATIVA_MS = 1000;

export const OPCOES_CONSULTAS = {
  queries: {
    staleTime: 1000 * 60 * 5, // 5 min — evita refetch desnecessário
    gcTime: 1000 * 60 * 60 * 24, // 24h — cache offline
    retry: 1,
    retryDelay: ESPERA_NOVA_TENTATIVA_MS,
    refetchOnReconnect: "always",
    refetchOnWindowFocus: false,
    networkMode: "offlineFirst",
  },
  mutations: {
    // hml-06 (H-20): mutação não repete sozinha — o servidor pode ter feito e só a resposta se perdido (cobrança 2×); a
    // que é idempotente pede no próprio useMutation (useAvisos.marcar)
    retry: 0,
    networkMode: "offlineFirst",
  },
} satisfies DefaultOptions;

/** O cliente do React Query do app (o mesmo do App.tsx). */
export function criarClienteDeConsultas(): QueryClient {
  return new QueryClient({ defaultOptions: OPCOES_CONSULTAS });
}
