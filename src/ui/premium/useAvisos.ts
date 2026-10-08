import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Avisos do sino (NF9). A tabela `avisos` mora no BANCO PRINCIPAL (criada na W2) e cada pessoa lê só
 * os seus (RLS `destino_user_id = auth.uid()`); quem grava são as worktrees de cada assunto (plano
 * atualizado, reação no diário, pagamento, consulta, avaliação).
 *
 * O cliente do principal (src/integrations/principal/client.ts, W2) é carregado sob demanda e só se
 * existir no build (`import.meta.glob`): sem ele, ou sem login no principal (o login único entra na
 * W3), o sino mostra "Nenhum aviso" — nunca quebra a casca.
 */
export interface AvisoSino {
  id: string;
  tipo: string;
  titulo: string;
  link: string | null;
  lido_em: string | null;
  criado_em: string;
}

interface RespostaLista {
  data: AvisoSino[] | null;
  error: { message?: string } | null;
}

/** O pedaço do cliente supabase-js do principal que o sino usa (evita depender dos tipos da W2). */
interface ClientePrincipalMinimo {
  auth: { getSession(): Promise<{ data: { session: unknown } }> };
  from(tabela: "avisos"): {
    select(colunas: string): { order(coluna: string, opcoes: { ascending: boolean }): { limit(n: number): PromiseLike<RespostaLista> } };
    update(valores: { lido_em: string }): { in(coluna: string, valores: string[]): PromiseLike<{ error: { message?: string } | null }> };
  };
}

interface ModuloPrincipal {
  principal?: unknown;
  principalConfigurado?: boolean;
}

const MODULOS = import.meta.glob<ModuloPrincipal>("/src/integrations/principal/client.ts");
const carregarPrincipal = Object.values(MODULOS)[0] as (() => Promise<ModuloPrincipal>) | undefined;

export const CHAVE_AVISOS = ["sino-avisos"] as const;

async function clienteComSessao(): Promise<ClientePrincipalMinimo | null> {
  if (!carregarPrincipal) return null;
  const mod = await carregarPrincipal();
  if (!mod.principal || mod.principalConfigurado === false) return null;
  const cliente = mod.principal as ClientePrincipalMinimo;
  const { data } = await cliente.auth.getSession();
  return data.session ? cliente : null;
}

export interface EstadoAvisos {
  /** false = sem banco principal ou sem login nele (antes da W3): o sino fica vazio. */
  disponivel: boolean;
  avisos: AvisoSino[];
}

export async function buscarAvisos(): Promise<EstadoAvisos> {
  const cliente = await clienteComSessao();
  if (!cliente) return { disponivel: false, avisos: [] };
  const { data, error } = await cliente.from("avisos").select("id,tipo,titulo,link,lido_em,criado_em").order("criado_em", { ascending: false }).limit(30);
  if (error) throw new Error(error.message || "avisos");
  return { disponivel: true, avisos: data ?? [] };
}

export function useAvisos() {
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: CHAVE_AVISOS,
    queryFn: buscarAvisos,
    enabled: Boolean(carregarPrincipal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    networkMode: "online",
  });
  const avisos = consulta.data?.avisos ?? [];
  const naoLidos = avisos.filter((a) => !a.lido_em).length;

  const marcar = useMutation({
    mutationFn: async (ids: string[]) => {
      const cliente = await clienteComSessao();
      if (!cliente || ids.length === 0) return;
      const { error } = await cliente.from("avisos").update({ lido_em: new Date().toISOString() }).in("id", ids);
      if (error) throw new Error(error.message || "avisos");
    },
    retry: 1, // hml-06: marcar como lido é idempotente (o mesmo PATCH de lido_em) — o padrão das mutações passou a 0
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_AVISOS }),
  });

  return {
    avisos,
    naoLidos,
    disponivel: consulta.data?.disponivel ?? false,
    carregando: consulta.isLoading,
    erro: consulta.isError,
    recarregar: () => consulta.refetch(),
    marcarLidos: () => {
      const ids = avisos.filter((a) => !a.lido_em).map((a) => a.id);
      if (ids.length) marcar.mutate(ids);
    },
  };
}
