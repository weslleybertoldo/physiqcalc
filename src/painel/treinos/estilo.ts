import { useState } from "react";

/** O campo de texto do painel de treinos (o mesmo das folhas do editor da W15). */
export const CLASSE_CAMPO =
  "h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 text-[13.5px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta-3 disabled:opacity-60";

/** Mês de referência (Histórico e Relatório): começa no mês de hoje e não passa dele. */
export function useMes() {
  const agora = new Date();
  const [ref, setRef] = useState({ ano: agora.getFullYear(), mes: agora.getMonth() + 1 });
  const mover = (delta: number) =>
    setRef((r) => {
      const d = new Date(r.ano, r.mes - 1 + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
    });
  const noMesAtual = ref.ano > agora.getFullYear() || (ref.ano === agora.getFullYear() && ref.mes >= agora.getMonth() + 1);
  return { ...ref, mover, noMesAtual };
}
