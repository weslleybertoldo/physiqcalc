import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";
import { CHIP_COBRANCA, linhaDaCobranca } from "../regras";
import type { CobrancaVista } from "../tipos";

/** O ✓ verde num círculo (`.ok-ic` da tela 7) — cobrança paga. */
export function MarcaPago() {
  return (
    <span aria-label="Pago" className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[var(--p-chip-n-fundo)] text-verde-2" data-marca-pago>
      <Check aria-hidden className="h-[15px] w-[15px]" strokeWidth={2.6} />
    </span>
  );
}

/**
 * Linha de cobrança (`.pg` da tela 7): "Julho · R$ 249,00" em cima, "Pix · pago em 18/06" embaixo; à direita o ✓ (paga) ou o
 * chip da situação (A VENCER, AGUARDANDO, RECUSADO…). `acoes` entra antes do chip (ver comprovante, estornar…).
 */
export function LinhaCobranca({
  cobranca,
  hoje,
  aoTocar,
  acoes,
  className,
}: {
  cobranca: CobrancaVista;
  hoje?: string;
  aoTocar?: () => void;
  acoes?: ReactNode;
  className?: string;
}) {
  const l = linhaDaCobranca(cobranca, hoje);
  const chip = CHIP_COBRANCA[l.situacao];
  const texto = (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-[13px] text-texto">
        {l.titulo} · <b className="font-semibold tabular-nums">{l.valor}</b>
      </span>
      <span className="block truncate text-[11.5px] text-texto-3" data-cobranca-detalhe>{l.detalhe}</span>
    </span>
  );
  return (
    <div className={cn("flex min-h-[48px] w-full items-center gap-[11px] border-t border-linha-3 py-1.5 first:border-t-0", className)}
      data-cobranca={cobranca.id} data-cobranca-situacao={l.situacao}>
      {aoTocar ? (
        <button type="button" onClick={aoTocar} className="flex min-w-0 flex-1 items-center text-left" data-cobranca-abrir>
          {texto}
        </button>
      ) : (
        texto
      )}
      {acoes}
      {l.situacao === "paga" ? <MarcaPago /> : <Chip tom={chip.tom} className="h-[22px] flex-none text-[10.5px]">{chip.texto}</Chip>}
    </div>
  );
}
