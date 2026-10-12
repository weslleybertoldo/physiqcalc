// Physiq W16 — as consultas da dieta que várias telas dividem (o editor da tela 8, a aba Dieta, o card do Resumo e a página
// "Editar treino e dieta"): o plano aberto, os planos do aluno e os ✓ das refeições. Banco principal, online (decisão 9A).
// hml-20c (H-42 · série = 1 ida): o editor abre o plano que a LISTA dos planos do aluno já trouxe — as 2 RPCs montam o plano pela mesma
// plano_alimentar_json (migração hml-17), então o JSON é o mesmo: o usePlano começa com ele (initialData, com a idade da lista — o
// staleTime de 20 s vale igual) e não faz a 2ª ida em série (antes: a lista → o plano). Sem a lista no cache (outra tela), a ida de sempre.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { listarConcluidas } from "./concluidas";
import { buscarPlano, listarPlanos, type Plano } from "./planos";

export const chavePlano = (planoId: string | null) => ["dieta-plano", planoId] as const;
export const chavePlanos = (pacienteId: string) => ["dieta-planos", pacienteId] as const;
export const chaveConcluidas = (pacienteId: string, de: string, ate: string) => ["dieta-concluidas", pacienteId, de, ate] as const;

/** hml-20c: o plano dentro de uma lista de planos do aluno que já está no cache (a mais nova, se houver mais de uma) e a idade dela. */
export function planoDaLista(qc: QueryClient, planoId: string | null): { plano: Plano; em: number } | null {
  if (!planoId) return null;
  let achado: { plano: Plano; em: number } | null = null;
  for (const [chave, lista] of qc.getQueriesData<Plano[]>({ queryKey: ["dieta-planos"] })) {
    const plano = Array.isArray(lista) ? lista.find((p) => p.id === planoId) : undefined;
    const em = qc.getQueryState(chave)?.dataUpdatedAt ?? 0;
    if (plano && (!achado || em > achado.em)) achado = { plano, em };
  }
  return achado;
}

/** O plano com refeições, itens e alimentos (RLS da nutrição). */
export function usePlano(planoId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: chavePlano(planoId),
    queryFn: () => buscarPlano(planoId!),
    enabled: !!planoId,
    staleTime: 20_000,
    networkMode: "online",
    // hml-20c: o plano que a lista já trouxe (sem a 2ª ida em série); a idade é a da lista
    initialData: () => planoDaLista(qc, planoId)?.plano,
    initialDataUpdatedAt: () => planoDaLista(qc, planoId)?.em,
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
