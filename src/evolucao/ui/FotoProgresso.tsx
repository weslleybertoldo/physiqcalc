import { useEffect, useState } from "react";
import { ImageOff, Lock, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { FotoComCadeado } from "@/ui/premium/FotoComCadeado";
import { useOnline } from "@/ui/premium/useOnline";

type Carga = "carregando" | "ok" | "erro";

/** Confere se a imagem abre antes de mostrar (URL assinada vencida ou sem internet → o quadro de "indisponível"). */
function useCargaDaImagem(src: string | null): Carga {
  const [carga, setCarga] = useState<Carga>(src ? "carregando" : "erro");
  useEffect(() => {
    if (!src) {
      setCarga("erro");
      return;
    }
    let vivo = true;
    setCarga("carregando");
    const img = new Image();
    img.onload = () => vivo && setCarga("ok");
    img.onerror = () => vivo && setCarga("erro");
    img.src = src;
    return () => {
      vivo = false;
    };
  }, [src]);
  return carga;
}

/**
 * Foto de progresso (tela 4): desfocada com cadeado até tocar (FotoComCadeado do visual premium). Sem foto na posição,
 * sem URL ou sem internet, o quadro no mesmo formato diz o que houve — nunca uma imagem quebrada.
 */
export function FotoProgresso({ url, rotulo, altura = 118, vazia = false, className }: { url: string | null; rotulo: string; altura?: number; vazia?: boolean; className?: string }) {
  const online = useOnline();
  const carga = useCargaDaImagem(vazia ? null : url);
  if (!vazia && url && carga !== "erro") {
    return <FotoComCadeado src={url} rotulo={rotulo} altura={altura} className={cn(carga === "carregando" && "animate-pulse", className)} />;
  }
  const Icone = vazia ? Lock : online ? ImageOff : WifiOff;
  const detalhe = vazia ? "Sem foto" : online ? "Foto indisponível" : "Sem conexão";
  return (
    <div
      data-foto-cadeado={vazia ? "vazia" : "indisponivel"}
      className={cn("flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-linha-2 bg-superficie text-center", className)}
      style={{ height: altura }}
    >
      <Icone aria-hidden className="h-[18px] w-[18px] text-texto-3" strokeWidth={1.75} />
      <span className="text-[11.5px] font-semibold text-texto-2">{rotulo}</span>
      <span className="text-[10.5px] text-texto-3">{detalhe}</span>
    </div>
  );
}
