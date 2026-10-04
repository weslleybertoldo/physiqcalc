import { useEffect, useRef, useState } from "react";
import { Dumbbell, Play } from "lucide-react";
import { fotoDoExercicio } from "@/lib/exercicios3d";
import { cn } from "@/lib/utils";

/**
 * Miniatura do NOSSO GIF (tela 2): o 1º quadro parado (desenhado num canvas — 8 GIFs animando juntos pesam no celular) com o
 * botão de play; tocar abre a ficha com o GIF animado. Exercício com 3D mostra a foto parada do boneco (`exercicioId`). Sem
 * imagem, o ícone (nada de emoji — decisão 7).
 */
export function MiniaturaGif({ url, exercicioId, nome, className, semPlay }: {
  url: string | null | undefined;
  exercicioId?: string | null;
  nome: string;
  className?: string;
  semPlay?: boolean;
}) {
  const src = fotoDoExercicio(exercicioId, url);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [estado, setEstado] = useState<"carregando" | "quadro" | "imagem" | "sem">(src ? "carregando" : "sem");

  useEffect(() => {
    if (!src) {
      setEstado("sem");
      return;
    }
    setEstado("carregando");
    let vivo = true;
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous"; // mesmo modo da ficha → mesma entrada de cache
    img.onload = () => {
      if (!vivo) return;
      const c = canvasRef.current;
      try {
        if (!c) throw new Error("sem canvas");
        const w = img.naturalWidth || 600;
        const h = img.naturalHeight || 400;
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("sem contexto");
        ctx.drawImage(img, 0, 0, w, h);
        setEstado("quadro");
      } catch {
        setEstado("imagem"); // sem canvas (ou CORS): a imagem animada mesmo
      }
    };
    img.onerror = () => vivo && setEstado("sem");
    img.src = src;
    return () => {
      vivo = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return (
    <span
      data-miniatura={estado}
      className={cn("relative flex h-[58px] w-[64px] flex-none items-center justify-center overflow-hidden rounded-[14px] border border-linha bg-superficie", className)}
    >
      <canvas ref={canvasRef} aria-hidden className={cn("h-full w-full object-cover", estado === "quadro" ? "block" : "hidden")} />
      {estado === "imagem" && src && <img src={src} alt="" aria-hidden className="h-full w-full object-cover" crossOrigin="anonymous" />}
      {estado === "carregando" && <span aria-hidden className="absolute inset-0 animate-pulse bg-superficie-2" />}
      {estado === "sem" && <Dumbbell aria-label={nome} className="h-5 w-5 text-texto-3" strokeWidth={1.75} />}
      {!semPlay && estado !== "sem" && (
        <span aria-hidden className="absolute bottom-[5px] right-[5px] flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(250,250,250,.95)]">
          <Play className="ml-px h-2.5 w-2.5 fill-[#09090B] text-[#09090B]" strokeWidth={2} />
        </span>
      )}
    </span>
  );
}
