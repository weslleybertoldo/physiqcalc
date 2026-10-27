import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Exercícios do treino minimizados: tocar no nome do treino esconde a lista dos exercícios e tocar de novo mostra (pedido do
 * Weslley, 22/10/2026). A aba abre SEMPRE com o treino minimizado — só o cartão-resumo — e finalizar o treino minimiza (26/10/2026:
 * "O treino sempre abre assim minimizado. E quando termino o treino e clicar em treino finalizado ele vai minimizar também."). Nada
 * fica guardado no aparelho: mostrar vale enquanto a aba está aberta (trocar de aba, de dia ou reabrir o app volta minimizado). A
 * exceção é o treino em andamento (o cronômetro rodando NESTE treino): ele abre com a lista à mostra, para não sumir no meio.
 */
export function useListaMinimizada(
  dia: string,
  slot: number,
  { emAndamento = false, concluido = false }: { emAndamento?: boolean; concluido?: boolean } = {},
): [boolean, (minimizado: boolean) => void] {
  const chave = `${dia}|${slot}`;
  const [estado, setEstado] = useState(() => ({ chave, valor: !emAndamento }));
  // trocou de dia/treino: volta ao padrão (sem efeito, na própria renderização)
  const atual = estado.chave === chave ? estado.valor : !emAndamento;
  if (estado.chave !== chave) setEstado({ chave, valor: atual });
  // finalizou o treino ("Sim, finalizar" do cronômetro ou "Marcar como concluído"): só a virada para concluído minimiza
  const concluidoAntes = useRef(concluido);
  useEffect(() => {
    if (concluido && !concluidoAntes.current) setEstado({ chave, valor: true });
    concluidoAntes.current = concluido;
  }, [concluido, chave]);
  const mudar = useCallback((minimizado: boolean) => setEstado({ chave, valor: minimizado }), [chave]);
  return [atual, mudar];
}
