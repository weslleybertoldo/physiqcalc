import type { ReactNode } from "react";
import type { Gate } from "@/rotas/registro";

/**
 * Aplica as travas registradas em volta do conteúdo (a 1ª da lista fica por fora). Cada trava devolve
 * `children` (libera), outra tela (trava) ou `<>{faixa}{children}</>` (faixa).
 */
export function ComGates({ gates, children }: { gates: { nome: string; Gate: Gate }[]; children: ReactNode }) {
  return <>{gates.reduceRight<ReactNode>((dentro, { nome, Gate }) => <Gate key={nome}>{dentro}</Gate>, children)}</>;
}
