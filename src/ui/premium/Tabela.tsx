import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Tabela no padrão da tela 8 (Alimento · Qtde. · kcal): cabeçalho pequeno em caixa alta, linhas finas. */
export function Tabela({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px] text-texto", className)} {...props} />
    </div>
  );
}
export function TabelaCabeca({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_th]:pb-2", className)} {...props} />;
}
export function TabelaCorpo({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr]:border-t [&_tr]:border-linha-3", className)} {...props} />;
}
export function TabelaLinha({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-superficie-3", className)} {...props} />;
}
export function TabelaTitulo({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-texto-3", className)} {...props} />;
}
export function TabelaCelula({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-[52px] px-2 align-middle tabular-nums", className)} {...props} />;
}
