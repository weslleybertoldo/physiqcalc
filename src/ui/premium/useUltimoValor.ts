import { useState } from "react";

/**
 * hml-18a (H-40, D) — o último valor não vazio. O painel que fecha porque o valor que o abre voltou a null (`membro`, `acao`,
 * `senha`…) continua mostrando o conteúdo de antes enquanto a saída anima: sem isto o pai desmontava o painel (a saída não
 * existia) ou ele sumia vazio. Abrir de novo com outro valor mostra o novo na hora.
 *
 *   const visto = useUltimoValor(membro);           // membro: o que abre (null = fechado)
 *   if (!visto) return null;                        // nunca abriu: nada a mostrar nem a animar
 *   return <PainelDeslizante aberto={Boolean(membro)} …>{visto.nome}</PainelDeslizante>;
 */
export function useUltimoValor<T>(valor: T | null | undefined): T | null {
  const [ultimo, setUltimo] = useState<T | null>(valor ?? null);
  // o "ajuste de estado quando a prop muda" do React (no render, sem efeito: o 1º quadro já sai com o valor novo)
  if (valor != null && !Object.is(valor, ultimo)) setUltimo(valor);
  return valor ?? ultimo;
}
