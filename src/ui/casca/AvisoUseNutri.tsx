import { ExternalLink, Salad } from "lucide-react";
import { Cartao } from "@/ui/premium/Cartao";

export const SITE_NUTRI = "https://nutri.physiqcalc.com.br";

/**
 * Fallback das páginas do painel para quem só tem o módulo Nutrição (spec 11.1, regra 3): enquanto a
 * tela nova não chega, a função continua no site do PhysiqNutri.
 */
export function AvisoUseNutri({ pagina }: { pagina: string }) {
  return (
    <Cartao brilho data-aviso-use-nutri className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 px-6 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-verde-3">
        <Salad aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </span>
      <h2 className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{pagina} chega aqui em breve</h2>
      <p className="text-[13.5px] leading-relaxed text-texto-2">Use o site do PhysiqNutri por enquanto — tudo o que você já tem continua lá.</p>
      <a href={SITE_NUTRI} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-w mt-1">
        <ExternalLink aria-hidden />
        Abrir o PhysiqNutri
      </a>
    </Cartao>
  );
}
