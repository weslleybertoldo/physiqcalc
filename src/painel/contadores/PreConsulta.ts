import { useQuery } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { CHAVES_PRECONSULTA, contarRespostasNovas } from "@/painel/preconsulta/novas";

/**
 * Número do item "Pré-consulta" do menu (W21 — spec 4.4 "Pré-consulta (novas respostas)", tela 6): as respostas NOVAS — vivas e sem
 * aluno ligado, o critério do Nutri ("respostas de pré-consulta sem paciente") — no recorte da conta ativa e com a regra do banco (o
 * dono não conta as de formulário de nutricionista se não for nutricionista; o membro, só as suas). Ligar a um aluno (ou importar, que
 * exige o aluno) tira a resposta da conta. Enquanto carrega, 0 (o menu não mostra número).
 */
export default function useContadorPreConsulta(): number | undefined {
  const { conta } = useConta();
  const { usuario } = useSessao();
  const contaId = conta?.id ?? "";
  const uid = usuario?.id ?? "";
  const q = useQuery({
    queryKey: CHAVES_PRECONSULTA.novas(contaId, uid),
    queryFn: () => contarRespostasNovas(contaId, uid),
    enabled: Boolean(contaId && uid),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  if (!contaId || !uid) return undefined;
  return q.data ?? 0;
}
