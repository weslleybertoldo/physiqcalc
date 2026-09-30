import { useEffect, useState } from "react";
import { Dumbbell } from "lucide-react";
import { resolverImagem } from "@/lib/imagemExercicio";
import { nomeDoBloco } from "@/lib/gruposMusculares";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import type { Exercicio } from "../tipos";

/** Ficha do exercício com o GIF (C69): o NOSSO GIF animado (local primeiro), grupo muscular, subgrupo e a dica. */
export function SheetFicha({ exercicio, aoFechar }: { exercicio: Exercicio | null; aoFechar: () => void }) {
  const src = resolverImagem(exercicio?.imagem_url);
  const [erro, setErro] = useState(false);
  const [carregou, setCarregou] = useState(false);
  useEffect(() => {
    setErro(false);
    setCarregou(false);
  }, [src]);

  return (
    <PainelDeslizante aberto={!!exercicio} aoMudar={(v) => !v && aoFechar()} titulo={exercicio?.nome ?? "Exercício"}>
      {exercicio && (
        <div className="flex flex-col gap-4 pt-1" data-ficha-exercicio={exercicio.id}>
          {src && !erro ? (
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl border border-linha bg-[#0f0f12]" data-ficha-gif>
              {!carregou && <div aria-hidden className="absolute inset-0 animate-pulse bg-superficie-2" />}
              <img src={src} alt={exercicio.nome} decoding="async" crossOrigin="anonymous" onLoad={() => setCarregou(true)} onError={() => setErro(true)}
                className={`h-full w-full object-contain transition-opacity duration-200 ${carregou ? "opacity-100" : "opacity-0"}`} />
            </div>
          ) : (
            <div className="flex aspect-[3/2] w-full items-center justify-center rounded-2xl border border-linha bg-superficie text-texto-3">
              <Dumbbell aria-hidden className="h-8 w-8" strokeWidth={1.5} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Chip tom="t">{nomeDoBloco(exercicio.grupo_muscular).toUpperCase()}</Chip>
            {exercicio.subgrupo && <Chip tom="g">{exercicio.subgrupo.toUpperCase()}</Chip>}
          </div>
          <dl className="flex flex-col gap-3 text-[13.5px]">
            <div>
              <dt className="pq-eyebrow mb-1">Grupo muscular</dt>
              <dd className="text-texto">{exercicio.grupo_muscular}</dd>
            </div>
            {exercicio.dica && (
              <div>
                <dt className="pq-eyebrow mb-1">Dica</dt>
                <dd className="whitespace-pre-line leading-relaxed text-texto" data-ficha-dica>{exercicio.dica}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </PainelDeslizante>
  );
}
