import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CartaoProps extends HTMLAttributes<HTMLDivElement> {
  /** Borda de luz violeta → verde (`.shine` das telas aprovadas): o cartão de destaque da tela. */
  brilho?: boolean;
}

/** Cartão do visual premium (`.card`): gradiente, linha fina, raio de 22 px e sombra. */
export const Cartao = forwardRef<HTMLDivElement, CartaoProps>(function Cartao({ brilho, className, ...props }, ref) {
  return <div ref={ref} data-cartao={brilho ? "brilho" : ""} className={cn("pq-cartao", brilho && "pq-brilho", className)} {...props} />;
});

/**
 * Cabeçalho de cartão do site (`.bh`): título, chip opcional e ação à direita. hml-18a (H-40): no celular, quando não cabe, a ação
 * desce de linha (à direita) e o título ganha "…" — antes a ação empurrava o cartão para fora da tela (ex.: a legenda da Agenda).
 */
export function CabecalhoCartao({
  titulo,
  extra,
  acao,
  className,
}: {
  titulo: React.ReactNode;
  extra?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2.5", className)}>
      <h3 className="min-w-0 truncate font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">{titulo}</h3>
      {extra}
      {acao && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{acao}</div>}
    </div>
  );
}
