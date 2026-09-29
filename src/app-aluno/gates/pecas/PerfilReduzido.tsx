import type { ReactNode } from "react";
import { CtxPerfilReduzido, type ModoReduzido } from "./modoReduzido";

/** Abre a aba Perfil no modo reduzido (Sair, Exportar e Excluir) — ver ./modoReduzido.ts. */
export function PerfilReduzido({ children, ...modo }: ModoReduzido & { children: ReactNode }) {
  return <CtxPerfilReduzido.Provider value={modo}>{children}</CtxPerfilReduzido.Provider>;
}
