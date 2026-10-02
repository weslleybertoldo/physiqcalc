import { ShieldCheck } from "lucide-react";
import type { ContaSituacao } from "@/nucleo/situacao";
import { TopoPagina } from "@/ui/casca/topo";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";

/** Conta isenta sem cobrança (master; conta marcada pelo master — R18). */
export function PlanoIsento({ conta, master }: { conta: ContaSituacao; master: boolean }) {
  return (
    <div className="flex flex-col gap-4" data-plano-isento>
      <TopoPagina titulo="Plano" subtitulo={conta.nome} />
      <Cartao brilho className="flex items-start gap-4 p-5">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-2">
          <ShieldCheck aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-semibold text-texto">{master ? "Conta master" : "Conta isenta"}</span>
            <Chip tom="g">SEM COBRANÇA</Chip>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-texto-2">
            {conta.isenta_motivo ? `Motivo: ${conta.isenta_motivo}. ` : ""}Esta conta não paga plano.
          </p>
        </div>
      </Cartao>
    </div>
  );
}
