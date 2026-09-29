import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Cartao } from "./Cartao";

/** Grupo de itens num cartão (`.grp` da tela 5), com rótulo opcional em caixa alta. */
export function GrupoLista({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <Cartao className={cn("px-3.5 py-1", className)}>
      {titulo && <div className="pq-eyebrow pb-1 pt-2.5">{titulo}</div>}
      <div className="divide-y divide-linha-3">{children}</div>
    </Cartao>
  );
}

/** Item de lista (`.it`): ícone num quadrado, nome, valor à direita e a seta. `perigo` = rosa (Excluir). */
export function ItemLista({
  icone: Icone,
  rotulo,
  valor,
  para,
  aoTocar,
  perigo,
  semSeta,
  className,
}: {
  icone?: LucideIcon;
  rotulo: ReactNode;
  valor?: ReactNode;
  para?: string;
  aoTocar?: () => void;
  perigo?: boolean;
  semSeta?: boolean;
  className?: string;
}) {
  const conteudo = (
    <>
      {Icone && (
        <span className={cn("flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave", perigo && "text-rosa-3")}>
          <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-left">{rotulo}</span>
      {(valor || !semSeta) && (
        <span className="ml-auto flex flex-none items-center gap-1.5 text-[12.5px] text-texto-2">
          {valor}
          {!semSeta && <ChevronRight aria-hidden className="h-[15px] w-[15px] text-texto-4" />}
        </span>
      )}
    </>
  );
  const classe = cn("flex min-h-[44px] w-full items-center gap-3 py-1.5 text-[13.5px] font-medium", perigo ? "text-rosa-3" : "text-texto", className);
  if (para) return <Link to={para} className={classe}>{conteudo}</Link>;
  if (aoTocar) return <button type="button" onClick={aoTocar} className={classe}>{conteudo}</button>;
  return <div className={classe}>{conteudo}</div>;
}
