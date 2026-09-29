import { useContext, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { TopoCtx } from "./topoContexto";

/**
 * Topo das páginas do painel/master (tela 6: título e data; telas 7–8: trilha "Alunos › nome"; à
 * direita a busca, o sino e o botão principal da página). A página descreve o topo com
 * <TopoPagina>; sem ela, a casca mostra o nome do item do menu.
 */
export interface PassoTrilha {
  rotulo: string;
  para?: string;
  icone?: LucideIcon;
}

export function BlocoTitulo({ titulo, subtitulo, trilha }: { titulo?: ReactNode; subtitulo?: ReactNode; trilha?: PassoTrilha[] }) {
  if (trilha?.length) {
    return (
      <nav aria-label="Trilha" data-trilha className="flex min-w-0 items-center gap-2 text-[13px] text-texto-3">
        {trilha.map((p, i) => {
          const ultimo = i === trilha.length - 1;
          const Icone = p.icone;
          const corpo = (
            <>
              {Icone && <Icone aria-hidden className="h-[15px] w-[15px] flex-none" strokeWidth={1.75} />}
              <span className="truncate">{p.rotulo}</span>
            </>
          );
          return (
            <span key={`${p.rotulo}-${i}`} className="flex min-w-0 items-center gap-2">
              {p.para && !ultimo ? (
                <Link to={p.para} className="flex min-w-0 items-center gap-2 transition-colors hover:text-texto-2">
                  {corpo}
                </Link>
              ) : (
                <b className={ultimo ? "flex min-w-0 items-center gap-2 font-semibold text-forte" : "flex min-w-0 items-center gap-2 font-normal"}>{corpo}</b>
              )}
              {!ultimo && <ChevronRight aria-hidden className="h-[15px] w-[15px] flex-none" />}
            </span>
          );
        })}
      </nav>
    );
  }
  return (
    <div className="min-w-0">
      <h1 data-titulo-pagina className="truncate font-body text-[20px] font-bold normal-case tracking-[-0.03em] text-texto lg:text-[26px]">
        {titulo}
      </h1>
      {subtitulo && <div className="mt-[3px] truncate text-[13px] text-texto-2">{subtitulo}</div>}
    </div>
  );
}

/** A página descreve o topo: título + subtítulo, ou a trilha; e as ações à direita. */
export function TopoPagina({ titulo, subtitulo, trilha, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; trilha?: PassoTrilha[]; acoes?: ReactNode }) {
  const ctx = useContext(TopoCtx);
  const definir = ctx?.definirProprio;
  useLayoutEffect(() => {
    definir?.(true);
    return () => definir?.(false);
  }, [definir]);
  if (!ctx) return null;
  return (
    <>
      {ctx.alvoTitulo && createPortal(<BlocoTitulo titulo={titulo} subtitulo={subtitulo} trilha={trilha} />, ctx.alvoTitulo)}
      {acoes && ctx.alvoAcoes && createPortal(acoes, ctx.alvoAcoes)}
    </>
  );
}
