import { useQuery } from "@tanstack/react-query";
import { PRINCIPAL_SCHEMA } from "@/integrations/principal/client";
import { useConta } from "@/nucleo/conta";
import { garantirMeuCodigo } from "@/painel/configuracoes/equipe/api";
import { linkDoAluno, siteDoAmbiente } from "@/painel/configuracoes/equipe/regras";

/** O código e os links do profissional nesta conta (o ?prof= de hoje e o /c/ de cadastro). */
export function useMeuLink() {
  const { conta } = useConta();
  const codigoConta = conta?.codigo_convite ?? null;
  const q = useQuery({
    queryKey: ["meu-codigo", conta?.id, codigoConta],
    queryFn: async () => codigoConta ?? (await garantirMeuCodigo(conta!.id)),
    enabled: Boolean(conta?.id),
    staleTime: Infinity,
    retry: 1,
  });
  const codigo = q.data ?? null;
  return {
    codigo,
    carregando: q.isLoading,
    link: codigo ? linkDoAluno(codigo, PRINCIPAL_SCHEMA) : "",
    linkCadastro: codigo ? `${siteDoAmbiente(PRINCIPAL_SCHEMA)}/c/${encodeURIComponent(codigo)}` : "",
    papeis: conta?.papeis ?? [],
    contaNome: conta?.nome ?? "",
  };
}
