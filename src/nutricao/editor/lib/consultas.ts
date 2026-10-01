// Physiq W16 — as consultas da dieta que várias telas dividem (o editor da tela 8, a aba Dieta, o card do Resumo e a página
// "Editar treino e dieta"): o plano aberto, os planos do aluno e os ✓ das refeições. Banco principal, online (decisão 9A).
import { useQuery } from "@tanstack/react-query";
import { listarConcluidas } from "./concluidas";
import { buscarPlano, listarPlanos } from "./planos";

export const chavePlano = (planoId: string | null) => ["dieta-plano", planoId] as const;
export const chavePlanos = (pacienteId: string) => ["dieta-planos", pacienteId] as const;
export const chaveConcluidas = (pacienteId: string, de: string, ate: string) => ["dieta-concluidas", pacienteId, de, ate] as const;

/** O plano com refeições, itens e alimentos (RLS da nutrição). */
export function usePlano(planoId: string | null) {
  return useQuery({
    queryKey: chavePlano(planoId),
    queryFn: () => buscarPlano(planoId!),
    enabled: !!planoId,
    staleTime: 20_000,
    networkMode: "online",
  });
}

/** Os planos do aluno (mais recente primeiro). */
export function usePlanosDoAluno(pacienteId: string | null) {
  return useQuery({
    queryKey: chavePlanos(pacienteId ?? ""),
    queryFn: () => listarPlanos(pacienteId!),
    enabled: !!pacienteId,
    staleTime: 20_000,
    networkMode: "online",
  });
}

/** Os ✓ do aluno entre dois dias (inclusive). */
export function useConcluidas(pacienteId: string | null, de: string, ate: string) {
  return useQuery({
    queryKey: chaveConcluidas(pacienteId ?? "", de, ate),
    queryFn: () => listarConcluidas(pacienteId!, de, ate),
    enabled: !!pacienteId && !!de && !!ate,
    staleTime: 30_000,
    networkMode: "online",
  });
}
