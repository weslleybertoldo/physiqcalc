import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface ItemTabBar {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  /** Rota do item (vira link); sem rota, usa `aoTocar`. */
  para?: string;
  aoTocar?: () => void;
  ativo?: boolean;
  /** Número/ponto de novidade no ícone. */
  marca?: number | boolean;
}

/**
 * Barra de abas flutuante com desfoque (`.tabbar` da tela 1): 66 px de altura, raio 24, a 14 px das
 * laterais e 26 px do fundo (+ área segura do aparelho). O item ativo ganha a "pílula" clara atrás do
 * ícone. Rótulo sempre inteiro (sem reticências): a largura de cada aba é dividida por igual.
 */
export function TabBar({ itens, className, rotulo = "Navegação principal" }: { itens: ItemTabBar[]; className?: string; rotulo?: string }) {
  return (
    <nav
      aria-label={rotulo}
      data-tabbar
      className={cn(
        "pq-vidro fixed inset-x-[14px] z-40 mx-auto flex h-[66px] max-w-[520px] items-center justify-around rounded-[24px] px-1",
        className,
      )}
      style={{ bottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }}
    >
      {itens.map((it) => {
        const conteudo = (
          <>
            <span
              className={cn(
                "relative flex h-[30px] w-[46px] items-center justify-center rounded-[12px] border border-transparent transition-colors",
                it.ativo && "border-linha-2 bg-superficie-2",
              )}
            >
              <it.icone aria-hidden className="h-[21px] w-[21px]" strokeWidth={1.75} />
              {it.marca ? (
                typeof it.marca === "number" ? (
                  <b className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-violeta px-1 text-center text-[9.5px] font-bold leading-4 text-white">
                    {it.marca > 99 ? "99+" : it.marca}
                  </b>
                ) : (
                  <i className="absolute right-2 top-1 h-[7px] w-[7px] rounded-full bg-rosa" style={{ boxShadow: "0 0 0 2px var(--p-ponto-borda)" }} />
                )
              ) : null}
            </span>
            <span className="whitespace-nowrap">{it.rotulo}</span>
          </>
        );
        const classe = cn(
          "flex min-w-0 flex-1 flex-col items-center gap-1 text-[10.5px] font-semibold transition-colors",
          it.ativo ? "text-texto" : "text-texto-3 hover:text-texto-2",
        );
        return it.para ? (
          <Link key={it.id} to={it.para} data-aba={it.id} aria-current={it.ativo ? "page" : undefined} className={classe} onClick={it.aoTocar}>
            {conteudo}
          </Link>
        ) : (
          <button key={it.id} type="button" data-aba={it.id} aria-current={it.ativo ? "page" : undefined} className={classe} onClick={it.aoTocar}>
            {conteudo}
          </button>
        );
      })}
    </nav>
  );
}

/** Altura que a barra ocupa embaixo (66 + 26 + folga) — o conteúdo da tela reserva esse espaço. */
export const RESERVA_TABBAR = "calc(66px + 26px + 18px + env(safe-area-inset-bottom, 0px))";
