import { useQuery } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarResumo } from "@/painel/mensagens/api";
import { CHAVES_MENSAGENS } from "@/painel/mensagens/chaves";

/**
 * Número do item "Mensagens" do menu (W22 — spec 4.4 "Mensagens (envios com falha)", tela 6, badge violeta): as falhas NOVAS da
 * própria fila — mensagens "falhou" dos últimos 7 dias, depois do último "Limpar". Some quando a mensagem é reenviada (volta para a
 * fila) ou quando ele limpa. A mesma leitura do resumo da página (whatsapp_resumo). Enquanto carrega, 0 (o menu não mostra número).
 */
export default function useContadorMensagens(): number | undefined {
  const { conta } = useConta();
  const { usuario } = useSessao();
  const contaId = conta?.id ?? "";
  const uid = usuario?.id ?? "";
  const q = useQuery({
    queryKey: CHAVES_MENSAGENS.resumo(contaId, uid),
    queryFn: () => buscarResumo(contaId || null),
    enabled: Boolean(uid),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  if (!uid) return undefined;
  return q.data?.falhas ?? 0;
}
