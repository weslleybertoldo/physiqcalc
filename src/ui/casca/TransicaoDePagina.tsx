import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { chaveDaPagina } from "./chaveDaPagina";

/**
 * hml-18a (H-40, E) — a TRANSIÇÃO DE PÁGINA (Skill-wbs-navegacao, princípio 5): a página nova entra esmaecendo e subindo 8 px em
 * 200 ms; a casca (topo, menu, barra de baixo) não remonta. Fica em volta só do <Outlet/> — dentro das travas e das faixas, que
 * guardam estado próprio (ex.: a faixa do plano fechada) e não podem remontar a cada troca. A chave é a PÁGINA, não a aba
 * (`chaveDaPagina`): as abas do aluno e das configurações trocam sem remontar. Sem bloco de "reduzir movimento" (princípio 6).
 */
export function TransicaoDePagina({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const chave = chaveDaPagina(pathname);
  return (
    <div key={chave} data-pagina={chave} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      {children}
    </div>
  );
}
