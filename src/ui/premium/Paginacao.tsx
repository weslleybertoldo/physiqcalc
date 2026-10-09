import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { POR_PAGINA, paginaValida, rotulo, ultimaPagina } from "@/lib/paginacao";
import { Botao } from "./Botao";

/**
 * Paginação das listas (hml-14b, B21 · D13): "1–20 de 41" + ← Anterior · Próxima → + "página 1 de 3" (esta só a partir de
 * 640 px; no celular o "1–20 de 41" já diz onde está). Uma página só: fica o "1–N de N", sem setas. Lista vazia: nada.
 * `data-paginacao`, `data-pagina` e `data-total` são do E2E.
 */
export function Paginacao({
  pagina,
  total,
  aoMudar,
  porPagina = POR_PAGINA,
  carregando = false,
  className,
  nome,
}: {
  pagina: number;
  total: number;
  aoMudar: (pagina: number) => void;
  porPagina?: number;
  /** Página nova a caminho: as setas esperam (não pula 2 páginas com 2 toques). */
  carregando?: boolean;
  className?: string;
  /** Qual lista, quando a tela tem mais de uma (vai no `data-paginacao`). */
  nome?: string;
}) {
  if (total <= 0) return null;
  const ultima = ultimaPagina(total, porPagina);
  const atual = paginaValida(pagina, total, porPagina);
  return (
    <nav
      aria-label="Paginação"
      className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 text-[12.5px] text-texto-3", className)}
      data-paginacao={nome ?? ""}
      data-pagina={atual}
      data-total={total}
    >
      <span className="tabular-nums" aria-live="polite" data-paginacao-rotulo>
        {rotulo(atual, total, porPagina)}
      </span>
      {ultima > 1 && (
        <span className="flex items-center gap-2">
          <Botao
            tamanho="sm"
            icone={ChevronLeft}
            disabled={atual <= 1 || carregando}
            onClick={() => aoMudar(atual - 1)}
            data-pagina-anterior
          >
            Anterior
          </Botao>
          <span className="hidden tabular-nums sm:inline" data-paginacao-de>
            página {atual} de {ultima}
          </span>
          <Botao
            tamanho="sm"
            disabled={atual >= ultima || carregando}
            onClick={() => aoMudar(atual + 1)}
            data-pagina-proxima
          >
            Próxima
            <ChevronRight aria-hidden />
          </Botao>
        </span>
      )}
    </nav>
  );
}
