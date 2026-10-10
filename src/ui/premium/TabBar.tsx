import { useEffect, useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { depoisDaPintura } from "./depoisDaPintura";

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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // hml-18a (H-40, E): o toque numa aba marca a aba NA HORA (a 1ª mudança na tela) e a página nova vem depois da pintura — com
  // useTransitions={false}, o render da página nova ia no mesmo toque e a tela ficava parada até ele acabar (~100 ms nas abas mais
  // pesadas, no notebook). A marca "pendente" vale até a página mudar (e, por garantia, 1,5 s).
  const [pendente, setPendente] = useState<string | null>(null);
  const [caminhoVisto, setCaminhoVisto] = useState(pathname);
  if (pathname !== caminhoVisto) {
    setCaminhoVisto(pathname);
    setPendente(null);
  }
  useEffect(() => {
    if (!pendente) return;
    const t = window.setTimeout(() => setPendente(null), 1500);
    return () => window.clearTimeout(t);
  }, [pendente]);
  const tocar = (e: MouseEvent<HTMLAnchorElement>, it: ItemTabBar) => {
    it.aoTocar?.();
    // a aba aberta, Ctrl/⌘/Shift/Alt (nova aba/janela) ou outro botão: o Link segue sozinho
    if (!it.para || it.ativo || e.defaultPrevented || e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setPendente(it.id);
    const para = it.para;
    depoisDaPintura(() => navigate(para));
  };
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
        // a marca visual: a aba tocada (pendente) já marcada; o aria-current segue a página aberta de verdade
        const marcado = pendente ? it.id === pendente : !!it.ativo;
        const conteudo = (
          <>
            <span
              className={cn(
                "relative flex h-[30px] w-[46px] items-center justify-center rounded-[12px] border border-transparent transition-colors",
                marcado && "border-linha-2 bg-superficie-2",
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
        // hml-18a (H-40): o item encolhe no toque (a resposta do celular, que não tem hover) e a cor muda com transição. No Tailwind 4 o
        // active:scale-* usa a propriedade `scale` (não `transform`): é ela que entra na transição
        const classe = cn(
          "flex min-w-0 flex-1 flex-col items-center gap-1 text-[10.5px] font-semibold transition-[color,scale] duration-150 active:scale-[0.94]",
          marcado ? "text-texto" : "text-texto-3 hover:text-texto-2",
        );
        return it.para ? (
          <Link
            key={it.id}
            to={it.para}
            data-aba={it.id}
            data-pendente={pendente === it.id ? "" : undefined}
            aria-current={it.ativo ? "page" : undefined}
            className={classe}
            onClick={(e) => tocar(e, it)}
          >
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
