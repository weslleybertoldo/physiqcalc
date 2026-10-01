import type { ReactNode } from "react";

// Physiq W16 — estilos dos formulários e botões das seções portadas do Nutri, no visual premium (spec 4.9): os nomes são os
// do site antigo (src/components/agenda/Campo.tsx de lá) para os modais portados mudarem só o import.
export const INPUT =
  "h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 font-body text-[14px] text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-verde-3 disabled:opacity-50";
export const SELECT =
  "h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 font-body text-[14px] text-texto outline-none transition-colors focus:border-verde-3 [&>option]:bg-tela";
export const TEXTAREA =
  "min-h-[72px] w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 py-2.5 font-body text-[13.5px] leading-relaxed text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-verde-3";
export const BTN_SEC = "pq-botao pq-botao-g pq-botao-sm";
export const BTN_PRI = "pq-botao pq-botao-w pq-botao-sm";
export const BTN_PERIGO = "pq-botao pq-botao-g pq-botao-sm !border-[rgba(244,63,94,.35)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]";
export const BTN_LINK = "inline-flex items-center gap-1 text-[12.5px] font-semibold text-verde-3 hover:text-verde-2 disabled:opacity-50";

/** Janela (modal) premium: fundo da tela, linha clara, raio grande. */
export const JANELA = "border-linha-2 bg-tela text-texto sm:rounded-[24px] shadow-[0_30px_80px_-20px_rgba(0,0,0,.85)]";
export const TITULO_JANELA = "font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto";
export const DESCRICAO_JANELA = "font-body text-[13px] leading-relaxed text-texto-2";

export const Campo = ({ rotulo, erro, dica, children }: { rotulo: string; erro?: string; dica?: string; children: ReactNode }) => (
  <div>
    <label className="mb-1.5 block font-body text-[12px] font-semibold text-texto-2">{rotulo}</label>
    {children}
    {erro && (
      <p className="mt-1 font-body text-[11.5px] text-rosa-3" role="alert">
        {erro}
      </p>
    )}
    {!erro && dica && <p className="mt-1 font-body text-[11.5px] text-texto-3">{dica}</p>}
  </div>
);
