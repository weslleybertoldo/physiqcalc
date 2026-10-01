// Physiq W21 — peças pequenas das 2 abas da Pré-consulta (os mesmos botões da W19: ícone 32 × 32 com dica e o "mini" com texto).
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { textoNivel, type Nivel } from "@/nutricao/prontuario/lib/questionariosUtil";
import { Chip, type TomChip } from "@/ui/premium/Chip";

export const BTN_MINI =
  "inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[12px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-[14px] [&_svg]:w-[14px]";
const ICONE = "inline-flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";

/** Botão só de ícone (com a dica e o nome para leitor de tela); `marca` = o atributo data-* do E2E. */
export function Acao({ icone: Icone, rotulo, onClick, marca, perigo, desabilitado }: {
  icone: LucideIcon;
  rotulo: string;
  onClick: () => void;
  marca: string;
  perigo?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} title={rotulo} disabled={desabilitado} {...{ [marca]: "" }}
      className={cn(ICONE, perigo && "hover:border-[rgba(244,63,94,.35)] hover:text-rosa-3")}>
      <Icone aria-hidden className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

const TOM_NIVEL: Record<string, TomChip> = { baixo: "n", moderado: "a", alto: "r" };

/** O nível da faixa de pontuação no chip premium (baixo verde · moderado âmbar · alto rosa); o rótulo é o da faixa. */
export function SeloNivel({ nivel, rotulo, className, ...data }: { nivel: Nivel | ""; rotulo?: string; className?: string } & Record<`data-${string}`, string>) {
  return (
    <Chip tom={TOM_NIVEL[nivel] ?? "g"} className={cn("h-[20px] text-[10px]", className)} {...data}>
      {((rotulo ?? "").trim() || textoNivel(nivel)).toUpperCase()}
    </Chip>
  );
}
