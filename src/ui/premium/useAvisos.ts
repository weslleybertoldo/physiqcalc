import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acaoConta } from "@/conta/gravar";
import { lerConta } from "@/conta/ler";

/**
 * Avisos do sino (NF9). A tabela `avisos` mora no BANCO PRINCIPAL (criada na W2) e cada pessoa lê só
 * os seus (RLS `destino_user_id = auth.uid()`); quem grava são as worktrees de cada assunto (plano
 * atualizado, reação no diário, pagamento, consulta, avaliação).
 *
 * Sem login no principal (ou com a função fora), o sino mostra "Nenhum aviso" — nunca quebra a casca.
 *
 * hml-21a (H-43 · jeito 2): a lista e o "marcar como lido" passam pela função conta, com a sessão de quem está logado — a lista pelo `ler`
 * (q "avisos": os 30 mais novos; o RLS de hoje decide que são os da pessoa) e o lido pela ação avisos_marcar_lidos (só o lido_em, só as
 * linhas da pessoa). A ação NÃO repete (o `retry: 1` de hoje fazia 2 PATCH quando o 1º falhava): abrir com não lidos = 1 ação. A chave,
 * o staleTime e o foco do React Query não mudam; sem login no principal, o sino segue vazio sem chamar nada.
 */
export interface AvisoSino {
  id: string;
  tipo: string;
  titulo: string;
  link: string | null;
  lido_em: string | null;
  criado_em: string;
}

/** O pedaço do cliente supabase-js do principal que o sino usa: só a sessão guardada (hml-21a: os dados vão pela função conta). */
interface ClientePrincipalMinimo {
  auth: { getSession(): Promise<{ data: { session: unknown } }> };
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
  // hml-21a: o erro sobe (ErroLeitura com o código; a consulta fica em erro e o sino mostra "Nenhum aviso", como antes)
  const r = await lerConta("avisos");
  return { disponivel: true, avisos: (r.linhas ?? []) as AvisoSino[] };
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
      await acaoConta("avisos_marcar_lidos", { ids });
    },
    // hml-21a (decisão M): a ação pela função vai 1 vez (a função não repete: o servidor pode ter gravado e só a resposta se perdido);
    // o que não marcou fica não lido e a próxima abertura marca de novo
    retry: 0,
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
