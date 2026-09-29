import type { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tons dos chips das telas: t = treino (violeta), n = nutrição (verde), a = aviso (âmbar), g = neutro, c = apoio (ciano), r = erro (rosa). */
export type TomChip = "t" | "n" | "a" | "g" | "c" | "r";

const CLASSE_TOM: Record<TomChip, string> = {
  t: "pq-chip-t",
  n: "pq-chip-n",
  a: "pq-chip-a",
  g: "pq-chip-g",
  c: "pq-chip-c",
  r: "pq-chip-r",
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tom?: TomChip;
  icone?: LucideIcon;
}

export function Chip({ tom = "g", icone: Icone, className, children, ...props }: ChipProps) {
  return (
    <span data-chip={tom} className={cn("pq-chip", CLASSE_TOM[tom], className)} {...props}>
      {Icone && <Icone aria-hidden />}
      {children}
    </span>
  );
}
