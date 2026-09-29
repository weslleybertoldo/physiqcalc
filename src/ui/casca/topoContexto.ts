import { createContext } from "react";

/** Onde a página desenha o topo (título/trilha e ações) — dentro da casca do painel/master. */
export interface TopoContexto {
  alvoTitulo: HTMLElement | null;
  alvoAcoes: HTMLElement | null;
  definirProprio: (proprio: boolean) => void;
}

export const TopoCtx = createContext<TopoContexto | null>(null);
