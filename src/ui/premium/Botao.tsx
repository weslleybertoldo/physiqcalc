import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** w = ação principal (branco no escuro, grafite no claro) · g = vidro · v = violeta */
export type VarianteBotao = "w" | "g" | "v";

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: "md" | "sm";
  icone?: LucideIcon;
}

const CLASSE_VARIANTE: Record<VarianteBotao, string> = { w: "pq-botao-w", g: "pq-botao-g", v: "pq-botao-v" };

/** Botão do visual premium (`.btn`). */
export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = "g", tamanho = "md", icone: Icone, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("pq-botao", CLASSE_VARIANTE[variante], tamanho === "sm" && "pq-botao-sm", className)}
      {...props}
    >
      {Icone && <Icone aria-hidden />}
      {children}
    </button>
  );
});

export interface BotaoIconeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icone: LucideIcon;
  /** Nome do botão para leitor de tela e dica (obrigatório: o botão não tem texto). */
  rotulo: string;
  /** Ponto rosa de "tem novidade" (`.ibtn .dot`). */
  ponto?: boolean;
  tamanho?: number;
}

/** Botão só de ícone (`.ibtn`): 40 × 40, raio 14, vidro. */
export const BotaoIcone = forwardRef<HTMLButtonElement, BotaoIconeProps>(function BotaoIcone(
  { icone: Icone, rotulo, ponto, tamanho, className, style, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={rotulo}
      title={rotulo}
      className={cn("pq-ibtn", className)}
      style={tamanho ? { width: tamanho, height: tamanho, ...style } : style}
      {...props}
    >
      <Icone aria-hidden />
      {ponto && (
        <i
          data-ponto
          className="absolute right-[10px] top-[9px] h-[7px] w-[7px] rounded-full bg-rosa"
          style={{ boxShadow: "0 0 0 2px var(--p-ponto-borda)" }}
        />
      )}
    </button>
  );
});
