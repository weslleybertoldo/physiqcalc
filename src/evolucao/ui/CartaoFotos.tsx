import { Camera } from "lucide-react";
import { Cartao } from "@/ui/premium/Cartao";
import { rotuloAutor, rotuloSessao } from "../formato";
import { fotoDoSlot, SLOTS } from "../serie";
import type { SessaoFotos } from "../tipos";
import { FotoProgresso } from "./FotoProgresso";

/**
 * Fotos de progresso (tela 4): as da data mais recente em Frente, Lado e Costas, desfocadas com cadeado até tocar, e o
 * Comparar (2 datas). Sem nenhuma foto, o card diz quem manda as fotos.
 */
export function CartaoFotos({ sessao, total, aoComparar }: { sessao: SessaoFotos | null; total: number; aoComparar: () => void }) {
  return (
    <Cartao className="px-3.5 pb-3.5 pt-[13px]" data-fotos-progresso={sessao?.chave ?? "vazio"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[14px] font-semibold tracking-[-0.01em] text-texto">Fotos de progresso</b>
          {sessao && (
            <span className="mt-0.5 block truncate text-[11.5px] text-texto-2" data-fotos-sessao>
              {rotuloSessao(sessao)} · {rotuloAutor(sessao.autor)}
            </span>
          )}
        </div>
        {total > 0 && (
          <button type="button" onClick={aoComparar} className="flex-none pt-px text-[12px] font-semibold text-violeta-3" data-comparar>
            Comparar
          </button>
        )}
      </div>
      {sessao ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2" data-fotos-grade>
          {SLOTS.map(({ slot, rotulo }) => {
            const f = fotoDoSlot(sessao, slot);
            return (
              <div key={slot} data-foto-slot={slot}>
                <FotoProgresso url={f?.url ?? null} rotulo={rotulo} vazia={!f} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-3" data-fotos-vazio>
          <Camera aria-hidden className="h-[18px] w-[18px] flex-none text-texto-3" strokeWidth={1.75} />
          <p className="text-[12.5px] leading-relaxed text-texto-2">Nenhuma foto de progresso ainda. Seu profissional adiciona as fotos (frente, lado e costas) nas avaliações.</p>
        </div>
      )}
    </Cartao>
  );
}
