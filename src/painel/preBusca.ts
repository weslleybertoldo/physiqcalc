import type { QueryClient } from "@tanstack/react-query";
import type { ItemRegistro } from "@/rotas/registro";

/** O que a pré-busca do painel precisa saber da sessão. */
export interface ContextoPreBusca {
  qc: QueryClient;
  /** a conta ativa (a mesma do useConta das páginas) */
  contaId: string | null;
  /** quem está no Banco do Treino (a sessão do Treino já chegou) — sem ela, nada do Treino */
  meuIdTreino: string | null;
}

/**
 * hml-18b (H-54, F — §2.6 item 4 da spec): a PRÉ-BUSCA da 1ª dobra das telas do menu, junto com a pré-carga do pedaço
 * (src/rotas/usePreCarga.ts, `aoCarregar`): quando o pedaço de uma página chega (no ocioso), as consultas da 1ª dobra dela vão para o
 * cache com o staleTime que já existe — o toque acha a tela pronta. Só leitura, uma vez por abertura do painel; respeita o "economia
 * de dados" e o 2G (a pré-carga nem roda).
 *   Alunos   a 1ª página da lista (o filtro padrão) — o Painel → Alunos não espera a lista;
 *   Treinos  a 1ª página de modelos e as pastas — as 2 chamadas da admin-semana-treinos saem na montagem (H-82).
 * Fora, de propósito: o Financeiro (as funções dele mudam na W dos planos do aluno — combinado com a sessão principal) e as chamadas da
 * admin-semana-treinos (função pesada no banco do Treino, que é pequeno — H-80).
 */
const PRE_BUSCA: Record<string, (c: ContextoPreBusca) => Promise<unknown> | null> = {
  "/src/painel/paginas/Alunos.tsx": (c) => (c.contaId ? import("@/painel/alunos/consultas").then((m) => m.preBuscarAlunos(c.qc, c.contaId as string)) : null),
  "/src/painel/paginas/Treinos.tsx": (c) =>
    c.meuIdTreino ? import("@/painel/treinos/useTreinos").then((m) => m.preBuscarTreinos(c.qc, c.meuIdTreino as string)) : null,
};

/** As telas que têm pré-busca (o teste confere que o Financeiro não está). */
export const TELAS_COM_PRE_BUSCA: readonly string[] = Object.keys(PRE_BUSCA);

/** A pré-busca da tela cujo pedaço acabou de chegar (nada, se ela não tem). Erro de rede fica quieto: a tela busca ao abrir. */
export function preBuscar(item: ItemRegistro, c: ContextoPreBusca): Promise<unknown> | null {
  const f = PRE_BUSCA[item.caminho];
  return f ? (f(c)?.catch(() => undefined) ?? null) : null;
}
